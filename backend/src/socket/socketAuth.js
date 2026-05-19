const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');
const env = require('../config/env');
const { isAdminUser, adminMonitoringRoom } = require('../utils/tenantScope');

async function authenticateSocketToken(rawToken) {
    const token = (rawToken && typeof rawToken === 'object') ? rawToken.token : rawToken;
    if (!token) {
        throw new Error('No token provided');
    }

    const decoded = jwt.verify(token, env.jwt.secret);

    const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        include: {
            role: true,
            tenant: { select: { id: true, slug: true, name: true, status: true } },
        },
    });

    if (!user || user.status !== 'ACTIVE') {
        throw new Error('User not found or inactive');
    }

    return user;
}

function joinUserRooms(socket, user) {
    socket.join(`user_${user.id}`);
    socket.join(`tenant_${user.tenantId}`);

    if (isAdminUser({ roleType: user.role?.type, roleCode: user.role?.code })) {
        socket.join(adminMonitoringRoom(user.tenantId));
        socket.join(`admin_live_support_${user.tenantId}`);
    }

    const isDriver = user.role?.type === 'DRIVER' || user.role?.type === 'PARTNER' || user.role?.code === 'DRIVER';
    if (isDriver) {
        socket.join(`drivers_${user.tenantId}`);
    }
}

module.exports = {
    authenticateSocketToken,
    joinUserRooms,
    isAdminUser,
    adminMonitoringRoom,
};
