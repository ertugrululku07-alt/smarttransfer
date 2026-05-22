/**
 * Partner Fleet Reminders — daily cron at 09:00 Europe/Istanbul
 *
 * Sends e-mail + WhatsApp reminders for:
 *   • Insurance policies expiring in 7 days (or expired ≤ 60 days ago)
 *   • Inspections expiring in 7 days (or expired ≤ 60 days ago)
 *   • Maintenance due within 7 days OR within 500 km
 *
 * Reads each partner's notification config from PartnerProfile.metadata.notifications
 * (configured via Partner > Settings > Tanımlamalar). Throttles to 1 reminder per
 * (record, partner) every 24h via metadata.lastReminderAt.
 */
const cron = require('node-cron');
const prisma = require('../lib/prisma');
const uetdsService = require('../services/uetdsService');
const axios = require('axios');
const { normalizeFleetReportConfig, runAutoDrivingReportsForPartner } = require('../services/fleetReportService');

const DAY = 86400000;

function daysBetween(a, b) {
    return Math.ceil((new Date(b).getTime() - new Date(a).getTime()) / DAY);
}

function normalizePhone(phone) {
    let c = String(phone || '').replace(/[^\d+]/g, '');
    if (c.startsWith('+')) c = c.slice(1);
    if (c.startsWith('0')) c = '90' + c.slice(1);
    if (c.length === 10 && c.startsWith('5')) c = '90' + c;
    return c;
}

async function getTransporter(email) {
    const nodemailer = require('nodemailer');
    return nodemailer.createTransport({
        host: email.smtpHost,
        port: Number(email.smtpPort) || 587,
        secure: !!email.smtpSecure || Number(email.smtpPort) === 465,
        auth: { user: email.smtpUser, pass: uetdsService.decrypt(email.smtpPassEnc) },
        tls: { rejectUnauthorized: false },
    });
}

async function sendWhatsApp(wa, phone, text) {
    const provider = (wa.provider || 'META').toUpperCase();
    if (provider === 'META') {
        if (!wa.metaPhoneNumberId || !wa.metaAccessTokenEnc) throw new Error('Meta yapılandırılmadı');
        const token = uetdsService.decrypt(wa.metaAccessTokenEnc);
        await axios.post(`https://graph.facebook.com/v18.0/${wa.metaPhoneNumberId}/messages`,
            { messaging_product: 'whatsapp', to: phone, type: 'text', text: { body: text } },
            { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 });
    } else if (provider === 'GREEN') {
        const token = uetdsService.decrypt(wa.greenApiTokenEnc);
        await axios.post(`https://api.green-api.com/waInstance${wa.greenInstanceId}/sendMessage/${token}`,
            { chatId: `${phone}@c.us`, message: text }, { timeout: 15000 });
    } else if (provider === 'WEBHOOK') {
        const secret = wa.webhookSecretEnc ? uetdsService.decrypt(wa.webhookSecretEnc) : null;
        const headers = { 'Content-Type': 'application/json' };
        if (secret) headers['X-Webhook-Secret'] = secret;
        await axios.post(wa.webhookUrl, { phone, message: text }, { headers, timeout: 15000 });
    }
}

