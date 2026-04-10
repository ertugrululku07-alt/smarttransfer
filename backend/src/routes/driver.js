const express = require('express');
const router = express.Router();

const prisma = require('../lib/prisma');
const { authMiddleware } = require('../middleware/auth');

// Middleware to ensure user is a driver
const ensureDriver = (req, res, next) => {
    if (req.user.roleCode !== 'DRIVER' && req.user.roleType !== 'DRIVER' && req.user.roleType !== 'PARTNER') {
        return res.status(403).json({ success: false, error: 'Access denied. Drivers only.' });
    }
    next();
};

// GET /api/driver/dashboard
// Summary stats for the driver
router.get('/dashboard', authMiddleware, ensureDriver, async (req, res) => {
    try {
        // Use Turkey timezone (UTC+3) for "today" boundaries
        const nowStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' });
        const today = new Date(`${nowStr}T00:00:00+03:00`);
        const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);

        const driverId = req.user.id;

        const [todayJobs, completedJobs] = await Promise.all([
            prisma.booking.count({
                where: {
                    driverId: driverId,
                    startDate: {
                        gte: today,
                        lt: tomorrow
                    },
                    status: { not: 'CANCELLED' }
                }
            }),
            prisma.booking.count({
                where: {
                    driverId: driverId,
                    status: 'COMPLETED'
                }
            })
        ]);

        res.json({
            success: true,
            data: {
                todayJobs,
                completedJobs,
                rating: 4.9 // Placeholder or calculated from reviews
            }
        });
    } catch (error) {
        console.error('Driver dashboard error:', error);
        res.status(500).json({ success: false, error: 'Server error' });
    }
});

// GET /api/driver/bookings
// List active/upcoming bookings
router.get('/bookings', authMiddleware, ensureDriver, async (req, res) => {
    try {
        const { type } = req.query; // 'today', 'upcoming', 'all'
        const driverId = req.user.id;

        let dateFilter = {};
        // Use Turkey timezone (UTC+3) for date boundaries
        const nowStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' });
        const today = new Date(`${nowStr}T00:00:00+03:00`);
        const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);

        if (type === 'today') {
            dateFilter = { startDate: { gte: today, lt: tomorrow } };
        } else if (type === 'upcoming') {
            dateFilter = { startDate: { gte: tomorrow } };
        }
        // 'all' or undefined → no date filter

        const bookings = await prisma.booking.findMany({
            where: {
                driverId: driverId,
                status: { notIn: ['CANCELLED', 'COMPLETED', 'NO_SHOW'] },
                ...dateFilter
            },
            include: {
                product: {
                    include: {
                        transferData: true
                    }
                },
                customer: {
                    select: { firstName: true, lastName: true, phone: true, email: true }
                },
                items: true
            },
            orderBy: { startDate: 'asc' }
        });

        // Group shuttle bookings together for the driver app
        const isShuttle = (b) => {
            const vt = String((b.metadata?.vehicleType) || '').toLowerCase();
            const tt = String((b.metadata?.transferType) || '').toLowerCase();
            return vt.includes('shuttle') || vt.includes('paylaşımlı') || tt === 'shuttle' || b.metadata?.shuttleRouteId;
        };

        const privateBookings = [];
        const shuttleGroups = {};

        bookings.forEach(b => {
            if (isShuttle(b)) {
                const m = b.metadata || {};
                const routeId = m.shuttleRouteId;
                const masterTime = m.shuttleMasterTime || '';
                const dropoff = String(m.dropoff || '').trim().substring(0, 60).toLowerCase().replace(/\s+/g, ' ');
                const key = routeId
                    ? `ROUTE::${routeId}${masterTime ? '::' + masterTime : ''}`
                    : `ADHOC::${dropoff}${masterTime ? '::' + masterTime : ''}`;

                if (!shuttleGroups[key]) {
                    shuttleGroups[key] = {
                        _isShuttleGroup: true,
                        groupKey: key,
                        routeName: m.dropoff || 'Shuttle',
                        pickup: m.pickup || 'Çeşitli Noktalar',
                        dropoff: m.dropoff || 'Bilinmeyen',
                        startDate: b.startDate,
                        status: b.status,
                        vehicleType: m.vehicleType || 'Shuttle',
                        bookings: []
                    };
                }
                shuttleGroups[key].bookings.push({
                    id: b.id,
                    bookingNumber: b.bookingNumber,
                    contactName: b.contactName,
                    contactPhone: b.contactPhone,
                    contactEmail: b.contactEmail,
                    customerFirstName: b.customer?.firstName || null,
                    customerLastName: b.customer?.lastName || null,
                    customerPhone: b.customer?.phone || b.contactPhone,
                    customerEmail: b.customer?.email || b.contactEmail,
                    adults: b.adults || 0,
                    children: b.children || 0,
                    pickup: m.pickup || '',
                    dropoff: m.dropoff || '',
                    flightNumber: m.flightNumber || b.flightNumber || null,
                    status: b.status,
                    acknowledgedAt: m.acknowledgedAt || null,
                    notes: b.specialRequests || m.notes || null,
                    total: Number(b.total || 0),
                    currency: b.currency || 'TRY',
                    paymentStatus: b.paymentStatus,
                    paymentMethod: m.paymentMethod || null,
                    metadata: m
                });
                // Update group status based on individual statuses
                if (b.status === 'IN_PROGRESS') shuttleGroups[key].status = 'IN_PROGRESS';
            } else {
                privateBookings.push(b);
            }
        });

        // Merge: shuttle groups + private bookings, sorted by startDate
        const grouped = [
            ...Object.values(shuttleGroups),
            ...privateBookings.map(b => ({ ...b, _isShuttleGroup: false }))
        ].sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());

        res.json({ success: true, data: grouped });
    } catch (error) {
        console.error('Driver bookings error:', error);
        res.status(500).json({ success: false, error: 'Server error', details: error.message });
    }
});

