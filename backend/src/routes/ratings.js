/**
 * Driver Rating System
 *
 * Architecture:
 * - Questions stored in tenant.settings.ratingQuestions: [{id, text, order, isActive}]
 * - Submitted ratings stored in booking.metadata.rating: {token, submittedAt, answers, comment, overall}
 * - Token = JWT signed with JWT_SECRET, payload {bookingId, tenantId, type:'rating'}, valid 30 days
 * - Driver rating = average of all "overall" scores from their completed bookings
 */

const express = require('express');
const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');
const { authMiddleware, JWT_SECRET } = require('../middleware/auth');

const router = express.Router();

const RATING_TOKEN_EXPIRY = '30d';

// ─── Helpers ──────────────────────────────────────────────
function ensureAdmin(req, res, next) {
    if (req.user.roleType !== 'TENANT_ADMIN' && req.user.roleType !== 'SUPER_ADMIN') {
        return res.status(403).json({ success: false, error: 'Yetki yok' });
    }
    next();
}

function ensureDriver(req, res, next) {
    if (req.user.roleType !== 'DRIVER' && req.user.roleType !== 'PARTNER') {
        return res.status(403).json({ success: false, error: 'Sadece sürücüler' });
    }
    next();
}

function generateRatingToken(bookingId, tenantId) {
    return jwt.sign({ bookingId, tenantId, type: 'rating' }, JWT_SECRET, { expiresIn: RATING_TOKEN_EXPIRY });
}

function verifyRatingToken(token) {
    try {
        const payload = jwt.verify(token, JWT_SECRET);
        if (payload.type !== 'rating') return null;
        return payload;
    } catch {
        return null;
    }
}

// Default questions used when tenant has none configured
const DEFAULT_QUESTIONS = [
    { id: 'q_punctual', text: 'Şoför zamanında geldi mi?', order: 1, isActive: true },
    { id: 'q_friendly', text: 'Şoför kibar ve güleryüzlü müydü?', order: 2, isActive: true },
    { id: 'q_clean', text: 'Araç temiz ve konforluydu mu?', order: 3, isActive: true },
    { id: 'q_drive', text: 'Sürüş güvenli ve rahat mıydı?', order: 4, isActive: true },
    { id: 'q_overall', text: 'Genel memnuniyet?', order: 5, isActive: true },
];

// ════════════════════════════════════════════════════════════════════
// ADMIN ENDPOINTS
// ════════════════════════════════════════════════════════════════════

// GET /api/ratings/admin/questions
router.get('/admin/questions', authMiddleware, ensureAdmin, async (req, res) => {
    try {
        const tenant = await prisma.tenant.findUnique({
            where: { id: req.user.tenantId },
            select: { settings: true }
        });
        const questions = tenant?.settings?.ratingQuestions || DEFAULT_QUESTIONS;
        res.json({ success: true, data: { questions, defaults: DEFAULT_QUESTIONS } });
    } catch (e) {
        console.error('[Ratings] get questions error:', e);
        res.status(500).json({ success: false, error: 'Sorular alınamadı' });
    }
});

// PUT /api/ratings/admin/questions
// Body: { questions: [{id, text, order, isActive}] }
router.put('/admin/questions', authMiddleware, ensureAdmin, async (req, res) => {
    try {
        const { questions } = req.body;
        if (!Array.isArray(questions)) {
            return res.status(400).json({ success: false, error: 'questions array bekleniyor' });
        }

        // Sanitise
        const cleaned = questions.map((q, idx) => ({
            id: q.id || `q_${Date.now()}_${idx}`,
            text: String(q.text || '').trim().slice(0, 200),
            order: Number(q.order ?? idx + 1),
            isActive: q.isActive !== false,
        })).filter(q => q.text.length > 0);

        const current = await prisma.tenant.findUnique({
            where: { id: req.user.tenantId },
            select: { settings: true }
        });
        const newSettings = { ...(current?.settings || {}), ratingQuestions: cleaned };
        await prisma.tenant.update({
            where: { id: req.user.tenantId },
            data: { settings: newSettings }
        });
        res.json({ success: true, data: { questions: cleaned } });
    } catch (e) {
        console.error('[Ratings] put questions error:', e);
        res.status(500).json({ success: false, error: 'Kaydedilemedi' });
    }
});

