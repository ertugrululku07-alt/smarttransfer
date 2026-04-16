const prisma = require('../lib/prisma');
const axios = require('axios');

// n8n Webhook URL
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || 'https://n8n-production-0e284.up.railway.app/webhook/live-chat';

module.exports = (io, app) => {
    io.on('connection', (socket) => {

        // === MÜŞTERİ YÜZÜ ===

        // Müşteri bir sohbet odasına katılır
        socket.on('chat:join', async (data) => {
            const { sessionId, tenantId } = data;
            if (sessionId) {
                socket.join(sessionId);
                
                // Send chat history back to user
                try {
                    const history = await prisma.chatMessage.findMany({
                        where: { sessionId },
                        orderBy: { createdAt: 'asc' }
                    });
                    socket.emit('chat:history', history);
                    
                    const session = await prisma.chatSession.findUnique({
                        where: { id: sessionId }
                    });
                    if (session) {
                        socket.emit('chat:status', session.status);
                    }
                } catch (err) {
                    console.error("Chat history fetch error:", err);
                }
            }
        });

        // Müşteri mesaj gönderdiğinde
        socket.on('chat:send_message', async (data) => {
            const { sessionId, tenantId, content } = data;
            if (!sessionId || !content) return;

            try {
                // Check session status
                let session = await prisma.chatSession.findUnique({ where: { id: sessionId } });
                
                // Create session if it doesn't exist
                if (!session) {
                    session = await prisma.chatSession.create({
                        data: {
                            id: sessionId,
                            tenantId: tenantId || 'default',
                            status: 'BOT'
                        }
                    });
                }

                // Save message to DB
                const savedMsg = await prisma.chatMessage.create({
                    data: {
                        sessionId,
                        sender: 'USER',
                        content
                    }
                });

                // Echo back to room so other tabs of the user see it
                io.to(sessionId).emit('chat:receive', savedMsg);

                if (session.status === 'BOT') {
                    // Forward via HTTP to n8n webhook
                    try {
                        axios.post(N8N_WEBHOOK_URL, {
                            sessionId,
                            tenantId,
                            message: content
                        }).catch(err => {
                            console.error('Failed to trigger n8n, maybe it is down:', err.message);
                        });
                    } catch (e) {
                        console.error('n8n webhook error', e);
                    }
                } else if (session.status === 'HUMAN') {
                    // Forward directly to connected admins
                    io.to('admin_live_support').emit('chat:admin_receive', savedMsg);
                }

            } catch (err) {
                console.error('chat:send_message error', err);
            }
        });

        // Müşteri veya AI canlı temsilci isterse
        socket.on('chat:request_human', async (data) => {
            const { sessionId } = data;
            try {
                await prisma.chatSession.update({
                    where: { id: sessionId },
                    data: { status: 'HUMAN' }
                });
                io.to(sessionId).emit('chat:status', 'HUMAN');
                io.to('admin_live_support').emit('chat:request_human', { sessionId, message: "Müşteri canlı desteğe bağlanmak istiyor." });
            } catch (err) {
                console.error(err);
            }
        });

        // === YÖNETİM PANELİ YÜZÜ ===

        // Admin sayfaya girince live support odasına katılır
        socket.on('admin:join_live_support', () => {
            socket.join('admin_live_support');
        });

        // Admin bir spesifik chat'e yanıt yazmak için odaya katılır
        socket.on('admin:join_chat', (data) => {
            const { sessionId } = data;
            if (sessionId) {
                socket.join(sessionId);
            }
        });

        // Admin mesaj gönderdiğinde
        socket.on('admin:send_message', async (data) => {
            const { sessionId, content } = data;
            try {
                const savedMsg = await prisma.chatMessage.create({
                    data: {
                        sessionId,
                        sender: 'ADMIN',
                        content
                    }
                });
                // Send to user
                io.to(sessionId).emit('chat:receive', savedMsg);
                // Send back to all admins observing this chat
                io.to('admin_live_support').emit('chat:admin_receive', savedMsg);
            } catch (err) {
                console.error(err);
            }
        });

        // Admin chat'i kapatır
        socket.on('admin:close_chat', async (data) => {
            const { sessionId } = data;
            try {
                await prisma.chatSession.update({
                    where: { id: sessionId },
                    data: { status: 'CLOSED' }
                });
                io.to(sessionId).emit('chat:status', 'CLOSED');
                io.to('admin_live_support').emit('chat:admin_close', { sessionId });
            } catch (err) {
                console.error(err);
            }
        });

    });
};
