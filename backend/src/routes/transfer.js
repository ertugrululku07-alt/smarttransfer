// src/routes/transfer.js
// Transfer module routes with Prisma Persistence

const express = require('express');

const { authMiddleware, optionalAuthMiddleware } = require('../middleware/auth');
const turf = require('@turf/turf');
const flexpolyline = require('@here/flexpolyline');

const router = express.Router();
const prisma = require('../lib/prisma');

/**
 * Detect region code from a location text using tenant hubs
 * @param {string} locationText - The location string (e.g. "Alanya/Antalya, Türkiye")
 * @param {Array} hubs - Array of hub objects [{code, keywords, name}, ...]
 * @returns {string|null} - The matched hub code (e.g. "ALY") or null
 */
function detectRegionCode(locationText, hubs) {
    if (!locationText || !hubs || !Array.isArray(hubs)) return null;
    // Use Turkish locale for correct İ→i, Ş→ş etc.
    const trLower = (s) => (s || '').toLocaleLowerCase('tr');
    const text = trLower(locationText);
    const SKIP_WORDS = new Set(['havalimanı', 'havalimani', 'airport', 'havaalanı', 'merkez', 'center', 'terminal']);
    
    let bestCode = null;
    let bestPosition = Infinity;
    let bestLength = 0;

    for (const hub of hubs) {
        const keys = hub.keywords ? hub.keywords.split(',').map(k => trLower(k).trim()).filter(k => k) : [];
        keys.push(trLower(hub.code));
        // Also add hub name parts (min 3 chars, skip common words)
        if (hub.name) {
            const nameParts = trLower(hub.name).split(/[\s\/,]+/).filter(p => p.length >= 3 && !SKIP_WORDS.has(p));
            keys.push(...nameParts);
        }
        
        for (const k of keys) {
            const pos = text.indexOf(k);
            if (pos !== -1) {
                // Prefer earliest position in text, then longest keyword as tiebreaker
                if (pos < bestPosition || (pos === bestPosition && k.length > bestLength)) {
                    bestCode = hub.code;
                    bestPosition = pos;
                    bestLength = k.length;
                }
            }
        }
    }
    return bestCode;
}

/**
 * Determine trip type based on pickup and dropoff locations
 * @param {string} pickup - Pickup location
 * @param {string} dropoff - Dropoff location
 * @returns {string} - 'DEP' | 'ARV' | 'ARA'
 */
function getTripType(pickup, dropoff) {
    const pickupStr = String(pickup || '').toLowerCase();
    const dropoffStr = String(dropoff || '').toLowerCase();
    
    const airportKeywords = ['havalimanı', 'havalimani', 'airport', 'havaalanı', 'havaalani', 'ayt', 'ist', 'sa', 'esenboğa'];
    
    const isPickupAirport = airportKeywords.some(kw => pickupStr.includes(kw));
    const isDropoffAirport = airportKeywords.some(kw => dropoffStr.includes(kw));
    
    if (isPickupAirport && !isDropoffAirport) {
        return 'ARV'; // Arrival: Airport to Hotel
    } else if (!isPickupAirport && isDropoffAirport) {
        return 'DEP'; // Departure: Hotel to Airport
    } else {
        return 'ARA'; // Ara Transfer: Between hotels or other
    }
}

/**
 * Load tenant hubs from settings
 * @param {string} tenantId
 * @returns {Array} hubs
 */
async function loadTenantHubs(tenantId) {
    const defaultHubs = [
        { code: 'AYT', keywords: 'ayt, antalya havalimanı, antalya airport', name: 'Antalya Havalimanı' },
        { code: 'GZP', keywords: 'gzp, gazipasa, gazipaşa', name: 'Gazipaşa Havalimanı' },
    ];
    let finalHubs = [...defaultHubs];

    if (!tenantId) return finalHubs;
    try {
        const zonesWithCode = await prisma.zone.findMany({
            where: { tenantId, code: { not: null } },
            select: { code: true, keywords: true, name: true }
        });
        
        if (zonesWithCode.length > 0) {
            zonesWithCode.forEach(z => {
                const idx = finalHubs.findIndex(h => h.code === z.code);
                if (idx === -1) finalHubs.push({ code: z.code, keywords: z.keywords || '', name: z.name });
                else finalHubs[idx].keywords += `, ${z.keywords || ''}`;
            });
        }
        
        const tenantInfo = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } });
        if (tenantInfo?.settings?.hubs && Array.isArray(tenantInfo.settings.hubs)) {
            tenantInfo.settings.hubs.forEach(h => {
                if (!finalHubs.some(fh => fh.code === h.code)) finalHubs.push(h);
            });
        }
    } catch (e) {
        console.error("Failed to fetch tenant hubs", e);
    }
    return finalHubs;
}

/**
 * POST /api/transfer/search
 * Search available transfers (Mock algorithm, real future impl would use Google Distance Matrix)
 */
