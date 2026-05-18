const express = require('express');
const bcrypt = require('bcryptjs');

const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
const prisma = require('../lib/prisma');

/**
 * GET /api/admin/partner-applications
 * List all users with PARTNER role (applicants)
 */
router.get('/partner-applications', authMiddleware, async (req, res) => {
    try {
        const tenantId = req.tenant?.id;
        if (!tenantId) {
            return res.status(400).json({ success: false, error: 'Tenant context missing' });
        }

        const applications = await prisma.user.findMany({
            where: {
                tenantId,
                role: {
                    type: 'PARTNER'
                },
                deletedAt: null
            },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                fullName: true,
                email: true,
                phone: true,
                status: true,
                createdAt: true,
                vehicles: {
                    select: {
                        plateNumber: true,
                        brand: true,
                        model: true,
                        year: true,
                        vehicleType: {
                            select: {
                                name: true,
                                category: true
                            }
                        }
                    }
                }
            },
            orderBy: {
                createdAt: 'desc'
            }
        });

        res.json({
            success: true,
            data: applications
        });

    } catch (error) {
        console.error('Fetch partner applications error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch partner applications'
        });
    }
});

/**
 * POST /api/admin/partner-applications
 * Manually create a new partner driver
 */
router.post('/partner-applications', authMiddleware, async (req, res) => {
    try {
        const tenantId = req.tenant?.id;
        if (!tenantId) {
            return res.status(400).json({ success: false, error: 'Tenant context missing' });
        }

        const { firstName, lastName, email, phone, password } = req.body;

        if (!firstName || !lastName || !email || !password) {
            return res.status(400).json({ success: false, error: 'Ad, soyad, e-posta ve şifre zorunludur' });
        }

        // Check for duplicate email
        const existing = await prisma.user.findFirst({
            where: { tenantId, email: email.toLowerCase(), deletedAt: null }
        });
        if (existing) {
            return res.status(409).json({ success: false, error: 'Bu e-posta adresi zaten kayıtlı' });
        }

        // PARTNER rolünü bul veya yoksa oluştur (upsert)
        const partnerRole = await prisma.role.upsert({
            where: {
                tenantId_code: { tenantId, code: 'PARTNER' }
            },
            update: {},
            create: {
                tenantId,
                name: 'Partner Sürücü',
                code: 'PARTNER',
                type: 'PARTNER',
                description: 'Harici partner sürücü',
                isActive: true,
                isSystem: false
            }
        });

        const passwordHash = await bcrypt.hash(password, 10);
        const fullName = `${firstName} ${lastName}`.trim();

        const user = await prisma.user.create({
            data: {
                tenantId,
                email: email.toLowerCase(),
                passwordHash,
                firstName,
                lastName,
                fullName,
                phone: phone || null,
                roleId: partnerRole.id,
                status: 'INACTIVE'
            },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                fullName: true,
                email: true,
                phone: true,
                status: true,
                createdAt: true,
                vehicles: true
            }
        });

        res.status(201).json({ success: true, data: user });

    } catch (error) {
        console.error('Create partner error:', error);
        res.status(500).json({ success: false, error: 'Partner sürücü oluşturulamadı: ' + error.message });
    }
});

/**
 * PATCH /api/admin/partner-applications/:id/approve
 * Approve a partner driver application
 */
router.patch('/partner-applications/:id/approve', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const user = await prisma.user.update({
            where: { id },
            data: { status: 'ACTIVE' },
            select: { id: true, status: true, fullName: true }
        });
        res.json({ success: true, data: user });
    } catch (error) {
        console.error('Approve partner error:', error);
        res.status(500).json({ success: false, error: 'Onaylama işlemi başarısız' });
    }
});

/**
 * PATCH /api/admin/partner-applications/:id/reject
 * Reject a partner driver application
 */
router.patch('/partner-applications/:id/reject', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const user = await prisma.user.update({
            where: { id },
            data: { status: 'SUSPENDED' },
            select: { id: true, status: true, fullName: true }
        });
        res.json({ success: true, data: user });
    } catch (error) {
        console.error('Reject partner error:', error);
        res.status(500).json({ success: false, error: 'Reddetme işlemi başarısız' });
    }
});

