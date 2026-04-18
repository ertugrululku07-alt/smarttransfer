const express = require('express');

const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
const prisma = require('../lib/prisma');

// Helper to map DB enum to Frontend display
const VehicleCategoryEnum = {
    SEDAN: 'Sedan',
    VAN: 'Van',
    MINIBUS: 'Minibus',
    BUS: 'Otobüs',
    LUXURY: 'Lüks',
    VIP: 'VIP'
};

/**
 * GET /api/vehicle-types
 * List all vehicle types
 */
router.get('/', authMiddleware, async (req, res) => {
    try {
        const tenantId = req.tenant?.id;
        if (!tenantId) return res.status(400).json({ success: false, error: 'Tenant context missing' });

        const vehicleTypes = await prisma.vehicleType.findMany({
            where: { tenantId },
            orderBy: { order: 'asc' },
            include: {
                _count: {
                    select: { vehicles: true }
                },
                zonePrices: true
            }
        });

        // Format for frontend
        const formatted = vehicleTypes.map(vt => ({
            id: vt.id,
            name: vt.name,
            category: vt.category,
            categoryDisplay: VehicleCategoryEnum[vt.category] || vt.category,
            capacity: vt.capacity,
            luggage: vt.luggage,
            description: vt.description,
            image: vt.image,
            features: vt.features || [],
            metadata: vt.metadata || {},
            zonePrices: vt.zonePrices || [],
            vehicleCount: vt._count.vehicles,
            order: vt.order
        }));

        res.json({ success: true, data: formatted });
    } catch (error) {
        console.error('Get vehicle types error:', error);
        res.status(500).json({ success: false, error: 'Araç tipleri alınamadı' });
    }
});

/**
 * PUT /api/vehicle-types/reorder
 * Reorder vehicle types
 */
router.put('/reorder', authMiddleware, async (req, res) => {
    try {
        const tenantId = req.tenant?.id;
        const { items } = req.body; // Array of { id, order }

        if (!Array.isArray(items)) {
            return res.status(400).json({ success: false, error: 'items array gereklidir' });
        }

        // Execute as transaction
        await prisma.$transaction(
            items.map(item =>
                prisma.vehicleType.update({
                    where: { id: item.id },
                    data: { order: item.order }
                })
            )
        );

        res.json({ success: true, message: 'Sıralama güncellendi' });
    } catch (error) {
        console.error('Reorder error:', error);
        res.status(500).json({ success: false, error: 'Sıralama güncellenemedi' });
    }
});

/**
 * POST /api/vehicle-types
 * Create a new vehicle type
 */
router.post('/', authMiddleware, async (req, res) => {
    try {
        const tenantId = req.tenant?.id;
        const { name, category, capacity, luggage, description, features } = req.body;

        if (!name || !category) {
            return res.status(400).json({ success: false, error: 'İsim ve Kategori zorunludur' });
        }

        // Check if slug exists (simple slug generation)
        const slug = (name.toLowerCase().replace(/ /g, '-') + '-' + Date.now()).replace(/[^a-z0-9-]/g, '');

        // Get max order to append to end
        const maxOrder = await prisma.vehicleType.aggregate({
            where: { tenantId },
            _max: { order: true }
        });
        const nextOrder = (maxOrder._max.order || 0) + 1;

        const vehicleType = await prisma.vehicleType.create({
            data: {
                tenantId,
                name,
                slug,
                category,
                capacity: parseInt(capacity) || 0,
                luggage: parseInt(luggage) || 0,
                description,
                image: req.body.image,
                features: features || [],
                metadata: req.body.metadata || {},
                order: nextOrder,
                zonePrices: req.body.zonePrices ? {
                    create: req.body.zonePrices.map(z => ({
                        zoneId: z.zoneId,
                        baseLocation: z.baseLocation,
                        price: z.price,
                        childPrice: z.childPrice,
                        babyPrice: z.babyPrice,
                        fixedPrice: z.fixedPrice,
                        cost: z.cost,
                        extraKmPrice: z.extraKmPrice,
                        pickupLeadHours: z.pickupLeadHours ?? null
                    }))
                } : undefined
            },
            include: { zonePrices: true }
        });

        res.json({ success: true, data: vehicleType });
    } catch (error) {
        console.error('Create vehicle type error:', error);
        res.status(500).json({ success: false, error: 'Araç tipi oluşturulamadı' });
    }
});

/**
 * PUT /api/vehicle-types/:id
 * Update a vehicle type
 */
router.put('/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const tenantId = req.tenant?.id;
        const { name, category, capacity, luggage, description, features } = req.body;

        if (!name || !category) {
            return res.status(400).json({ success: false, error: 'İsim ve Kategori zorunludur' });
        }

        // Use a transaction: first delete existing zone prices, then recreate
        const vehicleType = await prisma.$transaction(async (tx) => {
            // 1. Update the vehicle type fields
            const updated = await tx.vehicleType.update({
                where: { id },
                data: {
                    name,
                    category,
                    capacity: parseInt(capacity) || 0,
                    luggage: parseInt(luggage) || 0,
                    description,
                    image: req.body.image,
                    features: features || [],
                    metadata: req.body.metadata || {},
                }
            });

            // 2. If zonePrices provided, delete old ones and create new
            if (Array.isArray(req.body.zonePrices)) {
                await tx.vehicleTypeZonePrice.deleteMany({ where: { vehicleTypeId: id } });

                if (req.body.zonePrices.length > 0) {
                    await tx.vehicleTypeZonePrice.createMany({
                        data: req.body.zonePrices.map(z => ({
                            vehicleTypeId: id,
                            zoneId: z.zoneId,
                            baseLocation: z.baseLocation || 'AYT',
                            price: z.price ?? 0,
                            childPrice: z.childPrice ?? null,
                            babyPrice: z.babyPrice ?? null,
                            fixedPrice: z.fixedPrice ?? null,
                            cost: z.cost ?? null,
                            extraKmPrice: z.extraKmPrice ?? null,
                            pickupLeadHours: z.pickupLeadHours ?? null,
                        }))
                    });
                }
            }

            return tx.vehicleType.findUnique({
                where: { id },
                include: { zonePrices: true }
            });
        });

        res.json({ success: true, data: vehicleType });
    } catch (error) {
        console.error('Update vehicle type error:', error.message, error.code);
        res.status(500).json({ success: false, error: 'Araç tipi güncellenemedi: ' + error.message });
    }
});


/**
 * DELETE /api/vehicle-types/:id
 * Delete a vehicle type
 */
router.delete('/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;

        // Check if in use
        const vehicleCount = await prisma.vehicle.count({
            where: { vehicleTypeId: id }
        });

        if (vehicleCount > 0) {
            return res.status(400).json({
                success: false,
                error: `Bu araç tipine bağlı ${vehicleCount} araç var. Silmeden önce araçları güncelleyin.`
            });
        }

        await prisma.vehicleType.delete({
            where: { id }
        });

        res.json({ success: true, message: 'Araç tipi silindi' });
    } catch (error) {
        console.error('Delete vehicle type error:', error);
        res.status(500).json({ success: false, error: 'Araç tipi silinemedi' });
    }
});

module.exports = router;
