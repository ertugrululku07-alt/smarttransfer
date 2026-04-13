const express = require('express');
const router = express.Router();

const prisma = require('../lib/prisma');
const { authMiddleware } = require('../middleware/auth');

// GET /api/messages
// Get conversation with another user or generic list
router.get('/', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        const { contactId, bookingId } = req.query;

        if (contactId) {
            let whereClause = {
                OR: [
                    { senderId: userId, receiverId: contactId },
                    { senderId: contactId, receiverId: userId }
                ],
                ...(bookingId ? { bookingId } : {})
            };

            // If the user is a driver/partner, they are talking to the "Operations Center" as a whole.
            // Ignore the specific admin contactId and fetch ALL their messages.
            if (req.user.roleCode === 'DRIVER' || req.user.roleType === 'DRIVER' || req.user.roleType === 'PARTNER') {
                whereClause = {
                    OR: [
                        { senderId: userId },
                        { receiverId: userId }
                    ],
                    ...(bookingId ? { bookingId } : {})
                };
            } else {
                // If it's an admin/dispatcher checking a driver's messages, they should see ALL of the driver's messages
                // because drivers send messages to the system generally, not strict point-to-point.
                const isAdmin = ['ADMIN', 'AGENCY_ADMIN', 'DISPATCHER', 'TENANT_ADMIN', 'SUPER_ADMIN', 'PLATFORM_OPS'].includes(req.user.roleType) ||
                    ['ADMIN', 'OPERATION', 'SUPER_ADMIN'].includes(req.user.roleCode);

                if (isAdmin) {
                    whereClause.OR = [
                        { senderId: contactId },
                        { receiverId: contactId }
                    ];
                }
            }

            // Fetch conversation with specific user (or all admins for drivers)
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

        // List all messages for inbox (ordered asc for display)
        const messages = await prisma.message.findMany({
            where: {
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

// POST /api/messages
// Send a message
router.post('/', authMiddleware, async (req, res) => {
    try {
        const senderId = req.user.id;
        const { receiverId, bookingId, content, format } = req.body;

        if (!receiverId || !content) {
            return res.status(400).json({ success: false, error: 'receiverId and content are required' });
        }

        // Validate receiver exists
        const receiver = await prisma.user.findUnique({ where: { id: receiverId } });
        if (!receiver) {
            return res.status(404).json({ success: false, error: 'Receiver not found' });
        }

        const message = await prisma.message.create({
            data: {
                tenantId: req.user.tenantId || receiver.tenantId,
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

        // Emit socket event only to the RECEIVER
        // (sender gets message from HTTP response, emitting to sender causes race conditions)
        const io = req.app.get('io');
        if (io) {
            io.to(`user_${receiverId}`).emit('new_message', message);

            // If sender is a driver/partner, also broadcast to all admins so they see the live message
            if (req.user.roleCode === 'DRIVER' || req.user.roleType === 'DRIVER' || req.user.roleType === 'PARTNER') {
                io.to('admin_monitoring').emit('new_message', message);
            }
        }

        // Try to send an Expo remote Push Notification to the receiver
        try {
            let receiverMeta = receiver?.metadata || {};
            if (typeof receiverMeta === 'string') {
                try { receiverMeta = JSON.parse(receiverMeta); } catch (e) { receiverMeta = {}; }
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

                // Fire and forget — don't await to avoid delaying HTTP response
                fetch('https://exp.host/--/api/v2/push/send', {
                    method: 'POST',
                    headers: {
                        'Accept': 'application/json',
                        'Accept-encoding': 'gzip, deflate',
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(pushPayload),
                }).then(() => console.log(`Push sent to ${pushToken}`))
                  .catch(e => console.error('Push error:', e.message));
                console.log(`Push notification queued for ${pushToken}`);
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

// PUT /api/messages/:id/read
router.put('/:id/read', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
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
