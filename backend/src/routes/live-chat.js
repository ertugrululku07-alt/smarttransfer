const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const { authMiddleware } = require('../middleware/auth');

// Admin: Get active chat sessions
router.get('/sessions', authMiddleware, async (req, res) => {
    try {
        const sessions = await prisma.chatSession.findMany({
            where: {
                status: { in: ['HUMAN', 'BOT'] } // Active sessions
            },
            include: {
                messages: {
                    orderBy: { createdAt: 'desc' },
                    take: 1
                }
            },
            orderBy: { updatedAt: 'desc' }
        });
        res.json({ success: true, sessions });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// n8n Webhook'unun çağıracağı endpoint
router.post('/n8n-response', async (req, res) => {
    try {
        const { sessionId, message, handoff } = req.body;

        if (!sessionId || !message) {
            return res.status(400).json({ success: false, error: 'sessionId and message are required' });
        }

        const session = await prisma.chatSession.findUnique({
            where: { id: sessionId }
        });

        if (!session) {
            return res.status(404).json({ success: false, error: 'Session not found' });
        }

        // Save AI message to DB
        const savedMessage = await prisma.chatMessage.create({
            data: {
                sessionId,
                sender: 'BOT',
                content: message
            }
        });

        // Trigger websocket event via global.io (set in index.js)
        if (global.io) {
            global.io.to(sessionId).emit('chat:receive', savedMessage);
        }

        // If AI indicates handoff to human
        if (handoff) {
            await prisma.chatSession.update({
                where: { id: sessionId },
                data: { status: 'HUMAN' }
            });

            // Alert admins
            if (global.io) {
                global.io.to('admin_live_support').emit('chat:request_human', {
                    sessionId,
                    message: "A customer sequence requires human intervention."
                });
            }
        }

        return res.json({ success: true, message: 'Response relayed' });
    } catch (error) {
        console.error('n8n response error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Admin: Get history for a session
router.get('/sessions/:id/messages', authMiddleware, async (req, res) => {
    try {
        const messages = await prisma.chatMessage.findMany({
            where: { sessionId: req.params.id },
            orderBy: { createdAt: 'asc' }
        });
        res.json({ success: true, messages });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
