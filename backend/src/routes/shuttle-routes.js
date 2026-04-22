const express = require('express');

const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
const prisma = require('../lib/prisma');

/**
 * GET /api/shuttle-routes
 * List all shuttle routes
 */
router.get('/', async (req, res) => {
    try {
        // Auto-fix legacy routes with null tenantId
        const tenantId = req.tenant?.id;
        if (tenantId) {
            await prisma.shuttleRoute.updateMany({
                where: { tenantId: null },
                data: { tenantId }
            });
        }

        const routes = await prisma.shuttleRoute.findMany({
            include: {
                vehicle: true,
                vehicleType: true
            },
            orderBy: {
                createdAt: 'desc'
            }
        });
        res.json({ success: true, data: routes });
    } catch (error) {
        console.error('Get shuttle routes error:', error);
        res.status(500).json({ success: false, error: 'Shuttle rotaları alınamadı' });
    }
});

/**
 * POST /api/shuttle-routes
 * Create a new shuttle route
 */
router.post('/', authMiddleware, async (req, res) => {
    try {
        const data = req.body;
        // Basic validation
        if ((!data.vehicleId && !data.vehicleTypeId) || !data.fromName || !data.toName) {
            return res.status(400).json({ success: false, error: 'Zorunlu alanlar eksik' });
        }

        const route = await prisma.shuttleRoute.create({
            data: {
                tenantId: req.tenant?.id || null,
                vehicleId: data.vehicleId || null,
                vehicleTypeId: data.vehicleTypeId || null,
                fromName: data.fromName,
                toName: data.toName,
                scheduleType: data.scheduleType || 'DAILY',
                departureTimes: data.departureTimes || [],
                pricePerSeat: data.pricePerSeat,
                extraKmPrice: data.extraKmPrice != null ? data.extraKmPrice : null,
                currency: data.currency || 'EUR',
                maxSeats: data.maxSeats,
                isActive: data.isActive !== false,
                customStartDate: data.customStartDate,
                customEndDate: data.customEndDate,
                weeklyDays: data.weeklyDays,
                pickupLocation: data.pickupLocation ? (typeof data.pickupLocation === 'object' ? JSON.stringify(data.pickupLocation) : data.pickupLocation) : null,
                pickupRadius: data.pickupRadius,
                pickupPolygon: data.pickupPolygon,
                pickupLeadHours: data.pickupLeadHours != null ? data.pickupLeadHours : null,
                metadata: data.metadata || null
            }
        });

        if (data.isBidirectional && data.returnDepartureTimes && data.returnDepartureTimes.length > 0) {
            // Build reverse metadata: properly swap hub codes and zone references
            const originalMeta = data.metadata || {};
            const reverseMeta = {
                ...originalMeta,                              // Spread FIRST so overrides work
                fromHubCode: originalMeta.toHubCode || null,  // Original destination hub → new pickup hub
                toHubCode: originalMeta.fromHubCode || null,  // Original pickup hub/zone → new dropoff
                fromZoneId: null,                             // Reverse pickup is the hub, not a zone
                reverseOf: 'auto-created',
            };
            // If the original route goes FROM a zone TO a hub,
            // the reverse goes FROM the hub TO the zone.
            // We need to set toHubCode to null (zone isn't a hub) but keep context.
            // The key fix: the reverse route's fromName is the hub, so text matching works.

            // Try to find a pickup polygon for the reverse direction from the destination hub
            let reversePickupLocation = null;
            let reversePickupPolygon = null;
            
            // If the destination (toHubCode) has a known location, use it for reverse pickup
            if (originalMeta.toHubCode && req.tenant?.id) {
                try {
                    const tenantInfo = await prisma.tenant.findUnique({ where: { id: req.tenant.id }, select: { settings: true } });
                    const tenantHubs = tenantInfo?.settings?.hubs || [];
                    const destinationHub = tenantHubs.find(h => h.code === originalMeta.toHubCode);
                    if (destinationHub && destinationHub.name) {
                        // Create a generous pickup point around the hub for coordinate-based matching
                        reversePickupLocation = { lat: 0, lng: 0, address: destinationHub.name };
                    }
                } catch (e) {
                    console.error('Failed to resolve reverse hub location', e);
                }
            }

            await prisma.shuttleRoute.create({
                data: {
                    vehicleId: data.vehicleId || null,
                    vehicleTypeId: data.vehicleTypeId || null,
                    fromName: data.toName,         // Swap from Name
                    toName: data.fromName,         // Swap to Name
                    scheduleType: data.scheduleType || 'DAILY', // Same schedule type
                    departureTimes: data.returnDepartureTimes, // Use return times
                    pricePerSeat: data.pricePerSeat, // Same price
                    extraKmPrice: data.extraKmPrice != null ? data.extraKmPrice : null,
                    currency: data.currency || 'EUR',
                    maxSeats: data.maxSeats,         // Same capacity
                    isActive: data.isActive !== false,
                    customStartDate: data.customStartDate,
                    customEndDate: data.customEndDate,
                    weeklyDays: data.weeklyDays,
                    pickupLocation: reversePickupLocation ? JSON.stringify(reversePickupLocation) : null,
                    pickupRadius: null,
                    pickupPolygon: reversePickupPolygon,
                    pickupLeadHours: data.pickupLeadHours != null ? data.pickupLeadHours : null,
                    metadata: reverseMeta,
                    tenantId: req.tenant?.id || null
                }
            });
        }

        res.json({ success: true, data: route });
    } catch (error) {
        console.error('Create shuttle route error:', error);
        res.status(500).json({ success: false, error: 'Shuttle rotası oluşturulamadı: ' + error.message });
    }
});

