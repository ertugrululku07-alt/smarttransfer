const express = require('express');
const { PrismaClient, Prisma } = require('@prisma/client');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();
const prisma = new PrismaClient();

/**
 * GET /api/admin/logs
 * Fetches activity logs with pagination and filtering
 */
router.get('/', authMiddleware, async (req, res) => {
    try {
        const tenantId = req.user?.tenantId || req.tenant?.id;
        
        // Ensure user has admin rights (Optional, based on your role logic)
        if (req.user?.roleType !== 'SUPER_ADMIN' && req.user?.roleType !== 'TENANT_ADMIN') {
            return res.status(403).json({ success: false, error: 'Bu işlem için yetkiniz yok.' });
        }

        const {
            page = 1,
            limit = 50,
            userId,
            action,
            entityType,
            startDate,
            endDate,
            search
        } = req.query;

        const skip = (Number(page) - 1) * Number(limit);
        const take = Number(limit);

        const where = { tenantId };

        if (userId) where.userId = userId;
        if (action) where.action = action;
        if (entityType) where.entityType = entityType;
        
        if (startDate || endDate) {
            where.createdAt = {};
            if (startDate) where.createdAt.gte = new Date(startDate);
            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                where.createdAt.lte = end;
            }
        }

        if (search) {
            // Search inside JSON or userEmail
            where.OR = [
                { userEmail: { contains: search, mode: 'insensitive' } },
                { action: { contains: search, mode: 'insensitive' } },
                {
                    details: {
                        path: ['message'],
                        string_contains: search
                    }
                }
            ];
        }

        const [logs, total] = await Promise.all([
            prisma.activityLog.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip,
                take
            }),
            prisma.activityLog.count({ where })
        ]);

        res.json({
            success: true,
            data: logs,
            pagination: {
                total,
                page: Number(page),
                limit: take,
                pages: Math.ceil(total / take)
            }
        });

    } catch (error) {
        console.error('Fetch logs error:', error);
        res.status(500).json({ success: false, error: 'İşlem geçmişi alınamadı' });
    }
});

module.exports = router;
