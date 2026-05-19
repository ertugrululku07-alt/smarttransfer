const prisma = require('../lib/prisma');
const axios = require('axios');
const env = require('../config/env');
const { authenticateSocketToken, joinUserRooms, isAdminUser } = require('./socketAuth');

const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL;

module.exports = (io, app) => {
    io.on('connection', (socket) => {
        let currentUser = null;

        socket.on('authenticate', async (rawToken) => {
            try {
                const user = await authenticateSocketToken(rawToken);
                currentUser = user;
                joinUserRooms(socket, user);
                socket.emit('authenticated', { success: true });
            } catch (err) {
                socket.emit('error', { message: 'Authentication failed' });
            }
        });

        socket.on('chat:join', async (data) => {
            const { sessionId, tenantId } = data || {};
            if (!sessionId) return;

            const session = await prisma.chatSession.findUnique({ where: { id: sessionId } });
            if (!session) return;

            if (tenantId && session.tenantId && session.tenantId !== tenantId) return;

            socket.join(sessionId);

            try {
                const history = await prisma.chatMessage.findMany({
                    where: { sessionId },
                    orderBy: { createdAt: 'asc' }
                });
                socket.emit('chat:history', history);
                socket.emit('chat:status', session.status);
            } catch (err) {
                console.error('Chat history fetch error:', err);
            }
        });

        socket.on('chat:send_message', async (data) => {
            const { sessionId, tenantId, content } = data || {};
            if (!sessionId || !content) return;

            try {
                let session = await prisma.chatSession.findUnique({ where: { id: sessionId } });

                if (!session) {
                    if (!tenantId) return;
                    session = await prisma.chatSession.create({
                        data: { id: sessionId, tenantId, status: 'BOT' }
                    });
                }

                const savedMsg = await prisma.chatMessage.create({
                    data: { sessionId, sender: 'USER', content }
                });

                io.to(sessionId).emit('chat:receive', savedMsg);

                if (session.status === 'BOT' && N8N_WEBHOOK_URL) {
                    axios.post(N8N_WEBHOOK_URL, { sessionId, tenantId: session.tenantId, message: content })
                        .catch(err => console.error('n8n webhook error:', err.message));
                } else if (session.status === 'HUMAN') {
                    io.to(`admin_live_support_${session.tenantId}`).emit('chat:admin_receive', savedMsg);
                }
            } catch (err) {
                console.error('chat:send_message error', err);
            }
        });

        socket.on('chat:request_human', async (data) => {
            const { sessionId } = data || {};
            try {
                const session = await prisma.chatSession.findUnique({ where: { id: sessionId } });
                if (!session) return;

                await prisma.chatSession.update({ where: { id: sessionId }, data: { status: 'HUMAN' } });
                io.to(sessionId).emit('chat:status', 'HUMAN');
                io.to(`admin_live_support_${session.tenantId}`).emit('chat:request_human', {
                    sessionId,
                    message: 'Müşteri canlı desteğe bağlanmak istiyor.'
                });
            } catch (err) {
                console.error(err);
            }
        });

        socket.on('admin:join_live_support', async (rawToken) => {
            try {
                const user = rawToken ? await authenticateSocketToken(rawToken) : currentUser;
                if (!user || !isAdminUser({ roleType: user.role?.type, roleCode: user.role?.code })) {
                    socket.emit('error', { message: 'Admin authentication required' });
                    return;
                }
                currentUser = user;
                joinUserRooms(socket, user);
            } catch {
                socket.emit('error', { message: 'Admin authentication required' });
            }
        });

        socket.on('admin:join_chat', async (data) => {
            if (!currentUser || !isAdminUser({ roleType: currentUser.role?.type, roleCode: currentUser.role?.code })) {
                socket.emit('error', { message: 'Admin authentication required' });
                return;
            }
            const { sessionId } = data || {};
            if (sessionId) socket.join(sessionId);
        });

        socket.on('admin:send_message', async (data) => {
            if (!currentUser || !isAdminUser({ roleType: currentUser.role?.type, roleCode: currentUser.role?.code })) {
                socket.emit('error', { message: 'Admin authentication required' });
                return;
            }

            const { sessionId, content } = data || {};
            try {
                const session = await prisma.chatSession.findUnique({ where: { id: sessionId } });
                if (!session || session.tenantId !== currentUser.tenantId) return;

                const savedMsg = await prisma.chatMessage.create({
                    data: { sessionId, sender: 'ADMIN', content }
                });
                io.to(sessionId).emit('chat:receive', savedMsg);
                io.to(`admin_live_support_${session.tenantId}`).emit('chat:admin_receive', savedMsg);
            } catch (err) {
                console.error(err);
            }
        });

        socket.on('admin:close_chat', async (data) => {
            if (!currentUser || !isAdminUser({ roleType: currentUser.role?.type, roleCode: currentUser.role?.code })) {
                socket.emit('error', { message: 'Admin authentication required' });
                return;
            }

            const { sessionId } = data || {};
            try {
                const session = await prisma.chatSession.findUnique({ where: { id: sessionId } });
                if (!session || session.tenantId !== currentUser.tenantId) return;

                await prisma.chatSession.update({ where: { id: sessionId }, data: { status: 'CLOSED' } });
                io.to(sessionId).emit('chat:status', 'CLOSED');
                io.to(`admin_live_support_${session.tenantId}`).emit('chat:admin_close', { sessionId });
            } catch (err) {
                console.error(err);
            }
        });
    });
};