router.post('/search', optionalAuthMiddleware, async (req, res) => {
    try {
        const {
            pickup,
            dropoff,
            pickupDateTime,
            returnDateTime,
            passengers = 1,
            transferType = 'ONE_WAY',
            distance, // Received from frontend (in km)
            encodedPolyline,
            pickupLat,
            pickupLng,
            dropoffLat,
            dropoffLng,
            shuttleMasterTime
        } = req.body;

        // Fetch agency markup and contract prices if user is an agency agent
        let agencyMarkup = 0;
        let agencyId = null;
        let agencyContractMap = {}; // vehicleTypeId:zoneId -> contract
        let agencyContractMeta = {}; // vehicleTypeId -> meta (fallback pricing)
        if (req.user && req.user.id) {
            const dbUser = await prisma.user.findUnique({
                where: { id: req.user.id },
                select: {
                    agencyId: true,
                    agencyCommissionRate: true,
                    role: { select: { type: true } },
                    agency: { select: { markup: true } }
                }
            });

            if (dbUser) {
                agencyId = dbUser.agencyId;
                // If the user is AGENCY_STAFF and has a specific commission rate set, use that.
                if (dbUser.role?.type === 'AGENCY_STAFF' && dbUser.agencyCommissionRate !== null) {
                    agencyMarkup = parseFloat(dbUser.agencyCommissionRate) || 0;
                }
                // Otherwise, fallback to the agency's default markup.
                else if (dbUser.agency?.markup) {
                    agencyMarkup = parseFloat(dbUser.agency.markup) || 0;
                }

                // Fetch contract zone prices and meta (indexed by vehicleTypeId:zoneId and vehicleTypeId)
                if (agencyId) {
                    const contracts = await prisma.agencyContractPrice.findMany({
                        where: { agencyId, isActive: true }
                    });
                    contracts.forEach(c => {
                        const key = `${c.vehicleTypeId}:${c.zoneId}:${c.baseLocation}`;
                        agencyContractMap[key] = c;
                    });

                    const metas = await prisma.agencyContractMeta.findMany({
                        where: { agencyId }
                    });
                    metas.forEach(m => {
                        agencyContractMeta[m.vehicleTypeId] = m;
                    });
                }
            }
        }

        console.log('Transfer Search Request:', { 
            pickup, 
            dropoff, 
            distance, 
            transferType, 
            agencyMarkup, 
            user: req.user?.email || 'Guest',
            tenant: req.tenant?.id 
        });

        // Validation
        if (!pickup || !dropoff || !pickupDateTime) {
            return res.status(400).json({
                success: false,
                error: 'pickup, dropoff ve pickupDateTime zorunludur'
            });
        }

        // Fetch real vehicles from DB
        // 1. Fetch Vehicle Types (instead of specific vehicles)
        // Only show types that have at least one active vehicle
        const vehicleTypes = await prisma.vehicleType.findMany({
            where: {
                capacity: {
                    gte: Number(passengers)
                },
            },
            include: {
                vehicles: {
                    where: { status: 'ACTIVE' }
                },
                zonePrices: true,
                _count: {
                    select: { vehicles: true }
                }
            }
        });

        // ==========================================
        // TURF.JS ZONE & OVERAGE CALCULATION
        // ==========================================
        let matchedZoneId = null;
        let overageDistanceKm = 0;
        let hasAnyZones = false;
        let zones = [];
        
        let activeTenantId = req.tenant?.id;
        if (!activeTenantId) {
            const defaultTenant = await prisma.tenant.findFirst();
            if (defaultTenant) activeTenantId = defaultTenant.id;
        }

        if (activeTenantId) {
            zones = await prisma.zone.findMany({ where: { tenantId: activeTenantId } });
            hasAnyZones = zones.length > 0;
        }

        if (encodedPolyline && activeTenantId && zones.length > 0) {
            try {
                const decoded = flexpolyline.decode(encodedPolyline);
                const routeCoords = decoded.polyline.map(p => [p[1], p[0]]);
                
                // Gather ALL zones that the route intersects and map their overages
                let zoneOverages = {};

                if (zones.length > 0 && routeCoords.length >= 2) {
                    for (const zone of zones) {
                        if (!zone.polygon || zone.polygon.length < 3) continue;
                        
                        let polyCoords = zone.polygon.map(p => [p.lng, p.lat]);
                        if (polyCoords[0][0] !== polyCoords[polyCoords.length - 1][0] || 
                            polyCoords[0][1] !== polyCoords[polyCoords.length - 1][1]) {
                            polyCoords.push(polyCoords[0]);
                        }
                        
                        const zonePolygon = turf.polygon([polyCoords]);
                        
                        let distFromStart = 0;
                        let hitStart = false;
                        for (let i = 0; i < routeCoords.length - 1; i++) {
                            if (turf.booleanPointInPolygon(turf.point(routeCoords[i]), zonePolygon)) {
                                hitStart = true;
                                break;
                            }
                            distFromStart += turf.distance(turf.point(routeCoords[i]), turf.point(routeCoords[i+1]), { units: 'kilometers' });
                        }
                        if (!hitStart) distFromStart = Infinity;

                        let distFromEnd = 0;
                        let hitEnd = false;
                        for (let i = routeCoords.length - 1; i > 0; i--) {
                            if (turf.booleanPointInPolygon(turf.point(routeCoords[i]), zonePolygon)) {
                                hitEnd = true;
                                break;
                            }
                            distFromEnd += turf.distance(turf.point(routeCoords[i]), turf.point(routeCoords[i-1]), { units: 'kilometers' });
                        }
                        if (!hitEnd) distFromEnd = Infinity;

                        // Store both distances. The real overage (non-hub side) will be
                        // determined later in the zone selection phase after hub detection.
                        // For now, set a preliminary overage = distFromEnd (most common: pickup is hub).
                        let overage = distFromEnd !== Infinity ? distFromEnd : (distFromStart !== Infinity ? distFromStart : 0);
                        const area = turf.area(zonePolygon);
                        
                        if (distFromStart !== Infinity || distFromEnd !== Infinity) {
                            zoneOverages[zone.id] = { 
                                overage, area, zoneName: zone.name || '', zoneCode: zone.code || '',
                                distFromStart: distFromStart !== Infinity ? distFromStart : null,
                                distFromEnd: distFromEnd !== Infinity ? distFromEnd : null,
                                hitStart, hitEnd
                            };
                        }
                    }

                    // Also check pickup point directly against zones
                    // Track which zones contain the actual pickup point for priority matching
                    const pickupZoneIds = new Set();
                    if (pickupLat && pickupLng) {
                        const pickupPoint = turf.point([Number(pickupLng), Number(pickupLat)]);
                        for (const zone of zones) {
                            if (!zone.polygon || zone.polygon.length < 3) continue;
                            let polyCoords = zone.polygon.map(p => [p.lng, p.lat]);
                            if (polyCoords[0][0] !== polyCoords[polyCoords.length - 1][0] || 
                                polyCoords[0][1] !== polyCoords[polyCoords.length - 1][1]) {
                                polyCoords.push(polyCoords[0]);
                            }
                            try {
                                const zonePolygon = turf.polygon([polyCoords]);
                                if (turf.booleanPointInPolygon(pickupPoint, zonePolygon)) {
                                    const area = turf.area(zonePolygon);
                                    if (!zoneOverages[zone.id]) {
                                        zoneOverages[zone.id] = { overage: 0, area, zoneName: zone.name || '', zoneCode: zone.code || '' };
                                    }
                                    pickupZoneIds.add(zone.id);
                                    console.log(`[ZonePickup] Pickup point inside zone ${zone.name} (${zone.id}), area=${area.toFixed(0)}`);
                                }
                            } catch (e) { /* skip invalid polygon */ }
                        }
                    }
                    // Store for use in zone price selection
                    req.pickupZoneIds = pickupZoneIds;

                    // Also check dropoff point proximity to zones
                    // If dropoff is NEAR a zone (but outside), add it with distance-to-polygon as overage.
                    // This covers cases like AYT→Mahmutlar where route may not cross the polygon
                    // but Mahmutlar is close to the Obagöl zone.
                    if (dropoffLat && dropoffLng) {
                        const dropoffPoint = turf.point([Number(dropoffLng), Number(dropoffLat)]);
                        for (const zone of zones) {
                            if (!zone.polygon || zone.polygon.length < 3) continue;
                            if (zoneOverages[zone.id] && zoneOverages[zone.id].overage === 0) continue; // Already inside
                            let polyCoords = zone.polygon.map(p => [p.lng, p.lat]);
                            if (polyCoords[0][0] !== polyCoords[polyCoords.length - 1][0] || 
                                polyCoords[0][1] !== polyCoords[polyCoords.length - 1][1]) {
                                polyCoords.push(polyCoords[0]);
                            }
                            try {
                                const zonePolygon = turf.polygon([polyCoords]);
                                const area = turf.area(zonePolygon);
                                if (turf.booleanPointInPolygon(dropoffPoint, zonePolygon)) {
                                    // Dropoff is inside this zone
                                    if (!zoneOverages[zone.id]) {
                                        zoneOverages[zone.id] = { 
                                            overage: 0, area, zoneName: zone.name || '', zoneCode: zone.code || '',
                                            distFromStart: null, distFromEnd: 0, hitStart: false, hitEnd: true
                                        };
                                    }
                                    console.log(`[ZoneDropoff] Dropoff point inside zone ${zone.name}`);
                                } else {
                                    // Check proximity: distance from dropoff to nearest polygon edge
                                    const polygonBoundary = turf.polygonToLine(zonePolygon);
                                    const distToPolygon = turf.pointToLineDistance(dropoffPoint, polygonBoundary, { units: 'kilometers' });
                                    // Only consider zones within 50km proximity
                                    if (distToPolygon <= 50) {
                                        const existingOverage = zoneOverages[zone.id]?.overage ?? Infinity;
                                        if (!zoneOverages[zone.id] || distToPolygon < existingOverage) {
                                            zoneOverages[zone.id] = { 
                                                overage: distToPolygon, area, zoneName: zone.name || '', zoneCode: zone.code || '',
                                                distFromStart: null, distFromEnd: distToPolygon, hitStart: false, hitEnd: false
                                            };
                                            console.log(`[ZoneProximity] Dropoff ${distToPolygon.toFixed(1)}km from zone ${zone.name}`);
                                        }
                                    }
                                }
                            } catch (e) { /* skip invalid polygon */ }
                        }
                    }

                    // Same proximity check for pickup point (for reverse trips)
                    if (pickupLat && pickupLng) {
                        const pickupPoint2 = turf.point([Number(pickupLng), Number(pickupLat)]);
                        for (const zone of zones) {
                            if (!zone.polygon || zone.polygon.length < 3) continue;
                            if (zoneOverages[zone.id] && zoneOverages[zone.id].overage === 0) continue;
                            if (pickupZoneIds.has(zone.id)) continue; // Already matched as pickup zone
                            let polyCoords = zone.polygon.map(p => [p.lng, p.lat]);
                            if (polyCoords[0][0] !== polyCoords[polyCoords.length - 1][0] || 
                                polyCoords[0][1] !== polyCoords[polyCoords.length - 1][1]) {
                                polyCoords.push(polyCoords[0]);
                            }
                            try {
                                const zonePolygon = turf.polygon([polyCoords]);
                                if (!turf.booleanPointInPolygon(pickupPoint2, zonePolygon)) {
                                    const polygonBoundary = turf.polygonToLine(zonePolygon);
                                    const distToPolygon = turf.pointToLineDistance(pickupPoint2, polygonBoundary, { units: 'kilometers' });
                                    if (distToPolygon <= 50 && !zoneOverages[zone.id]) {
                                        const area = turf.area(zonePolygon);
                                        zoneOverages[zone.id] = { 
                                            overage: distToPolygon, area, zoneName: zone.name || '', zoneCode: zone.code || '',
                                            distFromStart: distToPolygon, distFromEnd: null, hitStart: false, hitEnd: false
                                        };
                                        console.log(`[ZoneProximity] Pickup ${distToPolygon.toFixed(1)}km from zone ${zone.name}`);
                                    }
                                }
                            } catch (e) { /* skip invalid polygon */ }
                        }
                    }

                    if (Object.keys(zoneOverages).length > 0) {
                        req.zoneOverages = zoneOverages;
                        console.log(`Matched Zones & Overages:`, zoneOverages);
                    }
                }
            } catch (err) {
                console.error("Turf zone calculation error:", err);
            }
        }
        // ==========================================

        // 2. Search for Shuttle Routes (Improved Matching)
        const shuttleRoutes = await prisma.shuttleRoute.findMany({
            where: {
                isActive: true,
                maxSeats: {
                    gte: Number(passengers)
                }
            },
            include: {
                vehicle: true
            }
        });

        // Normalization helper
        const normalizeLocation = (loc) => {
            if (!loc) return '';
            return loc.toLowerCase()
                .replace(' airport', '')
                .replace(' havalimanı', '')
                .replace(' havalimani', '')
                .replace(' otogar', '')
                .replace(' terminal', '')
                .trim();
        };

        const pickupNorm = normalizeLocation(pickup);
        const dropoffNorm = normalizeLocation(dropoff);
        
        let hubs = [];

        let timeDefinitions = { privateTransferMinHours: 0, shuttleTransferMinHours: 0 };
        let tenantDefaultCurrency = 'EUR'; // Fallback
        if (req.tenant?.id) {
            try {
                const defaultHubs = [
                    { code: 'AYT', keywords: 'ayt, antalya havalimanı, antalya airport', name: 'Antalya Havalimanı' },
                    { code: 'GZP', keywords: 'gzp, gazipasa, gazipaşa', name: 'Gazipaşa Havalimanı' },
                ];
                hubs = [...defaultHubs];

                const zonesWithCode = await prisma.zone.findMany({
                    where: { tenantId: req.tenant.id, code: { not: null } },
                    select: { code: true, keywords: true, name: true }
                });
                if (zonesWithCode.length > 0) {
                    zonesWithCode.forEach(z => {
                        const idx = hubs.findIndex(h => h.code === z.code);
                        if (idx === -1) hubs.push({ code: z.code, keywords: z.keywords || '', name: z.name });
                        else hubs[idx].keywords += `, ${z.keywords || ''}`;
                    });
                }

                const tenantInfo = await prisma.tenant.findUnique({ where: { id: req.tenant.id }, select: { settings: true } });
                if (hubs.length <= 2 && tenantInfo?.settings?.hubs && Array.isArray(tenantInfo.settings.hubs)) { 
                    tenantInfo.settings.hubs.forEach(h => {
                        if (!hubs.some(fh => fh.code === h.code)) hubs.push(h);
                    });
                }
                if (tenantInfo?.settings?.timeDefinitions) {
                    timeDefinitions = tenantInfo.settings.timeDefinitions;
                }
                if (tenantInfo?.settings?.definitions?.currencies) {
                    const defaultCur = tenantInfo.settings.definitions.currencies.find(c => c.isDefault);
                    if (defaultCur) tenantDefaultCurrency = defaultCur.code;
                }
            } catch (e) {
                console.error("Failed to fetch tenant settings", e);
            }
        }

        let detectedBaseLocation = null;
        let originalPickupHubCode = null;
        const pickupPrimaryToken = pickup.toLowerCase().split(/[\/,]/)[0].trim();
        const pickupTextRaw = pickup.toLowerCase();
        let bestPickupScore = 0;
        let bestPickupLength = 0;

        for (const hub of hubs) {
            const keys = hub.keywords ? hub.keywords.split(',').map(k => k.trim().toLowerCase()).filter(k => k) : [];
            keys.push(hub.code.toLowerCase());
            for (const k of keys) {
                const isGZP = k.includes('gazipaşa') || k.includes('gazipasa') || k.includes('gzp');
                const isAYT = k.includes('antalya havalimanı') || k.includes('antalya airport') || k.includes('havalimanı') || k.includes('havalimani') || k.includes('airport') || k === 'ayt';
                const textToSearch = (isGZP || isAYT) ? pickupTextRaw : pickupPrimaryToken;
                if (textToSearch.includes(k)) {
                    let score = 1;
                    if (isGZP) score = 4;
                    else if (isAYT) score = 3;
                    if (k === pickupPrimaryToken) score += 1;
                    if (score > bestPickupScore || (score === bestPickupScore && k.length > bestPickupLength)) {
                        detectedBaseLocation = hub.code;
                        originalPickupHubCode = hub.code;
                        bestPickupScore = score;
                        bestPickupLength = k.length;
                    }
                }
            }
        }
        
        let detectedDropoffBase = null;
        let originalDropoffHubCode = null;
        const dropoffPrimaryToken = dropoff.toLowerCase().split(/[\/,]/)[0].trim();
        const dropoffTextRaw = dropoff.toLowerCase();
        let bestDropoffScore = 0;
        let bestDropoffMatchLength = 0;

        for (const hub of hubs) {
            const keys = hub.keywords ? hub.keywords.split(',').map(k => k.trim().toLowerCase()).filter(k => k) : [];
            keys.push(hub.code.toLowerCase());
            for (const k of keys) {
                const isGZP = k.includes('gazipaşa') || k.includes('gazipasa') || k.includes('gzp');
                const isAYT = k.includes('antalya havalimanı') || k.includes('antalya airport') || k.includes('havalimanı') || k.includes('havalimani') || k.includes('airport') || k === 'ayt';
                const textToSearch = (isGZP || isAYT) ? dropoffTextRaw : dropoffPrimaryToken;
                if (textToSearch.includes(k)) {
                    let score = 1;
                    if (isGZP) score = 4;
                    else if (isAYT) score = 3;
                    if (k === dropoffPrimaryToken) score += 1;
                    if (score > bestDropoffScore || (score === bestDropoffScore && k.length > bestDropoffMatchLength)) {
                        detectedDropoffBase = hub.code;
                        originalDropoffHubCode = hub.code;
                        bestDropoffScore = score;
                        bestDropoffMatchLength = k.length;
                    }
                }
            }
        }

        // If pickup is NOT a hub but dropoff IS (city→airport), use dropoff as base
        if (!detectedBaseLocation && detectedDropoffBase) {
            detectedBaseLocation = detectedDropoffBase;
        }

        console.log(`[HubDetect] pickupHub="${originalPickupHubCode}" dropoffHub="${originalDropoffHubCode}" baseLocation="${detectedBaseLocation}" hasAnyZones=${hasAnyZones}`);

        const dateObj = new Date(pickupDateTime);
        // Use Turkey timezone (UTC+3) for day-of-week calculation
        const trDateObj = new Date(dateObj.getTime() + (3 * 60 * 60 * 1000));
        const dayOfWeekVal = trDateObj.getUTCDay(); // 0=Sun, 1=Mon...
        const daysMap = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
        const currentDayCode = daysMap[dayOfWeekVal];
        const dateStr = dateObj.toISOString().split('T')[0];

        // Haversine Distance Helper (in meters)
        const getDistanceFromLatLonInMeters = (lat1, lon1, lat2, lon2) => {
            const R = 6371000; // Radius of the earth in m
            const dLat = deg2rad(lat2 - lat1);
            const dLon = deg2rad(lon2 - lon1);
            const a =
                Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
                Math.sin(dLon / 2) * Math.sin(dLon / 2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            const d = R * c; // Distance in m
            return d;
        };

        const deg2rad = (deg) => {
            return deg * (Math.PI / 180);
        };

        const matchingShuttles = shuttleRoutes.filter(route => {
            // 1. PICKUP Location Check (from → user's pickup)
            let isPickupMatch = false;

            // Check coordinates first (most reliable)
            if (req.body.pickupLat && req.body.pickupLng) {
                const userLat = Number(req.body.pickupLat);
                const userLng = Number(req.body.pickupLng);

                // 1a. Polygon Check (Priority — from zone-based routes)
                if (route.pickupPolygon) {
                    const polygon = typeof route.pickupPolygon === 'string'
                        ? JSON.parse(route.pickupPolygon)
                        : route.pickupPolygon;

                    if (Array.isArray(polygon) && polygon.length > 2) {
                        try {
                            const pt = turf.point([userLng, userLat]);
                            
                            // Close the polygon if not already closed
                            let polyCoords = polygon.map(p => [p.lng, p.lat]);
                            if (polyCoords[0][0] !== polyCoords[polyCoords.length - 1][0] || polyCoords[0][1] !== polyCoords[polyCoords.length - 1][1]) {
                                polyCoords.push([...polyCoords[0]]);
                            }
                            
                            const poly = turf.polygon([polyCoords]);
                            let inside = turf.booleanPointInPolygon(pt, poly);
                            
                            if (inside) {
                                isPickupMatch = true;
                                route._overageKm = 0;
                            } else {
                                // Calculate distance to boundary
                                const polygonBoundary = turf.polygonToLine(poly);
                                const distToBoundary = turf.pointToLineDistance(pt, polygonBoundary, { units: 'kilometers' });
                                
                                // Hardcoded 50km overage limit for shuttles
                                if (distToBoundary <= 50) {
                                    isPickupMatch = true;
                                    route._overageKm = distToBoundary;
                                }
                            }
                        } catch (err) {
                            console.error('Turf boundary calculation error for shuttle route:', err.message);
                        }
                    }
                }

                // 1b. Radius Check (Fallback if not matched yet and radius exists)
                if (!isPickupMatch && route.pickupRadius && route.pickupLocation && !route.pickupPolygon) {
                    const routeLoc = typeof route.pickupLocation === 'string'
                        ? JSON.parse(route.pickupLocation)
                        : route.pickupLocation;
                    const dist = getDistanceFromLatLonInMeters(
                        routeLoc.lat,
                        routeLoc.lng,
                        userLat,
                        userLng
                    );
                    if (dist <= route.pickupRadius) {
                        isPickupMatch = true;
                    }
                }
            }

            // 1c. Text matching fallback (only if no polygon provided)
            if (!isPickupMatch && !route.pickupPolygon) {
                const routeFrom = normalizeLocation(route.fromName);
                // Use primary location token (before / or ,) to avoid false matches
                // e.g., "Kemer/Antalya" should NOT match shuttle route from "Antalya Havalimanı"
                const pickupPrimary = pickupNorm.split(/[\/,]/)[0].trim();
                const routeFromPrimary = routeFrom.split(/[\/,]/)[0].trim();
                isPickupMatch = (routeFromPrimary.includes(pickupPrimary) || pickupPrimary.includes(routeFromPrimary));
            }

            // 1d. Hub-based pickup matching: if user pickup resolves to a known hub,
            //     match routes whose fromName contains that hub's keywords
            if (!isPickupMatch && originalPickupHubCode && !route.pickupPolygon) {
                const pickupHub = hubs.find(h => h.code === originalPickupHubCode);
                if (pickupHub) {
                    const routeFromLower = route.fromName.toLowerCase();
                    const hubKeys = pickupHub.keywords ? pickupHub.keywords.split(',').map(k => k.trim().toLowerCase()).filter(k => k) : [];
                    hubKeys.push(pickupHub.code.toLowerCase());
                    if (pickupHub.name) hubKeys.push(pickupHub.name.toLowerCase());
                    isPickupMatch = hubKeys.some(k => k && routeFromLower.includes(k));
                }
            }

            if (!isPickupMatch) return false;

            // 2. DROPOFF Location Check (to → user's dropoff)
            let isDropoffMatch = false;

            const routeMeta = route.metadata || {};
            const routeToHubCode = routeMeta.toHubCode;
            if (routeToHubCode) {
                if (originalDropoffHubCode && originalDropoffHubCode === routeToHubCode) {
                    isDropoffMatch = true;
                } else {
                    return false;
                }
            } else {
                const routeTo = normalizeLocation(route.toName);
                const routeToPrimary = routeTo.split(/[\/,]/)[0].trim();
                isDropoffMatch = (routeToPrimary === dropoffPrimaryToken || routeToPrimary.includes(dropoffPrimaryToken) || dropoffPrimaryToken.includes(routeToPrimary));
                if (!isDropoffMatch && originalDropoffHubCode) {
                    const dropoffHub = hubs.find(h => h.code === originalDropoffHubCode);
                    if (dropoffHub) {
                        const routeToLower = route.toName.toLowerCase();
                        const hubKeys = dropoffHub.keywords ? dropoffHub.keywords.split(',').map(k => k.trim().toLowerCase()).filter(k => k) : [];
                        hubKeys.push(dropoffHub.code.toLowerCase());
                        if (dropoffHub.name) hubKeys.push(dropoffHub.name.toLowerCase());
                        isDropoffMatch = hubKeys.some(k => k && routeToLower.includes(k));
                    }
                }
            }

            if (!isDropoffMatch) return false;

            // Schedule Check
            let passesSchedule = false;
            if (route.scheduleType === 'DAILY') passesSchedule = true;
            else if (route.scheduleType === 'WEEKLY') {
                const allowedDays = Array.isArray(route.weeklyDays) ? route.weeklyDays : [];
                passesSchedule = allowedDays.includes(currentDayCode);
            }
            else if (route.scheduleType === 'CUSTOM') {
                if (route.customStartDate && route.customEndDate) {
                    passesSchedule = dateStr >= route.customStartDate && dateStr <= route.customEndDate;
                }
            }

            if (!passesSchedule) return false;

            // TIME WINDOW CHECK (±2 hours)
            const searchDate = new Date(pickupDateTime);
            // Use Turkey timezone (UTC+3) for time comparison
            const trSearchDate = new Date(searchDate.getTime() + (3 * 60 * 60 * 1000));
            const userMin = trSearchDate.getUTCHours() * 60 + trSearchDate.getUTCMinutes();
            let closestMasterTime = null;
            let minOffset = Infinity;
            
            if (route.departureTimes && Array.isArray(route.departureTimes) && route.departureTimes.length > 0) {
                route.departureTimes.forEach(dt => {
                    if (!dt) return;

                    // PRIORITY: If shuttleMasterTime is provided (from booking page re-search), match it exactly
                    if (shuttleMasterTime && dt === shuttleMasterTime) {
                        minOffset = 0;
                        closestMasterTime = dt;
                        return; // Found exact match for this iteration
                    }

                    const parts = dt.split(':');
                    const dtMin = parseInt(parts[0]) * 60 + parseInt(parts[1]);
                    
                    let diff = userMin - dtMin; 
                    // Let's assume shuttle can pick up user within 3 hours before or after search time
                    if (diff >= -180 && diff <= 180) {
                        if (Math.abs(diff) < Math.abs(minOffset)) {
                            minOffset = diff;
                            closestMasterTime = dt;
                        }
                    }
                });
                if (!closestMasterTime) return false;
            } else {
                // If it has no departure times explicitly defined, it passes implicitly.
            }

            route._matchedMasterTime = closestMasterTime;
            route._timeOffsetMin = minOffset;

            return true;
        });

        const shuttleResults = matchingShuttles.map(s => {
            const baseShuttlePrice = Number(s.pricePerSeat) * Number(passengers);
            
            // Apply overage price
            let totalShuttlePrice = baseShuttlePrice;
            let overageCharge = 0;
            if (s._overageKm > 0 && s.extraKmPrice) {
                overageCharge = s._overageKm * Number(s.extraKmPrice) * Number(passengers);
                totalShuttlePrice += overageCharge;
            }

            const markedUpShuttlePrice = totalShuttlePrice * (1 + (agencyMarkup / 100));
            console.log(`[Shuttle] route=${s.fromName}→${s.toName}, basePricePerSeat=${s.pricePerSeat}, overageKm=${s._overageKm?.toFixed(1)}, overageCharge=${overageCharge.toFixed(2)}, passengers=${passengers}, total=${markedUpShuttlePrice.toFixed(2)}`);

            const vehicleData = s.vehicleType || s.vehicle || {};
            const vehicleName = vehicleData.name || vehicleData.brand || 'Shuttle Bus';
            const vehicleImage = vehicleData.image || vehicleData.metadata?.imageUrl || '/vehicles/sprinter.png';
            const hasWifi = vehicleData.features?.includes('WiFi') || vehicleData.metadata?.hasWifi;

            return {
                id: `shuttle_${s.id}`,
                vehicleType: `${vehicleName} (Paylaşımlı)`, // More descriptive
                vehicleClass: 'SHUTTLE',
                vendor: 'SmartShuttle',
                capacity: s.maxSeats,
                luggage: 1, // Per person
                price: Number(markedUpShuttlePrice.toFixed(2)),
                basePrice: totalShuttlePrice, // Store original B2B cost including overage
                overageKm: s._overageKm > 0 ? Number(s._overageKm.toFixed(1)) : 0,
                overageCharge: overageCharge,
                currency: s.currency || tenantDefaultCurrency, // Use route's own currency
                features: ['Belirli Kalkış Saatleri', 'Ekonomik', 'Paylaşımlı Yolculuk', ...(hasWifi ? ['WiFi'] : [])],
                cancellationPolicy: '24 saat öncesine kadar ücretsiz iptal',
                estimatedDuration: 'Değişken', // Depends on stops
                image: vehicleImage,
                isShuttle: true,
                departureTimes: s.departureTimes, // Pass departure times to frontend
                matchedMasterTime: s._matchedMasterTime,
                timeOffsetMin: s._timeOffsetMin,
                pickupLeadHours: s.pickupLeadHours ? Number(s.pickupLeadHours) : null,
                metadata: typeof s.metadata === 'string' ? (()=>{try{return JSON.parse(s.metadata)}catch(e){return {}}})() : (s.metadata || {})
            };
        });

        // 3. Map Vehicle Types to Results (Sorted by Order)
        const typeResults = vehicleTypes
            .filter(vt => vt.vehicles && vt.vehicles.length > 0)
            .sort((a, b) => (a.order || 0) - (b.order || 0)) // Sort by order
            .map(vt => {
                let calculatedPrice;
                let calculationMethod = 'DISTANCE_BASE';

                // Try to find Zone Pricing from the VehicleType
                let zonePriceConfig = null;
                let finalMatchedZoneId = null;
                let usedOverageDistanceKm = 0;
                
                const pickupZoneIds = req.pickupZoneIds || new Set();
                if (req.zoneOverages && Object.keys(req.zoneOverages).length > 0) {
                    let lowestValidOverage = Infinity;
                    let smallestArea = Infinity;
                    let currentIsPickupZone = false;

                    for (const [zoneId, zoneData] of Object.entries(req.zoneOverages)) {
                        const zoneArea = zoneData.area;
                        const isPickupZone = pickupZoneIds.has(zoneId);

                        // CRITICAL FIX: To prevent an airport's own small polygon from overriding 
                        // the regional zone's pricing when traveling to/from the airport.
                        // We ONLY skip the zone if it is an actual Airport Hub (AYT, GZP).
                        // If it's a regional hub (like ALY - Alanya), we MUST NOT skip it!
                        if (zoneData.zoneCode && (zoneData.zoneCode === 'AYT' || zoneData.zoneCode === 'GZP')) {
                            if (zoneData.zoneCode === originalPickupHubCode || zoneData.zoneCode === originalDropoffHubCode) {
                                console.log(`[ZoneMatch] Skipping airport hub zone: ${zoneData.zoneName} to allow regional zone matching.`);
                                continue;
                            }
                        }

                        // Zone pricing ONLY applies when the pickup is from a known, registered hub.
                        // If detectedBaseLocation is null (e.g. pickup from Denizli, İzmir etc.),
                        // we do NOT apply zone pricing — the system must fall through to km-based pricing.
                        let candidateConfig = null;
                        if (detectedBaseLocation) {
                            const globalConfig = vt.zonePrices?.find(zp => zp.zoneId === zoneId && zp.baseLocation === detectedBaseLocation);
                            const contractKey = `${vt.id}:${zoneId}:${detectedBaseLocation}`;
                            const agencyConfig = agencyContractMap[contractKey];
                            candidateConfig = globalConfig || agencyConfig;
                        }
                        // Bidirectional Fallback: try dropoff base (e.g., Alanya -> AYT return matching an AYT -> Alanya price)
                        if (!candidateConfig && detectedDropoffBase) {
                            const globalConfig2 = vt.zonePrices?.find(zp => zp.zoneId === zoneId && zp.baseLocation === detectedDropoffBase);
                            const contractKey2 = `${vt.id}:${zoneId}:${detectedDropoffBase}`;
                            const agencyConfig2 = agencyContractMap[contractKey2];
                            candidateConfig = globalConfig2 || agencyConfig2;
                        }

                        if (candidateConfig) {
                            // Correct overage calculation based on which end is the HUB for THIS specific pricing configuration
                            let zoneOverage = zoneData.overage; 
                            
                            // If the hub location for this price is the PICKUP point, we expect the destination to be the ZONE.
                            // Therefore, any overage should be measured on the DROPOFF side (distFromEnd)
                            if (candidateConfig.baseLocation === originalPickupHubCode && zoneData.distFromEnd != null) {
                                zoneOverage = zoneData.distFromEnd;
                            } 
                            // If the hub location for this price is the DROPOFF point, we expect the start to be the ZONE.
                            // Therefore, any overage should be measured on the PICKUP side (distFromStart)
                            else if (candidateConfig.baseLocation === originalDropoffHubCode && zoneData.distFromStart != null) {
                                zoneOverage = zoneData.distFromStart;
                            }

                            console.log(`[ZoneOverageCorrection] zone=${zoneData.zoneName}, raw=${zoneData.overage?.toFixed?.(1)}, corrected=${zoneOverage?.toFixed?.(1)}, configBase=${candidateConfig.baseLocation}`);

                            // Priority: 1) pickup zone with smallest area, 2) lowest overage with smallest area
                            const isBetter = 
                                // New candidate is a pickup zone but current is not
                                (isPickupZone && !currentIsPickupZone) ||
                                // Both are pickup zones (or both aren't): pick smallest area
                                (isPickupZone === currentIsPickupZone && (
                                    zoneOverage < lowestValidOverage || 
                                    (zoneOverage === lowestValidOverage && zoneArea < smallestArea)
                                ));
                            
                            if (isBetter) {
                                lowestValidOverage = zoneOverage;
                                smallestArea = zoneArea;
                                currentIsPickupZone = isPickupZone;
                                zonePriceConfig = candidateConfig;
                                finalMatchedZoneId = zoneId;
                                usedOverageDistanceKm = zoneOverage;
                            }
                        }
                    }
                }

                console.log(`[ZoneSelect] vt=${vt.name}, finalMatchedZoneId=${finalMatchedZoneId}, usedOverageDistanceKm=${usedOverageDistanceKm}, extraKmPrice=${zonePriceConfig?.extraKmPrice}`);

                if (zonePriceConfig && finalMatchedZoneId) {
                    // ── ZONE RELEVANCE CHECK ──
                    // Verify the matched zone name is semantically related to the actual pickup or dropoff.
                    // E.g., zone "Alanya" should NOT apply pricing to a "Kemer" pickup.
                    const zoneData = req.zoneOverages[finalMatchedZoneId];
                    const zoneName = (zoneData?.zoneName || '').toLowerCase();
                    const zoneCode = (zoneData?.zoneCode || '').toLowerCase();
                    if (zoneName) {
                        const tokenize = (s) => s.split(/[\s\/,()]+/).filter(t => t.length > 2);
                        const zoneTokens = tokenize(zoneName);
                        
                        let isRelevant = false;
                        if (zoneCode && (zoneCode === originalPickupHubCode || zoneCode === originalDropoffHubCode)) {
                            isRelevant = true;
                        } 
                        if (!isRelevant) {
                            // Check against both primaryToken AND full address text
                            const pTokens = tokenize(pickupPrimaryToken || '');
                            const dTokens = tokenize(dropoffPrimaryToken || '');
                            const pFullTokens = tokenize(pickupTextRaw || '');
                            const dFullTokens = tokenize(dropoffTextRaw || '');
                            const allPickup = [...new Set([...pTokens, ...pFullTokens])];
                            const allDropoff = [...new Set([...dTokens, ...dFullTokens])];
                            // Zone is relevant if ANY of its tokens match pickup or dropoff
                            isRelevant = zoneTokens.some(zt => 
                                allPickup.some(pt => pt === zt || pt.startsWith(zt) || zt.startsWith(pt)) || 
                                allDropoff.some(dt => dt === zt || dt.startsWith(zt) || zt.startsWith(dt))
                            );
                        }
                        if (isRelevant && originalDropoffHubCode === 'GZP' && zoneName.includes('alanya')) {
                            isRelevant = false;
                        }
                        if (!isRelevant) {
                            zonePriceConfig = null;
                            finalMatchedZoneId = null;
                        }
                    }
                }

                const typeMult = 1.0; // Inflation fix: Use 1.0 multiplier to show the individual leg price.

                console.log(`[PriceDecision] vt=${vt.name}, zonePriceConfig=${!!zonePriceConfig}, finalMatchedZoneId=${finalMatchedZoneId}, hasAnyZones=${hasAnyZones}, baseLocation=${detectedBaseLocation}, dropoffBase=${detectedDropoffBase}`);

                if (zonePriceConfig) {
                    const extraKmRate = Number(zonePriceConfig.extraKmPrice) || 0;
                    
                    // CRITICAL: If destination is outside polygon (overage > 0) but no extraKmPrice is set,
                    // this vehicle type does NOT serve outside the polygon.
                    // Fall through to distance-based pricing if available, otherwise skip entirely.
                    if (usedOverageDistanceKm > 0.5 && extraKmRate === 0) {
                        console.log(`[PriceDecision] vt=${vt.name}: OUTSIDE polygon (${usedOverageDistanceKm.toFixed(1)}km overage) but no extraKmPrice set → checking distance-based fallback`);
                        // Check if this vehicle type has distance-based pricing as fallback
                        const meta = agencyContractMeta[vt.id];
                        const openingFee = meta?.openingFee ?? vt.metadata?.openingFee;
                        const pricePerKmField = meta?.basePricePerKm ?? vt.metadata?.basePricePerKm;
                        const hasDistanceFallback = (openingFee != null && Number(openingFee) > 0) ||
                                                     (pricePerKmField != null && Number(pricePerKmField) > 0);
                        if (hasDistanceFallback) {
                            // Use distance-based pricing instead of zone pricing
                            const basePrice = openingFee ? Number(openingFee) : 0;
                            const pricePerKm = pricePerKmField ? Number(pricePerKmField) : 0;
                            const dist = distance ? Number(distance) : 50;
                            calculatedPrice = Math.round((basePrice + (dist * pricePerKm)) * typeMult);
                            calculationMethod = 'DISTANCE_BASE';
                            console.log(`[PriceDecision] vt=${vt.name}: Distance fallback: ${calculatedPrice} (${basePrice} + ${dist}km × ${pricePerKm})`);
                        } else {
                            console.log(`[PriceDecision] vt=${vt.name}: No extraKmPrice and no distance fallback → SKIP`);
                            return null; // Cannot serve outside polygon
                        }
                    } else {
                        calculationMethod = 'ZONE_POLYGON';
                        
                        const fixP = Number(zonePriceConfig.fixedPrice) || 0;
                        let baseRouteCost = 0;
                        
                        if (fixP > 0) {
                            baseRouteCost = fixP;
                        } else {
                            const adultP = Number(zonePriceConfig.price) || 0;
                            const adultCount = Number(passengers) || 1; 
                            baseRouteCost = adultP * adultCount; 
                        }

                        const overageCost = usedOverageDistanceKm * extraKmRate;
                        calculatedPrice = Math.round((baseRouteCost + overageCost) * typeMult);
                        console.log(`[PriceDecision] ZONE price: ${calculatedPrice} (fixP=${fixP}, base=${baseRouteCost}, overage=${usedOverageDistanceKm.toFixed(1)}km × ${extraKmRate}TL = ${overageCost.toFixed(0)})`);
                    }
                } else {
                    // Fallback to distance-based pricing:
                    // Check if pickup or dropoff is inside any zone polygon (even if no zone price matched).
                    // This covers cases like Alanya→Konya where Alanya is a known zone but Konya has no hub/zone.
                    const pickupInZone = req.pickupZoneIds && req.pickupZoneIds.size > 0;
                    const dropoffInZone = req.zoneOverages && Object.keys(req.zoneOverages).length > 0;
                    const hasZoneContact = pickupInZone || dropoffInZone;

                    // STRICT ZONE RULE: If zones are defined but NEITHER pickup nor dropoff
                    // touched any zone polygon, block km-based pricing (unserviced region).
                    if (hasAnyZones && !zonePriceConfig && !hasZoneContact) {
                        return null; // Completely outside all zones -> No service
                    }

                    // If no hub was detected at all and no zone contact, skip
                    if (!detectedBaseLocation && !detectedDropoffBase && !hasZoneContact) {
                        return null;
                    }

                    // 1. Check agency-specific meta (contract fallback)
                    // 2. Then fall back to global vehicle type metadata
                    const meta = agencyContractMeta[vt.id];
                    const openingFee = meta?.openingFee ?? vt.metadata?.openingFee;
                    const pricePerKmField = meta?.basePricePerKm ?? vt.metadata?.basePricePerKm;

                    const hasValidFallback = (openingFee != null && Number(openingFee) > 0) ||
                                             (pricePerKmField != null && Number(pricePerKmField) > 0);

                    // If agency has a meta fixedPrice (hizmet başı sabit), use that
                    if (!hasValidFallback && meta?.fixedPrice) {
                        calculatedPrice = Math.round(Number(meta.fixedPrice) * typeMult);
                    } else if (!hasValidFallback) {
                        return null;
                    } else {
                        const basePrice = openingFee ? Number(openingFee) : 0;
                        const pricePerKm = pricePerKmField ? Number(pricePerKmField) : 0;
                        const dist = distance ? Number(distance) : 50;
                        calculatedPrice = Math.round((basePrice + (dist * pricePerKm)) * typeMult);
                    }
                }

                // === CHECK AGENCY CONTRACT PRICE (zone-based) ===
                // If a zone was matched, look for a contract price for this vehicleType+zone
                let contractLookupKey = finalMatchedZoneId && detectedBaseLocation ? `${vt.id}:${finalMatchedZoneId}:${detectedBaseLocation}` : null;
                let contractPrice = contractLookupKey ? agencyContractMap[contractLookupKey] : null;
                // Fallback: try dropoff base for contract
                if (!contractPrice && finalMatchedZoneId && detectedDropoffBase && detectedDropoffBase !== detectedBaseLocation) {
                    const key2 = `${vt.id}:${finalMatchedZoneId}:${detectedDropoffBase}`;
                    contractPrice = agencyContractMap[key2] || null;
                }
                console.log(`[Trace] VT:${vt.name} detectedBase:${detectedBaseLocation} dropoffBase:${detectedDropoffBase} matchedZone:${finalMatchedZoneId}`);

                let finalPrice;
                let baseContractValue = 0;
                if (contractPrice) {
                    // Contract price is the B2B base. Apply margin on top for retail final price.
                    const extra = usedOverageDistanceKm * (Number(contractPrice.extraKmPrice) || 0);
                    if (Number(contractPrice.fixedPrice) > 0) {
                        baseContractValue = (Number(contractPrice.fixedPrice) + extra) * typeMult;
                    } else {
                        const perPersonPrice = Number(contractPrice.price) || 0;
                        baseContractValue = ((perPersonPrice * Number(passengers)) + extra) * typeMult;
                    }
                    finalPrice = Math.round(baseContractValue * (1 + (agencyMarkup / 100)));
                    console.log(`[Trace] VT:${vt.name} CONTRACT price: ${finalPrice} (base: ${baseContractValue}, markup: ${agencyMarkup}%)`);
                } else {
                    // Standard pricing: apply agency markup on calculated price
                    finalPrice = Math.round(calculatedPrice * (1 + (agencyMarkup / 100)));
                    console.log(`[Trace] VT:${vt.name} STANDARD price: ${finalPrice} (calc: ${calculatedPrice}, markup: ${agencyMarkup}%)`);
                }

                if (finalPrice <= 0) {
                    console.log(`[Trace] VT:${vt.name} SKIPPED: price is 0 or less`);
                    return null;
                }
                
                // Get image from active vehicles if type doesn't have one
                const imageUrl = vt.image || (vt.vehicles && vt.vehicles.length > 0 ? vt.vehicles[0].metadata?.imageUrl : '/vehicles/vito.png');

                // If the final price is zero or negative, skip this vehicle (unserviced)
                if (finalPrice <= 0) return null;

                return {
                    id: vt.id, 
                    vehicleType: vt.name, 
                    vehicleClass: vt.category,
                    vendor: 'SmartTravel',
                    capacity: vt.capacity,
                    luggage: vt.luggage,
                    price: finalPrice,
                    basePrice: contractPrice ? Math.round(baseContractValue) : calculatedPrice, 
                    currency: vt.metadata?.currency || tenantDefaultCurrency, 
                    features: ['Özel Transfer', 'Kapıdan Kapıya', ...(vt.features || [])],
                    cancellationPolicy: '24 saat öncesine kadar ücretsiz iptal',
                    estimatedDuration: distance ? `${Math.round((distance ? Number(distance) : 50) * 1.2)} dk` : '50 dk', 
                    image: imageUrl,
                    isShuttle: false,
                    pricingMethod: contractPrice ? 'AGENCY_CONTRACT' : calculationMethod,
                    zonePriceConfig: contractPrice ? null : zonePriceConfig,
                    metadata: vt.metadata
                };
            }).filter(Boolean); // Remove skipped vehicles (null or zero price)

        // ── TIME DEFINITIONS FILTER ──
        // Check how many hours remain until the pickup/flight time
        const now = new Date();
        const pickupDate = new Date(pickupDateTime);
        const hoursUntilPickup = (pickupDate.getTime() - now.getTime()) / (1000 * 60 * 60);
        
        const privateMinHours = Number(timeDefinitions.privateTransferMinHours) || 0;
        const shuttleMinHours = Number(timeDefinitions.shuttleTransferMinHours) || 0;
        
        let filteredTypeResults = typeResults;
        let filteredShuttleResults = shuttleResults;
        
        if (privateMinHours > 0 && hoursUntilPickup < privateMinHours) {
            filteredTypeResults = [];
            console.log(`[TimeFilter] Private transfers blocked: ${hoursUntilPickup.toFixed(1)}h < ${privateMinHours}h minimum`);
        }
        if (shuttleMinHours > 0 && hoursUntilPickup < shuttleMinHours) {
            filteredShuttleResults = [];
            console.log(`[TimeFilter] Shuttle transfers blocked: ${hoursUntilPickup.toFixed(1)}h < ${shuttleMinHours}h minimum`);
        }

        res.json({
            success: true,
            data: {
                searchParams: { pickup, dropoff, pickupDateTime, returnDateTime, passengers, transferType },
                results: [...filteredShuttleResults, ...filteredTypeResults],
                timeFilter: {
                    hoursUntilPickup: Math.round(hoursUntilPickup * 10) / 10,
                    privateBlocked: privateMinHours > 0 && hoursUntilPickup < privateMinHours,
                    shuttleBlocked: shuttleMinHours > 0 && hoursUntilPickup < shuttleMinHours
                }
            }
        });

    } catch (error) {
        console.error('Transfer search error:', error);
        res.status(500).json({
            success: false,
            error: 'Transfer arama başarısız oldu'
        });
    }
});

/**
 * POST /api/transfer/book
 * Create transfer booking (Persisted to Database)
 */
router.post('/book', optionalAuthMiddleware, async (req, res) => {
    try {
        // Support both old format (single booking) and new format (outbound + return)
        const { outbound, return: returnPayload, totalPrice } = req.body;
        
        // Use new format if available, otherwise fall back to old format
        const isRoundTripFormat = outbound && returnPayload;
        const bookingData = isRoundTripFormat ? outbound : req.body;
        
        const {
            vehicleType,
            pickup,
            dropoff,
            pickupDateTime,
            returnDateTime,
            passengers,
            price,
            currency,
            paymentMethod,
            customerInfo,
            flightNumber,
            flightTime,
            notes,
            extraServices,
            passengerDetails,
            billingDetails,
            shuttleRouteId,
            shuttleMasterTime,
            isRoundTrip,
            tripLeg
        } = bookingData;

        // ... (keep validations) ...

        // Resolve Tenant and User
        const tenantId = req.tenant?.id;
        const userId = req.user?.id;

        if (!tenantId) {
            return res.status(500).json({ success: false, error: 'Tenant context missing' });
        }

        // Generate Booking Number (e.g., TR-20231025-1234)
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const randomSuffix = Math.floor(1000 + Math.random() * 9000);
        const bookingNumber = `TR-${dateStr}-${randomSuffix}`;
        
        // Load hubs for region detection
        const hubs = await loadTenantHubs(tenantId);
        
        // Helper function to create a booking
        const createBooking = async (data, linkedBookingNumber = null) => {
            const {
                vehicleType,
                pickup,
                dropoff,
                pickupDateTime,
                passengers,
                adults,
                children,
                infants,
                price,
                currency,
                paymentMethod,
                customerInfo,
                flightNumber,
                flightTime,
                notes,
                extraServices,
                passengerDetails,
                billingDetails,
                shuttleRouteId,
                shuttleMasterTime,
                tripLeg
            } = data;
            
            const bn = linkedBookingNumber ? `${linkedBookingNumber}-D` : `TR-${dateStr}-${Math.floor(1000 + Math.random() * 9000)}`;
            
            const pickupRegionCode = detectRegionCode(pickup, hubs);
            const dropoffRegionCode = detectRegionCode(dropoff, hubs);
            const tripType = getTripType(pickup, dropoff); // Determine trip type

            return await prisma.booking.create({
                data: {
                    tenantId: tenantId,
                    customerId: userId || null,
                    bookingNumber: bn,
                    productType: 'TRANSFER',

                    startDate: new Date(pickupDateTime),
                    endDate: new Date(new Date(pickupDateTime).getTime() + 60 * 60 * 1000),

                    adults: Number(adults) || Number(passengers) || 1,
                    children: Number(children) || 0,
                    infants: Number(infants) || 0,

                    // Pricing
                    subtotal: price || 0,
                    tax: 0,
                    serviceFee: 0,
                    total: price || 0,
                    currency: currency || 'TRY',

                    status: 'PENDING',
                    paymentStatus: 'PENDING',

                    contactName: customerInfo.fullName,
                    contactEmail: customerInfo.email,
                    contactPhone: customerInfo.phone,

                    specialRequests: notes,

                    // Store Transfer Specifics in Metadata
                    metadata: {
                        vehicleType,
                        pickup,
                        dropoff,
                        flightNumber,
                        flightTime,
                        paymentMethod: paymentMethod || 'PAY_IN_VEHICLE',
                        notes,
                        distance: data.distance || '0 km',
                        duration: data.duration || '0 dk',
                        extraServices: extraServices || [],
                        wantsInvoice: !!billingDetails && !linkedBookingNumber, // Only outbound has billing
                        billingDetails: billingDetails || null,
                        passengerDetails: passengerDetails || [],
                        shuttleRouteId: shuttleRouteId || null,
                        shuttleMasterTime: shuttleMasterTime || null,
                        pickupRegionCode: pickupRegionCode || null,
                        dropoffRegionCode: dropoffRegionCode || null,
                        tripLeg: tripLeg || 'OUTBOUND',
                        linkedBookingNumber: linkedBookingNumber,
                        tripType: tripType // Store trip type for shuttle grouping
                    }
                }
            });
        };
        
        // Create outbound booking
        const outboundBooking = await createBooking(outbound || req.body);
        
        // Create return booking if round trip
        let returnBooking = null;
        if (isRoundTripFormat && returnPayload) {
            returnBooking = await createBooking(returnPayload, outboundBooking.bookingNumber);
        }
        
        const booking = outboundBooking; // For backward compatibility

        const io = req.app.get('io');
        if (io) {
            io.to('admin_monitoring').emit('new_booking', booking);
        }

        // --- Create Invoice if requested ---
        if (billingDetails) {
            try {
                // Fetch tenant metadata
                const tenant = await prisma.tenant.findUnique({
                    where: { id: tenantId },
                    select: { metadata: true, name: true }
                });
                const meta = { ...(tenant?.metadata || {}) };
                if (!Array.isArray(meta.invoices)) meta.invoices = [];

                // Helper to generate Invoice ID and Number (matches invoices.js)
                const genId = () => Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();
                const genInvoiceNo = (type, tenantPrefix = 'ST') => {
                    const now = new Date();
                    const yr = now.getFullYear();
                    const mon = String(now.getMonth() + 1).padStart(2, '0');
                    const seq = Math.floor(Math.random() * 9000 + 1000);
                    const prefix = type === 'PURCHASE' ? 'ALF' : 'STF';
                    return `${tenantPrefix}-${prefix}-${yr}${mon}-${seq}`;
                };

                const prefix = (tenant?.name || 'ST').replace(/\s/g, '').substring(0, 4).toUpperCase();
                const invoiceNo = genInvoiceNo('SALES', prefix);

                // Build Buyer Info from billingDetails
                const isCorporate = billingDetails.type === 'corporate';
                const buyerInfo = {
                    fullName: isCorporate ? '' : (billingDetails.fullName || customerInfo.fullName),
                    companyName: isCorporate ? billingDetails.companyName : '',
                    taxOffice: billingDetails.taxOffice || '',
                    taxNo: isCorporate ? billingDetails.taxNo : (billingDetails.tcNo || ''),
                    address: billingDetails.address || '',
                    phone: customerInfo.phone || '',
                    email: customerInfo.email || ''
                };

                // Create line items for both outbound and return
                const totalPrice = Number(outboundBooking.total) + (returnBooking ? Number(returnBooking.total) : 0);
                const subTotalStr = totalPrice / 1.20; // Assuming 20% VAT inclusive for B2C transfers
                const subTotal = Number(subTotalStr.toFixed(2));
                const totalVatStr = totalPrice - subTotal;
                const totalVat = Number(totalVatStr.toFixed(2));
                
                const lines = [{
                    id: genId(),
                    description: `Gidiş Transfer (${outboundBooking.bookingNumber})`,
                    quantity: 1,
                    unitPrice: Number((Number(outboundBooking.total) / 1.20).toFixed(2)),
                    vatRate: 20,
                    vatAmount: Number((Number(outboundBooking.total) - (Number(outboundBooking.total) / 1.20)).toFixed(2)),
                    lineTotal: Number((Number(outboundBooking.total) / 1.20).toFixed(2)),
                    unit: 'Hizmet'
                }];
                
                if (returnBooking) {
                    lines.push({
                        id: genId(),
                        description: `Dönüş Transfer (${returnBooking.bookingNumber})`,
                        quantity: 1,
                        unitPrice: Number((Number(returnBooking.total) / 1.20).toFixed(2)),
                        vatRate: 20,
                        vatAmount: Number((Number(returnBooking.total) - (Number(returnBooking.total) / 1.20)).toFixed(2)),
                        lineTotal: Number((Number(returnBooking.total) / 1.20).toFixed(2)),
                        unit: 'Hizmet'
                    });
                }

                const invoice = {
                    id: genId(),
                    invoiceNo: invoiceNo,
                    invoiceType: 'SALES',
                    invoiceKind: 'EARCHIVE',
                    status: 'DRAFT',
                    sellerInfo: {},
                    buyerInfo: buyerInfo,
                    lines: lines,
                    subTotal: subTotal,
                    totalVat: totalVat,
                    discount: 0,
                    grandTotal: totalPrice,
                    currency: outboundBooking.currency || 'TRY',
                    invoiceDate: new Date().toISOString(),
                    paymentMethod: 'CASH', // Default for now
                    notes: `B2C Web Rezervasyonu: ${outboundBooking.bookingNumber}`,
                    createdBy: userId || 'SYSTEM',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    bookingRef: outboundBooking.bookingNumber,
                };

                meta.invoices.push(invoice);
                await prisma.tenant.update({
                    where: { id: tenantId },
                    data: { metadata: meta }
                });
            } catch (err) {
                console.error('Failed to create invoice from booking:', err);
                // Non-blocking error. Booking is still successful.
            }
        }
        // -----------------------------------

        res.status(201).json({
            success: true,
            data: {
                ...outboundBooking,
                // Flatten metadata for frontend consistency
                vehicleType: outboundBooking.metadata?.vehicleType,
                pickup: outboundBooking.metadata?.pickup,
                dropoff: outboundBooking.metadata?.dropoff,
                passengerName: outboundBooking.contactName,
                passengerPhone: outboundBooking.contactPhone,
                pickupDateTime: outboundBooking.startDate,
                // Include return booking if round trip
                returnBooking: returnBooking ? {
                    ...returnBooking,
                    vehicleType: returnBooking.metadata?.vehicleType,
                    pickup: returnBooking.metadata?.pickup,
                    dropoff: returnBooking.metadata?.dropoff,
                    pickupDateTime: returnBooking.startDate
                } : null,
                totalPrice: Number(outboundBooking.total) + (returnBooking ? Number(returnBooking.total) : 0)
            },
            message: returnBooking 
                ? 'Gidiş-Dönüş rezervasyonlarınız veritabanına kaydedildi.' 
                : 'Transfer rezervasyonunuz veritabanına kaydedildi.'
        });

    } catch (error) {
        console.error('Transfer booking error:', error);
        res.status(500).json({
            success: false,
            error: 'Rezervasyon veritabanına kaydedilemedi: ' + error.message
        });
    }
});

/**
 * GET /api/transfer/bookings
 * Get all transfer bookings (for Admin) - From Database
 */
router.get('/bookings', authMiddleware, async (req, res) => {
    try {
        const bookings = await prisma.booking.findMany({
            where: {
                productType: 'TRANSFER' // Only fetch transfers
            },
            include: {
                customer: {
                    include: {
                        agency: true
                    }
                },
                agency: true
            },
            orderBy: {
                createdAt: 'desc'
            }
        });

        // 1. Collect all unique confirmedBy IDs
        const confirmedByIds = [...new Set(bookings.map(b => b.confirmedBy).filter(Boolean))];

        // 2. Fetch those users with their roles
        const users = await prisma.user.findMany({
            where: {
                id: { in: confirmedByIds }
            },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                role: {
                    select: {
                        type: true,
                        name: true
                    }
                }
            }
        });

        // 3. Create a lookup map
        const userMap = {};
        const roleMap = {};
        users.forEach(u => {
            userMap[u.id] = `${u.firstName} ${u.lastName}`;
            roleMap[u.id] = u.role?.type; // e.g. 'PARTNER', 'SUPER_ADMIN'
        });

        // Map DB format to Frontend format
        const mappedBookings = bookings.map(b => ({
            id: b.id,
            bookingNumber: b.bookingNumber,
            vehicleType: b.metadata?.vehicleType || 'Unknown',
            pickup: b.metadata?.pickup || '',
            dropoff: b.metadata?.dropoff || '',
            pickupDateTime: b.startDate,
            passengerName: b.contactName,
            passengerPhone: b.contactPhone,
            contactName: b.contactName,
            contactEmail: b.contactEmail,
            contactPhone: b.contactPhone,
            price: Number(b.total),
            total: Number(b.total),
            currency: b.currency,
            status: b.status,
            paymentStatus: b.paymentStatus,
            createdAt: b.createdAt,
            notes: b.specialRequests,
            specialRequests: b.specialRequests,   // Customer notes
            internalNotes: b.metadata?.internalNotes || b.internalNotes || '', // Operations note
            adults: b.adults,
            children: b.children || 0,
            infants: b.infants || 0,
            flightNumber: b.metadata?.flightNumber,
            flightTime: b.metadata?.flightTime,
            pickupRegionCode: b.metadata?.pickupRegionCode || null,
            dropoffRegionCode: b.metadata?.dropoffRegionCode || null,
            operationalStatus: b.metadata?.operationalStatus, // Added for Op/Pool tracking
            returnReason: b.metadata?.returnReason || null, // Return to reservation reason
            returnedAt: b.metadata?.returnedAt || null,
            partnerName: b.confirmedBy ? (userMap[b.confirmedBy] || 'Bilinmiyor') : null, // Map Partner Name
            partnerRole: b.confirmedBy ? (roleMap[b.confirmedBy] || 'UNKNOWN') : null, // Map Partner Role
            driverId: b.metadata?.driverId || b.driverId || null, // Driver assignment
            assignedVehicleId: b.metadata?.assignedVehicleId || b.metadata?.vehicleId || null, // Vehicle assignment
            vehicleId: b.metadata?.assignedVehicleId || b.metadata?.vehicleId || null, // UI compatibility
            // Nested relations mapping expected by the frontend:
            customer: b.customer,
            agencyName: b.agency?.name || b.agency?.companyName || b.customer?.agency?.name || b.customer?.agency?.companyName || b.metadata?.agencyName || null,
            agencyId: b.agencyId || b.customer?.agency?.id || null,
            // Fatura alanları
            wantsInvoice: b.metadata?.wantsInvoice || false,
            billingDetails: b.metadata?.billingDetails || null,
            metadata: b.metadata || {},
            // Pickup/Dropoff tracking timestamps
            pickedUpAt: b.pickedUpAt,
            droppedOffAt: b.droppedOffAt
        }));

        res.json({
            success: true,
            data: mappedBookings
        });
    } catch (error) {
        console.error('Get bookings error:', error);
        res.status(500).json({
            success: false,
            error: 'Rezervasyonlar veritabanından alınamadı'
        });
    }
});

