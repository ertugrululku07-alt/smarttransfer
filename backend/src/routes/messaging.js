/**
 * Bulk Messaging Routes - Email & WhatsApp Campaigns
 * Prefix: /api/messaging
 */

const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const { getTransporter, renderTemplate } = require('../lib/emailService');
const { sendWhatsAppMessage, normalizePhone } = require('../lib/whatsappService');

// Auth middleware
const { authMiddleware } = require('../middleware/auth');
const adminMiddleware = (req, res, next) => {
    if (!req.user || !['SUPER_ADMIN', 'ADMIN', 'MANAGER'].includes(req.user.role?.name || req.user.roleName)) {
        return res.status(403).json({ success: false, error: 'Yetkisiz erişim' });
    }
    next();
};

// ============================================================================
// TEMPLATES
// ============================================================================

// GET /api/messaging/templates - List all templates
router.get('/templates', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { channel, category } = req.query;
        const where = { tenantId: req.user.tenantId };
        if (channel) where.channel = channel;
        if (category) where.category = category;

        const templates = await prisma.messageTemplate.findMany({
            where,
            orderBy: { createdAt: 'desc' }
        });

        res.json({ success: true, data: templates });
    } catch (error) {
        console.error('List templates error:', error);
        res.status(500).json({ success: false, error: 'Sunucu hatası' });
    }
});

// POST /api/messaging/templates - Create template
router.post('/templates', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { name, category, channel, subject, body, thumbnail } = req.body;
        if (!name || !channel || !body) {
            return res.status(400).json({ success: false, error: 'Ad, kanal ve içerik zorunludur' });
        }

        const template = await prisma.messageTemplate.create({
            data: {
                tenantId: req.user.tenantId,
                name,
                category: category || 'custom',
                channel,
                subject: subject || null,
                body,
                thumbnail: thumbnail || null,
            }
        });

        res.json({ success: true, data: template });
    } catch (error) {
        console.error('Create template error:', error);
        res.status(500).json({ success: false, error: 'Sunucu hatası' });
    }
});

// PUT /api/messaging/templates/:id - Update template
router.put('/templates/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { name, category, channel, subject, body, thumbnail, isActive } = req.body;

        const existing = await prisma.messageTemplate.findFirst({
            where: { id, tenantId: req.user.tenantId }
        });
        if (!existing) return res.status(404).json({ success: false, error: 'Şablon bulunamadı' });
        if (existing.isSystem) return res.status(403).json({ success: false, error: 'Sistem şablonları düzenlenemez' });

        const template = await prisma.messageTemplate.update({
            where: { id },
            data: {
                ...(name && { name }),
                ...(category && { category }),
                ...(channel && { channel }),
                ...(subject !== undefined && { subject }),
                ...(body && { body }),
                ...(thumbnail !== undefined && { thumbnail }),
                ...(isActive !== undefined && { isActive }),
            }
        });

        res.json({ success: true, data: template });
    } catch (error) {
        console.error('Update template error:', error);
        res.status(500).json({ success: false, error: 'Sunucu hatası' });
    }
});

// DELETE /api/messaging/templates/:id
router.delete('/templates/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const existing = await prisma.messageTemplate.findFirst({
            where: { id, tenantId: req.user.tenantId }
        });
        if (!existing) return res.status(404).json({ success: false, error: 'Şablon bulunamadı' });
        if (existing.isSystem) return res.status(403).json({ success: false, error: 'Sistem şablonları silinemez' });

        await prisma.messageTemplate.delete({ where: { id } });
        res.json({ success: true });
    } catch (error) {
        console.error('Delete template error:', error);
        res.status(500).json({ success: false, error: 'Sunucu hatası' });
    }
});

// POST /api/messaging/templates/seed - Seed default templates
router.post('/templates/seed', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const tenantId = req.user.tenantId;
        const existing = await prisma.messageTemplate.count({ where: { tenantId, isSystem: true } });
        if (existing > 0) {
            return res.json({ success: true, message: 'Sistem şablonları zaten mevcut', seeded: 0 });
        }

        const systemTemplates = getDefaultTemplates(tenantId);
        await prisma.messageTemplate.createMany({ data: systemTemplates });

        res.json({ success: true, message: `${systemTemplates.length} şablon oluşturuldu`, seeded: systemTemplates.length });
    } catch (error) {
        console.error('Seed templates error:', error);
        res.status(500).json({ success: false, error: 'Sunucu hatası' });
    }
});

