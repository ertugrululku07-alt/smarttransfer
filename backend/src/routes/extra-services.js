const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { authMiddleware, optionalAuthMiddleware } = require('../middleware/auth');

/**
 * GET /api/extra-services
 * Get all extra services ordered by 'order'
 */
router.get('/', optionalAuthMiddleware, async (req, res) => {
    try {
        const tenantId = req.tenant?.id;

        const services = await prisma.extraService.findMany({
            where: { tenantId },
            orderBy: { order: 'asc' }
        });

        res.json({ success: true, data: services });
    } catch (error) {
        console.error('Get extra services error:', error);
        res.status(500).json({ success: false, error: 'Ekstra hizmetler alınamadı' });
    }
});

/**
 * POST /api/extra-services
 * Create a new extra service
 */
router.post('/', authMiddleware, async (req, res) => {
    try {
        const tenantId = req.tenant?.id;
        const { name, price, currency, isPerPerson, image, excludeFromShuttle } = req.body;

        if (!name) {
            return res.status(400).json({ success: false, error: 'Hizmet adı zorunludur' });
        }

        // Get max order to append to end
        const maxOrder = await prisma.extraService.aggregate({
            where: { tenantId },
            _max: { order: true }
        });
        const nextOrder = (maxOrder._max.order || 0) + 1;

        const service = await prisma.extraService.create({
            data: {
                tenantId,
                name,
                price: parseFloat(price) || 0,
                currency: currency || 'EUR',
                isPerPerson: isPerPerson || false,
                excludeFromShuttle: excludeFromShuttle !== undefined ? excludeFromShuttle : true,
                image,
                order: nextOrder
            }
        });

        res.json({ success: true, data: service });
    } catch (error) {
        console.error('Create extra service error:', error);
        res.status(500).json({ success: false, error: 'Ekstra hizmet oluşturulamadı' });
    }
});

/**
 * PUT /api/extra-services/reorder
 * Reorder extra services
 */
router.put('/reorder', authMiddleware, async (req, res) => {
    try {
        const { items } = req.body; // Array of { id, order }

        if (!Array.isArray(items)) {
            return res.status(400).json({ success: false, error: 'items array gereklidir' });
        }

        // Execute as transaction
        await prisma.$transaction(
            items.map(item =>
                prisma.extraService.update({
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
 * PUT /api/extra-services/:id
 * Update an extra service
 */
router.put('/:id', authMiddleware, async (req, res) => {
    try {
        const tenantId = req.tenant?.id;
        const { id } = req.params;
        const { name, price, currency, isPerPerson, image, excludeFromShuttle } = req.body;

        if (!name) {
            return res.status(400).json({ success: false, error: 'Hizmet adı zorunludur' });
        }

        const service = await prisma.extraService.update({
            where: { id },
            data: {
                name,
                price: parseFloat(price) || 0,
                currency,
                isPerPerson,
                image,
                excludeFromShuttle: excludeFromShuttle !== undefined ? excludeFromShuttle : true
            }
        });

        res.json({ success: true, data: service });
    } catch (error) {
        console.error('Update extra service error:', error);
        res.status(500).json({ success: false, error: 'Ekstra hizmet güncellenemedi' });
    }
});

/**
 * DELETE /api/extra-services/:id
 * Delete an extra service
 */
router.delete('/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;

        await prisma.extraService.delete({
            where: { id }
        });

        res.json({ success: true, message: 'Ekstra hizmet silindi' });
    } catch (error) {
        console.error('Delete extra service error:', error);
        res.status(500).json({ success: false, error: 'Ekstra hizmet silinemedi' });
    }
});

module.exports = router;