/**
 * PUT /api/shuttle-routes/:id
 * Update a shuttle route
 */
router.put('/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const data = req.body;

        const route = await prisma.shuttleRoute.update({
            where: { id },
            data: {
                vehicleId: data.vehicleId || null,
                vehicleTypeId: data.vehicleTypeId || null,
                fromName: data.fromName,
                toName: data.toName,
                scheduleType: data.scheduleType,
                departureTimes: data.departureTimes,
                pricePerSeat: data.pricePerSeat,
                extraKmPrice: data.extraKmPrice != null ? data.extraKmPrice : null,
                currency: data.currency,
                maxSeats: data.maxSeats,
                isActive: data.isActive,
                customStartDate: data.customStartDate,
                customEndDate: data.customEndDate,
                weeklyDays: data.weeklyDays,
                pickupLocation: data.pickupLocation ? (typeof data.pickupLocation === 'object' ? JSON.stringify(data.pickupLocation) : data.pickupLocation) : null,
                pickupRadius: data.pickupRadius,
                pickupPolygon: data.pickupPolygon,
                pickupLeadHours: data.pickupLeadHours != null ? data.pickupLeadHours : null,
                metadata: data.metadata || null
            }
        });

        // Add return route if bidirectional flag is checked during update
        if (data.isBidirectional && data.returnDepartureTimes && data.returnDepartureTimes.length > 0) {
            await prisma.shuttleRoute.create({
                data: {
                    vehicleId: data.vehicleId || null,
                    vehicleTypeId: data.vehicleTypeId || null,
                    fromName: data.toName,
                    toName: data.fromName,
                    scheduleType: data.scheduleType || 'DAILY',
                    departureTimes: data.returnDepartureTimes,
                    pricePerSeat: data.pricePerSeat,
                    extraKmPrice: data.extraKmPrice != null ? data.extraKmPrice : null,
                    currency: data.currency || 'EUR',
                    maxSeats: data.maxSeats,
                    isActive: data.isActive !== false,
                    customStartDate: data.customStartDate,
                    customEndDate: data.customEndDate,
                    weeklyDays: data.weeklyDays,
                    pickupLocation: null,
                    pickupRadius: null,
                    pickupPolygon: null,
                    pickupLeadHours: data.pickupLeadHours != null ? data.pickupLeadHours : null,
                    metadata: {
                        ...(data.metadata || {}),
                        fromZoneId: null,
                        toHubCode: null,
                        reverseOf: 'auto-updated'
                    }
                }
            });
        }

        res.json({ success: true, data: route });
    } catch (error) {
        console.error('Update shuttle route error:', error);
        res.status(500).json({ success: false, error: 'Shuttle rotası güncellenemedi' });
    }
});

/**
 * PATCH /api/shuttle-routes/:id/active
 * Toggle active status
 */
router.patch('/:id/active', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { isActive } = req.body;

        const route = await prisma.shuttleRoute.update({
            where: { id },
            data: { isActive: isActive }
        });

        res.json({ success: true, data: route });
    } catch (error) {
        console.error('Toggle shuttle status error:', error);
        res.status(500).json({ success: false, error: 'Durum güncellenemedi' });
    }
});

/**
 * DELETE /api/shuttle-routes/:id
 * Delete a shuttle route
 */
router.delete('/:id', authMiddleware, async (req, res) => {
    try {
        const tenantId = req.tenant?.id;
        if (!tenantId) return res.status(401).json({ success: false, error: 'Tenant context missing.' });

        // Ensure the route belongs to the tenant (also match null tenantId for legacy data)
        const route = await prisma.shuttleRoute.findFirst({
            where: { 
                id: req.params.id, 
                OR: [
                    { tenantId },
                    { tenantId: null }
                ]
            }
        });

        if (!route) {
            console.log(`[DELETE shuttle-route] Not found: id=${req.params.id}, tenantId=${tenantId}`);
            return res.status(404).json({ success: false, error: 'Shuttle rotası bulunamadı.' });
        }

        await prisma.shuttleRoute.delete({
            where: { id: req.params.id }
        });

        res.json({ success: true, message: 'Shuttle rotası başarıyla silindi.' });
    } catch (error) {
        console.error('Delete shuttle route error:', error);
        res.status(500).json({ success: false, error: 'Shuttle rotası silinemedi' });
    }
});

module.exports = router;