// GET /api/driver/bookings/:id
// Get a single booking detail by ID
router.get('/bookings/:id', authMiddleware, ensureDriver, async (req, res) => {
    try {
        const { id } = req.params;
        const driverId = req.user.id;

        const booking = await prisma.booking.findFirst({
            where: {
                id: id,
                driverId: driverId,
            },
            include: {
                product: {
                    include: {
                        transferData: true,
                        vehicle: { select: { plateNumber: true, brand: true, model: true } }
                    }
                },
                customer: {
                    select: { firstName: true, lastName: true, phone: true, email: true }
                },
                items: true
            },
        });

        if (!booking) {
            return res.status(404).json({ success: false, error: 'Rezervasyon bulunamadı veya size atanmamış.' });
        }

        res.json({ success: true, data: booking });
    } catch (error) {
        console.error('Driver booking detail error:', error);
        res.status(500).json({ success: false, error: 'Server error' });
    }
});

// GET /api/driver/history
// List completed bookings
router.get('/history', authMiddleware, ensureDriver, async (req, res) => {
    try {
        const driverId = req.user.id;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        const bookings = await prisma.booking.findMany({
            where: {
                driverId: driverId,
                status: { in: ['COMPLETED', 'CANCELLED'] }
            },
            include: {
                product: true
            },
            orderBy: {
                startDate: 'desc'
            },
            take: limit,
            skip: skip
        });

        res.json({ success: true, data: bookings });
    } catch (error) {
        console.error('Driver history error:', error);
        res.status(500).json({ success: false, error: 'Server error' });
    }
});

// PUT /api/driver/bookings/:id/status
// Update booking status

