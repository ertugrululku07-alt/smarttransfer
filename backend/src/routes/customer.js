/**
 * Customer Panel API
 *
 * All endpoints scoped to the authenticated customer (req.user.id).
 * Provides:
 *  - profile read / update / password change
 *  - bookings list (active + past)
 *  - booking detail with assigned driver info
 *  - driver live location (gated: only when transfer is within 30 min or in progress)
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const prisma = require('../lib/prisma');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// ─── Helper: ensure caller is a customer ─────────────────────────
function ensureCustomer(req, res, next) {
    const type = (req.user.roleType || '').toUpperCase();
    const code = (req.user.roleCode || '').toUpperCase();
    if (type === 'CUSTOMER' || code === 'CUSTOMER') return next();
    // Some tenants store customers without explicit role — allow if no admin/staff role
    const blocked = ['DRIVER', 'PARTNER', 'AGENCY_USER', 'AGENCY_ADMIN', 'TENANT_ADMIN', 'SUPER_ADMIN', 'PLATFORM_OPS', 'ADMIN', 'DISPATCHER'];
    if (blocked.includes(type) || blocked.includes(code)) {
        return res.status(403).json({ success: false, error: 'Bu alana erişim yetkiniz yok' });
    }
    next();
}

// ─── Helper: build customer "where" filter for bookings ───────────
// Bookings are linked either by customerId (FK) or by contactEmail/phone matching the user.
function customerBookingFilter(user) {
    const orFilters = [];
    if (user.id) orFilters.push({ customerId: user.id });
    if (user.email) orFilters.push({ contactEmail: { equals: user.email, mode: 'insensitive' } });
    return { OR: orFilters };
}

// ════════════════════════════════════════════════════════════════════
// PROFILE
// ════════════════════════════════════════════════════════════════════

// GET /api/customer/me
router.get('/me', authMiddleware, ensureCustomer, async (req, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.user.id },
            select: {
                id: true, fullName: true, firstName: true, lastName: true,
                email: true, phone: true, avatar: true,
                metadata: true, createdAt: true,
                role: { select: { name: true, code: true, type: true } }
            }
        });
        res.json({ success: true, data: user });
    } catch (e) {
        console.error('[Customer] me error:', e);
        res.status(500).json({ success: false, error: 'Profil alınamadı' });
    }
});

// PUT /api/customer/me
router.put('/me', authMiddleware, ensureCustomer, async (req, res) => {
    try {
        const { firstName, lastName, fullName, phone, avatar } = req.body;

        const data = {};
        if (firstName !== undefined) data.firstName = String(firstName).trim();
        if (lastName !== undefined) data.lastName = String(lastName).trim();
        if (fullName !== undefined) data.fullName = String(fullName).trim();
        if (phone !== undefined) data.phone = String(phone).trim();
        if (avatar !== undefined) data.avatar = avatar;

        // Auto-build fullName when first/last provided but fullName not
        if ((data.firstName || data.lastName) && !data.fullName) {
            const fn = data.firstName ?? '';
            const ln = data.lastName ?? '';
            data.fullName = `${fn} ${ln}`.trim();
        }

        const updated = await prisma.user.update({
            where: { id: req.user.id },
            data,
            select: {
                id: true, fullName: true, firstName: true, lastName: true,
                email: true, phone: true, avatar: true
            }
        });
        res.json({ success: true, data: updated });
    } catch (e) {
        console.error('[Customer] update me error:', e);
        res.status(500).json({ success: false, error: 'Güncellenemedi' });
    }
});

// PUT /api/customer/me/password
router.put('/me/password', authMiddleware, ensureCustomer, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        if (!currentPassword || !newPassword) {
            return res.status(400).json({ success: false, error: 'Mevcut ve yeni şifre gerekli' });
        }
        if (String(newPassword).length < 6) {
            return res.status(400).json({ success: false, error: 'Yeni şifre en az 6 karakter olmalı' });
        }
        const user = await prisma.user.findUnique({ where: { id: req.user.id } });
        if (!user) return res.status(404).json({ success: false, error: 'Kullanıcı bulunamadı' });

        const ok = await bcrypt.compare(currentPassword, user.password);
        if (!ok) return res.status(400).json({ success: false, error: 'Mevcut şifre hatalı' });

        const hash = await bcrypt.hash(newPassword, 10);
        await prisma.user.update({ where: { id: req.user.id }, data: { password: hash } });
        res.json({ success: true });
    } catch (e) {
        console.error('[Customer] password change error:', e);
        res.status(500).json({ success: false, error: 'Şifre güncellenemedi' });
    }
});

// ════════════════════════════════════════════════════════════════════
// BOOKINGS
// ════════════════════════════════════════════════════════════════════

// GET /api/customer/bookings
// Query: status=active|past|all, page, pageSize
router.get('/bookings', authMiddleware, ensureCustomer, async (req, res) => {
    try {
        const { status = 'all' } = req.query;
        const page = Math.max(1, Number(req.query.page) || 1);
        const pageSize = Math.min(50, Math.max(5, Number(req.query.pageSize) || 20));

        let statusFilter = {};
        if (status === 'active') {
            statusFilter = { status: { in: ['PENDING', 'CONFIRMED', 'IN_PROGRESS'] } };
        } else if (status === 'past') {
            statusFilter = { status: { in: ['COMPLETED', 'CANCELLED', 'NO_SHOW'] } };
        }

        const where = { ...customerBookingFilter(req.user), ...statusFilter };

        const [items, total] = await Promise.all([
            prisma.booking.findMany({
                where,
                orderBy: { startDate: 'desc' },
                skip: (page - 1) * pageSize,
                take: pageSize,
                select: {
                    id: true, bookingNumber: true, productType: true,
                    status: true, paymentStatus: true,
                    startDate: true, endDate: true, total: true, currency: true,
                    contactName: true, contactPhone: true,
                    pickedUpAt: true, droppedOffAt: true,
                    metadata: true,
                    driver: { select: { id: true, fullName: true, phone: true, avatar: true } },
                }
            }),
            prisma.booking.count({ where })
        ]);

        // Strip noisy / sensitive metadata fields
        const safeItems = items.map(b => ({
            ...b,
            metadata: b.metadata ? {
                pickup: b.metadata.pickup,
                dropoff: b.metadata.dropoff,
                vehicleType: b.metadata.vehicleType,
                flightNumber: b.metadata.flightNumber,
                paymentMethod: b.metadata.paymentMethod,
                passengerName: b.metadata.passengerName,
                rating: b.metadata.rating ? { overall: b.metadata.rating.overall, submittedAt: b.metadata.rating.submittedAt } : null,
            } : null,
        }));

        res.json({ success: true, data: { items: safeItems, total, page, pageSize } });
    } catch (e) {
        console.error('[Customer] bookings list error:', e);
        res.status(500).json({ success: false, error: 'Rezervasyonlar alınamadı' });
    }
});

// GET /api/customer/bookings/:id
router.get('/bookings/:id', authMiddleware, ensureCustomer, async (req, res) => {
    try {
        const { id } = req.params;
        const booking = await prisma.booking.findFirst({
            where: { id, ...customerBookingFilter(req.user) },
            select: {
                id: true, bookingNumber: true, productType: true,
                status: true, paymentStatus: true,
                startDate: true, endDate: true,
                total: true, subtotal: true, tax: true, serviceFee: true, discount: true, currency: true,
                paidAmount: true, contactName: true, contactPhone: true, contactEmail: true,
                adults: true, children: true, infants: true,
                pickedUpAt: true, droppedOffAt: true,
                specialRequests: true,
                metadata: true, createdAt: true,
                driver: {
                    select: {
                        id: true, fullName: true, phone: true, avatar: true,
                        metadata: true,
                    }
                }
            }
        });

        if (!booking) {
            return res.status(404).json({ success: false, error: 'Rezervasyon bulunamadı' });
        }

        // Strip sensitive bits from metadata
        const meta = booking.metadata || {};
        const cleanMeta = {
            pickup: meta.pickup,
            dropoff: meta.dropoff,
            pickupCoordinates: meta.pickupCoordinates,
            dropoffCoordinates: meta.dropoffCoordinates,
            vehicleType: meta.vehicleType,
            vehiclePlate: meta.vehiclePlate,
            flightNumber: meta.flightNumber,
            paymentMethod: meta.paymentMethod,
            passengerName: meta.passengerName,
            transferType: meta.transferType,
            rating: meta.rating ? { overall: meta.rating.overall, submittedAt: meta.rating.submittedAt } : null,
            ratingToken: meta.ratingToken,
        };

        // Compute "minutes until pickup" for the front-end's tracking gate
        const minutesUntilPickup = booking.startDate
            ? Math.round((new Date(booking.startDate).getTime() - Date.now()) / 60000)
            : null;
        const trackingAvailable = (
            booking.status === 'IN_PROGRESS'
        ) || (
            ['CONFIRMED', 'PENDING'].includes(booking.status) &&
            minutesUntilPickup !== null && minutesUntilPickup <= 30 && minutesUntilPickup >= -120
        );

        // Strip driver metadata (only expose vehicle plate if any)
        let driverInfo = null;
        if (booking.driver) {
            const dm = booking.driver.metadata || {};
            driverInfo = {
                id: booking.driver.id,
                fullName: booking.driver.fullName,
                phone: booking.driver.phone,
                avatar: booking.driver.avatar,
                vehicleType: dm.vehicleType || cleanMeta.vehicleType || null,
                vehiclePlate: dm.licensePlate || dm.vehiclePlate || cleanMeta.vehiclePlate || null,
                vehicleColor: dm.vehicleColor || null,
                vehicleModel: dm.vehicleModel || null,
                rating: null, // computed below
            };

            // Driver overall rating (best-effort, lightweight)
            try {
                const rated = await prisma.booking.findMany({
                    where: { driverId: booking.driver.id, metadata: { path: ['rating', 'submittedAt'], not: null } },
                    select: { metadata: true },
                });
                const scores = rated.map(b => Number(b.metadata?.rating?.overall)).filter(n => Number.isFinite(n) && n > 0);
                driverInfo.rating = scores.length > 0
                    ? Math.round((scores.reduce((s, n) => s + n, 0) / scores.length) * 10) / 10
                    : null;
                driverInfo.ratingCount = scores.length;
            } catch { /* non-fatal */ }
        }

        res.json({
            success: true,
            data: {
                ...booking,
                metadata: cleanMeta,
                driver: driverInfo,
                minutesUntilPickup,
                trackingAvailable,
            }
        });
    } catch (e) {
        console.error('[Customer] booking detail error:', e);
        res.status(500).json({ success: false, error: 'Detay alınamadı' });
    }
});

