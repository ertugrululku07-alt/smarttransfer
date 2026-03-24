const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

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
                }
            },
            select: {
                id: true,
                firstName: true,
                lastName: true,
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

module.exports = router;
