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
        const routes = await prisma.shuttleRoute.findMany({
            include: {
                vehicle: true
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
        if (!data.vehicleId || !data.fromName || !data.toName) {
            return res.status(400).json({ success: false, error: 'Zorunlu alanlar eksik' });
        }

        const route = await prisma.shuttleRoute.create({
            data: {
                vehicleId: data.vehicleId,
                fromName: data.fromName,
                toName: data.toName,
                scheduleType: data.scheduleType || 'DAILY',
                departureTimes: data.departureTimes || [],
                pricePerSeat: data.pricePerSeat,
                currency: data.currency || 'EUR',
                maxSeats: data.maxSeats,
                isActive: data.isActive !== false,
                customStartDate: data.customStartDate,
                customEndDate: data.customEndDate,
                weeklyDays: data.weeklyDays,
                pickupLocation: data.pickupLocation ? (typeof data.pickupLocation === 'object' ? JSON.stringify(data.pickupLocation) : data.pickupLocation) : null,
                pickupRadius: data.pickupRadius,
                pickupPolygon: data.pickupPolygon,
                metadata: data.metadata || null
            }
        });

        if (data.isBidirectional && data.returnDepartureTimes && data.returnDepartureTimes.length > 0) {
            await prisma.shuttleRoute.create({
                data: {
                    vehicleId: data.vehicleId,     // Same vehicle
                    fromName: data.toName,         // Swap from Name
                    toName: data.fromName,         // Swap to Name
                    scheduleType: data.scheduleType || 'DAILY', // Same schedule type
                    departureTimes: data.returnDepartureTimes, // Use return times
                    pricePerSeat: data.pricePerSeat, // Same price
                    currency: data.currency || 'EUR',
                    maxSeats: data.maxSeats,         // Same capacity
                    isActive: data.isActive !== false,
                    customStartDate: data.customStartDate,
                    customEndDate: data.customEndDate,
                    weeklyDays: data.weeklyDays,
                    // Typically do not apply the origin's exact pickup locations to the destination (since it would make pickupPolygon of Alanya active in Antalya, which makes no sense). Left null.
                    pickupLocation: null,
                    pickupRadius: null,
                    pickupPolygon: null
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
                vehicleId: data.vehicleId,
                fromName: data.fromName,
                toName: data.toName,
                scheduleType: data.scheduleType,
                departureTimes: data.departureTimes,
                pricePerSeat: data.pricePerSeat,
                currency: data.currency,
                maxSeats: data.maxSeats,
                isActive: data.isActive,
                customStartDate: data.customStartDate,
                customEndDate: data.customEndDate,
                weeklyDays: data.weeklyDays,
                pickupLocation: data.pickupLocation ? (typeof data.pickupLocation === 'object' ? JSON.stringify(data.pickupLocation) : data.pickupLocation) : null,
                pickupRadius: data.pickupRadius,
                pickupPolygon: data.pickupPolygon,
                metadata: data.metadata || null
            }
        });

        // Add return route if bidirectional flag is checked during update
        if (data.isBidirectional && data.returnDepartureTimes && data.returnDepartureTimes.length > 0) {
            await prisma.shuttleRoute.create({
                data: {
                    vehicleId: data.vehicleId,
                    fromName: data.toName,
                    toName: data.fromName,
                    scheduleType: data.scheduleType || 'DAILY',
                    departureTimes: data.returnDepartureTimes,
                    pricePerSeat: data.pricePerSeat,
                    currency: data.currency || 'EUR',
                    maxSeats: data.maxSeats,
                    isActive: data.isActive !== false,
                    customStartDate: data.customStartDate,
                    customEndDate: data.customEndDate,
                    weeklyDays: data.weeklyDays,
                    pickupLocation: null,
                    pickupRadius: null,
                    pickupPolygon: null
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

        // Ensure the route belongs to the tenant
        const route = await prisma.shuttleRoute.findFirst({
            where: { id: req.params.id, tenantId }
        });

        if (!route) {
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