router.put('/bookings/:id/status', authMiddleware, ensureDriver, async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body; // 'ON_WAY', 'PICKUP', 'STARTED', 'COMPLETED'

        const booking = await prisma.booking.update({
            where: { id: id, driverId: req.user.id },
            data: { status: status }
        });

        const io = req.app.get('io');
        if (io) {
            io.to('admin_monitoring').emit('booking_status_update', { bookingId: id, status, driverId: req.user.id });
            // Also emit to the driver's own room so their app updates immediately
            io.to(`user_${req.user.id}`).emit('booking_status_update', { bookingId: id, status, driverId: req.user.id });
        }

        res.json({ success: true, data: booking });
    } catch (error) {
        console.error('Update status error:', error);
        res.status(500).json({ success: false, error: 'Server error' });
    }
});

// PUT /api/driver/bookings/:id/payment-received
// Driver marks payment as received (used for PAY_IN_VEHICLE)
router.put('/bookings/:id/payment-received', authMiddleware, ensureDriver, async (req, res) => {
    try {
        const { id } = req.params;
        const { collectedAmount, collectedCurrency } = req.body;

        const booking = await prisma.booking.findFirst({
            where: { id, driverId: req.user.id }
        });
        if (!booking) {
            return res.status(404).json({ success: false, error: 'Rezervasyon bulunamadı' });
        }

        const meta = booking.metadata || {};
        const method = meta.paymentMethod;
        if (method !== 'PAY_IN_VEHICLE') {
            return res.status(400).json({ success: false, error: 'Bu rezervasyon araçta ödeme değil' });
        }

        const amount = collectedAmount !== undefined ? Number(collectedAmount) : Number(booking.total || 0);
        const currency = collectedCurrency || booking.currency || 'TRY';

        const updated = await prisma.booking.update({
            where: { id },
            data: {
                paymentStatus: 'PAID',
                paidAmount: amount,
                metadata: {
                    ...meta,
                    paymentReceivedAt: new Date().toISOString(),
                    paymentReceivedBy: req.user.id,
                    collectedAmount: amount,
                    collectedCurrency: currency
                }
            }
        });

        const io = req.app.get('io');
        if (io) {
            io.to('admin_monitoring').emit('booking_payment_update', {
                bookingId: id,
                paymentStatus: 'PAID',
                driverId: req.user.id,
                driverName: req.user.fullName,
                collectedAmount: amount,
                collectedCurrency: currency
            });
        }

        res.json({ success: true, data: updated });
    } catch (error) {
        console.error('Driver payment received error:', error);
        res.status(500).json({ success: false, error: 'Server error' });
    }
});



// GET /api/driver/profile
// Returns driver's own profile info
router.get('/profile', authMiddleware, ensureDriver, async (req, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.user.id },
            select: { id: true, firstName: true, lastName: true, email: true, phone: true, status: true, avatar: true }
        });
        res.json({ success: true, data: user });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Server error' });
    }
});

// PUT /api/driver/profile/password
// Change driver's own password
const bcrypt = require('bcryptjs');
router.put('/profile/password', authMiddleware, ensureDriver, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        if (!currentPassword || !newPassword) {
            return res.status(400).json({ success: false, error: 'Both passwords are required' });
        }
        if (newPassword.length < 6) {
            return res.status(400).json({ success: false, error: 'New password must be at least 6 characters' });
        }

        const user = await prisma.user.findUnique({ where: { id: req.user.id } });
        const isValid = await bcrypt.compare(currentPassword, user.password);
        if (!isValid) {
            return res.status(401).json({ success: false, error: 'Mevcut şifre hatalı' });
        }

        const hashed = await bcrypt.hash(newPassword, 10);
        await prisma.user.update({
            where: { id: req.user.id },
            data: { password: hashed }
        });

        res.json({ success: true, message: 'Şifre güncellendi' });
    } catch (error) {
        console.error('Password change error:', error);
        res.status(500).json({ success: false, error: 'Server error' });
    }
});