/**
 * GET /api/transfer/pool-bookings
 * Get bookings in the pool (for Partners)
 */
// Get bookings in the pool (for Partners)
router.get('/pool-bookings', authMiddleware, async (req, res) => {
    try {
        const bookings = await prisma.booking.findMany({
            where: {
                productType: 'TRANSFER',
                status: 'CONFIRMED'
            },
            orderBy: { startDate: 'asc' }
        });

        const poolBookings = bookings.filter(b => {
            const meta = b.metadata || {};
            // Only show 'IN_POOL' status as 'POOL' is considered CONFIRMED by user
            return meta.operationalStatus === 'IN_POOL';
        });

        const mappedBookings = poolBookings.map(b => ({
            id: b.id,
            bookingNumber: b.bookingNumber,
            customer: {
                name: b.contactName,
                phone: b.contactPhone,
                avatar: b.contactName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
            },
            pickup: {
                location: b.metadata?.pickup || 'Belirtilmemiş',
                time: new Date(b.startDate).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }),
                timeDate: b.startDate, // Raw date for FlightTracker
                note: b.specialRequests
            },
            flightNumber: b.metadata?.flightNumber,
            dropoff: {
                location: b.metadata?.dropoff || 'Belirtilmemiş',
                dist: b.metadata?.distance || 'KM Bilgisi Yok', // Read from DB
                duration: b.metadata?.duration || 'Süre Yok' // Read from DB
            },
            vehicle: {
                type: b.metadata?.vehicleType || 'Standart',
                pax: b.adults,
                luggage: 2 // Mock
            },
            price: {
                amount: b.metadata?.poolPrice ? Number(b.metadata.poolPrice) : Number(b.total),
                currency: b.currency
            },
            status: b.metadata?.operationalStatus || 'POOL'
        }));

        res.json({
            success: true,
            data: mappedBookings
        });
    } catch (error) {
        console.error('Get pool bookings error:', error);
        res.status(500).json({
            success: false,
            error: 'Havuz rezervasyonları alınamadı'
        });
    }
});

