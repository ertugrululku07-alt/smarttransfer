const express = require('express');
const router = express.Router();

const prisma = require('../lib/prisma');
const { authMiddleware, optionalAuthMiddleware } = require('../middleware/auth');
const { getEffectiveTenantId, requireTenantId, findExtraServiceForTenant } = require('../utils/tenantScope');

router.get('/', optionalAuthMiddleware, async (req, res) => {
    try {
        const tenantId = getEffectiveTenantId(req);
        if (!tenantId) {
            return res.status(400).json({ success: false, error: 'Tenant context is required' });
        }

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

router.post('/', authMiddleware, async (req, res) => {
    try {
        const tenantId = requireTenantId(req, res);
        if (!tenantId) return;

        const { name, price, currency, isPerPerson, image, excludeFromShuttle } = req.body;

        if (!name) {
            return res.status(400).json({ success: false, error: 'Hizmet adı zorunludur' });
        }

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

router.put('/reorder', authMiddleware, async (req, res) => {
    try {
        const tenantId = requireTenantId(req, res);
        if (!tenantId) return;

        const { items } = req.body;

        if (!Array.isArray(items)) {
            return res.status(400).json({ success: false, error: 'items array gereklidir' });
        }

        const ids = items.map((item) => item.id);
        const owned = await prisma.extraService.findMany({
            where: { id: { in: ids }, tenantId },
            select: { id: true }
        });
        if (owned.length !== ids.length) {
            return res.status(403).json({ success: false, error: 'Unauthorized service reorder' });
        }

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

router.put('/:id', authMiddleware, async (req, res) => {
    try {
        const tenantId = requireTenantId(req, res);
        if (!tenantId) return;

        const { id } = req.params;
        const { name, price, currency, isPerPerson, image, excludeFromShuttle } = req.body;

        if (!name) {
            return res.status(400).json({ success: false, error: 'Hizmet adı zorunludur' });
        }

        const existing = await findExtraServiceForTenant(id, tenantId);
        if (!existing) {
            return res.status(404).json({ success: false, error: 'Ekstra hizmet bulunamadı' });
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

router.delete('/:id', authMiddleware, async (req, res) => {
    try {
        const tenantId = requireTenantId(req, res);
        if (!tenantId) return;

        const { id } = req.params;
        const existing = await findExtraServiceForTenant(id, tenantId);
        if (!existing) {
            return res.status(404).json({ success: false, error: 'Ekstra hizmet bulunamadı' });
        }

        await prisma.extraService.delete({ where: { id } });

        res.json({ success: true, message: 'Ekstra hizmet silindi' });
    } catch (error) {
        console.error('Delete extra service error:', error);
        res.status(500).json({ success: false, error: 'Ekstra hizmet silinemedi' });
    }
});

module.exports = router;
