const prisma = require('../lib/prisma');
const {
    authenticateSocketToken,
    joinUserRooms,
    isAdminUser,
    adminMonitoringRoom,
} = require('./socketAuth');
const { findBookingForTenant } = require('../utils/tenantScope');

const OFFLINE_TIMEOUT_MS = 3 * 60 * 1000;
const OFFLINE_CHECK_THRESHOLD_MS = 2 * 60 * 1000;

module.exports = (io, app) => {
    const onlineDrivers = {};
    const disconnectTimers = {};
    const driverConnectionLogs = {};
    const MAX_LOG_PER_DRIVER = 50;

    const logDriverEvent = (driverId, driverName, event, detail = {}) => {
        if (!driverConnectionLogs[driverId]) driverConnectionLogs[driverId] = [];
        const log = { event, driverName, ts: new Date().toISOString(), tsMs: Date.now(), ...detail };
        driverConnectionLogs[driverId].push(log);
        if (driverConnectionLogs[driverId].length > MAX_LOG_PER_DRIVER) {
            driverConnectionLogs[driverId].shift();
        }
        const tenantId = detail.tenantId;
        if (tenantId) {
            io.to(adminMonitoringRoom(tenantId)).emit('driver_connection_event', { driverId, driverName, ...log });
        }
    };

    if (app) app.set('onlineDrivers', onlineDrivers);
    if (app) app.set('driverConnectionLogs', driverConnectionLogs);
    if (app) app.set('logDriverEvent', logDriverEvent);

    const markDriverOffline = (driverId, fullName, tenantId) => {
        const driverData = onlineDrivers[driverId];
        const lastSeenAgo = driverData ? Math.round((Date.now() - driverData.lastSeen) / 1000) : null;
        logDriverEvent(driverId, fullName, 'OFFLINE', {
            reason: 'timeout_expired',
            lastSeenAgoSec: lastSeenAgo,
            hadSocket: !!driverData?.socketId,
            tenantId,
        });
        delete onlineDrivers[driverId];
        delete disconnectTimers[driverId];
        if (tenantId) {
            io.to(adminMonitoringRoom(tenantId)).emit('driver_offline', { driverId, driverName: fullName });
        }
        console.log(`[DriverHandler] Driver ${fullName} is now OFFLINE`);
    };

    const resetDriverTimeout = (driverId, fullName, tenantId) => {
        if (disconnectTimers[driverId]) {
            clearTimeout(disconnectTimers[driverId]);
        }

        disconnectTimers[driverId] = setTimeout(() => {
            const driverData = onlineDrivers[driverId];
            if (!driverData) return;

            const msSinceSeen = Date.now() - driverData.lastSeen;

            if (msSinceSeen > OFFLINE_CHECK_THRESHOLD_MS) {
                markDriverOffline(driverId, fullName, tenantId);
            } else {
                resetDriverTimeout(driverId, fullName, tenantId);
            }
        }, OFFLINE_TIMEOUT_MS);
    };

    if (app) app.set('resetDriverTimeout', resetDriverTimeout);

    io.on('connection', (socket) => {
        let currentUser = null;

        socket.on('authenticate', async (rawToken) => {
            try {
                const user = await authenticateSocketToken(rawToken);
                currentUser = user;
                joinUserRooms(socket, user);

                const isAdmin = isAdminUser({ roleType: user.role?.type, roleCode: user.role?.code });
                if (isAdmin) {
                    console.log(`[Socket] Admin ${user.email} joined tenant monitoring room`);
                }

                const isDriver = user.role?.type === 'DRIVER' || user.role?.type === 'PARTNER' || user.role?.code === 'DRIVER';
                if (isDriver) {
                    if (disconnectTimers[user.id]) {
                        clearTimeout(disconnectTimers[user.id]);
                        delete disconnectTimers[user.id];
                    }

                    onlineDrivers[user.id] = {
                        socketId: socket.id,
                        connectedAt: new Date(),
                        lastSeen: Date.now(),
                        location: null,
                        name: user.fullName,
                        tenantId: user.tenantId,
                    };

                    prisma.user.update({
                        where: { id: user.id },
                        data: { lastSeenAt: new Date() }
                    }).catch(err => console.error('[DriverHandler] Connect DB update failed', err));

                    logDriverEvent(user.id, user.fullName, 'SOCKET_CONNECT', {
                        socketId: socket.id,
                        tenantId: user.tenantId,
                    });

                    io.to(adminMonitoringRoom(user.tenantId)).emit('driver_online', {
                        driverId: user.id,
                        driverName: user.fullName,
                        socketId: socket.id,
                        avatar: user.avatar
                    });
                }

                socket.emit('authenticated', { success: true, user: { id: user.id, name: user.fullName } });
            } catch (err) {
                console.error('[DriverHandler] Socket auth error:', err.message);
                socket.emit('error', {
                    message: err.name === 'TokenExpiredError'
                        ? 'Token expired — please refresh via /auth/refresh'
                        : 'Authentication failed: ' + err.message,
                    code: err.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'AUTH_FAILED',
                });
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
                onlineDrivers[currentUser.id].lastSeen = Date.now();
            }

            io.to(adminMonitoringRoom(currentUser.tenantId)).emit('driver_location', {
                driverId: currentUser.id,
                driverName: currentUser.fullName,
                tenantId: currentUser.tenantId,
                ...data,
                timestamp: new Date()
            });
        });

        socket.on('ping_keepalive', () => {
            if (currentUser && onlineDrivers[currentUser.id]) {
                onlineDrivers[currentUser.id].lastSeen = Date.now();
                onlineDrivers[currentUser.id].socketId = socket.id;
                if (disconnectTimers[currentUser.id]) {
                    clearTimeout(disconnectTimers[currentUser.id]);
                    delete disconnectTimers[currentUser.id];
                }
            }
            socket.emit('pong_keepalive', { ts: Date.now() });
        });

        socket.on('join_booking', async (bookingId) => {
            if (!currentUser) {
                socket.emit('error', { message: 'Authentication required to join booking room' });
                return;
            }

            const booking = await findBookingForTenant(bookingId, currentUser.tenantId);
            if (!booking) {
                socket.emit('error', { message: 'Booking not found or access denied' });
                return;
            }

            const canJoin =
                isAdminUser({ roleType: currentUser.role?.type, roleCode: currentUser.role?.code }) ||
                booking.driverId === currentUser.id ||
                booking.customerId === currentUser.id;

            if (!canJoin) {
                socket.emit('error', { message: 'Not authorized for this booking' });
                return;
            }

            socket.join(`booking_${bookingId}`);
        });

        socket.on('disconnect', (reason) => {
            if (currentUser && onlineDrivers[currentUser.id]) {
                const driverId = currentUser.id;
                const fullName = currentUser.fullName;
                const tenantId = currentUser.tenantId;

                logDriverEvent(driverId, fullName, 'SOCKET_DISCONNECT', {
                    reason: reason || 'unknown',
                    socketId: socket.id,
                    tenantId,
                });

                onlineDrivers[driverId].socketId = null;
                onlineDrivers[driverId].lastSeen = Date.now();

                prisma.user.update({
                    where: { id: driverId },
                    data: { lastSeenAt: new Date() }
                }).catch(err => console.error('[DriverHandler] Disconnect DB update failed', err));

                resetDriverTimeout(driverId, fullName, tenantId);
            }
        });
    });
};
