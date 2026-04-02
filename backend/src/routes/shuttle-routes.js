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
                pickupPolygon: data.pickupPolygon
            }
        });

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
                pickupPolygon: data.pickupPolygon
            }
        });

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

module.exports = router;
