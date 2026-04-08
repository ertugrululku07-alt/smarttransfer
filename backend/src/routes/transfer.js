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
 * Load tenant hubs from settings
 * @param {string} tenantId
 * @returns {Array} hubs
 */
async function loadTenantHubs(tenantId) {
    const defaultHubs = [
        { code: 'AYT', keywords: 'ayt, antalya havalimanı, antalya airport', name: 'Antalya Havalimanı' },
        { code: 'GZP', keywords: 'gzp, gazipasa, gazipaşa', name: 'Gazipaşa Havalimanı' },
    ];
    if (!tenantId) return defaultHubs;
    try {
        const tenantInfo = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } });
        if (tenantInfo?.settings?.hubs && Array.isArray(tenantInfo.settings.hubs)) {
            return tenantInfo.settings.hubs;
        }
    } catch (e) {
        console.error("Failed to fetch tenant hubs for region detection", e);
    }
    return defaultHubs;
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

        console.log('Transfer Search Request:', { pickup, dropoff, distance, transferType, agencyMarkup });

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
        
        let activeTenantId = req.tenant?.id;
        if (!activeTenantId) {
            const defaultTenant = await prisma.tenant.findFirst();
            if (defaultTenant) activeTenantId = defaultTenant.id;
        }

        if (encodedPolyline && activeTenantId) {
            try {
                const decoded = flexpolyline.decode(encodedPolyline);
                const routeCoords = decoded.polyline.map(p => [p[1], p[0]]);
                
                const zones = await prisma.zone.findMany({ where: { tenantId: activeTenantId } });
                
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

                        const overage = Math.min(distFromStart, distFromEnd);
                        const area = turf.area(zonePolygon);
                        
                        if (overage !== Infinity) {
                            zoneOverages[zone.id] = { overage, area };
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
        
        let hubs = [
            { code: 'AYT', keywords: 'ayt, antalya', name: 'Antalya Havalimanı' },
            { code: 'GZP', keywords: 'gzp, gazipasa, gazipaşa', name: 'Gazipaşa Havalimanı' },
            { code: 'CENTER', keywords: 'merkez, antalya', name: 'Antalya Merkez' }
        ];

        if (req.tenant?.id) {
            try {
                const tenantInfo = await prisma.tenant.findUnique({ where: { id: req.tenant.id }, select: { settings: true } });
                if (tenantInfo?.settings?.hubs && Array.isArray(tenantInfo.settings.hubs)) {
                    hubs = tenantInfo.settings.hubs;
                }
            } catch (e) {
                console.error("Failed to fetch tenant hubs", e);
            }
        }

        let detectedBaseLocation = null;
        // Use RAW pickup text (not normalized) so that airport words like 'havalimanı' are preserved for detection
        const pickupTextRaw = pickup.toLowerCase();
        
        let bestMatchLength = 0;
        
        for (const hub of hubs) {
            const keys = hub.keywords ? hub.keywords.split(',').map(k => k.trim().toLowerCase()).filter(k => k) : [];
            keys.push(hub.code.toLowerCase());
            // NOTE: Do NOT auto-generate keys from hub.name as it produces generic words like 'antalya'
            // that conflict between airport hubs and city hubs. Admin should set explicit keywords.
            
            // Add robust aliases — airport-specific words only for AYT to avoid city name conflicts
            if (hub.code === 'GZP') keys.push('gazipaşa', 'gazipasa');
            if (hub.code === 'AYT') keys.push('havalimanı', 'havalimani', 'airport', 'havaalani');
            
            for (const k of keys) {
                if (pickupTextRaw.includes(k) && k.length >= bestMatchLength) {
                    // Give priority to specific airports over generic city names
                    if (k.includes('gazipaşa') || k.includes('gazipasa') || k.includes('gzp')) {
                         detectedBaseLocation = 'GZP';
                         bestMatchLength = 999; // Max priority
                    } else if (k.includes('havalimanı') || k.includes('havalimani') || k.includes('airport') || k.includes('havaalani') || k === 'ayt') {
                        // Airport-specific keyword: highest priority
                        detectedBaseLocation = hub.code;
                        bestMatchLength = 998;
                    } else {
                         detectedBaseLocation = hub.code;
                         bestMatchLength = k.length;
                    }
                }
            }
        }
        
        console.log(`Hub Detection: pickup="${pickup.substring(0,40)}" → detectedBaseLocation="${detectedBaseLocation}"`);

        const dateObj = new Date(pickupDateTime);
        const dayOfWeekVal = dateObj.getDay(); // 0=Sun, 1=Mon...
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
                        // Point in Polygon Algorithm (Ray Casting)
                        let inside = false;
                        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
                            const xi = polygon[i].lng, yi = polygon[i].lat;
                            const xj = polygon[j].lng, yj = polygon[j].lat;

                            const intersect = ((yi > userLat) !== (yj > userLat))
                                && (userLng < (xj - xi) * (userLat - yi) / (yj - yi) + xi);
                            if (intersect) inside = !inside;
                        }
                        isPickupMatch = inside;
                    }
                }

                // 1b. Radius Check (Fallback if not matched yet and radius exists)
                if (!isPickupMatch && route.pickupRadius && route.pickupLocation) {
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

            // 1c. Text matching fallback (if no coordinates sent)
            if (!isPickupMatch) {
                const routeFrom = normalizeLocation(route.fromName);
                isPickupMatch = (routeFrom.includes(pickupNorm) || pickupNorm.includes(routeFrom));
            }

            if (!isPickupMatch) return false;

            // 2. DROPOFF Location Check (to → user's dropoff)
            let isDropoffMatch = false;

            // 2a. Hub code matching (preferred — compare route's toHubCode with detected hub from dropoff text)
            const routeMeta = route.metadata || {};
            const routeToHubCode = routeMeta.toHubCode;
            if (routeToHubCode) {
                // Detect which hub the user's dropoff text maps to
                const dropoffHubCode = detectRegionCode(dropoff, hubs);
                if (dropoffHubCode && dropoffHubCode === routeToHubCode) {
                    isDropoffMatch = true;
                }
            }

            // 2b. Text matching fallback
            if (!isDropoffMatch) {
                const routeTo = normalizeLocation(route.toName);
                isDropoffMatch = (routeTo.includes(dropoffNorm) || dropoffNorm.includes(routeTo));
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
            // Ignore timezone issues if pickupDateTime is accurate in local time, but we fallback safely
            const userMin = searchDate.getHours() * 60 + searchDate.getMinutes();
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
            const markedUpShuttlePrice = baseShuttlePrice * (1 + (agencyMarkup / 100));

            return {
                id: `shuttle_${s.id}`,
                vehicleType: `${s.vehicle?.brand || 'Shuttle'} (Paylaşımlı)`, // More descriptive
                vehicleClass: 'SHUTTLE',
                vendor: 'SmartShuttle',
                capacity: s.maxSeats,
                luggage: 1, // Per person
                price: Number(markedUpShuttlePrice.toFixed(2)),
                basePrice: baseShuttlePrice, // Store original B2B cost
                currency: 'EUR', // Shuttle prices are fixed in EUR
                features: ['Belirli Kalkış Saatleri', 'Ekonomik', 'Paylaşımlı Yolculuk', ...(s.vehicle?.metadata?.hasWifi ? ['WiFi'] : [])],
                cancellationPolicy: '24 saat öncesine kadar ücretsiz iptal',
                estimatedDuration: 'Değişken', // Depends on stops
                image: s.vehicle?.metadata?.imageUrl || '/vehicles/sprinter.png',
                isShuttle: true,
                departureTimes: s.departureTimes, // Pass departure times to frontend
                matchedMasterTime: s._matchedMasterTime,
                timeOffsetMin: s._timeOffsetMin
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
                
                if (req.zoneOverages && Object.keys(req.zoneOverages).length > 0) {
                    let lowestValidOverage = Infinity;
                    let smallestArea = Infinity;

                    for (const [zoneId, zoneData] of Object.entries(req.zoneOverages)) {
                        const zoneOverage = zoneData.overage;
                        const zoneArea = zoneData.area;

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

                        if (candidateConfig) {
                            // If this overage is strictly better, OR it's a tie but this zone is more specific (smaller area)
                            if (zoneOverage < lowestValidOverage || (zoneOverage === lowestValidOverage && zoneArea < smallestArea)) {
                                lowestValidOverage = zoneOverage;
                                smallestArea = zoneArea;
                                zonePriceConfig = candidateConfig;
                                finalMatchedZoneId = zoneId;
                                usedOverageDistanceKm = zoneOverage;
                            }
                        }
                    }
                }

                const typeMult = transferType === 'ROUND_TRIP' ? 1.9 : 1.0;

                if (zonePriceConfig) {
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

                    const extraKmRate = Number(zonePriceConfig.extraKmPrice) || 0;
                    
                    const overageCost = usedOverageDistanceKm * extraKmRate;
                    calculatedPrice = Math.round((baseRouteCost + overageCost) * typeMult);
                } else {
                    // Fallback to distance-based pricing:
                    // RULE: km-based pricing only applies when the pickup is from a known hub.
                    // If detectedBaseLocation is null (e.g. Denizli, İzmir — outside service area),
                    // do NOT give any price — show no vehicles for this search.
                    if (!detectedBaseLocation) {
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
                const contractLookupKey = finalMatchedZoneId && detectedBaseLocation ? `${vt.id}:${finalMatchedZoneId}:${detectedBaseLocation}` : null;
                const contractPrice = contractLookupKey ? agencyContractMap[contractLookupKey] : null;
                let finalPrice;
                if (contractPrice) {
                    // Contract price overrides all other pricing logic
                    const extra = usedOverageDistanceKm * (Number(contractPrice.extraKmPrice) || 0);
                    if (Number(contractPrice.fixedPrice) > 0) {
                        finalPrice = Math.round((Number(contractPrice.fixedPrice) + extra) * typeMult);
                    } else {
                        const perPersonPrice = Number(contractPrice.price) || 0;
                        finalPrice = Math.round(((perPersonPrice * Number(passengers)) + extra) * typeMult);
                    }
                } else {
                    // Standard pricing: apply agency markup on calculated price
                    finalPrice = Math.round(calculatedPrice * (1 + (agencyMarkup / 100)));
                }
                
                // Get image from active vehicles if type doesn't have one
                const imageUrl = vt.image || (vt.vehicles && vt.vehicles.length > 0 ? vt.vehicles[0].metadata?.imageUrl : '/vehicles/vito.png');

                return {
                    id: vt.id, 
                    vehicleType: vt.name, 
                    vehicleClass: vt.category,
                    vendor: 'SmartTravel',
                    capacity: vt.capacity,
                    luggage: vt.luggage,
                    price: finalPrice,
                    basePrice: contractPrice ? finalPrice : calculatedPrice, 
                    currency: vt.metadata?.currency || 'EUR', 
                    features: ['Özel Transfer', 'Kapıdan Kapıya', ...(vt.features || [])],
                    cancellationPolicy: '24 saat öncesine kadar ücretsiz iptal',
                    estimatedDuration: distance ? `${Math.round((distance ? Number(distance) : 50) * 1.2)} dk` : '50 dk', 
                    image: imageUrl,
                    isShuttle: false,
                    pricingMethod: contractPrice ? 'AGENCY_CONTRACT' : calculationMethod,
                    zonePriceConfig: contractPrice ? null : zonePriceConfig,
                    metadata: vt.metadata
                };
            }).filter(Boolean); // Remove skipped vehicles

        res.json({
            success: true,
            data: {
                searchParams: { pickup, dropoff, pickupDateTime, returnDateTime, passengers, transferType },
                results: [...shuttleResults, ...typeResults]
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
        const {
            vehicleType,
            pickup,
            dropoff,
            pickupDateTime,
            returnDateTime,
            passengers,
            price,
            currency, // New field
            paymentMethod, // Payment method from booking form
            customerInfo,
            flightNumber,
            flightTime, // New field for Explicit Flight Time
            notes,
            extraServices, // New field
            passengerDetails, // New field
            billingDetails, // Fatura bilgileri (undefined ise müşteri fatura istemedi)
            shuttleRouteId, // From search matching
            shuttleMasterTime // From closest offset
        } = req.body;

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

        // Detect region codes from hub keywords
        const hubs = await loadTenantHubs(tenantId);
        const pickupRegionCode = detectRegionCode(pickup, hubs);
        const dropoffRegionCode = detectRegionCode(dropoff, hubs);

        // Create booking in Database
        const booking = await prisma.booking.create({
            data: {
                tenantId: tenantId,
                customerId: userId || null,
                bookingNumber: bookingNumber,
                productType: 'TRANSFER',

                startDate: new Date(pickupDateTime),
                endDate: new Date(new Date(pickupDateTime).getTime() + 60 * 60 * 1000),

                adults: Number(passengers),
                children: 0,

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
                    returnDateTime,
                    flightNumber,
                    flightTime, // Save actual flight time regardless of pickup time
                    paymentMethod: paymentMethod || 'PAY_IN_VEHICLE', // Save payment method for operations display
                    notes,
                    distance: req.body.distance || '0 km',
                    duration: req.body.duration || '0 dk',
                    extraServices: extraServices || [], // Save Extra Services
                    wantsInvoice: !!billingDetails,      // true ise fatura istiyor
                    billingDetails: billingDetails || null, // Fatura detayları
                    passengerDetails: passengerDetails || [], // Move passengerDetails inside metadata
                    shuttleRouteId: shuttleRouteId || null,
                    shuttleMasterTime: shuttleMasterTime || null,
                    pickupRegionCode: pickupRegionCode || null,
                    dropoffRegionCode: dropoffRegionCode || null
                }
            }
        });

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

                // Create a single line item for the transfer
                const subTotalStr = (Number(price) || 0) / 1.20; // Assuming 20% VAT inclusive for B2C transfers
                const subTotal = Number(subTotalStr.toFixed(2));
                const totalVatStr = (Number(price) || 0) - subTotal;
                const totalVat = Number(totalVatStr.toFixed(2));

                const line = {
                    id: genId(),
                    description: `Transfer Hizmet Bedeli (${bookingNumber})`,
                    quantity: 1,
                    unitPrice: subTotal,
                    vatRate: 20,
                    vatAmount: totalVat,
                    lineTotal: subTotal,
                    unit: 'Hizmet'
                };

                const invoice = {
                    id: genId(),
                    invoiceNo: invoiceNo,
                    invoiceType: 'SALES',
                    invoiceKind: 'EARCHIVE', // Usually E-Archive for B2C customers
                    status: 'DRAFT',
                    sellerInfo: {}, // Admin/Company info can be left default or filled from tenant
                    buyerInfo: buyerInfo,
                    lines: [line],
                    subTotal: subTotal,
                    totalVat: totalVat,
                    discount: 0,
                    grandTotal: Number(price) || 0,
                    currency: currency || 'TRY',
                    invoiceDate: new Date().toISOString(),
                    paymentMethod: 'CASH', // Default for now
                    notes: `B2C Web Rezervasyonu: ${bookingNumber}`,
                    createdBy: userId || 'SYSTEM',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    bookingRef: bookingNumber,
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
                ...booking,
                // Flatten metadata for frontend consistency
                vehicleType: booking.metadata?.vehicleType,
                pickup: booking.metadata?.pickup,
                dropoff: booking.metadata?.dropoff,
                passengerName: booking.contactName,
                passengerPhone: booking.contactPhone,
                pickupDateTime: booking.startDate
            },
            message: 'Transfer rezervasyonunuz veritabanına kaydedildi.'
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
            assignedVehicleId: b.metadata?.assignedVehicleId || null, // Vehicle assignment
            // Nested relations mapping expected by the frontend:
            customer: b.customer,
            agencyName: b.agency?.name || b.agency?.companyName || b.customer?.agency?.name || b.customer?.agency?.companyName || b.metadata?.agencyName || null,
            agencyId: b.agencyId || b.customer?.agency?.id || null,
            // Fatura alanları
            wantsInvoice: b.metadata?.wantsInvoice || false,
            billingDetails: b.metadata?.billingDetails || null,
            metadata: b.metadata || {}
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
                time: new Date(b.startDate).toLocaleString('tr-TR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }),
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
                time: new Date(booking.startDate).toLocaleString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
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
                time: new Date(b.startDate).toLocaleString('tr-TR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }),
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
                time: new Date(b.startDate).toLocaleString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
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
                flightNumber, flightTime, adults, price, status: newStatus, operationalStatus } = req.body;

        const currentBooking = await prisma.booking.findUnique({ where: { id } });
        if (!currentBooking) {
            return res.status(404).json({ success: false, error: 'Rezervasyon bulunamadı' });
        }

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
        if (!skipConflictCheck && (driverId || assignedVehicleId)) {
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
            if (assignedVehicleId) {
                const conflict = checkConflict(assignedVehicleId, false);
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
            ...(assignedVehicleId !== undefined ? { assignedVehicleId } : {}),
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
        if (price !== undefined) { updateData.total = Number(price); updateData.subtotal = Number(price); }
        if (newStatus !== undefined) updateData.status = newStatus;
        if (returnToReservation) {
            updateData.status = 'PENDING';
            updateData.driverId = null;
        }

        if (driverId !== undefined) {
            updateData.driverId = driverId; // Update real column
            newMetadata.driverId = driverId; // Keep in metadata for legacy compatibility if needed
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

                // metadata might be a string if stored raw, or an object if JSON
                let driverMeta = driver?.metadata || {};
                if (typeof driverMeta === 'string') {
                    try { driverMeta = JSON.parse(driverMeta); } catch (e) { driverMeta = {}; }
                }

                const pushToken = driver?.pushToken || driverMeta?.expoPushToken;

                if (pushToken && pushToken.startsWith('ExponentPushToken')) {
                    const pickupStr = updated.metadata?.pickup || 'Belirtilmemiş';
                    const dateStr = updated.startDate
                        ? new Date(updated.startDate).toLocaleString('tr-TR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
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
        const { passengerName, passengerPhone, passengerEmail, pickup, dropoff, pickupDateTime, vehicleType, flightNumber, price, notes, adults } = req.body;

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
                specialRequests: notes || '',
                metadata: metadata,
            }
        });

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
        const { passengerName, passengerPhone, pickup, dropoff, pickupDateTime, vehicleType, flightNumber, price, notes, adults } = req.body;

        const currentBooking = await prisma.booking.findUnique({ where: { id: id } });
        if (!currentBooking) {
            return res.status(404).json({ success: false, error: 'Rezervasyon bulunamadı' });
        }

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