// ============================================================================
// CAMPAIGNS
// ============================================================================

// GET /api/messaging/campaigns - List campaigns
router.get('/campaigns', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { status, channel } = req.query;
        const where = { tenantId: req.user.tenantId };
        if (status) where.status = status;
        if (channel) where.channel = channel;

        const campaigns = await prisma.messageCampaign.findMany({
            where,
            include: {
                template: { select: { name: true, category: true } },
                createdBy: { select: { firstName: true, lastName: true } },
                _count: { select: { logs: true } }
            },
            orderBy: { createdAt: 'desc' },
            take: 100
        });

        res.json({ success: true, data: campaigns });
    } catch (error) {
        console.error('List campaigns error:', error);
        res.status(500).json({ success: false, error: 'Sunucu hatası' });
    }
});

// GET /api/messaging/campaigns/:id - Campaign detail with logs
router.get('/campaigns/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const campaign = await prisma.messageCampaign.findFirst({
            where: { id: req.params.id, tenantId: req.user.tenantId },
            include: {
                template: true,
                createdBy: { select: { firstName: true, lastName: true } },
                logs: { orderBy: { createdAt: 'desc' }, take: 200 }
            }
        });
        if (!campaign) return res.status(404).json({ success: false, error: 'Kampanya bulunamadı' });

        res.json({ success: true, data: campaign });
    } catch (error) {
        console.error('Campaign detail error:', error);
        res.status(500).json({ success: false, error: 'Sunucu hatası' });
    }
});

// GET /api/messaging/recipients/count - Count recipients for a filter
router.get('/recipients/count', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { filter } = req.query;
        const tenantId = req.user.tenantId;
        let filterObj = {};
        try { filterObj = filter ? JSON.parse(filter) : { all: true }; } catch { filterObj = { all: true }; }

        const count = await countRecipients(tenantId, filterObj);
        res.json({ success: true, count });
    } catch (error) {
        console.error('Count recipients error:', error);
        res.status(500).json({ success: false, error: 'Sunucu hatası' });
    }
});

// GET /api/messaging/recipients/languages - Get language breakdown of recipients
router.get('/recipients/languages', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const tenantId = req.user.tenantId;

        // Get unique customers from bookings with their phone
        const bookings = await prisma.booking.findMany({
            where: { tenantId, status: { not: 'CANCELLED' } },
            select: { contactEmail: true, contactPhone: true },
            distinct: ['contactEmail']
        });

        // Count by locale (derived from phone prefix)
        const langMap = {};
        const seen = new Set();
        for (const b of bookings) {
            if (!b.contactEmail || seen.has(b.contactEmail.toLowerCase())) continue;
            seen.add(b.contactEmail.toLowerCase());
            const locale = detectLocaleFromPhone(b.contactPhone);
            langMap[locale] = (langMap[locale] || 0) + 1;
        }

        const languages = Object.entries(langMap)
            .map(([code, count]) => ({ code, count }))
            .sort((a, b) => b.count - a.count);

        res.json({ success: true, data: { languages, total: seen.size } });
    } catch (error) {
        console.error('Recipients languages error:', error);
        res.status(500).json({ success: false, error: 'Sunucu hatası' });
    }
});

