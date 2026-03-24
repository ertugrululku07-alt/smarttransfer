const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// Helper to map frontend vehicle types to schema categories
const mapVehicleTypeToCategory = (type) => {
    const map = {
        'SEDAN': 'SEDAN',
        'MINIVAN': 'VAN',
        'VIP_VAN': 'VIP',
        'MINIBUS': 'MINIBUS',
        'BUS': 'BUS',
        'LUXURY': 'LUXURY'
    };
    return map[type] || 'SEDAN';
};

/**
 * GET /api/vehicles
 * List all vehicles
 */
router.get('/', authMiddleware, async (req, res) => {
    try {
        const tenantId = req.tenant?.id;
        if (!tenantId) return res.status(400).json({ success: false, error: 'Tenant context missing' });

        const whereClause = { tenantId, status: { not: 'RETIRED' } };

        // If user is a Partner, only show their vehicles
        if (req.user.roleType === 'PARTNER') {
            whereClause.ownerId = req.user.id;
        }

        const vehicles = await prisma.vehicle.findMany({
            where: whereClause,
            include: { vehicleType: true, zonePrices: true },
            orderBy: { createdAt: 'desc' }
        });

        // Map to frontend format
        const formattedVehicles = vehicles.map(v => ({
            id: v.id,
            name: `${v.brand} ${v.model}`,
            brand: v.brand,
            model: v.model,
            year: v.year,
            color: v.color,
            plateNumber: v.plateNumber,
            capacity: v.vehicleType?.capacity || 0,
            luggage: v.vehicleType?.luggage || 0,
            vehicleType: v.vehicleType?.category || 'SEDAN',
            vehicleTypeId: v.vehicleTypeId, // Added vehicleTypeId
            vehicleTypeDetails: v.vehicleType, // Added full details for frontend reference
            vehicleClass: v.metadata?.vehicleClass || 'ECONOMY',
            basePricePerKm: v.metadata?.basePricePerKm,
            basePricePerHour: v.metadata?.basePricePerHour,
            isCompanyOwned: v.isOwned,
            hasBabySeat: v.metadata?.hasBabySeat || false,
            maxBabySeats: v.metadata?.maxBabySeats || 0,
            imageUrl: v.metadata?.imageUrl,
            description: v.metadata?.description,
            isActive: v.status === 'ACTIVE',
            createdAt: v.createdAt,
            usageType: v.metadata?.usageType || 'TRANSFER',
            shuttleMode: v.metadata?.shuttleMode,
            hasWifi: v.metadata?.hasWifi || false,
            openingFee: v.metadata?.openingFee,
            fixedPrice: v.metadata?.fixedPrice,
            currency: v.metadata?.currency,
            driverId: v.metadata?.driverId || null,
            zonePrices: v.zonePrices || []
        }));

        res.json({ success: true, data: formattedVehicles });
    } catch (error) {
        console.error('Get vehicles error:', error);
        res.status(500).json({ success: false, error: 'Araçlar alınamadı' });
    }
});

/**
 * POST /api/vehicles
 * Create a new vehicle
 */
router.post('/', authMiddleware, async (req, res) => {
    try {
        const tenantId = req.tenant?.id;
        const data = req.body;
        let vehicleTypeId = data.vehicleTypeId;

        // If no explicit vehicleTypeId, try to find/create based on string (Legacy support)
        if (!vehicleTypeId && data.vehicleType) {
            const category = mapVehicleTypeToCategory(data.vehicleType);
            let vehicleType = await prisma.vehicleType.findFirst({
                where: { tenantId, category }
            });

            if (!vehicleType) {
                // Create default if not exists
                vehicleType = await prisma.vehicleType.create({
                    data: {
                        tenantId,
                        name: data.vehicleType,
                        slug: (data.vehicleType + '-' + Date.now()).toLowerCase(),
                        category: category,
                        capacity: data.capacity || 4,
                        luggage: data.luggage || 2
                    }
                });
            }
            vehicleTypeId = vehicleType.id;
        }

        if (!vehicleTypeId) {
            return res.status(400).json({ success: false, error: 'Geçerli bir Araç Tipi seçilmelidir.' });
        }

        const vehicle = await prisma.vehicle.create({
            data: {
                tenantId,
                plateNumber: data.plateNumber,
                brand: data.brand || 'Unknown',
                model: data.model || 'Unknown',
                year: data.year || new Date().getFullYear(),
                color: data.color || 'White',
                status: data.isActive ? 'ACTIVE' : 'INACTIVE',
                isOwned: data.isCompanyOwned !== false,
                vehicleTypeId: vehicleTypeId,
                metadata: {
                    vehicleClass: data.vehicleClass,
                    basePricePerKm: data.basePricePerKm,
                    basePricePerHour: data.basePricePerHour,
                    hasBabySeat: data.hasBabySeat,
                    maxBabySeats: data.maxBabySeats,
                    imageUrl: data.imageUrl,
                    description: data.description,
                    usageType: data.usageType,
                    shuttleMode: data.shuttleMode,
                    hasWifi: data.hasWifi,
                    openingFee: data.openingFee,
                    fixedPrice: data.fixedPrice,
                    currency: data.currency
                },
                zonePrices: data.zonePrices ? {
                    create: data.zonePrices.map(zp => ({
                        zoneId: zp.zoneId,
                        baseLocation: zp.baseLocation || 'AYT',
                        price: parseFloat(zp.price),
                        extraKmPrice: zp.extraKmPrice != null ? parseFloat(zp.extraKmPrice) : null,
                    }))
                } : undefined
            }
        });

        res.json({ success: true, data: vehicle });
    } catch (error) {
        console.error('Create vehicle error:', error);
        res.status(500).json({ success: false, error: 'Araç oluşturulamadı: ' + error.message });
    }
});