// GET /api/driver/contact
// Returns the Tenant Admin user that the driver should chat with
router.get('/contact', authMiddleware, ensureDriver, async (req, res) => {
    try {
        const tenantId = req.user.tenantId;

        // Find any admin/operations role for this tenant or globally
        const adminRoles = await prisma.role.findMany({
            where: {
                OR: [
                    { tenantId: tenantId, type: { in: ['TENANT_ADMIN', 'TENANT_MANAGER', 'TENANT_STAFF'] } },
                    { type: { in: ['SUPER_ADMIN', 'PLATFORM_OPS'] } },
                    { code: { in: ['ADMIN', 'OPERATION', 'SUPER_ADMIN', 'TENANT_ADMIN'] } }
                ]
            }
        });

        if (!adminRoles.length) {
            return res.status(404).json({ success: false, error: 'No admin roles found' });
        }

        const roleIds = adminRoles.map(r => r.id);

        const adminUser = await prisma.user.findFirst({
            where: {
                roleId: { in: roleIds },
                status: 'ACTIVE',
                tenantId: tenantId,
                id: { not: req.user.id },
                role: {
                    type: { notIn: ['DRIVER', 'PARTNER'] },
                    code: { notIn: ['DRIVER'] }
                }
            },
            select: { id: true, firstName: true, lastName: true, email: true }
        });

        if (!adminUser) {
            return res.status(404).json({ success: false, error: 'No active admin found' });
        }

        res.json({ success: true, data: adminUser });
    } catch (error) {
        console.error('Driver contact error:', error);
        res.status(500).json({ success: false, error: 'Server error' });
    }
});

// POST /api/driver/push-token
// Save Expo push token so server can send silent push notifications
router.post('/push-token', authMiddleware, async (req, res) => {
    try {
        const { token: pushToken } = req.body;
        if (!pushToken) return res.status(400).json({ success: false, error: 'Token is required' });

        await prisma.user.update({
            where: { id: req.user.id },
            data: { pushToken }
        });

        console.log(`[Push] Token saved for ${req.user.fullName}: ${pushToken.substring(0, 30)}...`);
        res.json({ success: true });
    } catch (error) {
        console.error('Push token save error:', error);
        res.status(500).json({ success: false, error: 'Server error' });
    }
});