/**
 * DELETE /api/admin/partner-applications/:id
 * Soft-delete a partner driver
 */
router.delete('/partner-applications/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.user.update({
            where: { id },
            data: { deletedAt: new Date(), status: 'DELETED' }
        });
        res.json({ success: true });
    } catch (error) {
        console.error('Delete partner error:', error);
        res.status(500).json({ success: false, error: 'Silme işlemi başarısız' });
    }
});

// ============================================================================
// PARTNER MANAGEMENT — Admin endpoints for partner profile, allowed zones,
// commission overrides, and partner zone price oversight.
// ============================================================================

/**
 * GET /api/admin/partners/:partnerId/profile
 * Returns partner profile (creates one on first read if missing).
 */
router.get('/partners/:partnerId/profile', authMiddleware, async (req, res) => {
    try {
        const tenantId = req.tenant?.id;
        const { partnerId } = req.params;

        const partner = await prisma.user.findFirst({
            where: { id: partnerId, tenantId, role: { type: 'PARTNER' } },
            select: { id: true, firstName: true, lastName: true, fullName: true, email: true, phone: true, status: true }
        });
        if (!partner) return res.status(404).json({ success: false, error: 'Partner bulunamadı' });

        let profile = await prisma.partnerProfile.findUnique({ where: { userId: partnerId } });
        if (!profile) {
            profile = await prisma.partnerProfile.create({
                data: { tenantId, userId: partnerId }
            });
        }

        // Never expose encrypted password back
        const { uetdsUnetPasswordEnc, ...safe } = profile;
        res.json({ success: true, data: { partner, profile: { ...safe, uetdsHasPassword: !!uetdsUnetPasswordEnc } } });
    } catch (error) {
        console.error('Get partner profile error:', error);
        res.status(500).json({ success: false, error: 'Profil alınamadı' });
    }
});

/**
 * PUT /api/admin/partners/:partnerId/profile
 * Admin updates partner profile (commission rate, company info, UETDS toggle).
 */
router.put('/partners/:partnerId/profile', authMiddleware, async (req, res) => {
    try {
        const tenantId = req.tenant?.id;
        const { partnerId } = req.params;
        const {
            companyName, taxNumber, taxOffice, address, contactEmail, contactPhone,
            commissionRate, uetdsEnabled, uetdsYetkiBelgeNo, uetdsYetkiBelgeTuru, uetdsServiceUrl
        } = req.body;

        const partner = await prisma.user.findFirst({
            where: { id: partnerId, tenantId, role: { type: 'PARTNER' } },
            select: { id: true }
        });
        if (!partner) return res.status(404).json({ success: false, error: 'Partner bulunamadı' });

        const profile = await prisma.partnerProfile.upsert({
            where: { userId: partnerId },
            update: {
                companyName: companyName ?? undefined,
                taxNumber: taxNumber ?? undefined,
                taxOffice: taxOffice ?? undefined,
                address: address ?? undefined,
                contactEmail: contactEmail ?? undefined,
                contactPhone: contactPhone ?? undefined,
                commissionRate: commissionRate != null ? Number(commissionRate) : undefined,
                uetdsEnabled: uetdsEnabled ?? undefined,
                uetdsYetkiBelgeNo: uetdsYetkiBelgeNo ?? undefined,
                uetdsYetkiBelgeTuru: uetdsYetkiBelgeTuru ?? undefined,
                uetdsServiceUrl: uetdsServiceUrl ?? undefined
            },
            create: {
                tenantId,
                userId: partnerId,
                companyName, taxNumber, taxOffice, address, contactEmail, contactPhone,
                commissionRate: commissionRate != null ? Number(commissionRate) : null,
                uetdsEnabled: !!uetdsEnabled,
                uetdsYetkiBelgeNo, uetdsYetkiBelgeTuru, uetdsServiceUrl
            }
        });

        const { uetdsUnetPasswordEnc, ...safe } = profile;
        res.json({ success: true, data: { ...safe, uetdsHasPassword: !!uetdsUnetPasswordEnc } });
    } catch (error) {
        console.error('Update partner profile error:', error);
        res.status(500).json({ success: false, error: 'Profil güncellenemedi' });
    }
});