// GET /api/ratings/admin/list?driverId=...&from=...&to=...
// List all submitted ratings for the tenant
router.get('/admin/list', authMiddleware, ensureAdmin, async (req, res) => {
    try {
        const { driverId, from, to } = req.query;
        const where = {
            tenantId: req.user.tenantId,
            metadata: { path: ['rating', 'submittedAt'], not: null },
        };
        if (driverId) where.driverId = driverId;
        if (from || to) {
            where.updatedAt = {};
            if (from) where.updatedAt.gte = new Date(from);
            if (to) where.updatedAt.lte = new Date(to);
        }

        const bookings = await prisma.booking.findMany({
            where,
            select: {
                id: true,
                bookingNumber: true,
                contactName: true,
                contactPhone: true,
                driver: { select: { id: true, fullName: true } },
                metadata: true,
                updatedAt: true,
                startDate: true,
            },
            orderBy: { updatedAt: 'desc' },
            take: 500,
        });

        const ratings = bookings.map(b => ({
            bookingId: b.id,
            bookingNumber: b.bookingNumber,
            customerName: b.contactName,
            customerPhone: b.contactPhone,
            driverId: b.driver?.id,
            driverName: b.driver?.fullName,
            startDate: b.startDate,
            submittedAt: b.metadata?.rating?.submittedAt,
            overall: b.metadata?.rating?.overall,
            answers: b.metadata?.rating?.answers || [],
            comment: b.metadata?.rating?.comment,
        }));

        // Aggregate per-driver averages
        const byDriver = {};
        ratings.forEach(r => {
            if (!r.driverId) return;
            if (!byDriver[r.driverId]) {
                byDriver[r.driverId] = { driverId: r.driverId, driverName: r.driverName, count: 0, sum: 0 };
            }
            byDriver[r.driverId].count++;
            byDriver[r.driverId].sum += Number(r.overall || 0);
        });
        const driverStats = Object.values(byDriver).map(d => ({
            ...d,
            average: d.count > 0 ? Math.round((d.sum / d.count) * 10) / 10 : 0,
        }));

        res.json({ success: true, data: { ratings, driverStats } });
    } catch (e) {
        console.error('[Ratings] admin list error:', e);
        res.status(500).json({ success: false, error: 'Liste alınamadı' });
    }
});

// ════════════════════════════════════════════════════════════════════
// PUBLIC ENDPOINTS (Customer rating page, no auth)
// ════════════════════════════════════════════════════════════════════

// GET /api/ratings/public/:token
router.get('/public/:token', async (req, res) => {
    try {
        const payload = verifyRatingToken(req.params.token);
        if (!payload) {
            return res.status(400).json({ success: false, error: 'Geçersiz veya süresi dolmuş bağlantı' });
        }

        const booking = await prisma.booking.findFirst({
            where: { id: payload.bookingId, tenantId: payload.tenantId },
            select: {
                id: true,
                bookingNumber: true,
                contactName: true,
                startDate: true,
                metadata: true,
                driver: { select: { fullName: true } },
                tenant: { select: { name: true, settings: true } },
            }
        });
        if (!booking) {
            return res.status(404).json({ success: false, error: 'Rezervasyon bulunamadı' });
        }

        // Already submitted?
        const existing = booking.metadata?.rating;
        const submitted = !!existing?.submittedAt;

        const questions = booking.tenant?.settings?.ratingQuestions
            || DEFAULT_QUESTIONS;
        const activeQuestions = questions.filter(q => q.isActive !== false).sort((a, b) => (a.order || 0) - (b.order || 0));

        const branding = booking.tenant?.settings?.branding || {};

        res.json({
            success: true,
            data: {
                bookingNumber: booking.bookingNumber,
                customerName: booking.contactName,
                driverName: booking.driver?.fullName || 'Şoförünüz',
                startDate: booking.startDate,
                companyName: branding.companyName || booking.tenant?.name || 'SmartTransfer',
                companyLogo: branding.logo || null,
                questions: activeQuestions,
                submitted,
                submittedRating: submitted ? existing : null,
            }
        });
    } catch (e) {
        console.error('[Ratings] public get error:', e);
        res.status(500).json({ success: false, error: 'Yüklenemedi' });
    }
});

