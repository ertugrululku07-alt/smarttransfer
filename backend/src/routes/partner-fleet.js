/**
 * Partner Fleet Tracking
 * ─────────────────────────────────────────────────────────────────
 * Vehicle insurance / inspection / maintenance / fuel / documents
 * with reminders and alerts.
 *
 * Strict isolation: every query filters by
 *   { tenantId: req.user.tenantId, partnerId: req.user.id }
 * and verifies the vehicle belongs to the partner (ownerId === partnerId).
 */

const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const { authMiddleware } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
const crypto = require('crypto');

function ensurePartner(req, res) {
    if (req.user?.roleType !== 'PARTNER') {
        res.status(403).json({ success: false, error: 'Yalnızca partner kullanıcılar erişebilir' });
        return null;
    }
    const tenantId = req.tenant?.id || req.user.tenantId;
    const partnerId = req.user.id;
    if (!tenantId || !partnerId) {
        res.status(400).json({ success: false, error: 'Geçersiz oturum' });
        return null;
    }
    return { tenantId, partnerId };
}

async function ensureVehicleOwnership(scope, vehicleId) {
    if (!vehicleId) return null;
    return prisma.vehicle.findFirst({
        where: { id: vehicleId, ownerId: scope.partnerId, tenantId: scope.tenantId },
    });
}

function toNum(v, def = null) {
    if (v === undefined || v === null || v === '') return def;
    const n = Number(v);
    return Number.isFinite(n) ? n : def;
}