// POST /api/driver/sync
// Receives background location updates AND returns pending notifications
router.post('/sync', authMiddleware, async (req, res) => {
    try {
        const { lat, lng, speed, heading, checkNotifications, lastSyncTime } = req.body;
        const driverId = req.user.id;

        // 1a. Always persist lastSeen + location to DB (survives server restarts)
        if (lat && lng) {
            await prisma.user.update({
                where: { id: driverId },
                data: {
                    lastSeenAt: new Date(),
                    lastLocationLat: parseFloat(lat),
                    lastLocationLng: parseFloat(lng),
                    lastLocationSpeed: speed ? parseFloat(speed) : null
                }
            });
        } else {
            // Ping without location - still update lastSeen
            await prisma.user.update({
                where: { id: driverId },
                data: { lastSeenAt: new Date() }
            });
        }

        // 1b. Speed violation detection (>120 km/h) — persist to DB
        const SPEED_LIMIT = 120;
        if (speed && parseFloat(speed) > SPEED_LIMIT) {
            // In-memory (for real-time dashboard)
            const speedViolations = req.app.get('speedViolations') || {};
            if (!speedViolations[driverId]) speedViolations[driverId] = [];
            if (speedViolations[driverId].length >= 50) speedViolations[driverId].shift();
            const violation = {
                speed: parseFloat(speed),
                lat: parseFloat(lat),
                lng: parseFloat(lng),
                timestamp: new Date().toISOString(),
                driverName: req.user.fullName
            };
            speedViolations[driverId].push(violation);
            req.app.set('speedViolations', speedViolations);

            // Persist to DB (fire-and-forget, don't slow down sync)
            prisma.speedViolation.create({
                data: {
                    tenantId: req.user.tenantId || req.tenant?.id || 'default',
                    driverId,
                    driverName: req.user.fullName,
                    speed: parseFloat(speed),
                    speedLimit: SPEED_LIMIT,
                    lat: parseFloat(lat),
                    lng: parseFloat(lng)
                }
            }).catch(err => console.error('[SPEED] DB write error:', err.message));

            console.log(`[SPEED] ⚠️ ${req.user.fullName} hız ihlali: ${parseFloat(speed).toFixed(0)} km/h @ ${lat},${lng}`);
        }

        // 1c. Update Location via Socket to Admin (real-time)
        const io = req.app.get('io');
        if (io && lat && lng) {
            io.to('admin_monitoring').emit('driver_location', {
                driverId: driverId,
                driverName: req.user.fullName,
                lat, lng, speed, heading,
                timestamp: new Date()
            });

            // Update in-memory map for fast /online response
            const onlineDrivers = req.app.get('onlineDrivers');
            if (onlineDrivers) {
                if (onlineDrivers[driverId]) {
                    onlineDrivers[driverId].location = { lat, lng, speed, heading, ts: new Date() };
                    onlineDrivers[driverId].lastSeen = Date.now();
                } else {
                    // Driver wasn't in memory (server restarted?) - add them back
                    onlineDrivers[driverId] = {
                        socketId: null,
                        connectedAt: new Date(),
                        lastSeen: Date.now(),
                        location: { lat, lng, speed, heading, ts: new Date() },
                        name: req.user.fullName
                    };
                    io.to('admin_monitoring').emit('driver_online', {
                        driverId: driverId,
                        driverName: req.user.fullName,
                        socketId: null,
                        avatar: req.user.avatar || null
                    });
                }
            }
        }

        // Reset the in-memory offline timer
        const resetDriverTimeout = req.app.get('resetDriverTimeout');
        if (typeof resetDriverTimeout === 'function') {
            resetDriverTimeout(driverId, req.user.fullName);
        }

        let pendingAssignedBookings = [];
        let unreadMessages = [];

        // 2. Poll Notifications if requested (when app is in background/locked)
        // Only checked if checkNotifications=true to save DB queries when foregrounded
        if (checkNotifications) {
            const syncSince = lastSyncTime ? new Date(lastSyncTime) : new Date(Date.now() - 60000); // Look back 1 min max if no lastSyncTime

            // Check new assigned bookings (updatedAt > syncSince AND driverId == req.user.id)
            pendingAssignedBookings = await prisma.booking.findMany({
                where: {
                    driverId: driverId,
                    updatedAt: { gt: syncSince },
                    status: { notIn: ['CANCELLED', 'COMPLETED', 'NO_SHOW'] }
                },
                select: { id: true, bookingNumber: true, metadata: true, startDate: true }
            });

            // Check unread messages (createdAt > syncSince AND receiverId == req.user.id)
            unreadMessages = await prisma.message.findMany({
                where: {
                    receiverId: driverId,
                    createdAt: { gt: syncSince },
                    senderId: { not: driverId }
                },
                select: { id: true, content: true, senderId: true, createdAt: true },
                orderBy: { createdAt: 'desc' },
                take: 5 // Get max 5 recent so we don't spam
            });
        }

        res.json({
            success: true,
            data: {
                serverTime: new Date().toISOString(),
                notifications: {
                    bookings: pendingAssignedBookings,
                    messages: unreadMessages
                }
            }
        });

    } catch (error) {
        console.error('Driver sync error:', error);
        res.status(500).json({ success: false, error: 'Server error' });
    }
});