// POST /api/ratings/public/:token
// Body: { answers: [{questionId, stars}], comment }
router.post('/public/:token', async (req, res) => {
    try {
        const payload = verifyRatingToken(req.params.token);
        if (!payload) {
            return res.status(400).json({ success: false, error: 'Geçersiz veya süresi dolmuş bağlantı' });
        }

        const { answers, comment } = req.body;
        if (!Array.isArray(answers) || answers.length === 0) {
            return res.status(400).json({ success: false, error: 'En az bir soru cevaplanmalı' });
        }

        // Validate
        const cleanAnswers = answers
            .filter(a => a.questionId && Number.isFinite(Number(a.stars)))
            .map(a => ({
                questionId: String(a.questionId),
                stars: Math.max(1, Math.min(5, Math.round(Number(a.stars))))
            }));
        if (cleanAnswers.length === 0) {
            return res.status(400).json({ success: false, error: 'Geçerli puan yok' });
        }

        const booking = await prisma.booking.findFirst({
            where: { id: payload.bookingId, tenantId: payload.tenantId },
            select: { id: true, metadata: true, driverId: true }
        });
        if (!booking) {
            return res.status(404).json({ success: false, error: 'Rezervasyon bulunamadı' });
        }

        // Already rated? Allow only first time (avoid spam)
        if (booking.metadata?.rating?.submittedAt) {
            return res.status(409).json({ success: false, error: 'Bu rezervasyon için zaten puan verilmiş' });
        }

        const overall = Math.round(
            (cleanAnswers.reduce((sum, a) => sum + a.stars, 0) / cleanAnswers.length) * 10
        ) / 10;

        const ratingObj = {
            submittedAt: new Date().toISOString(),
            answers: cleanAnswers,
            comment: comment ? String(comment).slice(0, 500) : null,
            overall,
        };

        await prisma.booking.update({
            where: { id: booking.id },
            data: {
                metadata: { ...(booking.metadata || {}), rating: ratingObj }
            }
        });

        // Notify driver via socket if connected
        try {
            const io = req.app?.get?.('io') || global.io;
            if (io && booking.driverId) {
                io.to(`user_${booking.driverId}`).emit('new_rating', {
                    bookingId: booking.id,
                    overall,
                });
            }
        } catch { /* non-fatal */ }

        res.json({ success: true, data: { overall } });
    } catch (e) {
        console.error('[Ratings] public submit error:', e);
        res.status(500).json({ success: false, error: 'Kaydedilemedi' });
    }
});

// ════════════════════════════════════════════════════════════════════
// DRIVER ENDPOINTS
// ════════════════════════════════════════════════════════════════════

// GET /api/ratings/driver/my-ratings
router.get('/driver/my-ratings', authMiddleware, ensureDriver, async (req, res) => {
    try {
        const driverId = req.user.id;

        const bookings = await prisma.booking.findMany({
            where: {
                driverId,
                metadata: { path: ['rating', 'submittedAt'], not: null }
            },
            select: {
                id: true,
                bookingNumber: true,
                contactName: true,
                metadata: true,
                startDate: true,
            },
            orderBy: { updatedAt: 'desc' },
            take: 100,
        });

        const ratings = bookings.map(b => ({
            bookingId: b.id,
            bookingNumber: b.bookingNumber,
            customerName: b.contactName,
            startDate: b.startDate,
            submittedAt: b.metadata?.rating?.submittedAt,
            overall: b.metadata?.rating?.overall,
            answers: b.metadata?.rating?.answers || [],
            comment: b.metadata?.rating?.comment,
        }));

        const total = ratings.length;
        const average = total > 0
            ? Math.round((ratings.reduce((s, r) => s + Number(r.overall || 0), 0) / total) * 10) / 10
            : 0;

        // Per-question averages
        const tenant = await prisma.tenant.findUnique({
            where: { id: req.user.tenantId },
            select: { settings: true }
        });
        const questions = tenant?.settings?.ratingQuestions || DEFAULT_QUESTIONS;
        const perQuestion = questions.map(q => {
            const stars = ratings
                .flatMap(r => r.answers)
                .filter(a => a.questionId === q.id)
                .map(a => Number(a.stars));
            const avg = stars.length > 0
                ? Math.round((stars.reduce((s, x) => s + x, 0) / stars.length) * 10) / 10
                : 0;
            return { questionId: q.id, text: q.text, average: avg, count: stars.length };
        });

        // Distribution (1-5)
        const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        ratings.forEach(r => {
            const bucket = Math.round(Number(r.overall || 0));
            if (distribution[bucket] !== undefined) distribution[bucket]++;
        });

        res.json({
            success: true,
            data: {
                total,
                average,
                distribution,
                perQuestion,
                ratings,
            }
        });
    } catch (e) {
        console.error('[Ratings] driver my-ratings error:', e);
        res.status(500).json({ success: false, error: 'Puanlar alınamadı' });
    }
});

// ════════════════════════════════════════════════════════════════════
// HELPERS exposed to other modules (transfer.js, driver.js)
// ════════════════════════════════════════════════════════════════════
module.exports = router;
module.exports.generateRatingToken = generateRatingToken;
module.exports.verifyRatingToken = verifyRatingToken;
module.exports.DEFAULT_QUESTIONS = DEFAULT_QUESTIONS;
