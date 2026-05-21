/**
 * Partner Accounting — Scheduled jobs
 *
 * Every morning at 09:00 (Europe/Istanbul) — for each partner with overdue
 * invoices and SMTP configured, send automatic reminders.
 *
 * Strict per-partner isolation; never cross-tenant.
 */
const cron = require('node-cron');
const prisma = require('../lib/prisma');
const uetdsService = require('../services/uetdsService');
const axios = require('axios');

async function runOverdueReminders() {
    const now = new Date();
    console.log('[Cron] Running overdue invoice reminders...');

    const overdueInvoices = await prisma.partnerInvoice.findMany({
        where: {
            status: { in: ['APPROVED', 'SENT', 'ACCEPTED', 'PARTIALLY_PAID'] },
            dueDate: { not: null, lt: now },
            counterpartyEmail: { not: null },
        },
        orderBy: { dueDate: 'asc' },
    });

    const byPartner = new Map();
    for (const inv of overdueInvoices) {
        const last = inv.metadata?.lastReminderAt ? new Date(inv.metadata.lastReminderAt) : null;
        if (last && now.getTime() - last.getTime() < 24 * 60 * 60 * 1000) continue; // throttle daily
        if (!byPartner.has(inv.partnerId)) byPartner.set(inv.partnerId, []);
        byPartner.get(inv.partnerId).push(inv);
    }

    let sentTotal = 0;
    for (const [partnerId, invoices] of byPartner.entries()) {
        try {
            const profile = await prisma.partnerProfile.findUnique({ where: { userId: partnerId } });
            const settings = profile?.metadata?.notifications;
            if (!settings) continue;
            const email = settings.email;
            if (!email || !email.smtpHost || !email.smtpUser || !email.smtpPassEnc || !email.enabled) continue;

            const nodemailer = require('nodemailer');
            const transporter = nodemailer.createTransport({
                host: email.smtpHost,
                port: Number(email.smtpPort) || 587,
                secure: !!email.smtpSecure || Number(email.smtpPort) === 465,
                auth: { user: email.smtpUser, pass: uetdsService.decrypt(email.smtpPassEnc) },
                tls: { rejectUnauthorized: false },
            });
            const partner = await prisma.user.findUnique({ where: { id: partnerId } });
            const fromName = email.senderName || profile?.companyName || partner?.fullName || 'Partner';
            const fromAddr = email.senderEmail || email.smtpUser;

            for (const inv of invoices) {
                if (!inv.counterpartyEmail) continue;
                try {
                    const days = Math.ceil((now.getTime() - new Date(inv.dueDate).getTime()) / 86400000);
                    const remaining = Number(inv.grandTotal) - Number(inv.paidTotal);
                    const fmt = `${remaining.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ${inv.currency}`;
                    await transporter.sendMail({
                        from: `"${fromName}" <${fromAddr}>`,
                        to: inv.counterpartyEmail,
                        subject: `[Otomatik Hatırlatma] Fatura ${inv.invoiceNo} ${days} gün vadesi geçti`,
                        html: `<p>Sayın ${inv.counterpartyName || ''},</p>
<p>Otomatik hatırlatma: <b>${inv.invoiceNo}</b> numaralı faturanızın vadesi <b>${days}</b> gün geçmiştir.</p>
<p>Kalan tutar: <b style="color:#b91c1c;">${fmt}</b></p>
<p>En kısa sürede ödeme yapmanızı rica ederiz.</p>
<p style="color:#94a3b8;font-size:12px;">Bu mesaj otomatik olarak gönderilmiştir.</p>`,
                    });
                    await prisma.partnerInvoice.update({
                        where: { id: inv.id },
                        data: { metadata: { ...(inv.metadata || {}), lastReminderAt: now.toISOString() } },
                    });
                    sentTotal++;
                } catch (innerErr) {
                    console.warn(`[Cron] reminder failed for ${inv.invoiceNo}:`, innerErr.message);
                }
            }
        } catch (partnerErr) {
            console.error(`[Cron] partner ${partnerId} reminder run failed:`, partnerErr.message);
        }
    }
    console.log(`[Cron] Overdue reminders done. Sent: ${sentTotal} across ${byPartner.size} partners.`);
}

function start() {
    // 09:00 Europe/Istanbul her gün
    cron.schedule('0 9 * * *', () => {
        runOverdueReminders().catch((e) => console.error('[Cron] reminder error:', e));
    }, { timezone: 'Europe/Istanbul' });
    console.log('[Cron] Partner accounting jobs scheduled (09:00 Europe/Istanbul).');
}

module.exports = { start, runOverdueReminders };