function daysBetween(a, b) {
    return Math.ceil((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
}

// ─────────────────────────────────────────────────────────────────
// VEHICLES (slimmed partner-owned list used by all fleet pages)
// ─────────────────────────────────────────────────────────────────
router.get('/vehicles', authMiddleware, async (req, res) => {
    const scope = ensurePartner(req, res);
    if (!scope) return;
    try {
        const vehicles = await prisma.vehicle.findMany({
            where: { ownerId: scope.partnerId, tenantId: scope.tenantId },
            include: { vehicleType: true },
            orderBy: { plateNumber: 'asc' },
        });
        const data = vehicles.map((v) => ({
            id: v.id,
            plate: v.plateNumber,
            brand: v.brand,
            model: v.model,
            year: v.year,
            color: v.color,
            capacity: v.vehicleType?.capacity || v.capacity || 0,
            category: v.vehicleType?.category || null,
            status: v.status,
            currentKm: Number(v.metadata?.currentKm || 0) || null,
        }));
        res.json({ success: true, data });
    } catch (error) {
        console.error('partner-fleet vehicles error:', error);
        res.status(500).json({ success: false, error: 'Araçlar alınamadı' });
    }
});

// ─────────────────────────────────────────────────────────────────
// DASHBOARD — Genel durum
// ─────────────────────────────────────────────────────────────────
router.get('/dashboard', authMiddleware, async (req, res) => {
    const scope = ensurePartner(req, res);
    if (!scope) return;
    try {
        const now = new Date();
        const in30 = new Date(now.getTime() + 30 * 86400000);
        const in7 = new Date(now.getTime() + 7 * 86400000);
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        const baseWhere = { tenantId: scope.tenantId, partnerId: scope.partnerId };

        const [
            vehicleCount,
            activeVehicles,
            insurancesExpiringSoon,
            insurancesExpired,
            inspectionsExpiringSoon,
            inspectionsExpired,
            upcomingMaintenance,
            overdueKmMaintenance,
            fuelMonth,
            maintenanceMonth,
            latestFuel,
            latestMaintenance,
        ] = await Promise.all([
            prisma.vehicle.count({ where: { ownerId: scope.partnerId, tenantId: scope.tenantId } }),
            prisma.vehicle.count({ where: { ownerId: scope.partnerId, tenantId: scope.tenantId, status: 'ACTIVE' } }),
            prisma.partnerVehicleInsurance.findMany({
                where: { ...baseWhere, status: 'ACTIVE', endDate: { gte: now, lte: in30 } },
                orderBy: { endDate: 'asc' },
                take: 30,
            }),
            prisma.partnerVehicleInsurance.findMany({
                where: { ...baseWhere, endDate: { lt: now } },
                orderBy: { endDate: 'asc' },
                take: 30,
            }),
            prisma.partnerVehicleInspection.findMany({
                where: { ...baseWhere, expiryDate: { gte: now, lte: in30 } },
                orderBy: { expiryDate: 'asc' },
                take: 30,
            }),
            prisma.partnerVehicleInspection.findMany({
                where: { ...baseWhere, expiryDate: { lt: now, not: null } },
                orderBy: { expiryDate: 'asc' },
                take: 30,
            }),
            prisma.partnerVehicleMaintenance.findMany({
                where: { ...baseWhere, nextDate: { gte: now, lte: in30 } },
                orderBy: { nextDate: 'asc' },
                take: 30,
            }),
            prisma.partnerVehicleMaintenance.findMany({
                where: { ...baseWhere, nextKm: { not: null } },
                orderBy: { nextKm: 'asc' },
                take: 50,
            }),
            prisma.partnerVehicleFuelEntry.aggregate({
                where: { ...baseWhere, date: { gte: startOfMonth } },
                _sum: { total: true, liters: true },
                _count: true,
            }),
            prisma.partnerVehicleMaintenance.aggregate({
                where: { ...baseWhere, serviceDate: { gte: startOfMonth } },
                _sum: { cost: true },
                _count: true,
            }),
            prisma.partnerVehicleFuelEntry.findMany({
                where: baseWhere,
                orderBy: { date: 'desc' },
                take: 8,
            }),
            prisma.partnerVehicleMaintenance.findMany({
                where: baseWhere,
                orderBy: { serviceDate: 'desc' },
                take: 8,
            }),
        ]);

        // Resolve vehicle plates for alert lists
        const allVids = new Set();
        [...insurancesExpiringSoon, ...insurancesExpired, ...inspectionsExpiringSoon, ...inspectionsExpired, ...upcomingMaintenance, ...overdueKmMaintenance, ...latestFuel, ...latestMaintenance].forEach((x) => x?.vehicleId && allVids.add(x.vehicleId));
        const vehMap = new Map();
        if (allVids.size) {
            const vs = await prisma.vehicle.findMany({ where: { id: { in: Array.from(allVids) }, ownerId: scope.partnerId } });
            vs.forEach((v) => vehMap.set(v.id, { plate: v.plateNumber, brand: v.brand, model: v.model }));
        }

        // Build km-overdue: need vehicle currentKm vs maintenance nextKm
        const vehiclesAll = await prisma.vehicle.findMany({ where: { ownerId: scope.partnerId } });
        const currentKmByVehicle = new Map();
        vehiclesAll.forEach((v) => currentKmByVehicle.set(v.id, Number(v.metadata?.currentKm || 0)));

        const dueKmAlerts = overdueKmMaintenance.filter((m) => {
            const cur = currentKmByVehicle.get(m.vehicleId) || 0;
            return m.nextKm && cur >= m.nextKm - 500; // 500 km veya altı kaldı
        }).map((m) => ({
            id: m.id,
            vehicleId: m.vehicleId,
            vehicle: vehMap.get(m.vehicleId) || null,
            type: m.type,
            nextKm: m.nextKm,
            currentKm: currentKmByVehicle.get(m.vehicleId) || 0,
            remaining: (m.nextKm || 0) - (currentKmByVehicle.get(m.vehicleId) || 0),
        }));

        const decorate = (rows, dateField) => rows.map((r) => ({
            id: r.id,
            vehicleId: r.vehicleId,
            vehicle: vehMap.get(r.vehicleId) || null,
            type: r.type,
            policyNo: r.policyNo,
            company: r.company,
            date: r[dateField],
            cost: r.cost ? Number(r.cost) : null,
            currency: r.currency || 'TRY',
            days: r[dateField] ? daysBetween(now, r[dateField]) : null,
        }));

        res.json({
            success: true,
            data: {
                kpis: {
                    vehicleCount,
                    activeVehicles,
                    fuelMonthTotal: Number(fuelMonth._sum.total || 0),
                    fuelMonthLiters: Number(fuelMonth._sum.liters || 0),
                    fuelMonthCount: fuelMonth._count || 0,
                    maintenanceMonthTotal: Number(maintenanceMonth._sum.cost || 0),
                    maintenanceMonthCount: maintenanceMonth._count || 0,
                    insurancesExpiringSoonCount: insurancesExpiringSoon.length,
                    insurancesExpiredCount: insurancesExpired.length,
                    inspectionsExpiringSoonCount: inspectionsExpiringSoon.length,
                    inspectionsExpiredCount: inspectionsExpired.length,
                    upcomingMaintenanceCount: upcomingMaintenance.length,
                    kmOverdueCount: dueKmAlerts.length,
                },
                alerts: {
                    insurancesExpiringSoon: decorate(insurancesExpiringSoon, 'endDate'),
                    insurancesExpired: decorate(insurancesExpired, 'endDate'),
                    inspectionsExpiringSoon: decorate(inspectionsExpiringSoon, 'expiryDate'),
                    inspectionsExpired: decorate(inspectionsExpired, 'expiryDate'),
                    upcomingMaintenance: decorate(upcomingMaintenance, 'nextDate'),
                    kmOverdue: dueKmAlerts,
                },
                recent: {
                    fuel: latestFuel.map((f) => ({ ...f, vehicle: vehMap.get(f.vehicleId) || null, total: Number(f.total || 0), liters: Number(f.liters || 0) })),
                    maintenance: latestMaintenance.map((m) => ({ ...m, vehicle: vehMap.get(m.vehicleId) || null, cost: Number(m.cost || 0) })),
                },
            },
        });
    } catch (error) {
        console.error('partner-fleet dashboard error:', error);
        res.status(500).json({ success: false, error: 'Genel durum alınamadı' });
    }
});

// ─────────────────────────────────────────────────────────────────
// INSURANCE
// ─────────────────────────────────────────────────────────────────
router.get('/insurances', authMiddleware, async (req, res) => {
    const scope = ensurePartner(req, res);
    if (!scope) return;
    try {
        const { vehicleId, type, status } = req.query;
        const where = { tenantId: scope.tenantId, partnerId: scope.partnerId };
        if (vehicleId) where.vehicleId = String(vehicleId);
        if (type) where.type = String(type);
        if (status) where.status = String(status);
        const rows = await prisma.partnerVehicleInsurance.findMany({ where, orderBy: { endDate: 'asc' } });
        const veh = await prisma.vehicle.findMany({ where: { id: { in: Array.from(new Set(rows.map((r) => r.vehicleId))) } } });
        const m = new Map(veh.map((v) => [v.id, { plate: v.plateNumber, brand: v.brand, model: v.model }]));
        res.json({ success: true, data: rows.map((r) => ({ ...r, vehicle: m.get(r.vehicleId) || null, premium: r.premium ? Number(r.premium) : null })) });
    } catch (error) {
        console.error('insurances list error:', error);
        res.status(500).json({ success: false, error: 'Sigorta kayıtları alınamadı' });
    }
});

router.post('/insurances', authMiddleware, async (req, res) => {
    const scope = ensurePartner(req, res);
    if (!scope) return;
    try {
        const b = req.body || {};
        const veh = await ensureVehicleOwnership(scope, b.vehicleId);
        if (!veh) return res.status(400).json({ success: false, error: 'Araç size ait değil' });
        if (!b.startDate || !b.endDate) return res.status(400).json({ success: false, error: 'Başlangıç ve bitiş tarihi gerekli' });
        const data = await prisma.partnerVehicleInsurance.create({
            data: {
                tenantId: scope.tenantId, partnerId: scope.partnerId, vehicleId: veh.id,
                type: b.type || 'TRAFIK', status: b.status || 'ACTIVE',
                policyNo: b.policyNo || null, company: b.company || null,
                agentName: b.agentName || null, agentPhone: b.agentPhone || null, agentEmail: b.agentEmail || null,
                startDate: new Date(b.startDate), endDate: new Date(b.endDate),
                premium: toNum(b.premium), currency: b.currency || 'TRY',
                documentUrl: b.documentUrl || null, notes: b.notes || null,
                metadata: b.metadata || null, createdById: scope.partnerId,
            },
        });
        res.json({ success: true, data });
    } catch (error) {
        console.error('insurance create error:', error);
        res.status(500).json({ success: false, error: 'Sigorta kaydı oluşturulamadı' });
    }
});

router.put('/insurances/:id', authMiddleware, async (req, res) => {
    const scope = ensurePartner(req, res);
    if (!scope) return;
    try {
        const existing = await prisma.partnerVehicleInsurance.findFirst({
            where: { id: req.params.id, tenantId: scope.tenantId, partnerId: scope.partnerId },
        });
        if (!existing) return res.status(404).json({ success: false, error: 'Bulunamadı' });
        const b = req.body || {};
        const data = await prisma.partnerVehicleInsurance.update({
            where: { id: existing.id },
            data: {
                type: b.type ?? undefined, status: b.status ?? undefined,
                policyNo: b.policyNo ?? undefined, company: b.company ?? undefined,
                agentName: b.agentName ?? undefined, agentPhone: b.agentPhone ?? undefined, agentEmail: b.agentEmail ?? undefined,
                startDate: b.startDate ? new Date(b.startDate) : undefined,
                endDate: b.endDate ? new Date(b.endDate) : undefined,
                premium: b.premium !== undefined ? toNum(b.premium) : undefined,
                currency: b.currency ?? undefined,
                documentUrl: b.documentUrl ?? undefined, notes: b.notes ?? undefined,
            },
        });
        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Güncellenemedi' });
    }
});

router.delete('/insurances/:id', authMiddleware, async (req, res) => {
    const scope = ensurePartner(req, res);
    if (!scope) return;
    try {
        const existing = await prisma.partnerVehicleInsurance.findFirst({
            where: { id: req.params.id, tenantId: scope.tenantId, partnerId: scope.partnerId },
        });
        if (!existing) return res.status(404).json({ success: false, error: 'Bulunamadı' });
        await prisma.partnerVehicleInsurance.delete({ where: { id: existing.id } });
        res.json({ success: true });
    } catch (error) { res.status(500).json({ success: false, error: 'Silinemedi' }); }
});

// ─────────────────────────────────────────────────────────────────
// INSPECTIONS
// ─────────────────────────────────────────────────────────────────
router.get('/inspections', authMiddleware, async (req, res) => {
    const scope = ensurePartner(req, res);
    if (!scope) return;
    try {
        const { vehicleId, type, result } = req.query;
        const where = { tenantId: scope.tenantId, partnerId: scope.partnerId };
        if (vehicleId) where.vehicleId = String(vehicleId);
        if (type) where.type = String(type);
        if (result) where.result = String(result);
        const rows = await prisma.partnerVehicleInspection.findMany({ where, orderBy: { inspectionDate: 'desc' } });
        const veh = await prisma.vehicle.findMany({ where: { id: { in: Array.from(new Set(rows.map((r) => r.vehicleId))) } } });
        const m = new Map(veh.map((v) => [v.id, { plate: v.plateNumber, brand: v.brand, model: v.model }]));
        res.json({ success: true, data: rows.map((r) => ({ ...r, vehicle: m.get(r.vehicleId) || null, cost: r.cost ? Number(r.cost) : null })) });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Muayene kayıtları alınamadı' });
    }
});

router.post('/inspections', authMiddleware, async (req, res) => {
    const scope = ensurePartner(req, res);
    if (!scope) return;
    try {
        const b = req.body || {};
        const veh = await ensureVehicleOwnership(scope, b.vehicleId);
        if (!veh) return res.status(400).json({ success: false, error: 'Araç size ait değil' });
        if (!b.inspectionDate) return res.status(400).json({ success: false, error: 'Muayene tarihi gerekli' });
        const data = await prisma.partnerVehicleInspection.create({
            data: {
                tenantId: scope.tenantId, partnerId: scope.partnerId, vehicleId: veh.id,
                type: b.type || 'TUV', result: b.result || 'PENDING',
                inspectionDate: new Date(b.inspectionDate),
                expiryDate: b.expiryDate ? new Date(b.expiryDate) : null,
                stationName: b.stationName || null, stationCity: b.stationCity || null,
                reportNo: b.reportNo || null,
                cost: toNum(b.cost), currency: b.currency || 'TRY',
                kmAtInspection: b.kmAtInspection ? Number(b.kmAtInspection) : null,
                documentUrl: b.documentUrl || null, notes: b.notes || null,
                metadata: b.metadata || null, createdById: scope.partnerId,
            },
        });
        res.json({ success: true, data });
    } catch (error) {
        console.error('inspection create error:', error);
        res.status(500).json({ success: false, error: 'Muayene kaydı oluşturulamadı' });
    }
});

router.put('/inspections/:id', authMiddleware, async (req, res) => {
    const scope = ensurePartner(req, res);
    if (!scope) return;
    try {
        const existing = await prisma.partnerVehicleInspection.findFirst({
            where: { id: req.params.id, tenantId: scope.tenantId, partnerId: scope.partnerId },
        });
        if (!existing) return res.status(404).json({ success: false, error: 'Bulunamadı' });
        const b = req.body || {};
        const data = await prisma.partnerVehicleInspection.update({
            where: { id: existing.id },
            data: {
                type: b.type ?? undefined, result: b.result ?? undefined,
                inspectionDate: b.inspectionDate ? new Date(b.inspectionDate) : undefined,
                expiryDate: b.expiryDate ? new Date(b.expiryDate) : undefined,
                stationName: b.stationName ?? undefined, stationCity: b.stationCity ?? undefined,
                reportNo: b.reportNo ?? undefined,
                cost: b.cost !== undefined ? toNum(b.cost) : undefined,
                kmAtInspection: b.kmAtInspection !== undefined ? Number(b.kmAtInspection) : undefined,
                documentUrl: b.documentUrl ?? undefined, notes: b.notes ?? undefined,
            },
        });
        res.json({ success: true, data });
    } catch { res.status(500).json({ success: false, error: 'Güncellenemedi' }); }
});

router.delete('/inspections/:id', authMiddleware, async (req, res) => {
    const scope = ensurePartner(req, res);
    if (!scope) return;
    try {
        const existing = await prisma.partnerVehicleInspection.findFirst({
            where: { id: req.params.id, tenantId: scope.tenantId, partnerId: scope.partnerId },
        });
        if (!existing) return res.status(404).json({ success: false, error: 'Bulunamadı' });
        await prisma.partnerVehicleInspection.delete({ where: { id: existing.id } });
        res.json({ success: true });
    } catch { res.status(500).json({ success: false, error: 'Silinemedi' }); }
});

// ─────────────────────────────────────────────────────────────────
// MAINTENANCE
// ─────────────────────────────────────────────────────────────────
router.get('/maintenance', authMiddleware, async (req, res) => {
    const scope = ensurePartner(req, res);
    if (!scope) return;
    try {
        const { vehicleId, type, from, to } = req.query;
        const where = { tenantId: scope.tenantId, partnerId: scope.partnerId };
        if (vehicleId) where.vehicleId = String(vehicleId);
        if (type) where.type = String(type);
        if (from || to) where.serviceDate = {};
        if (from) where.serviceDate.gte = new Date(String(from));
        if (to) where.serviceDate.lte = new Date(String(to));
        const rows = await prisma.partnerVehicleMaintenance.findMany({ where, orderBy: { serviceDate: 'desc' } });
        const veh = await prisma.vehicle.findMany({ where: { id: { in: Array.from(new Set(rows.map((r) => r.vehicleId))) } } });
        const m = new Map(veh.map((v) => [v.id, { plate: v.plateNumber, brand: v.brand, model: v.model }]));
        res.json({ success: true, data: rows.map((r) => ({ ...r, vehicle: m.get(r.vehicleId) || null, cost: r.cost ? Number(r.cost) : null, laborCost: r.laborCost ? Number(r.laborCost) : null, partsCost: r.partsCost ? Number(r.partsCost) : null })) });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Bakım kayıtları alınamadı' });
    }
});

router.post('/maintenance', authMiddleware, async (req, res) => {
    const scope = ensurePartner(req, res);
    if (!scope) return;
    try {
        const b = req.body || {};
        const veh = await ensureVehicleOwnership(scope, b.vehicleId);
        if (!veh) return res.status(400).json({ success: false, error: 'Araç size ait değil' });
        if (!b.serviceDate) return res.status(400).json({ success: false, error: 'Bakım tarihi gerekli' });
        const data = await prisma.partnerVehicleMaintenance.create({
            data: {
                tenantId: scope.tenantId, partnerId: scope.partnerId, vehicleId: veh.id,
                type: b.type || 'PERIODIC', description: b.description || null,
                serviceDate: new Date(b.serviceDate),
                kmAtService: b.kmAtService ? Number(b.kmAtService) : null,
                nextKm: b.nextKm ? Number(b.nextKm) : null,
                nextDate: b.nextDate ? new Date(b.nextDate) : null,
                vendor: b.vendor || null, vendorPhone: b.vendorPhone || null, invoiceNo: b.invoiceNo || null,
                cost: toNum(b.cost), laborCost: toNum(b.laborCost), partsCost: toNum(b.partsCost),
                currency: b.currency || 'TRY',
                partsList: Array.isArray(b.partsList) ? b.partsList : null,
                documentUrl: b.documentUrl || null, notes: b.notes || null,
                metadata: b.metadata || null, createdById: scope.partnerId,
            },
        });

        // Update vehicle currentKm if higher
        if (b.kmAtService && Number(b.kmAtService) > 0) {
            const meta = { ...(veh.metadata || {}) };
            if (!meta.currentKm || Number(meta.currentKm) < Number(b.kmAtService)) {
                meta.currentKm = Number(b.kmAtService);
                await prisma.vehicle.update({ where: { id: veh.id }, data: { metadata: meta } });
            }
        }

        res.json({ success: true, data });
    } catch (error) {
        console.error('maintenance create error:', error);
        res.status(500).json({ success: false, error: 'Bakım kaydı oluşturulamadı' });
    }
});

router.put('/maintenance/:id', authMiddleware, async (req, res) => {
    const scope = ensurePartner(req, res);
    if (!scope) return;
    try {
        const existing = await prisma.partnerVehicleMaintenance.findFirst({
            where: { id: req.params.id, tenantId: scope.tenantId, partnerId: scope.partnerId },
        });
        if (!existing) return res.status(404).json({ success: false, error: 'Bulunamadı' });
        const b = req.body || {};
        const data = await prisma.partnerVehicleMaintenance.update({
            where: { id: existing.id },
            data: {
                type: b.type ?? undefined, description: b.description ?? undefined,
                serviceDate: b.serviceDate ? new Date(b.serviceDate) : undefined,
                kmAtService: b.kmAtService !== undefined ? Number(b.kmAtService) : undefined,
                nextKm: b.nextKm !== undefined ? Number(b.nextKm) : undefined,
                nextDate: b.nextDate ? new Date(b.nextDate) : undefined,
                vendor: b.vendor ?? undefined, vendorPhone: b.vendorPhone ?? undefined,
                invoiceNo: b.invoiceNo ?? undefined,
                cost: b.cost !== undefined ? toNum(b.cost) : undefined,
                laborCost: b.laborCost !== undefined ? toNum(b.laborCost) : undefined,
                partsCost: b.partsCost !== undefined ? toNum(b.partsCost) : undefined,
                partsList: Array.isArray(b.partsList) ? b.partsList : undefined,
                documentUrl: b.documentUrl ?? undefined, notes: b.notes ?? undefined,
            },
        });
        res.json({ success: true, data });
    } catch { res.status(500).json({ success: false, error: 'Güncellenemedi' }); }
});

router.delete('/maintenance/:id', authMiddleware, async (req, res) => {
    const scope = ensurePartner(req, res);
    if (!scope) return;
    try {
        const existing = await prisma.partnerVehicleMaintenance.findFirst({
            where: { id: req.params.id, tenantId: scope.tenantId, partnerId: scope.partnerId },
        });
        if (!existing) return res.status(404).json({ success: false, error: 'Bulunamadı' });
        await prisma.partnerVehicleMaintenance.delete({ where: { id: existing.id } });
        res.json({ success: true });
    } catch { res.status(500).json({ success: false, error: 'Silinemedi' }); }
});

// ─────────────────────────────────────────────────────────────────
// FUEL
// ─────────────────────────────────────────────────────────────────
router.get('/fuel', authMiddleware, async (req, res) => {
    const scope = ensurePartner(req, res);
    if (!scope) return;
    try {
        const { vehicleId, fuelType, from, to } = req.query;
        const where = { tenantId: scope.tenantId, partnerId: scope.partnerId };
        if (vehicleId) where.vehicleId = String(vehicleId);
        if (fuelType) where.fuelType = String(fuelType);
        if (from || to) where.date = {};
        if (from) where.date.gte = new Date(String(from));
        if (to) where.date.lte = new Date(String(to));
        const rows = await prisma.partnerVehicleFuelEntry.findMany({ where, orderBy: { date: 'desc' } });
        const veh = await prisma.vehicle.findMany({ where: { id: { in: Array.from(new Set(rows.map((r) => r.vehicleId))) } } });
        const m = new Map(veh.map((v) => [v.id, { plate: v.plateNumber, brand: v.brand, model: v.model }]));
        res.json({ success: true, data: rows.map((r) => ({ ...r, vehicle: m.get(r.vehicleId) || null, total: Number(r.total || 0), liters: Number(r.liters || 0), unitPrice: r.unitPrice ? Number(r.unitPrice) : null, consumption: r.consumption ? Number(r.consumption) : null })) });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Yakıt kayıtları alınamadı' });
    }
});

router.post('/fuel', authMiddleware, async (req, res) => {
    const scope = ensurePartner(req, res);
    if (!scope) return;
    try {
        const b = req.body || {};
        const veh = await ensureVehicleOwnership(scope, b.vehicleId);
        if (!veh) return res.status(400).json({ success: false, error: 'Araç size ait değil' });
        if (b.driverId) {
            const d = await prisma.user.findFirst({ where: { id: b.driverId, partnerId: scope.partnerId } });
            if (!d) return res.status(400).json({ success: false, error: 'Şoför ekibinizde değil' });
        }
        if (!b.total) return res.status(400).json({ success: false, error: 'Tutar zorunlu' });

        // compute consumption if previous km exists
        let kmSincePrev = null;
        let consumption = null;
        if (b.km != null && Number(b.km) > 0) {
            const prev = await prisma.partnerVehicleFuelEntry.findFirst({
                where: { tenantId: scope.tenantId, partnerId: scope.partnerId, vehicleId: veh.id, km: { not: null, lt: Number(b.km) } },
                orderBy: { date: 'desc' },
            });
            if (prev && prev.km) {
                kmSincePrev = Number(b.km) - Number(prev.km);
                if (kmSincePrev > 0 && b.liters && Number(b.liters) > 0) {
                    consumption = Number((100 * Number(b.liters)) / kmSincePrev);
                    if (consumption > 100) consumption = null; // discard absurd values
                }
            }
        }

        const data = await prisma.partnerVehicleFuelEntry.create({
            data: {
                tenantId: scope.tenantId, partnerId: scope.partnerId, vehicleId: veh.id,
                driverId: b.driverId || null,
                date: b.date ? new Date(b.date) : new Date(),
                fuelType: b.fuelType || 'DIESEL',
                liters: toNum(b.liters), unitPrice: toNum(b.unitPrice),
                total: toNum(b.total) || 0, currency: b.currency || 'TRY',
                km: b.km != null ? Number(b.km) : null,
                kmSincePrev, consumption: consumption != null ? Math.round(consumption * 100) / 100 : null,
                stationName: b.stationName || null, stationCity: b.stationCity || null,
                receiptNo: b.receiptNo || null,
                paymentMethod: b.paymentMethod || 'CASH',
                documentUrl: b.documentUrl || null, notes: b.notes || null,
                metadata: b.metadata || null, createdById: scope.partnerId,
            },
        });

        if (b.km && Number(b.km) > 0) {
            const meta = { ...(veh.metadata || {}) };
            if (!meta.currentKm || Number(meta.currentKm) < Number(b.km)) {
                meta.currentKm = Number(b.km);
                await prisma.vehicle.update({ where: { id: veh.id }, data: { metadata: meta } });
            }
        }

        res.json({ success: true, data });
    } catch (error) {
        console.error('fuel create error:', error);
        res.status(500).json({ success: false, error: 'Yakıt kaydı oluşturulamadı' });
    }
});

router.put('/fuel/:id', authMiddleware, async (req, res) => {
    const scope = ensurePartner(req, res);
    if (!scope) return;
    try {
        const existing = await prisma.partnerVehicleFuelEntry.findFirst({
            where: { id: req.params.id, tenantId: scope.tenantId, partnerId: scope.partnerId },
        });
        if (!existing) return res.status(404).json({ success: false, error: 'Bulunamadı' });
        const b = req.body || {};
        const data = await prisma.partnerVehicleFuelEntry.update({
            where: { id: existing.id },
            data: {
                fuelType: b.fuelType ?? undefined,
                liters: b.liters !== undefined ? toNum(b.liters) : undefined,
                unitPrice: b.unitPrice !== undefined ? toNum(b.unitPrice) : undefined,
                total: b.total !== undefined ? toNum(b.total) : undefined,
                date: b.date ? new Date(b.date) : undefined,
                km: b.km !== undefined ? Number(b.km) : undefined,
                stationName: b.stationName ?? undefined, stationCity: b.stationCity ?? undefined,
                receiptNo: b.receiptNo ?? undefined,
                paymentMethod: b.paymentMethod ?? undefined,
                notes: b.notes ?? undefined,
            },
        });
        res.json({ success: true, data });
    } catch { res.status(500).json({ success: false, error: 'Güncellenemedi' }); }
});

router.delete('/fuel/:id', authMiddleware, async (req, res) => {
    const scope = ensurePartner(req, res);
    if (!scope) return;
    try {
        const existing = await prisma.partnerVehicleFuelEntry.findFirst({
            where: { id: req.params.id, tenantId: scope.tenantId, partnerId: scope.partnerId },
        });
        if (!existing) return res.status(404).json({ success: false, error: 'Bulunamadı' });
        await prisma.partnerVehicleFuelEntry.delete({ where: { id: existing.id } });
        res.json({ success: true });
    } catch { res.status(500).json({ success: false, error: 'Silinemedi' }); }
});

router.get('/fuel/stats', authMiddleware, async (req, res) => {
    const scope = ensurePartner(req, res);
    if (!scope) return;
    try {
        const { vehicleId } = req.query;
        const where = { tenantId: scope.tenantId, partnerId: scope.partnerId };
        if (vehicleId) where.vehicleId = String(vehicleId);
        const all = await prisma.partnerVehicleFuelEntry.findMany({ where, orderBy: { date: 'asc' } });
        // Aggregate by month
        const monthly = new Map();
        for (const f of all) {
            const k = `${f.date.getFullYear()}-${String(f.date.getMonth() + 1).padStart(2, '0')}`;
            if (!monthly.has(k)) monthly.set(k, { month: k, total: 0, liters: 0, count: 0 });
            const m = monthly.get(k);
            m.total += Number(f.total || 0);
            m.liters += Number(f.liters || 0);
            m.count += 1;
        }
        // Per-vehicle averages
        const byVeh = new Map();
        for (const f of all) {
            if (!byVeh.has(f.vehicleId)) byVeh.set(f.vehicleId, { vehicleId: f.vehicleId, total: 0, liters: 0, count: 0, consumptions: [] });
            const v = byVeh.get(f.vehicleId);
            v.total += Number(f.total || 0);
            v.liters += Number(f.liters || 0);
            v.count += 1;
            if (f.consumption) v.consumptions.push(Number(f.consumption));
        }
        const veh = await prisma.vehicle.findMany({ where: { ownerId: scope.partnerId, tenantId: scope.tenantId } });
        const m = new Map(veh.map((v) => [v.id, { plate: v.plateNumber, brand: v.brand, model: v.model }]));
        const perVehicle = Array.from(byVeh.values()).map((v) => ({
            ...v,
            vehicle: m.get(v.vehicleId) || null,
            avgConsumption: v.consumptions.length ? Math.round((v.consumptions.reduce((a, b) => a + b, 0) / v.consumptions.length) * 100) / 100 : null,
        }));
        res.json({ success: true, data: { monthly: Array.from(monthly.values()), perVehicle } });
    } catch (error) {
        res.status(500).json({ success: false, error: 'İstatistik üretilemedi' });
    }
});

// ─────────────────────────────────────────────────────────────────
// DOCUMENTS — Ruhsat, K-Belgesi, Yetki, Takograf vb.
// ─────────────────────────────────────────────────────────────────
router.get('/documents', authMiddleware, async (req, res) => {
    const scope = ensurePartner(req, res);
    if (!scope) return;
    try {
        const { vehicleId, category } = req.query;
        const where = { tenantId: scope.tenantId, partnerId: scope.partnerId };
        if (vehicleId) where.vehicleId = String(vehicleId);
        if (category) where.category = String(category);
        const rows = await prisma.partnerVehicleDocument.findMany({ where, orderBy: { expiryDate: 'asc' } });
        res.json({ success: true, data: rows });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Belgeler alınamadı' });
    }
});

router.post('/documents', authMiddleware, async (req, res) => {
    const scope = ensurePartner(req, res);
    if (!scope) return;
    try {
        const b = req.body || {};
        const veh = await ensureVehicleOwnership(scope, b.vehicleId);
        if (!veh) return res.status(400).json({ success: false, error: 'Araç size ait değil' });
        const data = await prisma.partnerVehicleDocument.create({
            data: {
                tenantId: scope.tenantId, partnerId: scope.partnerId, vehicleId: veh.id,
                category: b.category || 'DIGER', name: b.name || 'Belge',
                fileUrl: b.fileUrl || null, documentNo: b.documentNo || null,
                issuedAt: b.issuedAt ? new Date(b.issuedAt) : null,
                expiryDate: b.expiryDate ? new Date(b.expiryDate) : null,
                notes: b.notes || null, metadata: b.metadata || null,
            },
        });
        res.json({ success: true, data });
    } catch { res.status(500).json({ success: false, error: 'Belge eklenemedi' }); }
});

router.delete('/documents/:id', authMiddleware, async (req, res) => {
    const scope = ensurePartner(req, res);
    if (!scope) return;
    try {
        const existing = await prisma.partnerVehicleDocument.findFirst({
            where: { id: req.params.id, tenantId: scope.tenantId, partnerId: scope.partnerId },
        });
        if (!existing) return res.status(404).json({ success: false, error: 'Bulunamadı' });
        await prisma.partnerVehicleDocument.delete({ where: { id: existing.id } });
        res.json({ success: true });
    } catch { res.status(500).json({ success: false, error: 'Silinemedi' }); }
});

// ─────────────────────────────────────────────────────────────────
// FILE UPLOAD (insurance / inspection / maintenance / fuel docs)
// ─────────────────────────────────────────────────────────────────
const fleetUploadDir = path.join(__dirname, '../../public/uploads/fleet');
fs.ensureDirSync(fleetUploadDir);
const fleetUpload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => cb(null, fleetUploadDir),
        filename: (req, file, cb) => {
            const uniq = Date.now() + '-' + crypto.randomBytes(4).toString('hex');
            cb(null, uniq + path.extname(file.originalname).toLowerCase());
        },
    }),
    limits: { fileSize: 20 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const ok = file.mimetype.startsWith('image/')
            || file.mimetype === 'application/pdf'
            || file.mimetype === 'application/octet-stream';
        if (ok) cb(null, true); else cb(new Error('Yalnız PDF ya da resim yüklenebilir'));
    },
});