// POST /api/messaging/campaigns - Create & optionally send campaign
router.post('/campaigns', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { name, channel, templateId, subject, body, recipientFilter, sendNow, scheduledAt } = req.body;
        if (!name || !channel || !body) {
            return res.status(400).json({ success: false, error: 'Ad, kanal ve içerik zorunludur' });
        }

        const tenantId = req.user.tenantId;
        const filter = recipientFilter || { all: true };
        const recipientCount = await countRecipients(tenantId, filter);

        const campaign = await prisma.messageCampaign.create({
            data: {
                tenantId,
                name,
                channel,
                templateId: templateId || null,
                subject: subject || null,
                body,
                recipientFilter: filter,
                recipientCount,
                status: sendNow ? 'SENDING' : (scheduledAt ? 'SCHEDULED' : 'DRAFT'),
                scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
                createdById: req.user.id,
            }
        });

        if (sendNow) {
            // Send in background (don't block response)
            sendCampaignAsync(campaign.id, tenantId, channel, subject, body, filter);
        }

        res.json({ success: true, data: campaign });
    } catch (error) {
        console.error('Create campaign error:', error);
        res.status(500).json({ success: false, error: 'Sunucu hatası' });
    }
});

// DELETE /api/messaging/campaigns/:id
router.delete('/campaigns/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const campaign = await prisma.messageCampaign.findFirst({
            where: { id: req.params.id, tenantId: req.user.tenantId }
        });
        if (!campaign) return res.status(404).json({ success: false, error: 'Kampanya bulunamadı' });

        await prisma.messageLog.deleteMany({ where: { campaignId: campaign.id } });
        await prisma.messageCampaign.delete({ where: { id: campaign.id } });
        res.json({ success: true });
    } catch (error) {
        console.error('Delete campaign error:', error);
        res.status(500).json({ success: false, error: 'Sunucu hatası' });
    }
});

// GET /api/messaging/stats - Dashboard stats
router.get('/stats', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const tenantId = req.user.tenantId;
        const [totalCampaigns, totalSent, totalTemplates, recentCampaigns] = await Promise.all([
            prisma.messageCampaign.count({ where: { tenantId } }),
            prisma.messageCampaign.aggregate({
                where: { tenantId },
                _sum: { totalSent: true, totalDelivered: true, totalFailed: true }
            }),
            prisma.messageTemplate.count({ where: { tenantId } }),
            prisma.messageCampaign.findMany({
                where: { tenantId },
                orderBy: { createdAt: 'desc' },
                take: 5,
                select: { id: true, name: true, channel: true, status: true, totalSent: true, createdAt: true }
            })
        ]);

        res.json({
            success: true,
            data: {
                totalCampaigns,
                totalSent: totalSent._sum.totalSent || 0,
                totalDelivered: totalSent._sum.totalDelivered || 0,
                totalFailed: totalSent._sum.totalFailed || 0,
                totalTemplates,
                recentCampaigns
            }
        });
    } catch (error) {
        console.error('Stats error:', error);
        res.status(500).json({ success: false, error: 'Sunucu hatası' });
    }
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

// Phone prefix → locale mapping (derive customer language from phone country code)
const PHONE_TO_LOCALE = {
    '90': 'tr', '44': 'en', '1': 'en', '49': 'de', '7': 'ru',
    '33': 'fr', '31': 'nl', '48': 'pl', '358': 'fi', '46': 'sv',
    '47': 'no', '45': 'da', '34': 'es', '39': 'it', '351': 'pt',
    '420': 'cs', '380': 'uk', '966': 'ar', '971': 'ar', '974': 'ar',
    '965': 'ar', '973': 'ar', '968': 'ar', '962': 'ar', '961': 'ar',
    '20': 'ar', '212': 'ar', '213': 'ar', '216': 'ar',
    '43': 'de', '41': 'de', '32': 'nl', '353': 'en', '61': 'en',
    '64': 'en', '27': 'en', '91': 'en', '86': 'zh', '81': 'ja', '82': 'ko',
    '375': 'ru', '374': 'ru', '995': 'ru', '998': 'ru', '996': 'ru',
    '992': 'ru', '993': 'ru', '994': 'ru',
    '40': 'ro', '359': 'bg', '381': 'sr', '385': 'hr', '386': 'sl',
    '36': 'hu', '30': 'el', '372': 'et', '371': 'lv', '370': 'lt',
};