// GET /api/driver/online
// Returns list of Personnel (actual drivers) as online/reachable
// Includes: current active booking, assigned vehicle, speed violation count
router.get('/online', async (req, res) => {
    try {
        const onlineDrivers = req.app.get('onlineDrivers') || {};
        const speedViolations = req.app.get('speedViolations') || {};

        // Query Personnel table - these are the ACTUAL drivers/staff
        const personnel = await prisma.personnel.findMany({
            where: {
                isActive: true
            },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                phone: true,
                photo: true,
                jobTitle: true,
                department: true,
                userId: true,
                user: {
                    select: {
                        id: true,
                        fullName: true,
                        avatar: true,
                        lastSeenAt: true,
                        lastLocationLat: true,
                        lastLocationLng: true,
                        lastLocationSpeed: true,
                        lastLoginAt: true
                    }
                }
            }
        });

        // Fetch active bookings for all drivers in a single query
        const userIds = personnel.map(p => p.userId).filter(Boolean);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const activeBookings = await prisma.booking.findMany({
            where: {
                driverId: { in: userIds },
                status: { notIn: ['CANCELLED', 'COMPLETED', 'NO_SHOW'] },
                startDate: { gte: today, lt: tomorrow }
            },
            select: {
                id: true, bookingNumber: true, driverId: true,
                contactName: true, contactPhone: true,
                startDate: true, status: true,
                metadata: true
            },
            orderBy: { startDate: 'asc' }
        });

        // Group bookings by driverId
        const bookingsByDriver = {};
        activeBookings.forEach(b => {
            if (!bookingsByDriver[b.driverId]) bookingsByDriver[b.driverId] = [];
            bookingsByDriver[b.driverId].push({
                id: b.id,
                bookingNumber: b.bookingNumber,
                contactName: b.contactName,
                contactPhone: b.contactPhone,
                startDate: b.startDate,
                status: b.status,
                pickup: b.metadata?.pickup || '',
                dropoff: b.metadata?.dropoff || '',
                vehicleType: b.metadata?.vehicleType || '',
                assignedVehicleId: b.metadata?.assignedVehicleId || null,
                pickupTime: b.metadata?.pickupTime || null,
                dropoffTime: b.metadata?.dropoffTime || null,
                flightNumber: b.metadata?.flightNumber || null,
                flightTime: b.metadata?.flightTime || null
            });
        });

        // Fetch assigned vehicles
        const vehicleIds = [...new Set(activeBookings.map(b => b.metadata?.assignedVehicleId).filter(Boolean))];
        let vehicleMap = {};
        if (vehicleIds.length > 0) {
            const vehicles = await prisma.vehicle.findMany({
                where: { id: { in: vehicleIds } },
                select: { id: true, plateNumber: true, brand: true, model: true, color: true }
            });
            vehicles.forEach(v => { vehicleMap[v.id] = v; });
        }

        // Map personnel to the driver format the frontend expects
        const result = personnel.map(p => {
            const userId = p.userId || p.id;
            const inMemory = onlineDrivers[userId];
            const location = inMemory?.location ||
                (p.user?.lastLocationLat && p.user?.lastLocationLng
                    ? { lat: p.user.lastLocationLat, lng: p.user.lastLocationLng, speed: p.user.lastLocationSpeed }
                    : null);

            const driverBookings = bookingsByDriver[userId] || [];
            const currentBooking = driverBookings[0] || null; // Next/current booking
            const vehicleInfo = currentBooking?.assignedVehicleId ? vehicleMap[currentBooking.assignedVehicleId] || null : null;
            const driverViolations = speedViolations[userId] || [];

            return {
                id: userId,
                personnelId: p.id,
                firstName: p.firstName,
                lastName: p.lastName,
                fullName: `${p.firstName} ${p.lastName}`,
                avatar: p.photo || p.user?.avatar || null,
                phone: p.phone,
                jobTitle: p.jobTitle,
                department: p.department,
                lastSeenAt: p.user?.lastSeenAt || null,
                lastLoginAt: p.user?.lastLoginAt || null,
                location,
                socketId: inMemory?.socketId || null,
                connectedAt: inMemory?.connectedAt || p.user?.lastSeenAt || null,
                role: { type: 'DRIVER', code: 'DRIVER' },
                // Enhanced data
                activeBookings: driverBookings,
                currentBooking,
                vehicle: vehicleInfo,
                todayJobCount: driverBookings.length,
                speedViolations: driverViolations.length,
                lastViolation: driverViolations.length > 0 ? driverViolations[driverViolations.length - 1] : null
            };
        });

        res.json({ success: true, data: result });
    } catch (error) {
        console.error('Online drivers error:', error);
        res.status(500).json({ success: false, error: 'Server error' });
    }
});