/**
 * PUT /api/vehicles/:id
 * Update a vehicle
 */
router.put('/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const tenantId = req.tenant?.id || req.user?.tenantId;
        const data = req.body;

        // Fetch existing metadata to preserve tracking data
        const existingVehicle = await prisma.vehicle.findFirst({ where: { id, tenantId }, select: { metadata: true } });
        const existingMeta = existingVehicle?.metadata || {};

        const updateData = {
            plateNumber: data.plateNumber,
            brand: data.brand,
            model: data.model,
            year: data.year,
            color: data.color,
            status: data.isActive ? 'ACTIVE' : 'INACTIVE',
            isOwned: data.isCompanyOwned,
            metadata: {
                // Preserve existing fields (especially tracking!)
                ...existingMeta,
                // Overwrite only the vehicle definition fields
                vehicleClass: data.vehicleClass,
                basePricePerKm: data.basePricePerKm,
                basePricePerHour: data.basePricePerHour,
                hasBabySeat: data.hasBabySeat,
                maxBabySeats: data.maxBabySeats,
                imageUrl: data.imageUrl,
                description: data.description,
                usageType: data.usageType,
                shuttleMode: data.shuttleMode,
                hasWifi: data.hasWifi,
                openingFee: data.openingFee,
                fixedPrice: data.fixedPrice,
                currency: data.currency,
                driverId: existingMeta.driverId ?? null,
            }
        };

        if (data.vehicleTypeId) {
            updateData.vehicleTypeId = data.vehicleTypeId;
        }

        const zonePricesOperation = data.zonePrices ? {
            deleteMany: {},
            create: data.zonePrices.map(zp => ({
                zoneId: zp.zoneId,
                baseLocation: zp.baseLocation || 'AYT',
                price: parseFloat(zp.price),
                extraKmPrice: zp.extraKmPrice != null ? parseFloat(zp.extraKmPrice) : null,
            }))
        } : undefined;

        if (zonePricesOperation) {
            updateData.zonePrices = zonePricesOperation;
        }

        const vehicle = await prisma.vehicle.update({
            where: { id },
            data: updateData
        });

        res.json({ success: true, data: vehicle });
    } catch (error) {
        console.error('Update vehicle error:', error);
        res.status(500).json({ success: false, error: 'Araç güncellenemedi' });
    }
});

/**
 * PATCH /api/vehicles/:id/active
 * Toggle active status
 */
router.patch('/:id/active', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { isActive } = req.body;

        await prisma.vehicle.update({
            where: { id },
            data: { status: isActive ? 'ACTIVE' : 'INACTIVE' }
        });

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Durum güncellenemedi' });
    }
});

/**
 * PATCH /api/vehicles/:id/driver
 * Assign or unassign a driver to a vehicle
 */
router.patch('/:id/driver', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { driverId } = req.body; // null to unassign

        const existing = await prisma.vehicle.findUnique({ where: { id } });
        if (!existing) {
            return res.status(404).json({ success: false, error: 'Araç bulunamadı' });
        }

        const updatedMetadata = {
            ...(existing.metadata || {}),
            driverId: driverId || null
        };

        await prisma.vehicle.update({
            where: { id },
            data: { metadata: updatedMetadata }
        });

        res.json({ success: true });
    } catch (error) {
        console.error('Assign driver error:', error);
        res.status(500).json({ success: false, error: 'Şöför atanamadı' });
    }
});

module.exports = router;