/**
 * GET /api/transfer/bookings/:id
 * Get single booking details
 */
router.get('/bookings/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const booking = await prisma.booking.findUnique({
            where: { id: id }
        });

        if (!booking) {
            return res.status(404).json({ success: false, error: 'Rezervasyon bulunamadı' });
        }

        // Map to frontend format
        const mapped = {
            id: booking.id,
            bookingNumber: booking.bookingNumber,
            customer: {
                name: booking.contactName,
                phone: booking.contactPhone,
                email: booking.contactEmail, // Added email
                avatar: booking.contactName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
            },
            pickup: {
                location: booking.metadata?.pickup || 'Belirtilmemiş',
                time: new Date(booking.startDate).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
                timeDate: booking.startDate, // Raw date for FlightTracker
                note: booking.specialRequests,
                // Pass raw location string for Map component
                rawLocation: booking.metadata?.pickup
            },
            dropoff: {
                location: booking.metadata?.dropoff || 'Belirtilmemiş',
                dist: booking.metadata?.distance || 'KM Bilgisi Yok',
                duration: booking.metadata?.duration || 'Süre Yok',
                // Pass raw location string for Map component
                rawLocation: booking.metadata?.dropoff
            },
            vehicle: {
                type: booking.metadata?.vehicleType || 'Standart',
                pax: booking.adults,
                luggage: 2
            },
            price: {
                amount: Number(booking.total),
                poolPrice: booking.metadata?.poolPrice ? Number(booking.metadata.poolPrice) : null,
                currency: booking.currency
            },
            status: booking.status,
            operationalStatus: booking.metadata?.operationalStatus || 'POOL',
            flightNumber: booking.metadata?.flightNumber,
            flightTime: booking.metadata?.flightTime,
            pickupRegionCode: booking.metadata?.pickupRegionCode || null,
            dropoffRegionCode: booking.metadata?.dropoffRegionCode || null,
            createdAt: booking.createdAt
        };

        res.json({ success: true, data: mapped });
    } catch (error) {
        console.error('Get booking error:', error);
        res.status(500).json({ success: false, error: 'Rezervasyon alınamadı' });
    }
});