async function dispatchPartnerAlerts(partnerId, alerts) {
    if (!alerts.length) return 0;
    const profile = await prisma.partnerProfile.findUnique({ where: { userId: partnerId } });
    const notif = profile?.metadata?.notifications;
    if (!notif) return 0;

    const partner = await prisma.user.findUnique({ where: { id: partnerId } });
    const senderName = notif.email?.senderName || profile?.companyName || partner?.fullName || 'Filo';

    let sent = 0;
    let transporter = null;
    if (notif.email?.enabled && notif.email?.smtpHost && notif.email?.smtpUser && notif.email?.smtpPassEnc) {
        try { transporter = await getTransporter(notif.email); } catch (e) { console.warn('SMTP transport error:', e.message); }
    }
    const target = notif.email?.senderEmail || notif.email?.smtpUser;
    const wa = notif.whatsapp?.enabled ? notif.whatsapp : null;
    const ownerPhone = profile?.contactPhone;

    const lines = alerts.map((a) => `• ${a.icon} ${a.title} — ${a.vehicleLabel} — ${a.message}`);
    const subject = `🔔 Filo Hatırlatma · ${alerts.length} uyarı`;
    const html = `<p>Sayın ${senderName},</p>
<p>Filonuza ait <b>${alerts.length}</b> uyarı bulunuyor:</p>
<ul style="line-height:1.7;font-size:14px;">${alerts.map((a) => `<li><b>${a.title}</b> · ${a.vehicleLabel} · <span style="color:#b91c1c;">${a.message}</span></li>`).join('')}</ul>
<p style="color:#64748b;font-size:11px;">Otomatik hatırlatma — partner panelinden detayları görebilirsiniz.</p>`;

    if (transporter && target) {
        try {
            await transporter.sendMail({
                from: `"${senderName}" <${notif.email.senderEmail || notif.email.smtpUser}>`,
                to: target,
                subject,
                html,
            });
            sent++;
        } catch (e) {
            console.warn(`[FleetCron] email failed for ${partnerId}:`, e.message);
        }
    }
    if (wa && ownerPhone) {
        try {
            const phone = normalizePhone(ownerPhone);
            const text = `🔔 Filo Hatırlatma (${alerts.length} uyarı)\n\n${lines.join('\n')}`;
            await sendWhatsApp(wa, phone, text);
            sent++;
        } catch (e) {
            console.warn(`[FleetCron] whatsapp failed for ${partnerId}:`, e.message);
        }
    }
    return sent;
}

