/**
 * Fleet driving report builder + email dispatch
 */
const { analyzeDrivingTelemetry, gradeFromScore, buildDrivingReportHtml } = require('./fleetTelemetryService');

async function ensureVehicleOwnership(prisma, scope, vehicleId) {
    if (!vehicleId) return null;
    return prisma.vehicle.findFirst({
        where: { id: vehicleId, ownerId: scope.partnerId, tenantId: scope.tenantId },
    });
}

async function buildDrivingReport(prisma, scope, vehicleId, dateStr, speedLimit) {
    const veh = await ensureVehicleOwnership(prisma, scope, vehicleId);
    if (!veh) return null;
    const day = dateStr ? new Date(String(dateStr)) : new Date();
    const start = new Date(day);
    start.setHours(0, 0, 0, 0);
    const end = new Date(day);
    end.setHours(23, 59, 59, 999);

    const [telemetry, fuelEntries] = await Promise.all([
        prisma.partnerVehicleTelemetry.findMany({
            where: {
                tenantId: scope.tenantId,
                partnerId: scope.partnerId,
                vehicleId: veh.id,
                timestamp: { gte: start, lte: end },
            },
            orderBy: { timestamp: 'asc' },
        }),
        prisma.partnerVehicleFuelEntry.findMany({
            where: {
                tenantId: scope.tenantId,
                partnerId: scope.partnerId,
                vehicleId: veh.id,
                date: { gte: start, lte: end },
            },
        }),
    ]);

    const report = analyzeDrivingTelemetry(telemetry, { speedLimit: speedLimit || 120 });
    report.fuelLiters = fuelEntries.reduce((s, f) => s + Number(f.liters || 0), 0);
    report.fuelTotal = fuelEntries.reduce((s, f) => s + Number(f.total || 0), 0);
    report.fuelCount = fuelEntries.length;
    report.grade = gradeFromScore(report.score);
    report.date = start.toISOString().slice(0, 10);

    return {
        vehicle: { id: veh.id, plate: veh.plateNumber, brand: veh.brand, model: veh.model },
        report,
    };
}

function defaultFleetReportConfig() {
    return {
        autoEmail: false,
        recipients: [],
        speedLimit: 120,
        sendHour: 20,
        sendMinute: 0,
        includeAllVehicles: true,
        vehicleIds: [],
        minPointCount: 5,
        lastSentDate: null,
    };
}

function normalizeFleetReportConfig(raw) {
    const base = defaultFleetReportConfig();
    if (!raw || typeof raw !== 'object') return base;
    return {
        ...base,
        ...raw,
        recipients: Array.isArray(raw.recipients)
            ? raw.recipients.filter(Boolean)
            : String(raw.recipients || '').split(/[,;]/).map((s) => s.trim()).filter(Boolean),
        vehicleIds: Array.isArray(raw.vehicleIds) ? raw.vehicleIds : [],
        speedLimit: Number(raw.speedLimit) || 120,
        sendHour: Math.min(23, Math.max(0, Number(raw.sendHour) ?? 20)),
        sendMinute: Math.min(59, Math.max(0, Number(raw.sendMinute) ?? 0)),
        minPointCount: Math.max(1, Number(raw.minPointCount) || 5),
    };
}

async function getPartnerSmtpTransporter(prisma, uetdsService, partnerId) {
    const profile = await prisma.partnerProfile.findUnique({ where: { userId: partnerId } });
    const email = profile?.metadata?.notifications?.email;
    if (!email?.enabled || !email?.smtpHost || !email?.smtpUser || !email?.smtpPassEnc) {
        return { transporter: null, email, profile, error: 'SMTP ayarları eksik (Tanımlamalar)' };
    }
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
        host: email.smtpHost,
        port: Number(email.smtpPort) || 587,
        secure: !!email.smtpSecure || Number(email.smtpPort) === 465,
        auth: { user: email.smtpUser, pass: uetdsService.decrypt(email.smtpPassEnc) },
        tls: { rejectUnauthorized: false },
    });
    return { transporter, email, profile };
}