/**
 * GET /api/transfer/partner/active-bookings
 * Get active bookings for the logged-in partner
 */
router.get('/partner/active-bookings', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;

        const bookings = await prisma.booking.findMany({
            where: {
                productType: 'TRANSFER',
                status: 'CONFIRMED',
                // Check if this partner confirmed the booking
                // Note: verified in PUT /bookings/:id/status that we set confirmedBy
                confirmedBy: userId
            },
            orderBy: { startDate: 'asc' }
        });

        // Filter out completed ones if necessary (based on metadata or another status field)
        // For now, assume CONFIRMED status implies active until marked COMPLETED/FINISHED
        const activeBookings = bookings.filter(b => {
            // If you have a specific completed status, check it here
            // e.g., if (b.metadata?.operationalStatus === 'COMPLETED') return false;
            return true;
        });

        const mappedBookings = activeBookings.map(b => ({
            id: b.id,
            bookingNumber: b.bookingNumber,
            customer: {
                name: b.contactName,
                phone: b.contactPhone,
                avatar: b.contactName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
            },
            pickup: {
                location: b.metadata?.pickup || 'Belirtilmemiş',
                time: new Date(b.startDate).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }),
                timeDate: b.startDate, // Raw date for FlightTracker
                note: b.specialRequests
            },
            flightNumber: b.metadata?.flightNumber,
            flightTime: b.metadata?.flightTime,
            dropoff: {
                location: b.metadata?.dropoff || 'Belirtilmemiş',
                dist: b.metadata?.distance || 'KM Bilgisi Yok',
                duration: b.metadata?.duration || 'Süre Yok'
            },
            vehicle: {
                type: b.metadata?.vehicleType || 'Standart',
                pax: b.adults,
                luggage: 2
            },
            price: {
                amount: b.metadata?.poolPrice ? Number(b.metadata.poolPrice) : Number(b.total),
                currency: b.currency
            },
            status: 'ACCEPTED', // Frontend tracking
            operationalStatus: b.metadata?.operationalStatus
        }));

        res.json({
            success: true,
            data: mappedBookings
        });
    } catch (error) {
        console.error('Get partner active bookings error:', error);
        res.status(500).json({
            success: false,
            error: 'Aktif transferler alınamadı'
        });
    }
});
/**
 * GET /api/transfer/partner/completed-bookings
 * Get completed bookings for the logged-in partner
 */
