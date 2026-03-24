// src/routes/transfer.js
// Transfer module routes with Prisma Persistence

const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authMiddleware, optionalAuthMiddleware } = require('../middleware/auth');
const turf = require('@turf/turf');
const flexpolyline = require('@here/flexpolyline');

const router = express.Router();
const prisma = new PrismaClient();

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
            pickupLng
        } = req.body;

        // Fetch agency markup if user is an agency agent
        let agencyMarkup = 0;
        if (req.user && req.user.id) {
            const dbUser = await prisma.user.findUnique({
                where: { id: req.user.id },
                select: {
                    agencyCommissionRate: true,
                    role: { select: { type: true } },
                    agency: { select: { markup: true } }
                }
            });

            if (dbUser) {
                // If the user is AGENCY_STAFF and has a specific commission rate set, use that.
                if (dbUser.role?.type === 'AGENCY_STAFF' && dbUser.agencyCommissionRate !== null) {
                    agencyMarkup = parseFloat(dbUser.agencyCommissionRate) || 0;
                }
                // Otherwise, fallback to the agency's default markup.
                else if (dbUser.agency?.markup) {
                    agencyMarkup = parseFloat(dbUser.agency.markup) || 0;
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
                    where: { status: 'ACTIVE' },
                    include: { zonePrices: true }
                },
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
        const allText = pickupNorm + " " + dropoffNorm;
        
        let bestMatchLength = 0;
        
        for (const hub of hubs) {
            const keys = hub.keywords ? hub.keywords.split(',').map(k => k.trim().toLowerCase()).filter(k => k) : [];
            keys.push(hub.code.toLowerCase());
            if (hub.name) keys.push(hub.name.toLowerCase().replace('havalimanı', '').replace('airport', '').trim());
            
            // Add robust aliases automatically to prevent user-admin omission errors
            if (hub.code === 'GZP') keys.push('gazipaşa', 'gazipasa');
            if (hub.code === 'AYT') keys.push('antalya');
            
            for (const k of keys) {
                // If this keyword matches AND is longer/more specific than previous match
                if (allText.includes(k) && k.length > bestMatchLength) {
                    // Give priority to specific airports over generic city names
                    if (k.includes('gazipaşa') || k.includes('gazipasa') || k.includes('gzp')) {
                         detectedBaseLocation = 'GZP';
                         bestMatchLength = 999; // Max priority
                    } else {
                         detectedBaseLocation = hub.code;
                         bestMatchLength = k.length;
                    }
                }
            }
        }

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
            // 1. Location Check
            let isLocationMatch = false;

            // If Route has Pickup Location defined
            if (route.pickupLocation) {
                // Parse route location
                const routeLoc = typeof route.pickupLocation === 'string'
                    ? JSON.parse(route.pickupLocation)
                    : route.pickupLocation;

                // Check if request has coordinates
                if (req.body.pickupLat && req.body.pickupLng) {
                    const userLat = Number(req.body.pickupLat);
                    const userLng = Number(req.body.pickupLng);

                    // 1. Polygon Check (Priority)
                    if (route.pickupPolygon) {
                        const polygon = typeof route.pickupPolygon === 'string'
                            ? JSON.parse(route.pickupPolygon)
                            : route.pickupPolygon;

                        // Check if valid polygon array
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
                            isLocationMatch = inside;
                        }
                    }

                    // 2. Radius Check (Fallback if not Matched yet and radius exists)
                    if (!isLocationMatch && route.pickupRadius) {
                        const dist = getDistanceFromLatLonInMeters(
                            routeLoc.lat,
                            routeLoc.lng,
                            userLat,
                            userLng
                        );
                        // Match if within radius
                        if (dist <= route.pickupRadius) {
                            isLocationMatch = true;
                        }
                    }
                } else {
                    // Fallback to text matching if client didn't send coords 
                    const routeFrom = normalizeLocation(route.fromName);
                    const routeTo = normalizeLocation(route.toName);
                    isLocationMatch = (routeFrom.includes(pickupNorm) || pickupNorm.includes(routeFrom)) &&
                        (routeTo.includes(dropoffNorm) || dropoffNorm.includes(routeTo));
                }
            } else {
                // Legacy Text Matching
                const routeFrom = normalizeLocation(route.fromName);
                const routeTo = normalizeLocation(route.toName);
                isLocationMatch = (routeFrom.includes(pickupNorm) || pickupNorm.includes(routeFrom)) &&
                    (routeTo.includes(dropoffNorm) || dropoffNorm.includes(routeTo));
            }

            if (!isLocationMatch) return false;

            // Schedule Check
            if (route.scheduleType === 'DAILY') return true;
            if (route.scheduleType === 'WEEKLY') {
                const allowedDays = Array.isArray(route.weeklyDays) ? route.weeklyDays : [];
                return allowedDays.includes(currentDayCode);
            }
            if (route.scheduleType === 'CUSTOM') {
                if (!route.customStartDate || !route.customEndDate) return false;
                return dateStr >= route.customStartDate && dateStr <= route.customEndDate;
            }
            return false;
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
                image: s.vehicle?.metadata?.imageUrl || '/vehicles/sprinter.jpg',
                isShuttle: true,
                departureTimes: s.departureTimes // Pass departure times to frontend
            };
        });

        // 3. Map Vehicle Types to Results (Sorted by Order)
        const typeResults = vehicleTypes
            .filter(vt => vt.vehicles && vt.vehicles.length > 0)
            .sort((a, b) => (a.order || 0) - (b.order || 0)) // Sort by order
            .map(vt => {
                let calculatedPrice;
                let calculationMethod = 'DISTANCE_BASE';

                // Try to find Zone Pricing from the first active vehicle of this type
                const firstVehicle = vt.vehicles && vt.vehicles.length > 0 ? vt.vehicles[0] : null;
                let zonePriceConfig = null;
                let finalMatchedZoneId = null;
                let usedOverageDistanceKm = 0;
                
                if (firstVehicle && req.zoneOverages && Object.keys(req.zoneOverages).length > 0) {
                    let lowestValidOverage = Infinity;
                    let smallestArea = Infinity;

                    for (const [zoneId, zoneData] of Object.entries(req.zoneOverages)) {
                        const zoneOverage = zoneData.overage;
                        const zoneArea = zoneData.area;

                        let candidateConfig = firstVehicle.zonePrices.find(zp => zp.zoneId === zoneId && zp.baseLocation === detectedBaseLocation);
                        
                        // Fallback to AYT if detected base location is null and we are checking for AYT
                        if (!candidateConfig && detectedBaseLocation === null) {
                            candidateConfig = firstVehicle.zonePrices.find(zp => zp.zoneId === zoneId && zp.baseLocation === 'AYT');
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
                    const fixedPrice = Number(zonePriceConfig.price) || 0;
                    const extraKmRate = Number(zonePriceConfig.extraKmPrice) || 0;
                    
                    const overageCost = usedOverageDistanceKm * extraKmRate;
                    calculatedPrice = Math.round((fixedPrice + overageCost) * typeMult);
                } else {
                    // Fallback to distance-based pricing ONLY if explicitly defined
                    const openingFee = firstVehicle?.metadata?.openingFee;
                    const pricePerKmField = firstVehicle?.metadata?.basePricePerKm;
                    
                    const hasValidFallback = (openingFee != null && Number(openingFee) > 0) || 
                                             (pricePerKmField != null && Number(pricePerKmField) > 0);
                                             
                    if (!hasValidFallback) {
                        return null; // Skip this vehicle entirely if no polygon match and no explicit fallback rates
                    }
                    
                    const basePrice = openingFee ? Number(openingFee) : 0; 
                    const pricePerKm = pricePerKmField ? Number(pricePerKmField) : 0;
                    
                    const dist = distance ? Number(distance) : 50;
                    calculatedPrice = Math.round((basePrice + (dist * pricePerKm)) * typeMult);
                }

                // Apply agency markup
                const finalMarkedUpPrice = Math.round(calculatedPrice * (1 + (agencyMarkup / 100)));

                return {
                    id: vt.id, 
                    vehicleType: vt.name, 
                    vehicleClass: vt.category,
                    vendor: 'SmartTravel',
                    capacity: vt.capacity,
                    luggage: vt.luggage,
                    price: finalMarkedUpPrice,
                    basePrice: calculatedPrice, 
                    currency: firstVehicle?.metadata?.currency || 'EUR', 
                    features: ['Özel Transfer', 'Kapıdan Kapıya', ...(vt.features || [])],
                    cancellationPolicy: '24 saat öncesine kadar ücretsiz iptal',
                    estimatedDuration: distance ? `${Math.round((distance ? Number(distance) : 50) * 1.2)} dk` : '50 dk', 
                    image: firstVehicle?.metadata?.imageUrl || vt.image || '/vehicles/vito.jpg',
                    isShuttle: false,
                    pricingMethod: calculationMethod
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
            customerInfo,
            flightNumber,
            notes,
            extraServices, // New field
            passengerDetails, // New field
            billingDetails // Fatura bilgileri (undefined ise müşteri fatura istemedi)
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
                    notes,
                    distance: req.body.distance || '0 km',
                    duration: req.body.duration || '0 dk',
                    extraServices: extraServices || [], // Save Extra Services
                    wantsInvoice: !!billingDetails,      // true ise fatura istiyor
                    billingDetails: billingDetails || null, // Fatura detayları
                    passengerDetails: passengerDetails || [] // Move passengerDetails inside metadata
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
            flightNumber: b.metadata?.flightNumber,
            operationalStatus: b.metadata?.operationalStatus, // Added for Op/Pool tracking
            partnerName: b.confirmedBy ? (userMap[b.confirmedBy] || 'Bilinmiyor') : null, // Map Partner Name
            partnerRole: b.confirmedBy ? (roleMap[b.confirmedBy] || 'UNKNOWN') : null, // Map Partner Role
            driverId: b.metadata?.driverId || null, // Driver assignment
            assignedVehicleId: b.metadata?.assignedVehicleId || null, // Vehicle assignment
            // Nested relations mapping expected by the frontend:
            customer: b.customer,
            agencyName: b.agency?.companyName || b.customer?.agency?.companyName || b.metadata?.agencyName || null,
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
                amount: Number(b.total),
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
                currency: booking.currency
            },
            status: booking.status,
            operationalStatus: booking.metadata?.operationalStatus || 'POOL',
            flightNumber: booking.metadata?.flightNumber,
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
                amount: Number(b.total),
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
                amount: Number(b.total),
                currency: b.currency
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

        res.json({
            success: true,
            data: {
                pending: pendingCount,
                today: todayCount
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
        const { driverId, assignedVehicleId, skipConflictCheck } = req.body;

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
            const pickupDateTime = currentBooking.startDate;
            const REST_MINUTES = 30;
            const totalMinutes = (estimatedDurationMinutes || 120) + REST_MINUTES;

            const newStart = new Date(pickupDateTime);
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
        const pickupDateTime = currentBooking.startDate;
        const freeAt = new Date(new Date(pickupDateTime).getTime() + ((estimatedDurationMinutes || 120) + 30) * 60000);

        const newMetadata = {
            ...(currentBooking.metadata || {}),
            ...(assignedVehicleId !== undefined ? { assignedVehicleId } : {}),
            estimatedDurationMinutes: estimatedDurationMinutes || 120,
            freeAt: freeAt.toISOString()
        };

        // Prepare update data
        const updateData = {
            metadata: newMetadata
        };

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
 * PUT /api/transfer/bookings/:id/status
 * Update booking status (Admin) - In Database
 */
router.put('/bookings/:id/status', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { status, subStatus } = req.body;

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

        const updatedBooking = await prisma.booking.update({
            where: { id: id },
            data: {
                status: status,
                metadata: newMetadata,
                // If confirmed, set confirmedAt
                ...(status === 'CONFIRMED' ? { confirmedAt: new Date(), confirmedBy: req.user?.id } : {}),
                // If cancelled, set cancelledAt
                ...(status === 'CANCELLED' ? { cancelledAt: new Date(), cancelledBy: req.user?.id } : {})
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