// GET /api/driver/:id/violations
// Returns speed violation history for a specific driver, grouped by date
router.get('/:id/violations', async (req, res) => {
    try {
        const { id } = req.params;
        const { days = 30, limit = 200 } = req.query;

        const since = new Date();
        since.setDate(since.getDate() - parseInt(days));

        const violations = await prisma.speedViolation.findMany({
            where: {
                driverId: id,
                createdAt: { gte: since }
            },
            orderBy: { createdAt: 'desc' },
            take: parseInt(limit)
        });

        // Group by date
        const grouped = {};
        violations.forEach(v => {
            const dateKey = new Date(v.createdAt).toISOString().split('T')[0]; // YYYY-MM-DD
            if (!grouped[dateKey]) grouped[dateKey] = [];
            grouped[dateKey].push({
                id: v.id,
                speed: v.speed,
                speedLimit: v.speedLimit,
                lat: v.lat,
                lng: v.lng,
                bookingId: v.bookingId,
                vehiclePlate: v.vehiclePlate,
                time: v.createdAt
            });
        });

        // Also include today's in-memory violations (most recent, might not be in DB yet)
        const memViolations = (req.app.get('speedViolations') || {})[id] || [];
        const todayKey = new Date().toISOString().split('T')[0];
        if (memViolations.length > 0 && !grouped[todayKey]) {
            grouped[todayKey] = [];
        }
        memViolations.forEach(mv => {
            const exists = (grouped[todayKey] || []).some(v =>
                Math.abs(new Date(v.time).getTime() - new Date(mv.timestamp).getTime()) < 5000
            );
            if (!exists) {
                if (!grouped[todayKey]) grouped[todayKey] = [];
                grouped[todayKey].push({
                    id: `mem_${mv.timestamp}`,
                    speed: mv.speed,
                    speedLimit: 120,
                    lat: mv.lat,
                    lng: mv.lng,
                    time: mv.timestamp
                });
            }
        });

        res.json({
            success: true,
            data: {
                driverId: id,
                totalCount: violations.length,
                days: parseInt(days),
                grouped
            }
        });
    } catch (error) {
        console.error('Driver violations error:', error);
        res.status(500).json({ success: false, error: 'Server error' });
    }
});

// PUT /api/driver/bookings/:id/acknowledge
// Driver marks booking as "read/seen" (Okundu)
router.put('/bookings/:id/acknowledge', authMiddleware, ensureDriver, async (req, res) => {
    try {
        const { id } = req.params;
        const booking = await prisma.booking.findFirst({
            where: { id, driverId: req.user.id }
        });
        if (!booking) {
            return res.status(404).json({ success: false, error: 'Rezervasyon bulunamadı' });
        }
        const meta = booking.metadata || {};
        const updated = await prisma.booking.update({
            where: { id },
            data: {
                metadata: {
                    ...meta,
                    acknowledgedAt: new Date().toISOString(),
                    acknowledgedBy: req.user.id
                }
            }
        });
        const io = req.app.get('io');
        if (io) {
            io.to('admin_monitoring').emit('booking_acknowledged', {
                bookingId: id,
                driverId: req.user.id,
                driverName: req.user.fullName,
                acknowledgedAt: new Date().toISOString()
            });
            io.to(`user_${req.user.id}`).emit('booking_acknowledged', { bookingId: id });
        }
        res.json({ success: true, data: updated });
    } catch (error) {
        console.error('Acknowledge error:', error);
        res.status(500).json({ success: false, error: 'Server error' });
    }
});