router.get('/partner/completed-bookings', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        const { status } = req.query; // Optional filter

        const whereClause = {
            productType: 'TRANSFER',
            status: 'COMPLETED', // Only completed bookings
            confirmedBy: userId
        };

        // Optional: Filter by payment status if needed, though frontend does tabs
        // if (status && status !== 'ALL') {
        //    whereClause.paymentStatus = status;
        // }

        const bookings = await prisma.booking.findMany({
            where: whereClause,
            orderBy: { startDate: 'desc' } // Newest first
        });

        const mappedBookings = bookings.map(b => ({
            id: b.id,
            bookingNumber: b.bookingNumber,
            customer: {
                name: b.contactName,
                phone: b.contactPhone,
                avatar: b.contactName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
            },
            pickup: {
                location: b.metadata?.pickup || 'Belirtilmemiş',
                time: new Date(b.startDate).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
            },
            dropoff: {
                location: b.metadata?.dropoff || 'Belirtilmemiş',
            },
            vehicle: {
                type: b.metadata?.vehicleType || 'Standart',
            },
            price: {
                amount: b.metadata?.poolPrice ? Number(b.metadata.poolPrice) : Number(b.total),
                currency: b.currency,
                commissionRate: b.metadata?.partnerCommissionRate !== undefined ? Number(b.metadata.partnerCommissionRate) : null,
                commissionAmount: b.metadata?.partnerCommissionAmount !== undefined ? Number(b.metadata.partnerCommissionAmount) : 0,
                netEarning: b.metadata?.partnerNetEarning !== undefined ? Number(b.metadata.partnerNetEarning) : (b.metadata?.poolPrice ? Number(b.metadata.poolPrice) : Number(b.total))
            },
            paymentStatus: b.paymentStatus, // PAID, PENDING, DISPUTED
            completedAt: b.updatedAt // Or a specific completedAt field if added
        }));

        res.json({
            success: true,
            data: mappedBookings
        });
    } catch (error) {
        console.error('Get partner completed bookings error:', error);
        res.status(500).json({
            success: false,
            error: 'Tamamlanmış transferler alınamadı'
        });
    }
});

/**
 * GET /api/transfer/partner/stats
 * Get dashboard stats for partner
 */
router.get('/partner/stats', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // 1. Pending (In Pool) - Global count of available jobs
        // Count confirmed bookings that are in the pool
        const pendingBookings = await prisma.booking.findMany({
            where: {
                productType: 'TRANSFER',
                status: 'CONFIRMED'
            },
            select: { metadata: true }
        });

        // Filter in memory for JSON field query
        const pendingCount = pendingBookings.filter(b =>
            b.metadata?.operationalStatus === 'IN_POOL'
        ).length;

        // 2. Today (Completed Today) - Partner specific
        const todayCount = await prisma.booking.count({
            where: {
                productType: 'TRANSFER',
                status: 'COMPLETED',
                confirmedBy: userId,
                updatedAt: {
                    gte: today
                }
            }
        });

        // 3. Financial Summary - Get from User account
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                balance: true,
                debit: true,
                credit: true
            }
        });

        res.json({
            success: true,
            data: {
                pending: pendingCount,
                today: todayCount,
                financials: {
                    balance: Number(user?.balance || 0),
                    debit: Number(user?.debit || 0),
                    credit: Number(user?.credit || 0)
                }
            }
        });
    } catch (error) {
        console.error('Get partner stats error:', error);
        res.status(500).json({
            success: false,
            error: 'İstatistikler alınamadı'
        });
    }
});

/**
 * PATCH /api/transfer/bookings/:id
 * Update booking operational assignment (driver, vehicle) - Admin
 */
