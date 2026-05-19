const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const env = require('../config/env');
const { authMiddleware } = require('../middleware/auth');
const { requireTenantId, requireAdmin } = require('../utils/tenantScope');

router.get('/sessions', authMiddleware, async (req, res) => {
    try {
        const tenantId = requireTenantId(req, res);
        if (!tenantId) return;
        if (!requireAdmin(req, res)) return;

        const sessions = await prisma.chatSession.findMany({
            where: {
                tenantId,
                status: { in: ['HUMAN', 'BOT'] }
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

const n8nWebhookAuth = (req, res, next) => {
    const secret = env.security.n8nWebhookSecret;
    if (!secret) {
        return res.status(503).json({ success: false, error: 'N8N webhook not configured' });
    }
    const provided = req.headers['x-webhook-secret'] || req.headers['x-n8n-secret'];
    if (provided !== secret) {
        return res.status(401).json({ success: false, error: 'Unauthorized webhook' });
    }
    next();
};

router.post('/n8n-response', n8nWebhookAuth, async (req, res) => {
    try {
        const { sessionId, message, handoff } = req.body;

        if (!sessionId || !message) {
            return res.status(400).json({ success: false, error: 'sessionId and message are required' });
        }

        const session = await prisma.chatSession.findUnique({ where: { id: sessionId } });
        if (!session) {
            return res.status(404).json({ success: false, error: 'Session not found' });
        }

        const savedMessage = await prisma.chatMessage.create({
            data: { sessionId, sender: 'BOT', content: message }
        });

        if (global.io) {
            global.io.to(sessionId).emit('chat:receive', savedMessage);
        }

        if (handoff) {
            await prisma.chatSession.update({
                where: { id: sessionId },
                data: { status: 'HUMAN' }
            });

            if (global.io) {
                global.io.to(`admin_live_support_${session.tenantId}`).emit('chat:request_human', {
                    sessionId,
                    message: 'A customer sequence requires human intervention.'
                });
            }
        }

        return res.json({ success: true, message: 'Response relayed' });
    } catch (error) {
        console.error('n8n response error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

router.get('/sessions/:id/messages', authMiddleware, async (req, res) => {
    try {
        const tenantId = requireTenantId(req, res);
        if (!tenantId) return;
        if (!requireAdmin(req, res)) return;

        const session = await prisma.chatSession.findFirst({
            where: { id: req.params.id, tenantId }
        });
        if (!session) {
            return res.status(404).json({ success: false, error: 'Session not found' });
        }

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
