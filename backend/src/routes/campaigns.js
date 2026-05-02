// src/routes/campaigns.js
// Campaign & Coupon management + Loyalty program

const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const { authMiddleware } = require('../middleware/auth');

// ────────────────────────────────────────────────────────────────
// HELPER: check admin/operator role
// ────────────────────────────────────────────────────────────────
const ensureAdmin = (req, res, next) => {
    const roleType = req.user?.role?.type;
    if (!['SUPER_ADMIN', 'TENANT_ADMIN', 'TENANT_STAFF'].includes(roleType)) {
        return res.status(403).json({ success: false, error: 'Yetkisiz erişim' });
    }
    next();
};

const ensureCustomer = (req, res, next) => {
    const roleType = req.user?.role?.type;
    if (roleType !== 'CUSTOMER') {
        return res.status(403).json({ success: false, error: 'Müşteri erişimi gerekli' });
    }
    next();
};

// ════════════════════════════════════════════════════════════════
// ADMIN: CAMPAIGN CRUD
// ════════════════════════════════════════════════════════════════

// GET /api/campaigns/admin - List all campaigns
router.get('/admin', authMiddleware, ensureAdmin, async (req, res) => {
    try {
        const tenantId = req.user.tenantId;
        const { page = 1, pageSize = 50, status, search } = req.query;
        const skip = (Number(page) - 1) * Number(pageSize);

        const where = { tenantId };
        if (status === 'active') where.isActive = true;
        if (status === 'inactive') where.isActive = false;
        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { code: { contains: search, mode: 'insensitive' } },
            ];
        }

        const [items, total] = await Promise.all([
            prisma.campaign.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip, take: Number(pageSize),
                include: { _count: { select: { usages: true } } }
            }),
            prisma.campaign.count({ where }),
        ]);

        res.json({ success: true, data: { items, total, page: Number(page), pageSize: Number(pageSize) } });
    } catch (e) {
        console.error('[Campaigns] list error:', e);
        res.status(500).json({ success: false, error: 'Kampanyalar alınamadı' });
    }
});

// GET /api/campaigns/admin/:id - Single campaign detail + usage stats
router.get('/admin/:id', authMiddleware, ensureAdmin, async (req, res) => {
    try {
        const campaign = await prisma.campaign.findFirst({
            where: { id: req.params.id, tenantId: req.user.tenantId },
            include: {
                usages: {
                    orderBy: { createdAt: 'desc' },
                    take: 50,
                    include: {
                        user: { select: { id: true, fullName: true, email: true } },
                        booking: { select: { id: true, bookingNumber: true, total: true } },
                    }
                },
                _count: { select: { usages: true } },
            }
        });
        if (!campaign) return res.status(404).json({ success: false, error: 'Kampanya bulunamadı' });

        // Revenue impact
        const totalDiscount = await prisma.campaignUsage.aggregate({
            where: { campaignId: campaign.id },
            _sum: { discount: true },
        });

        res.json({
            success: true,
            data: {
                ...campaign,
                totalDiscountGiven: totalDiscount._sum.discount || 0,
            }
        });
    } catch (e) {
        console.error('[Campaigns] detail error:', e);
        res.status(500).json({ success: false, error: 'Detay alınamadı' });
    }
});

