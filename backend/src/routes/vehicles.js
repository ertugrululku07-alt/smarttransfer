const express = require('express');

const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
const prisma = require('../lib/prisma');

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
            include: { vehicleType: true },
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
            // Documents & UETDS
            chassisNumber: v.metadata?.chassisNumber || null,
            engineNumber: v.metadata?.engineNumber || null,
            registrationCertNo: v.metadata?.registrationCertNo || null,
            registrationDate: v.metadata?.registrationDate || null,
            seatCount: v.metadata?.seatCount || null,
            // Inspection
            inspectionDate: v.metadata?.inspectionDate || null,
            inspectionPeriod: v.metadata?.inspectionPeriod || null,
            inspectionExpiryDate: v.metadata?.inspectionExpiryDate || null,
            // Insurance
            insuranceStartDate: v.metadata?.insuranceStartDate || null,
            insuranceExpiryDate: v.metadata?.insuranceExpiryDate || null,
            insuranceCompany: v.metadata?.insuranceCompany || null,
            insurancePolicyNo: v.metadata?.insurancePolicyNo || null,
            // Kasko
            kaskoStartDate: v.metadata?.kaskoStartDate || null,
            kaskoExpiryDate: v.metadata?.kaskoExpiryDate || null,
            kaskoCompany: v.metadata?.kaskoCompany || null,
            kaskoPolicyNo: v.metadata?.kaskoPolicyNo || null,
            // Ownership
            ownershipType: v.metadata?.ownershipType || 'OWNED',
            rentalPeriod: v.metadata?.rentalPeriod || null,
            rentalCost: v.metadata?.rentalCost || null,
            ownerName: v.metadata?.ownerName || null,
            ownerPhone: v.metadata?.ownerPhone || null,
            ownerTaxNumber: v.metadata?.ownerTaxNumber || null,
            ownerTaxOffice: v.metadata?.ownerTaxOffice || null,
            ownerAddress: v.metadata?.ownerAddress || null,
            ownerEmail: v.metadata?.ownerEmail || null,
            ownerAccountId: v.metadata?.ownerAccountId || null,
        }));

        console.log('[GET vehicles] driverIds:', formattedVehicles.map(v => ({ plate: v.plateNumber, driverId: v.driverId })));
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

        const ownershipType = data.ownershipType || 'OWNED';
        const vehicle = await prisma.vehicle.create({
            data: {
                tenantId,
                plateNumber: data.plateNumber,
                brand: data.brand || 'Unknown',
                model: data.model || 'Unknown',
                year: data.year || new Date().getFullYear(),
                color: data.color || 'White',
                status: data.isActive !== false ? 'ACTIVE' : 'INACTIVE',
                isOwned: ownershipType !== 'RENTED',
                vehicleTypeId: vehicleTypeId,
                metadata: {
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
                    seatCount: data.seatCount,
                    // UETDS / Documents
                    chassisNumber: data.chassisNumber,
                    engineNumber: data.engineNumber,
                    registrationCertNo: data.registrationCertNo,
                    registrationDate: data.registrationDate,
                    // Inspection
                    inspectionDate: data.inspectionDate,
                    inspectionPeriod: data.inspectionPeriod,
                    inspectionExpiryDate: data.inspectionExpiryDate,
                    // Insurance
                    insuranceStartDate: data.insuranceStartDate,
                    insuranceExpiryDate: data.insuranceExpiryDate,
                    insuranceCompany: data.insuranceCompany,
                    insurancePolicyNo: data.insurancePolicyNo,
                    // Kasko
                    kaskoStartDate: data.kaskoStartDate,
                    kaskoExpiryDate: data.kaskoExpiryDate,
                    kaskoCompany: data.kaskoCompany,
                    kaskoPolicyNo: data.kaskoPolicyNo,
                    // Ownership
                    ownershipType: ownershipType,
                    rentalPeriod: data.rentalPeriod,
                    rentalCost: data.rentalCost,
                    ownerName: data.ownerName,
                    ownerPhone: data.ownerPhone,
                    ownerTaxNumber: data.ownerTaxNumber,
                    ownerTaxOffice: data.ownerTaxOffice,
                    ownerAddress: data.ownerAddress,
                    ownerEmail: data.ownerEmail,
                }
            }
        });

        // Auto-sync insurance/kasko/inspection to tracking arrays
        try {
            const currentMeta = vehicle.metadata || {};
            const tracking = currentMeta.tracking || { insurance: [], fuel: [], inspection: [], maintenance: [], totalKm: 0 };
            let trackingChanged = false;

            // Sync Trafik Sigortası
            if (data.insuranceCompany || data.insuranceStartDate) {
                tracking.insurance.push({
                    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
                    company: data.insuranceCompany || '',
                    policyNo: data.insurancePolicyNo || '',
                    type: 'TRAFIK',
                    startDate: data.insuranceStartDate || null,
                    endDate: data.insuranceExpiryDate || null,
                    cost: 0,
                    notes: 'Araç kaydı sırasında otomatik oluşturuldu',
                    createdAt: new Date().toISOString(),
                });
                trackingChanged = true;
            }

            // Sync Kasko
            if (data.kaskoCompany || data.kaskoStartDate) {
                tracking.insurance.push({
                    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7) + 'k',
                    company: data.kaskoCompany || '',
                    policyNo: data.kaskoPolicyNo || '',
                    type: 'KASKO',
                    startDate: data.kaskoStartDate || null,
                    endDate: data.kaskoExpiryDate || null,
                    cost: 0,
                    notes: 'Araç kaydı sırasında otomatik oluşturuldu',
                    createdAt: new Date().toISOString(),
                });
                trackingChanged = true;
            }

            // Sync Muayene
            if (data.inspectionDate) {
                tracking.inspection.push({
                    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7) + 'i',
                    date: data.inspectionDate || null,
                    nextDate: data.inspectionExpiryDate || null,
                    station: '',
                    result: 'GECTI',
                    cost: 0,
                    notes: 'Araç kaydı sırasında otomatik oluşturuldu',
                    createdAt: new Date().toISOString(),
                });
                trackingChanged = true;
            }

            if (trackingChanged) {
                await prisma.vehicle.update({
                    where: { id: vehicle.id },
                    data: { metadata: { ...currentMeta, tracking } }
                });
            }
        } catch (trackErr) {
            console.error('Auto-sync tracking error:', trackErr);
        }

        // Auto-create Cari (Account) for rented vehicles
        if (ownershipType === 'RENTED' && data.ownerName) {
            try {
                let account = await prisma.account.findFirst({
                    where: { tenantId, name: data.ownerName, type: 'SUPPLIER' }
                });
                if (!account) {
                    const code = `SUP-${Date.now().toString(36).toUpperCase()}`;
                    account = await prisma.account.create({
                        data: {
                            tenantId,
                            code,
                            name: data.ownerName,
                            type: 'SUPPLIER',
                            phone: data.ownerPhone || null,
                            email: data.ownerEmail || null,
                            address: data.ownerAddress || null,
                            taxNumber: data.ownerTaxNumber || null,
                            taxOffice: data.ownerTaxOffice || null,
                        }
                    });
                }
                // Link account to vehicle and set initial credit based on rental
                const rentalCost = parseFloat(data.rentalCost) || 0;
                await prisma.vehicle.update({
                    where: { id: vehicle.id },
                    data: {
                        metadata: { ...(vehicle.metadata || {}), ownerAccountId: account.id }
                    }
                });
                // Update account credit (owner becomes creditor)
                if (rentalCost > 0) {
                    await prisma.account.update({
                        where: { id: account.id },
                        data: { credit: { increment: rentalCost }, balance: { decrement: rentalCost } }
                    });
                }
            } catch (accountErr) {
                console.error('Auto-create Cari error:', accountErr);
            }
        }

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

        const ownershipType = data.ownershipType ?? existingMeta.ownershipType ?? 'OWNED';
        const updateData = {
            plateNumber: data.plateNumber,
            brand: data.brand,
            model: data.model,
            year: data.year,
            color: data.color,
            status: data.isActive !== false ? 'ACTIVE' : 'INACTIVE',
            isOwned: ownershipType !== 'RENTED',
            metadata: {
                ...existingMeta,
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
                seatCount: data.seatCount ?? existingMeta.seatCount,
                // UETDS / Documents
                chassisNumber: data.chassisNumber ?? existingMeta.chassisNumber,
                engineNumber: data.engineNumber ?? existingMeta.engineNumber,
                registrationCertNo: data.registrationCertNo ?? existingMeta.registrationCertNo,
                registrationDate: data.registrationDate ?? existingMeta.registrationDate,
                // Inspection
                inspectionDate: data.inspectionDate ?? existingMeta.inspectionDate,
                inspectionPeriod: data.inspectionPeriod ?? existingMeta.inspectionPeriod,
                inspectionExpiryDate: data.inspectionExpiryDate ?? existingMeta.inspectionExpiryDate,
                // Insurance
                insuranceStartDate: data.insuranceStartDate ?? existingMeta.insuranceStartDate,
                insuranceExpiryDate: data.insuranceExpiryDate ?? existingMeta.insuranceExpiryDate,
                insuranceCompany: data.insuranceCompany ?? existingMeta.insuranceCompany,
                insurancePolicyNo: data.insurancePolicyNo ?? existingMeta.insurancePolicyNo,
                // Kasko
                kaskoStartDate: data.kaskoStartDate ?? existingMeta.kaskoStartDate,
                kaskoExpiryDate: data.kaskoExpiryDate ?? existingMeta.kaskoExpiryDate,
                kaskoCompany: data.kaskoCompany ?? existingMeta.kaskoCompany,
                kaskoPolicyNo: data.kaskoPolicyNo ?? existingMeta.kaskoPolicyNo,
                // Ownership
                ownershipType: ownershipType,
                rentalPeriod: data.rentalPeriod ?? existingMeta.rentalPeriod,
                rentalCost: data.rentalCost ?? existingMeta.rentalCost,
                ownerName: data.ownerName ?? existingMeta.ownerName,
                ownerPhone: data.ownerPhone ?? existingMeta.ownerPhone,
                ownerTaxNumber: data.ownerTaxNumber ?? existingMeta.ownerTaxNumber,
                ownerTaxOffice: data.ownerTaxOffice ?? existingMeta.ownerTaxOffice,
                ownerAddress: data.ownerAddress ?? existingMeta.ownerAddress,
                ownerEmail: data.ownerEmail ?? existingMeta.ownerEmail,
                ownerAccountId: existingMeta.ownerAccountId ?? null,
            }
        };

        if (data.vehicleTypeId) {
            updateData.vehicleTypeId = data.vehicleTypeId;
        }

        const vehicle = await prisma.vehicle.update({
            where: { id },
            data: updateData
        });

        // Auto-sync insurance/kasko/inspection to tracking arrays on update
        try {
            const updatedMeta = vehicle.metadata || {};
            const tracking = updatedMeta.tracking || { insurance: [], fuel: [], inspection: [], maintenance: [], totalKm: 0 };
            let trackingChanged = false;

            // Only add if data changed (check if already in tracking by company+policyNo)
            if (data.insuranceCompany || data.insuranceStartDate) {
                const exists = tracking.insurance.some(i => i.type === 'TRAFIK' && i.company === data.insuranceCompany && i.policyNo === data.insurancePolicyNo);
                if (!exists) {
                    tracking.insurance.push({
                        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
                        company: data.insuranceCompany || '',
                        policyNo: data.insurancePolicyNo || '',
                        type: 'TRAFIK',
                        startDate: data.insuranceStartDate || null,
                        endDate: data.insuranceExpiryDate || null,
                        cost: 0,
                        notes: 'Araç güncelleme sırasında otomatik oluşturuldu',
                        createdAt: new Date().toISOString(),
                    });
                    trackingChanged = true;
                }
            }

            if (data.kaskoCompany || data.kaskoStartDate) {
                const exists = tracking.insurance.some(i => i.type === 'KASKO' && i.company === data.kaskoCompany && i.policyNo === data.kaskoPolicyNo);
                if (!exists) {
                    tracking.insurance.push({
                        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7) + 'k',
                        company: data.kaskoCompany || '',
                        policyNo: data.kaskoPolicyNo || '',
                        type: 'KASKO',
                        startDate: data.kaskoStartDate || null,
                        endDate: data.kaskoExpiryDate || null,
                        cost: 0,
                        notes: 'Araç güncelleme sırasında otomatik oluşturuldu',
                        createdAt: new Date().toISOString(),
                    });
                    trackingChanged = true;
                }
            }

            if (data.inspectionDate) {
                const exists = tracking.inspection.some(i => i.date === data.inspectionDate && i.nextDate === data.inspectionExpiryDate);
                if (!exists) {
                    tracking.inspection.push({
                        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7) + 'i',
                        date: data.inspectionDate || null,
                        nextDate: data.inspectionExpiryDate || null,
                        station: '',
                        result: 'GECTI',
                        cost: 0,
                        notes: 'Araç güncelleme sırasında otomatik oluşturuldu',
                        createdAt: new Date().toISOString(),
                    });
                    trackingChanged = true;
                }
            }

            if (trackingChanged) {
                await prisma.vehicle.update({
                    where: { id },
                    data: { metadata: { ...updatedMeta, tracking } }
                });
            }
        } catch (trackErr) {
            console.error('Auto-sync tracking on update error:', trackErr);
        }

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