async function sendDrivingReportEmail(prisma, uetdsService, scope, { vehicleId, date, to, speedLimit, recipients }) {
    const result = await buildDrivingReport(prisma, scope, vehicleId, date, speedLimit || 120);
    if (!result) return { ok: false, error: 'Araç bulunamadı' };

    const { transporter, email, profile, error } = await getPartnerSmtpTransporter(prisma, uetdsService, scope.partnerId);
    if (!transporter) return { ok: false, error };

    const partner = await prisma.user.findUnique({ where: { id: scope.partnerId } });
    const dateLabel = result.report.date
        ? new Date(result.report.date).toLocaleDateString('tr-TR')
        : new Date().toLocaleDateString('tr-TR');
    const html = buildDrivingReportHtml({
        report: result.report,
        vehicle: result.vehicle,
        partner,
        profile,
        dateLabel,
    });

    const toList = (recipients && recipients.length ? recipients : to
        ? [to]
        : [email.senderEmail || email.smtpUser]).filter(Boolean);

    if (!toList.length) return { ok: false, error: 'Alıcı e-posta yok' };

    const fromName = email.senderName || profile?.companyName || partner?.fullName || 'Filo';
    const fromAddr = email.senderEmail || email.smtpUser;
    const subject = `Sürüş Raporu · ${result.vehicle.plate} · ${dateLabel}`;

    await transporter.sendMail({
        from: `"${fromName}" <${fromAddr}>`,
        to: toList.join(', '),
        replyTo: email.replyTo || undefined,
        subject,
        html,
    });

    return { ok: true, result, to: toList, subject };
}

async function runAutoDrivingReportsForPartner(prisma, uetdsService, partnerId, tenantId, reportDateStr) {
    const profile = await prisma.partnerProfile.findUnique({ where: { userId: partnerId } });
    const cfg = normalizeFleetReportConfig(profile?.metadata?.fleetReports);
    if (!cfg.autoEmail) return { sent: 0, skipped: 'disabled' };
    if (cfg.lastSentDate === reportDateStr) return { sent: 0, skipped: 'already_sent' };
    if (!cfg.recipients.length) return { sent: 0, skipped: 'no_recipients' };

    const scope = { tenantId, partnerId };
    let vehicles = await prisma.vehicle.findMany({
        where: { ownerId: partnerId, tenantId },
        select: { id: true, plateNumber: true },
    });
    if (!cfg.includeAllVehicles && cfg.vehicleIds.length) {
        vehicles = vehicles.filter((v) => cfg.vehicleIds.includes(v.id));
    }

    let sent = 0;
    for (const veh of vehicles) {
        const built = await buildDrivingReport(prisma, scope, veh.id, reportDateStr, cfg.speedLimit);
        if (!built || (built.report.pointCount || 0) < cfg.minPointCount) continue;
        try {
            const r = await sendDrivingReportEmail(prisma, uetdsService, scope, {
                vehicleId: veh.id,
                date: reportDateStr,
                speedLimit: cfg.speedLimit,
                recipients: cfg.recipients,
            });
            if (r.ok) sent++;
        } catch (e) {
            console.warn(`[FleetCron] driving report ${veh.plateNumber}:`, e.message);
        }
    }

    if (sent > 0) {
        const meta = { ...(profile.metadata || {}) };
        meta.fleetReports = { ...cfg, lastSentDate: reportDateStr };
        await prisma.partnerProfile.update({
            where: { userId: partnerId },
            data: { metadata: meta },
        });
    }

    return { sent };
}

module.exports = {
    buildDrivingReport,
    defaultFleetReportConfig,
    normalizeFleetReportConfig,
    sendDrivingReportEmail,
    runAutoDrivingReportsForPartner,
};