// POST /api/campaigns/admin - Create campaign
router.post('/admin', authMiddleware, ensureAdmin, async (req, res) => {
    try {
        const tenantId = req.user.tenantId;
        const {
            name, description, code,
            discountType, discountValue, maxDiscount, minOrderAmount,
            startDate, endDate,
            usageLimit, usageLimitPerUser,
            vehicleTypes, isActive
        } = req.body;

        if (!name || !code || !discountType || discountValue == null || !startDate || !endDate) {
            return res.status(400).json({ success: false, error: 'Zorunlu alanlar eksik' });
        }

        // Check unique code
        const exists = await prisma.campaign.findUnique({ where: { tenantId_code: { tenantId, code: code.toUpperCase() } } });
        if (exists) return res.status(409).json({ success: false, error: 'Bu kupon kodu zaten mevcut' });

        const campaign = await prisma.campaign.create({
            data: {
                tenantId,
                name,
                description: description || null,
                code: code.toUpperCase(),
                discountType,
                discountValue: Number(discountValue),
                maxDiscount: maxDiscount != null ? Number(maxDiscount) : null,
                minOrderAmount: minOrderAmount != null ? Number(minOrderAmount) : null,
                startDate: new Date(startDate),
                endDate: new Date(endDate),
                usageLimit: usageLimit != null ? Number(usageLimit) : null,
                usageLimitPerUser: usageLimitPerUser != null ? Number(usageLimitPerUser) : null,
                vehicleTypes: vehicleTypes || [],
                isActive: isActive !== false,
            }
        });

        res.json({ success: true, data: campaign, message: 'Kampanya oluşturuldu' });
    } catch (e) {
        console.error('[Campaigns] create error:', e);
        res.status(500).json({ success: false, error: 'Kampanya oluşturulamadı' });
    }
});

// PUT /api/campaigns/admin/:id - Update campaign
router.put('/admin/:id', authMiddleware, ensureAdmin, async (req, res) => {
    try {
        const tenantId = req.user.tenantId;
        const { id } = req.params;
        const existing = await prisma.campaign.findFirst({ where: { id, tenantId } });
        if (!existing) return res.status(404).json({ success: false, error: 'Kampanya bulunamadı' });

        const {
            name, description, code,
            discountType, discountValue, maxDiscount, minOrderAmount,
            startDate, endDate,
            usageLimit, usageLimitPerUser,
            vehicleTypes, isActive
        } = req.body;

        // If code changed, check uniqueness
        if (code && code.toUpperCase() !== existing.code) {
            const dup = await prisma.campaign.findUnique({ where: { tenantId_code: { tenantId, code: code.toUpperCase() } } });
            if (dup) return res.status(409).json({ success: false, error: 'Bu kupon kodu zaten mevcut' });
        }

        const updated = await prisma.campaign.update({
            where: { id },
            data: {
                ...(name !== undefined && { name }),
                ...(description !== undefined && { description }),
                ...(code !== undefined && { code: code.toUpperCase() }),
                ...(discountType !== undefined && { discountType }),
                ...(discountValue !== undefined && { discountValue: Number(discountValue) }),
                ...(maxDiscount !== undefined && { maxDiscount: maxDiscount != null ? Number(maxDiscount) : null }),
                ...(minOrderAmount !== undefined && { minOrderAmount: minOrderAmount != null ? Number(minOrderAmount) : null }),
                ...(startDate !== undefined && { startDate: new Date(startDate) }),
                ...(endDate !== undefined && { endDate: new Date(endDate) }),
                ...(usageLimit !== undefined && { usageLimit: usageLimit != null ? Number(usageLimit) : null }),
                ...(usageLimitPerUser !== undefined && { usageLimitPerUser: usageLimitPerUser != null ? Number(usageLimitPerUser) : null }),
                ...(vehicleTypes !== undefined && { vehicleTypes }),
                ...(isActive !== undefined && { isActive }),
            }
        });

        res.json({ success: true, data: updated, message: 'Kampanya güncellendi' });
    } catch (e) {
        console.error('[Campaigns] update error:', e);
        res.status(500).json({ success: false, error: 'Güncelleme başarısız' });
    }
});

// DELETE /api/campaigns/admin/:id
router.delete('/admin/:id', authMiddleware, ensureAdmin, async (req, res) => {
    try {
        const existing = await prisma.campaign.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId } });
        if (!existing) return res.status(404).json({ success: false, error: 'Kampanya bulunamadı' });

        await prisma.campaign.delete({ where: { id: req.params.id } });
        res.json({ success: true, message: 'Kampanya silindi' });
    } catch (e) {
        console.error('[Campaigns] delete error:', e);
        res.status(500).json({ success: false, error: 'Silinemedi' });
    }
});

// ════════════════════════════════════════════════════════════════
// PUBLIC: VALIDATE COUPON CODE
// ════════════════════════════════════════════════════════════════