async function runFleetReminders() {
    const now = new Date();
    const in7 = new Date(now.getTime() + 7 * DAY);
    const ago60 = new Date(now.getTime() - 60 * DAY);
    console.log('[FleetCron] Running fleet reminders...');

    const insurances = await prisma.partnerVehicleInsurance.findMany({
        where: { OR: [{ endDate: { gte: now, lte: in7 } }, { endDate: { gte: ago60, lt: now } }] },
    });
    const inspections = await prisma.partnerVehicleInspection.findMany({
        where: { expiryDate: { gte: ago60, lte: in7 } },
    });
    const maintenances = await prisma.partnerVehicleMaintenance.findMany({
        where: { OR: [{ nextDate: { gte: now, lte: in7 } }, { nextDate: { gte: ago60, lt: now } }, { nextKm: { not: null } }] },
    });

    const allVehicleIds = Array.from(new Set([
        ...insurances.map((x) => x.vehicleId),
        ...inspections.map((x) => x.vehicleId),
        ...maintenances.map((x) => x.vehicleId),
    ]));
    const vehicles = allVehicleIds.length
        ? await prisma.vehicle.findMany({ where: { id: { in: allVehicleIds } } })
        : [];
    const vehMap = new Map(vehicles.map((v) => [v.id, { plate: v.plateNumber, brand: v.brand, model: v.model, currentKm: Number(v.metadata?.currentKm || 0) }]));

    // Group alerts per partner
    const byPartner = new Map();
    const pushAlert = (partnerId, alert, key) => {
        if (!byPartner.has(partnerId)) byPartner.set(partnerId, []);
        byPartner.get(partnerId).push({ ...alert, __key: key });
    };

    for (const ins of insurances) {
        const last = ins.metadata?.lastReminderAt ? new Date(ins.metadata.lastReminderAt) : null;
        if (last && now.getTime() - last.getTime() < 24 * 3600 * 1000) continue;
        const veh = vehMap.get(ins.vehicleId);
        const days = daysBetween(now, ins.endDate);
        if (days >= -60 && days <= 7) {
            pushAlert(ins.partnerId, {
                icon: '🛡️',
                title: 'Sigorta Vadesi',
                vehicleLabel: veh ? `${veh.plate} ${veh.brand || ''} ${veh.model || ''}`.trim() : ins.vehicleId,
                message: days < 0 ? `${Math.abs(days)} gün önce doldu (${ins.type})` : `${days} gün kaldı (${ins.type})`,
            }, { kind: 'insurance', id: ins.id });
        }
    }

    for (const insp of inspections) {
        if (!insp.expiryDate) continue;
        const last = insp.metadata?.lastReminderAt ? new Date(insp.metadata.lastReminderAt) : null;
        if (last && now.getTime() - last.getTime() < 24 * 3600 * 1000) continue;
        const veh = vehMap.get(insp.vehicleId);
        const days = daysBetween(now, insp.expiryDate);
        if (days >= -60 && days <= 7) {
            pushAlert(insp.partnerId, {
                icon: '🔧',
                title: 'Araç Muayene Vadesi',
                vehicleLabel: veh ? `${veh.plate}` : insp.vehicleId,
                message: days < 0 ? `${Math.abs(days)} gün önce doldu (${insp.type})` : `${days} gün kaldı (${insp.type})`,
            }, { kind: 'inspection', id: insp.id });
        }
    }

    for (const m of maintenances) {
        const last = m.metadata?.lastReminderAt ? new Date(m.metadata.lastReminderAt) : null;
        if (last && now.getTime() - last.getTime() < 24 * 3600 * 1000) continue;
        const veh = vehMap.get(m.vehicleId);
        const curKm = veh?.currentKm || 0;

        if (m.nextDate) {
            const days = daysBetween(now, m.nextDate);
            if (days >= -60 && days <= 7) {
                pushAlert(m.partnerId, {
                    icon: '🔧',
                    title: 'Bakım Vadesi',
                    vehicleLabel: veh ? veh.plate : m.vehicleId,
                    message: days < 0 ? `${Math.abs(days)} gün geçti (${m.type})` : `${days} gün kaldı (${m.type})`,
                }, { kind: 'maintenance-date', id: m.id });
                continue;
            }
        }
        if (m.nextKm && curKm > 0) {
            const remaining = Number(m.nextKm) - curKm;
            if (remaining <= 500) {
                pushAlert(m.partnerId, {
                    icon: '🛞',
                    title: 'Km Bazlı Bakım',
                    vehicleLabel: veh ? veh.plate : m.vehicleId,
                    message: remaining <= 0 ? `${Math.abs(remaining)} km geçti (${m.type})` : `${remaining} km kaldı (${m.type})`,
                }, { kind: 'maintenance-km', id: m.id });
            }
        }
    }

    let totalSent = 0;
    for (const [partnerId, alerts] of byPartner.entries()) {
        try {
            const n = await dispatchPartnerAlerts(partnerId, alerts);
            if (n > 0) {
                // Mark all referenced rows with throttle timestamp
                for (const a of alerts) {
                    try {
                        if (a.__key.kind === 'insurance') {
                            const cur = insurances.find((x) => x.id === a.__key.id);
                            if (cur) await prisma.partnerVehicleInsurance.update({ where: { id: cur.id }, data: { metadata: { ...(cur.metadata || {}), lastReminderAt: now.toISOString() } } });
                        }
                        if (a.__key.kind === 'inspection') {
                            const cur = inspections.find((x) => x.id === a.__key.id);
                            if (cur) await prisma.partnerVehicleInspection.update({ where: { id: cur.id }, data: { metadata: { ...(cur.metadata || {}), lastReminderAt: now.toISOString() } } });
                        }
                        if (a.__key.kind.startsWith('maintenance')) {
                            const cur = maintenances.find((x) => x.id === a.__key.id);
                            if (cur) await prisma.partnerVehicleMaintenance.update({ where: { id: cur.id }, data: { metadata: { ...(cur.metadata || {}), lastReminderAt: now.toISOString() } } });
                        }
                    } catch (innerErr) { /* ignore */ }
                }
                totalSent += n;
            }
        } catch (e) {
            console.error(`[FleetCron] partner ${partnerId} dispatch error:`, e.message);
        }
    }

    // Geofence violations — notify unnotified events from last 24h
    const since24h = new Date(now.getTime() - 24 * 3600 * 1000);
    const geoViolations = await prisma.partnerFleetGeofenceViolation.findMany({
        where: { timestamp: { gte: since24h }, notifiedAt: null },
        orderBy: { timestamp: 'desc' },
        take: 200,
    });
    if (geoViolations.length) {
        const gfIds = [...new Set(geoViolations.map((v) => v.geofenceId))];
        const vehIds = [...new Set(geoViolations.map((v) => v.vehicleId))];
        const [gfs, vehs] = await Promise.all([
            prisma.partnerFleetGeofence.findMany({ where: { id: { in: gfIds } } }),
            prisma.vehicle.findMany({ where: { id: { in: vehIds } } }),
        ]);
        const gfMap = new Map(gfs.map((g) => [g.id, g]));
        const vehMap2 = new Map(vehs.map((v) => [v.id, v.plateNumber]));
        const geoByPartner = new Map();
        for (const v of geoViolations) {
            if (!geoByPartner.has(v.partnerId)) geoByPartner.set(v.partnerId, []);
            const gf = gfMap.get(v.geofenceId);
            geoByPartner.get(v.partnerId).push({
                icon: v.eventType === 'EXIT' ? '🚨' : '📍',
                title: 'Geofence İhlali',
                vehicleLabel: vehMap2.get(v.vehicleId) || v.vehicleId,
                message: `${gf?.name || 'Bölge'} · ${v.eventType === 'EXIT' ? 'ÇIKIŞ' : 'GİRİŞ'} · ${new Date(v.timestamp).toLocaleString('tr-TR')}`,
                violationId: v.id,
            });
        }
        for (const [partnerId, alerts] of geoByPartner.entries()) {
            try {
                const n = await dispatchPartnerAlerts(partnerId, alerts);
                if (n > 0) {
                    await prisma.partnerFleetGeofenceViolation.updateMany({
                        where: { id: { in: alerts.map((a) => a.violationId) } },
                        data: { notifiedAt: now },
                    });
                    totalSent += n;
                }
            } catch (e) {
                console.warn(`[FleetCron] geofence notify ${partnerId}:`, e.message);
            }
        }
    }

    console.log(`[FleetCron] Done. Channels sent: ${totalSent} across ${byPartner.size} partners.`);
}