function detectLocaleFromPhone(phone) {
    if (!phone) return 'tr';
    // Extract prefix: "+90 555..." → "90", "+44 7..." → "44", "+380..." → "380"
    const match = phone.replace(/\s/g, '').match(/^\+(\d{1,4})/);
    if (!match) return 'tr';
    const digits = match[1];
    // Try longest prefix first (3 digits, then 2, then 1)
    if (PHONE_TO_LOCALE[digits.substring(0, 3)]) return PHONE_TO_LOCALE[digits.substring(0, 3)];
    if (PHONE_TO_LOCALE[digits.substring(0, 2)]) return PHONE_TO_LOCALE[digits.substring(0, 2)];
    if (PHONE_TO_LOCALE[digits.substring(0, 1)]) return PHONE_TO_LOCALE[digits.substring(0, 1)];
    return 'tr';
}

async function countRecipients(tenantId, filter) {
    const where = buildRecipientWhere(tenantId, filter);
    const bookings = await prisma.booking.findMany({
        where,
        select: { contactEmail: true, contactPhone: true },
        distinct: ['contactEmail']
    });

    const locales = filter.locales;
    const seen = new Set();
    let count = 0;
    for (const b of bookings) {
        if (!b.contactEmail && !b.contactPhone) continue;
        const key = (b.contactEmail || b.contactPhone).toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);

        if (locales && locales.length > 0) {
            const locale = detectLocaleFromPhone(b.contactPhone);
            if (!locales.includes(locale)) continue;
        }
        count++;
    }
    return count;
}

function buildRecipientWhere(tenantId, filter) {
    const where = { tenantId, status: { not: 'CANCELLED' } };
    if (filter.bookingAfter) where.createdAt = { gte: new Date(filter.bookingAfter) };
    if (filter.bookingBefore) where.createdAt = { ...where.createdAt, lte: new Date(filter.bookingBefore) };
    return where;
}

async function getRecipients(tenantId, filter) {
    const where = buildRecipientWhere(tenantId, filter);
    const bookings = await prisma.booking.findMany({
        where,
        select: { contactName: true, contactEmail: true, contactPhone: true },
        distinct: ['contactEmail'],
        orderBy: { createdAt: 'desc' }
    });

    const locales = filter.locales;
    const seen = new Set();
    const recipients = [];
    for (const b of bookings) {
        const key = (b.contactEmail || b.contactPhone || '').toLowerCase();
        if (!key || seen.has(key)) continue;

        const locale = detectLocaleFromPhone(b.contactPhone);
        if (locales && locales.length > 0 && !locales.includes(locale)) continue;

        seen.add(key);
        recipients.push({
            name: b.contactName || '',
            email: b.contactEmail || '',
            phone: b.contactPhone || '',
            locale,
        });
    }
    return recipients;
}