router.post('/upload', authMiddleware, fleetUpload.single('file'), (req, res) => {
    const scope = ensurePartner(req, res);
    if (!scope) return;
    if (!req.file) return res.status(400).json({ success: false, error: 'Dosya alınamadı' });
    res.json({
        success: true,
        data: {
            url: `/uploads/fleet/${req.file.filename}`,
            filename: req.file.filename,
            originalName: req.file.originalname,
            mimetype: req.file.mimetype,
            size: req.file.size,
        },
    });
});

// ─────────────────────────────────────────────────────────────────
// ANALYTICS — Cost analysis per vehicle / fleet-wide
// ─────────────────────────────────────────────────────────────────
function monthKey(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

router.get('/analytics/overview', authMiddleware, async (req, res) => {
    const scope = ensurePartner(req, res);
    if (!scope) return;
    try {
        const months = Math.max(1, Math.min(36, Number(req.query.months) || 12));
        const from = new Date();
        from.setDate(1);
        from.setMonth(from.getMonth() - (months - 1));
        from.setHours(0, 0, 0, 0);

        const baseWhere = { tenantId: scope.tenantId, partnerId: scope.partnerId };

        const [fuels, maints, inspects, insurs, vehicles] = await Promise.all([
            prisma.partnerVehicleFuelEntry.findMany({ where: { ...baseWhere, date: { gte: from } } }),
            prisma.partnerVehicleMaintenance.findMany({ where: { ...baseWhere, serviceDate: { gte: from } } }),
            prisma.partnerVehicleInspection.findMany({ where: { ...baseWhere, inspectionDate: { gte: from } } }),
            prisma.partnerVehicleInsurance.findMany({ where: { ...baseWhere, startDate: { gte: from } } }),
            prisma.vehicle.findMany({ where: { ownerId: scope.partnerId, tenantId: scope.tenantId } }),
        ]);

        const vMap = new Map(vehicles.map((v) => [v.id, { plate: v.plateNumber, brand: v.brand, model: v.model }]));

        // Monthly series (fuel + maintenance + insurance/inspection costs)
        const series = new Map();
        const ensure = (k) => {
            if (!series.has(k)) series.set(k, { month: k, fuel: 0, maintenance: 0, inspection: 0, insurance: 0, total: 0 });
            return series.get(k);
        };
        // Initialize months sequence
        for (let i = 0; i < months; i++) {
            const d = new Date(from);
            d.setMonth(d.getMonth() + i);
            ensure(monthKey(d));
        }

        for (const f of fuels) ensure(monthKey(new Date(f.date))).fuel += Number(f.total || 0);
        for (const m of maints) ensure(monthKey(new Date(m.serviceDate))).maintenance += Number(m.cost || 0);
        for (const i of inspects) ensure(monthKey(new Date(i.inspectionDate))).inspection += Number(i.cost || 0);
        for (const ip of insurs) ensure(monthKey(new Date(ip.startDate))).insurance += Number(ip.premium || 0);
        for (const r of series.values()) r.total = r.fuel + r.maintenance + r.inspection + r.insurance;

        // Per-vehicle aggregates
        const byVehicle = new Map();
        const ensureV = (id) => {
            if (!byVehicle.has(id)) byVehicle.set(id, {
                vehicleId: id, vehicle: vMap.get(id) || null,
                fuelTotal: 0, fuelLiters: 0, fuelCount: 0,
                maintenanceTotal: 0, maintenanceCount: 0,
                inspectionTotal: 0, insuranceTotal: 0,
                lastKm: 0, kmFrom: null, kmTo: null,
                consumptions: [],
            });
            return byVehicle.get(id);
        };
        for (const f of fuels) {
            const r = ensureV(f.vehicleId);
            r.fuelTotal += Number(f.total || 0);
            r.fuelLiters += Number(f.liters || 0);
            r.fuelCount += 1;
            if (f.km) {
                r.kmFrom = r.kmFrom == null ? Number(f.km) : Math.min(r.kmFrom, Number(f.km));
                r.kmTo = Math.max(r.kmTo || 0, Number(f.km));
                r.lastKm = Math.max(r.lastKm, Number(f.km));
            }
            if (f.consumption) r.consumptions.push(Number(f.consumption));
        }
        for (const m of maints) {
            const r = ensureV(m.vehicleId);
            r.maintenanceTotal += Number(m.cost || 0);
            r.maintenanceCount += 1;
        }
        for (const i of inspects) ensureV(i.vehicleId).inspectionTotal += Number(i.cost || 0);
        for (const ip of insurs) ensureV(ip.vehicleId).insuranceTotal += Number(ip.premium || 0);

        const perVehicle = Array.from(byVehicle.values()).map((r) => {
            const totalCost = r.fuelTotal + r.maintenanceTotal + r.inspectionTotal + r.insuranceTotal;
            const kmRange = r.kmTo && r.kmFrom ? Math.max(0, r.kmTo - r.kmFrom) : 0;
            const costPerKm = kmRange > 0 ? totalCost / kmRange : null;
            const avgConsumption = r.consumptions.length ? r.consumptions.reduce((s, x) => s + x, 0) / r.consumptions.length : null;
            return {
                ...r,
                totalCost,
                kmRange,
                costPerKm: costPerKm ? Math.round(costPerKm * 100) / 100 : null,
                avgConsumption: avgConsumption ? Math.round(avgConsumption * 100) / 100 : null,
            };
        }).sort((a, b) => b.totalCost - a.totalCost);

        // Top cost categories overall
        const totalFuel = fuels.reduce((s, x) => s + Number(x.total || 0), 0);
        const totalMaintenance = maints.reduce((s, x) => s + Number(x.cost || 0), 0);
        const totalInspection = inspects.reduce((s, x) => s + Number(x.cost || 0), 0);
        const totalInsurance = insurs.reduce((s, x) => s + Number(x.premium || 0), 0);
        const grand = totalFuel + totalMaintenance + totalInspection + totalInsurance;

        // Top expense vendors
        const vendorMap = new Map();
        for (const m of maints) {
            if (!m.vendor) continue;
            if (!vendorMap.has(m.vendor)) vendorMap.set(m.vendor, { vendor: m.vendor, total: 0, count: 0 });
            const r = vendorMap.get(m.vendor);
            r.total += Number(m.cost || 0);
            r.count += 1;
        }
        const topVendors = Array.from(vendorMap.values()).sort((a, b) => b.total - a.total).slice(0, 10);

        // Top fuel stations
        const stationMap = new Map();
        for (const f of fuels) {
            if (!f.stationName) continue;
            if (!stationMap.has(f.stationName)) stationMap.set(f.stationName, { name: f.stationName, total: 0, liters: 0, count: 0 });
            const r = stationMap.get(f.stationName);
            r.total += Number(f.total || 0);
            r.liters += Number(f.liters || 0);
            r.count += 1;
        }
        const topStations = Array.from(stationMap.values()).sort((a, b) => b.total - a.total).slice(0, 10);

        // Maintenance by type
        const maintByType = new Map();
        for (const m of maints) {
            if (!maintByType.has(m.type)) maintByType.set(m.type, { type: m.type, total: 0, count: 0 });
            const r = maintByType.get(m.type);
            r.total += Number(m.cost || 0);
            r.count += 1;
        }

        res.json({
            success: true,
            data: {
                period: { from, months },
                totals: {
                    fuel: totalFuel, maintenance: totalMaintenance,
                    inspection: totalInspection, insurance: totalInsurance,
                    grand,
                },
                monthly: Array.from(series.values()).sort((a, b) => a.month.localeCompare(b.month)),
                perVehicle,
                topVendors,
                topStations,
                maintenanceByType: Array.from(maintByType.values()).sort((a, b) => b.total - a.total),
            },
        });
    } catch (error) {
        console.error('analytics overview error:', error);
        res.status(500).json({ success: false, error: 'Analiz üretilemedi' });
    }
});

router.get('/analytics/vehicle/:id', authMiddleware, async (req, res) => {
    const scope = ensurePartner(req, res);
    if (!scope) return;
    try {
        const veh = await ensureVehicleOwnership(scope, req.params.id);
        if (!veh) return res.status(404).json({ success: false, error: 'Araç bulunamadı' });
        const months = Math.max(1, Math.min(36, Number(req.query.months) || 12));
        const from = new Date();
        from.setDate(1);
        from.setMonth(from.getMonth() - (months - 1));
        from.setHours(0, 0, 0, 0);
        const baseWhere = { tenantId: scope.tenantId, partnerId: scope.partnerId, vehicleId: veh.id };

        const [fuels, maints, inspects, insurs] = await Promise.all([
            prisma.partnerVehicleFuelEntry.findMany({ where: { ...baseWhere, date: { gte: from } }, orderBy: { date: 'asc' } }),
            prisma.partnerVehicleMaintenance.findMany({ where: { ...baseWhere, serviceDate: { gte: from } }, orderBy: { serviceDate: 'asc' } }),
            prisma.partnerVehicleInspection.findMany({ where: baseWhere, orderBy: { inspectionDate: 'desc' } }),
            prisma.partnerVehicleInsurance.findMany({ where: baseWhere, orderBy: { endDate: 'desc' } }),
        ]);

        const series = [];
        for (let i = 0; i < months; i++) {
            const d = new Date(from);
            d.setMonth(d.getMonth() + i);
            const k = monthKey(d);
            series.push({ month: k, fuel: 0, maintenance: 0, total: 0, liters: 0, km: 0 });
        }
        const mapMonth = (k) => series.find((s) => s.month === k);
        for (const f of fuels) {
            const k = monthKey(new Date(f.date));
            const r = mapMonth(k);
            if (r) { r.fuel += Number(f.total || 0); r.liters += Number(f.liters || 0); }
        }
        for (const m of maints) {
            const k = monthKey(new Date(m.serviceDate));
            const r = mapMonth(k);
            if (r) r.maintenance += Number(m.cost || 0);
        }
        for (const r of series) r.total = r.fuel + r.maintenance;

        // km series from fuel entries
        const kmSeries = fuels.filter((f) => f.km).map((f) => ({ date: f.date, km: Number(f.km) }));

        const totalCost = fuels.reduce((s, x) => s + Number(x.total || 0), 0) + maints.reduce((s, x) => s + Number(x.cost || 0), 0);
        const totalLiters = fuels.reduce((s, x) => s + Number(x.liters || 0), 0);
        const consumptions = fuels.map((f) => f.consumption).filter(Boolean).map(Number);
        const avgCons = consumptions.length ? consumptions.reduce((s, x) => s + x, 0) / consumptions.length : null;

        res.json({
            success: true,
            data: {
                vehicle: { id: veh.id, plate: veh.plateNumber, brand: veh.brand, model: veh.model, currentKm: Number(veh.metadata?.currentKm || 0) },
                period: { from, months },
                series,
                kmSeries,
                summary: {
                    totalCost,
                    totalLiters,
                    avgConsumption: avgCons ? Math.round(avgCons * 100) / 100 : null,
                    fuelCount: fuels.length,
                    maintenanceCount: maints.length,
                },
                recentMaintenance: maints.slice(-10).reverse(),
                upcomingInsurances: insurs,
                upcomingInspections: inspects,
            },
        });
    } catch (error) {
        console.error('analytics vehicle error:', error);
        res.status(500).json({ success: false, error: 'Analiz üretilemedi' });
    }
});

// ─────────────────────────────────────────────────────────────────
// TELEMETRY — GPS / IoT ingestion + live snapshot
// Device API keys (PartnerDeviceKey) used to authenticate POST.
// ─────────────────────────────────────────────────────────────────
function hashKey(plain) {
    return crypto.createHash('sha256').update(String(plain)).digest('hex');
}

router.get('/devices', authMiddleware, async (req, res) => {
    const scope = ensurePartner(req, res);
    if (!scope) return;
    try {
        const data = await prisma.partnerDeviceKey.findMany({
            where: { tenantId: scope.tenantId, partnerId: scope.partnerId },
            orderBy: { createdAt: 'desc' },
        });
        // Don't expose hash; just preview last seen / vehicle binding
        res.json({ success: true, data: data.map((d) => ({ ...d, apiKeyHash: undefined })) });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Cihaz listesi alınamadı' });
    }
});

router.post('/devices', authMiddleware, async (req, res) => {
    const scope = ensurePartner(req, res);
    if (!scope) return;
    try {
        const { name, vehicleId } = req.body || {};
        if (!name) return res.status(400).json({ success: false, error: 'Ad gerekli' });
        if (vehicleId) {
            const veh = await ensureVehicleOwnership(scope, vehicleId);
            if (!veh) return res.status(400).json({ success: false, error: 'Araç size ait değil' });
        }
        const plain = `dvk_${crypto.randomBytes(24).toString('hex')}`;
        const dev = await prisma.partnerDeviceKey.create({
            data: {
                tenantId: scope.tenantId, partnerId: scope.partnerId,
                name, vehicleId: vehicleId || null,
                apiKeyHash: hashKey(plain),
                isActive: true,
            },
        });
        // Return raw key only once
        res.json({ success: true, data: { id: dev.id, name: dev.name, apiKey: plain, vehicleId: dev.vehicleId } });
    } catch (error) {
        console.error('device create error:', error);
        res.status(500).json({ success: false, error: 'Cihaz oluşturulamadı' });
    }
});

router.delete('/devices/:id', authMiddleware, async (req, res) => {
    const scope = ensurePartner(req, res);
    if (!scope) return;
    try {
        const ex = await prisma.partnerDeviceKey.findFirst({ where: { id: req.params.id, tenantId: scope.tenantId, partnerId: scope.partnerId } });
        if (!ex) return res.status(404).json({ success: false, error: 'Bulunamadı' });
        await prisma.partnerDeviceKey.delete({ where: { id: ex.id } });
        res.json({ success: true });
    } catch { res.status(500).json({ success: false, error: 'Silinemedi' }); }
});

// PUBLIC ingestion (no authMiddleware) — uses X-API-Key header
router.post('/telemetry/ingest', async (req, res) => {
    try {
        const apiKey = req.headers['x-api-key'] || req.body?.apiKey;
        if (!apiKey) return res.status(401).json({ success: false, error: 'API key gerekli' });
        const device = await prisma.partnerDeviceKey.findFirst({ where: { apiKeyHash: hashKey(String(apiKey)), isActive: true } });
        if (!device) return res.status(401).json({ success: false, error: 'Geçersiz API key' });

        const events = Array.isArray(req.body?.events) ? req.body.events : [req.body];
        let inserted = 0;
        let latestOdometer = null;
        let bindVehicleId = device.vehicleId;

        for (const e of events) {
            const vId = bindVehicleId || e.vehicleId;
            if (!vId) continue;
            // Ensure ownership of vehicle
            const veh = await prisma.vehicle.findFirst({ where: { id: vId, ownerId: device.partnerId, tenantId: device.tenantId } });
            if (!veh) continue;
            await prisma.partnerVehicleTelemetry.create({
                data: {
                    tenantId: device.tenantId,
                    partnerId: device.partnerId,
                    vehicleId: veh.id,
                    driverId: e.driverId || null,
                    timestamp: e.timestamp ? new Date(e.timestamp) : new Date(),
                    lat: e.lat != null ? Number(e.lat) : null,
                    lng: e.lng != null ? Number(e.lng) : null,
                    heading: e.heading != null ? Number(e.heading) : null,
                    speed: e.speed != null ? Number(e.speed) : null,
                    odometer: e.odometer != null ? Number(e.odometer) : null,
                    fuelLevel: e.fuelLevel != null ? Number(e.fuelLevel) : null,
                    engineStatus: e.engineStatus || null,
                    batteryLevel: e.batteryLevel != null ? Number(e.batteryLevel) : null,
                    externalDeviceId: e.deviceId || null,
                    payload: e.payload || null,
                },
            });
            inserted++;
            if (e.odometer && (!latestOdometer || Number(e.odometer) > latestOdometer)) latestOdometer = Number(e.odometer);
            // Update vehicle currentKm
            if (e.odometer) {
                const meta = { ...(veh.metadata || {}) };
                if (!meta.currentKm || Number(meta.currentKm) < Number(e.odometer)) {
                    meta.currentKm = Number(e.odometer);
                    await prisma.vehicle.update({ where: { id: veh.id }, data: { metadata: meta } });
                }
            }
        }
        await prisma.partnerDeviceKey.update({ where: { id: device.id }, data: { lastSeenAt: new Date() } });
        res.json({ success: true, inserted });
    } catch (error) {
        console.error('telemetry ingest error:', error);
        res.status(500).json({ success: false, error: 'Veri kaydedilemedi' });
    }
});

router.get('/telemetry/live', authMiddleware, async (req, res) => {
    const scope = ensurePartner(req, res);
    if (!scope) return;
    try {
        // Last known position per vehicle (last 24h)
        const since = new Date(Date.now() - 24 * 3600 * 1000);
        const rows = await prisma.partnerVehicleTelemetry.findMany({
            where: { tenantId: scope.tenantId, partnerId: scope.partnerId, timestamp: { gte: since } },
            orderBy: { timestamp: 'desc' },
        });
        const lastByVehicle = new Map();
        for (const r of rows) {
            if (!lastByVehicle.has(r.vehicleId)) lastByVehicle.set(r.vehicleId, r);
        }
        const vehicles = await prisma.vehicle.findMany({ where: { ownerId: scope.partnerId, tenantId: scope.tenantId } });
        const data = vehicles.map((v) => {
            const t = lastByVehicle.get(v.id);
            return {
                id: v.id, plate: v.plateNumber, brand: v.brand, model: v.model,
                currentKm: Number(v.metadata?.currentKm || 0) || null,
                lastTelemetry: t ? {
                    timestamp: t.timestamp, lat: t.lat, lng: t.lng,
                    speed: t.speed, heading: t.heading, odometer: t.odometer,
                    fuelLevel: t.fuelLevel, engineStatus: t.engineStatus,
                    minutesAgo: Math.floor((Date.now() - new Date(t.timestamp).getTime()) / 60000),
                } : null,
            };
        });
        res.json({ success: true, data });
    } catch (error) {
        console.error('telemetry live error:', error);
        res.status(500).json({ success: false, error: 'Canlı veri alınamadı' });
    }
});

router.get('/telemetry/history', authMiddleware, async (req, res) => {
    const scope = ensurePartner(req, res);
    if (!scope) return;
    try {
        const { vehicleId, from, to } = req.query;
        if (!vehicleId) return res.status(400).json({ success: false, error: 'vehicleId gerekli' });
        const veh = await ensureVehicleOwnership(scope, String(vehicleId));
        if (!veh) return res.status(404).json({ success: false, error: 'Araç bulunamadı' });
        const where = { tenantId: scope.tenantId, partnerId: scope.partnerId, vehicleId: veh.id };
        if (from || to) where.timestamp = {};
        if (from) where.timestamp.gte = new Date(String(from));
        if (to) where.timestamp.lte = new Date(String(to));
        const rows = await prisma.partnerVehicleTelemetry.findMany({ where, orderBy: { timestamp: 'asc' }, take: 5000 });
        res.json({ success: true, data: rows });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Tarihçe alınamadı' });
    }
});

module.exports = router;