async function runAutoDrivingReports() {
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Europe/Istanbul',
        hour: 'numeric',
        minute: 'numeric',
        hour12: false,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(now);
    const get = (type) => parts.find((p) => p.type === type)?.value;
    const hour = Number(get('hour'));
    const minute = Number(get('minute'));
    const dateStr = `${get('year')}-${get('month')}-${get('day')}`;

    if (minute !== 0) return;

    console.log(`[FleetCron] Checking auto driving reports (${hour}:00 · ${dateStr})...`);

    const profiles = await prisma.partnerProfile.findMany({
        where: { metadata: { not: null } },
        select: { userId: true, tenantId: true, metadata: true },
    });

    let totalSent = 0;
    for (const p of profiles) {
        const cfg = normalizeFleetReportConfig(p.metadata?.fleetReports);
        if (!cfg.autoEmail) continue;
        if (cfg.sendHour !== hour) continue;
        if (cfg.lastSentDate === dateStr) continue;

        const partner = await prisma.user.findUnique({ where: { id: p.userId }, select: { id: true, tenantId: true, roleType: true } });
        if (!partner || partner.roleType !== 'PARTNER') continue;

        try {
            const r = await runAutoDrivingReportsForPartner(
                prisma,
                uetdsService,
                partner.id,
                partner.tenantId || p.tenantId,
                dateStr,
            );
            totalSent += r.sent || 0;
        } catch (e) {
            console.warn(`[FleetCron] auto driving report ${p.userId}:`, e.message);
        }
    }
    if (totalSent > 0) console.log(`[FleetCron] Auto driving reports sent: ${totalSent}`);
}

function start() {
    // Daily 09:05 Europe/Istanbul — insurance / inspection / maintenance reminders
    cron.schedule('5 9 * * *', () => {
        runFleetReminders().catch((e) => console.error('[FleetCron] error:', e));
    }, { timezone: 'Europe/Istanbul' });

    // Hourly — auto driving report emails at partner-configured hour
    cron.schedule('0 * * * *', () => {
        runAutoDrivingReports().catch((e) => console.error('[FleetCron] driving report error:', e));
    }, { timezone: 'Europe/Istanbul' });

    console.log('[FleetCron] Partner fleet jobs scheduled (09:05 reminders + hourly driving reports).');
}

module.exports = { start, runFleetReminders, runAutoDrivingReports };
