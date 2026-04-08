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

module.exports = router;

