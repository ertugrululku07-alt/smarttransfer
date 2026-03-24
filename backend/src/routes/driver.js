const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
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
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

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
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

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

        res.json({ success: true, data: bookings });
    } catch (error) {
        console.error('Driver bookings error:', error);
        res.status(500).json({ success: false, error: 'Server error', details: error.message });
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
        }

        res.json({ success: true, data: booking });
    } catch (error) {
        console.error('Update status error:', error);
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

        // 1b. Update Location via Socket to Admin (real-time)
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
router.get('/online', async (req, res) => {
    try {
        const onlineDrivers = req.app.get('onlineDrivers') || {};

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

        // Map personnel to the driver format the frontend expects
        const result = personnel.map(p => {
            const userId = p.userId || p.id;
            const inMemory = onlineDrivers[userId];
            const location = inMemory?.location ||
                (p.user?.lastLocationLat && p.user?.lastLocationLng
                    ? { lat: p.user.lastLocationLat, lng: p.user.lastLocationLng, speed: p.user.lastLocationSpeed }
                    : null);
            return {
                id: userId,
                personnelId: p.id,
                firstName: p.firstName,
                lastName: p.lastName,
                fullName: `${p.firstName} ${p.lastName}`,
                avatar: p.photo || p.user?.avatar || null,
                jobTitle: p.jobTitle,
                department: p.department,
                lastSeenAt: p.user?.lastSeenAt || null,
                lastLoginAt: p.user?.lastLoginAt || null,
                location,
                socketId: inMemory?.socketId || null,
                connectedAt: inMemory?.connectedAt || p.user?.lastSeenAt || null,
                role: { type: 'DRIVER', code: 'DRIVER' }
            };
        });

        res.json({ success: true, data: result });
    } catch (error) {
        console.error('Online drivers error:', error);
        res.status(500).json({ success: false, error: 'Server error' });
    }
});



module.exports = router;

