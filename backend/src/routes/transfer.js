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
const {
    getEffectiveTenantId,
    requireTenantId,
    findBookingForTenant,
    requireAdmin,
} = require('../utils/tenantScope');

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
                // Dropoff is inside this zone ONLY if the actual dropoff point is inside its polygon
                // (distFromEnd === 0 is set explicitly by the dropoff point-in-polygon check).
                // We must NOT trust `hitEnd` here — that flag merely means the route polyline
                // re-enters the zone while scanning backwards from the route's end. A long route
                // (e.g. Alanya → Hatay) can pass *through* an unrelated zone (e.g. Gazipaşa),
                // which would otherwise be misdetected as the dropoff zone and apply the wrong
                // pricing / shuttle match.
                const isDropoffInside = zd.distFromEnd === 0 && !req.pickupZoneIds?.has(zoneId);
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

            // 2. DROPOFF Location Check (to → user's dropoff) — STRICT POLYGON MODE
            // When dropoff coordinates are present, the ONLY way to match is for the
            // dropoff point to be inside the route's destination zone polygon (or the
            // route's own dropoffPolygon if defined). Hub-code / text equality is used
            // ONLY as a hint to locate the destination zone; it never grants a match
            // by itself. This mirrors the strict pickup logic and prevents adjacent
            // sub-zones / loose airport hub matches from sneaking through.
            let isDropoffMatch = false;
            const routeMeta = route.metadata || {};
            const routeToHubCode = routeMeta.toHubCode;

            if (dropoffLat && dropoffLng) {
                const dropPt = turf.point([Number(dropoffLng), Number(dropoffLat)]);

                // 2a. Route's own dropoffPolygon (highest priority, if configured)
                if (route.dropoffPolygon) {
                    try {
                        const polygon = typeof route.dropoffPolygon === 'string'
                            ? JSON.parse(route.dropoffPolygon) : route.dropoffPolygon;
                        if (Array.isArray(polygon) && polygon.length > 2) {
                            let polyCoords = polygon.map(p => [p.lng, p.lat]);
                            if (polyCoords[0][0] !== polyCoords[polyCoords.length - 1][0] ||
                                polyCoords[0][1] !== polyCoords[polyCoords.length - 1][1]) {
                                polyCoords.push([...polyCoords[0]]);
                            }
                            const poly = turf.polygon([polyCoords]);
                            if (turf.booleanPointInPolygon(dropPt, poly)) {
                                isDropoffMatch = true;
                                console.log(`[ShuttleDropoff] Inside route's own dropoffPolygon`);
                            }
                        }
                    } catch (err) {
                        console.error('[ShuttlePolygonError] Route dropoffPolygon:', err.message);
                    }
                }

                // 2b. Route's destination zone polygon (located via toHubCode or toName)
                if (!isDropoffMatch) {
                    let dZone = null;
                    if (routeToHubCode) {
                        dZone = zones.find(z => z.code && z.code.toUpperCase() === routeToHubCode.toUpperCase());
                    }
                    if (!dZone) {
                        const rn = (route.toName || '').toLowerCase().trim();
                        if (rn) {
                            dZone = zones.find(z => (z.name || '').toLowerCase().trim() === rn);
                        }
                    }
                    if (dZone && Array.isArray(dZone.polygon) && dZone.polygon.length >= 3) {
                        try {
                            let dPolyCoords = dZone.polygon.map(p => [p.lng, p.lat]);
                            if (dPolyCoords[0][0] !== dPolyCoords[dPolyCoords.length - 1][0] ||
                                dPolyCoords[0][1] !== dPolyCoords[dPolyCoords.length - 1][1]) {
                                dPolyCoords.push([...dPolyCoords[0]]);
                            }
                            const zonePoly = turf.polygon([dPolyCoords]);
                            if (turf.booleanPointInPolygon(dropPt, zonePoly)) {
                                isDropoffMatch = true;
                                console.log(`[ShuttleDropoff] Inside destination zone "${dZone.name}" polygon`);
                            }
                        } catch (err) {
                            console.error('[ShuttlePolygonError] Destination zone:', err.message);
                        }
                    }
                }
            } else {
                // No dropoff coordinates — fall back to legacy hub-code / text equality
                // (kept only for backwards compatibility with old clients that don't send coords).
                if (routeToHubCode && originalDropoffHubCode && originalDropoffHubCode === routeToHubCode) {
                    isDropoffMatch = true;
                }
                if (!isDropoffMatch) {
                    const routeTo = normalizeLocation(route.toName);
                    const routeToPrimary = routeTo.split(/[\/,]/)[0].trim();
                    isDropoffMatch = (routeToPrimary === dropoffPrimaryToken);
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


                console.log(`[ZoneSelect] vt=${vt.name}, finalMatchedZoneId=${finalMatchedZoneId}, usedOverageDistanceKm=${usedOverageDistanceKm}, extraKmPrice=${zonePriceConfig?.extraKmPrice}`);

                // ── STRICT POLYGON GATE ──
                // Zone-based pricing applies ONLY when BOTH pickup and dropoff coordinates
                // fall inside zone polygons. There is NO proximity tolerance, NO text-based
                // fallback, NO route-polyline crossing acceptance. Even 10 m outside a
                // polygon counts as "outside" and forces a fall-through to the vehicle's
                // km-based formula. If the vehicle has no km formula configured, pricing
                // returns null and the vehicle is hidden from results.
                //
                // Rationale (per business rule): zone polygons sit very close to each other,
                // so any leniency caused the system to pick the wrong zone and produce
                // misleading prices.
                if (zonePriceConfig && finalMatchedZoneId) {
                    const pickupInsideAnyZone = req.pickupZoneIds && req.pickupZoneIds.size > 0;
                    const dropoffInsideAnyZone = Object.values(req.zoneOverages || {})
                        .some(zd => zd && zd.distFromEnd === 0);

                    if (!pickupInsideAnyZone || !dropoffInsideAnyZone) {
                        console.log(`[ZoneGate] vt=${vt.name}: STRICT REJECT — pickupInside=${pickupInsideAnyZone}, dropoffInside=${dropoffInsideAnyZone}. Falling through to km formula.`);
                        zonePriceConfig = null;
                        finalMatchedZoneId = null;
                        usedOverageDistanceKm = 0;
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
                    // ── KM-BASED FALLBACK (strict polygon mode) ──
                    // Reached when zone pricing was NOT applied — i.e. either pickup or
                    // dropoff (or both) is outside all zone polygons. Per business rule:
                    // outside polygon → use the vehicle's km formula. If the vehicle has
                    // NO km formula configured, return null so the vehicle is hidden.
                    // No "outside-all-zones" hard block here; the km formula itself is the gate.
                    const meta = agencyContractMeta[vt.id];
                    const openingFee = meta?.openingFee ?? vt.metadata?.openingFee;
                    const pricePerKmField = meta?.basePricePerKm ?? vt.metadata?.basePricePerKm;

                    const hasValidFallback = (openingFee != null && Number(openingFee) > 0) ||
                                             (pricePerKmField != null && Number(pricePerKmField) > 0);

                    if (!hasValidFallback) {
                        // Honour agency contract fixedPrice override if present.
                        if (meta?.fixedPrice && Number(meta.fixedPrice) > 0) {
                            calculatedPrice = Math.round(Number(meta.fixedPrice) * typeMult);
                            calculationMethod = 'AGENCY_FIXED';
                        } else {
                            console.log(`[PriceDecision] vt=${vt.name}: outside polygon and NO km formula → hide vehicle`);
                            return null;
                        }
                    } else {
                        // We MUST have a real road distance to bill km-based.
                        // No silent fallback to 50 km — that produced misleading
                        // prices for trips with no drivable route (e.g. Alanya → KKTC).
                        if (!distance || Number(distance) <= 0) {
                            console.log(`[PriceDecision] vt=${vt.name}: no distance available for km formula → hide vehicle`);
                            return null;
                        }
                        const basePrice = openingFee ? Number(openingFee) : 0;
                        const pricePerKm = pricePerKmField ? Number(pricePerKmField) : 0;
                        const dist = Number(distance);
                        calculatedPrice = Math.round((basePrice + (dist * pricePerKm)) * typeMult);
                        calculationMethod = 'DISTANCE_BASE';
                        console.log(`[PriceDecision] vt=${vt.name}: km formula → ${calculatedPrice} (${basePrice} + ${dist}km × ${pricePerKm})`);
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
                    currency: contractPrice
                        ? (agencyContractMeta[vt.id]?.currency || vt.metadata?.currency || tenantDefaultCurrency)
                        : (vt.metadata?.currency || tenantDefaultCurrency), 
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
            // For return leg (linkedBookingNumber set), reverse outbound coords if return payload omitted them.
            const isReturnLeg = !!linkedBookingNumber;
            const pLat = data.pickupLat
                || (isReturnLeg ? req.body.outbound?.dropoffLat : (req.body.pickupLat || req.body.outbound?.pickupLat));
            const pLng = data.pickupLng
                || (isReturnLeg ? req.body.outbound?.dropoffLng : (req.body.pickupLng || req.body.outbound?.pickupLng));
            const dLat = data.dropoffLat
                || (isReturnLeg ? req.body.outbound?.pickupLat : (req.body.dropoffLat || req.body.outbound?.dropoffLat));
            const dLng = data.dropoffLng
                || (isReturnLeg ? req.body.outbound?.pickupLng : (req.body.dropoffLng || req.body.outbound?.dropoffLng));
            const pickupRegionCode = detectRegionCodeByPolygon(pLat, pLng, pickup, zonesForRegion, hubs);
            const dropoffRegionCode = detectRegionCodeByPolygon(dLat, dLng, dropoff, zonesForRegion, hubs);
            const airportZones = hubs.filter(h => h.isAirport);
            const tripType = getTripType(pickup, dropoff, airportZones);

            const isHourly = data.productType === 'HOURLY' || req.body.productType === 'HOURLY';
            const hourlyHours = isHourly ? (Number(data.hours || req.body.hours) || 1) : null;
            const hourlyRate = isHourly ? (Number(data.hourlyRate || req.body.hourlyRate) || 0) : null;
            const endDateCalc = isHourly
                ? new Date(new Date(pickupDateTime).getTime() + (hourlyHours || 1) * 60 * 60 * 1000)
                : new Date(new Date(pickupDateTime).getTime() + 60 * 60 * 1000);

            return await prisma.booking.create({
                data: {
                    tenantId: tenantId,
                    customerId: userId || null,
                    bookingNumber: bn,
                    productType: 'TRANSFER',

                    startDate: new Date(pickupDateTime),
                    endDate: endDateCalc,

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
                    bookingType: (req.user?.roleType === 'TENANT_ADMIN' || req.user?.roleType === 'SUPER_ADMIN' || req.user?.roleType === 'STAFF') ? 'SYSTEM' : 'DIRECT',
                    bookedByUserId: userId || null,
                    bookedByName: (req.user?.roleType === 'TENANT_ADMIN' || req.user?.roleType === 'SUPER_ADMIN' || req.user?.roleType === 'STAFF')
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
                        tripType: tripType, // Store trip type for shuttle grouping
                        isHourly: isHourly || false,
                        hourlyHours: hourlyHours,
                        hourlyRate: hourlyRate
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

        // ── Explicit Activity Log for customer booking creation ──
        try {
            const { logActivity } = require('../utils/logger');
            const source = outboundBooking.bookingType || 'WEB';
            const paxName = outboundBooking.contactName || 'Misafir';
            await logActivity({
                tenantId,
                userId: userId || null,
                userEmail: outboundBooking.contactEmail || null,
                action: 'CREATE_BOOKING',
                entityType: 'Booking',
                entityId: outboundBooking.id,
                details: {
                    message: `${paxName} — ${outboundBooking.bookingNumber} rezervasyonu oluşturuldu. (${source})`,
                    bookingNumber: outboundBooking.bookingNumber,
                    source,
                    pickup: outboundBooking.metadata?.pickup,
                    dropoff: outboundBooking.metadata?.dropoff,
                    vehicleType: outboundBooking.metadata?.vehicleType,
                    price: Number(outboundBooking.total || 0),
                    currency: outboundBooking.currency || 'TRY',
                    returnBookingId: returnBooking?.id || null,
                    returnBookingNumber: returnBooking?.bookingNumber || null
                },
                ipAddress: req.headers['x-forwarded-for'] || req.socket?.remoteAddress
            });
            // Log return booking separately if exists
            if (returnBooking) {
                await logActivity({
                    tenantId,
                    userId: userId || null,
                    userEmail: outboundBooking.contactEmail || null,
                    action: 'CREATE_BOOKING',
                    entityType: 'Booking',
                    entityId: returnBooking.id,
                    details: {
                        message: `${paxName} — ${returnBooking.bookingNumber} dönüş rezervasyonu oluşturuldu.`,
                        bookingNumber: returnBooking.bookingNumber,
                        source,
                        linkedOutbound: outboundBooking.bookingNumber
                    },
                    ipAddress: req.headers['x-forwarded-for'] || req.socket?.remoteAddress
                });
            }
        } catch (logErr) {
            console.error('[BookingLog] Create log failed:', logErr.message);
        }

        // ── Send Email Voucher (async, don't block response) ──
        try {
            const { sendBookingVoucher } = require('../lib/emailService');
            sendBookingVoucher(tenantId, outboundBooking).catch(err => {
                console.error('[EMAIL] Voucher send failed (background):', err.message);
            });
        } catch (emailErr) {
            console.error('[EMAIL] Voucher setup failed:', emailErr.message);
        }

        // ── Send WhatsApp Voucher (async, don't block response) ──
        try {
            const { sendBookingWhatsApp } = require('../lib/whatsappService');
            sendBookingWhatsApp(tenantId, outboundBooking).catch(err => {
                console.error('[WHATSAPP] Voucher send failed (background):', err.message);
            });
        } catch (waErr) {
            console.error('[WHATSAPP] Voucher setup failed:', waErr.message);
        }

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
        const tenantId = requireTenantId(req, res);
        if (!tenantId) return;
        if (!requireAdmin(req, res)) return;

        const bookings = await prisma.booking.findMany({
            where: {
                tenantId,
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
        const tenantId = requireTenantId(req, res);
        if (!tenantId) return;

        const bookings = await prisma.booking.findMany({
            where: {
                tenantId,
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
        const tenantId = requireTenantId(req, res);
        if (!tenantId) return;

        const booking = await findBookingForTenant(id, tenantId);

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
// ════════════════════════════════════════════════════════════════════
// PARTNER SHUTTLE OPERATIONS
// Strict partner isolation: confirmedBy === partner.id
// ════════════════════════════════════════════════════════════════════

const AIRPORT_KW = ['havaliman', 'havaalan', 'airport', 'ayt', 'gzp'];
function lc(s) { return String(s || '').toLocaleLowerCase('tr'); }
function isAirport(s) { const x = lc(s); return AIRPORT_KW.some((k) => x.includes(k)); }
function partnerTripType(pickup, dropoff) {
    const pAir = isAirport(pickup);
    const dAir = isAirport(dropoff);
    if (pAir && !dAir) return 'ARV';
    if (!pAir && dAir) return 'DEP';
    return 'TRF';
}
function shortCode(text, fallback = '???') {
    if (!text) return fallback;
    const t = lc(text);
    if (t.includes('ayt') || t.includes('antalya hav')) return 'AYT';
    if (t.includes('gzp') || t.includes('gazipaşa') || t.includes('gazipasa')) return 'GZP';
    const m = String(text).match(/[A-Za-zÇĞİÖŞÜçğıöşü]{3,}/);
    return m ? m[0].substring(0, 4).toUpperCase() : fallback;
}

function groupShuttleRuns(bookings, hubs) {
    const runsMap = {};
    const inferHubCode = (txt) => {
        const lt = lc(txt);
        for (const h of hubs || []) {
            const keys = (h.keywords || '').split(',').map((k) => lc(k).trim()).filter(Boolean);
            if (h.code) keys.push(lc(h.code));
            if (h.name) keys.push(lc(h.name));
            for (const k of keys) {
                if (k && lt.includes(k)) return { code: (h.code || '').toUpperCase() || shortCode(txt), isAirport: !!h.isAirport || lc(h.name || '').includes('havaliman') };
            }
        }
        return { code: shortCode(txt), isAirport: isAirport(txt) };
    };

    for (const b of bookings) {
        const m = b.metadata || {};
        const masterTime = m.shuttleMasterTime || '';
        let key, routeName, fromName = m.pickup || '', toName = m.dropoff || '';
        const tripType = partnerTripType(m.pickup, m.dropoff);

        if (m.manualRunId) {
            const baseId = String(m.manualRunId).startsWith('MANUAL::') ? m.manualRunId : `MANUAL::${m.manualRunId}`;
            key = `${baseId}::${tripType}`;
            routeName = m.manualRunName || 'Manuel Sefer';
            if (tripType !== 'ARA') routeName = `${routeName} (${tripType})`;
        } else if (m.shuttleRouteId) {
            const fromHub = inferHubCode(m.pickup);
            const toHub = inferHubCode(m.dropoff);
            const airportCode = tripType === 'DEP' ? toHub.code : fromHub.code;
            key = `ROUTE::${m.shuttleRouteId}::${airportCode}${masterTime ? '::' + masterTime : ''}`;
            routeName = `${fromHub.code} - ${toHub.code} ${tripType}${masterTime ? ' (' + masterTime + ')' : ''}`;
        } else {
            const fromHub = inferHubCode(m.pickup);
            const toHub = inferHubCode(m.dropoff);
            const regionCode = (tripType === 'ARV' ? toHub.code : fromHub.code) || '???';
            key = `ADHOC::${tripType}::${regionCode}${masterTime ? '::' + masterTime : ''}`;
            routeName = `Shuttle → ${regionCode} ${tripType}${masterTime ? ' (' + masterTime + ')' : ''}`;
        }

        if (!runsMap[key]) {
            runsMap[key] = {
                runKey: key,
                shuttleRouteId: m.shuttleRouteId || null,
                manualRunId: m.manualRunId || null,
                routeName,
                fromName,
                toName,
                tripType,
                departureTime: masterTime || null,
                driverId: null,
                vehicleId: null,
                bookings: [],
            };
        }
        if (b.driverId && !runsMap[key].driverId) runsMap[key].driverId = b.driverId;
        if (m.assignedVehicleId && !runsMap[key].vehicleId) runsMap[key].vehicleId = m.assignedVehicleId;
        runsMap[key].bookings.push({
            id: b.id,
            bookingNumber: b.bookingNumber,
            contactName: b.contactName,
            contactPhone: b.contactPhone,
            contactEmail: b.contactEmail || null,
            adults: b.adults || 0,
            children: b.children || 0,
            infants: b.infants || 0,
            pickup: m.pickup || '',
            dropoff: m.dropoff || '',
            pickupDateTime: b.startDate,
            status: b.status,
            operationalStatus: m.operationalStatus || null,
            paymentStatus: b.paymentStatus || null,
            paymentMethod: m.paymentMethod || null,
            driverId: b.driverId || null,
            assignedVehicleId: m.assignedVehicleId || null,
            flightNumber: m.flightNumber || null,
            flightTime: m.flightTime || null,
            pickupRegionCode: m.pickupRegionCode || null,
            dropoffRegionCode: m.dropoffRegionCode || null,
            shuttleSortOrder: m.shuttleSortOrder || null,
            extraServices: m.extraServices || null,
            notes: b.specialRequests || m.notes || null,
            agencyName: m.agencyName || null,
            total: Number(b.total || 0),
            currency: b.currency,
        });
    }

    // Sort bookings within run by sortOrder/time; compute departureTime if absent
    Object.values(runsMap).forEach((run) => {
        run.bookings.sort((a, b) => {
            const oa = a.shuttleSortOrder != null ? Number(a.shuttleSortOrder) : 999;
            const ob = b.shuttleSortOrder != null ? Number(b.shuttleSortOrder) : 999;
            if (oa !== ob) return oa - ob;
            return new Date(a.pickupDateTime).getTime() - new Date(b.pickupDateTime).getTime();
        });
        if (!run.departureTime && run.bookings[0]?.pickupDateTime) {
            try {
                const d = new Date(run.bookings[0].pickupDateTime);
                const tr = new Date(d.getTime() + 3 * 3600 * 1000);
                run.departureTime = `${String(tr.getUTCHours()).padStart(2, '0')}:${String(tr.getUTCMinutes()).padStart(2, '0')}`;
            } catch { run.departureTime = '--:--'; }
        }
        if (!run.departureTime) run.departureTime = '--:--';

        // Totals
        run.passengerCount = run.bookings.reduce((s, x) => s + (Number(x.adults) || 0) + (Number(x.children) || 0), 0);
        run.totalAmount = run.bookings.reduce((s, x) => s + Number(x.total || 0), 0);
        run.currency = run.bookings[0]?.currency || 'TRY';
        run.allReady = run.bookings.every((bb) => bb.driverId && bb.assignedVehicleId);
        run.driverAssigned = run.bookings.some((bb) => bb.driverId);
    });

    return Object.values(runsMap).sort((a, b) => {
        const ta = a.departureTime || '99:99';
        const tb = b.departureTime || '99:99';
        if (ta !== tb) return ta < tb ? -1 : 1;
        return (a.routeName || '').localeCompare(b.routeName || '');
    });
}

/**
 * GET /api/transfer/partner/shuttle-runs?date=YYYY-MM-DD
 * Returns the partner's shuttle bookings grouped into runs (sefers).
 */
router.get('/partner/shuttle-runs', authMiddleware, async (req, res) => {
    try {
        if (req.user.roleType !== 'PARTNER') return res.status(403).json({ success: false, error: 'Sadece partner' });
        const userId = req.user.id;
        const tenantId = req.tenant?.id || req.user.tenantId;

        let datePart = String(req.query.date || '').slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) datePart = new Date().toISOString().slice(0, 10);
        const TZ = 3 * 3600 * 1000;
        const dayStart = new Date(new Date(`${datePart}T00:00:00.000Z`).getTime() - TZ);
        const dayEnd = new Date(new Date(`${datePart}T23:59:59.999Z`).getTime() - TZ);

        const bookings = await prisma.booking.findMany({
            where: {
                tenantId,
                confirmedBy: userId,
                productType: 'TRANSFER',
                startDate: { gte: dayStart, lte: dayEnd },
                status: { notIn: ['CANCELLED', 'COMPLETED', 'PENDING', 'NO_SHOW'] },
            },
            orderBy: { startDate: 'asc' },
        });

        const shuttles = bookings.filter((b) => {
            const m = b.metadata || {};
            const vt = lc(m.vehicleType);
            const tt = lc(m.transferType);
            return vt.includes('shuttle') || vt.includes('paylaşımlı') || tt === 'shuttle' || m.shuttleRouteId || m.manualRunId;
        });

        const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } });
        const hubs = tenant?.settings?.hubs || [];

        const runs = groupShuttleRuns(shuttles, hubs);
        res.json({ success: true, count: runs.length, data: runs });
    } catch (error) {
        console.error('Partner shuttle-runs error:', error);
        res.status(500).json({ success: false, error: 'Shuttle seferleri alınamadı' });
    }
});

/**
 * PATCH /api/transfer/partner/shuttle-runs/assign
 * Body: { bookingIds: string[], driverId?: string, vehicleId?: string }
 * Bulk assign driver/vehicle to all bookings of a run (strict ownership).
 */
router.patch('/partner/shuttle-runs/assign', authMiddleware, async (req, res) => {
    try {
        if (req.user.roleType !== 'PARTNER') return res.status(403).json({ success: false, error: 'Sadece partner' });
        const partnerId = req.user.id;
        const tenantId = req.tenant?.id || req.user.tenantId;
        const { bookingIds, driverId, vehicleId } = req.body || {};
        if (!Array.isArray(bookingIds) || !bookingIds.length) {
            return res.status(400).json({ success: false, error: 'bookingIds gerekli' });
        }
        if (driverId === undefined && vehicleId === undefined) {
            return res.status(400).json({ success: false, error: 'driverId veya vehicleId gerekli' });
        }
        if (driverId) {
            const d = await prisma.user.findFirst({ where: { id: driverId, partnerId, status: 'ACTIVE' } });
            if (!d) return res.status(400).json({ success: false, error: 'Şoför ekibinizde değil' });
        }
        let vehRow = null;
        if (vehicleId) {
            vehRow = await prisma.vehicle.findFirst({ where: { id: vehicleId, ownerId: partnerId, tenantId, status: 'ACTIVE' } });
            if (!vehRow) return res.status(400).json({ success: false, error: 'Araç size ait değil' });
        }
        // Verify each booking belongs to partner
        const bookings = await prisma.booking.findMany({
            where: { id: { in: bookingIds }, tenantId, confirmedBy: partnerId },
        });
        if (bookings.length !== bookingIds.length) {
            return res.status(403).json({ success: false, error: 'Bazı rezervasyonlar size ait değil' });
        }
        // Apply updates
        const updated = [];
        for (const b of bookings) {
            const newMeta = { ...(b.metadata || {}) };
            if (vehRow) {
                newMeta.assignedVehicleId = vehRow.id;
                newMeta.partnerVehicleId = vehRow.id;
                newMeta.partnerVehiclePlate = vehRow.plateNumber;
            } else if (vehicleId === null) {
                newMeta.assignedVehicleId = null;
                newMeta.partnerVehicleId = null;
                newMeta.partnerVehiclePlate = null;
            }
            if (driverId !== undefined) newMeta.operationalStatus = driverId ? 'DRIVER_ASSIGNED' : (newMeta.operationalStatus || 'CONFIRMED');
            const u = await prisma.booking.update({
                where: { id: b.id },
                data: {
                    driverId: driverId === undefined ? b.driverId : (driverId || null),
                    metadata: newMeta,
                },
                select: { id: true, driverId: true, metadata: true },
            });
            updated.push(u);
        }
        try {
            const io = req.app.get('io');
            if (io && driverId) io.to(`user:${driverId}`).emit('shuttle:assigned', { count: bookingIds.length });
        } catch (_) { /* socket optional */ }
        res.json({ success: true, count: updated.length });
    } catch (error) {
        console.error('Partner shuttle assign error:', error);
        res.status(500).json({ success: false, error: 'Atama yapılamadı' });
    }
});

/**
 * PATCH /api/transfer/partner/shuttle-runs/update
 * Body: { bookingIds, departureTime?, routeName? }
 */
router.patch('/partner/shuttle-runs/update', authMiddleware, async (req, res) => {
    try {
        if (req.user.roleType !== 'PARTNER') return res.status(403).json({ success: false, error: 'Sadece partner' });
        const partnerId = req.user.id;
        const tenantId = req.tenant?.id || req.user.tenantId;
        const { bookingIds, departureTime, routeName } = req.body || {};
        if (!Array.isArray(bookingIds) || !bookingIds.length) {
            return res.status(400).json({ success: false, error: 'bookingIds gerekli' });
        }
        const bookings = await prisma.booking.findMany({
            where: { id: { in: bookingIds }, tenantId, confirmedBy: partnerId },
        });
        if (bookings.length !== bookingIds.length) {
            return res.status(403).json({ success: false, error: 'Bazı rezervasyonlar size ait değil' });
        }
        for (const b of bookings) {
            const meta = { ...(b.metadata || {}) };
            if (departureTime !== undefined) meta.shuttleMasterTime = departureTime || null;
            if (routeName !== undefined) meta.manualRunName = routeName;
            await prisma.booking.update({ where: { id: b.id }, data: { metadata: meta } });
        }
        res.json({ success: true, count: bookings.length });
    } catch (error) {
        console.error('Partner shuttle update error:', error);
        res.status(500).json({ success: false, error: 'Güncelleme yapılamadı' });
    }
});

/**
 * POST /api/transfer/partner/shuttle-runs/sort
 * Body: { bookingIds: string[] (in desired order) }
 */
router.post('/partner/shuttle-runs/sort', authMiddleware, async (req, res) => {
    try {
        if (req.user.roleType !== 'PARTNER') return res.status(403).json({ success: false, error: 'Sadece partner' });
        const partnerId = req.user.id;
        const tenantId = req.tenant?.id || req.user.tenantId;
        const { bookingIds } = req.body || {};
        if (!Array.isArray(bookingIds) || !bookingIds.length) {
            return res.status(400).json({ success: false, error: 'bookingIds gerekli' });
        }
        const bookings = await prisma.booking.findMany({
            where: { id: { in: bookingIds }, tenantId, confirmedBy: partnerId },
        });
        if (bookings.length !== bookingIds.length) {
            return res.status(403).json({ success: false, error: 'Bazı rezervasyonlar size ait değil' });
        }
        for (let i = 0; i < bookingIds.length; i++) {
            const bId = bookingIds[i];
            const cur = bookings.find((b) => b.id === bId);
            if (!cur) continue;
            const meta = { ...(cur.metadata || {}), shuttleSortOrder: i + 1 };
            await prisma.booking.update({ where: { id: bId }, data: { metadata: meta } });
        }
        res.json({ success: true });
    } catch (error) {
        console.error('Partner shuttle sort error:', error);
        res.status(500).json({ success: false, error: 'Sıralama başarısız' });
    }
});

router.get('/partner/active-bookings', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;

        const bookings = await prisma.booking.findMany({
            where: {
                productType: 'TRANSFER',
                status: { in: ['CONFIRMED', 'IN_PROGRESS'] },
                confirmedBy: userId
            },
            include: {
                driver: {
                    select: { id: true, firstName: true, lastName: true, fullName: true, phone: true, avatar: true, lastSeenAt: true }
                }
            },
            orderBy: { startDate: 'asc' }
        });

        const vehicleIds = Array.from(new Set(
            bookings
                .map(b => b.metadata?.assignedVehicleId || b.metadata?.partnerVehicleId)
                .filter(Boolean)
        ));
        const vehicleMap = new Map();
        if (vehicleIds.length) {
            const vehicles = await prisma.vehicle.findMany({
                where: { id: { in: vehicleIds } },
                include: { vehicleType: true }
            });
            vehicles.forEach(v => vehicleMap.set(v.id, v));
        }

        const mappedBookings = bookings.map(b => {
            const vId = b.metadata?.assignedVehicleId || b.metadata?.partnerVehicleId || null;
            const v = vId ? vehicleMap.get(vId) : null;
            const driverIsOnline = b.driver?.lastSeenAt
                ? (Date.now() - new Date(b.driver.lastSeenAt).getTime()) < 10 * 60 * 1000
                : false;
            return {
                id: b.id,
                bookingNumber: b.bookingNumber,
                customer: {
                    name: b.contactName,
                    phone: b.contactPhone,
                    email: b.contactEmail,
                    avatar: (b.contactName || '').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
                },
                pickup: {
                    location: b.metadata?.pickup || 'Belirtilmemiş',
                    time: new Date(b.startDate).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }),
                    timeDate: b.startDate,
                    note: b.specialRequests,
                    lat: b.metadata?.pickupLat ?? null,
                    lng: b.metadata?.pickupLng ?? null,
                    zoneCode: b.metadata?.pickupRegionCode || b.metadata?.pickupZoneCode || null,
                    iata: b.metadata?.pickupIata || b.metadata?.flightIata || null
                },
                flightNumber: b.metadata?.flightNumber,
                flightTime: b.metadata?.flightTime,
                dropoff: {
                    location: b.metadata?.dropoff || 'Belirtilmemiş',
                    dist: b.metadata?.distance || null,
                    duration: b.metadata?.duration || null,
                    lat: b.metadata?.dropoffLat ?? null,
                    lng: b.metadata?.dropoffLng ?? null,
                    zoneCode: b.metadata?.dropoffRegionCode || b.metadata?.dropoffZoneCode || null,
                    iata: b.metadata?.dropoffIata || null
                },
                agencyName: b.metadata?.partnerName || b.metadata?.agencyName || null,
                vehicle: {
                    type: b.metadata?.vehicleType || 'Standart',
                    pax: b.adults,
                    children: b.children || 0,
                    infants: b.infants || 0,
                    luggage: b.metadata?.luggage || 2
                },
                assignedVehicle: v ? {
                    id: v.id,
                    plate: v.plateNumber,
                    brand: v.brand,
                    model: v.model,
                    capacity: v.vehicleType?.capacity || 0,
                    category: v.vehicleType?.category || null
                } : null,
                driver: b.driver ? {
                    id: b.driver.id,
                    name: b.driver.fullName || `${b.driver.firstName || ''} ${b.driver.lastName || ''}`.trim(),
                    phone: b.driver.phone,
                    avatar: b.driver.avatar,
                    isOnline: driverIsOnline,
                    lastSeenAt: b.driver.lastSeenAt
                } : null,
                price: {
                    amount: b.metadata?.poolPrice ? Number(b.metadata.poolPrice) : Number(b.total),
                    currency: b.currency
                },
                paymentStatus: b.paymentStatus,
                status: b.status,
                operationalStatus: b.metadata?.operationalStatus || (b.driverId ? 'DRIVER_ASSIGNED' : 'CONFIRMED'),
                internalNotes: b.internalNotes || b.metadata?.internalNotes || '',
                specialRequests: b.specialRequests || '',
                pickedUpAt: b.pickedUpAt,
                droppedOffAt: b.droppedOffAt,
                createdAt: b.createdAt,
                partnerVehicleId: b.metadata?.partnerVehicleId || null,
                partnerVehiclePlate: b.metadata?.partnerVehiclePlate || null,
                partnerVehicleName: b.metadata?.partnerVehicleName || null
            };
        });

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
                email: b.contactEmail,
                avatar: (b.contactName || '').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
            },
            pickup: {
                location: b.metadata?.pickup || 'Belirtilmemiş',
                time: new Date(b.startDate).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
                timeDate: b.startDate,
            },
            dropoff: {
                location: b.metadata?.dropoff || 'Belirtilmemiş',
            },
            vehicle: {
                type: b.metadata?.vehicleType || 'Standart',
                pax: b.adults,
            },
            price: {
                amount: b.metadata?.poolPrice ? Number(b.metadata.poolPrice) : Number(b.total),
                currency: b.currency,
                commissionRate: b.metadata?.partnerCommissionRate !== undefined ? Number(b.metadata.partnerCommissionRate) : null,
                commissionAmount: b.metadata?.partnerCommissionAmount !== undefined ? Number(b.metadata.partnerCommissionAmount) : 0,
                netEarning: b.metadata?.partnerNetEarning !== undefined ? Number(b.metadata.partnerNetEarning) : (b.metadata?.poolPrice ? Number(b.metadata.poolPrice) : Number(b.total))
            },
            status: b.status,
            operationalStatus: 'COMPLETED',
            paymentStatus: b.paymentStatus,
            completedAt: b.updatedAt,
            internalNotes: b.internalNotes || b.metadata?.internalNotes || ''
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
                pickupLat, pickupLng, dropoffLat, dropoffLng,
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

        const patchTenantId = requireTenantId(req, res);
        if (!patchTenantId) return;

        const currentBooking = await findBookingForTenant(id, patchTenantId);
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
        if (pickupLat !== undefined) newMetadata.pickupLat = pickupLat != null ? Number(pickupLat) : null;
        if (pickupLng !== undefined) newMetadata.pickupLng = pickupLng != null ? Number(pickupLng) : null;
        if (dropoffLat !== undefined) newMetadata.dropoffLat = dropoffLat != null ? Number(dropoffLat) : null;
        if (dropoffLng !== undefined) newMetadata.dropoffLng = dropoffLng != null ? Number(dropoffLng) : null;

        // ── Recompute region codes & tripType when pickup/dropoff/coords change ──
        const pickupChanged = pickupLocation !== undefined || pickupLat !== undefined || pickupLng !== undefined;
        const dropoffChanged = dropoffLocation !== undefined || dropoffLat !== undefined || dropoffLng !== undefined;
        if (pickupChanged || dropoffChanged) {
            try {
                const tenantIdForZones = currentBooking.tenantId || req.tenant?.id;
                const hubsForRegion = await loadTenantHubs(tenantIdForZones);
                const zonesForRegion = await prisma.zone.findMany({
                    where: { tenantId: tenantIdForZones, code: { not: null } },
                    select: { id: true, code: true, name: true, keywords: true, polygon: true }
                });
                const airportZones = hubsForRegion.filter(h => h.isAirport);

                const effPickup = newMetadata.pickup || '';
                const effDropoff = newMetadata.dropoff || '';
                const effPickupLat = newMetadata.pickupLat;
                const effPickupLng = newMetadata.pickupLng;
                const effDropoffLat = newMetadata.dropoffLat;
                const effDropoffLng = newMetadata.dropoffLng;

                if (pickupChanged) {
                    const newPickupRegionCode = detectRegionCodeByPolygon(effPickupLat, effPickupLng, effPickup, zonesForRegion, hubsForRegion);
                    newMetadata.pickupRegionCode = newPickupRegionCode || null;
                }
                if (dropoffChanged) {
                    const newDropoffRegionCode = detectRegionCodeByPolygon(effDropoffLat, effDropoffLng, effDropoff, zonesForRegion, hubsForRegion);
                    newMetadata.dropoffRegionCode = newDropoffRegionCode || null;
                }
                // Recompute tripType (DEP / ARV / ARA) based on which side is airport
                newMetadata.tripType = getTripType(effPickup, effDropoff, airportZones);
                console.log(`[PATCH booking] Recomputed regions: pickup=${newMetadata.pickupRegionCode} dropoff=${newMetadata.dropoffRegionCode} tripType=${newMetadata.tripType}`);
            } catch (regionErr) {
                console.error('[PATCH booking] Region recomputation failed:', regionErr.message);
            }
        }

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

        // ── Explicit Activity Log ──
        try {
            const { logActivity } = require('../utils/logger');
            const changes = [];
            if (driverId !== undefined) {
                if (driverId) {
                    const driverInfo = await prisma.user.findUnique({ where: { id: driverId }, select: { fullName: true } });
                    changes.push(`Şoför atandı: ${driverInfo?.fullName || driverId}`);
                } else {
                    changes.push('Şoför kaldırıldı');
                }
            }
            if (resolvedVehicleId) changes.push(`Araç atandı: ${resolvedVehicleId}`);
            if (contactName !== undefined) changes.push(`İsim: ${req._auditPreviousState?.contactName} → ${contactName}`);
            if (contactPhone !== undefined) changes.push(`Telefon: ${req._auditPreviousState?.contactPhone} → ${contactPhone}`);
            if (pickupDateTime !== undefined) changes.push(`Transfer zamanı güncellendi`);
            if (pickupLocation !== undefined) changes.push(`Alış yeri: ${pickupLocation}`);
            if (dropoffLocation !== undefined) changes.push(`Bırakış yeri: ${dropoffLocation}`);
            if (flightNumber !== undefined) changes.push(`Uçuş no: ${flightNumber}`);
            if (price !== undefined) changes.push(`Fiyat: ${req._auditPreviousState?.price} → ${price}`);
            if (newStatus !== undefined) changes.push(`Durum: ${req._auditPreviousState?.status} → ${newStatus}`);
            if (operationalStatus !== undefined) changes.push(`Operasyon durumu: ${operationalStatus}`);
            if (internalNotes !== undefined) changes.push(`İç not güncellendi`);
            if (returnToReservation) changes.push(`Rezervasyona iade edildi: ${returnReason || '-'}`);
            if (adults !== undefined || children !== undefined || infants !== undefined) changes.push(`Yolcu sayısı güncellendi: ${adults||'-'}Y ${children||0}Ç ${infants||0}B`);
            if (passengerDetails) changes.push(`Yolcu detayları güncellendi`);

            await logActivity({
                tenantId: req.tenant?.id,
                userId: req.user?.id,
                userEmail: req.user?.email,
                action: driverId !== undefined ? 'ASSIGN_DRIVER' : returnToReservation ? 'RETURN_TO_RESERVATION' : 'UPDATE_BOOKING',
                entityType: 'Booking',
                entityId: id,
                details: {
                    message: changes.join(' | ') || 'Rezervasyon güncellendi',
                    changes,
                    previousState: req._auditPreviousState,
                    bookingNumber: updated.bookingNumber
                },
                ipAddress: req.headers['x-forwarded-for'] || req.socket?.remoteAddress
            });
        } catch (logErr) {
            console.error('[BookingLog] Failed:', logErr.message);
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
            extraServices, extrasTotal, vehiclePrice,
            agencyId, agencyName,
            // Round-trip
            returnLeg, tripType: clientTripType
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
            tripType: getTripType(pickup, dropoff, hubs.filter(h => h.isAirport)),
            isRoundTrip: clientTripType === 'ROUND_TRIP' && !!returnLeg,
            agencyName: agencyName || null
        };

        // Outbound total excludes return leg to avoid double-counting in reports.
        // Extras stay on outbound only (we zero them out on return leg).
        const outboundTotal = (clientTripType === 'ROUND_TRIP' && returnLeg?.price)
            ? Number(price || 0) - Number(returnLeg.price || 0)
            : Number(price || 0);

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
                total: outboundTotal,
                subtotal: outboundTotal,
                tax: 0,
                serviceFee: 0,
                contactName: passengerName || 'Misafir',
                contactEmail: passengerEmail || '',
                contactPhone: passengerPhone || '',
                adults: Number(adults || 1),
                children: Number(children || 0),
                infants: Number(infants || 0),
                specialRequests: notes || '',

                // Booking Type & Creator
                bookingType: agencyId ? 'B2B' : 'SYSTEM',
                bookedByUserId: req.user?.id || null,
                bookedByName: [req.user?.firstName, req.user?.lastName].filter(Boolean).join(' ') || req.user?.email || 'Sistem',

                // Agency
                agencyId: agencyId || null,

                metadata: metadata,
            }
        });

        // ── Round-trip: create linked return-leg booking (-D) ──
        let returnBooking = null;
        if (clientTripType === 'ROUND_TRIP' && returnLeg && returnLeg.pickupDateTime) {
            try {
                const returnBookingNumber = `${booking.bookingNumber}-D`;
                const rPickupRegion = detectRegionCodeByPolygon(returnLeg.pickupLat, returnLeg.pickupLng, returnLeg.pickup, zonesForRegionAdmin, hubs);
                const rDropoffRegion = detectRegionCodeByPolygon(returnLeg.dropoffLat, returnLeg.dropoffLng, returnLeg.dropoff, zonesForRegionAdmin, hubs);
                const returnMetadata = {
                    pickup: returnLeg.pickup,
                    dropoff: returnLeg.dropoff,
                    flightNumber: flightNumber || '',
                    vehicleType: returnLeg.vehicleType,
                    passengerName,
                    creationSource: 'ADMIN_MANUAL',
                    pickupRegionCode: rPickupRegion || null,
                    dropoffRegionCode: rDropoffRegion || null,
                    paymentMethod: paymentMethod || 'PAY_IN_VEHICLE',
                    pickupLat: returnLeg.pickupLat != null ? Number(returnLeg.pickupLat) : null,
                    pickupLng: returnLeg.pickupLng != null ? Number(returnLeg.pickupLng) : null,
                    dropoffLat: returnLeg.dropoffLat != null ? Number(returnLeg.dropoffLat) : null,
                    dropoffLng: returnLeg.dropoffLng != null ? Number(returnLeg.dropoffLng) : null,
                    isShuttle: !!returnLeg.isShuttle,
                    shuttleRouteId: returnLeg.shuttleRouteId || null,
                    shuttleMasterTime: returnLeg.shuttleMasterTime || null,
                    passengerDetails: Array.isArray(passengerDetails) ? passengerDetails : [],
                    extraServices: [], // extras belong only to outbound to avoid double billing
                    extrasTotal: 0,
                    vehiclePrice: Number(returnLeg.price || 0),
                    tripType: getTripType(returnLeg.pickup, returnLeg.dropoff, hubs.filter(h => h.isAirport)),
                    isRoundTrip: true,
                    linkedBookingId: booking.id,
                    linkedBookingNumber: booking.bookingNumber,
                    agencyName: agencyName || null
                };
                returnBooking = await prisma.booking.create({
                    data: {
                        tenantId,
                        bookingNumber: returnBookingNumber,
                        productType: 'TRANSFER',
                        status: 'CONFIRMED',
                        paymentStatus: 'PENDING',
                        startDate: new Date(returnLeg.pickupDateTime),
                        endDate: new Date(returnLeg.pickupDateTime),
                        currency: returnLeg.currency || currency || 'TRY',
                        total: Number(returnLeg.price || 0),
                        subtotal: Number(returnLeg.price || 0),
                        tax: 0,
                        serviceFee: 0,
                        contactName: passengerName || 'Misafir',
                        contactEmail: passengerEmail || '',
                        contactPhone: passengerPhone || '',
                        adults: Number(adults || 1),
                        children: Number(children || 0),
                        infants: Number(infants || 0),
                        specialRequests: notes || '',
                        bookingType: agencyId ? 'B2B' : 'SYSTEM',
                        bookedByUserId: req.user?.id || null,
                        bookedByName: [req.user?.firstName, req.user?.lastName].filter(Boolean).join(' ') || req.user?.email || 'Sistem',
                        agencyId: agencyId || null,
                        metadata: returnMetadata,
                    }
                });
                // Backfill outbound metadata with linked return id
                await prisma.booking.update({
                    where: { id: booking.id },
                    data: {
                        metadata: {
                            ...(booking.metadata || {}),
                            linkedBookingId: returnBooking.id,
                            linkedBookingNumber: returnBooking.bookingNumber,
                        }
                    }
                });
            } catch (rtErr) {
                console.error('[RoundTrip-Admin] Return leg creation failed (non-blocking):', rtErr);
            }
        }

        // ── Agency Transaction record (sub-agency assignment audit) ──
        if (agencyId) {
            try {
                const totalAmount = Number(price || 0) + Number(returnLeg?.price || 0);
                await prisma.transaction.create({
                    data: {
                        tenantId,
                        accountId: `agency-${agencyId}`,
                        type: 'SALES_INVOICE',
                        amount: totalAmount,
                        currency: currency || 'TRY',
                        isCredit: true,
                        description: `Admin tarafından oluşturulan rezervasyon (${booking.bookingNumber}${returnBooking ? ' + ' + returnBooking.bookingNumber : ''})`,
                        date: new Date(),
                        referenceId: booking.id,
                    }
                });
            } catch (txErr) {
                console.error('[AgencyTx-Admin] Transaction record failed (non-blocking):', txErr);
            }
        }

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

        // ── Explicit Activity Log for creation ──
        try {
            const { logActivity } = require('../utils/logger');
            await logActivity({
                tenantId,
                userId: req.user?.id,
                userEmail: req.user?.email,
                action: 'CREATE_BOOKING',
                entityType: 'Booking',
                entityId: finalBooking.id,
                details: {
                    message: `${passengerName || 'Misafir'} — ${finalBooking.bookingNumber} rezervasyonu oluşturuldu.${agencyId ? ' (Acente: ' + (agencyName || agencyId) + ')' : ''}`,
                    bookingNumber: finalBooking.bookingNumber,
                    source: agencyId ? 'B2B' : 'SYSTEM',
                    pickup, dropoff, vehicleType,
                    price: Number(price || 0),
                    currency: currency || 'TRY'
                },
                ipAddress: req.headers['x-forwarded-for'] || req.socket?.remoteAddress
            });
        } catch (logErr) {
            console.error('[BookingLog] Create log failed:', logErr.message);
        }

        res.json({ success: true, data: finalBooking });
    } catch (error) {
        console.error('Create booking admin error:', error);
        const detail = error?.message || String(error);
        res.status(500).json({
            success: false,
            error: 'Rezervasyon oluşturulamadı: ' + detail,
            code: error?.code || undefined,
            detail
        });
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

        const adminTenantId = requireTenantId(req, res);
        if (!adminTenantId) return;
        if (!requireAdmin(req, res)) return;

        const currentBooking = await findBookingForTenant(id, adminTenantId);
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

        const tenantId = requireTenantId(req, res);
        if (!tenantId) return;

        const currentBooking = await findBookingForTenant(id, tenantId);

        if (!currentBooking) {
            return res.status(404).json({
                success: false,
                error: 'Rezervasyon bulunamadı'
            });
        }

        // ── Partner vehicle capacity validation ──
        if (status === 'CONFIRMED' && req.user?.roleType === 'PARTNER') {
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

            // Agency Cari Hesap Reversal on Cancellation
            if (status === 'CANCELLED' && currentBooking.agencyId && currentBooking.status !== 'CANCELLED') {
                const b2bCost = Number(currentBooking.subtotal || 0);
                const customerPrice = Number(currentBooking.total || 0);
                const markupAmt = customerPrice - b2bCost;
                const bookingCur = currentBooking.currency || 'TRY';
                const payMethod = currentBooking.metadata?.paymentMethod || 'BALANCE';

                if (b2bCost > 0) {
                    // Reverse the B2B debit (credit back to agency)
                    await tx.transaction.create({
                        data: {
                            tenantId: req.tenant.id,
                            accountId: `agency-${currentBooking.agencyId}`,
                            type: 'PAYMENT_RECEIVED',
                            amount: b2bCost,
                            currency: bookingCur,
                            isCredit: true,
                            description: `Admin İptali – B2B Maliyet İadesi (PNR: ${currentBooking.bookingNumber})`,
                            date: new Date(),
                            referenceId: currentBooking.id
                        }
                    });

                    // Reverse commission/markup if any
                    if (markupAmt > 0) {
                        await tx.transaction.create({
                            data: {
                                tenantId: req.tenant.id,
                                accountId: `agency-${currentBooking.agencyId}`,
                                type: 'PAYMENT_SENT',
                                amount: markupAmt,
                                currency: bookingCur,
                                isCredit: false,
                                description: `Admin İptali – Komisyon İptali (PNR: ${currentBooking.bookingNumber})`,
                                date: new Date(),
                                referenceId: currentBooking.id
                            }
                        });
                    }

                    // Restore agency balance counters
                    if (payMethod === 'BALANCE') {
                        await tx.agency.update({
                            where: { id: currentBooking.agencyId },
                            data: {
                                balance: { increment: b2bCost },
                                debit: { decrement: b2bCost },
                                ...(markupAmt > 0 ? { credit: { decrement: markupAmt } } : {})
                            }
                        });
                    } else {
                        await tx.agency.update({
                            where: { id: currentBooking.agencyId },
                            data: {
                                debit: { decrement: b2bCost },
                                ...(markupAmt > 0 ? { credit: { decrement: markupAmt } } : {})
                            }
                        });
                    }
                }
            }

            // Custom Auditing for all status changes
            {
                const { logActivity } = require('../utils/logger');
                const guestName = currentBooking.contactName || currentBooking.fullName || currentBooking.metadata?.passengerName || 'Misafir';
                const pnr = currentBooking.bookingNumber || id;
                let logAction = 'UPDATE_BOOKING_STATUS';
                let logMsg = '';

                if (status === 'CANCELLED') {
                    logAction = 'CANCEL_BOOKING';
                    const reason = req.body.cancellationReason || '';
                    const note = req.body.cancellationNote || '';
                    logMsg = `${guestName} — ${pnr} rezervasyonu iptal edildi.${reason ? ' Sebep: ' + reason : ''}${note ? ' Not: ' + note : ''}`;
                } else if (status === 'CONFIRMED' && subStatus === 'IN_OPERATION') {
                    logAction = 'CONFIRM_TO_OPERATION';
                    logMsg = `${guestName} — ${pnr} onaylandı ve operasyona aktarıldı.`;
                } else if (status === 'CONFIRMED' && subStatus === 'IN_POOL') {
                    logAction = 'CONFIRM_TO_POOL';
                    logMsg = `${guestName} — ${pnr} onaylandı ve havuza aktarıldı.${poolPrice ? ' Havuz fiyatı: ' + poolPrice : ''}`;
                } else if (status === 'CONFIRMED') {
                    logAction = 'CONFIRM_BOOKING';
                    logMsg = `${guestName} — ${pnr} onaylandı.`;
                } else if (status === 'COMPLETED') {
                    logAction = 'COMPLETE_BOOKING';
                    logMsg = `${guestName} — ${pnr} tamamlandı.`;
                } else if (status === 'NO_SHOW') {
                    logAction = 'NO_SHOW_BOOKING';
                    logMsg = `${guestName} — ${pnr} gelmedi olarak işaretlendi.`;
                } else {
                    logMsg = `${guestName} — ${pnr} durum değişikliği: ${currentBooking.status} → ${status}${subStatus ? ' (' + subStatus + ')' : ''}`;
                }

                await logActivity({
                    tenantId: req.tenant.id,
                    userId: req.user?.id,
                    userEmail: req.user?.email,
                    action: logAction,
                    entityType: 'Booking',
                    entityId: id,
                    details: {
                        message: logMsg,
                        previousStatus: currentBooking.status,
                        newStatus: status,
                        subStatus: subStatus || null,
                        previousState: req._auditPreviousState,
                        bookingNumber: pnr
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
                const fullBooking = await prisma.booking.findFirst({
                    where: { id, tenantId: req.user.tenantId },
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
/**
 * GET /api/transfer/partner/operations/fleet
 * Combined drivers + vehicles for the partner operations screen
 */
router.get('/partner/operations/fleet', authMiddleware, async (req, res) => {
    try {
        const partnerId = req.user.id;
        const tenantId = req.tenant?.id || req.user.tenantId;

        const [drivers, vehicles] = await Promise.all([
            prisma.user.findMany({
                where: { partnerId, deletedAt: null, status: 'ACTIVE' },
                select: {
                    id: true, firstName: true, lastName: true, fullName: true,
                    phone: true, avatar: true, lastSeenAt: true
                },
                orderBy: { firstName: 'asc' }
            }),
            prisma.vehicle.findMany({
                where: { tenantId, ownerId: partnerId, status: 'ACTIVE' },
                include: { vehicleType: true },
                orderBy: { plateNumber: 'asc' }
            })
        ]);

        const driversOut = drivers.map(d => ({
            id: d.id,
            name: d.fullName || `${d.firstName || ''} ${d.lastName || ''}`.trim(),
            firstName: d.firstName,
            lastName: d.lastName,
            phone: d.phone,
            avatar: d.avatar,
            isOnline: d.lastSeenAt ? (Date.now() - new Date(d.lastSeenAt).getTime()) < 10 * 60 * 1000 : false,
            lastSeenAt: d.lastSeenAt
        }));

        const vehiclesOut = vehicles.map(v => ({
            id: v.id,
            plate: v.plateNumber,
            brand: v.brand,
            model: v.model,
            capacity: v.vehicleType?.capacity || 0,
            category: v.vehicleType?.category || null,
            driverId: v.metadata?.driverId || null
        }));

        res.json({ success: true, data: { drivers: driversOut, vehicles: vehiclesOut } });
    } catch (error) {
        console.error('Partner operations fleet error:', error);
        res.status(500).json({ success: false, error: 'Filo bilgisi alınamadı' });
    }
});

/**
 * Helper: ensure partner owns the booking (confirmedBy === partner)
 */
async function ensurePartnerOwnsBooking(bookingId, partnerId) {
    const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking) return { ok: false, status: 404, error: 'Rezervasyon bulunamadı' };
    if (booking.confirmedBy !== partnerId) {
        return { ok: false, status: 403, error: 'Bu rezervasyon size ait değil' };
    }
    return { ok: true, booking };
}

/**
 * PATCH /api/transfer/partner/operations/:id/assign
 * Assign driver and/or vehicle (with ownership checks)
 */
router.patch('/partner/operations/:id/assign', authMiddleware, async (req, res) => {
    try {
        const partnerId = req.user.id;
        const tenantId = req.tenant?.id || req.user.tenantId;
        const { id } = req.params;
        const { driverId, vehicleId } = req.body;

        const own = await ensurePartnerOwnsBooking(id, partnerId);
        if (!own.ok) return res.status(own.status).json({ success: false, error: own.error });

        if (driverId) {
            const driver = await prisma.user.findFirst({
                where: { id: driverId, partnerId, status: 'ACTIVE' }
            });
            if (!driver) {
                return res.status(400).json({ success: false, error: 'Şoför ekibinizde bulunmuyor veya pasif' });
            }
        }

        let vehicleRow = null;
        if (vehicleId) {
            vehicleRow = await prisma.vehicle.findFirst({
                where: { id: vehicleId, ownerId: partnerId, tenantId, status: 'ACTIVE' },
                include: { vehicleType: true }
            });
            if (!vehicleRow) {
                return res.status(400).json({ success: false, error: 'Araç size ait değil veya pasif' });
            }
        }

        const newMetadata = {
            ...(own.booking.metadata || {}),
            assignedByPartnerId: partnerId,
            assignedVehicleId: vehicleId ?? own.booking.metadata?.assignedVehicleId ?? null,
            partnerVehicleId: vehicleId ?? own.booking.metadata?.partnerVehicleId ?? null,
            partnerVehiclePlate: vehicleRow ? vehicleRow.plateNumber : own.booking.metadata?.partnerVehiclePlate ?? null,
            partnerVehicleName: vehicleRow ? `${vehicleRow.brand} ${vehicleRow.model}` : own.booking.metadata?.partnerVehicleName ?? null,
            assignedAt: new Date().toISOString(),
            operationalStatus: driverId ? 'DRIVER_ASSIGNED' : (own.booking.metadata?.operationalStatus || 'CONFIRMED')
        };

        const updated = await prisma.booking.update({
            where: { id },
            data: {
                driverId: driverId === null ? null : (driverId ?? own.booking.driverId),
                metadata: newMetadata
            }
        });

        try {
            const io = req.app.get('io');
            if (io && driverId) {
                io.to(`user:${driverId}`).emit('booking:assigned', { bookingId: id });
            }
        } catch (e) { /* socket optional */ }

        res.json({ success: true, data: { id: updated.id, driverId: updated.driverId, metadata: updated.metadata } });
    } catch (error) {
        console.error('Partner operations assign error:', error);
        res.status(500).json({ success: false, error: 'Atama yapılamadı' });
    }
});

/**
 * PATCH /api/transfer/partner/operations/:id/status
 * Operational status transitions for the partner-owned booking
 */
router.patch('/partner/operations/:id/status', authMiddleware, async (req, res) => {
    try {
        const partnerId = req.user.id;
        const { id } = req.params;
        const { operationalStatus, status, subStatus, cancelReason } = req.body;

        const own = await ensurePartnerOwnsBooking(id, partnerId);
        if (!own.ok) return res.status(own.status).json({ success: false, error: own.error });

        const updateData = { metadata: { ...(own.booking.metadata || {}) } };
        if (operationalStatus) updateData.metadata.operationalStatus = operationalStatus;
        if (cancelReason) updateData.metadata.cancelReason = cancelReason;

        if (operationalStatus === 'PASSENGER_PICKED_UP' && !own.booking.pickedUpAt) {
            updateData.pickedUpAt = new Date();
        }
        if (operationalStatus === 'COMPLETED') {
            updateData.droppedOffAt = new Date();
        }

        if (status === 'COMPLETED') {
            updateData.status = 'COMPLETED';
            updateData.metadata.operationalStatus = 'COMPLETED';
            updateData.droppedOffAt = new Date();
        }
        if (status === 'CANCELLED') {
            updateData.status = 'CANCELLED';
            updateData.metadata.operationalStatus = 'CANCELLED';
            if (subStatus) updateData.metadata.cancelSubStatus = subStatus;
        }
        if (status === 'IN_PROGRESS') {
            updateData.status = 'IN_PROGRESS';
        }
        if (status === 'PENDING') {
            updateData.status = 'PENDING';
            updateData.confirmedBy = null;
            updateData.confirmedAt = null;
            updateData.driverId = null;
            updateData.metadata.operationalStatus = null;
            updateData.metadata.partnerVehicleId = null;
            updateData.metadata.partnerVehiclePlate = null;
            updateData.metadata.partnerVehicleName = null;
            updateData.metadata.assignedVehicleId = null;
        }

        const updated = await prisma.booking.update({
            where: { id },
            data: updateData
        });

        try {
            const io = req.app.get('io');
            if (io) io.emit('booking:status', { bookingId: id, status: updated.status, operationalStatus: updated.metadata?.operationalStatus });
        } catch (e) { /* socket optional */ }

        res.json({ success: true, data: { id: updated.id, status: updated.status, metadata: updated.metadata } });
    } catch (error) {
        console.error('Partner operations status error:', error);
        res.status(500).json({ success: false, error: 'Durum güncellenemedi' });
    }
});

/**
 * PATCH /api/transfer/partner/operations/:id/note
 * Update operational note (internalNotes)
 */
router.patch('/partner/operations/:id/note', authMiddleware, async (req, res) => {
    try {
        const partnerId = req.user.id;
        const { id } = req.params;
        const { internalNotes } = req.body;

        const own = await ensurePartnerOwnsBooking(id, partnerId);
        if (!own.ok) return res.status(own.status).json({ success: false, error: own.error });

        const updated = await prisma.booking.update({
            where: { id },
            data: {
                internalNotes: internalNotes ?? '',
                metadata: { ...(own.booking.metadata || {}), internalNotes: internalNotes ?? '' }
            }
        });

        res.json({ success: true, data: { id: updated.id, internalNotes: updated.internalNotes } });
    } catch (error) {
        console.error('Partner operations note error:', error);
        res.status(500).json({ success: false, error: 'Not güncellenemedi' });
    }
});

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

        const assignTenantId = requireTenantId(req, res);
        if (!assignTenantId) return;

        // Get booking
        const booking = await findBookingForTenant(bookingId, assignTenantId);
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
        let { airport, date } = req.query;

        // SECURITY: If the caller is AIRPORT_STAFF, force the airport filter
        // to the zone they were assigned to. They must never see bookings
        // landing at other airports.
        if (req.user?.roleType === 'AIRPORT_STAFF' || req.user?.roleCode === 'AIRPORT_STAFF') {
            const personnel = await prisma.personnel.findFirst({
                where: { userId: req.user.id, deletedAt: null },
                select: { assignedAirportZoneId: true }
            });
            if (!personnel?.assignedAirportZoneId) {
                return res.status(403).json({
                    success: false,
                    error: 'Karşılama personeline atanmış bir havalimanı bulunamadı. Yöneticinize başvurun.'
                });
            }
            const zone = await prisma.zone.findUnique({
                where: { id: personnel.assignedAirportZoneId },
                select: { code: true, name: true, keywords: true, isAirport: true }
            });
            if (!zone || !zone.isAirport) {
                return res.status(403).json({
                    success: false,
                    error: 'Atanmış havalimanı geçersiz veya artık havalimanı tipinde değil.'
                });
            }
            // Override the airport query param with the staff's assigned airport code
            airport = (zone.code || zone.name || '').toString();
        }

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
            // Airport filter — match by pickupRegionCode first, then fallback to text
            if (airport) {
                const ap = airport.toLowerCase();
                const regionCode = (b.metadata?.pickupRegionCode || '').toLowerCase();
                if (regionCode && regionCode === ap) return true;
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

        // Helper: phone is revealed only when the flight has actually landed
        // OR the customer has been met / handed off. Pre-landing the contact
        // info is masked to prevent greeting personnel from poaching customers.
        const maskPhone = (raw) => {
            if (!raw) return null;
            const digits = String(raw).replace(/[^0-9+]/g, '');
            if (digits.length < 4) return '***';
            const last4 = digits.slice(-4);
            return `*** *** **${last4}`;
        };

        const mapped = arrivals.map(b => {
            const vehId = b.metadata?.assignedVehicleId || b.metadata?.vehicleId || null;
            const vehicle = vehId ? vehicleMap[vehId] : null;
            const greetingStatus = b.metadata?.greetingStatus || 'WAITING';
            const flightStatus = b.metadata?.flightStatus || 'ON_TIME';
            const phoneRevealed = (
                flightStatus === 'LANDED' ||
                !!b.metadata?.actualLanding ||
                ['LANDED', 'MET', 'HANDED_OFF'].includes(greetingStatus)
            );
            const fullPhone = b.contactPhone || null;
            return {
                id: b.id,
                bookingNumber: b.bookingNumber,
                status: b.status,
                // Flight
                flightNumber: b.metadata?.flightNumber || null,
                flightTime: b.metadata?.flightTime || null,
                // Customer
                passengerName: b.contactName,
                // Phone redaction: reveal only after the flight has landed.
                // Frontend can call /airport-greeting/reveal-phone to get the full number on demand
                // (audited). Pre-landing only a masked tail is exposed.
                passengerPhone: phoneRevealed ? fullPhone : null,
                passengerPhoneMasked: phoneRevealed ? null : maskPhone(fullPhone),
                phoneRevealed,
                // Email is also withheld until landing to prevent off-platform contact
                contactEmail: phoneRevealed ? b.contactEmail : null,
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
                manualRunName: b.metadata?.manualRunName || null,
                pickupRegionCode: b.metadata?.pickupRegionCode || null,
                dropoffRegionCode: b.metadata?.dropoffRegionCode || null,
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

        const tenantId = requireTenantId(req, res);
        if (!tenantId) return;

        const booking = await findBookingForTenant(bookingId, tenantId);
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

        const tenantId = requireTenantId(req, res);
        if (!tenantId) return;

        const booking = await findBookingForTenant(bookingId, tenantId);
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

/**
 * POST /api/transfer/airport-greeting/reveal-phone
 * Body: { bookingId }
 * Returns the full passenger phone number IFF the flight has landed (or
 * the customer has been met / handed off, or pickup time has already passed).
 * Every reveal is audited in booking.metadata.phoneReveals[] for fraud review.
 */
router.post('/airport-greeting/reveal-phone', authMiddleware, async (req, res) => {
    try {
        const { bookingId, reason } = req.body || {};
        if (!bookingId) {
            return res.status(400).json({ success: false, error: 'bookingId gereklidir' });
        }

        const tenantId = requireTenantId(req, res);
        if (!tenantId) return;

        const booking = await findBookingForTenant(bookingId, tenantId);
        if (!booking) return res.status(404).json({ success: false, error: 'Rezervasyon bulunamadı' });

        const meta = booking.metadata || {};
        const greetingStatus = meta.greetingStatus || 'WAITING';
        const flightStatus = meta.flightStatus || 'ON_TIME';
        const pickupPassed = booking.startDate && new Date(booking.startDate).getTime() <= Date.now();
        const allowed = (
            flightStatus === 'LANDED' ||
            !!meta.actualLanding ||
            ['LANDED', 'MET', 'HANDED_OFF'].includes(greetingStatus) ||
            pickupPassed
        );

        if (!allowed) {
            return res.status(403).json({
                success: false,
                error: 'Müşteri telefonu uçak inmeden gösterilemez',
                code: 'PHONE_LOCKED'
            });
        }

        // Audit the reveal
        const reveals = Array.isArray(meta.phoneReveals) ? meta.phoneReveals : [];
        reveals.push({
            by: req.user.id,
            byName: `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || req.user.email || null,
            at: new Date().toISOString(),
            ip: req.headers['x-forwarded-for'] || req.ip || null,
            userAgent: req.headers['user-agent'] || null,
            reason: reason || null,
            greetingStatus,
            flightStatus,
        });
        await prisma.booking.update({
            where: { id: bookingId },
            data: { metadata: { ...meta, phoneReveals: reveals } }
        });

        res.json({
            success: true,
            data: {
                passengerPhone: booking.contactPhone || null,
                contactEmail: booking.contactEmail || null,
                revealCount: reveals.length,
            }
        });
    } catch (error) {
        console.error('[Airport] reveal-phone error:', error);
        res.status(500).json({ success: false, error: 'Telefon açılamadı' });
    }
});

/**
 * GET /api/transfer/airport-greeting/driver-locations
 * Returns live locations of drivers assigned to today's airport-arrival
 * bookings whose pickup is within the next 60 minutes (or already in progress).
 * Used by greeting personnel to anticipate delays.
 */
router.get('/airport-greeting/driver-locations', authMiddleware, async (req, res) => {
    try {
        const tenantId = req.user.tenantId || req.tenant?.id;
        if (!tenantId) return res.status(400).json({ success: false, error: 'Tenant bulunamadı' });

        const now = new Date();
        const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(now); dayEnd.setHours(23, 59, 59, 999);
        const horizon = new Date(now.getTime() + 60 * 60 * 1000); // +60 min

        const bookings = await prisma.booking.findMany({
            where: {
                tenantId,
                productType: 'TRANSFER',
                startDate: { gte: dayStart, lte: dayEnd },
                status: { in: ['CONFIRMED', 'PENDING', 'IN_PROGRESS'] },
                driverId: { not: null }
            },
            select: {
                id: true, bookingNumber: true, startDate: true, status: true,
                driverId: true, contactName: true, metadata: true
            }
        });

        // Keep only ARV (airport pickup) bookings
        const arrivals = bookings.filter(b => {
            const pickup = (b.metadata?.pickup || '').toLowerCase();
            return AIRPORT_KEYWORDS.some(kw => pickup.includes(kw));
        });

        // Group by driver, only keep drivers whose ANY assigned booking is within +60 min OR IN_PROGRESS
        const byDriver = {};
        arrivals.forEach(b => {
            const startTs = b.startDate ? new Date(b.startDate).getTime() : 0;
            const within60 = startTs >= now.getTime() - 30 * 60 * 1000 && startTs <= horizon.getTime();
            const inProgress = b.status === 'IN_PROGRESS';
            if (!within60 && !inProgress) return;
            if (!byDriver[b.driverId]) byDriver[b.driverId] = [];
            byDriver[b.driverId].push({
                id: b.id,
                bookingNumber: b.bookingNumber,
                pickupDateTime: b.startDate,
                contactName: b.contactName,
                vehicleType: b.metadata?.vehicleType || null,
                vehiclePlate: b.metadata?.vehiclePlate || null,
                shuttleRouteId: b.metadata?.shuttleRouteId || null,
                manualRunId: b.metadata?.manualRunId || null,
                status: b.status,
                greetingStatus: b.metadata?.greetingStatus || 'WAITING',
            });
        });

        const driverIds = Object.keys(byDriver);
        if (driverIds.length === 0) {
            return res.json({ success: true, data: [] });
        }

        const drivers = await prisma.user.findMany({
            where: { id: { in: driverIds } },
            select: { id: true, fullName: true, phone: true, avatar: true, lastSeenAt: true, metadata: true }
        });

        // Vehicles for plate display
        const vehicles = await prisma.vehicle.findMany({
            where: { tenantId, status: 'ACTIVE' },
            select: { id: true, plateNumber: true, brand: true, model: true, metadata: true }
        });
        const vehicleByDriver = {};
        vehicles.forEach(v => { if (v.metadata?.driverId) vehicleByDriver[v.metadata.driverId] = v; });

        const onlineDrivers = req.app.get('onlineDrivers') || {};

        const result = drivers.map(d => {
            const info = onlineDrivers[d.id];
            const dm = d.metadata || {};
            const location = info?.location || (
                dm.lastLat && dm.lastLng
                    ? { lat: Number(dm.lastLat), lng: Number(dm.lastLng), heading: dm.lastHeading || 0, speed: dm.lastSpeed || 0 }
                    : null
            );
            const lastSeen = info?.lastSeen || (d.lastSeenAt ? new Date(d.lastSeenAt).getTime() : null);
            const v = vehicleByDriver[d.id];
            return {
                driverId: d.id,
                name: d.fullName,
                phone: d.phone,
                avatar: d.avatar,
                online: !!info,
                lastSeen,
                location,
                vehicle: v ? {
                    id: v.id,
                    plate: v.plateNumber,
                    brand: `${v.brand || ''} ${v.model || ''}`.trim()
                } : null,
                bookings: byDriver[d.id] || [],
            };
        });

        res.json({ success: true, data: result });
    } catch (error) {
        console.error('[Airport] driver-locations error:', error);
        res.status(500).json({ success: false, error: 'Şoför konumları alınamadı' });
    }
});

/**
 * GET /api/transfer/airport-greeting/completed
 * Returns today's completed greetings (HANDED_OFF / NO_SHOW / CANCELLED) so
 * personnel can review what they finished during the day.
 * Query: ?date=YYYY-MM-DD
 */
router.get('/airport-greeting/completed', authMiddleware, async (req, res) => {
    try {
        const tenantId = req.user.tenantId || req.tenant?.id;
        if (!tenantId) return res.status(400).json({ success: false, error: 'Tenant bulunamadı' });

        const { date, airport } = req.query;
        const targetDate = date ? new Date(date) : new Date();
        const dayStart = new Date(targetDate); dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(targetDate); dayEnd.setHours(23, 59, 59, 999);

        const bookings = await prisma.booking.findMany({
            where: {
                tenantId,
                productType: 'TRANSFER',
                startDate: { gte: dayStart, lte: dayEnd },
            },
            include: {
                driver: { select: { id: true, fullName: true, phone: true } },
            },
            orderBy: { startDate: 'asc' }
        });

        const completed = bookings.filter(b => {
            const pickup = (b.metadata?.pickup || '').toLowerCase();
            const isArrival = AIRPORT_KEYWORDS.some(kw => pickup.includes(kw));
            if (!isArrival) return false;
            if (airport && !pickup.includes(String(airport).toLowerCase())) return false;
            const gs = b.metadata?.greetingStatus;
            return ['HANDED_OFF', 'NO_SHOW', 'CANCELLED'].includes(gs);
        });

        const mapped = completed.map(b => ({
            id: b.id,
            bookingNumber: b.bookingNumber,
            passengerName: b.contactName,
            passengerPhone: b.contactPhone, // already finished — phone allowed
            adults: b.adults,
            children: b.children || 0,
            infants: b.infants || 0,
            flightNumber: b.metadata?.flightNumber || null,
            flightTime: b.metadata?.flightTime || null,
            pickup: b.metadata?.pickup || '',
            dropoff: b.metadata?.dropoff || '',
            pickupDateTime: b.startDate,
            vehicleType: b.metadata?.vehicleType || null,
            vehiclePlate: b.metadata?.vehiclePlate || null,
            driverName: b.driver?.fullName || b.metadata?.handoffDriverName || null,
            driverPhone: b.driver?.phone || b.metadata?.handoffDriverPhone || null,
            driverId: b.driverId || null,
            greetingStatus: b.metadata?.greetingStatus || null,
            greetedAt: b.metadata?.greetedAt || null,
            handedOffAt: b.metadata?.handedOffAt || null,
            greeterId: b.metadata?.greeterId || null,
            greeterName: b.metadata?.greeterName || null,
            shuttleRouteId: b.metadata?.shuttleRouteId || null,
            manualRunId: b.metadata?.manualRunId || null,
            shuttleMasterTime: b.metadata?.shuttleMasterTime || null,
        }));

        // Group shuttle completions for display
        res.json({ success: true, data: mapped });
    } catch (error) {
        console.error('[Airport] completed error:', error);
        res.status(500).json({ success: false, error: 'Tamamlanan kayıtlar alınamadı' });
    }
});

/**
 * GET /api/transfer/hourly-search
 * Returns vehicle types that have a basePricePerHour set.
 * Query params: ?pickup=...&date=...&time=...&hours=...&passengers=1
 */
router.get('/hourly-search', optionalAuthMiddleware, async (req, res) => {
    try {
        const tenantId = req.tenant?.id;
        if (!tenantId) return res.status(400).json({ success: false, error: 'Tenant bulunamadı' });

        const { passengers = 1, hours = 1 } = req.query;
        const hoursNum = parseFloat(hours) || 1;

        const vehicleTypes = await prisma.vehicleType.findMany({
            where: {
                tenantId,
                capacity: { gte: Number(passengers) },
            },
            include: {
                vehicles: {
                    where: { tenantId, status: 'ACTIVE' },
                    select: { id: true },
                },
            },
            orderBy: { order: 'asc' },
        });

        const results = vehicleTypes
            .filter(vt => {
                const m = vt.metadata || {};
                return vt.vehicles.length > 0 && m.basePricePerHour && Number(m.basePricePerHour) > 0;
            })
            .map(vt => {
                const m = vt.metadata || {};
                const hourlyRate = Number(m.basePricePerHour);
                const totalPrice = Math.round(hourlyRate * hoursNum * 100) / 100;
                return {
                    vehicleTypeId: vt.id,
                    vehicleType: vt.name,
                    category: vt.category,
                    capacity: vt.capacity,
                    luggage: vt.luggage,
                    image: vt.image,
                    features: vt.features || [],
                    description: vt.description,
                    currency: m.currency || 'TRY',
                    hourlyRate,
                    totalPrice,
                    hours: hoursNum,
                };
            });

        res.json({ success: true, data: results });
    } catch (error) {
        console.error('[Hourly] search error:', error);
        res.status(500).json({ success: false, error: 'Saatlik arama hatası' });
    }
});

// ============================================================================
// PARTNER ZONES & PRICING — Partner self-service endpoints (Phase 1)
// ============================================================================

/**
 * GET /api/transfer/partner/profile
 * Partner reads their own profile (autocreates if missing).
 */
router.get('/partner/profile', authMiddleware, async (req, res) => {
    try {
        if (req.user.roleType !== 'PARTNER') {
            return res.status(403).json({ success: false, error: 'Yalnızca partner kullanıcılar erişebilir' });
        }
        const tenantId = req.tenant?.id || req.user.tenantId;
        const userId = req.user.id;

        let profile = await prisma.partnerProfile.findUnique({ where: { userId } });
        if (!profile) {
            profile = await prisma.partnerProfile.create({ data: { tenantId, userId } });
        }
        const { uetdsUnetPasswordEnc, ...safe } = profile;
        res.json({ success: true, data: { ...safe, uetdsHasPassword: !!uetdsUnetPasswordEnc } });
    } catch (error) {
        console.error('Get partner self profile error:', error);
        res.status(500).json({ success: false, error: 'Profil alınamadı' });
    }
});

/**
 * PUT /api/transfer/partner/profile
 * Partner updates their own company / contact info. Admin-only fields
 * (commissionRate, uetdsEnabled, uetdsYetkiBelgeNo, uetdsYetkiBelgeTuru) are
 * deliberately stripped so partners cannot escalate privileges.
 */
router.put('/partner/profile', authMiddleware, async (req, res) => {
    try {
        if (req.user.roleType !== 'PARTNER') {
            return res.status(403).json({ success: false, error: 'Yalnızca partner kullanıcılar erişebilir' });
        }
        const tenantId = req.tenant?.id || req.user.tenantId;
        const userId = req.user.id;
        const { companyName, taxNumber, taxOffice, address, contactEmail, contactPhone } = req.body;

        const profile = await prisma.partnerProfile.upsert({
            where: { userId },
            update: {
                companyName: companyName ?? undefined,
                taxNumber: taxNumber ?? undefined,
                taxOffice: taxOffice ?? undefined,
                address: address ?? undefined,
                contactEmail: contactEmail ?? undefined,
                contactPhone: contactPhone ?? undefined
            },
            create: { tenantId, userId, companyName, taxNumber, taxOffice, address, contactEmail, contactPhone }
        });
        const { uetdsUnetPasswordEnc, ...safe } = profile;
        res.json({ success: true, data: { ...safe, uetdsHasPassword: !!uetdsUnetPasswordEnc } });
    } catch (error) {
        console.error('Update partner self profile error:', error);
        res.status(500).json({ success: false, error: 'Profil güncellenemedi' });
    }
});

/**
 * GET /api/transfer/partner/allowed-zones
 * Partner views the zones admin has assigned to them.
 */
router.get('/partner/allowed-zones', authMiddleware, async (req, res) => {
    try {
        if (req.user.roleType !== 'PARTNER') {
            return res.status(403).json({ success: false, error: 'Yalnızca partner kullanıcılar erişebilir' });
        }
        const tenantId = req.tenant?.id || req.user.tenantId;
        const partnerId = req.user.id;

        const allowed = await prisma.partnerAllowedZone.findMany({
            where: { tenantId, partnerId, isActive: true },
            include: { zone: { select: { id: true, name: true, code: true, isAirport: true, color: true } } },
            orderBy: { createdAt: 'desc' }
        });
        res.json({ success: true, data: allowed });
    } catch (error) {
        console.error('Get partner allowed zones (self) error:', error);
        res.status(500).json({ success: false, error: 'Bölgeler alınamadı' });
    }
});

/**
 * GET /api/transfer/partner/zone-prices
 * Partner lists their saved zone prices.
 */
router.get('/partner/zone-prices', authMiddleware, async (req, res) => {
    try {
        if (req.user.roleType !== 'PARTNER') {
            return res.status(403).json({ success: false, error: 'Yalnızca partner kullanıcılar erişebilir' });
        }
        const tenantId = req.tenant?.id || req.user.tenantId;
        const partnerId = req.user.id;

        const prices = await prisma.partnerZonePrice.findMany({
            where: { tenantId, partnerId },
            include: {
                zone: { select: { id: true, name: true, code: true } },
                vehicleType: { select: { id: true, name: true, category: true } }
            },
            orderBy: [{ vehicleTypeId: 'asc' }, { zoneId: 'asc' }]
        });
        res.json({ success: true, data: prices });
    } catch (error) {
        console.error('Get partner zone prices (self) error:', error);
        res.status(500).json({ success: false, error: 'Fiyatlar alınamadı' });
    }
});

/**
 * POST /api/transfer/partner/zone-prices
 * Body: { vehicleTypeId, zoneId, baseLocation?, price, childPrice?, babyPrice?, fixedPrice?, extraKmPrice?, currency? }
 * Upserts a price row. Enforces:
 *   1. The (zone, baseLocation) pair must exist in PartnerAllowedZone for this partner.
 *   2. If the assignment carries a maxPriceCap, the requested price must not exceed it.
 */
router.post('/partner/zone-prices', authMiddleware, async (req, res) => {
    try {
        if (req.user.roleType !== 'PARTNER') {
            return res.status(403).json({ success: false, error: 'Yalnızca partner kullanıcılar erişebilir' });
        }
        const tenantId = req.tenant?.id || req.user.tenantId;
        const partnerId = req.user.id;
        const {
            vehicleTypeId, zoneId, baseLocation,
            price, childPrice, babyPrice, fixedPrice, extraKmPrice,
            currency, isActive
        } = req.body;

        if (!vehicleTypeId || !zoneId) {
            return res.status(400).json({ success: false, error: 'vehicleTypeId ve zoneId zorunludur' });
        }
        if (price == null && fixedPrice == null) {
            return res.status(400).json({ success: false, error: 'Fiyat veya sabit fiyat girilmelidir' });
        }

        const baseLoc = baseLocation || 'AYT';

        // 1. Verify the partner is allowed in this (zone, baseLocation)
        const allowance = await prisma.partnerAllowedZone.findUnique({
            where: { partnerId_zoneId_baseLocation: { partnerId, zoneId, baseLocation: baseLoc } }
        });
        if (!allowance || !allowance.isActive) {
            return res.status(403).json({ success: false, error: 'Bu bölgede çalışmaya yetkiniz yok' });
        }

        // 2. Enforce admin ceiling
        const effectivePrice = Number(fixedPrice ?? price);
        if (allowance.maxPriceCap != null && effectivePrice > Number(allowance.maxPriceCap)) {
            return res.status(400).json({
                success: false,
                error: `Fiyat üst sınırı aşıldı. Maksimum: ${allowance.maxPriceCap}`
            });
        }

        // 3. Verify vehicle type belongs to tenant
        const vt = await prisma.vehicleType.findFirst({ where: { id: vehicleTypeId, tenantId } });
        if (!vt) return res.status(404).json({ success: false, error: 'Araç tipi bulunamadı' });

        const saved = await prisma.partnerZonePrice.upsert({
            where: {
                partnerId_vehicleTypeId_zoneId_baseLocation: {
                    partnerId, vehicleTypeId, zoneId, baseLocation: baseLoc
                }
            },
            update: {
                price: price != null ? Number(price) : undefined,
                childPrice: childPrice != null ? Number(childPrice) : undefined,
                babyPrice: babyPrice != null ? Number(babyPrice) : undefined,
                fixedPrice: fixedPrice != null ? Number(fixedPrice) : null,
                extraKmPrice: extraKmPrice != null ? Number(extraKmPrice) : null,
                currency: currency ?? undefined,
                isActive: isActive ?? undefined
            },
            create: {
                tenantId, partnerId, vehicleTypeId, zoneId, baseLocation: baseLoc,
                price: Number(price ?? 0),
                childPrice: childPrice != null ? Number(childPrice) : null,
                babyPrice: babyPrice != null ? Number(babyPrice) : null,
                fixedPrice: fixedPrice != null ? Number(fixedPrice) : null,
                extraKmPrice: extraKmPrice != null ? Number(extraKmPrice) : null,
                currency: currency || 'EUR',
                isActive: isActive !== false
            },
            include: {
                zone: { select: { id: true, name: true, code: true } },
                vehicleType: { select: { id: true, name: true, category: true } }
            }
        });
        res.json({ success: true, data: saved });
    } catch (error) {
        console.error('Save partner zone price error:', error);
        res.status(500).json({ success: false, error: 'Fiyat kaydedilemedi' });
    }
});

/**
 * POST /api/transfer/partner/bookings
 * Partner creates a manual booking for their own customer.
 *
 * Differences from the admin manual booking endpoint:
 *   - Booking is auto-CONFIRMED (skips pool)
 *   - confirmedBy = partner.id, metadata.creationSource = 'PARTNER_MANUAL'
 *   - Region codes & tripType are auto-detected from coordinates
 *   - If pickupZoneId is provided, the partner must be allowed in that zone
 *   - Partner can pre-assign one of their own drivers and vehicles
 *   - Currency defaults to the partner's most-recent zone-price currency
 */
router.post('/partner/bookings', authMiddleware, async (req, res) => {
    try {
        if (req.user.roleType !== 'PARTNER') {
            return res.status(403).json({ success: false, error: 'Yalnızca partner kullanıcılar erişebilir' });
        }
        const tenantId = req.tenant?.id || req.user.tenantId;
        const partnerId = req.user.id;

        const {
            passengerName, passengerPhone, passengerEmail,
            pickup, dropoff, pickupDateTime,
            pickupLat, pickupLng, dropoffLat, dropoffLng,
            distance, duration,
            flightNumber, flightTime,
            adults, children, infants,
            vehicleTypeId, vehicleId, driverId,
            price, currency, paymentMethod,
            notes,
            extraServices, extrasTotal,
            // Optional zone hint to apply the partner's own zone price automatically
            partnerZoneId, baseLocation,
            // Marketplace
            marketplaceStatus, b2bPriceType, b2bPrice,
            marketplaceBidDurationHours, marketplaceBidDeadlineAt
        } = req.body;

        if (!passengerName || !pickup || !dropoff || !pickupDateTime) {
            return res.status(400).json({ success: false, error: 'Müşteri adı, alış/bırakış ve tarih zorunludur' });
        }

        // Verify driver belongs to partner (if provided)
        if (driverId) {
            const drv = await prisma.user.findFirst({ where: { id: driverId, partnerId, deletedAt: null } });
            if (!drv) return res.status(400).json({ success: false, error: 'Belirtilen şoför size ait değil' });
        }

        // Verify vehicle belongs to partner (if provided)
        let resolvedVehicle = null;
        if (vehicleId) {
            resolvedVehicle = await prisma.vehicle.findFirst({
                where: { id: vehicleId, tenantId, ownerId: partnerId, status: 'ACTIVE' },
                include: { vehicleType: true }
            });
            if (!resolvedVehicle) return res.status(400).json({ success: false, error: 'Belirtilen araç size ait değil' });
        }

        // Resolve vehicle type
        let resolvedVehicleTypeId = vehicleTypeId || resolvedVehicle?.vehicleTypeId || null;
        let vehicleTypeName = resolvedVehicle?.vehicleType?.name || null;
        if (!resolvedVehicleTypeId) {
            const fallback = await prisma.vehicleType.findFirst({ where: { tenantId }, orderBy: { order: 'asc' } });
            if (fallback) {
                resolvedVehicleTypeId = fallback.id;
                vehicleTypeName = fallback.name;
            }
        } else if (!vehicleTypeName) {
            const vt = await prisma.vehicleType.findUnique({ where: { id: resolvedVehicleTypeId } });
            vehicleTypeName = vt?.name || null;
        }

        // If partnerZoneId hint provided, enforce allowance
        let resolvedPrice = price != null ? Number(price) : null;
        let resolvedCurrency = currency || null;
        if (partnerZoneId && resolvedVehicleTypeId) {
            const baseLoc = baseLocation || 'AYT';
            const allowance = await prisma.partnerAllowedZone.findUnique({
                where: { partnerId_zoneId_baseLocation: { partnerId, zoneId: partnerZoneId, baseLocation: baseLoc } }
            });
            if (!allowance || !allowance.isActive) {
                return res.status(403).json({ success: false, error: 'Bu bölgede çalışmaya yetkiniz yok' });
            }
            // Pull partner's own price for this combo
            const pp = await prisma.partnerZonePrice.findUnique({
                where: {
                    partnerId_vehicleTypeId_zoneId_baseLocation: {
                        partnerId, vehicleTypeId: resolvedVehicleTypeId, zoneId: partnerZoneId, baseLocation: baseLoc
                    }
                }
            });
            if (pp) {
                if (resolvedPrice == null) {
                    const pax = (Number(adults) || 1) + (Number(children) || 0) + (Number(infants) || 0);
                    resolvedPrice = pp.fixedPrice != null
                        ? Number(pp.fixedPrice)
                        : Number(pp.price) * pax;
                }
                if (!resolvedCurrency) resolvedCurrency = pp.currency;
            }
            // Enforce cap
            if (allowance.maxPriceCap != null && resolvedPrice != null && Number(resolvedPrice) > Number(allowance.maxPriceCap)) {
                return res.status(400).json({
                    success: false,
                    error: `Fiyat üst sınırı aşıldı. Maksimum: ${allowance.maxPriceCap}`
                });
            }
        }

        if (resolvedPrice == null) resolvedPrice = 0;
        if (!resolvedCurrency) resolvedCurrency = 'EUR';

        // Region detection & tripType (mirrors admin manual booking flow)
        const hubs = await loadTenantHubs(tenantId);
        const zonesForRegion = await prisma.zone.findMany({
            where: { tenantId, code: { not: null } },
            select: { id: true, code: true, name: true, keywords: true, polygon: true }
        });
        const pickupRegionCode = detectRegionCodeByPolygon(pickupLat, pickupLng, pickup, zonesForRegion, hubs);
        const dropoffRegionCode = detectRegionCodeByPolygon(dropoffLat, dropoffLng, dropoff, zonesForRegion, hubs);
        const airportZones = hubs.filter(h => h.isAirport);
        const tripType = getTripType(pickup, dropoff, airportZones);

        // Booking number
        const today = new Date();
        const dateStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
        const randomSuffix = Math.floor(1000 + Math.random() * 9000);
        const bookingNumber = `TR-${dateStr}-${randomSuffix}-P`;

        const totalPax = (Number(adults) || 1) + (Number(children) || 0) + (Number(infants) || 0);
        const startDate = new Date(pickupDateTime);

        const isOpenBidPublished = marketplaceStatus === 'PUBLISHED' && b2bPriceType === 'OPEN_BID';
        let computedBidDeadlineAt = null;
        if (isOpenBidPublished) {
            if (marketplaceBidDeadlineAt) {
                const parsed = new Date(marketplaceBidDeadlineAt);
                if (!Number.isNaN(parsed.getTime())) {
                    computedBidDeadlineAt = parsed.toISOString();
                }
            }
            if (!computedBidDeadlineAt) {
                const hours = Number(marketplaceBidDurationHours || 24);
                const safeHours = Number.isFinite(hours) ? Math.min(Math.max(hours, 1), 168) : 24;
                const deadline = new Date(startDate.getTime() + safeHours * 60 * 60 * 1000);
                computedBidDeadlineAt = deadline.toISOString();
            }
        }

        const metadata = {
            pickup,
            dropoff,
            pickupLat: pickupLat != null ? Number(pickupLat) : null,
            pickupLng: pickupLng != null ? Number(pickupLng) : null,
            dropoffLat: dropoffLat != null ? Number(dropoffLat) : null,
            dropoffLng: dropoffLng != null ? Number(dropoffLng) : null,
            distance, duration,
            flightNumber, flightTime,
            vehicleType: vehicleTypeName,
            vehicleTypeId: resolvedVehicleTypeId,
            assignedVehicleId: vehicleId || null,
            partnerVehicleId: vehicleId || null,
            partnerVehiclePlate: resolvedVehicle?.plateNumber || null,
            partnerVehicleName: resolvedVehicle ? `${resolvedVehicle.brand} ${resolvedVehicle.model}` : null,
            paymentMethod: paymentMethod || 'CASH',
            specialRequests: notes || null,
            extraServices: Array.isArray(extraServices) ? extraServices : [],
            extrasTotal: Number(extrasTotal || 0),
            pickupRegionCode: pickupRegionCode || null,
            dropoffRegionCode: dropoffRegionCode || null,
            tripType,
            partnerZoneId: partnerZoneId || null,
            partnerBaseLocation: baseLocation || null,
            // Audit / source
            creationSource: 'PARTNER_MANUAL',
            createdByPartnerId: partnerId,
            operationalStatus: driverId ? 'DRIVER_ASSIGNED' : 'CONFIRMED',
            marketplaceBidDeadlineAt: computedBidDeadlineAt,
            marketplaceBidDurationHours: isOpenBidPublished ? Number(marketplaceBidDurationHours || 24) : null,
            marketplaceAwardRule: isOpenBidPublished ? 'HIGHEST_BID' : null,
        };

        const booking = await prisma.booking.create({
            data: {
                tenantId,
                bookingNumber,
                productType: 'TRANSFER',
                status: 'CONFIRMED',
                confirmedBy: partnerId,
                confirmedAt: new Date(),
                ...(driverId ? { driverId } : {}),
                contactName: passengerName,
                contactPhone: passengerPhone || '',
                contactEmail: passengerEmail || '',
                startDate,
                adults: Number(adults) || 1,
                children: Number(children) || 0,
                infants: Number(infants) || 0,
                subtotal: resolvedPrice,
                tax: 0,
                serviceFee: 0,
                total: resolvedPrice,
                currency: resolvedCurrency,
                paymentStatus: 'PENDING',
                bookingType: 'PARTNER_DIRECT',
                ownerPartnerId: partnerId,
                marketplaceStatus: marketplaceStatus || null,
                b2bPriceType: b2bPriceType || null,
                b2bPrice: b2bPrice != null ? Number(b2bPrice) : null,
                metadata
            }
        });

        // Optional: notify driver
        if (driverId) {
            try {
                const drv = await prisma.user.findUnique({ where: { id: driverId }, select: { pushToken: true, fullName: true } });
                if (drv?.pushToken) {
                    const { Expo } = require('expo-server-sdk');
                    const expo = new Expo();
                    await expo.sendPushNotificationsAsync([{
                        to: drv.pushToken,
                        sound: 'default',
                        title: '🚗 Yeni Transfer Atandı',
                        body: `${passengerName} — ${pickup}`,
                        data: { type: 'booking_assigned', bookingId: booking.id },
                    }]);
                }
            } catch (pushErr) {
                console.warn('Push notification failed:', pushErr.message);
            }
        }

        // Audit log
        try {
            await logActivity({
                tenantId, userId: partnerId, userEmail: req.user.email,
                action: 'CREATE_BOOKING',
                entityType: 'Booking', entityId: booking.id,
                details: {
                    message: `Partner manuel rezervasyon: ${passengerName} — ${pickup} → ${dropoff}`,
                    source: 'PARTNER_MANUAL',
                    bookingNumber: booking.bookingNumber
                },
                ipAddress: req.headers['x-forwarded-for'] || req.socket?.remoteAddress
            });
        } catch (logErr) { console.error('[Partner manual booking] audit log failed:', logErr.message); }

        res.json({ success: true, data: booking });
    } catch (error) {
        console.error('Partner create manual booking error:', error);
        res.status(500).json({ success: false, error: 'Rezervasyon oluşturulamadı: ' + error.message });
    }
});

/**
 * DELETE /api/transfer/partner/zone-prices/:id
 */
router.delete('/partner/zone-prices/:id', authMiddleware, async (req, res) => {
    try {
        if (req.user.roleType !== 'PARTNER') {
            return res.status(403).json({ success: false, error: 'Yalnızca partner kullanıcılar erişebilir' });
        }
        const tenantId = req.tenant?.id || req.user.tenantId;
        const partnerId = req.user.id;
        const { id } = req.params;
        const row = await prisma.partnerZonePrice.findFirst({ where: { id, tenantId, partnerId } });
        if (!row) return res.status(404).json({ success: false, error: 'Kayıt bulunamadı' });
        await prisma.partnerZonePrice.delete({ where: { id } });
        res.json({ success: true });
    } catch (error) {
        console.error('Delete partner zone price error:', error);
        res.status(500).json({ success: false, error: 'Fiyat silinemedi' });
    }
});

// ============================================================================
// UETDS INTEGRATION — Partner SOAP submission endpoints (Phase 3)
// ============================================================================

const uetdsService = require('../services/uetdsService');

// ════════════════════════════════════════════════════════════════════
// PARTNER NOTIFICATION CHANNEL DEFINITIONS (Email / WhatsApp)
// Stored under partnerProfile.metadata.notifications. Secrets are
// AES-encrypted with the same key used for UETDS credentials.
// ════════════════════════════════════════════════════════════════════

function mapEmailForRead(email) {
    if (!email) return { enabled: false };
    return {
        enabled: !!email.enabled,
        smtpHost: email.smtpHost || '',
        smtpPort: email.smtpPort || 587,
        smtpSecure: !!email.smtpSecure,
        smtpUser: email.smtpUser || '',
        hasSmtpPass: !!email.smtpPassEnc,
        senderEmail: email.senderEmail || '',
        senderName: email.senderName || '',
        replyTo: email.replyTo || '',
        autoSendVoucher: !!email.autoSendVoucher
    };
}

function mapWhatsAppForRead(wa) {
    if (!wa) return { enabled: false, provider: 'META' };
    return {
        enabled: !!wa.enabled,
        provider: wa.provider || 'META',
        metaPhoneNumberId: wa.metaPhoneNumberId || '',
        hasMetaAccessToken: !!wa.metaAccessTokenEnc,
        greenInstanceId: wa.greenInstanceId || '',
        hasGreenApiToken: !!wa.greenApiTokenEnc,
        webhookUrl: wa.webhookUrl || '',
        hasWebhookSecret: !!wa.webhookSecretEnc,
        defaultCountryCode: wa.defaultCountryCode || '90',
        autoSendVoucher: !!wa.autoSendVoucher
    };
}

function normalizePhoneTr(phone) {
    if (!phone) return null;
    let cleaned = String(phone).replace(/[^\d+]/g, '');
    if (cleaned.startsWith('+')) cleaned = cleaned.slice(1);
    if (cleaned.startsWith('0')) cleaned = '90' + cleaned.slice(1);
    if (cleaned.length === 10 && cleaned.startsWith('5')) cleaned = '90' + cleaned;
    return cleaned;
}

router.get('/partner/notifications', authMiddleware, async (req, res) => {
    try {
        if (req.user.roleType !== 'PARTNER') {
            return res.status(403).json({ success: false, error: 'Yalnızca partner kullanıcılar erişebilir' });
        }
        const userId = req.user.id;
        const profile = await prisma.partnerProfile.findUnique({ where: { userId } });
        const metadata = profile?.metadata || {};
        const notif = metadata.notifications || {};
        res.json({
            success: true,
            data: {
                email: mapEmailForRead(notif.email),
                whatsapp: mapWhatsAppForRead(notif.whatsapp)
            }
        });
    } catch (error) {
        console.error('Get partner notifications error:', error);
        res.status(500).json({ success: false, error: 'Bildirim ayarları alınamadı' });
    }
});

router.put('/partner/notifications', authMiddleware, async (req, res) => {
    try {
        if (req.user.roleType !== 'PARTNER') {
            return res.status(403).json({ success: false, error: 'Yalnızca partner kullanıcılar erişebilir' });
        }
        const tenantId = req.tenant?.id || req.user.tenantId;
        const userId = req.user.id;
        const { email = {}, whatsapp = {} } = req.body || {};

        const existing = await prisma.partnerProfile.findUnique({ where: { userId } });
        const metadata = existing?.metadata || {};
        const prevNotif = metadata.notifications || {};
        const prevEmail = prevNotif.email || {};
        const prevWa = prevNotif.whatsapp || {};

        const nextEmail = {
            enabled: email.enabled === undefined ? !!prevEmail.enabled : !!email.enabled,
            smtpHost: email.smtpHost ?? prevEmail.smtpHost ?? '',
            smtpPort: email.smtpPort ? Number(email.smtpPort) : (prevEmail.smtpPort || 587),
            smtpSecure: email.smtpSecure === undefined ? !!prevEmail.smtpSecure : !!email.smtpSecure,
            smtpUser: email.smtpUser ?? prevEmail.smtpUser ?? '',
            smtpPassEnc: email.smtpPass ? uetdsService.encrypt(String(email.smtpPass)) : (prevEmail.smtpPassEnc || null),
            senderEmail: email.senderEmail ?? prevEmail.senderEmail ?? '',
            senderName: email.senderName ?? prevEmail.senderName ?? '',
            replyTo: email.replyTo ?? prevEmail.replyTo ?? '',
            autoSendVoucher: email.autoSendVoucher === undefined ? !!prevEmail.autoSendVoucher : !!email.autoSendVoucher
        };

        const nextWa = {
            enabled: whatsapp.enabled === undefined ? !!prevWa.enabled : !!whatsapp.enabled,
            provider: (whatsapp.provider || prevWa.provider || 'META').toUpperCase(),
            metaPhoneNumberId: whatsapp.metaPhoneNumberId ?? prevWa.metaPhoneNumberId ?? '',
            metaAccessTokenEnc: whatsapp.metaAccessToken ? uetdsService.encrypt(String(whatsapp.metaAccessToken)) : (prevWa.metaAccessTokenEnc || null),
            greenInstanceId: whatsapp.greenInstanceId ?? prevWa.greenInstanceId ?? '',
            greenApiTokenEnc: whatsapp.greenApiToken ? uetdsService.encrypt(String(whatsapp.greenApiToken)) : (prevWa.greenApiTokenEnc || null),
            webhookUrl: whatsapp.webhookUrl ?? prevWa.webhookUrl ?? '',
            webhookSecretEnc: whatsapp.webhookSecret ? uetdsService.encrypt(String(whatsapp.webhookSecret)) : (prevWa.webhookSecretEnc || null),
            defaultCountryCode: whatsapp.defaultCountryCode ?? prevWa.defaultCountryCode ?? '90',
            autoSendVoucher: whatsapp.autoSendVoucher === undefined ? !!prevWa.autoSendVoucher : !!whatsapp.autoSendVoucher
        };

        const updated = await prisma.partnerProfile.upsert({
            where: { userId },
            update: {
                metadata: { ...metadata, notifications: { email: nextEmail, whatsapp: nextWa } }
            },
            create: {
                tenantId,
                userId,
                metadata: { notifications: { email: nextEmail, whatsapp: nextWa } }
            }
        });

        const next = updated.metadata?.notifications || {};
        res.json({
            success: true,
            data: {
                email: mapEmailForRead(next.email),
                whatsapp: mapWhatsAppForRead(next.whatsapp)
            }
        });
    } catch (error) {
        console.error('Update partner notifications error:', error);
        res.status(500).json({ success: false, error: 'Bildirim ayarları kaydedilemedi' });
    }
});

router.post('/partner/notifications/test-email', authMiddleware, async (req, res) => {
    try {
        if (req.user.roleType !== 'PARTNER') {
            return res.status(403).json({ success: false, error: 'Yalnızca partner kullanıcılar erişebilir' });
        }
        const userId = req.user.id;
        const { to } = req.body || {};
        if (!to) return res.status(400).json({ success: false, error: 'Test alıcı e-posta adresi gerekli' });

        const profile = await prisma.partnerProfile.findUnique({ where: { userId } });
        const email = profile?.metadata?.notifications?.email;
        if (!email || !email.smtpHost || !email.smtpUser || !email.smtpPassEnc) {
            return res.status(400).json({ success: false, error: 'SMTP ayarları eksik' });
        }

        const nodemailer = require('nodemailer');
        const transporter = nodemailer.createTransport({
            host: email.smtpHost,
            port: Number(email.smtpPort) || 587,
            secure: !!email.smtpSecure || Number(email.smtpPort) === 465,
            auth: {
                user: email.smtpUser,
                pass: uetdsService.decrypt(email.smtpPassEnc)
            },
            tls: { rejectUnauthorized: false }
        });

        const fromName = email.senderName || req.user.fullName || 'Partner';
        const fromAddr = email.senderEmail || email.smtpUser;
        await transporter.sendMail({
            from: `"${fromName}" <${fromAddr}>`,
            to,
            replyTo: email.replyTo || undefined,
            subject: 'SmartTransfer · SMTP Test',
            text: 'Bu bir test e-postasıdır. Bildirimler başarıyla yapılandırılmıştır.',
            html: '<p>Bu bir <b>test e-postasıdır</b>. SMTP bağlantınız çalışıyor.</p>'
        });

        res.json({ success: true, message: `Test e-postası gönderildi: ${to}` });
    } catch (error) {
        console.error('Partner test email error:', error);
        res.status(500).json({ success: false, error: error.message || 'Test e-postası gönderilemedi' });
    }
});

router.post('/partner/notifications/test-whatsapp', authMiddleware, async (req, res) => {
    try {
        if (req.user.roleType !== 'PARTNER') {
            return res.status(403).json({ success: false, error: 'Yalnızca partner kullanıcılar erişebilir' });
        }
        const userId = req.user.id;
        const { phone, message: bodyMessage } = req.body || {};
        if (!phone) return res.status(400).json({ success: false, error: 'Telefon numarası gerekli' });

        const profile = await prisma.partnerProfile.findUnique({ where: { userId } });
        const wa = profile?.metadata?.notifications?.whatsapp;
        if (!wa) return res.status(400).json({ success: false, error: 'WhatsApp ayarları yapılandırılmamış' });

        const normalized = normalizePhoneTr(phone);
        if (!normalized) return res.status(400).json({ success: false, error: 'Geçersiz telefon numarası' });

        const text = bodyMessage || 'Bu bir test mesajıdır. WhatsApp bildirim ayarlarınız doğrulandı.';
        const provider = (wa.provider || 'META').toUpperCase();
        const axios = require('axios');

        if (provider === 'META') {
            if (!wa.metaPhoneNumberId || !wa.metaAccessTokenEnc) {
                return res.status(400).json({ success: false, error: 'Meta WhatsApp ayarları eksik' });
            }
            const token = uetdsService.decrypt(wa.metaAccessTokenEnc);
            await axios.post(
                `https://graph.facebook.com/v18.0/${wa.metaPhoneNumberId}/messages`,
                { messaging_product: 'whatsapp', to: normalized, type: 'text', text: { body: text } },
                { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, timeout: 15000 }
            );
            return res.json({ success: true, message: `Test mesajı gönderildi: ${normalized}` });
        }

        if (provider === 'GREEN') {
            if (!wa.greenInstanceId || !wa.greenApiTokenEnc) {
                return res.status(400).json({ success: false, error: 'Green API ayarları eksik' });
            }
            const token = uetdsService.decrypt(wa.greenApiTokenEnc);
            await axios.post(
                `https://api.green-api.com/waInstance${wa.greenInstanceId}/sendMessage/${token}`,
                { chatId: `${normalized}@c.us`, message: text },
                { timeout: 15000 }
            );
            return res.json({ success: true, message: `Test mesajı gönderildi: ${normalized}` });
        }

        if (provider === 'WEBHOOK') {
            if (!wa.webhookUrl) {
                return res.status(400).json({ success: false, error: 'Webhook URL gerekli' });
            }
            const secret = wa.webhookSecretEnc ? uetdsService.decrypt(wa.webhookSecretEnc) : null;
            const headers = { 'Content-Type': 'application/json' };
            if (secret) headers['X-Webhook-Secret'] = secret;
            await axios.post(wa.webhookUrl, { phone: normalized, message: text }, { headers, timeout: 15000 });
            return res.json({ success: true, message: `Test webhook çağrıldı: ${normalized}` });
        }

        return res.status(400).json({ success: false, error: 'Desteklenmeyen sağlayıcı' });
    } catch (error) {
        const apiErr = error.response?.data?.error?.message
            || error.response?.data?.message
            || error.response?.data?.error
            || error.message
            || 'Test mesajı gönderilemedi';
        console.error('Partner test whatsapp error:', apiErr);
        res.status(500).json({ success: false, error: apiErr });
    }
});

/**
 * PUT /api/transfer/partner/uetds-credentials
 * Partner saves their own UNet username + password (encrypted).
 */
router.put('/partner/uetds-credentials', authMiddleware, async (req, res) => {
    try {
        if (req.user.roleType !== 'PARTNER') {
            return res.status(403).json({ success: false, error: 'Yalnızca partner kullanıcılar erişebilir' });
        }
        const userId = req.user.id;
        const { unetUser, unetPassword } = req.body;

        if (!unetUser || !unetPassword) {
            return res.status(400).json({ success: false, error: 'Kullanıcı adı ve şifre zorunludur' });
        }

        const profile = await prisma.partnerProfile.findUnique({ where: { userId } });
        if (!profile) {
            return res.status(404).json({ success: false, error: 'Partner profili bulunamadı' });
        }
        if (!profile.uetdsEnabled) {
            return res.status(403).json({ success: false, error: 'UETDS yönetici tarafından aktifleştirilmeli' });
        }

        const encryptedPassword = uetdsService.encrypt(unetPassword);

        await prisma.partnerProfile.update({
            where: { userId },
            data: { uetdsUnetUser: unetUser, uetdsUnetPasswordEnc: encryptedPassword }
        });

        res.json({ success: true, message: 'UETDS kimlik bilgileri kaydedildi' });
    } catch (error) {
        console.error('Save UETDS credentials error:', error);
        res.status(500).json({ success: false, error: 'Kimlik bilgileri kaydedilemedi' });
    }
});

/**
 * POST /api/transfer/partner/uetds-test
 * Test UNet credentials without submitting a real sefer.
 */
router.post('/partner/uetds-test', authMiddleware, async (req, res) => {
    try {
        if (req.user.roleType !== 'PARTNER') {
            return res.status(403).json({ success: false, error: 'Yalnızca partner kullanıcılar erişebilir' });
        }
        const userId = req.user.id;
        const profile = await prisma.partnerProfile.findUnique({ where: { userId } });
        if (!profile || !profile.uetdsEnabled) {
            return res.status(403).json({ success: false, error: 'UETDS aktif değil' });
        }
        if (!profile.uetdsUnetUser || !profile.uetdsUnetPasswordEnc) {
            return res.status(400).json({ success: false, error: 'Önce UETDS kimlik bilgilerini kaydedin' });
        }

        const password = uetdsService.decrypt(profile.uetdsUnetPasswordEnc);
        const result = await uetdsService.testCredentials({
            username: profile.uetdsUnetUser,
            password,
            yetkiBelgeNo: profile.uetdsYetkiBelgeNo || '',
            serviceUrl: profile.uetdsServiceUrl || null,
        });

        res.json({ success: result.success, message: result.message || result.error });
    } catch (error) {
        console.error('Test UETDS credentials error:', error);
        res.status(500).json({ success: false, error: 'Bağlantı testi başarısız: ' + error.message });
    }
});

/**
 * POST /api/transfer/partner/uetds-submit
 * Partner submits a booking to UETDS (creates sefer + adds passenger + adds personnel).
 * Body: { bookingId, vehiclePlate, driverTc, driverFirstName, driverLastName,
 *          driverGender, driverPhone, passengerTc, passengerFirstName, passengerLastName,
 *          passengerGender, passengerPhone, passengerNationality,
 *          baslangicIl, baslangicIlce, bitisIl, bitisIlce }
 */
router.post('/partner/uetds-submit', authMiddleware, async (req, res) => {
    try {
        if (req.user.roleType !== 'PARTNER') {
            return res.status(403).json({ success: false, error: 'Yalnızca partner kullanıcılar erişebilir' });
        }
        const tenantId = req.tenant?.id || req.user.tenantId;
        const partnerId = req.user.id;

        const profile = await prisma.partnerProfile.findUnique({ where: { userId: partnerId } });
        if (!profile || !profile.uetdsEnabled) {
            return res.status(403).json({ success: false, error: 'UETDS aktif değil' });
        }
        if (!profile.uetdsUnetUser || !profile.uetdsUnetPasswordEnc) {
            return res.status(400).json({ success: false, error: 'UETDS kimlik bilgileri eksik' });
        }
        if (!profile.uetdsYetkiBelgeNo) {
            return res.status(400).json({ success: false, error: 'Yetki Belge Numarası tanımlı değil — yöneticiyle iletişime geçin' });
        }

        const {
            bookingId, vehiclePlate,
            driverTc, driverFirstName, driverLastName, driverGender, driverPhone,
            passengerTc, passengerFirstName, passengerLastName, passengerGender, passengerPhone, passengerNationality,
            baslangicIl, baslangicIlce, bitisIl, bitisIlce
        } = req.body;

        if (!bookingId || !vehiclePlate) {
            return res.status(400).json({ success: false, error: 'Rezervasyon ve araç plakası zorunludur' });
        }

        // Verify booking ownership
        const booking = await prisma.booking.findFirst({
            where: {
                id: bookingId,
                tenantId,
                OR: [
                    { confirmedBy: partnerId },
                    { driverId: { in: (await prisma.user.findMany({ where: { partnerId }, select: { id: true } })).map(d => d.id) } }
                ]
            }
        });
        if (!booking) {
            return res.status(404).json({ success: false, error: 'Rezervasyon bulunamadı veya size ait değil' });
        }

        // Check for existing active submission
        const existing = await prisma.uetdsSubmission.findFirst({
            where: { bookingId, partnerId, status: { in: ['SENT', 'PENDING'] } }
        });
        if (existing) {
            return res.status(400).json({
                success: false,
                error: `Bu rezervasyon için zaten bir UETDS kaydı var (ID: ${existing.uetdsSeferId || existing.id})`
            });
        }

        const password = uetdsService.decrypt(profile.uetdsUnetPasswordEnc);
        const credentials = {
            username: profile.uetdsUnetUser,
            password,
            yetkiBelgeNo: profile.uetdsYetkiBelgeNo,
            serviceUrl: profile.uetdsServiceUrl || null,
        };

        const meta = booking.metadata || {};
        const baslangicTarih = booking.startDate;
        // Estimate end time: startDate + estimated duration or +2 hours
        const estDurationMs = meta.durationMin ? meta.durationMin * 60 * 1000 : 2 * 60 * 60 * 1000;
        const bitisTarih = new Date(new Date(baslangicTarih).getTime() + estDurationMs);

        let seferResult;
        
        if (profile.uetdsProvider === 'UETDS_NET') {
            const uetdsRestService = require('../services/uetdsRestService');
            // Mock driver and passenger arrays for demo payload since they come as flat variables here
            const reservation = {
                pickupCity: baslangicIl || 'Antalya',
                dropoffCity: bitisIl || 'Antalya',
                date: baslangicTarih.toISOString().split('T')[0],
                time: baslangicTarih.toISOString().split('T')[1].substring(0,5),
                pickupLocation: meta.pickup || '',
                dropoffLocation: meta.dropoff || '',
                groupName: 'TRANSFER',
                price: booking.total
            };
            
            const vehicleData = { plate: vehiclePlate };
            const driverData = { tcNo: driverTc || '11111111111', phone: driverPhone || '' };
            const passengers = [{
                firstName: passengerFirstName || 'Yolcu',
                lastName: passengerLastName || 'Yolcu',
                documentNo: passengerTc || '11111111111',
                nationality: passengerNationality || 'TR',
                gender: passengerGender || '1',
                phone: passengerPhone || ''
            }];

            try {
                const submitRes = await uetdsRestService.submitDynamicTrip({
                    credentials, reservation, vehicleData, driverData, passengers
                });
                
                seferResult = {
                    success: true,
                    uetdsSeferId: submitRes.sefer_referans_no,
                    refNo: submitRes.iletisim_referans_no,
                    errorMessage: null,
                    rawRequest: JSON.stringify({ reservation, vehicleData, driverData, passengers }),
                    rawResponse: JSON.stringify(submitRes)
                };
            } catch (err) {
                seferResult = {
                    success: false,
                    errorMessage: err.message,
                    rawRequest: '',
                    rawResponse: JSON.stringify(err.response?.data || err.message)
                };
            }
            
        } else {
            // Step 1: seferEkle (OFFICIAL SOAP)
            seferResult = await uetdsService.seferEkle(credentials, {
                aracPlaka: vehiclePlate,
                seferAciklama: `${meta.pickup || ''} → ${meta.dropoff || ''} (${booking.bookingNumber})`,
                baslangicTarih,
                bitisTarih,
                baslangicIl: baslangicIl || '',
                baslangicIlce: baslangicIlce || '',
                bitisIl: bitisIl || '',
                bitisIlce: bitisIlce || '',
            });
        }

        // Create submission record
        const submission = await prisma.uetdsSubmission.create({
            data: {
                tenantId,
                partnerId,
                bookingId,
                vehicleId: meta.partnerVehicleId || meta.assignedVehicleId || null,
                driverId: booking.driverId || null,
                uetdsSeferId: seferResult.uetdsSeferId || null,
                uetdsRefNo: seferResult.refNo || null,
                status: seferResult.success ? 'SENT' : 'REJECTED',
                errorMessage: seferResult.errorMessage || null,
                request: { sefer: seferResult.rawRequest?.substring(0, 2000) },
                response: { sefer: seferResult.rawResponse?.substring(0, 2000) },
                submittedAt: seferResult.success ? new Date() : null,
            }
        });

        if (!seferResult.success) {
            return res.status(400).json({
                success: false,
                error: seferResult.errorMessage || 'Sefer bildirimi başarısız',
                data: submission,
            });
        }

        // Step 2: yolcuEkle (if passenger info provided and OFFICIAL provider)
        let yolcuResult = null;
        if (profile.uetdsProvider !== 'UETDS_NET' && passengerFirstName && passengerLastName) {
            yolcuResult = await uetdsService.yolcuEkle(credentials, seferResult.uetdsSeferId, {
                tcKimlikNo: passengerTc || '',
                adi: passengerFirstName,
                soyadi: passengerLastName,
                cinsiyet: passengerGender || '1',
                uyruk: passengerNationality || 'TC',
                telefon: passengerPhone || '',
            });
            // Update submission with passenger result
            await prisma.uetdsSubmission.update({
                where: { id: submission.id },
                data: {
                    response: {
                        sefer: seferResult.rawResponse?.substring(0, 2000),
                        yolcu: yolcuResult.rawResponse?.substring(0, 1000),
                    }
                }
            });
        }

        // Step 3: personelEkle (if driver info provided and OFFICIAL provider)
        let personelResult = null;
        if (profile.uetdsProvider !== 'UETDS_NET' && driverTc && driverFirstName && driverLastName) {
            personelResult = await uetdsService.personelEkle(credentials, seferResult.uetdsSeferId, {
                tcKimlikNo: driverTc,
                adi: driverFirstName,
                soyadi: driverLastName,
                cinsiyet: driverGender || '1',
                telefonNo: driverPhone || '',
                gorevTuru: '1', // Driver
            });
        }

        // Audit log
        try {
            await logActivity({
                tenantId, userId: partnerId, userEmail: req.user.email,
                action: 'UETDS_SUBMIT',
                entityType: 'UetdsSubmission', entityId: submission.id,
                details: {
                    message: `UETDS sefer bildirimi: ${booking.bookingNumber} → SeferId: ${seferResult.uetdsSeferId}`,
                    bookingNumber: booking.bookingNumber,
                    uetdsSeferId: seferResult.uetdsSeferId,
                },
                ipAddress: req.headers['x-forwarded-for'] || req.socket?.remoteAddress
            });
        } catch (logErr) { console.error('[UETDS] audit log failed:', logErr.message); }

        res.json({
            success: true,
            data: {
                ...submission,
                uetdsSeferId: seferResult.uetdsSeferId,
                yolcuSuccess: yolcuResult?.success ?? null,
                personelSuccess: personelResult?.success ?? null,
            }
        });
    } catch (error) {
        console.error('UETDS submit error:', error);
        res.status(500).json({ success: false, error: 'UETDS bildirimi başarısız: ' + error.message });
    }
});

/**
 * POST /api/transfer/partner/uetds-cancel
 * Cancel a previously submitted UETDS sefer.
 * Body: { submissionId }
 */
router.post('/partner/uetds-cancel', authMiddleware, async (req, res) => {
    try {
        if (req.user.roleType !== 'PARTNER') {
            return res.status(403).json({ success: false, error: 'Yalnızca partner kullanıcılar erişebilir' });
        }
        const partnerId = req.user.id;
        const { submissionId } = req.body;

        const submission = await prisma.uetdsSubmission.findFirst({
            where: { id: submissionId, partnerId, status: 'SENT' }
        });
        if (!submission) {
            return res.status(404).json({ success: false, error: 'Aktif UETDS kaydı bulunamadı' });
        }
        if (!submission.uetdsSeferId) {
            return res.status(400).json({ success: false, error: 'Sefer ID bulunamadı — iptal edilemiyor' });
        }

        const profile = await prisma.partnerProfile.findUnique({ where: { userId: partnerId } });
        const password = uetdsService.decrypt(profile.uetdsUnetPasswordEnc);
        const credentials = {
            username: profile.uetdsUnetUser,
            password,
            yetkiBelgeNo: profile.uetdsYetkiBelgeNo,
            serviceUrl: profile.uetdsServiceUrl || null,
        };

        const result = await uetdsService.seferIptal(credentials, submission.uetdsSeferId);

        await prisma.uetdsSubmission.update({
            where: { id: submissionId },
            data: {
                status: result.success ? 'CANCELLED' : submission.status,
                errorMessage: result.errorMessage || null,
                cancelledAt: result.success ? new Date() : null,
                response: {
                    ...(typeof submission.response === 'object' ? submission.response : {}),
                    iptal: result.rawResponse?.substring(0, 1000),
                }
            }
        });

        if (!result.success) {
            return res.status(400).json({
                success: false,
                error: result.errorMessage || 'Sefer iptali başarısız',
            });
        }

        res.json({ success: true, message: 'UETDS seferi iptal edildi' });
    } catch (error) {
        console.error('UETDS cancel error:', error);
        res.status(500).json({ success: false, error: 'UETDS iptal işlemi başarısız: ' + error.message });
    }
});

/**
 * GET /api/transfer/partner/uetds-submissions
 * List UETDS submissions for the partner's bookings.
 * Query: ?bookingId=xxx or all submissions
 */
router.get('/partner/uetds-submissions', authMiddleware, async (req, res) => {
    try {
        if (req.user.roleType !== 'PARTNER') {
            return res.status(403).json({ success: false, error: 'Yalnızca partner kullanıcılar erişebilir' });
        }
        const partnerId = req.user.id;
        const { bookingId } = req.query;

        const where = { partnerId };
        if (bookingId) where.bookingId = bookingId;

        const submissions = await prisma.uetdsSubmission.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: 100,
        });

        // Enrich with booking info
        const bookingIds = [...new Set(submissions.filter(s => s.bookingId).map(s => s.bookingId))];
        const bookings = bookingIds.length > 0
            ? await prisma.booking.findMany({
                where: { id: { in: bookingIds } },
                select: { id: true, bookingNumber: true, contactName: true, startDate: true, metadata: true }
            })
            : [];
        const bookingMap = new Map(bookings.map(b => [b.id, b]));

        const enriched = submissions.map(s => ({
            ...s,
            booking: s.bookingId ? bookingMap.get(s.bookingId) || null : null,
        }));

        res.json({ success: true, data: enriched });
    } catch (error) {
        console.error('Get UETDS submissions error:', error);
        res.status(500).json({ success: false, error: 'UETDS kayıtları alınamadı' });
    }
});

// ============================================================================
// PARTNER FINANCE (Isolated – never touches admin Account/Transaction/Kasa)
// ============================================================================

const PARTNER_FINANCE_CATEGORIES = {
    INCOME: [
        { value: 'BOOKING_INCOME', label: 'Transfer Geliri' },
        { value: 'OTHER_INCOME', label: 'Diğer Gelir' },
    ],
    EXPENSE: [
        { value: 'FUEL', label: 'Yakıt' },
        { value: 'MAINTENANCE', label: 'Bakım-Onarım' },
        { value: 'INSURANCE', label: 'Sigorta' },
        { value: 'TAX', label: 'Vergi' },
        { value: 'PENALTY', label: 'Ceza' },
        { value: 'SALARY', label: 'Maaş' },
        { value: 'ADVANCE', label: 'Avans' },
        { value: 'BONUS', label: 'Prim' },
        { value: 'TOLL', label: 'HGS/OGS' },
        { value: 'PARKING', label: 'Otopark' },
        { value: 'CLEANING', label: 'Yıkama/Temizlik' },
        { value: 'SPARE_PARTS', label: 'Yedek Parça' },
        { value: 'TIRE', label: 'Lastik' },
        { value: 'RENT', label: 'Kira' },
        { value: 'OTHER_EXPENSE', label: 'Diğer Gider' },
    ],
};

/**
 * GET /api/transfer/partner/finance/categories
 * Returns available categories grouped by type.
 */
router.get('/partner/finance/categories', authMiddleware, async (req, res) => {
    if (req.user.roleType !== 'PARTNER') {
        return res.status(403).json({ success: false, error: 'Yalnızca partner kullanıcılar erişebilir' });
    }
    res.json({ success: true, data: PARTNER_FINANCE_CATEGORIES });
});

/**
 * GET /api/transfer/partner/finance
 * List finance entries with optional filters.
 * Query: type, category, dateFrom, dateTo, search, page, pageSize
 */
router.get('/partner/finance', authMiddleware, async (req, res) => {
    try {
        if (req.user.roleType !== 'PARTNER') {
            return res.status(403).json({ success: false, error: 'Yalnızca partner kullanıcılar erişebilir' });
        }
        const partnerId = req.user.id;
        const tenantId = req.tenant?.id || req.user.tenantId;
        const { type, category, dateFrom, dateTo, search, page = '1', pageSize = '50' } = req.query;

        const where = { tenantId, partnerId };
        if (type) where.type = type;
        if (category) where.category = category;
        if (dateFrom || dateTo) {
            where.date = {};
            if (dateFrom) where.date.gte = new Date(dateFrom);
            if (dateTo) where.date.lte = new Date(new Date(dateTo).getTime() + 86400000);
        }
        if (search) {
            where.OR = [
                { description: { contains: search, mode: 'insensitive' } },
                { receiptNo: { contains: search, mode: 'insensitive' } },
                { notes: { contains: search, mode: 'insensitive' } },
            ];
        }

        const skip = (parseInt(page) - 1) * parseInt(pageSize);
        const [entries, total] = await Promise.all([
            prisma.partnerFinanceEntry.findMany({
                where,
                orderBy: { date: 'desc' },
                take: parseInt(pageSize),
                skip,
            }),
            prisma.partnerFinanceEntry.count({ where }),
        ]);

        res.json({ success: true, data: entries, total, page: parseInt(page), pageSize: parseInt(pageSize) });
    } catch (error) {
        console.error('Partner finance list error:', error);
        res.status(500).json({ success: false, error: 'Finans kayıtları alınamadı' });
    }
});

/**
 * GET /api/transfer/partner/finance/stats
 * Dashboard stats: totals by type and category, monthly trend.
 * Query: dateFrom, dateTo (optional, defaults to current month)
 */
router.get('/partner/finance/stats', authMiddleware, async (req, res) => {
    try {
        if (req.user.roleType !== 'PARTNER') {
            return res.status(403).json({ success: false, error: 'Yalnızca partner kullanıcılar erişebilir' });
        }
        const partnerId = req.user.id;
        const tenantId = req.tenant?.id || req.user.tenantId;
        const now = new Date();
        const dateFrom = req.query.dateFrom ? new Date(req.query.dateFrom) : new Date(now.getFullYear(), now.getMonth(), 1);
        const dateTo = req.query.dateTo ? new Date(new Date(req.query.dateTo).getTime() + 86400000) : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

        const where = { tenantId, partnerId, date: { gte: dateFrom, lte: dateTo } };

        const entries = await prisma.partnerFinanceEntry.findMany({ where, orderBy: { date: 'asc' } });

        let totalIncome = 0, totalExpense = 0;
        const byCategory = {};
        const byCurrency = {};
        const monthlyTrend = {};
        const driverExpenses = {};
        const vehicleExpenses = {};

        entries.forEach(e => {
            const amt = Number(e.amount || 0);
            const cur = e.currency || 'TRY';

            if (e.type === 'INCOME') totalIncome += amt;
            else totalExpense += amt;

            // By category
            if (!byCategory[e.category]) byCategory[e.category] = { income: 0, expense: 0 };
            if (e.type === 'INCOME') byCategory[e.category].income += amt;
            else byCategory[e.category].expense += amt;

            // By currency
            if (!byCurrency[cur]) byCurrency[cur] = { income: 0, expense: 0 };
            if (e.type === 'INCOME') byCurrency[cur].income += amt;
            else byCurrency[cur].expense += amt;

            // Monthly trend
            const monthKey = `${e.date.getFullYear()}-${String(e.date.getMonth() + 1).padStart(2, '0')}`;
            if (!monthlyTrend[monthKey]) monthlyTrend[monthKey] = { income: 0, expense: 0 };
            if (e.type === 'INCOME') monthlyTrend[monthKey].income += amt;
            else monthlyTrend[monthKey].expense += amt;

            // Driver expense breakdown
            if (e.relatedDriverId && e.type === 'EXPENSE') {
                if (!driverExpenses[e.relatedDriverId]) driverExpenses[e.relatedDriverId] = 0;
                driverExpenses[e.relatedDriverId] += amt;
            }

            // Vehicle expense breakdown
            if (e.relatedVehicleId && e.type === 'EXPENSE') {
                if (!vehicleExpenses[e.relatedVehicleId]) vehicleExpenses[e.relatedVehicleId] = 0;
                vehicleExpenses[e.relatedVehicleId] += amt;
            }
        });

        res.json({
            success: true,
            data: {
                totalIncome,
                totalExpense,
                netProfit: totalIncome - totalExpense,
                entryCount: entries.length,
                byCategory,
                byCurrency,
                monthlyTrend,
                driverExpenses,
                vehicleExpenses,
            },
        });
    } catch (error) {
        console.error('Partner finance stats error:', error);
        res.status(500).json({ success: false, error: 'İstatistikler alınamadı' });
    }
});

/**
 * POST /api/transfer/partner/finance
 * Create a new finance entry.
 */
router.post('/partner/finance', authMiddleware, async (req, res) => {
    try {
        if (req.user.roleType !== 'PARTNER') {
            return res.status(403).json({ success: false, error: 'Yalnızca partner kullanıcılar erişebilir' });
        }
        const partnerId = req.user.id;
        const tenantId = req.tenant?.id || req.user.tenantId;
        const {
            type, category, amount, currency, description, date,
            relatedBookingId, relatedDriverId, relatedVehicleId,
            paymentMethod, receiptNo, notes,
        } = req.body;

        if (!type || !category || !amount) {
            return res.status(400).json({ success: false, error: 'Tür, kategori ve tutar zorunludur' });
        }

        // Validate driver belongs to this partner
        if (relatedDriverId) {
            const driver = await prisma.user.findFirst({ where: { id: relatedDriverId, partnerId } });
            if (!driver) return res.status(400).json({ success: false, error: 'Geçersiz şoför' });
        }

        // Validate vehicle belongs to this partner
        if (relatedVehicleId) {
            const vehicle = await prisma.vehicle.findFirst({ where: { id: relatedVehicleId, userId: partnerId } });
            if (!vehicle) return res.status(400).json({ success: false, error: 'Geçersiz araç' });
        }

        const entry = await prisma.partnerFinanceEntry.create({
            data: {
                tenantId,
                partnerId,
                type,
                category,
                amount: parseFloat(amount),
                currency: currency || 'TRY',
                description: description || null,
                date: date ? new Date(date) : new Date(),
                relatedBookingId: relatedBookingId || null,
                relatedDriverId: relatedDriverId || null,
                relatedVehicleId: relatedVehicleId || null,
                paymentMethod: paymentMethod || null,
                receiptNo: receiptNo || null,
                notes: notes || null,
            },
        });

        res.json({ success: true, data: entry, message: 'Finans kaydı oluşturuldu' });
    } catch (error) {
        console.error('Partner finance create error:', error);
        res.status(500).json({ success: false, error: 'Kayıt oluşturulamadı: ' + error.message });
    }
});

/**
 * PUT /api/transfer/partner/finance/:id
 * Update a finance entry.
 */
router.put('/partner/finance/:id', authMiddleware, async (req, res) => {
    try {
        if (req.user.roleType !== 'PARTNER') {
            return res.status(403).json({ success: false, error: 'Yalnızca partner kullanıcılar erişebilir' });
        }
        const partnerId = req.user.id;
        const existing = await prisma.partnerFinanceEntry.findFirst({
            where: { id: req.params.id, partnerId },
        });
        if (!existing) return res.status(404).json({ success: false, error: 'Kayıt bulunamadı' });

        const {
            type, category, amount, currency, description, date,
            relatedBookingId, relatedDriverId, relatedVehicleId,
            paymentMethod, receiptNo, notes,
        } = req.body;

        const updateData = {};
        if (type) updateData.type = type;
        if (category) updateData.category = category;
        if (amount !== undefined) updateData.amount = parseFloat(amount);
        if (currency) updateData.currency = currency;
        if (description !== undefined) updateData.description = description;
        if (date) updateData.date = new Date(date);
        if (relatedBookingId !== undefined) updateData.relatedBookingId = relatedBookingId || null;
        if (relatedDriverId !== undefined) updateData.relatedDriverId = relatedDriverId || null;
        if (relatedVehicleId !== undefined) updateData.relatedVehicleId = relatedVehicleId || null;
        if (paymentMethod !== undefined) updateData.paymentMethod = paymentMethod || null;
        if (receiptNo !== undefined) updateData.receiptNo = receiptNo || null;
        if (notes !== undefined) updateData.notes = notes || null;

        const entry = await prisma.partnerFinanceEntry.update({
            where: { id: req.params.id },
            data: updateData,
        });

        res.json({ success: true, data: entry, message: 'Kayıt güncellendi' });
    } catch (error) {
        console.error('Partner finance update error:', error);
        res.status(500).json({ success: false, error: 'Güncelleme başarısız' });
    }
});

/**
 * DELETE /api/transfer/partner/finance/:id
 * Delete a finance entry.
 */
router.delete('/partner/finance/:id', authMiddleware, async (req, res) => {
    try {
        if (req.user.roleType !== 'PARTNER') {
            return res.status(403).json({ success: false, error: 'Yalnızca partner kullanıcılar erişebilir' });
        }
        const partnerId = req.user.id;
        const existing = await prisma.partnerFinanceEntry.findFirst({
            where: { id: req.params.id, partnerId },
        });
        if (!existing) return res.status(404).json({ success: false, error: 'Kayıt bulunamadı' });

        await prisma.partnerFinanceEntry.delete({ where: { id: req.params.id } });
        res.json({ success: true, message: 'Kayıt silindi' });
    } catch (error) {
        console.error('Partner finance delete error:', error);
        res.status(500).json({ success: false, error: 'Silme başarısız' });
    }
});

/**
 * POST /api/transfer/partner/finance/sync-bookings
 * Auto-creates BOOKING_INCOME entries for completed bookings that don't have one yet.
 */
router.post('/partner/finance/sync-bookings', authMiddleware, async (req, res) => {
    try {
        if (req.user.roleType !== 'PARTNER') {
            return res.status(403).json({ success: false, error: 'Yalnızca partner kullanıcılar erişebilir' });
        }
        const partnerId = req.user.id;
        const tenantId = req.tenant?.id || req.user.tenantId;

        // Find completed bookings for this partner
        const completedBookings = await prisma.booking.findMany({
            where: {
                tenantId,
                status: { in: ['COMPLETED', 'completed'] },
                OR: [
                    { ownerPartnerId: partnerId },
                    { assignedPartnerId: partnerId },
                    // Legacy support
                    { driverId: partnerId },
                    { metadata: { path: ['partnerId'], equals: partnerId } },
                ],
            },
            select: { 
                id: true, bookingNumber: true, total: true, currency: true, 
                startDate: true, contactName: true,
                ownerPartnerId: true, assignedPartnerId: true, b2bPrice: true
            },
        });

        if (completedBookings.length === 0) {
            return res.json({ success: true, data: { synced: 0 }, message: 'Senkronize edilecek rezervasyon yok' });
        }

        // Check which already have entries
        const existingEntries = await prisma.partnerFinanceEntry.findMany({
            where: { partnerId, relatedBookingId: { in: completedBookings.map(b => b.id) } },
            select: { relatedBookingId: true, type: true },
        });
        
        // Group by bookingId -> Set of types (INCOME, EXPENSE)
        const existingMap = new Map();
        existingEntries.forEach(e => {
            if (!existingMap.has(e.relatedBookingId)) existingMap.set(e.relatedBookingId, new Set());
            existingMap.get(e.relatedBookingId).add(e.type);
        });

        const toCreate = [];

        for (const b of completedBookings) {
            const hasIncome = existingMap.get(b.id)?.has('INCOME');
            const hasExpense = existingMap.get(b.id)?.has('EXPENSE');

            const isOwner = b.ownerPartnerId === partnerId;
            const isAssigned = b.assignedPartnerId === partnerId;
            const isLegacy = !b.ownerPartnerId && !b.assignedPartnerId; // treated as owner

            let incomeAmount = 0;
            let expenseAmount = 0;

            if (isAssigned && !isOwner) {
                // Partner did the job from pool
                incomeAmount = Number(b.b2bPrice || 0);
            } else if (isOwner && b.assignedPartnerId && b.assignedPartnerId !== partnerId) {
                // Partner created the job but someone else did it
                incomeAmount = Number(b.total || 0);
                expenseAmount = Number(b.b2bPrice || 0);
            } else {
                // Partner created and did the job themselves (or legacy)
                incomeAmount = Number(b.total || 0);
            }

            if (incomeAmount > 0 && !hasIncome) {
                toCreate.push({
                    tenantId,
                    partnerId,
                    type: 'INCOME',
                    category: 'BOOKING_INCOME',
                    amount: incomeAmount,
                    currency: b.currency || 'TRY',
                    description: `${b.bookingNumber} - ${b.contactName || 'Müşteri'} (Müşteri Geliri)`,
                    date: b.startDate || new Date(),
                    relatedBookingId: b.id,
                });
            }

            if (expenseAmount > 0 && !hasExpense) {
                toCreate.push({
                    tenantId,
                    partnerId,
                    type: 'EXPENSE',
                    category: 'OTHER_EXPENSE',
                    amount: expenseAmount,
                    currency: b.currency || 'TRY',
                    description: `${b.bookingNumber} - ${b.contactName || 'Müşteri'} (B2B Ödemesi)`,
                    date: b.startDate || new Date(),
                    relatedBookingId: b.id,
                });
            }
        }

        if (toCreate.length > 0) {
            await prisma.partnerFinanceEntry.createMany({
                data: toCreate,
            });
        }

        res.json({ success: true, data: { synced: toCreate.length }, message: `${toCreate.length} rezervasyon geliri senkronize edildi` });
    } catch (error) {
        console.error('Partner finance sync error:', error);
        res.status(500).json({ success: false, error: 'Senkronizasyon başarısız' });
    }
});

router.get('/partner/marketplace', authMiddleware, async (req, res) => {
    try {
        if (req.user.roleType !== 'PARTNER') {
            return res.status(403).json({ success: false, error: 'Yalnızca partner kullanıcılar erişebilir' });
        }
        const tenantId = req.tenant?.id || req.user.tenantId;
        const partnerId = req.user.id;
        const {
            from = '',
            to = '',
            dateFrom = '',
            dateTo = '',
            sort = 'latest',
            includeOwn = '0',
        } = req.query;

        let bookings = await prisma.booking.findMany({
            where: {
                tenantId,
                marketplaceStatus: 'PUBLISHED',
                status: 'CONFIRMED'
            },
            include: {
                marketplaceOffers: {
                    include: {
                        partner: {
                            select: { id: true, fullName: true, email: true, partnerProfile: { select: { companyName: true } } }
                        }
                    }
                },
                ownerPartner: {
                    select: { id: true, fullName: true, partnerProfile: { select: { companyName: true } } }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        // Expire open-bid listings whose deadline has passed.
        const now = Date.now();
        const toExpireIds = [];
        for (const b of bookings) {
            const deadlineIso = b?.metadata?.marketplaceBidDeadlineAt;
            if (b.b2bPriceType === 'OPEN_BID' && deadlineIso) {
                const ms = new Date(deadlineIso).getTime();
                if (!Number.isNaN(ms) && ms < now) {
                    toExpireIds.push(b.id);
                }
            }
        }
        if (toExpireIds.length > 0) {
            await prisma.booking.updateMany({
                where: { id: { in: toExpireIds } },
                data: { marketplaceStatus: 'EXPIRED' },
            });
            bookings = bookings.filter((b) => !toExpireIds.includes(b.id));
        }

        if (includeOwn !== '1') {
            bookings = bookings.filter((b) => b.ownerPartnerId !== partnerId);
        }

        // Client-facing filters (metadata based, done in-memory for compatibility)
        const trLower = (v) => String(v || '').toLocaleLowerCase('tr');
        if (from) {
            const q = trLower(from);
            bookings = bookings.filter((b) => trLower(b?.metadata?.pickup).includes(q));
        }
        if (to) {
            const q = trLower(to);
            bookings = bookings.filter((b) => trLower(b?.metadata?.dropoff).includes(q));
        }
        if (dateFrom) {
            const fromMs = new Date(String(dateFrom)).getTime();
            if (!Number.isNaN(fromMs)) bookings = bookings.filter((b) => new Date(b.startDate).getTime() >= fromMs);
        }
        if (dateTo) {
            const toMs = new Date(String(dateTo)).getTime();
            if (!Number.isNaN(toMs)) bookings = bookings.filter((b) => new Date(b.startDate).getTime() <= toMs);
        }

        if (sort === 'price_desc') {
            bookings.sort((a, b) => Number(b.b2bPrice || 0) - Number(a.b2bPrice || 0));
        } else if (sort === 'price_asc') {
            bookings.sort((a, b) => Number(a.b2bPrice || 0) - Number(b.b2bPrice || 0));
        } else if (sort === 'date_asc') {
            bookings.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
        } else {
            bookings.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        }

        res.json({ success: true, data: bookings });
    } catch (error) {
        console.error('Marketplace listing error:', error);
        res.status(500).json({ success: false, error: 'İlanlar listelenemedi' });
    }
});

router.get('/partner/marketplace/my-listings', authMiddleware, async (req, res) => {
    try {
        if (req.user.roleType !== 'PARTNER') {
            return res.status(403).json({ success: false, error: 'Yalnızca partner kullanıcılar erişebilir' });
        }
        const tenantId = req.tenant?.id || req.user.tenantId;
        const partnerId = req.user.id;
        const { status = 'all' } = req.query;

        const where = {
            tenantId,
            ownerPartnerId: partnerId,
            ...(status !== 'all' ? { marketplaceStatus: String(status).toUpperCase() } : {}),
        };

        const listings = await prisma.booking.findMany({
            where,
            include: {
                marketplaceOffers: {
                    include: {
                        partner: {
                            select: {
                                id: true,
                                fullName: true,
                                phone: true,
                                partnerProfile: { select: { companyName: true } },
                            },
                        },
                    },
                    orderBy: { amount: 'desc' },
                },
            },
            orderBy: { createdAt: 'desc' },
        });

        const now = Date.now();
        const decorated = listings.map((b) => {
            const deadlineIso = b?.metadata?.marketplaceBidDeadlineAt || null;
            const deadlineMs = deadlineIso ? new Date(deadlineIso).getTime() : null;
            const remainingMs = deadlineMs && !Number.isNaN(deadlineMs) ? Math.max(0, deadlineMs - now) : null;
            const highestOffer = b.marketplaceOffers?.[0] || null;
            return {
                ...b,
                marketplaceMeta: {
                    deadlineAt: deadlineIso,
                    remainingMs,
                    offerCount: b.marketplaceOffers?.length || 0,
                    highestOfferAmount: highestOffer ? Number(highestOffer.amount) : null,
                    highestOfferCurrency: highestOffer?.currency || null,
                },
            };
        });

        res.json({ success: true, data: decorated });
    } catch (error) {
        console.error('My marketplace listings error:', error);
        res.status(500).json({ success: false, error: 'İlanlar getirilemedi' });
    }
});

router.post('/partner/marketplace/:id/bid', authMiddleware, async (req, res) => {
    try {
        if (req.user.roleType !== 'PARTNER') {
            return res.status(403).json({ success: false, error: 'Yalnızca partner kullanıcılar erişebilir' });
        }
        const tenantId = req.tenant?.id || req.user.tenantId;
        const partnerId = req.user.id;
        const { id } = req.params;
        const { amount, currency, notes } = req.body;

        const booking = await prisma.booking.findFirst({
            where: { id, tenantId, marketplaceStatus: 'PUBLISHED', b2bPriceType: 'OPEN_BID' }
        });

        if (!booking) {
            return res.status(404).json({ success: false, error: 'İlan bulunamadı veya artık aktif değil' });
        }
        
        if (booking.ownerPartnerId === partnerId) {
            return res.status(400).json({ success: false, error: 'Kendi ilanınıza teklif veremezsiniz' });
        }

        const deadlineIso = booking?.metadata?.marketplaceBidDeadlineAt;
        if (deadlineIso) {
            const deadlineMs = new Date(deadlineIso).getTime();
            if (!Number.isNaN(deadlineMs) && deadlineMs < Date.now()) {
                await prisma.booking.update({ where: { id }, data: { marketplaceStatus: 'EXPIRED' } });
                return res.status(400).json({ success: false, error: 'Teklif süresi doldu' });
            }
        }

        // Upsert partner's bid (one active bid per partner per listing)
        const existing = await prisma.marketplaceOffer.findFirst({
            where: { bookingId: id, partnerId, status: 'PENDING' },
        });
        const offer = existing
            ? await prisma.marketplaceOffer.update({
                where: { id: existing.id },
                data: { amount: Number(amount), currency: currency || 'EUR', notes: notes || null },
            })
            : await prisma.marketplaceOffer.create({
                data: {
                    tenantId,
                    bookingId: id,
                    partnerId,
                    amount: Number(amount),
                    currency: currency || 'EUR',
                    notes: notes,
                    status: 'PENDING',
                }
            });

        // Notify listing owner
        const io = req.app.get('io');
        if (io && booking.ownerPartnerId) {
            io.to(`user_${booking.ownerPartnerId}`).emit('marketplace_new_offer', {
                bookingId: booking.id,
                bookingNumber: booking.bookingNumber,
                offerId: offer.id,
                amount: Number(offer.amount),
                currency: offer.currency,
                partnerId,
            });
        }

        res.json({ success: true, data: offer });
    } catch (error) {
        console.error('Marketplace bid error:', error);
        res.status(500).json({ success: false, error: 'Teklif gönderilemedi' });
    }
});

router.post('/partner/marketplace/:id/offers/:offerId/accept', authMiddleware, async (req, res) => {
    try {
        if (req.user.roleType !== 'PARTNER') {
            return res.status(403).json({ success: false, error: 'Yalnızca partner kullanıcılar erişebilir' });
        }
        const tenantId = req.tenant?.id || req.user.tenantId;
        const ownerPartnerId = req.user.id;
        const { id, offerId } = req.params;

        const booking = await prisma.booking.findFirst({
            where: {
                id,
                tenantId,
                ownerPartnerId,
                marketplaceStatus: { in: ['PUBLISHED', 'EXPIRED'] },
                b2bPriceType: 'OPEN_BID',
            },
        });
        if (!booking) {
            return res.status(404).json({ success: false, error: 'İlan bulunamadı veya bu işlem için uygun değil' });
        }

        const offer = await prisma.marketplaceOffer.findFirst({
            where: { id: offerId, bookingId: id, tenantId, status: 'PENDING' },
        });
        if (!offer) {
            return res.status(404).json({ success: false, error: 'Teklif bulunamadı veya geçersiz' });
        }

        const result = await prisma.$transaction(async (tx) => {
            await tx.marketplaceOffer.update({
                where: { id: offer.id },
                data: { status: 'ACCEPTED' },
            });
            await tx.marketplaceOffer.updateMany({
                where: { bookingId: id, id: { not: offer.id }, status: 'PENDING' },
                data: { status: 'REJECTED' },
            });
            return tx.booking.update({
                where: { id },
                data: {
                    assignedPartnerId: offer.partnerId,
                    marketplaceStatus: 'ASSIGNED',
                    b2bPrice: Number(offer.amount),
                    currency: offer.currency || booking.currency,
                    metadata: {
                        ...(booking.metadata || {}),
                        marketplaceAcceptedOfferId: offer.id,
                        marketplaceAcceptedAt: new Date().toISOString(),
                        marketplaceAcceptedAmount: Number(offer.amount),
                        marketplaceAcceptedCurrency: offer.currency || booking.currency,
                    },
                },
            });
        });

        const io = req.app.get('io');
        if (io) {
            io.to(`user_${offer.partnerId}`).emit('marketplace_offer_result', {
                bookingId: id,
                bookingNumber: booking.bookingNumber,
                offerId: offer.id,
                status: 'ACCEPTED',
            });
            io.to(`user_${ownerPartnerId}`).emit('booking_marketplace_update', {
                bookingId: id,
                bookingNumber: booking.bookingNumber,
                status: 'ASSIGNED',
                assignedPartnerId: offer.partnerId,
                offerId: offer.id,
                amount: Number(offer.amount),
                currency: offer.currency,
            });
        }

        res.json({ success: true, data: result, message: 'Teklif kabul edildi ve iş partnere atandı' });
    } catch (error) {
        console.error('Marketplace offer accept error:', error);
        res.status(500).json({ success: false, error: 'Teklif kabul edilemedi' });
    }
});

router.post('/partner/marketplace/:id/close', authMiddleware, async (req, res) => {
    try {
        if (req.user.roleType !== 'PARTNER') {
            return res.status(403).json({ success: false, error: 'Yalnızca partner kullanıcılar erişebilir' });
        }
        const tenantId = req.tenant?.id || req.user.tenantId;
        const ownerPartnerId = req.user.id;
        const { id } = req.params;

        const booking = await prisma.booking.findFirst({
            where: { id, tenantId, ownerPartnerId, marketplaceStatus: 'PUBLISHED' },
        });
        if (!booking) {
            return res.status(404).json({ success: false, error: 'Aktif ilan bulunamadı' });
        }

        await prisma.$transaction([
            prisma.booking.update({
                where: { id },
                data: { marketplaceStatus: 'CLOSED' },
            }),
            prisma.marketplaceOffer.updateMany({
                where: { bookingId: id, status: 'PENDING' },
                data: { status: 'WITHDRAWN' },
            }),
        ]);

        res.json({ success: true, message: 'İlan kapatıldı' });
    } catch (error) {
        console.error('Marketplace close listing error:', error);
        res.status(500).json({ success: false, error: 'İlan kapatılamadı' });
    }
});

router.post('/partner/marketplace/:id/accept', authMiddleware, async (req, res) => {
    try {
        if (req.user.roleType !== 'PARTNER') {
            return res.status(403).json({ success: false, error: 'Yalnızca partner kullanıcılar erişebilir' });
        }
        const tenantId = req.tenant?.id || req.user.tenantId;
        const partnerId = req.user.id;
        const { id } = req.params;

        const booking = await prisma.booking.findFirst({
            where: { id, tenantId, marketplaceStatus: 'PUBLISHED', b2bPriceType: 'FIXED_PRICE' }
        });

        if (!booking) {
            return res.status(404).json({ success: false, error: 'İlan bulunamadı veya sabit fiyatlı değil' });
        }

        if (booking.ownerPartnerId === partnerId) {
            return res.status(400).json({ success: false, error: 'Kendi ilanınızı kabul edemezsiniz' });
        }

        // Accept the job
        const updatedBooking = await prisma.booking.update({
            where: { id },
            data: {
                assignedPartnerId: partnerId,
                marketplaceStatus: 'ASSIGNED',
            },
            include: {
                ownerPartner: { select: { id: true, fullName: true, partnerProfile: { select: { companyName: true } } } }
            }
        });

        // Try to get partner's name who accepted
        const acceptingPartner = await prisma.user.findUnique({
            where: { id: partnerId },
            select: { fullName: true, partnerProfile: { select: { companyName: true } } }
        });
        const acceptingName = acceptingPartner?.partnerProfile?.companyName || acceptingPartner?.fullName || 'Bir Partner';

        // Notify admins and owner partner
        const io = req.app.get('io');
        if (io) {
            io.to('admin_monitoring').emit('booking_marketplace_update', { 
                bookingId: id, 
                status: 'ASSIGNED',
                partnerId: partnerId,
                partnerName: acceptingName,
                bookingNumber: booking.bookingNumber
            });
            
            if (booking.ownerPartnerId) {
                // Emit to the owner partner room
                io.to(`user_${booking.ownerPartnerId}`).emit('booking_marketplace_update', {
                    bookingId: id,
                    status: 'ASSIGNED',
                    partnerId: partnerId,
                    partnerName: acceptingName,
                    bookingNumber: booking.bookingNumber,
                    message: `İlanınız ${acceptingName} tarafından kabul edildi.`
                });
            }
        }

        res.json({ success: true, message: 'İş başarıyla üzerinize alındı' });
    } catch (error) {
        console.error('Marketplace accept error:', error);
        res.status(500).json({ success: false, error: 'İşlem başarısız' });
    }
});

router.get('/partner/live-drivers', authMiddleware, async (req, res) => {
    try {
        if (req.user.roleType !== 'PARTNER') {
            return res.status(403).json({ success: false, error: 'Yalnızca partner kullanıcılar erişebilir' });
        }
        const tenantId = req.tenant?.id || req.user.tenantId;
        const partnerId = req.user.id;

        const onlineDrivers = req.app.get('onlineDrivers') || {};

        // 1. Get all drivers for this partner
        const drivers = await prisma.user.findMany({
            where: { tenantId, partnerId, roleType: 'DRIVER', deletedAt: null },
            select: { id: true, fullName: true, phone: true, avatar: true, lastSeenAt: true, lastLocationLat: true, lastLocationLng: true, lastLocationSpeed: true }
        });

        // 2. Fetch today's active bookings for these drivers
        const userIds = drivers.map(d => d.id);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const activeBookings = await prisma.booking.findMany({
            where: {
                driverId: { in: userIds },
                status: { notIn: ['CANCELLED', 'COMPLETED', 'NO_SHOW'] },
                startDate: { gte: today, lt: tomorrow }
            },
            select: { id: true, driverId: true, contactName: true, startDate: true, pickup: true, dropoff: true, status: true, metadata: true }
        });

        // 3. Map to driver stats
        const result = drivers.map(d => {
            const drvBookings = activeBookings.filter(b => b.driverId === d.id);
            // Current booking is IN_PROGRESS, or the earliest today
            let currentBooking = drvBookings.find(b => b.status === 'IN_PROGRESS');
            if (!currentBooking && drvBookings.length > 0) {
                currentBooking = drvBookings.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())[0];
            }

            const liveSocket = onlineDrivers[d.id];
            
            // Vehicles (Partner drivers may not have a dedicated vehicle relationship, but we'll try)
            // if we need to show vehicle, we can look up if there is a vehicle mapped. For now, null.

            return {
                id: d.id,
                fullName: d.fullName,
                phone: d.phone,
                avatar: d.avatar,
                lastSeenAt: liveSocket ? liveSocket.lastSeenAt : d.lastSeenAt,
                location: {
                    lat: liveSocket?.lat ?? d.lastLocationLat,
                    lng: liveSocket?.lng ?? d.lastLocationLng,
                    speed: liveSocket?.speed ?? d.lastLocationSpeed,
                    ts: liveSocket?.lastSeenAt ?? d.lastSeenAt
                },
                socketId: liveSocket ? liveSocket.socketId : null,
                activeBookings: drvBookings,
                currentBooking: currentBooking ? {
                    pickup: currentBooking.pickup || currentBooking.metadata?.pickup,
                    dropoff: currentBooking.dropoff || currentBooking.metadata?.dropoff,
                    contactName: currentBooking.contactName,
                    startDate: currentBooking.startDate
                } : null,
                todayJobCount: drvBookings.length,
                vehicle: null
            };
        });

        res.json({ success: true, data: result });
    } catch (error) {
        console.error('Partner live drivers error:', error);
        res.status(500).json({ success: false, error: 'Sürücüler listelenemedi' });
    }
});

module.exports = router;
