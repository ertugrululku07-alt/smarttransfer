const express = require('express');
const router = express.Router();

const prisma = require('../lib/prisma');
const { authMiddleware } = require('../middleware/auth');
const { requireTenantId, findMessageForTenant, isAdminUser } = require('../utils/tenantScope');

router.get('/', authMiddleware, async (req, res) => {
    try {
        const tenantId = requireTenantId(req, res);
        if (!tenantId) return;

        const userId = req.user.id;
        const { contactId, bookingId } = req.query;

        if (contactId) {
            let whereClause = {
                tenantId,
                OR: [
                    { senderId: userId, receiverId: contactId },
                    { senderId: contactId, receiverId: userId }
                ],
                ...(bookingId ? { bookingId } : {})
            };

            if (req.user.roleCode === 'DRIVER' || req.user.roleType === 'DRIVER' || req.user.roleType === 'PARTNER') {
                whereClause = {
                    tenantId,
                    OR: [
                        { senderId: userId },
                        { receiverId: userId }
                    ],
                    ...(bookingId ? { bookingId } : {})
                };
            } else if (isAdminUser(req.user)) {
                const contact = await prisma.user.findFirst({
                    where: { id: contactId, tenantId },
                    select: { id: true }
                });
                if (!contact) {
                    return res.status(404).json({ success: false, error: 'Contact not found' });
                }
                whereClause = {
                    tenantId,
                    OR: [
                        { senderId: contactId },
                        { receiverId: contactId }
                    ],
                    ...(bookingId ? { bookingId } : {})
                };
            }

            const messages = await prisma.message.findMany({
                where: whereClause,
                orderBy: { createdAt: 'asc' },
                include: {
                    sender: { select: { id: true, firstName: true, lastName: true, avatar: true } },
                    receiver: { select: { id: true, firstName: true, lastName: true, avatar: true } }
                }
            });
            return res.json({ success: true, data: messages });
        }

        const messages = await prisma.message.findMany({
            where: {
                tenantId,
                OR: [
                    { senderId: userId },
                    { receiverId: userId }
                ]
            },
            orderBy: { createdAt: 'asc' },
            include: {
                sender: { select: { id: true, firstName: true, lastName: true, avatar: true } },
                receiver: { select: { id: true, firstName: true, lastName: true, avatar: true } }
            }
        });

        res.json({ success: true, data: messages });
    } catch (error) {
        console.error('Messages list error:', error);
        res.status(500).json({ success: false, error: 'Server error' });
    }
});

router.post('/', authMiddleware, async (req, res) => {
    try {
        const tenantId = requireTenantId(req, res);
        if (!tenantId) return;

        const senderId = req.user.id;
        const { receiverId, bookingId, content, format } = req.body;

        if (!receiverId || !content) {
            return res.status(400).json({ success: false, error: 'receiverId and content are required' });
        }

        const receiver = await prisma.user.findFirst({
            where: { id: receiverId, tenantId },
        });
        if (!receiver) {
            return res.status(404).json({ success: false, error: 'Receiver not found' });
        }

        const message = await prisma.message.create({
            data: {
                tenantId,
                senderId,
                receiverId,
                bookingId: bookingId || null,
                content,
                format: format || 'TEXT'
            },
            include: {
                sender: { select: { id: true, firstName: true, lastName: true, avatar: true } },
                receiver: { select: { id: true, firstName: true, lastName: true, avatar: true } }
            }
        });

        const io = req.app.get('io');
        if (io) {
            io.to(`user_${receiverId}`).emit('new_message', message);

            if (req.user.roleCode === 'DRIVER' || req.user.roleType === 'DRIVER' || req.user.roleType === 'PARTNER') {
                io.to(`admin_monitoring_${tenantId}`).emit('new_message', message);
            }
        }

        try {
            let receiverMeta = receiver?.metadata || {};
            if (typeof receiverMeta === 'string') {
                try { receiverMeta = JSON.parse(receiverMeta); } catch { receiverMeta = {}; }
            }

            const pushToken = receiver?.pushToken || receiverMeta?.expoPushToken;

            if (pushToken && pushToken.startsWith('ExponentPushToken')) {
                const pushPayload = {
                    to: pushToken,
                    title: '💬 Yeni Mesaj',
                    body: format === 'IMAGE' ? '📷 Fotoğraf gönderdi' : format === 'AUDIO' ? '🎤 Ses kaydı gönderdi' : content,
                    sound: 'default',
                    priority: 'high',
                    ttl: 60,
                    channelId: 'messages',
                    data: {
                        type: 'chatMessage',
                        senderId: senderId,
                        messageId: message.id
                    }
                };

                fetch('https://exp.host/--/api/v2/push/send', {
                    method: 'POST',
                    headers: {
                        'Accept': 'application/json',
                        'Accept-encoding': 'gzip, deflate',
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(pushPayload),
                }).catch(e => console.error('Push error:', e.message));
            }
        } catch (pushErr) {
            console.error('Message push notification error (non-fatal):', pushErr.message);
        }

        res.json({ success: true, data: message });
    } catch (error) {
        console.error('Send message error:', error);
        res.status(500).json({ success: false, error: 'Server error', details: error.message });
    }
});

router.put('/:id/read', authMiddleware, async (req, res) => {
    try {
        const tenantId = requireTenantId(req, res);
        if (!tenantId) return;

        const { id } = req.params;
        const existing = await findMessageForTenant(id, tenantId);
        if (!existing) {
            return res.status(404).json({ success: false, error: 'Message not found' });
        }

        if (existing.receiverId !== req.user.id && !isAdminUser(req.user)) {
            return res.status(403).json({ success: false, error: 'Not authorized to mark this message as read' });
        }

        const message = await prisma.message.update({
            where: { id },
            data: { isRead: true, readAt: new Date() }
        });
        res.json({ success: true, data: message });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Server error' });
    }
});

module.exports = router;