// POST /api/campaigns/validate
// Body: { code, orderAmount, vehicleType, userId? }
router.post('/validate', async (req, res) => {
    try {
        const tenantId = req.tenant?.id;
        const { code, orderAmount, vehicleType, userId } = req.body;

        if (!code) return res.status(400).json({ success: false, error: 'Kupon kodu gerekli' });

        const campaign = await prisma.campaign.findFirst({
            where: {
                code: code.toUpperCase(),
                ...(tenantId ? { tenantId } : {}),
                isActive: true,
            }
        });

        if (!campaign) {
            return res.status(404).json({ success: false, error: 'Geçersiz kupon kodu' });
        }

        const now = new Date();
        // Date check
        if (now < campaign.startDate || now > campaign.endDate) {
            return res.status(400).json({ success: false, error: 'Bu kampanya süresi dolmuş veya henüz başlamamış' });
        }

        // Usage limit check
        if (campaign.usageLimit !== null && campaign.usedCount >= campaign.usageLimit) {
            return res.status(400).json({ success: false, error: 'Bu kuponun kullanım limiti dolmuş' });
        }

        // Per-user limit check
        if (userId && campaign.usageLimitPerUser !== null) {
            const userUsages = await prisma.campaignUsage.count({
                where: { campaignId: campaign.id, userId }
            });
            if (userUsages >= campaign.usageLimitPerUser) {
                return res.status(400).json({ success: false, error: 'Bu kuponu daha fazla kullanamazsınız' });
            }
        }

        // Min order amount check
        const amount = Number(orderAmount) || 0;
        if (campaign.minOrderAmount && amount < Number(campaign.minOrderAmount)) {
            return res.status(400).json({
                success: false,
                error: `Minimum sipariş tutarı ${Number(campaign.minOrderAmount).toFixed(2)} olmalıdır`
            });
        }

        // Vehicle type filter
        if (campaign.vehicleTypes.length > 0 && vehicleType && !campaign.vehicleTypes.includes(vehicleType)) {
            return res.status(400).json({ success: false, error: 'Bu kupon seçilen araç tipi için geçerli değil' });
        }

        // Calculate discount
        let discount = 0;
        if (campaign.discountType === 'PERCENTAGE') {
            discount = amount * Number(campaign.discountValue) / 100;
            if (campaign.maxDiscount && discount > Number(campaign.maxDiscount)) {
                discount = Number(campaign.maxDiscount);
            }
        } else {
            discount = Number(campaign.discountValue);
        }

        // Don't exceed order amount
        discount = Math.min(discount, amount);
        discount = Math.round(discount * 100) / 100;

        res.json({
            success: true,
            data: {
                campaignId: campaign.id,
                code: campaign.code,
                name: campaign.name,
                discountType: campaign.discountType,
                discountValue: Number(campaign.discountValue),
                discount, // Actual calculated discount
                newTotal: Math.round((amount - discount) * 100) / 100,
            }
        });
    } catch (e) {
        console.error('[Campaigns] validate error:', e);
        res.status(500).json({ success: false, error: 'Kupon doğrulanamadı' });
    }
});

// ════════════════════════════════════════════════════════════════
// ADMIN: LOYALTY PROGRAM SETTINGS
// ════════════════════════════════════════════════════════════════

const DEFAULT_LOYALTY = {
    enabled: false,
    pointsPerUnit: 10, // 10 points per 1 currency unit spent
    redeemRate: 100, // 100 points = 1 currency unit discount
    maxRedeemPercent: 50, // Max 50% of order can be paid with points
    tiers: [
        { name: 'Bronz',  minPoints: 0,    discountPercent: 0,  color: '#CD7F32', icon: '🥉' },
        { name: 'Gümüş',  minPoints: 500,  discountPercent: 3,  color: '#C0C0C0', icon: '🥈' },
        { name: 'Altın',  minPoints: 2000, discountPercent: 5,  color: '#FFD700', icon: '🥇' },
        { name: 'Platin', minPoints: 5000, discountPercent: 10, color: '#E5E4E2', icon: '💎' },
    ],
};