router.patch('/bookings/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { driverId, assignedVehicleId, skipConflictCheck, internalNotes, returnToReservation, returnReason,
                // Inline cell editing fields:
                contactName, contactPhone, pickupDateTime, pickupLocation, dropoffLocation,
                flightNumber, flightTime, adults, children, infants, price, status: newStatus, operationalStatus } = req.body;
        console.log(`[PATCH booking] id=${id} driverId=${driverId} assignedVehicleId=${assignedVehicleId}`);

        // Auto-find vehicle assigned to this driver if not explicitly provided
        let resolvedVehicleId = assignedVehicleId;
        if (driverId && !assignedVehicleId) {
            // Fetch all vehicles and match in JS (avoids Prisma JSON path issues)
            const allVehicles = await prisma.vehicle.findMany({ select: { id: true, plateNumber: true, metadata: true } });
            // Also get personnelId for this user
            const personnel = await prisma.personnel.findFirst({ where: { userId: driverId }, select: { id: true } });
            const personnelId = personnel?.id || null;
            console.log(`[PATCH booking] Looking for vehicle with driverId=${driverId} or personnelId=${personnelId}`);
            console.log(`[PATCH booking] All vehicle driverIds:`, allVehicles.map(v => ({ plate: v.plateNumber, driverId: v.metadata?.driverId })));
            const cleanId = (id) => id ? id.replace(/[-\s]/g, '').toLowerCase() : '';
            const targetUserRaw = driverId ? cleanId(driverId) : null;
            const targetStaffRaw = personnelId ? cleanId(personnelId) : null;
            
            const matched = allVehicles.find(v => {
                const vDriver = cleanId(v.metadata?.driverId);
                return (targetUserRaw && vDriver === targetUserRaw) || (targetStaffRaw && vDriver === targetStaffRaw);
            });
            if (matched) {
                resolvedVehicleId = matched.id;
                console.log(`[PATCH booking] Auto-resolved vehicle: ${matched.id} (${matched.plateNumber})`);
            } else {
                console.log(`[PATCH booking] No vehicle found for driver ${driverId}`);
            }
        }

        const currentBooking = await prisma.booking.findUnique({ where: { id } });
        if (!currentBooking) {
            return res.status(404).json({ success: false, error: 'Rezervasyon bulunamadı' });
        }

        // Capture previous state for audit trail
        req._auditPreviousState = {
            status: currentBooking.status,
            driverId: currentBooking.driverId,
            assignedVehicleId: currentBooking.assignedVehicleId,
            contactName: currentBooking.contactName,
            contactPhone: currentBooking.contactPhone,
            price: Number(currentBooking.total || 0),
            startDate: currentBooking.startDate,
            pickup: currentBooking.metadata?.pickup,
            dropoff: currentBooking.metadata?.dropoff,
            flightNumber: currentBooking.metadata?.flightNumber,
            operationalStatus: currentBooking.metadata?.operationalStatus
        };

        // ---- Route Duration: calculate if not already stored ----
        let estimatedDurationMinutes = currentBooking.metadata?.estimatedDurationMinutes;
        if (!estimatedDurationMinutes) {
            try {
                const RouteService = require('../services/RouteService');
                const pickup = currentBooking.metadata?.pickup;
                const dropoff = currentBooking.metadata?.dropoff;
                if (pickup && dropoff) {
                    const route = await RouteService.getRouteDuration(pickup, dropoff);
                    estimatedDurationMinutes = route.durationMinutes;
                    console.log(`[Transfer] Route calc: ${pickup} → ${dropoff} = ${estimatedDurationMinutes} min (${route.source})`);
                }
            } catch (routeErr) {
                console.warn('[Transfer] Route calculation failed, using default:', routeErr.message);
                estimatedDurationMinutes = 120; // fallback 2 hours
            }
        }

        // ---- Conflict Check (unless explicitly skipped) ----
        if (!skipConflictCheck && (driverId || resolvedVehicleId)) {
            const effectiveStartDate = pickupDateTime || currentBooking.startDate;
            const REST_MINUTES = 30;
            const totalMinutes = (estimatedDurationMinutes || 120) + REST_MINUTES;

            const newStart = new Date(effectiveStartDate);
            const newEnd = new Date(newStart.getTime() + totalMinutes * 60000);

            // Get same-day bookings
            const dayStart = new Date(newStart); dayStart.setHours(0, 0, 0, 0);
            const dayEnd = new Date(newStart); dayEnd.setDate(dayEnd.getDate() + 1); dayEnd.setHours(23, 59, 59, 999);

            const existingBookings = await prisma.booking.findMany({
                where: {
                    productType: 'TRANSFER',
                    startDate: { gte: dayStart, lte: dayEnd },
                    status: { notIn: ['CANCELLED'] },
                    id: { not: id }
                }
            });

            const checkConflict = (targetId, isDriver) => {
                const relevant = isDriver
                    ? existingBookings.filter(b => b.driverId === targetId)
                    : existingBookings.filter(b => b.metadata?.assignedVehicleId === targetId);

                return relevant.find(b => {
                    const bStart = new Date(b.startDate);
                    const bDur = (b.metadata?.estimatedDurationMinutes || 120) + 30;
                    const bEnd = new Date(bStart.getTime() + bDur * 60000);
                    return newStart < bEnd && bStart < newEnd;
                });
            };

            // Check driver conflict
            if (driverId) {
                const conflict = checkConflict(driverId, true);
                if (conflict) {
                    const conflictEnd = new Date(new Date(conflict.startDate).getTime() + ((conflict.metadata?.estimatedDurationMinutes || 120) + 30) * 60000);
                    return res.status(409).json({
                        success: false,
                        conflict: true,
                        error: `Bu şöför ${conflict.bookingNumber} rezervasyonuyla çakışıyor`,
                        conflictWith: conflict.bookingNumber,
                        conflictPickup: conflict.metadata?.pickup,
                        conflictDropoff: conflict.metadata?.dropoff,
                        conflictStart: conflict.startDate,
                        freeAt: conflictEnd.toISOString()
                    });
                }
            }

            // Check vehicle conflict
            if (resolvedVehicleId) {
                const conflict = checkConflict(resolvedVehicleId, false);
                if (conflict) {
                    const conflictEnd = new Date(new Date(conflict.startDate).getTime() + ((conflict.metadata?.estimatedDurationMinutes || 120) + 30) * 60000);
                    return res.status(409).json({
                        success: false,
                        conflict: true,
                        error: `Bu araç ${conflict.bookingNumber} rezervasyonuyla çakışıyor`,
                        conflictWith: conflict.bookingNumber,
                        conflictPickup: conflict.metadata?.pickup,
                        conflictDropoff: conflict.metadata?.dropoff,
                        conflictStart: conflict.startDate,
                        freeAt: conflictEnd.toISOString()
                    });
                }
            }
        }

        // ---- Calculate freeAt time ----
        const effectiveStartDate = pickupDateTime || currentBooking.startDate;
        const freeAt = new Date(new Date(effectiveStartDate).getTime() + ((estimatedDurationMinutes || 120) + 30) * 60000);

        const newMetadata = {
            ...(currentBooking.metadata || {}),
            ...(resolvedVehicleId !== undefined ? { assignedVehicleId: resolvedVehicleId } : {}),
            estimatedDurationMinutes: estimatedDurationMinutes || 120,
            freeAt: freeAt.toISOString()
        };

        // Handle inline cell editing fields
        if (pickupLocation !== undefined) newMetadata.pickup = pickupLocation;
        if (dropoffLocation !== undefined) newMetadata.dropoff = dropoffLocation;
        if (flightNumber !== undefined) newMetadata.flightNumber = flightNumber;
        if (flightTime !== undefined) newMetadata.flightTime = flightTime;
        if (internalNotes !== undefined) newMetadata.internalNotes = internalNotes;
        if (operationalStatus !== undefined) newMetadata.operationalStatus = operationalStatus;

        // Handle return to reservation flow
        if (returnToReservation) {
            newMetadata.operationalStatus = null;
            newMetadata.returnReason = returnReason || '';
            newMetadata.returnedAt = new Date().toISOString();
            newMetadata.returnedBy = req.user?.id;
            // Also clear driver/vehicle
            newMetadata.driverId = null;
            newMetadata.assignedVehicleId = null;
        }

        // Prepare update data
        const updateData = {
            metadata: newMetadata
        };

        // Inline field updates
        if (contactName !== undefined) updateData.contactName = contactName;
        if (contactPhone !== undefined) updateData.contactPhone = contactPhone;
        if (pickupDateTime !== undefined) { updateData.startDate = new Date(pickupDateTime); updateData.endDate = new Date(pickupDateTime); }
        if (adults !== undefined) updateData.adults = Number(adults);
        if (children !== undefined) updateData.children = Number(children);
        if (infants !== undefined) updateData.infants = Number(infants);
        if (price !== undefined) { updateData.total = Number(price); updateData.subtotal = Number(price); }
        if (newStatus !== undefined) updateData.status = newStatus;
        if (returnToReservation) {
            updateData.status = 'PENDING';
            updateData.driverId = null;
        }

        if (driverId !== undefined) {
            updateData.driverId = driverId; // Update real column
            newMetadata.driverId = driverId; // Keep in metadata for legacy compatibility if needed
            // Otomatik durum güncelleme: Şöför atandığında -> DRIVER_ASSIGNED, kaldırıldığında -> IN_OPERATION
            if (driverId) {
                const currentOpStatus = newMetadata.operationalStatus;
                if (!currentOpStatus || currentOpStatus === 'IN_OPERATION' || currentOpStatus === 'OPERASYONDA') {
                    newMetadata.operationalStatus = 'DRIVER_ASSIGNED';
                }
            } else {
                // Şoför kaldırıldı -> tekrar operasyonda
                newMetadata.operationalStatus = 'IN_OPERATION';
            }
        }

        const updated = await prisma.booking.update({
            where: { id },
            data: updateData
        });

        // Emit socket event if driver assigned
        if (driverId) {
            const io = req.app.get('io');
            if (io) {
                io.to(`user_${driverId}`).emit('operation_assigned', {
                    bookingId: id,
                    bookingNumber: updated.bookingNumber,
                    pickup: updated.metadata?.pickup || 'Konum Belirtilmemiş',
                    start: updated.startDate
                });
            }

            // Send Expo Push Notification (works when app is closed/background)
            try {
                const driver = await prisma.user.findUnique({ where: { id: driverId } });
                console.log(`[Push] driverId=${driverId} found=${!!driver} pushToken=${driver?.pushToken}`);

                // If not found by userId, try finding via personnel
                let resolvedDriver = driver;
                if (!resolvedDriver) {
                    const personnel = await prisma.personnel.findFirst({ where: { id: driverId }, include: { user: true } });
                    resolvedDriver = personnel?.user || null;
                    if (resolvedDriver) console.log(`[Push] Resolved via personnel: userId=${resolvedDriver.id} pushToken=${resolvedDriver.pushToken}`);
                }

                // metadata might be a string if stored raw, or an object if JSON
                let driverMeta = resolvedDriver?.metadata || {};
                if (typeof driverMeta === 'string') {
                    try { driverMeta = JSON.parse(driverMeta); } catch (e) { driverMeta = {}; }
                }

                const pushToken = resolvedDriver?.pushToken || driverMeta?.expoPushToken;

                if (pushToken && pushToken.startsWith('ExponentPushToken')) {
                    const pickupStr = updated.metadata?.pickup || 'Belirtilmemiş';
                    const dateStr = updated.startDate
                        ? new Date(updated.startDate).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
                        : '';

                    await fetch('https://exp.host/--/api/v2/push/send', {
                        method: 'POST',
                        headers: {
                            'Accept': 'application/json',
                            'Accept-Encoding': 'gzip, deflate',
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            to: pushToken,
                            sound: 'default',
                            title: '🚗 Yeni İş Atandı!',
                            body: `${pickupStr} • ${dateStr}`,
                            data: {
                                bookingId: id,
                                bookingNumber: updated.bookingNumber,
                                type: 'operationAssigned',
                                pickup: pickupStr,
                                start: updated.startDate
                            },
                            priority: 'high',
                            channelId: 'operations'
                        })
                    });
                    console.log(`Push notification sent to driver ${driverId}`);
                }
            } catch (pushErr) {
                console.error('Push notification error (non-fatal):', pushErr.message);
            }
        }

        res.json({ success: true, data: updated });
    } catch (error) {
        console.error('Update booking patch error:', error);
        res.status(500).json({ success: false, error: 'Rezervasyon güncellenemedi' });
    }
});

/**
 * POST /api/transfer/bookings/admin
 * Create new manual booking from Call Center (Admin)
 */
