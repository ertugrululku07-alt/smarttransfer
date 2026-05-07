// src/routes/transfer.js
// Transfer module routes with Prisma Persistence

const express = require('express');

const { authMiddleware, optionalAuthMiddleware } = require('../middleware/auth');
const turf = require('@turf/turf');
const flexpolyline = require('@here/flexpolyline');

const bcrypt = require('bcryptjs');
const router = express.Router();
const prisma = require('../lib/prisma');
const { detectRegionCodeByPolygon: detectRegionCodeByPolygonShared } = require('../utils/zoneDetection');

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
 * Detect zone code by checking if coordinates fall inside zone polygons.
 * Returns the most specific (smallest area) zone. Falls back to keyword detection.
 * @param {number|null} lat - Latitude
 * @param {number|null} lng - Longitude
 * @param {string} locationText - Address text (fallback for keyword detection)
 * @param {Array} zones - Zone records with polygon, code, name, keywords fields
 * @param {Array} hubs - Hub list for keyword fallback
 * @returns {string|null} - Zone code
 */
function detectRegionCodeByPolygon(lat, lng, locationText, zones, hubs) {
    // Try polygon-based detection first
    if (lat && lng && zones && zones.length > 0) {
        let bestCode = null;
        let smallestArea = Infinity;
        const point = turf.point([Number(lng), Number(lat)]);
        for (const zone of zones) {
            if (!zone.polygon || !Array.isArray(zone.polygon) || zone.polygon.length < 3) continue;
            if (!zone.code) continue;
            try {
                let polyCoords = zone.polygon.map(p => [p.lng, p.lat]);
                // Close polygon if not closed
                if (polyCoords[0][0] !== polyCoords[polyCoords.length - 1][0] ||
                    polyCoords[0][1] !== polyCoords[polyCoords.length - 1][1]) {
                    polyCoords.push(polyCoords[0]);
                }
                const poly = turf.polygon([polyCoords]);
                if (turf.booleanPointInPolygon(point, poly)) {
                    const area = turf.area(poly);
                    // Pick the smallest polygon (most specific zone)
                    if (area < smallestArea) {
                        smallestArea = area;
                        bestCode = zone.code;
                    }
                }
            } catch (e) { /* skip invalid polygon */ }
        }
        if (bestCode) return bestCode;
    }
    // Fallback: keyword-based detection
    return detectRegionCode(locationText, hubs);
}

/**
 * Determine trip type based on pickup and dropoff locations
 * @param {string} pickup - Pickup location
 * @param {string} dropoff - Dropoff location
 * @returns {string} - 'DEP' | 'ARV' | 'ARA'
 */
function getTripType(pickup, dropoff, airportZones = null) {
    const pickupStr = String(pickup || '').toLocaleLowerCase('tr');
    const dropoffStr = String(dropoff || '').toLocaleLowerCase('tr');
    
    // Generic airport words (works for any language/country)
    const genericAirportWords = ['havalimanı', 'havalimani', 'havaalanı', 'havaalani', 'airport'];
    
    let isPickupAirport = genericAirportWords.some(kw => pickupStr.includes(kw));
    let isDropoffAirport = genericAirportWords.some(kw => dropoffStr.includes(kw));
    
    // Check airport zone IATA codes from DB (word-boundary match)
    if (airportZones && airportZones.length > 0) {
        const codes = airportZones.map(az => (az.code || '').toLowerCase()).filter(c => c);
        if (codes.length > 0) {
            const iataPattern = new RegExp(`\\b(${codes.join('|')})\\b`, 'i');
            if (!isPickupAirport) isPickupAirport = iataPattern.test(pickupStr);
            if (!isDropoffAirport) isDropoffAirport = iataPattern.test(dropoffStr);
        }
    }
    
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
        { code: 'AYT', keywords: 'ayt, antalya havalimanı, antalya airport', name: 'Antalya Havalimanı', isAirport: true },
        { code: 'GZP', keywords: 'gzp, gazipasa, gazipaşa', name: 'Gazipaşa Havalimanı', isAirport: true },
    ];

    if (!tenantId) return [...defaultHubs];
    try {
        const zonesWithCode = await prisma.zone.findMany({
            where: { tenantId, code: { not: null } },
            select: { code: true, keywords: true, name: true, isAirport: true }
        });
        
        // If DB has zones, use them as primary source (no hardcoded defaults)
        let finalHubs = [];
        if (zonesWithCode.length > 0) {
            finalHubs = zonesWithCode.map(z => ({
                code: z.code, keywords: z.keywords || '', name: z.name, isAirport: z.isAirport || false
            }));
        } else {
            finalHubs = [...defaultHubs]; // Fallback only when DB is empty
        }
        
        const tenantInfo = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } });
        if (tenantInfo?.settings?.hubs && Array.isArray(tenantInfo.settings.hubs)) {
            tenantInfo.settings.hubs.forEach(h => {
                if (!finalHubs.some(fh => fh.code === h.code)) finalHubs.push(h);
            });
        }
        return finalHubs;
    } catch (e) {
        console.error("Failed to fetch tenant hubs", e);
        return [...defaultHubs];
    }
}

/**
 * POST /api/transfer/search
 * Search available transfers (Mock algorithm, real future impl would use Google Distance Matrix)
 */