// GET /api/campaigns/loyalty/settings
router.get('/loyalty/settings', authMiddleware, ensureAdmin, async (req, res) => {
    try {
        const tenant = await prisma.tenant.findUnique({
            where: { id: req.user.tenantId },
            select: { settings: true }
        });
        const loyalty = tenant?.settings?.loyalty || DEFAULT_LOYALTY;
        res.json({ success: true, data: loyalty });
    } catch (e) {
        console.error('[Loyalty] settings get error:', e);
        res.status(500).json({ success: false, error: 'Ayarlar alınamadı' });
    }
});

// PUT /api/campaigns/loyalty/settings
router.put('/loyalty/settings', authMiddleware, ensureAdmin, async (req, res) => {
    try {
        const tenantId = req.user.tenantId;
        const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } });
        const currentSettings = tenant?.settings || {};

        const loyalty = { ...DEFAULT_LOYALTY, ...currentSettings.loyalty, ...req.body };

        await prisma.tenant.update({
            where: { id: tenantId },
            data: { settings: { ...currentSettings, loyalty } }
        });

        res.json({ success: true, data: loyalty, message: 'Sadakat ayarları güncellendi' });
    } catch (e) {
        console.error('[Loyalty] settings update error:', e);
        res.status(500).json({ success: false, error: 'Ayarlar güncellenemedi' });
    }
});

// GET /api/campaigns/loyalty/members - List loyalty members (admin)
router.get('/loyalty/members', authMiddleware, ensureAdmin, async (req, res) => {
    try {
        const tenantId = req.user.tenantId;
        const { page = 1, pageSize = 50, search } = req.query;

        // Get tenant loyalty settings for tier calculation
        const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } });
        const loyalty = tenant?.settings?.loyalty || DEFAULT_LOYALTY;
        const tiers = loyalty.tiers || DEFAULT_LOYALTY.tiers;

        // Aggregate points per user
        const members = await prisma.loyaltyTransaction.groupBy({
            by: ['userId'],
            where: { tenantId },
            _sum: { points: true },
        });

        if (members.length === 0) {
            return res.json({ success: true, data: { items: [], total: 0, page: 1, pageSize: Number(pageSize) } });
        }

        const userIds = members.map(m => m.userId);

        // Get user details
        const userWhere = { id: { in: userIds }, tenantId };
        if (search) {
            userWhere.OR = [
                { fullName: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } },
            ];
        }

        const users = await prisma.user.findMany({
            where: userWhere,
            select: { id: true, fullName: true, email: true, phone: true, avatar: true, createdAt: true },
            skip: (Number(page) - 1) * Number(pageSize),
            take: Number(pageSize),
        });

        const pointsMap = {};
        members.forEach(m => { pointsMap[m.userId] = m._sum.points || 0; });

        const getTier = (points) => {
            let current = tiers[0];
            for (const t of tiers) {
                if (points >= t.minPoints) current = t;
            }
            return current;
        };

        const items = users.map(u => ({
            ...u,
            totalPoints: pointsMap[u.id] || 0,
            tier: getTier(pointsMap[u.id] || 0),
        }));

        // Sort by points desc
        items.sort((a, b) => b.totalPoints - a.totalPoints);

        res.json({
            success: true,
            data: { items, total: members.length, page: Number(page), pageSize: Number(pageSize) }
        });
    } catch (e) {
        console.error('[Loyalty] members error:', e);
        res.status(500).json({ success: false, error: 'Üyeler alınamadı' });
    }
});

// POST /api/campaigns/loyalty/adjust - Manual point adjustment (admin)
router.post('/loyalty/adjust', authMiddleware, ensureAdmin, async (req, res) => {
    try {
        const tenantId = req.user.tenantId;
        const { userId, points, description } = req.body;

        if (!userId || points == null) {
            return res.status(400).json({ success: false, error: 'userId ve points gerekli' });
        }

        const tx = await prisma.loyaltyTransaction.create({
            data: {
                tenantId,
                userId,
                type: Number(points) >= 0 ? 'BONUS' : 'ADJUST',
                points: Number(points),
                description: description || `Manuel düzeltme (${req.user.fullName})`,
            }
        });

        res.json({ success: true, data: tx, message: 'Puan düzeltmesi yapıldı' });
    } catch (e) {
        console.error('[Loyalty] adjust error:', e);
        res.status(500).json({ success: false, error: 'Düzeltme yapılamadı' });
    }
});