router.post('/bookings/admin', authMiddleware, async (req, res) => {
    try {
        const { passengerName, passengerPhone, passengerEmail, pickup, dropoff, pickupDateTime, vehicleType, flightNumber, price, notes, adults, children, infants } = req.body;

        const tenantId = req.tenant?.id;
        if (!tenantId) return res.status(500).json({ success: false, error: 'Tenant context missing' });

        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const randomSuffix = Math.floor(1000 + Math.random() * 9000);
        const bookingNumber = `TR-${dateStr}-${randomSuffix}`;

        // Detect region codes from hub keywords
        const hubs = await loadTenantHubs(tenantId);
        const pickupRegionCode = detectRegionCode(pickup, hubs);
        const dropoffRegionCode = detectRegionCode(dropoff, hubs);

        const metadata = {
            pickup,
            dropoff,
            flightNumber,
            vehicleType,
            passengerName,
            creationSource: 'ADMIN_MANUAL',
            pickupRegionCode: pickupRegionCode || null,
            dropoffRegionCode: dropoffRegionCode || null
        };

        const booking = await prisma.booking.create({
            data: {
                tenantId: tenantId,
                bookingNumber: bookingNumber,
                productType: 'TRANSFER',
                status: 'CONFIRMED', 
                paymentStatus: 'PENDING',
                startDate: new Date(pickupDateTime),
                endDate: new Date(pickupDateTime),
                currency: 'TRY',
                total: Number(price || 0),
                subtotal: Number(price || 0),
                contactName: passengerName || 'Misafir',
                contactEmail: passengerEmail || '',
                contactPhone: passengerPhone || '',
                adults: Number(adults || 1),
                children: Number(children || 0),
                infants: Number(infants || 0),
                specialRequests: notes || '',
                metadata: metadata,
            }
        });

        const io = req.app.get('io');
        if (io) {
            io.to('admin_monitoring').emit('new_booking', booking);
        }

        // Send voucher email (async, don't block response)
        if (booking.contactEmail) {
            try {
                const { sendBookingVoucher } = require('../lib/emailService');
                sendBookingVoucher(tenantId, booking).catch(err => {
                    console.error('[EMAIL] Voucher send failed (background):', err.message);
                });
            } catch (emailErr) {
                console.error('[EMAIL] Voucher setup failed:', emailErr.message);
            }
        }

        // Send WhatsApp voucher (async, don't block response)
        if (booking.contactPhone) {
            try {
                const { sendBookingWhatsApp } = require('../lib/whatsappService');
                sendBookingWhatsApp(tenantId, booking).catch(err => {
                    console.error('[WHATSAPP] Voucher send failed (background):', err.message);
                });
            } catch (waErr) {
                console.error('[WHATSAPP] Voucher setup failed:', waErr.message);
            }
        }

        res.json({ success: true, data: booking });
    } catch (error) {
        console.error('Create booking admin error:', error);
        res.status(500).json({ success: false, error: 'Rezervasyon oluşturulamadı' });
    }
});

/**
 * PUT /api/transfer/bookings/admin/:id
 * Update booking details (Admin Call Center)
 */
router.put('/bookings/admin/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { passengerName, passengerPhone, pickup, dropoff, pickupDateTime, vehicleType, flightNumber, price, notes, adults, children, infants } = req.body;

        const currentBooking = await prisma.booking.findUnique({ where: { id: id } });
        if (!currentBooking) {
            return res.status(404).json({ success: false, error: 'Rezervasyon bulunamadı' });
        }

        // Capture previous state for audit trail
        req._auditPreviousState = {
            contactName: currentBooking.contactName,
            contactPhone: currentBooking.contactPhone,
            total: currentBooking.total,
            subtotal: currentBooking.subtotal,
            adults: currentBooking.adults,
            children: currentBooking.children,
            infants: currentBooking.infants,
            startDate: currentBooking.startDate,
            pickup: currentBooking.metadata?.pickup,
            dropoff: currentBooking.metadata?.dropoff,
            flightNumber: currentBooking.metadata?.flightNumber,
            vehicleType: currentBooking.metadata?.vehicleType,
            price: Number(currentBooking.total || 0)
        };

        let newMetadata = currentBooking.metadata || {};
        if (pickup !== undefined) newMetadata.pickup = pickup;
        if (dropoff !== undefined) newMetadata.dropoff = dropoff;
        if (flightNumber !== undefined) newMetadata.flightNumber = flightNumber;
        if (vehicleType !== undefined) newMetadata.vehicleType = vehicleType;
        if (passengerName !== undefined) newMetadata.passengerName = passengerName;

        const updateData = {
            metadata: newMetadata
        };
        
        if (passengerName !== undefined) updateData.contactName = passengerName;
        if (passengerPhone !== undefined) updateData.contactPhone = passengerPhone;
        if (pickupDateTime !== undefined) {
            updateData.startDate = new Date(pickupDateTime);
            updateData.endDate = new Date(pickupDateTime);
        }
        if (price !== undefined) {
            updateData.total = Number(price);
            updateData.subtotal = Number(price);
        }
        if (notes !== undefined) updateData.specialRequests = notes;
        if (adults !== undefined) updateData.adults = Number(adults);
        if (children !== undefined) updateData.children = Number(children);
        if (infants !== undefined) updateData.infants = Number(infants);

        const updated = await prisma.booking.update({
            where: { id: id },
            data: updateData
        });

        res.json({ success: true, data: updated, message: 'Rezervasyon güncellendi' });
    } catch (error) {
        console.error('Update booking admin error:', error);
        res.status(500).json({ success: false, error: 'Güncelleme başarısız oldu' });
    }
});

/**
 * PUT /api/transfer/bookings/:id/status
 * Update booking status (Admin) - In Database
 */
router.put('/bookings/:id/status', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { status, subStatus, collectedAmount, poolPrice } = req.body;

        // Fetch current booking first to preserve metadata
        const currentBooking = await prisma.booking.findUnique({
            where: { id: id }
        });

        if (!currentBooking) {
            return res.status(404).json({
                success: false,
                error: 'Rezervasyon bulunamadı'
            });
        }

        // Capture previous state for audit trail
        req._auditPreviousState = {
            status: currentBooking.status,
            operationalStatus: currentBooking.metadata?.operationalStatus,
            poolPrice: currentBooking.metadata?.poolPrice,
            price: Number(currentBooking.total || 0),
            collectedAmount: currentBooking.metadata?.collectedAmount,
            contactName: currentBooking.contactName
        };

        // Prepare metadata update
        let newMetadata = currentBooking.metadata || {};
        if (subStatus) {
            newMetadata = { ...newMetadata, operationalStatus: subStatus };
        }
        if (poolPrice !== undefined) {
            newMetadata = { ...newMetadata, poolPrice: Number(poolPrice) };
        }

        let updatedBooking;

        await prisma.$transaction(async (tx) => {
            let paymentStatusUpdate = {};

            // Partner/Driver Reconciliation Logic
            if (status === 'COMPLETED' && currentBooking.status !== 'COMPLETED' && currentBooking.confirmedBy) {
                const confirmedByUser = await tx.user.findUnique({
                    where: { id: currentBooking.confirmedBy },
                    include: { role: true }
                });

                if (confirmedByUser && confirmedByUser.role?.type === 'PARTNER') {
                    // Fetch tenant settings to get current commission rate
                    const tenant = await tx.tenant.findUnique({
                        where: { id: req.tenant.id },
                        select: { settings: true }
                    });
                    
                    const settings = tenant?.settings || {};
                    const commissionRate = settings.partnerCommissionRate !== undefined ? Number(settings.partnerCommissionRate) : 0;
                    
                    const partnerGross = newMetadata.poolPrice !== undefined ? Number(newMetadata.poolPrice) : Number(currentBooking.total || 0);
                    const commissionAmount = (partnerGross * commissionRate) / 100;
                    const partnerNetEarning = partnerGross - commissionAmount;

                    // Snapshot to metadata
                    newMetadata = {
                        ...newMetadata,
                        partnerCommissionRate: commissionRate,
                        partnerCommissionAmount: commissionAmount,
                        partnerNetEarning: partnerNetEarning
                    };

                    if (partnerNetEarning > 0) {
                        // Partner's balance increases (System owes Partner)
                        await tx.user.update({
                            where: { id: confirmedByUser.id },
                            data: {
                                balance: { increment: partnerNetEarning },
                                credit: { increment: partnerNetEarning }
                            }
                        });

                        await tx.transaction.create({
                            data: {
                                tenantId: req.tenant.id,
                                accountId: `partner-${confirmedByUser.id}`,
                                type: 'MANUAL_IN', 
                                amount: partnerNetEarning,
                                isCredit: true, 
                                description: `Transfer Hakedişi (PNR: ${currentBooking.bookingNumber}) (Komisyon: %${commissionRate})`,
                                date: new Date(),
                                referenceId: currentBooking.id
                            }
                        });
                    }
                }
            }

            // Agency Reconciliation Logic
            if (status === 'COMPLETED' && currentBooking.agencyId && newMetadata.paymentMethod === 'PAY_IN_VEHICLE' && currentBooking.paymentStatus !== 'PAID') {
                const b2bCost = Number(currentBooking.subtotal || 0);
                const collected = collectedAmount !== undefined ? Number(collectedAmount) : Number(currentBooking.total || 0);
                const agencyProfit = collected - b2bCost;

                paymentStatusUpdate = { paymentStatus: 'PAID' };

                if (agencyProfit !== 0) {
                    await tx.agency.update({
                        where: { id: currentBooking.agencyId },
                        data: {
                            balance: { increment: agencyProfit },
                            credit: { increment: agencyProfit > 0 ? agencyProfit : 0 },
                            debit: { increment: agencyProfit < 0 ? Math.abs(agencyProfit) : 0 }
                        }
                    });

                    await tx.transaction.create({
                        data: {
                            tenantId: req.tenant.id,
                            accountId: `agency-${currentBooking.agencyId}`,
                            type: agencyProfit > 0 ? 'MANUAL_IN' : 'MANUAL_OUT',
                            amount: Math.abs(agencyProfit),
                            isCredit: agencyProfit > 0,
                            description: `Araçta Nakit Tahsilat Farkı (PNR: ${currentBooking.bookingNumber})`,
                            date: new Date(),
                            referenceId: currentBooking.id
                        }
                    });
                }
            }

            updatedBooking = await tx.booking.update({
                where: { id: id },
                data: {
                    status: status,
                    ...paymentStatusUpdate,
                    metadata: newMetadata,
                    // If confirmed, set confirmedAt
                    ...(status === 'CONFIRMED' ? { confirmedAt: new Date(), confirmedBy: req.user?.id } : {}),
                    // If cancelled, set cancelledAt
                    ...(status === 'CANCELLED' ? { cancelledAt: new Date(), cancelledBy: req.user?.id } : {})
                }
            });

            // Custom Auditing for Cancellations
            if (status === 'CANCELLED') {
                const { logActivity } = require('../utils/logger');
                const guestName = currentBooking.fullName || currentBooking.metadata?.passengerName || 'Misafir';
                const logMsg = `${guestName} isimli kişinin ${currentBooking.bookingNumber || id} numaralı rezervasyonu iptal edildi.`;
                
                await logActivity({
                    tenantId: req.tenant.id,
                    userId: req.user?.id,
                    userEmail: req.user?.email,
                    action: 'CANCEL_BOOKING',
                    entityType: 'Booking',
                    entityId: id,
                    details: { 
                        message: logMsg,
                        previousState: currentBooking 
                    },
                    ipAddress: req.headers['x-forwarded-for'] || req.socket?.remoteAddress
                });
            }
        });

        res.json({
            success: true,
            data: updatedBooking,
            message: 'Rezervasyon durumu güncellendi'
        });

    } catch (error) {
        console.error('Update booking status error:', error);

        if (error.code === 'P2025') {
            return res.status(404).json({
                success: false,
                error: 'Rezervasyon bulunamadı'
            });
        }

        res.status(500).json({
            success: false,
            error: 'Güncelleme başarısız oldu'
        });
    }
});

/**
 * GET /api/transfer/popular-routes
 * Get popular transfer routes
 */
router.get('/popular-routes', async (req, res) => {
    // Keep this mocked or fetch from DB aggregation in future
    const popularRoutes = [
        {
            id: 1,
            from: 'İstanbul Havalimanı',
            to: 'Taksim',
            estimatedPrice: 1200,
            estimatedTime: '45 dk',
            image: '/routes/istanbul-airport.jpg'
        },
        {
            id: 2,
            from: 'Sabiha Gökçen Havalimanı',
            to: 'Kadıköy',
            estimatedPrice: 900,
            estimatedTime: '40 dk',
            image: '/routes/sabiha-gokcen.jpg'
        },
        {
            id: 3,
            from: 'Antalya Havalimanı',
            to: 'Lara',
            estimatedPrice: 800,
            estimatedTime: '30 dk',
            image: '/routes/antalya-airport.jpg'
        },
        {
            id: 4,
            from: 'İzmir Adnan Menderes',
            to: 'Alsancak',
            estimatedPrice: 600,
            estimatedTime: '35 dk',
            image: '/routes/izmir-airport.jpg'
        },
    ];

    res.json({
        success: true,
        data: popularRoutes
    });
});

module.exports = router;