/**
 * GET /api/admin/partners/:partnerId/allowed-zones
 * Returns the list of zones the partner is allowed to operate in.
 */
router.get('/partners/:partnerId/allowed-zones', authMiddleware, async (req, res) => {
    try {
        const tenantId = req.tenant?.id;
        const { partnerId } = req.params;

        const allowed = await prisma.partnerAllowedZone.findMany({
            where: { tenantId, partnerId },
            include: { zone: { select: { id: true, name: true, code: true, isAirport: true, color: true } } },
            orderBy: { createdAt: 'desc' }
        });

        res.json({ success: true, data: allowed });
    } catch (error) {
        console.error('Get partner allowed zones error:', error);
        res.status(500).json({ success: false, error: 'Bölgeler alınamadı' });
    }
});

/**
 * POST /api/admin/partners/:partnerId/allowed-zones
 * Body: { zoneId, baseLocation?, maxPriceCap?, notes? }
 * Assigns a zone to the partner. Upserts on (partnerId, zoneId, baseLocation).
 */
router.post('/partners/:partnerId/allowed-zones', authMiddleware, async (req, res) => {
    try {
        const tenantId = req.tenant?.id;
        const { partnerId } = req.params;
        const { zoneId, baseLocation, maxPriceCap, notes, isActive } = req.body;

        if (!zoneId) return res.status(400).json({ success: false, error: 'zoneId zorunludur' });

        // Verify zone & partner belong to tenant
        const [zone, partner] = await Promise.all([
            prisma.zone.findFirst({ where: { id: zoneId, tenantId }, select: { id: true } }),
            prisma.user.findFirst({ where: { id: partnerId, tenantId, role: { type: 'PARTNER' } }, select: { id: true } })
        ]);
        if (!zone) return res.status(404).json({ success: false, error: 'Bölge bulunamadı' });
        if (!partner) return res.status(404).json({ success: false, error: 'Partner bulunamadı' });

        const record = await prisma.partnerAllowedZone.upsert({
            where: {
                partnerId_zoneId_baseLocation: {
                    partnerId,
                    zoneId,
                    baseLocation: baseLocation || 'AYT'
                }
            },
            update: {
                maxPriceCap: maxPriceCap != null ? Number(maxPriceCap) : null,
                notes: notes ?? undefined,
                isActive: isActive ?? undefined
            },
            create: {
                tenantId,
                partnerId,
                zoneId,
                baseLocation: baseLocation || 'AYT',
                maxPriceCap: maxPriceCap != null ? Number(maxPriceCap) : null,
                notes: notes || null,
                isActive: isActive !== false
            },
            include: { zone: { select: { id: true, name: true, code: true, isAirport: true, color: true } } }
        });

        res.json({ success: true, data: record });
    } catch (error) {
        console.error('Assign partner allowed zone error:', error);
        res.status(500).json({ success: false, error: 'Bölge atanamadı' });
    }
});

/**
 * DELETE /api/admin/partners/:partnerId/allowed-zones/:id
 */
router.delete('/partners/:partnerId/allowed-zones/:id', authMiddleware, async (req, res) => {
    try {
        const tenantId = req.tenant?.id;
        const { partnerId, id } = req.params;
        const existing = await prisma.partnerAllowedZone.findFirst({
            where: { id, tenantId, partnerId }
        });
        if (!existing) return res.status(404).json({ success: false, error: 'Kayıt bulunamadı' });
        await prisma.partnerAllowedZone.delete({ where: { id } });
        res.json({ success: true });
    } catch (error) {
        console.error('Delete partner allowed zone error:', error);
        res.status(500).json({ success: false, error: 'Bölge kaldırılamadı' });
    }
});

/**
 * GET /api/admin/partners/:partnerId/zone-prices
 * Read-only view of the prices the partner has set in their allowed zones.
 */
router.get('/partners/:partnerId/zone-prices', authMiddleware, async (req, res) => {
    try {
        const tenantId = req.tenant?.id;
        const { partnerId } = req.params;
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
        console.error('Get partner zone prices (admin) error:', error);
        res.status(500).json({ success: false, error: 'Fiyatlar alınamadı' });
    }
});

module.exports = router;