// ════════════════════════════════════════════════════════════════
// CUSTOMER: LOYALTY INFO
// ════════════════════════════════════════════════════════════════

// GET /api/campaigns/loyalty/me - Customer's loyalty summary
router.get('/loyalty/me', authMiddleware, ensureCustomer, async (req, res) => {
    try {
        const userId = req.user.id;
        const tenantId = req.user.tenantId;

        // Get settings
        const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } });
        const loyalty = tenant?.settings?.loyalty || DEFAULT_LOYALTY;

        if (!loyalty.enabled) {
            return res.json({ success: true, data: { enabled: false } });
        }

        const tiers = loyalty.tiers || DEFAULT_LOYALTY.tiers;

        // Total points
        const agg = await prisma.loyaltyTransaction.aggregate({
            where: { userId, tenantId },
            _sum: { points: true }
        });
        const totalPoints = agg._sum.points || 0;

        // Determine tier
        let currentTier = tiers[0];
        let nextTier = tiers.length > 1 ? tiers[1] : null;
        for (let i = 0; i < tiers.length; i++) {
            if (totalPoints >= tiers[i].minPoints) {
                currentTier = tiers[i];
                nextTier = i + 1 < tiers.length ? tiers[i + 1] : null;
            }
        }

        // Recent transactions
        const history = await prisma.loyaltyTransaction.findMany({
            where: { userId, tenantId },
            orderBy: { createdAt: 'desc' },
            take: 50,
            include: {
                booking: { select: { bookingNumber: true, total: true } }
            }
        });

        // Earned / redeemed totals
        const earned = history.filter(h => h.points > 0).reduce((s, h) => s + h.points, 0);
        const redeemed = Math.abs(history.filter(h => h.points < 0).reduce((s, h) => s + h.points, 0));

        res.json({
            success: true,
            data: {
                enabled: true,
                totalPoints,
                currentTier,
                nextTier,
                pointsToNextTier: nextTier ? Math.max(0, nextTier.minPoints - totalPoints) : 0,
                redeemRate: loyalty.redeemRate,
                maxRedeemPercent: loyalty.maxRedeemPercent,
                earned,
                redeemed,
                history,
            }
        });
    } catch (e) {
        console.error('[Loyalty] customer info error:', e);
        res.status(500).json({ success: false, error: 'Sadakat bilgisi alınamadı' });
    }
});

// ════════════════════════════════════════════════════════════════
// ADMIN: DASHBOARD STATS
// ════════════════════════════════════════════════════════════════

// GET /api/campaigns/admin/stats/summary
router.get('/admin/stats/summary', authMiddleware, ensureAdmin, async (req, res) => {
    try {
        const tenantId = req.user.tenantId;

        const [activeCampaigns, totalUsages, totalDiscount, loyaltyMembers] = await Promise.all([
            prisma.campaign.count({ where: { tenantId, isActive: true } }),
            prisma.campaignUsage.count({
                where: { campaign: { tenantId } }
            }),
            prisma.campaignUsage.aggregate({
                where: { campaign: { tenantId } },
                _sum: { discount: true }
            }),
            prisma.loyaltyTransaction.groupBy({
                by: ['userId'],
                where: { tenantId },
            }),
        ]);

        res.json({
            success: true,
            data: {
                activeCampaigns,
                totalUsages,
                totalDiscountGiven: totalDiscount._sum.discount || 0,
                loyaltyMemberCount: loyaltyMembers.length,
            }
        });
    } catch (e) {
        console.error('[Campaigns] stats error:', e);
        res.status(500).json({ success: false, error: 'İstatistikler alınamadı' });
    }
});

module.exports = router;
