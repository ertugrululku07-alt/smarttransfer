const express = require('express');
const { PrismaClient, Prisma } = require('@prisma/client');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();
const prisma = require('../lib/prisma');

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
            entityId,
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
        if (entityId) where.entityId = entityId;
        
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

/**
 * GET /api/admin/logs/booking/:bookingId
 * Fetches all activity logs related to a specific booking
 */
router.get('/booking/:bookingId', authMiddleware, async (req, res) => {
    try {
        const tenantId = req.user?.tenantId || req.tenant?.id;
        if (req.user?.roleType !== 'SUPER_ADMIN' && req.user?.roleType !== 'TENANT_ADMIN') {
            return res.status(403).json({ success: false, error: 'Bu işlem için yetkiniz yok.' });
        }

        const { bookingId } = req.params;

        // Find logs where entityId matches the booking ID
        const logs = await prisma.activityLog.findMany({
            where: {
                tenantId,
                entityId: bookingId
            },
            orderBy: { createdAt: 'asc' }
        });

        // Also get the booking itself for context
        let booking = null;
        try {
            booking = await prisma.booking.findUnique({
                where: { id: bookingId },
                select: {
                    id: true,
                    bookingNumber: true,
                    status: true,
                    operationalStatus: true,
                    contactName: true,
                    contactPhone: true,
                    createdAt: true,
                    updatedAt: true,
                    startDate: true,
                    driverId: true,
                    metadata: true,
                    total: true,
                    currency: true,
                    agencyId: true,
                }
            });
        } catch {}

        // Enrich logs with user names
        const userIds = [...new Set(logs.filter(l => l.userId).map(l => l.userId))];
        let userMap = {};
        if (userIds.length > 0) {
            try {
                const users = await prisma.user.findMany({
                    where: { id: { in: userIds } },
                    select: { id: true, fullName: true, email: true, roleType: true }
                });
                userMap = Object.fromEntries(users.map(u => [u.id, u]));
            } catch {}
        }

        const enrichedLogs = logs.map(log => ({
            ...log,
            userName: userMap[log.userId]?.fullName || log.userEmail || 'Sistem',
            userRole: userMap[log.userId]?.roleType || null,
        }));

        res.json({
            success: true,
            data: {
                booking,
                logs: enrichedLogs
            }
        });

    } catch (error) {
        console.error('Fetch booking logs error:', error);
        res.status(500).json({ success: false, error: 'Log geçmişi alınamadı' });
    }
});

module.exports = router;