router.post('/search', optionalAuthMiddleware, async (req, res) => {
    console.log(`[SearchHit] /api/transfer/search called at ${new Date().toISOString()}, pickup="${req.body.pickup}", dropoff="${req.body.dropoff}"`);
    // ── Custom price rounding: round kuruş to nearest quarter ──
    // 0-24 → .00, 25-50 → .50, 51-75 → .75, 76-99 → next .00
    const roundPrice = (price) => {
        const whole = Math.floor(price);
        const kurus = Math.round((price - whole) * 100);
        if (kurus <= 24) return whole;
        if (kurus <= 50) return whole + 0.50;
        if (kurus <= 75) return whole + 0.75;
        return whole + 1;
    };

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

        // ── INDEPENDENT POINT-IN-POLYGON (no polyline required) ──
        // Ensures zone detection works even without encoded polyline or when 
        // route polyline doesn't physically cross zone polygons
        if (activeTenantId && zones.length > 0 && (pickupLat || dropoffLat)) {
            if (!req.zoneOverages) req.zoneOverages = {};
            if (!req.pickupZoneIds) req.pickupZoneIds = new Set();

            // Pickup point in polygon
            if (pickupLat && pickupLng) {
                try {
                    const pickupPoint = turf.point([Number(pickupLng), Number(pickupLat)]);
                    for (const zone of zones) {
                        if (!zone.polygon || zone.polygon.length < 3) continue;
                        if (req.pickupZoneIds.has(zone.id)) continue;
                        let polyCoords = zone.polygon.map(p => [p.lng, p.lat]);
                        if (polyCoords[0][0] !== polyCoords[polyCoords.length - 1][0] ||
                            polyCoords[0][1] !== polyCoords[polyCoords.length - 1][1]) {
                            polyCoords.push(polyCoords[0]);
                        }
                        try {
                            const zonePolygon = turf.polygon([polyCoords]);
                            if (turf.booleanPointInPolygon(pickupPoint, zonePolygon)) {
                                const area = turf.area(zonePolygon);
                                if (!req.zoneOverages[zone.id]) {
                                    req.zoneOverages[zone.id] = { overage: 0, area, zoneName: zone.name || '', zoneCode: zone.code || '' };
                                }
                                req.pickupZoneIds.add(zone.id);
                                console.log(`[IndependentPIP] Pickup inside zone "${zone.name}" (${zone.code})`);
                            }
                        } catch (e) { /* skip invalid polygon */ }
                    }
                } catch (e) {
                    console.error("Independent pickup point-in-polygon error:", e);
                }
            }

            // Dropoff point in polygon
            if (dropoffLat && dropoffLng) {
                try {
                    const dropoffPoint = turf.point([Number(dropoffLng), Number(dropoffLat)]);
                    for (const zone of zones) {
                        if (!zone.polygon || zone.polygon.length < 3) continue;
                        if (req.zoneOverages[zone.id] && req.zoneOverages[zone.id].overage === 0) continue;
                        let polyCoords = zone.polygon.map(p => [p.lng, p.lat]);
                        if (polyCoords[0][0] !== polyCoords[polyCoords.length - 1][0] ||
                            polyCoords[0][1] !== polyCoords[polyCoords.length - 1][1]) {
                            polyCoords.push(polyCoords[0]);
                        }
                        try {
                            const zonePolygon = turf.polygon([polyCoords]);
                            if (turf.booleanPointInPolygon(dropoffPoint, zonePolygon)) {
                                const area = turf.area(zonePolygon);
                                if (!req.zoneOverages[zone.id]) {
                                    req.zoneOverages[zone.id] = {
                                        overage: 0, area, zoneName: zone.name || '', zoneCode: zone.code || '',
                                        distFromStart: null, distFromEnd: 0, hitStart: false, hitEnd: true
                                    };
                                }
                                console.log(`[IndependentPIP] Dropoff inside zone "${zone.name}" (${zone.code})`);
                            }
                        } catch (e) { /* skip invalid polygon */ }
                    }
                } catch (e) {
                    console.error("Independent dropoff point-in-polygon error:", e);
                }
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
                hubs = await loadTenantHubs(req.tenant.id);
                
                const tenantInfo = await prisma.tenant.findUnique({ where: { id: req.tenant.id }, select: { settings: true } });
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

        // ── PRIMARY: Polygon-based hub detection (most accurate, no ambiguity) ──
        // If pickup point is inside a zone polygon, that zone IS the base — period.
        if (req.pickupZoneIds && req.pickupZoneIds.size > 0 && req.zoneOverages) {
            let smallestPickupArea = Infinity;
            for (const zoneId of req.pickupZoneIds) {
                const zd = req.zoneOverages[zoneId];
                if (zd && zd.zoneCode && zd.area < smallestPickupArea) {
                    smallestPickupArea = zd.area;
                    detectedBaseLocation = zd.zoneCode;
                    originalPickupHubCode = zd.zoneCode;
                }
            }
            if (detectedBaseLocation) {
                console.log(`[HubDetect] Pickup hub from POLYGON: ${detectedBaseLocation} (area=${smallestPickupArea.toFixed(0)})`);
            }
        }

        // ── FALLBACK: Keyword-based hub detection (only when polygon didn't match) ──
        if (!detectedBaseLocation) {
            let bestPickupScore = 0;
            let bestPickupLength = 0;
            for (const hub of hubs) {
                const keys = hub.keywords ? hub.keywords.split(',').map(k => k.trim().toLowerCase()).filter(k => k) : [];
                keys.push(hub.code.toLowerCase());
                for (const k of keys) {
                    const isAirportHub = hub.isAirport === true;
                    const matchInPrimary = pickupPrimaryToken.includes(k);
                    const matchInFull = pickupTextRaw.includes(k);
                    if (matchInPrimary || matchInFull) {
                        if (isAirportHub && k.length > 4 && k !== hub.code.toLowerCase()) {
                            const genericAirportWords = ['havalimanı', 'havalimani', 'havaalanı', 'havaalani', 'airport'];
                            if (!genericAirportWords.some(aw => pickupTextRaw.includes(aw))) {
                                continue;
                            }
                        }
                        let score = 1;
                        if (isAirportHub) score = 4;
                        if (matchInPrimary) score += 2;
                        if (k === pickupPrimaryToken) score += 1;
                        const hubNameLower = hub.name ? hub.name.toLowerCase() : '';
                        if (hubNameLower && (pickupPrimaryToken.includes(hubNameLower) || hubNameLower.includes(pickupPrimaryToken))) {
                            score += 3;
                        }
                        if (score > bestPickupScore || (score === bestPickupScore && k.length > bestPickupLength)) {
                            detectedBaseLocation = hub.code;
                            originalPickupHubCode = hub.code;
                            bestPickupScore = score;
                            bestPickupLength = k.length;
                        }
                    }
                }
            }
            if (detectedBaseLocation) {
                console.log(`[HubDetect] Pickup hub from KEYWORD fallback: ${detectedBaseLocation} (score=${bestPickupScore})`);
            }
        }

        let detectedDropoffBase = null;
        let originalDropoffHubCode = null;
        const dropoffPrimaryToken = dropoff.toLowerCase().split(/[\/,]/)[0].trim();
        const dropoffTextRaw = dropoff.toLowerCase();

        // ── PRIMARY: Polygon-based dropoff detection ──
        if (req.zoneOverages) {
            let smallestDropoffArea = Infinity;
            // Find the zone the dropoff is inside (overage=0 and distFromEnd=0)
            for (const [zoneId, zd] of Object.entries(req.zoneOverages)) {
                if (!zd.zoneCode) continue;
                // Dropoff is inside this zone if it was added with overage=0 via dropoff point check
                const isDropoffInside = (zd.distFromEnd === 0 || zd.hitEnd) && !req.pickupZoneIds?.has(zoneId);
                if (isDropoffInside && zd.area < smallestDropoffArea) {
                    smallestDropoffArea = zd.area;
                    detectedDropoffBase = zd.zoneCode;
                    originalDropoffHubCode = zd.zoneCode;
                }
            }
            if (detectedDropoffBase) {
                console.log(`[HubDetect] Dropoff hub from POLYGON: ${detectedDropoffBase} (area=${smallestDropoffArea.toFixed(0)})`);
            }
        }

        // ── FALLBACK: Keyword-based dropoff detection ──
        if (!detectedDropoffBase) {
            let bestDropoffScore = 0;
            let bestDropoffMatchLength = 0;
            for (const hub of hubs) {
                const keys = hub.keywords ? hub.keywords.split(',').map(k => k.trim().toLowerCase()).filter(k => k) : [];
                keys.push(hub.code.toLowerCase());
                for (const k of keys) {
                    const isAirportHub = hub.isAirport === true;
                    const matchInPrimary = dropoffPrimaryToken.includes(k);
                    const matchInFull = dropoffTextRaw.includes(k);
                    if (matchInPrimary || matchInFull) {
                        if (isAirportHub && k.length > 4 && k !== hub.code.toLowerCase()) {
                            const genericAirportWords = ['havalimanı', 'havalimani', 'havaalanı', 'havaalani', 'airport'];
                            if (!genericAirportWords.some(aw => dropoffTextRaw.includes(aw))) {
                                continue;
                            }
                        }
                        let score = 1;
                        if (isAirportHub) score = 4;
                        if (matchInPrimary) score += 2;
                        if (k === dropoffPrimaryToken) score += 1;
                        const hubNameLower = hub.name ? hub.name.toLowerCase() : '';
                        if (hubNameLower && (dropoffPrimaryToken.includes(hubNameLower) || hubNameLower.includes(dropoffPrimaryToken))) {
                            score += 3;
                        }
                        if (score > bestDropoffScore || (score === bestDropoffScore && k.length > bestDropoffMatchLength)) {
                            detectedDropoffBase = hub.code;
                            originalDropoffHubCode = hub.code;
                            bestDropoffScore = score;
                            bestDropoffMatchLength = k.length;
                        }
                    }
                }
            }
            if (detectedDropoffBase) {
                console.log(`[HubDetect] Dropoff hub from KEYWORD fallback: ${detectedDropoffBase} (score=${bestDropoffScore})`);
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

        console.log(`[ShuttleDebug] Total shuttleRoutes found: ${shuttleRoutes.length}, pickup="${pickup}", dropoff="${dropoff}", pickupLat=${pickupLat}, pickupLng=${pickupLng}`);
        console.log(`[ShuttleDebug] pickupNorm="${pickupNorm}", pickupPrimaryToken="${pickupPrimaryToken}", originalPickupHubCode="${originalPickupHubCode}", originalDropoffHubCode="${originalDropoffHubCode}"`);

        // ── PRE-COMPUTE: which zones contain the pickup point? ──
        const pickupInsideZoneCodes = new Set(); // zone codes (uppercase)
        const pickupInsideZoneNames = new Set(); // zone names (lowercase trimmed)
        const userLat = req.body.pickupLat ? Number(req.body.pickupLat) : null;
        const userLng = req.body.pickupLng ? Number(req.body.pickupLng) : null;

        if (userLat && userLng && zones.length > 0) {
            const pickPt = turf.point([userLng, userLat]);
            for (const zone of zones) {
                if (!zone.polygon || (Array.isArray(zone.polygon) && zone.polygon.length < 3)) continue;
                try {
                    const zPoly = typeof zone.polygon === 'string' ? JSON.parse(zone.polygon) : zone.polygon;
                    if (!Array.isArray(zPoly) || zPoly.length < 3) continue;
                    let zCoords = zPoly.map(p => [p.lng, p.lat]);
                    if (zCoords[0][0] !== zCoords[zCoords.length - 1][0] || zCoords[0][1] !== zCoords[zCoords.length - 1][1]) {
                        zCoords.push([...zCoords[0]]);
                    }
                    const zPolygon = turf.polygon([zCoords]);
                    if (turf.booleanPointInPolygon(pickPt, zPolygon)) {
                        if (zone.code) pickupInsideZoneCodes.add(zone.code.toUpperCase());
                        if (zone.name) pickupInsideZoneNames.add(zone.name.toLowerCase().trim());
                        console.log(`[ShuttleZone] Pickup INSIDE zone "${zone.name}" (code=${zone.code})`);
                    }
                } catch (e) { /* skip invalid polygon */ }
            }
        }
        console.log(`[ShuttleZones] Pickup inside ${pickupInsideZoneCodes.size} zones: codes=[${[...pickupInsideZoneCodes]}], names=[${[...pickupInsideZoneNames]}]`);

        const matchingShuttles = shuttleRoutes.filter(route => {
          try {
            // 1. PICKUP Location Check — POLYGON ONLY
            let isPickupMatch = false;

            if (!userLat || !userLng) {
                return false;
            }

            const pt = turf.point([userLng, userLat]);

            // 1a. Check route's own pickupPolygon
            if (route.pickupPolygon) {
                try {
                    const polygon = typeof route.pickupPolygon === 'string'
                        ? JSON.parse(route.pickupPolygon) : route.pickupPolygon;
                    if (Array.isArray(polygon) && polygon.length > 2) {
                        let polyCoords = polygon.map(p => [p.lng, p.lat]);
                        if (polyCoords[0][0] !== polyCoords[polyCoords.length - 1][0] || polyCoords[0][1] !== polyCoords[polyCoords.length - 1][1]) {
                            polyCoords.push([...polyCoords[0]]);
                        }
                        const poly = turf.polygon([polyCoords]);
                        if (turf.booleanPointInPolygon(pt, poly)) {
                            isPickupMatch = true;
                        }
                    }
                } catch (err) {
                    console.error('[ShuttlePolygonError] Route pickupPolygon:', err.message);
                }
            }

            // 1b. Check if route's zone is one of the zones containing the pickup point
            if (!isPickupMatch) {
                const pHubCode = route.metadata?.fromHubCode;
                // Match by zone code (most reliable)
                if (pHubCode && pickupInsideZoneCodes.has(pHubCode.toUpperCase())) {
                    isPickupMatch = true;
                    console.log(`[ShuttlePickup] Route "${route.fromName}" matched via zone code ${pHubCode}`);
                }
                // Match by zone name: zone name must be at START of route name
                // "Manavgat" matches "Manavgat manavgat" but NOT "Kızılağaç Manavgat"
                if (!isPickupMatch) {
                    const rn = route.fromName.toLowerCase().trim();
                    for (const zn of pickupInsideZoneNames) {
                        if (rn === zn || rn.startsWith(zn + ' ') || rn.startsWith(zn + '/')) {
                            isPickupMatch = true;
                            console.log(`[ShuttlePickup] Route "${route.fromName}" matched via zone name "${zn}"`);
                            break;
                        }
                    }
                }
            }

            // 1c. For airport/hub origin routes (e.g. "Antalya Havalimanı→X"), match via hub code
            if (!isPickupMatch) {
                const fromNameLower = (route.fromName || '').toLowerCase();
                const isFromAirport = fromNameLower.includes('havalimanı') || fromNameLower.includes('havalimani') || fromNameLower.includes('airport');
                if (isFromAirport && originalPickupHubCode) {
                    const fromHubCode = route.metadata?.fromHubCode;
                    if (fromHubCode && fromHubCode === originalPickupHubCode) {
                        isPickupMatch = true;
                    }
                }
            }

            if (!isPickupMatch) {
                console.log(`[ShuttlePickupReject] "${route.fromName}→${route.toName}" — pickup not in any matching zone (hubCode=${route.metadata?.fromHubCode})`);
                return false;
            }
            console.log(`[ShuttlePickupPass] "${route.fromName}→${route.toName}" pickup matched`);

            // 2. DROPOFF Location Check (to → user's dropoff)
            let isDropoffMatch = false;

            const routeMeta = route.metadata || {};
            const routeToHubCode = routeMeta.toHubCode;
            // 2a. Try hub code match first
            if (routeToHubCode && originalDropoffHubCode && originalDropoffHubCode === routeToHubCode) {
                isDropoffMatch = true;
            }
            // 2b. Fallback: text matching + hub keyword matching (STRICT — primary token equality only).
            //     Loose `.includes()` previously made generic "Alanya" match every sub-zone route
            //     ("OBA ALANYA", "TOSMUR ALANYA", ...). We now require an exact match of the
            //     primary token (first comma/slash segment, normalized).
            if (!isDropoffMatch) {
                const routeTo = normalizeLocation(route.toName);
                const routeToPrimary = routeTo.split(/[\/,]/)[0].trim();
                isDropoffMatch = (routeToPrimary === dropoffPrimaryToken);
                if (!isDropoffMatch && originalDropoffHubCode) {
                    const dropoffHub = hubs.find(h => h.code === originalDropoffHubCode);
                    if (dropoffHub) {
                        // Compare each keyword against route's primary token using equality only.
                        const hubKeys = dropoffHub.keywords ? dropoffHub.keywords.split(',').map(k => k.trim().toLowerCase()).filter(k => k) : [];
                        hubKeys.push(dropoffHub.code.toLowerCase());
                        if (dropoffHub.name) hubKeys.push(dropoffHub.name.toLowerCase());
                        isDropoffMatch = hubKeys.some(k => k && (k === routeToPrimary || k === routeTo));
                    }
                }
            }

            if (isDropoffMatch) {
                console.log(`[ShuttleMatch] Dropoff MATCHED for route "${route.fromName}→${route.toName}" via ${routeToHubCode ? `hubCode(route=${routeToHubCode},dropoff=${originalDropoffHubCode})` : 'text/hub-keyword'}`);
            }
            // 2b. Zone Polygon matching for Dropoff (ADDITIVE only — never rejects)
            // Zone polygons define pricing boundaries, NOT shuttle service areas.
            if (!isDropoffMatch && dropoffLat && dropoffLng) {
                let dZone = null;
                const dHubCode = routeToHubCode;
                if (dHubCode) {
                    dZone = zones.find(z => z.code && z.code.toUpperCase() === dHubCode.toUpperCase());
                } else {
                    const rn = route.toName.toLowerCase();
                    dZone = zones.find(z => z.name.toLowerCase() === rn || (z.keywords && z.keywords.toLowerCase().includes(rn)));
                }

                if (dZone && dZone.polygon && dZone.polygon.length >= 3) {
                    try {
                        const dPoly = typeof dZone.polygon === 'string' ? JSON.parse(dZone.polygon) : dZone.polygon;
                        let dPolyCoords = dPoly.map(p => [p.lng, p.lat]);
                        if (dPolyCoords[0][0] !== dPolyCoords[dPolyCoords.length - 1][0] ||
                            dPolyCoords[0][1] !== dPolyCoords[dPolyCoords.length - 1][1]) {
                            dPolyCoords.push([...dPolyCoords[0]]);
                        }
                        const zonePoly = turf.polygon([dPolyCoords]);
                        const dropPt = turf.point([Number(dropoffLng), Number(dropoffLat)]);

                        if (turf.booleanPointInPolygon(dropPt, zonePoly)) {
                            isDropoffMatch = true;
                            console.log(`[ShuttleDropoff] Inside zone "${dZone.name}" polygon`);
                        } else {
                            // Tightened: previously a 3 km proximity allowance turned every adjacent
                            // sub-zone into a match (Oba/Tosmur/Cikcilli all sit within 3 km of central
                            // Alanya). Strict inside-polygon only — adjacency is no longer a match.
                            const boundary = turf.polygonToLine(zonePoly);
                            const distKm = turf.pointToLineDistance(dropPt, boundary, { units: 'kilometers' });
                            console.log(`[ShuttleDropoffNoMatch] Dropoff ${distKm.toFixed(1)}km from zone "${dZone.name}" polygon → outside (strict)`);
                        }
                    } catch (err) {
                        console.error('Shuttle dropoff zone polygon check error:', err.message);
                    }
                }
            }

            if (!isDropoffMatch) {
                console.log(`[ShuttleDropoffReject] route="${route.fromName}→${route.toName}" routeToHubCode=${routeToHubCode}, originalDropoffHubCode=${originalDropoffHubCode}, routeToName="${route.toName}", dropoffPrimaryToken="${dropoffPrimaryToken}"`);
                return false;
            }
            console.log(`[ShuttleDropoffPass] route="${route.fromName}→${route.toName}" PASSED dropoff check`);

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

            // TIME WINDOW CHECK (±2 hours) — TZ-safe parsing
            // Frontend may send either:
            //   (a) full UTC ISO ("2026-04-29T09:00:00.000Z")  — admin wizard via dayjs.toISOString()
            //   (b) naive Turkey-local string ("2026-04-29T12:00:00.000") — public search page
            // Treat any input lacking an explicit timezone marker as Turkey local time so we
            // never accidentally double-shift it by +3h (which previously turned 12:00 into 15:00).
            const dtStr = String(pickupDateTime || '');
            const hasExplicitTz = /Z$|[+-]\d{2}:?\d{2}$/.test(dtStr.trim());
            let userMin;
            if (!hasExplicitTz) {
                const m = dtStr.match(/T(\d{2}):(\d{2})/);
                if (m) {
                    userMin = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
                } else {
                    // Fallback for unexpected formats: original behavior
                    const sd = new Date(dtStr);
                    const tr = new Date(sd.getTime() + (3 * 60 * 60 * 1000));
                    userMin = tr.getUTCHours() * 60 + tr.getUTCMinutes();
                }
            } else {
                const searchDate = new Date(dtStr);
                const trSearchDate = new Date(searchDate.getTime() + (3 * 60 * 60 * 1000));
                userMin = trSearchDate.getUTCHours() * 60 + trSearchDate.getUTCMinutes();
            }
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
          } catch (filterErr) {
            console.error(`[ShuttleFilterError] Route "${route.fromName}→${route.toName}" (id:${route.id}) threw:`, filterErr.message);
            return false;
          }
        });

        console.log(`[ShuttleDebug] matchingShuttles count: ${matchingShuttles.length} (from ${shuttleRoutes.length} total)`);

        const shuttleResults = matchingShuttles.map(s => {
            const baseShuttlePrice = Number(s.pricePerSeat) * Number(passengers);
            
            // Apply overage price
            let totalShuttlePrice = baseShuttlePrice;

            const markedUpShuttlePrice = totalShuttlePrice * (1 + (agencyMarkup / 100));
            console.log(`[Shuttle] route=${s.fromName}→${s.toName}, basePricePerSeat=${s.pricePerSeat}, passengers=${passengers}, total=${markedUpShuttlePrice.toFixed(2)}`);

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
                price: roundPrice(markedUpShuttlePrice),
                basePrice: totalShuttlePrice, // Store original B2B cost including overage
                overageKm: 0,
                overageCharge: 0,
                currency: s.currency || tenantDefaultCurrency, // Use route's own currency
                features: ['Belirli Kalkış Saatleri', 'Ekonomik', 'Paylaşımlı Yolculuk', ...(hasWifi ? ['WiFi'] : [])],
                cancellationPolicy: '24 saat öncesine kadar ücretsiz iptal',
                estimatedDuration: 'Değişken', // Depends on stops
                image: vehicleImage,
                isShuttle: true,
                shuttleRouteName: `${s.fromName} → ${s.toName}`,
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
                        // We ONLY skip the zone if it is an actual Airport Hub (isAirport=true).
                        // If it's a regional hub (like ALY - Alanya), we MUST NOT skip it!
                        if (zoneData.zoneCode) {
                            const isAirportZone = hubs.some(h => h.code === zoneData.zoneCode && h.isAirport === true);
                            if (isAirportZone && (zoneData.zoneCode === originalPickupHubCode || zoneData.zoneCode === originalDropoffHubCode)) {
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
                            // Skip empty zone price records (fixedPrice=0 AND price=0 means not configured)
                            const cfgFixP = Number(candidateConfig.fixedPrice) || 0;
                            const cfgPriceP = Number(candidateConfig.price) || 0;
                            if (cfgFixP <= 0 && cfgPriceP <= 0) {
                                continue; // Not a real price — skip to next zone
                            }
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

                // ── KEYWORD FALLBACK: When polygon matching fails, try text-based zone matching ──
                // This handles zones without polygons or when pickup is outside all zone polygons
                if (!zonePriceConfig && (detectedBaseLocation || detectedDropoffBase)) {
                    const basesToCheck = [detectedDropoffBase, detectedBaseLocation].filter(Boolean);
                    const relevantPrices = (vt.zonePrices || []).filter(zp => basesToCheck.includes(zp.baseLocation));
                    
                    let bestKwScore = 0;
                    let bestKwPos = Infinity; // Earlier position = more specific
                    let bestKwConfig = null;
                    let bestKwZoneId = null;
                    
                    for (const zp of relevantPrices) {
                        const cfgFix = Number(zp.fixedPrice) || 0;
                        const cfgPrice = Number(zp.price) || 0;
                        if (cfgFix <= 0 && cfgPrice <= 0) continue;
                        
                        const zone = zones.find(z => z.id === zp.zoneId);
                        if (!zone) continue;
                        
                        const zName = (zone.name || '').toLowerCase().trim();
                        const zKeywords = (zone.keywords || '').split(',').map(k => k.trim().toLowerCase()).filter(k => k);
                        const allKeys = [...zKeywords, zName].filter(k => k && k.length >= 3);
                        
                        // Check if pickup or dropoff text contains zone keywords
                        let matchScore = 0;
                        let matchPos = Infinity;
                        for (const kw of allKeys) {
                            const posInPickup = pickupTextRaw.indexOf(kw);
                            const posInDropoff = dropoffTextRaw.indexOf(kw);
                            if (posInPickup >= 0 || posInDropoff >= 0) {
                                if (kw.length > matchScore) {
                                    matchScore = kw.length;
                                    matchPos = posInPickup >= 0 ? posInPickup : posInDropoff;
                                } else if (kw.length === matchScore) {
                                    const pos = posInPickup >= 0 ? posInPickup : posInDropoff;
                                    if (pos < matchPos) matchPos = pos;
                                }
                            }
                        }
                        
                        // Prefer: 1) highest score (longest keyword), 2) earliest position (more specific)
                        if (matchScore > bestKwScore || (matchScore === bestKwScore && matchPos < bestKwPos)) {
                            bestKwScore = matchScore;
                            bestKwPos = matchPos;
                            bestKwConfig = zp;
                            bestKwZoneId = zp.zoneId;
                        }
                    }
                    
                    if (bestKwConfig) {
                        zonePriceConfig = bestKwConfig;
                        finalMatchedZoneId = bestKwZoneId;
                        usedOverageDistanceKm = 0;
                        console.log(`[ZoneKeywordFallback] vt=${vt.name}: Matched zone "${zones.find(z=>z.id===bestKwZoneId)?.name}" via keyword (score=${bestKwScore}, pos=${bestKwPos}, base=${bestKwConfig.baseLocation})`);
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

                        // RULE 1: If the zone code matches a detected hub, always relevant
                        const pickupHubLower = (originalPickupHubCode || '').toLowerCase();
                        const dropoffHubLower = (originalDropoffHubCode || '').toLowerCase();
                        if (zoneCode && (zoneCode === pickupHubLower || zoneCode === dropoffHubLower)) {
                            isRelevant = true;
                        }

                        // RULE 2: If the pickup or dropoff point is INSIDE the zone polygon (overage=0),
                        // or the route polyline directly enters the zone (hitStart/hitEnd),
                        // the zone is always relevant — no text matching needed.
                        if (!isRelevant) {
                            const pickupInsideZone = req.pickupZoneIds && req.pickupZoneIds.has(finalMatchedZoneId);
                            const routeEntersZone = zoneData?.hitStart || zoneData?.hitEnd;
                            const dropoffInsideZone = zoneData?.overage === 0 || zoneData?.distFromEnd === 0;
                            if (pickupInsideZone || routeEntersZone || dropoffInsideZone) {
                                isRelevant = true;
                            }
                        }

                        // RULE 3: If within close proximity (< 20km overage), treat as relevant
                        // This prevents rejecting nearby bookings like "Mahmutlar" which is just outside "Alanya" polygon
                        if (!isRelevant && usedOverageDistanceKm <= 20) {
                            isRelevant = true;
                            console.log(`[ZoneRelevance] vt=${vt.name}: Within 20km proximity (${usedOverageDistanceKm.toFixed(1)}km), marking as relevant`);
                        }

                        // RULE 4: Text-based matching as last resort for more distant zones (> 20km)
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

                        // EXCEPTION: If dropoff is an airport hub and the matched zone is a broad
                        // parent region (e.g., "Alanya" for GZP destination), reject UNLESS
                        // there is an explicit price for that airport base configured.
                        if (isRelevant && originalDropoffHubCode) {
                            const dropoffIsAirport = hubs.some(h => h.code === originalDropoffHubCode && h.isAirport === true);
                            if (dropoffIsAirport && zonePriceConfig && zonePriceConfig.baseLocation !== originalDropoffHubCode) {
                                isRelevant = false;
                                console.log(`[ZoneRelevance] vt=${vt.name}: Zone "${zoneName}" rejected — price base (${zonePriceConfig.baseLocation}) != airport dropoff (${originalDropoffHubCode})`);
                            }
                        }
                        if (!isRelevant) {
                            console.log(`[ZoneRelevance] vt=${vt.name}: Zone "${zoneName}" rejected as irrelevant for pickup="${pickupPrimaryToken}" dropoff="${dropoffPrimaryToken}"`);
                            zonePriceConfig = null;
                            finalMatchedZoneId = null;
                        }
                    }
                }

                const typeMult = 1.0; // Inflation fix: Use 1.0 multiplier to show the individual leg price.

                console.log(`[PriceDecision] vt=${vt.name}, zonePriceConfig=${!!zonePriceConfig}, finalMatchedZoneId=${finalMatchedZoneId}, hasAnyZones=${hasAnyZones}, baseLocation=${detectedBaseLocation}, dropoffBase=${detectedDropoffBase}`);

                if (zonePriceConfig) {
                    const extraKmRate = Number(zonePriceConfig.extraKmPrice) || 0;
                    
                    // If destination is outside polygon (overage > 0) but no extraKmPrice is set,
                    // use the zone's fixedPrice/price directly (without overage fee).
                    // Only fall to km-based if zone has no valid price.
                    if (usedOverageDistanceKm > 0.5 && extraKmRate === 0) {
                        const fixP = Number(zonePriceConfig.fixedPrice) || 0;
                        const adultP = Number(zonePriceConfig.price) || 0;
                        if (fixP > 0 || adultP > 0) {
                            // Zone has a defined price → use it without overage fee
                            calculationMethod = 'ZONE_POLYGON';
                            let baseRouteCost = fixP > 0 ? fixP : adultP * (Number(passengers) || 1);
                            calculatedPrice = Math.round(baseRouteCost * typeMult);
                            console.log(`[PriceDecision] vt=${vt.name}: Zone price used (no extraKm, overage=${usedOverageDistanceKm.toFixed(1)}km ignored): ${calculatedPrice}`);
                        } else {
                            // Zone price is 0 — fall to distance-based
                            const meta = agencyContractMeta[vt.id];
                            const openingFee = meta?.openingFee ?? vt.metadata?.openingFee;
                            const pricePerKmField = meta?.basePricePerKm ?? vt.metadata?.basePricePerKm;
                            const hasDistanceFallback = (openingFee != null && Number(openingFee) > 0) ||
                                                         (pricePerKmField != null && Number(pricePerKmField) > 0);
                            if (hasDistanceFallback) {
                                const basePrice = openingFee ? Number(openingFee) : 0;
                                const pricePerKm = pricePerKmField ? Number(pricePerKmField) : 0;
                                const dist = distance ? Number(distance) : 50;
                                calculatedPrice = Math.round((basePrice + (dist * pricePerKm)) * typeMult);
                                calculationMethod = 'DISTANCE_BASE';
                                console.log(`[PriceDecision] vt=${vt.name}: Distance fallback: ${calculatedPrice} (${basePrice} + ${dist}km × ${pricePerKm})`);
                            } else {
                                calculationMethod = 'ZONE_POLYGON';
                                calculatedPrice = 0;
                                console.log(`[PriceDecision] vt=${vt.name}: No valid price and no fallback`);
                            }
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
                    finalPrice = roundPrice(baseContractValue * (1 + (agencyMarkup / 100)));
                    console.log(`[Trace] VT:${vt.name} CONTRACT price: ${finalPrice} (base: ${baseContractValue}, markup: ${agencyMarkup}%)`);
                } else {
                    // Standard pricing: apply agency markup on calculated price
                    finalPrice = roundPrice(calculatedPrice * (1 + (agencyMarkup / 100)));
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
        // Load zones with polygons for coordinate-based region detection
        const zonesForRegion = await prisma.zone.findMany({
            where: { tenantId, code: { not: null } },
            select: { id: true, code: true, name: true, keywords: true, polygon: true }
        });
        
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
            
            // Use polygon-based detection (coordinates from data or req.body)
            const pLat = data.pickupLat || req.body.pickupLat || req.body.outbound?.pickupLat;
            const pLng = data.pickupLng || req.body.pickupLng || req.body.outbound?.pickupLng;
            const dLat = data.dropoffLat || req.body.dropoffLat || req.body.outbound?.dropoffLat;
            const dLng = data.dropoffLng || req.body.dropoffLng || req.body.outbound?.dropoffLng;
            const pickupRegionCode = detectRegionCodeByPolygon(pLat, pLng, pickup, zonesForRegion, hubs);
            const dropoffRegionCode = detectRegionCodeByPolygon(dLat, dLng, dropoff, zonesForRegion, hubs);
            const airportZones = hubs.filter(h => h.isAirport);
            const tripType = getTripType(pickup, dropoff, airportZones);

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

                    // Booking Type & Creator
                    bookingType: (req.user?.role === 'ADMIN' || req.user?.role === 'SUPER_ADMIN' || req.user?.role === 'STAFF') ? 'SYSTEM' : 'DIRECT',
                    bookedByUserId: userId || null,
                    bookedByName: (req.user?.role === 'ADMIN' || req.user?.role === 'SUPER_ADMIN' || req.user?.role === 'STAFF')
                        ? ([req.user?.firstName, req.user?.lastName].filter(Boolean).join(' ') || req.user?.email || null)
                        : null,

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
                        pickupLat: pLat ? Number(pLat) : null,
                        pickupLng: pLng ? Number(pLng) : null,
                        dropoffLat: dLat ? Number(dLat) : null,
                        dropoffLng: dLng ? Number(dLng) : null,
                        tripLeg: tripLeg || 'OUTBOUND',
                        linkedBookingNumber: linkedBookingNumber,
                        tripType: tripType // Store trip type for shuttle grouping
                    }
                }
            });
        };
        
        // ── Coupon / Campaign Discount ──
        const couponCode = bookingData.couponCode || req.body.couponCode;
        let appliedDiscount = 0;
        let appliedCampaignId = null;

        if (couponCode) {
            try {
                const campaign = await prisma.campaign.findFirst({
                    where: { code: couponCode.toUpperCase(), tenantId, isActive: true }
                });
                if (campaign) {
                    const now = new Date();
                    const totalAmount = Number(bookingData.price || req.body.price || 0);
                    const withinDate = now >= campaign.startDate && now <= campaign.endDate;
                    const withinLimit = campaign.usageLimit === null || campaign.usedCount < campaign.usageLimit;
                    const meetsMin = !campaign.minOrderAmount || totalAmount >= Number(campaign.minOrderAmount);
                    const vehicleOk = campaign.vehicleTypes.length === 0 || campaign.vehicleTypes.includes(bookingData.vehicleType || req.body.vehicleType || '');

                    let userOk = true;
                    if (userId && campaign.usageLimitPerUser !== null) {
                        const userUsages = await prisma.campaignUsage.count({ where: { campaignId: campaign.id, userId } });
                        if (userUsages >= campaign.usageLimitPerUser) userOk = false;
                    }

                    if (withinDate && withinLimit && meetsMin && vehicleOk && userOk) {
                        if (campaign.discountType === 'PERCENTAGE') {
                            appliedDiscount = totalAmount * Number(campaign.discountValue) / 100;
                            if (campaign.maxDiscount && appliedDiscount > Number(campaign.maxDiscount)) {
                                appliedDiscount = Number(campaign.maxDiscount);
                            }
                        } else {
                            appliedDiscount = Number(campaign.discountValue);
                        }
                        appliedDiscount = Math.min(appliedDiscount, totalAmount);
                        appliedDiscount = Math.round(appliedDiscount * 100) / 100;
                        appliedCampaignId = campaign.id;
                    }
                }
            } catch (couponErr) {
                console.error('[Coupon] validation error (non-blocking):', couponErr);
            }
        }

        // Inject discount into booking data before creation
        const injectDiscount = (data) => {
            if (appliedDiscount > 0 && !data._discountApplied) {
                const origPrice = Number(data.price || 0);
                data.price = Math.round((origPrice - appliedDiscount) * 100) / 100;
                data._discountApplied = true;
                data._originalPrice = origPrice;
                data._couponDiscount = appliedDiscount;
                data._couponCode = couponCode?.toUpperCase();
            }
            return data;
        };

        // Create outbound booking
        const outboundData = injectDiscount(outbound || { ...req.body });
        let outboundBooking = await createBooking(outboundData);
        
        // Create return booking if round trip (no double-discount)
        let returnBooking = null;
        if (isRoundTripFormat && returnPayload) {
            returnBooking = await createBooking(returnPayload, outboundBooking.bookingNumber);
        }

        // Record coupon usage + update campaign counter
        if (appliedCampaignId && appliedDiscount > 0) {
            try {
                await prisma.campaignUsage.create({
                    data: {
                        campaignId: appliedCampaignId,
                        userId: userId || null,
                        bookingId: outboundBooking.id,
                        discount: appliedDiscount,
                    }
                });
                await prisma.campaign.update({
                    where: { id: appliedCampaignId },
                    data: { usedCount: { increment: 1 } }
                });
                // Store coupon info in booking metadata
                await prisma.booking.update({
                    where: { id: outboundBooking.id },
                    data: {
                        discount: appliedDiscount,
                        metadata: {
                            ...(outboundBooking.metadata || {}),
                            couponCode: couponCode?.toUpperCase(),
                            couponDiscount: appliedDiscount,
                            originalPrice: outboundData._originalPrice,
                        }
                    }
                });
            } catch (usageErr) {
                console.error('[Coupon] usage record error (non-blocking):', usageErr);
            }
        }

        // ── Loyalty Points Earn ──
        if (userId) {
            try {
                const tenantForLoyalty = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } });
                const loyaltySettings = tenantForLoyalty?.settings?.loyalty;
                if (loyaltySettings?.enabled) {
                    const pointsPerUnit = loyaltySettings.pointsPerUnit || 10;
                    const totalSpent = Number(outboundBooking.total) + (returnBooking ? Number(returnBooking.total) : 0);
                    const earnedPoints = Math.floor(totalSpent * pointsPerUnit);
                    if (earnedPoints > 0) {
                        await prisma.loyaltyTransaction.create({
                            data: {
                                tenantId,
                                userId,
                                type: 'EARN',
                                points: earnedPoints,
                                bookingId: outboundBooking.id,
                                description: `Rezervasyon #${outboundBooking.bookingNumber} - ${earnedPoints} puan kazanıldı`,
                            }
                        });
                    }
                }
            } catch (loyaltyErr) {
                console.error('[Loyalty] earn error (non-blocking):', loyaltyErr);
            }
        }

        // ── Server-side Auto-Approve ──
        // If the tenant has autoApproveMode enabled, push the freshly created booking
        // straight into Operation or Pool (CONFIRMED + metadata.operationalStatus) without
        // requiring an admin to open the Rezervasyonlar page.
        try {
            const tenantForAuto = await prisma.tenant.findUnique({
                where: { id: tenantId },
                select: { settings: true }
            });
            const mode = tenantForAuto?.settings?.operationSettings?.autoApproveMode;
            if (mode === 'operation' || mode === 'pool') {
                const subStatus = mode === 'operation' ? 'IN_OPERATION' : 'IN_POOL';
                const applyAutoApprove = async (b) => {
                    if (!b) return b;
                    const updated = await prisma.booking.update({
                        where: { id: b.id },
                        data: {
                            status: 'CONFIRMED',
                            metadata: { ...(b.metadata || {}), operationalStatus: subStatus }
                        }
                    });
                    return updated;
                };
                outboundBooking = await applyAutoApprove(outboundBooking);
                if (returnBooking) returnBooking = await applyAutoApprove(returnBooking);
                console.log(`[AutoApprove] tenant=${tenantId} mode=${mode} → ${outboundBooking.bookingNumber}${returnBooking ? ', ' + returnBooking.bookingNumber : ''}`);
            }
        } catch (autoErr) {
            console.error('[AutoApprove] failed (non-blocking):', autoErr);
        }

        const booking = outboundBooking; // For backward compatibility

        const io = req.app.get('io');
        if (io) {
            io.to('admin_monitoring').emit('new_booking', booking);
            if (returnBooking) {
                io.to('admin_monitoring').emit('new_booking', returnBooking);
            }
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
                agency: true,
                driver: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        phone: true,
                        avatar: true,
                    }
                }
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

        // 4. Collect all unique vehicle IDs from metadata and fetch vehicle details
        const vehicleIds = [...new Set(
            bookings.map(b => b.metadata?.assignedVehicleId || b.metadata?.vehicleId).filter(Boolean)
        )];
        const vehicleMap = {};
        if (vehicleIds.length > 0) {
            const vehicles = await prisma.vehicle.findMany({
                where: { id: { in: vehicleIds } },
                select: { id: true, plateNumber: true, brand: true, model: true, color: true },
            });
            vehicles.forEach(v => { vehicleMap[v.id] = v; });
        }

        // 5. Load zones for polygon-based region code recalculation
        const tenantIdForZones = req.user?.tenantId || bookings[0]?.tenantId;
        let zonesForListing = [];
        let hubsForListing = [];
        if (tenantIdForZones) {
            zonesForListing = await prisma.zone.findMany({
                where: { tenantId: tenantIdForZones, code: { not: null } },
                select: { id: true, code: true, name: true, keywords: true, polygon: true }
            });
            hubsForListing = await loadTenantHubs(tenantIdForZones);
        }

        // Map DB format to Frontend format
        const mappedBookings = bookings.map(b => {
            const vehId = b.metadata?.assignedVehicleId || b.metadata?.vehicleId || null;
            const vehicle = vehId ? vehicleMap[vehId] : null;
            // Recalculate region codes using polygon if coordinates available
            const m = b.metadata || {};
            const pLat = m.pickupLat || m.pickupCoordinates?.lat;
            const pLng = m.pickupLng || m.pickupCoordinates?.lng;
            const dLat = m.dropoffLat || m.dropoffCoordinates?.lat;
            const dLng = m.dropoffLng || m.dropoffCoordinates?.lng;
            const pickupRegionCode = (pLat && pLng)
                ? detectRegionCodeByPolygon(pLat, pLng, m.pickup || '', zonesForListing, hubsForListing)
                : (m.pickupRegionCode || null);
            const dropoffRegionCode = (dLat && dLng)
                ? detectRegionCodeByPolygon(dLat, dLng, m.dropoff || '', zonesForListing, hubsForListing)
                : (m.dropoffRegionCode || null);
            return {
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
            pickupRegionCode,
            dropoffRegionCode,
            operationalStatus: b.metadata?.operationalStatus, // Added for Op/Pool tracking
            returnReason: b.metadata?.returnReason || null, // Return to reservation reason
            returnedAt: b.metadata?.returnedAt || null,
            partnerName: b.confirmedBy ? (userMap[b.confirmedBy] || 'Bilinmiyor') : null, // Map Partner Name
            partnerRole: b.confirmedBy ? (roleMap[b.confirmedBy] || 'UNKNOWN') : null, // Map Partner Role
            driverId: b.metadata?.driverId || b.driverId || null, // Driver assignment
            assignedVehicleId: vehId, // Vehicle assignment
            vehicleId: vehId, // UI compatibility
            // Driver details from relation
            driverName: b.driver ? `${b.driver.firstName} ${b.driver.lastName}` : null,
            driverPhone: b.driver?.phone || null,
            // Vehicle details from lookup
            vehiclePlate: vehicle?.plateNumber || null,
            vehicleBrand: vehicle ? `${vehicle.brand} ${vehicle.model}` : null,
            vehicleColor: vehicle?.color || null,
            // Nested relations mapping expected by the frontend:
            customer: b.customer,
            customerId: b.customerId || null,
            agencyName: b.agency?.name || b.agency?.companyName || b.customer?.agency?.name || b.customer?.agency?.companyName || b.metadata?.agencyName || null,
            agencyId: b.agencyId || b.customer?.agency?.id || null,
            // Booking Type & Creator
            bookingType: b.bookingType || (b.agencyId ? 'B2B' : (b.metadata?.creationSource === 'ADMIN_MANUAL' ? 'SYSTEM' : 'DIRECT')),
            bookedByUserId: b.bookedByUserId || null,
            bookedByName: b.bookedByName || null,
            // Custom Codes
            customCodes: b.customCodes || {},
            // Fatura alanları
            wantsInvoice: b.metadata?.wantsInvoice || false,
            billingDetails: b.metadata?.billingDetails || null,
            metadata: b.metadata || {},
            // Pickup/Dropoff tracking timestamps
            pickedUpAt: b.pickedUpAt,
            droppedOffAt: b.droppedOffAt
            };
        });

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

        let poolBookings = bookings.filter(b => {
            const meta = b.metadata || {};
            return meta.operationalStatus === 'IN_POOL' || meta.operationalStatus === 'POOL';
        });

        // ── Partner vehicle capacity (tier) filtering ──
        // Tier rule: partner's largest vehicle capacity must be >= booking's required capacity.
        // A Mini Van partner can take Sedan jobs, but a Sedan partner cannot take Mini Van jobs.
        if (req.user?.roleType === 'PARTNER') {
            const tenantId = req.tenant?.id;
            const [partnerVehicles, allTypes] = await Promise.all([
                prisma.vehicle.findMany({
                    where: { tenantId, ownerId: req.user.id, status: 'ACTIVE' },
                    include: { vehicleType: true }
                }),
                prisma.vehicleType.findMany({
                    where: { tenantId },
                    select: { name: true, slug: true, capacity: true }
                })
            ]);

            if (partnerVehicles.length === 0) {
                // Partner has no vehicles → cannot serve any pool booking
                poolBookings = [];
            } else {
                const partnerMaxCapacity = Math.max(
                    0,
                    ...partnerVehicles.map(v => v.vehicleType?.capacity || 0)
                );

                // Lookup table: normalized vehicle type name/slug → capacity
                const typeCapByKey = {};
                allTypes.forEach(t => {
                    if (t.name) typeCapByKey[t.name.toLowerCase().trim()] = t.capacity;
                    if (t.slug) typeCapByKey[t.slug.toLowerCase().trim()] = t.capacity;
                });

                poolBookings = poolBookings.filter(b => {
                    const requestedKey = (b.metadata?.vehicleType || '').toLowerCase().trim();
                    let requiredCapacity = typeCapByKey[requestedKey];
                    if (requiredCapacity == null) {
                        // Fallback: use passenger headcount when vehicle type name is missing/unknown
                        requiredCapacity = (b.adults || 0) + (b.children || 0);
                    }
                    return partnerMaxCapacity >= requiredCapacity;
                });
            }
        }

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
                timeDate: b.startDate,
                note: b.specialRequests
            },
            flightNumber: b.metadata?.flightNumber,
            flightTime: b.metadata?.flightTime || null,
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
            status: b.metadata?.operationalStatus || 'POOL',
            poolRunKey: b.metadata?.poolRunKey || null,
            poolRunName: b.metadata?.poolRunName || null,
            poolDepartureTime: b.metadata?.poolDepartureTime || null
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

        // Recalculate region codes by polygon
        const bTenantId = booking.tenantId || req.user?.tenantId;
        let detailPickupRegion = booking.metadata?.pickupRegionCode || null;
        let detailDropoffRegion = booking.metadata?.dropoffRegionCode || null;
        if (bTenantId) {
            const bm = booking.metadata || {};
            const bpLat = bm.pickupLat || bm.pickupCoordinates?.lat;
            const bpLng = bm.pickupLng || bm.pickupCoordinates?.lng;
            const bdLat = bm.dropoffLat || bm.dropoffCoordinates?.lat;
            const bdLng = bm.dropoffLng || bm.dropoffCoordinates?.lng;
            if (bpLat || bdLat) {
                const zDetail = await prisma.zone.findMany({ where: { tenantId: bTenantId, code: { not: null } }, select: { id: true, code: true, name: true, keywords: true, polygon: true } });
                const hDetail = await loadTenantHubs(bTenantId);
                if (bpLat && bpLng) detailPickupRegion = detectRegionCodeByPolygon(bpLat, bpLng, bm.pickup || '', zDetail, hDetail);
                if (bdLat && bdLng) detailDropoffRegion = detectRegionCodeByPolygon(bdLat, bdLng, bm.dropoff || '', zDetail, hDetail);
            }
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
            pickupRegionCode: detailPickupRegion,
            dropoffRegionCode: detailDropoffRegion,
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
            operationalStatus: b.metadata?.operationalStatus,
            partnerVehicleId: b.metadata?.partnerVehicleId || null,
            partnerVehiclePlate: b.metadata?.partnerVehiclePlate || null,
            partnerVehicleName: b.metadata?.partnerVehicleName || null
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
            b.metadata?.operationalStatus === 'IN_POOL' || b.metadata?.operationalStatus === 'POOL'
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
 * GET /api/transfer/partner/my-vehicles
 * Get partner's vehicles with busy/available status
 */
router.get('/partner/my-vehicles', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        const tenantId = req.tenant?.id;

        // Get partner's vehicles
        const vehicles = await prisma.vehicle.findMany({
            where: { tenantId, ownerId: userId, status: 'ACTIVE' },
            include: { vehicleType: true },
            orderBy: { createdAt: 'asc' }
        });

        // Get active bookings for this partner
        const activeBookings = await prisma.booking.findMany({
            where: {
                productType: 'TRANSFER',
                status: 'CONFIRMED',
                confirmedBy: userId
            },
            select: { id: true, bookingNumber: true, metadata: true, startDate: true, contactName: true }
        });

        // Map vehicles with busy status
        const vehiclesWithStatus = vehicles.map(v => {
            const activeBooking = activeBookings.find(b =>
                b.metadata?.partnerVehicleId === v.id
            );
            return {
                id: v.id,
                plateNumber: v.plateNumber,
                brand: v.brand,
                model: v.model,
                name: `${v.brand} ${v.model}`,
                capacity: v.vehicleType?.capacity || 0,
                vehicleType: v.vehicleType?.category || 'SEDAN',
                isBusy: !!activeBooking,
                activeBooking: activeBooking ? {
                    id: activeBooking.id,
                    bookingNumber: activeBooking.bookingNumber,
                    customerName: activeBooking.contactName,
                    pickup: activeBooking.metadata?.pickup,
                    startDate: activeBooking.startDate
                } : null
            };
        });

        // Also find active bookings that don't have a vehicle assigned (legacy)
        const unassignedBookings = activeBookings.filter(b =>
            !b.metadata?.partnerVehicleId
        );

        const totalVehicles = vehiclesWithStatus.length;
        const busyVehicles = vehiclesWithStatus.filter(v => v.isBusy).length + unassignedBookings.length;
        const availableSlots = Math.max(0, totalVehicles - busyVehicles);

        res.json({
            success: true,
            data: {
                vehicles: vehiclesWithStatus,
                totalVehicles,
                busyVehicles,
                availableSlots,
                canAcceptMore: availableSlots > 0,
                unassignedActiveCount: unassignedBookings.length
            }
        });
    } catch (error) {
        console.error('Get partner vehicles error:', error);
        res.status(500).json({ success: false, error: 'Araçlar alınamadı' });
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
                contactName, contactEmail, contactPhone, pickupDateTime, pickupLocation, dropoffLocation,
                flightNumber, flightTime, adults, children, infants, price, status: newStatus, operationalStatus,
                notes,
                // Passenger details:
                passengerDetails,
                // Pool run fields:
                poolRunKey, poolRunName, poolDepartureTime,
                // Custom codes:
                customCodes } = req.body;
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

        // Prepare update data object early so it can be referenced in pool/status handlers
        const updateData = {};

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
        if (passengerDetails !== undefined) newMetadata.passengerDetails = passengerDetails;
        if (operationalStatus !== undefined) {
            newMetadata.operationalStatus = operationalStatus;
            if (operationalStatus === 'POOL' || operationalStatus === 'IN_POOL') {
                 updateData.driverId = null;
                 newMetadata.driverId = null;
                 newMetadata.assignedVehicleId = null;
                 // Store pool price if provided
                 if (price !== undefined) {
                     newMetadata.poolPrice = Number(price);
                 }
            }
        }
        if (poolRunKey !== undefined) newMetadata.poolRunKey = poolRunKey;
        if (poolRunName !== undefined) newMetadata.poolRunName = poolRunName;
        if (poolDepartureTime !== undefined) newMetadata.poolDepartureTime = poolDepartureTime;

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

        // Set metadata on updateData
        updateData.metadata = newMetadata;

        // Inline field updates
        if (contactName !== undefined) updateData.contactName = contactName;
        if (contactEmail !== undefined) updateData.contactEmail = contactEmail;
        if (contactPhone !== undefined) updateData.contactPhone = contactPhone;
        if (notes !== undefined) updateData.specialRequests = notes;
        if (pickupDateTime !== undefined) { updateData.startDate = new Date(pickupDateTime); updateData.endDate = new Date(pickupDateTime); }
        if (adults !== undefined) updateData.adults = Number(adults);
        if (children !== undefined) updateData.children = Number(children);
        if (infants !== undefined) updateData.infants = Number(infants);
        if (price !== undefined) { updateData.total = Number(price); updateData.subtotal = Number(price); }
        if (newStatus !== undefined) updateData.status = newStatus;
        if (customCodes !== undefined) updateData.customCodes = customCodes;
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

        // Emit socket events for driver changes
        const io = req.app.get('io');
        const previousDriverId = req._auditPreviousState?.driverId;
        const newDriverId = updated.driverId;

        if (io) {
            // If the driver changed from A to B, or was unassigned from A
            if (previousDriverId && previousDriverId !== newDriverId) {
                console.log(`[Socket] Emitting operation_unassigned to driver ${previousDriverId}`);
                io.to(`user_${previousDriverId}`).emit('operation_unassigned', {
                    bookingId: id
                });
            }

            // If a new driver was assigned, or we are specifically just pushing an update to the already assigned driver
            if (newDriverId && (driverId !== undefined || newDriverId !== previousDriverId)) {
                console.log(`[Socket] Emitting operation_assigned to driver ${newDriverId}`);
                io.to(`user_${newDriverId}`).emit('operation_assigned', {
                    bookingId: id,
                    bookingNumber: updated.bookingNumber,
                    pickup: updated.metadata?.pickup || 'Konum Belirtilmemiş',
                    start: updated.startDate
                });
            }
        }

        // Send Expo Push Notification (works when app is closed/background) only for new assignments
        if (newDriverId && newDriverId !== previousDriverId) {
            try {
                const driver = await prisma.user.findUnique({ where: { id: newDriverId } });
                console.log(`[Push] driverId=${newDriverId} found=${!!driver} pushToken=${driver?.pushToken}`);

                // If not found by userId, try finding via personnel
                let resolvedDriver = driver;
                if (!resolvedDriver) {
                    const personnel = await prisma.personnel.findFirst({ where: { id: newDriverId }, include: { user: true } });
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
                    console.log(`Push notification sent to driver ${newDriverId}`);
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
        const {
            passengerName, passengerPhone, passengerEmail,
            pickup, dropoff, pickupDateTime,
            vehicleType, flightNumber, price, notes,
            adults, children, infants,
            paymentMethod,
            pickupLat, pickupLng, dropoffLat, dropoffLng,
            distance, duration,
            isShuttle, shuttleRouteId, shuttleMasterTime,
            currency,
            passengerDetails,
            extraServices, extrasTotal, vehiclePrice
        } = req.body;

        const tenantId = req.tenant?.id;
        if (!tenantId) return res.status(500).json({ success: false, error: 'Tenant context missing' });

        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const randomSuffix = Math.floor(1000 + Math.random() * 9000);
        const bookingNumber = `TR-${dateStr}-${randomSuffix}`;

        // Detect region codes using polygon-based zone detection (with keyword fallback)
        const hubs = await loadTenantHubs(tenantId);
        const zonesForRegionAdmin = await prisma.zone.findMany({
            where: { tenantId, code: { not: null } },
            select: { id: true, code: true, name: true, keywords: true, polygon: true }
        });
        const pickupRegionCode = detectRegionCodeByPolygon(pickupLat, pickupLng, pickup, zonesForRegionAdmin, hubs);
        const dropoffRegionCode = detectRegionCodeByPolygon(dropoffLat, dropoffLng, dropoff, zonesForRegionAdmin, hubs);

        const metadata = {
            pickup,
            dropoff,
            flightNumber,
            vehicleType,
            passengerName,
            creationSource: 'ADMIN_MANUAL',
            pickupRegionCode: pickupRegionCode || null,
            dropoffRegionCode: dropoffRegionCode || null,
            paymentMethod: paymentMethod || 'PAY_IN_VEHICLE',
            pickupLat: pickupLat != null ? Number(pickupLat) : null,
            pickupLng: pickupLng != null ? Number(pickupLng) : null,
            dropoffLat: dropoffLat != null ? Number(dropoffLat) : null,
            dropoffLng: dropoffLng != null ? Number(dropoffLng) : null,
            distance: distance || null,
            duration: duration || null,
            isShuttle: !!isShuttle,
            shuttleRouteId: shuttleRouteId || null,
            shuttleMasterTime: shuttleMasterTime || null,
            passengerDetails: Array.isArray(passengerDetails) ? passengerDetails : [],
            extraServices: Array.isArray(extraServices) ? extraServices : [],
            extrasTotal: Number(extrasTotal || 0),
            vehiclePrice: vehiclePrice != null ? Number(vehiclePrice) : null,
            tripType: getTripType(pickup, dropoff, hubs.filter(h => h.isAirport))
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
                currency: currency || 'TRY',
                total: Number(price || 0),
                subtotal: Number(price || 0),
                contactName: passengerName || 'Misafir',
                contactEmail: passengerEmail || '',
                contactPhone: passengerPhone || '',
                adults: Number(adults || 1),
                children: Number(children || 0),
                infants: Number(infants || 0),
                specialRequests: notes || '',

                // Booking Type & Creator
                bookingType: 'SYSTEM',
                bookedByUserId: req.user?.id || null,
                bookedByName: req.user?.name || req.user?.email || 'Sistem',

                metadata: metadata,
            }
        });

        // ── Server-side Auto-Approve (Admin bookings) ──
        let finalBooking = booking;
        try {
            const tenantForAuto = await prisma.tenant.findUnique({
                where: { id: tenantId },
                select: { settings: true }
            });
            const mode = tenantForAuto?.settings?.operationSettings?.autoApproveMode;
            if (mode === 'operation' || mode === 'pool') {
                const subStatus = mode === 'operation' ? 'IN_OPERATION' : 'IN_POOL';
                finalBooking = await prisma.booking.update({
                    where: { id: booking.id },
                    data: {
                        status: 'CONFIRMED',
                        metadata: { ...(booking.metadata || {}), operationalStatus: subStatus }
                    }
                });
                console.log(`[AutoApprove-Admin] tenant=${tenantId} mode=${mode} → ${finalBooking.bookingNumber}`);
            }
        } catch (autoErr) {
            console.error('[AutoApprove-Admin] failed (non-blocking):', autoErr);
        }

        const io = req.app.get('io');
        if (io) {
            io.to('admin_monitoring').emit('new_booking', finalBooking);
        }

        // Send voucher email (async, don't block response)
        if (finalBooking.contactEmail) {
            try {
                const { sendBookingVoucher } = require('../lib/emailService');
                sendBookingVoucher(tenantId, finalBooking).catch(err => {
                    console.error('[EMAIL] Voucher send failed (background):', err.message);
                });
            } catch (emailErr) {
                console.error('[EMAIL] Voucher setup failed:', emailErr.message);
            }
        }

        // Send WhatsApp voucher (async, don't block response)
        if (finalBooking.contactPhone) {
            try {
                const { sendBookingWhatsApp } = require('../lib/whatsappService');
                sendBookingWhatsApp(tenantId, finalBooking).catch(err => {
                    console.error('[WHATSAPP] Voucher send failed (background):', err.message);
                });
            } catch (waErr) {
                console.error('[WHATSAPP] Voucher setup failed:', waErr.message);
            }
        }

        res.json({ success: true, data: finalBooking });
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
        const { status, subStatus, collectedAmount, poolPrice, partnerVehicleId } = req.body;

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

        // ── Partner vehicle capacity validation ──
        if (status === 'CONFIRMED' && req.user?.roleType === 'PARTNER') {
            const tenantId = req.tenant?.id;
            const userId = req.user.id;

            // Get partner's vehicles (with type for capacity)
            const partnerVehicles = await prisma.vehicle.findMany({
                where: { tenantId, ownerId: userId, status: 'ACTIVE' },
                include: { vehicleType: { select: { name: true, capacity: true } } }
            });

            if (partnerVehicles.length === 0) {
                return res.status(400).json({
                    success: false,
                    error: 'Kayıtlı aracınız yok. Önce Ayarlar > Araçlarım bölümünden araç ekleyin.'
                });
            }

            // ── Capacity tier guard: partner's largest vehicle must fit the booking ──
            const allTypesForCap = await prisma.vehicleType.findMany({
                where: { tenantId },
                select: { name: true, slug: true, capacity: true }
            });
            const typeCapByKey = {};
            allTypesForCap.forEach(t => {
                if (t.name) typeCapByKey[t.name.toLowerCase().trim()] = t.capacity;
                if (t.slug) typeCapByKey[t.slug.toLowerCase().trim()] = t.capacity;
            });
            const requestedKey = (currentBooking.metadata?.vehicleType || '').toLowerCase().trim();
            let requiredCapacity = typeCapByKey[requestedKey];
            if (requiredCapacity == null) {
                requiredCapacity = (currentBooking.adults || 0) + (currentBooking.children || 0);
            }
            const partnerMaxCapacity = Math.max(
                0,
                ...partnerVehicles.map(v => v.vehicleType?.capacity || 0)
            );
            if (partnerMaxCapacity < requiredCapacity) {
                return res.status(403).json({
                    success: false,
                    error: `Bu transfer ${requiredCapacity} kişilik araç gerektiriyor. Sizin en büyük aracınız ${partnerMaxCapacity} kişilik — kabul edemezsiniz.`
                });
            }

            // Get current active bookings for this partner
            const activeCount = await prisma.booking.count({
                where: {
                    productType: 'TRANSFER',
                    status: 'CONFIRMED',
                    confirmedBy: userId,
                    id: { not: id }
                }
            });

            if (activeCount >= partnerVehicles.length) {
                return res.status(400).json({
                    success: false,
                    error: `Tüm araçlarınız meşgul (${partnerVehicles.length} araç / ${activeCount} aktif transfer). Transfer tamamlanmadan yeni transfer kabul edemezsiniz.`
                });
            }

            // Validate selected vehicle
            if (partnerVehicleId) {
                const selectedVehicle = partnerVehicles.find(v => v.id === partnerVehicleId);
                if (!selectedVehicle) {
                    return res.status(400).json({
                        success: false,
                        error: 'Seçilen araç size ait değil.'
                    });
                }

                // Selected vehicle must also fit the booking's required capacity
                const selectedCapacity = selectedVehicle.vehicleType?.capacity || 0;
                if (selectedCapacity < requiredCapacity) {
                    return res.status(403).json({
                        success: false,
                        error: `Seçtiğiniz araç ${selectedCapacity} kişilik, bu transfer ${requiredCapacity} kişilik araç gerektiriyor. Daha büyük bir aracınızı seçin.`
                    });
                }

                // Check if selected vehicle is already busy
                const vehicleBusy = await prisma.booking.findFirst({
                    where: {
                        productType: 'TRANSFER',
                        status: 'CONFIRMED',
                        confirmedBy: userId,
                        id: { not: id }
                    },
                    select: { metadata: true, bookingNumber: true }
                });

                if (vehicleBusy && vehicleBusy.metadata?.partnerVehicleId === partnerVehicleId) {
                    return res.status(400).json({
                        success: false,
                        error: `Bu araç zaten ${vehicleBusy.bookingNumber} numaralı transferde kullanılıyor.`
                    });
                }
            } else if (partnerVehicles.length === 1) {
                // Auto-assign if only 1 vehicle
                req.body.partnerVehicleId = partnerVehicles[0].id;
            }
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

        // Store partner vehicle assignment
        const finalPartnerVehicleId = req.body.partnerVehicleId || partnerVehicleId;
        if (finalPartnerVehicleId && status === 'CONFIRMED') {
            const vehicle = await prisma.vehicle.findUnique({
                where: { id: finalPartnerVehicleId },
                select: { plateNumber: true, brand: true, model: true }
            });
            newMetadata = {
                ...newMetadata,
                partnerVehicleId: finalPartnerVehicleId,
                partnerVehiclePlate: vehicle?.plateNumber || '',
                partnerVehicleName: vehicle ? `${vehicle.brand} ${vehicle.model}` : ''
            };
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

        // ── COMPLETED ⇒ trigger rating WhatsApp (fire-and-forget) ──
        if (status === 'COMPLETED' && currentBooking.status !== 'COMPLETED' && updatedBooking?.contactPhone) {
            try {
                const { sendRatingRequestWhatsApp } = require('../lib/whatsappService');
                // Reload with driver info
                const fullBooking = await prisma.booking.findUnique({
                    where: { id },
                    include: { driver: { select: { fullName: true } } }
                });
                sendRatingRequestWhatsApp(req.tenant.id, fullBooking).catch(err => {
                    console.error('[RatingWA] background send failed:', err.message);
                });
            } catch (e) {
                console.warn('[RatingWA] hook setup failed:', e.message);
            }
        }

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

// ============================================================================
// PARTNER DRIVER MANAGEMENT
// ============================================================================

/**
 * GET /api/transfer/partner/my-drivers
 * List all drivers belonging to the logged-in partner
 */
router.get('/partner/my-drivers', authMiddleware, async (req, res) => {
    try {
        const partnerId = req.user.id;

        const drivers = await prisma.user.findMany({
            where: { partnerId, deletedAt: null },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                fullName: true,
                email: true,
                phone: true,
                avatar: true,
                status: true,
                lastSeenAt: true,
                lastLocationLat: true,
                lastLocationLng: true,
                lastLoginAt: true,
                pushToken: true,
                createdAt: true,
                bookingsAsDriver: {
                    where: {
                        productType: 'TRANSFER',
                        status: { in: ['CONFIRMED', 'IN_PROGRESS'] }
                    },
                    select: {
                        id: true,
                        bookingNumber: true,
                        contactName: true,
                        startDate: true,
                        metadata: true,
                        pickedUpAt: true,
                        droppedOffAt: true,
                    },
                    orderBy: { startDate: 'asc' },
                    take: 5,
                },
            },
            orderBy: { firstName: 'asc' },
        });

        const driversWithStatus = drivers.map(d => {
            const activeBooking = d.bookingsAsDriver.find(b => b.pickedUpAt && !b.droppedOffAt);
            const nextBooking = d.bookingsAsDriver[0] || null;
            const isOnline = d.lastSeenAt && (Date.now() - new Date(d.lastSeenAt).getTime()) < 10 * 60 * 1000;
            return {
                id: d.id,
                firstName: d.firstName,
                lastName: d.lastName,
                fullName: d.fullName,
                email: d.email,
                phone: d.phone,
                avatar: d.avatar,
                status: d.status,
                isOnline,
                lastSeenAt: d.lastSeenAt,
                lastLocation: d.lastLocationLat ? { lat: d.lastLocationLat, lng: d.lastLocationLng } : null,
                hasPushToken: !!d.pushToken,
                activeBookingsCount: d.bookingsAsDriver.length,
                activeBooking: activeBooking ? {
                    id: activeBooking.id,
                    bookingNumber: activeBooking.bookingNumber,
                    customerName: activeBooking.contactName,
                    pickedUpAt: activeBooking.pickedUpAt,
                } : null,
                nextBooking: nextBooking ? {
                    id: nextBooking.id,
                    bookingNumber: nextBooking.bookingNumber,
                    customerName: nextBooking.contactName,
                    startDate: nextBooking.startDate,
                    pickup: nextBooking.metadata?.pickup,
                } : null,
                createdAt: d.createdAt,
            };
        });

        res.json({ success: true, data: driversWithStatus });
    } catch (error) {
        console.error('Get partner drivers error:', error);
        res.status(500).json({ success: false, error: 'Şoförler alınamadı' });
    }
});

/**
 * POST /api/transfer/partner/drivers
 * Partner creates a new driver account under their team
 */
router.post('/partner/drivers', authMiddleware, async (req, res) => {
    try {
        const partnerId = req.user.id;
        const tenantId = req.tenant?.id || req.user.tenantId;
        const { firstName, lastName, email, phone, password } = req.body;

        if (!firstName || !lastName || !email || !password) {
            return res.status(400).json({ success: false, error: 'Ad, soyad, e-posta ve şifre zorunludur' });
        }

        // Check if email exists
        const existing = await prisma.user.findFirst({
            where: { tenantId, email: email.toLowerCase().trim() }
        });
        if (existing) {
            return res.status(400).json({ success: false, error: 'Bu e-posta adresi zaten kullanılıyor' });
        }

        // Find DRIVER role
        const driverRole = await prisma.role.findFirst({
            where: { tenantId, type: 'DRIVER' }
        });
        if (!driverRole) {
            return res.status(500).json({ success: false, error: 'DRIVER rolü bulunamadı' });
        }

        const passwordHash = await bcrypt.hash(password, 12);

        const driver = await prisma.user.create({
            data: {
                tenantId,
                firstName: firstName.trim(),
                lastName: lastName.trim(),
                fullName: `${firstName.trim()} ${lastName.trim()}`,
                email: email.toLowerCase().trim(),
                phone: phone?.trim() || null,
                passwordHash,
                roleId: driverRole.id,
                partnerId,
                status: 'ACTIVE',
                metadata: { createdByPartner: true, partnerCreatedAt: new Date().toISOString() },
            },
            select: {
                id: true, firstName: true, lastName: true, fullName: true,
                email: true, phone: true, status: true, createdAt: true,
            },
        });

        res.json({
            success: true,
            data: driver,
            message: `${driver.fullName} başarıyla eklendi`
        });
    } catch (error) {
        console.error('Create partner driver error:', error);
        res.status(500).json({ success: false, error: 'Şoför oluşturulamadı' });
    }
});

/**
 * PUT /api/transfer/partner/drivers/:driverId
 * Partner updates driver info
 */
router.put('/partner/drivers/:driverId', authMiddleware, async (req, res) => {
    try {
        const partnerId = req.user.id;
        const { driverId } = req.params;
        const { firstName, lastName, phone, password, status } = req.body;

        // Verify driver belongs to this partner
        const driver = await prisma.user.findFirst({
            where: { id: driverId, partnerId }
        });
        if (!driver) {
            return res.status(404).json({ success: false, error: 'Şoför bulunamadı' });
        }

        const updateData = {};
        if (firstName) { updateData.firstName = firstName.trim(); }
        if (lastName) { updateData.lastName = lastName.trim(); }
        if (firstName || lastName) {
            updateData.fullName = `${(firstName || driver.firstName).trim()} ${(lastName || driver.lastName).trim()}`;
        }
        if (phone !== undefined) { updateData.phone = phone?.trim() || null; }
        if (status) { updateData.status = status; }
        if (password) { updateData.passwordHash = await bcrypt.hash(password, 12); }

        const updated = await prisma.user.update({
            where: { id: driverId },
            data: updateData,
            select: {
                id: true, firstName: true, lastName: true, fullName: true,
                email: true, phone: true, status: true,
            },
        });

        res.json({ success: true, data: updated, message: 'Şoför bilgileri güncellendi' });
    } catch (error) {
        console.error('Update partner driver error:', error);
        res.status(500).json({ success: false, error: 'Şoför güncellenemedi' });
    }
});

/**
 * DELETE /api/transfer/partner/drivers/:driverId
 * Partner soft-deletes a driver
 */
router.delete('/partner/drivers/:driverId', authMiddleware, async (req, res) => {
    try {
        const partnerId = req.user.id;
        const { driverId } = req.params;

        const driver = await prisma.user.findFirst({
            where: { id: driverId, partnerId }
        });
        if (!driver) {
            return res.status(404).json({ success: false, error: 'Şoför bulunamadı' });
        }

        await prisma.user.update({
            where: { id: driverId },
            data: { status: 'INACTIVE', deletedAt: new Date() }
        });

        res.json({ success: true, message: `${driver.fullName} kaldırıldı` });
    } catch (error) {
        console.error('Delete partner driver error:', error);
        res.status(500).json({ success: false, error: 'Şoför silinemedi' });
    }
});

/**
 * POST /api/transfer/partner/assign
 * Partner assigns a booking to one of their drivers + vehicle
 */
router.post('/partner/assign', authMiddleware, async (req, res) => {
    try {
        const partnerId = req.user.id;
        const { bookingId, driverId, vehicleId } = req.body;

        if (!bookingId || !driverId) {
            return res.status(400).json({ success: false, error: 'Rezervasyon ve şoför seçimi zorunludur' });
        }

        // Verify driver belongs to this partner
        const driver = await prisma.user.findFirst({
            where: { id: driverId, partnerId, status: 'ACTIVE' }
        });
        if (!driver) {
            return res.status(400).json({ success: false, error: 'Şoför bulunamadı veya aktif değil' });
        }

        // Verify vehicle belongs to this partner (if provided)
        if (vehicleId) {
            const vehicle = await prisma.vehicle.findFirst({
                where: { id: vehicleId, ownerId: partnerId, status: 'ACTIVE' }
            });
            if (!vehicle) {
                return res.status(400).json({ success: false, error: 'Araç bulunamadı veya size ait değil' });
            }
        }

        // Get booking
        const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
        if (!booking) {
            return res.status(404).json({ success: false, error: 'Rezervasyon bulunamadı' });
        }

        // Update booking with driver assignment
        const updatedMetadata = {
            ...(booking.metadata || {}),
            assignedByPartnerId: partnerId,
            partnerDriverId: driverId,
            partnerDriverName: driver.fullName,
            partnerVehicleId: vehicleId || null,
            operationalStatus: 'DRIVER_ASSIGNED',
            assignedAt: new Date().toISOString(),
        };

        const updated = await prisma.booking.update({
            where: { id: bookingId },
            data: {
                driverId,
                confirmedBy: partnerId,
                status: 'CONFIRMED',
                confirmedAt: new Date(),
                metadata: updatedMetadata,
            },
            select: {
                id: true, bookingNumber: true, status: true, driverId: true,
                contactName: true, startDate: true, metadata: true,
            },
        });

        // Send push notification to driver if they have a token
        if (driver.pushToken) {
            try {
                const { Expo } = require('expo-server-sdk');
                const expo = new Expo();
                await expo.sendPushNotificationsAsync([{
                    to: driver.pushToken,
                    sound: 'default',
                    title: '🚗 Yeni Transfer Atandı',
                    body: `${booking.contactName} - ${booking.metadata?.pickup || 'Transfer'}`,
                    data: { type: 'booking_assigned', bookingId: booking.id },
                }]);
            } catch (pushErr) {
                console.warn('Push notification failed:', pushErr.message);
            }
        }

        res.json({
            success: true,
            data: updated,
            message: `Transfer ${driver.fullName} adlı şoföre atandı`
        });
    } catch (error) {
        console.error('Partner assign error:', error);
        res.status(500).json({ success: false, error: 'Atama yapılamadı' });
    }
});

// ════════════════════════════════════════════════════════════════════
// GUEST BOOKING TRACKING (Public – no auth required)
// Verified by bookingNumber + contactEmail (or last-4 of contactPhone)
// ════════════════════════════════════════════════════════════════════

/**
 * GET /api/transfer/track
 * Query: bookingNumber, email (or phone last-4 as `phone4`)
 */
router.get('/track', async (req, res) => {
    try {
        const { bookingNumber, email, phone4 } = req.query;
        if (!bookingNumber) {
            return res.status(400).json({ success: false, error: 'Rezervasyon numarası gerekli' });
        }
        if (!email && !phone4) {
            return res.status(400).json({ success: false, error: 'E-posta veya telefon son 4 hanesi gerekli' });
        }

        const tenantId = req.tenant?.id;
        const booking = await prisma.booking.findFirst({
            where: { bookingNumber: String(bookingNumber), ...(tenantId ? { tenantId } : {}) },
            select: {
                id: true, bookingNumber: true,
                status: true, paymentStatus: true,
                startDate: true, total: true, currency: true,
                contactName: true, contactPhone: true, contactEmail: true,
                adults: true, children: true, infants: true,
                pickedUpAt: true, droppedOffAt: true,
                specialRequests: true, metadata: true, createdAt: true,
                driver: {
                    select: {
                        id: true, fullName: true, phone: true, avatar: true,
                        metadata: true,
                    }
                }
            }
        });

        if (!booking) {
            return res.status(404).json({ success: false, error: 'Rezervasyon bulunamadı' });
        }

        // Verify identity: email OR last-4 of phone
        const emailMatch = email && booking.contactEmail &&
            booking.contactEmail.toLowerCase().trim() === String(email).toLowerCase().trim();
        const phoneRaw = (booking.contactPhone || '').replace(/\D/g, '');
        const phoneMatch = phone4 && phoneRaw.endsWith(String(phone4).replace(/\D/g, ''));
        if (!emailMatch && !phoneMatch) {
            return res.status(403).json({ success: false, error: 'Kimlik doğrulama başarısız. E-posta veya telefon numarası eşleşmiyor.' });
        }

        // Build clean response (same shape as /api/customer/bookings/:id)
        const meta = booking.metadata || {};
        const cleanMeta = {
            pickup: meta.pickup,
            dropoff: meta.dropoff,
            pickupCoordinates: meta.pickupCoordinates,
            dropoffCoordinates: meta.dropoffCoordinates,
            vehicleType: meta.vehicleType,
            vehiclePlate: meta.vehiclePlate,
            flightNumber: meta.flightNumber,
            paymentMethod: meta.paymentMethod,
            rating: meta.rating ? { overall: meta.rating.overall, submittedAt: meta.rating.submittedAt } : null,
            ratingToken: meta.ratingToken,
        };

        const minutesUntilPickup = booking.startDate
            ? Math.round((new Date(booking.startDate).getTime() - Date.now()) / 60000)
            : null;
        const trackingAvailable = (
            booking.status === 'IN_PROGRESS'
        ) || (
            ['CONFIRMED', 'PENDING'].includes(booking.status) &&
            minutesUntilPickup !== null && minutesUntilPickup <= 30 && minutesUntilPickup >= -120
        );

        let driverInfo = null;
        if (booking.driver) {
            const dm = booking.driver.metadata || {};
            driverInfo = {
                id: booking.driver.id,
                fullName: booking.driver.fullName,
                // Only expose phone if tracking is active
                phone: trackingAvailable ? booking.driver.phone : null,
                avatar: booking.driver.avatar,
                vehicleType: dm.vehicleType || cleanMeta.vehicleType || null,
                vehiclePlate: dm.licensePlate || dm.vehiclePlate || cleanMeta.vehiclePlate || null,
                vehicleColor: dm.vehicleColor || null,
                vehicleModel: dm.vehicleModel || null,
                rating: null,
                ratingCount: 0,
            };
            try {
                const rated = await prisma.booking.findMany({
                    where: { driverId: booking.driver.id, metadata: { path: ['rating', 'submittedAt'], not: null } },
                    select: { metadata: true },
                });
                const scores = rated.map(b => Number(b.metadata?.rating?.overall)).filter(n => Number.isFinite(n) && n > 0);
                driverInfo.rating = scores.length ? Math.round((scores.reduce((s, n) => s + n, 0) / scores.length) * 10) / 10 : null;
                driverInfo.ratingCount = scores.length;
            } catch { /* non-fatal */ }
        }

        res.json({
            success: true,
            data: {
                ...booking,
                metadata: cleanMeta,
                driver: driverInfo,
                minutesUntilPickup,
                trackingAvailable,
            }
        });
    } catch (error) {
        console.error('[Track] error:', error);
        res.status(500).json({ success: false, error: 'Sorgu yapılamadı' });
    }
});

/**
 * GET /api/transfer/track/:id/driver-location
 * Query: email (or phone4) for verification
 */
router.get('/track/:id/driver-location', async (req, res) => {
    try {
        const { id } = req.params;
        const { email, phone4 } = req.query;
        if (!email && !phone4) {
            return res.status(400).json({ success: false, error: 'E-posta veya telefon son 4 hanesi gerekli' });
        }

        const tenantId = req.tenant?.id;
        const booking = await prisma.booking.findFirst({
            where: { id: String(id), ...(tenantId ? { tenantId } : {}) },
            select: { id: true, status: true, startDate: true, driverId: true, contactEmail: true, contactPhone: true }
        });
        if (!booking) return res.status(404).json({ success: false, error: 'Rezervasyon bulunamadı' });

        const emailMatch = email && booking.contactEmail &&
            booking.contactEmail.toLowerCase().trim() === String(email).toLowerCase().trim();
        const phoneRaw = (booking.contactPhone || '').replace(/\D/g, '');
        const phoneMatch = phone4 && phoneRaw.endsWith(String(phone4).replace(/\D/g, ''));
        if (!emailMatch && !phoneMatch) {
            return res.status(403).json({ success: false, error: 'Kimlik doğrulama başarısız' });
        }

        if (!booking.driverId) return res.status(404).json({ success: false, error: 'Henüz şoför atanmamış' });

        const minutesUntilPickup = booking.startDate
            ? (new Date(booking.startDate).getTime() - Date.now()) / 60000 : null;
        const inProgress = booking.status === 'IN_PROGRESS';
        const allowed = inProgress || (minutesUntilPickup !== null && minutesUntilPickup <= 30 && minutesUntilPickup >= -180);
        if (!allowed) {
            return res.status(403).json({
                success: false,
                error: 'Şoför konumu transfer zamanına 30 dakika kala paylaşılır',
                minutesUntilPickup
            });
        }

        const onlineDrivers = req.app.get('onlineDrivers') || {};
        const info = onlineDrivers[booking.driverId];
        let location = info?.location || null;
        let lastSeen = info?.lastSeen || null;
        if (!location) {
            const driver = await prisma.user.findUnique({
                where: { id: booking.driverId },
                select: { metadata: true, lastSeenAt: true }
            });
            const dm = driver?.metadata || {};
            if (dm.lastLat && dm.lastLng) {
                location = { lat: Number(dm.lastLat), lng: Number(dm.lastLng), heading: dm.lastHeading || 0, speed: dm.lastSpeed || 0 };
            }
            if (driver?.lastSeenAt) lastSeen = new Date(driver.lastSeenAt).getTime();
        }

        res.json({
            success: true,
            data: {
                location,
                online: !!info?.location,
                lastSeen,
            }
        });
    } catch (error) {
        console.error('[Track] driver-location error:', error);
        res.status(500).json({ success: false, error: 'Konum alınamadı' });
    }
});

// ═══════════════════════════════════════════════════════
// AIRPORT GREETING ENDPOINTS
// ═══════════════════════════════════════════════════════

const AIRPORT_KEYWORDS = ['havalimanı', 'havaalani', 'havalimani', 'airport', 'ayt', 'gzp', 'dal', 'dalaman'];

/**
 * GET /api/transfer/airport-arrivals
 * Returns today's ARV (arrival) bookings for airport greeting staff
 * Includes: flight info, customer, driver, vehicle, greeting status
 * Query params: ?airport=AYT&date=2026-05-03
 */
router.get('/airport-arrivals', authMiddleware, async (req, res) => {
    try {
        const { airport, date } = req.query;
        const targetDate = date ? new Date(date) : new Date();
        const dayStart = new Date(targetDate);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(targetDate);
        dayEnd.setHours(23, 59, 59, 999);

        const bookings = await prisma.booking.findMany({
            where: {
                productType: 'TRANSFER',
                startDate: { gte: dayStart, lte: dayEnd },
                status: { in: ['CONFIRMED', 'PENDING', 'IN_PROGRESS', 'COMPLETED'] },
            },
            include: {
                customer: true,
                agency: true,
                driver: {
                    select: {
                        id: true, firstName: true, lastName: true, phone: true, avatar: true,
                    }
                }
            },
            orderBy: { startDate: 'asc' }
        });

        // Filter: only ARV transfers (pickup is airport)
        const arrivals = bookings.filter(b => {
            const pickup = (b.metadata?.pickup || '').toLowerCase();
            const isArrival = AIRPORT_KEYWORDS.some(kw => pickup.includes(kw));
            if (!isArrival) return false;
            // Airport filter
            if (airport) {
                const ap = airport.toLowerCase();
                return pickup.includes(ap);
            }
            return true;
        });

        // Fetch vehicle details
        const vehicleIds = [...new Set(arrivals.map(b => b.metadata?.assignedVehicleId || b.metadata?.vehicleId).filter(Boolean))];
        const vehicleMap = {};
        if (vehicleIds.length > 0) {
            const vehicles = await prisma.vehicle.findMany({
                where: { id: { in: vehicleIds } },
                select: { id: true, plateNumber: true, brand: true, model: true, color: true },
            });
            vehicles.forEach(v => { vehicleMap[v.id] = v; });
        }

        // Fetch greeter names
        const greeterIds = [...new Set(arrivals.map(b => b.metadata?.greeterId).filter(Boolean))];
        const greeterMap = {};
        if (greeterIds.length > 0) {
            const greeters = await prisma.user.findMany({
                where: { id: { in: greeterIds } },
                select: { id: true, firstName: true, lastName: true }
            });
            greeters.forEach(g => { greeterMap[g.id] = `${g.firstName} ${g.lastName}`; });
        }

        const mapped = arrivals.map(b => {
            const vehId = b.metadata?.assignedVehicleId || b.metadata?.vehicleId || null;
            const vehicle = vehId ? vehicleMap[vehId] : null;
            return {
                id: b.id,
                bookingNumber: b.bookingNumber,
                status: b.status,
                // Flight
                flightNumber: b.metadata?.flightNumber || null,
                flightTime: b.metadata?.flightTime || null,
                // Customer
                passengerName: b.contactName,
                passengerPhone: b.contactPhone,
                contactEmail: b.contactEmail,
                adults: b.adults,
                children: b.children || 0,
                infants: b.infants || 0,
                specialRequests: b.specialRequests,
                // Route
                pickup: b.metadata?.pickup || '',
                dropoff: b.metadata?.dropoff || '',
                pickupDateTime: b.startDate,
                // Vehicle & Driver
                vehicleType: b.metadata?.vehicleType || null,
                vehiclePlate: vehicle?.plateNumber || b.metadata?.vehiclePlate || null,
                vehicleBrand: vehicle ? `${vehicle.brand} ${vehicle.model}` : (b.metadata?.vehicleBrand || null),
                vehicleColor: vehicle?.color || null,
                driverName: b.driver ? `${b.driver.firstName} ${b.driver.lastName}` : (b.metadata?.handoffDriverName || null),
                driverPhone: b.driver?.phone || (b.metadata?.handoffDriverPhone || null),
                driverId: b.driverId || null,
                // Greeting
                greetingStatus: b.metadata?.greetingStatus || 'WAITING',
                flightStatus: b.metadata?.flightStatus || 'ON_TIME',
                estimatedLanding: b.metadata?.estimatedLanding || null,
                actualLanding: b.metadata?.actualLanding || null,
                greetedAt: b.metadata?.greetedAt || null,
                handedOffAt: b.metadata?.handedOffAt || null,
                greeterNotes: b.metadata?.greeterNotes || [],
                greeterId: b.metadata?.greeterId || null,
                greeterName: b.metadata?.greeterId ? (greeterMap[b.metadata.greeterId] || null) : null,
                // Agency
                agencyName: b.agency?.name || b.agency?.companyName || b.metadata?.agencyName || null,
                // Shuttle metadata for run grouping
                shuttleRouteId: b.metadata?.shuttleRouteId || null,
                shuttleMasterTime: b.metadata?.shuttleMasterTime || null,
                manualRunId: b.metadata?.manualRunId || null,
                // Timestamps
                pickedUpAt: b.pickedUpAt,
                droppedOffAt: b.droppedOffAt,
                createdAt: b.createdAt,
            };
        });

        res.json({ success: true, data: mapped });
    } catch (error) {
        console.error('[Airport] arrivals error:', error);
        res.status(500).json({ success: false, error: 'Varış verileri alınamadı' });
    }
});

/**
 * PATCH /api/transfer/greeting-status
 * Update the greeting status of a booking
 * Body: { bookingId, status, flightStatus?, estimatedLanding?, notes? }
 * 
 * greetingStatus: WAITING | DELAYED | LANDED | CANCELLED | MET | HANDED_OFF | NO_SHOW
 * flightStatus:   ON_TIME | DELAYED | LANDED | CANCELLED
 */
router.patch('/greeting-status', authMiddleware, async (req, res) => {
    try {
        const { bookingId, status, flightStatus, estimatedLanding, notes, driverId } = req.body;

        if (!bookingId || !status) {
            return res.status(400).json({ success: false, error: 'bookingId ve status gereklidir' });
        }

        const validStatuses = ['WAITING', 'DELAYED', 'LANDED', 'CANCELLED', 'MET', 'HANDED_OFF', 'NO_SHOW'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ success: false, error: `Geçersiz durum: ${status}` });
        }

        const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
        if (!booking) {
            return res.status(404).json({ success: false, error: 'Rezervasyon bulunamadı' });
        }

        const metadata = booking.metadata || {};
        const now = new Date().toISOString();

        // Update greeting status
        metadata.greetingStatus = status;
        metadata.greeterId = req.user.id;
        metadata.greeterName = `${req.user.firstName} ${req.user.lastName}`;

        // ── Sync operationalStatus so operations screen reflects greeting changes ──
        const GREETING_TO_OP_STATUS = {
            DELAYED:    'FLIGHT_DELAYED',
            LANDED:     'FLIGHT_LANDED',
            MET:        'CUSTOMER_MET',
            HANDED_OFF: 'DRIVER_ASSIGNED',
            NO_SHOW:    'NO_SHOW',
            CANCELLED:  'CANCELLED',
        };
        if (GREETING_TO_OP_STATUS[status]) {
            metadata.operationalStatus = GREETING_TO_OP_STATUS[status];
        }

        // Status-specific timestamps
        if (status === 'LANDED') {
            metadata.actualLanding = now;
            metadata.flightStatus = 'LANDED';
        } else if (status === 'DELAYED') {
            metadata.flightStatus = 'DELAYED';
            if (estimatedLanding) metadata.estimatedLanding = estimatedLanding;
        } else if (status === 'CANCELLED') {
            metadata.flightStatus = 'CANCELLED';
        } else if (status === 'MET') {
            metadata.greetedAt = now;
        } else if (status === 'HANDED_OFF') {
            metadata.handedOffAt = now;
        }

        // Override flight status if explicitly provided
        if (flightStatus) {
            metadata.flightStatus = flightStatus;
        }

        // Add note to timeline
        if (notes) {
            if (!Array.isArray(metadata.greeterNotes)) metadata.greeterNotes = [];
            metadata.greeterNotes.push({
                text: notes,
                by: `${req.user.firstName} ${req.user.lastName}`,
                byId: req.user.id,
                at: now,
                status: status,
            });
        }

        // Auto-add timeline entry for status change
        if (!Array.isArray(metadata.greeterNotes)) metadata.greeterNotes = [];
        metadata.greeterNotes.push({
            text: `Durum güncellendi: ${status}`,
            by: `${req.user.firstName} ${req.user.lastName}`,
            byId: req.user.id,
            at: now,
            status: status,
            isSystem: true,
        });

        const updateData = { metadata };

        // Also update pickedUpAt/droppedOffAt if applicable
        if (status === 'MET' && !booking.pickedUpAt) {
            updateData.pickedUpAt = new Date();
        }
        if (status === 'HANDED_OFF' && !booking.droppedOffAt) {
            updateData.droppedOffAt = new Date();
        }

        // ── Driver assignment on HANDED_OFF ──
        if (status === 'HANDED_OFF' && driverId) {
            // Resolve driver: could be userId or personnelId
            let resolvedUserId = driverId;
            const personnel = await prisma.personnel.findFirst({ where: { id: driverId, deletedAt: null } });
            if (personnel?.userId) {
                resolvedUserId = personnel.userId;
            }
            updateData.driverId = resolvedUserId;
            metadata.driverId = resolvedUserId;
            metadata.operationalStatus = 'DRIVER_ASSIGNED';

            // Find vehicle assigned to this driver
            const tenantId = req.user.tenantId || booking.tenantId;
            const allVehicles = await prisma.vehicle.findMany({
                where: { tenantId, status: 'ACTIVE' },
                select: { id: true, plateNumber: true, metadata: true, brand: true, model: true }
            });
            const vehicle = allVehicles.find(v => 
                v.metadata?.driverId === resolvedUserId || v.metadata?.driverId === driverId
            );
            if (vehicle) {
                metadata.assignedVehicleId = vehicle.id;
                metadata.vehiclePlate = vehicle.plateNumber;
                metadata.vehicleBrand = `${vehicle.brand || ''} ${vehicle.model || ''}`.trim();
            }

            // Store driver name/phone in metadata for display
            const driverUser = await prisma.user.findUnique({ where: { id: resolvedUserId }, select: { fullName: true, phone: true } }).catch(() => null);
            metadata.handoffDriverName = driverUser?.fullName || `${personnel?.firstName || ''} ${personnel?.lastName || ''}`.trim();
            metadata.handoffDriverPhone = driverUser?.phone || personnel?.phone || null;
            metadata.greeterNotes.push({
                text: `Şoför atandı: ${driverUser?.fullName || personnel?.firstName + ' ' + personnel?.lastName}${vehicle ? ` (${vehicle.plateNumber})` : ''}`,
                by: `${req.user.firstName} ${req.user.lastName}`,
                byId: req.user.id,
                at: now,
                status: 'HANDED_OFF',
                isSystem: true,
            });

            // ── Shuttle: assign same driver/vehicle to ALL sibling bookings in the same run ──
            const bm = booking.metadata || {};
            const isShuttle = (bm.vehicleType || '').toLowerCase().includes('shuttle') ||
                              (bm.vehicleType || '').toLowerCase().includes('paylaşımlı') ||
                              (bm.transferType || '').toLowerCase() === 'shuttle' ||
                              !!bm.shuttleRouteId;

            if (isShuttle) {
                const tenantIdForSiblings = req.user.tenantId || booking.tenantId;
                // Determine sibling criteria
                const siblingWhere = {
                    tenantId: tenantIdForSiblings,
                    productType: 'TRANSFER',
                    id: { not: bookingId },
                    status: { notIn: ['CANCELLED', 'NO_SHOW'] },
                };

                // Find siblings: same shuttle run
                let siblings = [];
                if (bm.manualRunId) {
                    siblings = await prisma.booking.findMany({
                        where: { ...siblingWhere, metadata: { path: ['manualRunId'], equals: bm.manualRunId } }
                    });
                } else if (bm.shuttleRouteId) {
                    const allCandidates = await prisma.booking.findMany({ where: siblingWhere });
                    siblings = allCandidates.filter(s => {
                        const sm = s.metadata || {};
                        return sm.shuttleRouteId === bm.shuttleRouteId &&
                               (sm.shuttleMasterTime || '') === (bm.shuttleMasterTime || '');
                    });
                }

                // Also filter by same day
                const bookingDay = booking.startDate ? new Date(booking.startDate).toISOString().slice(0, 10) : null;
                if (bookingDay) {
                    siblings = siblings.filter(s => s.startDate && new Date(s.startDate).toISOString().slice(0, 10) === bookingDay);
                }

                console.log(`[Greeting] Shuttle handoff: ${siblings.length} sibling(s) found for run`);

                for (const sib of siblings) {
                    const sibMeta = sib.metadata || {};
                    sibMeta.driverId = resolvedUserId;
                    sibMeta.operationalStatus = 'DRIVER_ASSIGNED';
                    sibMeta.handoffDriverName = metadata.handoffDriverName;
                    sibMeta.handoffDriverPhone = metadata.handoffDriverPhone;
                    if (vehicle) {
                        sibMeta.assignedVehicleId = vehicle.id;
                        sibMeta.vehiclePlate = vehicle.plateNumber;
                        sibMeta.vehicleBrand = `${vehicle.brand || ''} ${vehicle.model || ''}`.trim();
                    }
                    await prisma.booking.update({
                        where: { id: sib.id },
                        data: { driverId: resolvedUserId, metadata: sibMeta }
                    });
                }
            }
        }

        // ── CANCELLED → update booking status ──
        if (status === 'CANCELLED') {
            updateData.status = 'CANCELLED';
        }

        const updatedBooking = await prisma.booking.update({
            where: { id: bookingId },
            data: updateData,
        });

        // ── Emit socket event so operations page updates in real-time ──
        const io = req.app.get('io');
        if (io) {
            io.to('admin_monitoring').emit('greeting_status_update', {
                bookingId,
                greetingStatus: status,
                operationalStatus: metadata.operationalStatus,
                driverId: updateData.driverId || booking.driverId,
                greeterName: metadata.greeterName,
                vehiclePlate: metadata.vehiclePlate || null,
                vehicleBrand: metadata.vehicleBrand || null,
                timestamp: now,
            });
            // Also notify shuttle runs tab to refresh
            if (status === 'HANDED_OFF' && updateData.driverId) {
                io.to('admin_monitoring').emit('shuttle_runs_updated', { action: 'greeting_handoff', bookingId });
            }
        }

        // ── Notify driver app via socket + push notification ──
        if (status === 'HANDED_OFF' && updateData.driverId) {
            const assignedDriverId = updateData.driverId;

            // Socket: operation_assigned to driver
            if (io) {
                io.to(`user_${assignedDriverId}`).emit('operation_assigned', {
                    bookingId,
                    bookingNumber: updatedBooking.bookingNumber,
                    pickup: updatedBooking.metadata?.pickup || 'Havalimanı',
                    start: updatedBooking.startDate
                });
                console.log(`[Greeting] Socket operation_assigned → driver ${assignedDriverId}`);
            }

            // Push notification to driver
            try {
                let driver = await prisma.user.findUnique({ where: { id: assignedDriverId } });
                if (!driver) {
                    const pers = await prisma.personnel.findFirst({ where: { id: assignedDriverId }, include: { user: true } });
                    driver = pers?.user || null;
                }

                let driverMeta = driver?.metadata || {};
                if (typeof driverMeta === 'string') { try { driverMeta = JSON.parse(driverMeta); } catch (e) { driverMeta = {}; } }
                const pushToken = driver?.pushToken || driverMeta?.expoPushToken;

                if (pushToken && pushToken.startsWith('ExponentPushToken')) {
                    const pickupStr = updatedBooking.metadata?.pickup || 'Havalimanı';
                    const dateStr = updatedBooking.startDate
                        ? new Date(updatedBooking.startDate).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
                        : '';
                    await fetch('https://exp.host/--/api/v2/push/send', {
                        method: 'POST',
                        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            to: pushToken,
                            sound: 'default',
                            title: '🚗 Yeni İş Atandı!',
                            body: `${pickupStr} • ${dateStr}`,
                            data: { bookingId, bookingNumber: updatedBooking.bookingNumber, type: 'operationAssigned', pickup: pickupStr, start: updatedBooking.startDate },
                            priority: 'high',
                            channelId: 'operations'
                        })
                    });
                    console.log(`[Greeting] Push notification sent to driver ${assignedDriverId}`);
                }
            } catch (pushErr) {
                console.error('[Greeting] Push error (non-fatal):', pushErr.message);
            }
        }

        res.json({ success: true, message: 'Durum güncellendi', status });
    } catch (error) {
        console.error('[Airport] greeting-status error:', error);
        res.status(500).json({ success: false, error: 'Durum güncellenemedi' });
    }
});

/**
 * POST /api/transfer/greeting-note
 * Add a note to booking's greeting timeline
 * Body: { bookingId, text }
 */
router.post('/greeting-note', authMiddleware, async (req, res) => {
    try {
        const { bookingId, text } = req.body;

        if (!bookingId || !text) {
            return res.status(400).json({ success: false, error: 'bookingId ve text gereklidir' });
        }

        const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
        if (!booking) {
            return res.status(404).json({ success: false, error: 'Rezervasyon bulunamadı' });
        }

        const metadata = booking.metadata || {};
        if (!Array.isArray(metadata.greeterNotes)) metadata.greeterNotes = [];

        metadata.greeterNotes.push({
            text,
            by: `${req.user.firstName} ${req.user.lastName}`,
            byId: req.user.id,
            at: new Date().toISOString(),
            isNote: true,
        });

        await prisma.booking.update({
            where: { id: bookingId },
            data: { metadata },
        });

        res.json({ success: true, message: 'Not eklendi' });
    } catch (error) {
        console.error('[Airport] greeting-note error:', error);
        res.status(500).json({ success: false, error: 'Not eklenemedi' });
    }
});

/**
 * GET /api/transfer/greeting-drivers
 * Returns active drivers/personnel for the tenant (for airport staff to pick a driver)
 */
router.get('/greeting-drivers', authMiddleware, async (req, res) => {
    try {
        const tenantId = req.user.tenantId || req.tenant?.id;
        if (!tenantId) return res.status(400).json({ success: false, error: 'Tenant bulunamadı' });

        const personnel = await prisma.personnel.findMany({
            where: {
                tenantId,
                isActive: true,
                deletedAt: null,
                jobTitle: { in: ['DRIVER', 'OPERATION', 'TENANT_STAFF'] }
            },
            include: {
                user: { select: { id: true, fullName: true, phone: true, avatar: true } }
            },
            orderBy: { firstName: 'asc' }
        });

        // Also get vehicles to show which driver has which car
        const vehicles = await prisma.vehicle.findMany({
            where: { tenantId, status: 'ACTIVE' },
            select: { id: true, plateNumber: true, brand: true, model: true, metadata: true }
        });

        const vehicleByDriver = {};
        vehicles.forEach(v => {
            if (v.metadata?.driverId) {
                vehicleByDriver[v.metadata.driverId] = v;
            }
        });

        const drivers = personnel
            .filter(p => p.userId || p.user)
            .map(p => {
                const userId = p.userId || p.user?.id;
                const vehicle = vehicleByDriver[userId] || vehicleByDriver[p.id];
                return {
                    id: p.id,
                    userId,
                    name: p.user?.fullName || `${p.firstName} ${p.lastName}`,
                    phone: p.user?.phone || p.phone,
                    avatar: p.user?.avatar || p.photo,
                    jobTitle: p.jobTitle,
                    vehicle: vehicle ? {
                        id: vehicle.id,
                        plate: vehicle.plateNumber,
                        brand: `${vehicle.brand || ''} ${vehicle.model || ''}`.trim()
                    } : null
                };
            });

        res.json({ success: true, data: drivers });
    } catch (error) {
        console.error('[Airport] greeting-drivers error:', error);
        res.status(500).json({ success: false, error: 'Şoför listesi alınamadı' });
    }
});

module.exports = router;