// PUT /api/driver/bookings/:id/no-show
// Driver reports customer no-show with reason and optional photo
router.put('/bookings/:id/no-show', authMiddleware, ensureDriver, async (req, res) => {
    try {
        const { id } = req.params;
        const { reason, description, photo } = req.body;
        const booking = await prisma.booking.findFirst({
            where: { id, driverId: req.user.id }
        });
        if (!booking) {
            return res.status(404).json({ success: false, error: 'Rezervasyon bulunamadı' });
        }
        const meta = booking.metadata || {};
        const updated = await prisma.booking.update({
            where: { id },
            data: {
                status: 'NO_SHOW',
                metadata: {
                    ...meta,
                    noShowReason: reason,
                    noShowDescription: description || null,
                    noShowPhoto: photo || null,
                    noShowReportedAt: new Date().toISOString(),
                    noShowReportedBy: req.user.id
                }
            }
        });
        const io = req.app.get('io');
        if (io) {
            io.to('admin_monitoring').emit('booking_no_show', {
                bookingId: id,
                driverId: req.user.id,
                driverName: req.user.fullName,
                reason,
                description,
                reportedAt: new Date().toISOString()
            });
            io.to(`user_${req.user.id}`).emit('booking_status_update', { bookingId: id, status: 'NO_SHOW' });
        }
        res.json({ success: true, data: updated });
    } catch (error) {
        console.error('No-show error:', error);
        res.status(500).json({ success: false, error: 'Server error' });
    }
});

// POST /api/driver/emergency
// Driver reports an emergency (blocks new assignments)
router.post('/emergency', authMiddleware, ensureDriver, async (req, res) => {
    try {
        const { reason, description } = req.body;
        if (!reason) {
            return res.status(400).json({ success: false, error: 'Acil durum sebebi gerekli' });
        }
        const user = await prisma.user.findUnique({ where: { id: req.user.id } });
        const existingMeta = user.metadata || {};
        await prisma.user.update({
            where: { id: req.user.id },
            data: {
                metadata: {
                    ...existingMeta,
                    emergency: {
                        active: true,
                        reason,
                        description: description || null,
                        startedAt: new Date().toISOString()
                    }
                }
            }
        });
        const io = req.app.get('io');
        if (io) {
            io.to('admin_monitoring').emit('driver_emergency', {
                driverId: req.user.id,
                driverName: req.user.fullName,
                reason,
                description,
                startedAt: new Date().toISOString()
            });
        }
        res.json({ success: true, message: 'Acil durum bildirildi' });
    } catch (error) {
        console.error('Emergency report error:', error);
        res.status(500).json({ success: false, error: 'Server error' });
    }
});

// DELETE /api/driver/emergency
// Driver resolves emergency
router.delete('/emergency', authMiddleware, ensureDriver, async (req, res) => {
    try {
        const user = await prisma.user.findUnique({ where: { id: req.user.id } });
        const existingMeta = user.metadata || {};
        await prisma.user.update({
            where: { id: req.user.id },
            data: {
                metadata: {
                    ...existingMeta,
                    emergency: {
                        active: false,
                        resolvedAt: new Date().toISOString()
                    }
                }
            }
        });
        const io = req.app.get('io');
        if (io) {
            io.to('admin_monitoring').emit('driver_emergency_resolved', {
                driverId: req.user.id,
                driverName: req.user.fullName,
                resolvedAt: new Date().toISOString()
            });
        }
        res.json({ success: true, message: 'Acil durum kapatıldı' });
    } catch (error) {
        console.error('Emergency resolve error:', error);
        res.status(500).json({ success: false, error: 'Server error' });
    }
});

// GET /api/driver/emergency
// Check driver's emergency status
router.get('/emergency', authMiddleware, ensureDriver, async (req, res) => {
    try {
        const user = await prisma.user.findUnique({ where: { id: req.user.id } });
        const emergency = user.metadata?.emergency || { active: false };
        res.json({ success: true, data: emergency });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Server error' });
    }
});

module.exports = router;

