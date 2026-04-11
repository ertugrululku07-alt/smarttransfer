
const prisma = require('../lib/prisma');
const jwt = require('jsonwebtoken');

const { JWT_SECRET } = require('../middleware/auth');

const OFFLINE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes — generous for background sync delays
const OFFLINE_CHECK_THRESHOLD_MS = 28 * 60 * 1000; // 28 minutes - if lastSeen is within this, they're still online

module.exports = (io, app) => {
    // Online drivers map: { userId: { socketId, connectedAt, lastSeen (timestamp ms), location, name } }
    const onlineDrivers = {};
    const disconnectTimers = {}; // Track timeout IDs for delayed disconnection
    if (app) app.set('onlineDrivers', onlineDrivers);

    const markDriverOffline = (driverId, fullName) => {
        delete onlineDrivers[driverId];
        delete disconnectTimers[driverId];
        io.to('admin_monitoring').emit('driver_offline', {
            driverId,
            driverName: fullName
        });
        console.log(`[DriverHandler] Driver ${fullName} is now OFFLINE`);
    };

    // Called both from socket disconnect and from REST /api/driver/sync
    // Clears existing timer, sets a new 20-min timer
    // When it fires, checks IF the lastSeen is stale before actually marking offline
    const resetDriverTimeout = (driverId, fullName) => {
        if (disconnectTimers[driverId]) {
            clearTimeout(disconnectTimers[driverId]);
        }

        disconnectTimers[driverId] = setTimeout(() => {
            const driverData = onlineDrivers[driverId];
            if (!driverData) return; // Already removed

            const lastSeenMs = driverData.lastSeen; // Numeric timestamp
            const msSinceSeen = Date.now() - lastSeenMs;

            console.log(`[DriverHandler] Timer fired for ${fullName}. Last seen ${Math.round(msSinceSeen / 1000)}s ago. Threshold: ${OFFLINE_CHECK_THRESHOLD_MS / 1000}s`);

            if (msSinceSeen > OFFLINE_CHECK_THRESHOLD_MS) {
                // Truly offline - no ping for >= 19 minutes
                markDriverOffline(driverId, fullName);
            } else {
                // They pinged recently! Reset the timer again for another 20 mins
                console.log(`[DriverHandler] ${fullName} pinged recently, resetting timer`);
                resetDriverTimeout(driverId, fullName);
            }
        }, OFFLINE_TIMEOUT_MS);
    };

    if (app) app.set('resetDriverTimeout', resetDriverTimeout);

    io.on('connection', (socket) => {
        let currentUser = null;

        socket.on('authenticate', async (token) => {
            try {
                const decoded = jwt.verify(token, JWT_SECRET);
                const user = await prisma.user.findUnique({
                    where: { id: decoded.userId },
                    include: { role: true }
                });

                if (user) {
                    currentUser = user;
                    socket.join(`user_${user.id}`);

                    const isAdmin = ['ADMIN', 'AGENCY_ADMIN', 'DISPATCHER', 'TENANT_ADMIN', 'SUPER_ADMIN'].includes(user.role?.type) ||
                        ['ADMIN', 'OPERATION', 'SUPER_ADMIN'].includes(user.role?.code);

                    if (isAdmin) {
                        socket.join('admin_monitoring');
                        console.log(`[DriverHandler] Admin ${user.email} joined admin_monitoring`);
                    }

                    const isDriver = user.role?.type === 'DRIVER' || user.role?.type === 'PARTNER' || user.role?.code === 'DRIVER';
                    if (isDriver) {
                        socket.join('drivers');

                        // Clear any pending offline timer - driver is back online
                        if (disconnectTimers[user.id]) {
                            clearTimeout(disconnectTimers[user.id]);
                            delete disconnectTimers[user.id];
                        }

                        onlineDrivers[user.id] = {
                            socketId: socket.id,
                            connectedAt: new Date(),
                            lastSeen: Date.now(), // *** Store as numeric ms timestamp ***
                            location: null,
                            name: user.fullName
                        };

                        io.to('admin_monitoring').emit('driver_online', {
                            driverId: user.id,
                            driverName: user.fullName,
                            socketId: socket.id,
                            avatar: user.avatar
                        });
                        console.log(`[DriverHandler] Driver ${user.email} connected via socket`);
                    }

                    socket.emit('authenticated', { success: true, user: { id: user.id, name: user.fullName } });
                } else {
                    socket.emit('error', { message: 'User not found' });
                }
            } catch (err) {
                console.error('[DriverHandler] Socket auth error:', err.message);
                socket.emit('error', { message: 'Authentication failed: ' + err.message });
            }
        });

        socket.on('driver_location_update', (data) => {
            if (!currentUser) return;

            if (onlineDrivers[currentUser.id]) {
                onlineDrivers[currentUser.id].location = {
                    lat: data.lat,
                    lng: data.lng,
                    speed: data.speed,
                    heading: data.heading,
                    ts: new Date()
                };
                onlineDrivers[currentUser.id].lastSeen = Date.now(); // *** Numeric ms ***
            }

            io.to('admin_monitoring').emit('driver_location', {
                driverId: currentUser.id,
                driverName: currentUser.fullName,
                ...data,
                timestamp: new Date()
            });
        });

        // Keep-alive ping from driver app — respond with pong + refresh lastSeen
        socket.on('ping_keepalive', (data) => {
            if (currentUser && onlineDrivers[currentUser.id]) {
                onlineDrivers[currentUser.id].lastSeen = Date.now();
                onlineDrivers[currentUser.id].socketId = socket.id;
                // Reset the offline timer since driver is clearly alive
                if (disconnectTimers[currentUser.id]) {
                    clearTimeout(disconnectTimers[currentUser.id]);
                    delete disconnectTimers[currentUser.id];
                }
            }
            // Reply so client knows connection is truly alive (not zombie)
            socket.emit('pong_keepalive', { ts: Date.now() });
        });

        socket.on('join_booking', (bookingId) => {
            socket.join(`booking_${bookingId}`);
        });

        socket.on('disconnect', () => {
            if (currentUser && onlineDrivers[currentUser.id]) {
                const driverId = currentUser.id;
                const fullName = currentUser.fullName;

                // Keep them "online" but mark socket as gone
                onlineDrivers[driverId].socketId = null;
                onlineDrivers[driverId].lastSeen = Date.now(); // *** Numeric ms ***

                console.log(`[DriverHandler] Driver ${fullName} socket disconnected. Starting 20-min background timer...`);
                resetDriverTimeout(driverId, fullName);
            }
        });
    });
};