// GET /api/customer/bookings/:id/driver-location
// Returns current driver location IF transfer is within 30 minutes or in progress.
router.get('/bookings/:id/driver-location', authMiddleware, ensureCustomer, async (req, res) => {
    try {
        const { id } = req.params;
        const booking = await prisma.booking.findFirst({
            where: { id, ...customerBookingFilter(req.user) },
            select: { id: true, status: true, startDate: true, driverId: true }
        });
        if (!booking) return res.status(404).json({ success: false, error: 'Rezervasyon bulunamadı' });
        if (!booking.driverId) return res.status(404).json({ success: false, error: 'Henüz şoför atanmamış' });

        const minutesUntilPickup = booking.startDate
            ? (new Date(booking.startDate).getTime() - Date.now()) / 60000
            : null;
        const inProgress = booking.status === 'IN_PROGRESS';
        const allowed = inProgress || (minutesUntilPickup !== null && minutesUntilPickup <= 30 && minutesUntilPickup >= -180);
        if (!allowed) {
            return res.status(403).json({
                success: false,
                error: 'Şoför konumu transfer zamanına 30 dakika kala paylaşılır',
                minutesUntilPickup
            });
        }

        const onlineDrivers = req.app.get('onlineDrivers') || {};
        const info = onlineDrivers[booking.driverId];

        // Fallback to last known location stored on user
        let location = info?.location || null;
        let lastSeen = info?.lastSeen || null;
        if (!location) {
            const driver = await prisma.user.findUnique({
                where: { id: booking.driverId },
                select: { metadata: true, lastSeenAt: true }
            });
            const dm = driver?.metadata || {};
            if (dm.lastLat && dm.lastLng) {
                location = { lat: Number(dm.lastLat), lng: Number(dm.lastLng), heading: dm.lastHeading || 0, speed: dm.lastSpeed || 0 };
            }
            if (driver?.lastSeenAt) lastSeen = new Date(driver.lastSeenAt).getTime();
        }

        if (!location) {
            return res.json({ success: true, data: { location: null, online: false, lastSeen } });
        }

        res.json({
            success: true,
            data: {
                location,
                online: !!info,
                lastSeen,
            }
        });
    } catch (e) {
        console.error('[Customer] driver location error:', e);
        res.status(500).json({ success: false, error: 'Konum alınamadı' });
    }
});

module.exports = router;