async function sendCampaignAsync(campaignId, tenantId, channel, subject, body, filter) {
    try {
        const recipients = await getRecipients(tenantId, filter);
        let totalSent = 0, totalFailed = 0, totalDelivered = 0;

        // Create log entries
        const logs = recipients.map(r => ({
            campaignId,
            channel: channel === 'BOTH' ? 'EMAIL' : channel,
            recipient: channel === 'WHATSAPP' ? r.phone : r.email,
            recipientName: r.name,
            status: 'PENDING',
        }));

        if (channel === 'BOTH') {
            // Also add WhatsApp logs
            recipients.forEach(r => {
                if (r.phone) {
                    logs.push({
                        campaignId,
                        channel: 'WHATSAPP',
                        recipient: r.phone,
                        recipientName: r.name,
                        status: 'PENDING',
                    });
                }
            });
        }

        await prisma.messageLog.createMany({ data: logs });

        // Send emails
        if (channel === 'EMAIL' || channel === 'BOTH') {
            try {
                const { transporter, emailSettings } = await getTransporter(tenantId);
                const senderName = emailSettings.senderName || req.tenant?.name || '';
                const senderEmail = emailSettings.senderEmail || emailSettings.smtpUser;

                for (const r of recipients) {
                    if (!r.email) continue;
                    try {
                        const personalizedBody = renderTemplate(body, { name: r.name, email: r.email, phone: r.phone });
                        const personalizedSubject = subject ? renderTemplate(subject, { name: r.name }) : 'Mesaj';

                        await transporter.sendMail({
                            from: `"${senderName}" <${senderEmail}>`,
                            to: r.email,
                            subject: personalizedSubject,
                            html: personalizedBody,
                        });

                        totalSent++;
                        totalDelivered++;

                        // Update log
                        await prisma.messageLog.updateMany({
                            where: { campaignId, recipient: r.email, channel: 'EMAIL', status: 'PENDING' },
                            data: { status: 'SENT', sentAt: new Date() }
                        });

                        // Small delay to avoid rate limiting
                        await sleep(200);
                    } catch (err) {
                        totalFailed++;
                        await prisma.messageLog.updateMany({
                            where: { campaignId, recipient: r.email, channel: 'EMAIL', status: 'PENDING' },
                            data: { status: 'FAILED', errorMessage: err.message }
                        });
                    }
                }
            } catch (emailErr) {
                console.error('[MESSAGING] Email transport error:', emailErr.message);
            }
        }

        // Send WhatsApp
        if (channel === 'WHATSAPP' || channel === 'BOTH') {
            for (const r of recipients) {
                if (!r.phone) continue;
                try {
                    const personalizedBody = renderTemplate(body.replace(/<[^>]*>/g, ''), { name: r.name, email: r.email, phone: r.phone });
                    const result = await sendWhatsAppMessage(tenantId, r.phone, personalizedBody);

                    if (result.success) {
                        totalSent++;
                        totalDelivered++;
                        await prisma.messageLog.updateMany({
                            where: { campaignId, recipient: r.phone, channel: 'WHATSAPP', status: 'PENDING' },
                            data: { status: 'SENT', sentAt: new Date() }
                        });
                    } else {
                        totalFailed++;
                        await prisma.messageLog.updateMany({
                            where: { campaignId, recipient: r.phone, channel: 'WHATSAPP', status: 'PENDING' },
                            data: { status: 'FAILED', errorMessage: result.error }
                        });
                    }

                    await sleep(500); // WhatsApp rate limiting
                } catch (err) {
                    totalFailed++;
                    await prisma.messageLog.updateMany({
                        where: { campaignId, recipient: r.phone, channel: 'WHATSAPP', status: 'PENDING' },
                        data: { status: 'FAILED', errorMessage: err.message }
                    });
                }
            }
        }

        // Update campaign stats
        await prisma.messageCampaign.update({
            where: { id: campaignId },
            data: {
                status: 'SENT',
                sentAt: new Date(),
                totalSent,
                totalDelivered,
                totalFailed,
            }
        });

        console.log(`[MESSAGING] Campaign ${campaignId} completed: ${totalSent} sent, ${totalFailed} failed`);
    } catch (error) {
        console.error(`[MESSAGING] Campaign ${campaignId} error:`, error);
        await prisma.messageCampaign.update({
            where: { id: campaignId },
            data: { status: 'FAILED' }
        }).catch(() => {});
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// DEFAULT TEMPLATES
// ============================================================================

function getDefaultTemplates(tenantId) {
    return [
        {
            tenantId,
            name: 'Yılbaşı Tebrik',
            category: 'holiday',
            channel: 'BOTH',
            subject: 'Yeni Yılınız Kutlu Olsun! 🎉',
            body: `<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px;background:linear-gradient(135deg,#1e3a5f,#2d5a87);border-radius:16px;color:#fff;">
<div style="text-align:center;margin-bottom:24px;">
<div style="font-size:48px;">🎆</div>
<h1 style="margin:12px 0;font-size:28px;">Mutlu Yıllar!</h1>
</div>
<p style="font-size:15px;line-height:1.8;text-align:center;">Sayın {{name}},</p>
<p style="font-size:15px;line-height:1.8;text-align:center;">Yeni yılın size ve sevdiklerinize sağlık, mutluluk ve başarı getirmesini diliyoruz. Sizinle çalışmak bizim için büyük bir memnuniyet.</p>
<div style="text-align:center;margin-top:24px;padding:16px;background:rgba(255,255,255,0.1);border-radius:12px;">
<p style="margin:0;font-size:13px;opacity:0.8;">Yeni yılda da güvenli ve konforlu yolculuklar için yanınızdayız!</p>
</div>
</div>`,
            isSystem: true,
            isActive: true,
        },
        {
            tenantId,
            name: 'Ramazan Bayramı Tebrik',
            category: 'holiday',
            channel: 'BOTH',
            subject: 'Ramazan Bayramınız Mübarek Olsun 🌙',
            body: `<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px;background:linear-gradient(135deg,#1a472a,#2d7a4f);border-radius:16px;color:#fff;">
<div style="text-align:center;margin-bottom:24px;">
<div style="font-size:48px;">🌙</div>
<h1 style="margin:12px 0;font-size:26px;">Bayramınız Mübarek Olsun</h1>
</div>
<p style="font-size:15px;line-height:1.8;text-align:center;">Sayın {{name}},</p>
<p style="font-size:15px;line-height:1.8;text-align:center;">Ramazan Bayramınızı en içten dileklerimizle kutlar, bu mübarek günlerin ailenize huzur ve bereket getirmesini temenni ederiz.</p>
<div style="text-align:center;margin-top:24px;padding:16px;background:rgba(255,255,255,0.1);border-radius:12px;">
<p style="margin:0;font-size:13px;opacity:0.8;">Bayram ziyaretlerinizde güvenli transferler için bizi arayın!</p>
</div>
</div>`,
            isSystem: true,
            isActive: true,
        },
        {
            tenantId,
            name: 'Kurban Bayramı Tebrik',
            category: 'holiday',
            channel: 'BOTH',
            subject: 'Kurban Bayramınız Mübarek Olsun 🐑',
            body: `<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px;background:linear-gradient(135deg,#4a1942,#6b3fa0);border-radius:16px;color:#fff;">
<div style="text-align:center;margin-bottom:24px;">
<div style="font-size:48px;">🕌</div>
<h1 style="margin:12px 0;font-size:26px;">Kurban Bayramınız Kutlu Olsun</h1>
</div>
<p style="font-size:15px;line-height:1.8;text-align:center;">Sayın {{name}},</p>
<p style="font-size:15px;line-height:1.8;text-align:center;">Kurban Bayramınızı tebrik eder, sevdiklerinizle birlikte sağlık ve mutluluk dolu günler geçirmenizi dileriz.</p>
</div>`,
            isSystem: true,
            isActive: true,
        },
        {
            tenantId,
            name: 'Noel Kutlama',
            category: 'holiday',
            channel: 'BOTH',
            subject: 'Merry Christmas! 🎄',
            body: `<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px;background:linear-gradient(135deg,#b91c1c,#dc2626);border-radius:16px;color:#fff;">
<div style="text-align:center;margin-bottom:24px;">
<div style="font-size:48px;">🎄</div>
<h1 style="margin:12px 0;font-size:28px;">Merry Christmas!</h1>
</div>
<p style="font-size:15px;line-height:1.8;text-align:center;">Dear {{name}},</p>
<p style="font-size:15px;line-height:1.8;text-align:center;">We wish you a wonderful Christmas filled with warmth, joy, and special moments with your loved ones. Thank you for choosing our services!</p>
<div style="text-align:center;margin-top:24px;padding:16px;background:rgba(255,255,255,0.15);border-radius:12px;">
<p style="margin:0;font-size:13px;opacity:0.9;">Need a ride for your holiday plans? We're here for you! 🚗</p>
</div>
</div>`,
            isSystem: true,
            isActive: true,
        },
        {
            tenantId,
            name: '23 Nisan Kutlama',
            category: 'holiday',
            channel: 'BOTH',
            subject: '23 Nisan Ulusal Egemenlik ve Çocuk Bayramı Kutlu Olsun! 🇹🇷',
            body: `<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px;background:linear-gradient(135deg,#dc2626,#ef4444);border-radius:16px;color:#fff;">
<div style="text-align:center;margin-bottom:24px;">
<div style="font-size:48px;">🇹🇷</div>
<h1 style="margin:12px 0;font-size:22px;">23 Nisan Kutlu Olsun!</h1>
</div>
<p style="font-size:15px;line-height:1.8;text-align:center;">Sayın {{name}},</p>
<p style="font-size:15px;line-height:1.8;text-align:center;">23 Nisan Ulusal Egemenlik ve Çocuk Bayramı'nı en içten dileklerimizle kutlarız. Nice bayramlara!</p>
</div>`,
            isSystem: true,
            isActive: true,
        },
        {
            tenantId,
            name: 'Sezon İndirimi',
            category: 'promotional',
            channel: 'BOTH',
            subject: 'Size Özel %{{discount}} İndirim Fırsatı! 🎁',
            body: `<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px;background:#fff;border-radius:16px;border:2px solid #e2e8f0;">
<div style="text-align:center;margin-bottom:24px;">
<div style="font-size:48px;">🎁</div>
<h1 style="margin:12px 0;font-size:26px;color:#1e293b;">Size Özel Teklif!</h1>
</div>
<p style="font-size:15px;line-height:1.8;color:#475569;">Sayın {{name}},</p>
<p style="font-size:15px;line-height:1.8;color:#475569;">Siz değerli müşterimize özel, tüm transferlerde geçerli indirim fırsatını kaçırmayın!</p>
<div style="text-align:center;margin:24px 0;padding:20px;background:linear-gradient(135deg,#f0fdf4,#dcfce7);border-radius:12px;border:1px solid #bbf7d0;">
<div style="font-size:36px;font-weight:800;color:#16a34a;">%{{discount}} İNDİRİM</div>
<p style="margin:8px 0 0;font-size:13px;color:#15803d;">Kupon kodunuz: <strong>{{couponCode}}</strong></p>
</div>
<p style="font-size:13px;color:#94a3b8;text-align:center;">Bu fırsat sınırlı süre geçerlidir.</p>
</div>`,
            isSystem: true,
            isActive: true,
        },
        {
            tenantId,
            name: 'Yaz Sezonu Açılış',
            category: 'seasonal',
            channel: 'BOTH',
            subject: 'Yaz Sezonu Başladı! ☀️ Transfer Hizmeti Hazır',
            body: `<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px;background:linear-gradient(135deg,#f59e0b,#d97706);border-radius:16px;color:#fff;">
<div style="text-align:center;margin-bottom:24px;">
<div style="font-size:48px;">☀️</div>
<h1 style="margin:12px 0;font-size:26px;">Yaz Sezonu Başladı!</h1>
</div>
<p style="font-size:15px;line-height:1.8;text-align:center;">Sayın {{name}},</p>
<p style="font-size:15px;line-height:1.8;text-align:center;">Yaz tatili planlarınız için havalimanı transferi, günlük kiralama ve VIP araç hizmetlerimizle yanınızdayız. Erken rezervasyon avantajlarından yararlanın!</p>
<div style="text-align:center;margin-top:24px;">
<p style="margin:0;font-size:14px;font-weight:600;">📞 Hemen Rezervasyon Yapın!</p>
</div>
</div>`,
            isSystem: true,
            isActive: true,
        },
        {
            tenantId,
            name: 'Teşekkür Mesajı',
            category: 'notification',
            channel: 'BOTH',
            subject: 'Tercihleriniz İçin Teşekkür Ederiz 🙏',
            body: `<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px;background:#fff;border-radius:16px;border:2px solid #e2e8f0;">
<div style="text-align:center;margin-bottom:24px;">
<div style="font-size:48px;">🙏</div>
<h1 style="margin:12px 0;font-size:24px;color:#1e293b;">Teşekkür Ederiz!</h1>
</div>
<p style="font-size:15px;line-height:1.8;color:#475569;">Sayın {{name}},</p>
<p style="font-size:15px;line-height:1.8;color:#475569;">Bizi tercih ettiğiniz için çok teşekkür ederiz. Müşteri memnuniyeti bizim için her zaman önceliktir. Bir dahaki yolculuğunuzda da sizinle birlikte olmaktan mutluluk duyacağız.</p>
<p style="font-size:15px;line-height:1.8;color:#475569;">Herhangi bir geri bildiriminiz varsa bize ulaşmaktan çekinmeyin.</p>
</div>`,
            isSystem: true,
            isActive: true,
        },
    ];
}

module.exports = router;
