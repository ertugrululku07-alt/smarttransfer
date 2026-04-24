const express = require('express');

const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
const prisma = require('../lib/prisma');

/*
 * Vehicle Tracking API
 * All data is stored in vehicle.metadata.tracking object
 * Structure:
 * {
 *   insurance: [{ id, company, policyNo, startDate, endDate, cost, notes }],
 *   fuel: [{ id, date, liters, unitPrice, totalCost, km, station, notes }],
 *   inspection: [{ id, date, nextDate, station, result, cost, notes }],
 *   maintenance: [{ id, date, type, description, cost, km, workshop, notes }],
 *   totalKm: number,  // manually updated or from transfers
 * }
 */

function genId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

async function getVehicleWithTracking(vehicleId, tenantId) {
    const vehicle = await prisma.vehicle.findFirst({
        where: { id: vehicleId, tenantId },
        include: { vehicleType: true }
    });
    if (!vehicle) return null;
    if (!vehicle.metadata) vehicle.metadata = {};
    if (!vehicle.metadata.tracking) vehicle.metadata.tracking = {};
    const t = vehicle.metadata.tracking;
    if (!t.insurance) t.insurance = [];
    if (!t.fuel) t.fuel = [];
    if (!t.inspection) t.inspection = [];
    if (!t.maintenance) t.maintenance = [];
    if (!t.totalKm) t.totalKm = 0;
    return vehicle;
}

async function saveTracking(vehicleId, tracking) {
    const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
    const updatedMetadata = { ...(vehicle.metadata || {}), tracking };
    await prisma.vehicle.update({
        where: { id: vehicleId },
        data: { metadata: updatedMetadata }
    });
}

/* ─── SUMMARY: GET /api/vehicle-tracking (all vehicles summary) ─ */
router.get('/', authMiddleware, async (req, res) => {
    try {
        const tenantId = req.tenant?.id || req.user?.tenantId;
        console.log(`[VehicleTracking] GET / hit for tenantId: ${tenantId}`);

        const vehicles = await prisma.vehicle.findMany({
            where: { tenantId, status: { not: 'RETIRED' } },
            include: { vehicleType: true }
        });

        console.log(`[VehicleTracking] Found ${vehicles.length} non-RETIRED vehicles`);

        // Also get transfer KMs
        const transfers = await prisma.booking.findMany({
            where: { tenantId, status: { in: ['COMPLETED', 'CONFIRMED'] } },
            select: { metadata: true }
        });

        const kmByVehicle = {};
        transfers.forEach(t => {
            const trackingMeta = t.metadata || {};
            const assignedVehicleId = trackingMeta.assignedVehicleId;
            const routeDetails = trackingMeta.routeDetails || {};

            if (!assignedVehicleId) return;
            const km = routeDetails.distance_km || trackingMeta.distanceKm || trackingMeta.distance || 0;
            kmByVehicle[assignedVehicleId] = (kmByVehicle[assignedVehicleId] || 0) + Number(km);
        });

        const now = new Date();
        const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

        const data = vehicles.map(v => {
            const meta = v.metadata || {};
            const tracking = meta.tracking || {};
            const ins = tracking.insurance || [];
            const fuel = tracking.fuel || [];
            const insp = tracking.inspection || [];
            const maint = tracking.maintenance || [];

            const activeIns = ins.find(i => new Date(i.endDate) >= now);
            const lastInsp = insp.sort((a, b) => new Date(b.date) - new Date(a.date))[0];
            const nextInspDate = lastInsp?.nextDate ? new Date(lastInsp.nextDate) : null;

            const totalFuelCost = fuel.reduce((s, f) => s + (Number(f.totalCost) || 0), 0);
            const totalMaintCost = maint.reduce((s, m) => s + (Number(m.cost) || 0), 0);
            const totalInsCost = ins.reduce((s, i) => s + (Number(i.cost) || 0), 0);
            const totalFuelLiters = fuel.reduce((s, f) => s + (Number(f.liters) || 0), 0);

            const transferKm = kmByVehicle[v.id] || 0;
            const manualKm = tracking.totalKm || 0;
            const totalKm = Math.max(transferKm, manualKm);

            return {
                id: v.id,
                plateNumber: v.plateNumber,
                brand: v.brand,
                model: v.model,
                year: v.year,
                color: v.color,
                status: v.status,
                isActive: v.status === 'ACTIVE',
                vehicleClass: meta.vehicleClass,
                imageUrl: meta.imageUrl,
                vehicleType: v.vehicleType?.category,
                // Insurance
                insuranceStatus: !activeIns ? 'EXPIRED' : new Date(activeIns.endDate) <= in30 ? 'EXPIRING_SOON' : 'VALID',
                insuranceExpiry: activeIns?.endDate,
                insuranceCompany: activeIns?.company,
                // Inspection
                inspectionStatus: !nextInspDate ? 'UNKNOWN' : nextInspDate <= now ? 'OVERDUE' : nextInspDate <= in30 ? 'DUE_SOON' : 'OK',
                inspectionNextDate: lastInsp?.nextDate,
                // KM
                totalKm,
                transferKm,
                manualKm,
                transferCount: transfers.filter(t => t.assignedVehicleId === v.id).length,
                // Costs
                totalFuelCost,
                totalMaintCost,
                totalInsCost,
                totalFuelLiters,
                totalExpense: totalFuelCost + totalMaintCost + totalInsCost,
                // Latest records
                lastFuelDate: fuel.sort((a, b) => new Date(b.date) - new Date(a.date))[0]?.date,
                lastMaintDate: maint.sort((a, b) => new Date(b.date) - new Date(a.date))[0]?.date,
                // Counts
                insuranceCount: ins.length,
                fuelCount: fuel.length,
                inspectionCount: insp.length,
                maintenanceCount: maint.length,
            };
        });

        res.json({ success: true, data });
    } catch (e) {
        console.error(e);
        res.status(500).json({ success: false, error: e.message });
    }
});

/* ─── GET /api/vehicle-tracking/:vehicleId ─────────── */
router.get('/:vehicleId', authMiddleware, async (req, res) => {
    try {
        const { vehicleId } = req.params;
        const tenantId = req.tenant?.id || req.user?.tenantId;
        const vehicle = await getVehicleWithTracking(vehicleId, tenantId);
        if (!vehicle) return res.status(404).json({ success: false, error: 'Araç bulunamadı' });
        res.json({ success: true, data: vehicle.metadata.tracking });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

/* ─── INSURANCE ──────────────────────────────────────── */

router.post('/:vehicleId/insurance', authMiddleware, async (req, res) => {
    try {
        const { vehicleId } = req.params;
        const tenantId = req.tenant?.id;
        const vehicle = await getVehicleWithTracking(vehicleId, tenantId);
        if (!vehicle) return res.status(404).json({ success: false, error: 'Araç bulunamadı' });
        const tracking = vehicle.metadata.tracking;
        const entry = { id: genId(), ...req.body, createdAt: new Date().toISOString() };
        tracking.insurance.push(entry);
        await saveTracking(vehicleId, tracking);
        res.json({ success: true, data: entry });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.put('/:vehicleId/insurance/:entryId', authMiddleware, async (req, res) => {
    try {
        const { vehicleId, entryId } = req.params;
        const tenantId = req.tenant?.id;
        const vehicle = await getVehicleWithTracking(vehicleId, tenantId);
        if (!vehicle) return res.status(404).json({ success: false, error: 'Araç bulunamadı' });
        const tracking = vehicle.metadata.tracking;
        const idx = tracking.insurance.findIndex(i => i.id === entryId);
        if (idx === -1) return res.status(404).json({ success: false, error: 'Kayıt bulunamadı' });
        tracking.insurance[idx] = { ...tracking.insurance[idx], ...req.body };
        await saveTracking(vehicleId, tracking);
        res.json({ success: true, data: tracking.insurance[idx] });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.delete('/:vehicleId/insurance/:entryId', authMiddleware, async (req, res) => {
    try {
        const { vehicleId, entryId } = req.params;
        const tenantId = req.tenant?.id;
        const vehicle = await getVehicleWithTracking(vehicleId, tenantId);
        if (!vehicle) return res.status(404).json({ success: false, error: 'Araç bulunamadı' });
        const tracking = vehicle.metadata.tracking;
        tracking.insurance = tracking.insurance.filter(i => i.id !== entryId);
        await saveTracking(vehicleId, tracking);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

/* ─── FUEL ───────────────────────────────────────────── */
router.post('/:vehicleId/fuel', authMiddleware, async (req, res) => {
    try {
        const { vehicleId } = req.params;
        const tenantId = req.tenant?.id;
        const vehicle = await getVehicleWithTracking(vehicleId, tenantId);
        if (!vehicle) return res.status(404).json({ success: false, error: 'Araç bulunamadı' });
        const tracking = vehicle.metadata.tracking;
        const entry = { id: genId(), ...req.body, createdAt: new Date().toISOString() };

        // ── Anomaly detection for admin fuel entry ──
        const entryKm = Number(entry.km || 0);
        if (entryKm > 0) {
            // Find previous fuel record with KM (sorted by date desc)
            const allPrev = [...tracking.fuel]
                .filter(f => Number(f.km || 0) > 0)
                .sort((a, b) => new Date(b.date || b.createdAt).getTime() - new Date(a.date || a.createdAt).getTime());
            
            // Also check driver FuelRecords
            const driverPrev = await prisma.fuelRecord.findFirst({
                where: { vehicleId, tenantId },
                orderBy: { createdAt: 'desc' },
            });

            let prevKm = null;
            const metaPrevKm = allPrev.length > 0 ? Number(allPrev[0].km) : null;
            const driverPrevKm = driverPrev ? Number(driverPrev.odometer || 0) : null;

            // Use whichever is most recent
            if (metaPrevKm && driverPrevKm) {
                prevKm = Math.max(metaPrevKm, driverPrevKm);
            } else {
                prevKm = metaPrevKm || driverPrevKm;
            }

            if (prevKm && prevKm > 0) {
                const distance = entryKm - prevKm;
                entry.distanceTraveled = distance;
                entry.previousKm = prevKm;
                
                if (distance < 0) {
                    entry.anomalyFlag = 'SUSPICIOUS';
                    entry.anomalyReasons = ['KM_DECREASE'];
                    entry.consumptionStatus = 'km_decrease';
                } else if (distance === 0 && Number(entry.liters) > 0) {
                    entry.anomalyFlag = 'SUSPICIOUS';
                    entry.anomalyReasons = ['HIGH_CONSUMPTION'];
                    entry.consumptionStatus = 'zero_distance';
                } else if (distance > 0 && Number(entry.liters) > 0) {
                    const per100 = (Number(entry.liters) / distance) * 100;
                    entry.consumptionPer100km = Math.round(per100 * 100) / 100;
                    if (per100 > 35) {
                        entry.anomalyFlag = 'SUSPICIOUS';
                        entry.anomalyReasons = ['HIGH_CONSUMPTION'];
                        entry.consumptionStatus = 'critical';
                    } else if (per100 > 25) {
                        entry.anomalyFlag = 'SUSPICIOUS';
                        entry.anomalyReasons = ['HIGH_CONSUMPTION'];
                        entry.consumptionStatus = 'high';
                    } else {
                        entry.consumptionStatus = 'normal';
                    }
                }
            }
        }

        tracking.fuel.push(entry);
        await saveTracking(vehicleId, tracking);
        res.json({ success: true, data: entry });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.put('/:vehicleId/fuel/:entryId', authMiddleware, async (req, res) => {
    try {
        const { vehicleId, entryId } = req.params;
        const tenantId = req.tenant?.id;
        const vehicle = await getVehicleWithTracking(vehicleId, tenantId);
        if (!vehicle) return res.status(404).json({ success: false, error: 'Araç bulunamadı' });
        const tracking = vehicle.metadata.tracking;
        const idx = tracking.fuel.findIndex(i => i.id === entryId);
        if (idx === -1) return res.status(404).json({ success: false, error: 'Kayıt bulunamadı' });
        tracking.fuel[idx] = { ...tracking.fuel[idx], ...req.body };
        await saveTracking(vehicleId, tracking);
        res.json({ success: true, data: tracking.fuel[idx] });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.delete('/:vehicleId/fuel/:entryId', authMiddleware, async (req, res) => {
    try {
        const { vehicleId, entryId } = req.params;
        const tenantId = req.tenant?.id;
        const vehicle = await getVehicleWithTracking(vehicleId, tenantId);
        if (!vehicle) return res.status(404).json({ success: false, error: 'Araç bulunamadı' });
        const tracking = vehicle.metadata.tracking;
        tracking.fuel = tracking.fuel.filter(i => i.id !== entryId);
        await saveTracking(vehicleId, tracking);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

/* ─── INSPECTION ─────────────────────────────────────── */
router.post('/:vehicleId/inspection', authMiddleware, async (req, res) => {
    try {
        const { vehicleId } = req.params;
        const tenantId = req.tenant?.id;
        const vehicle = await getVehicleWithTracking(vehicleId, tenantId);
        if (!vehicle) return res.status(404).json({ success: false, error: 'Araç bulunamadı' });
        const tracking = vehicle.metadata.tracking;
        const entry = { id: genId(), ...req.body, createdAt: new Date().toISOString() };
        tracking.inspection.push(entry);
        await saveTracking(vehicleId, tracking);
        res.json({ success: true, data: entry });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.put('/:vehicleId/inspection/:entryId', authMiddleware, async (req, res) => {
    try {
        const { vehicleId, entryId } = req.params;
        const tenantId = req.tenant?.id;
        const vehicle = await getVehicleWithTracking(vehicleId, tenantId);
        if (!vehicle) return res.status(404).json({ success: false, error: 'Araç bulunamadı' });
        const tracking = vehicle.metadata.tracking;
        const idx = tracking.inspection.findIndex(i => i.id === entryId);
        if (idx === -1) return res.status(404).json({ success: false, error: 'Kayıt bulunamadı' });
        tracking.inspection[idx] = { ...tracking.inspection[idx], ...req.body };
        await saveTracking(vehicleId, tracking);
        res.json({ success: true, data: tracking.inspection[idx] });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.delete('/:vehicleId/inspection/:entryId', authMiddleware, async (req, res) => {
    try {
        const { vehicleId, entryId } = req.params;
        const tenantId = req.tenant?.id;
        const vehicle = await getVehicleWithTracking(vehicleId, tenantId);
        if (!vehicle) return res.status(404).json({ success: false, error: 'Araç bulunamadı' });
        const tracking = vehicle.metadata.tracking;
        tracking.inspection = tracking.inspection.filter(i => i.id !== entryId);
        await saveTracking(vehicleId, tracking);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

/* ─── MAINTENANCE ────────────────────────────────────── */
router.post('/:vehicleId/maintenance', authMiddleware, async (req, res) => {
    try {
        const { vehicleId } = req.params;
        const tenantId = req.tenant?.id;
        const vehicle = await getVehicleWithTracking(vehicleId, tenantId);
        if (!vehicle) return res.status(404).json({ success: false, error: 'Araç bulunamadı' });
        const tracking = vehicle.metadata.tracking;
        const entry = { id: genId(), ...req.body, createdAt: new Date().toISOString() };
        tracking.maintenance.push(entry);
        await saveTracking(vehicleId, tracking);
        res.json({ success: true, data: entry });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.put('/:vehicleId/maintenance/:entryId', authMiddleware, async (req, res) => {
    try {
        const { vehicleId, entryId } = req.params;
        const tenantId = req.tenant?.id;
        const vehicle = await getVehicleWithTracking(vehicleId, tenantId);
        if (!vehicle) return res.status(404).json({ success: false, error: 'Araç bulunamadı' });
        const tracking = vehicle.metadata.tracking;
        const idx = tracking.maintenance.findIndex(i => i.id === entryId);
        if (idx === -1) return res.status(404).json({ success: false, error: 'Kayıt bulunamadı' });
        tracking.maintenance[idx] = { ...tracking.maintenance[idx], ...req.body };
        await saveTracking(vehicleId, tracking);
        res.json({ success: true, data: tracking.maintenance[idx] });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.delete('/:vehicleId/maintenance/:entryId', authMiddleware, async (req, res) => {
    try {
        const { vehicleId, entryId } = req.params;
        const tenantId = req.tenant?.id;
        const vehicle = await getVehicleWithTracking(vehicleId, tenantId);
        if (!vehicle) return res.status(404).json({ success: false, error: 'Araç bulunamadı' });
        const tracking = vehicle.metadata.tracking;
        tracking.maintenance = tracking.maintenance.filter(i => i.id !== entryId);
        await saveTracking(vehicleId, tracking);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

/* ─── DRIVER FUEL RECORDS (from FuelRecord table) ────── */

// GET /api/vehicle-tracking/:vehicleId/driver-fuel
// Fetch all driver-submitted fuel records for a vehicle
router.get('/:vehicleId/driver-fuel', authMiddleware, async (req, res) => {
    try {
        const { vehicleId } = req.params;
        const tenantId = req.tenant?.id || req.user?.tenantId;

        const records = await prisma.fuelRecord.findMany({
            where: { vehicleId, tenantId },
            include: {
                driver: { select: { id: true, fullName: true, avatar: true } }
            },
            orderBy: { createdAt: 'desc' }
        });

        res.json({ success: true, data: records });
    } catch (e) {
        console.error('Driver fuel records error:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// GET /api/vehicle-tracking/:vehicleId/all-fuel
// Combined: metadata fuel + driver FuelRecord entries
router.get('/:vehicleId/all-fuel', authMiddleware, async (req, res) => {
    try {
        const { vehicleId } = req.params;
        const tenantId = req.tenant?.id || req.user?.tenantId;

        // 1. Get metadata-based fuel records
        const vehicle = await getVehicleWithTracking(vehicleId, tenantId);
        if (!vehicle) return res.status(404).json({ success: false, error: 'Araç bulunamadı' });

        const metaFuel = (vehicle.metadata.tracking.fuel || []).map(f => ({
            ...f,
            source: 'admin',
            vehicleId,
            plateNumber: vehicle.plateNumber,
        }));

        // 2. Get FuelRecord entries
        const driverRecords = await prisma.fuelRecord.findMany({
            where: { vehicleId, tenantId },
            include: {
                driver: { select: { id: true, fullName: true, avatar: true } }
            },
            orderBy: { createdAt: 'desc' }
        });

        const driverFuel = driverRecords.map(r => ({
            id: r.id,
            date: r.createdAt.toISOString(),
            liters: r.liters,
            unitPrice: r.pricePerLiter || 0,
            totalCost: r.totalCost || 0,
            km: r.odometer,
            station: null,
            notes: r.notes,
            fuelType: r.fuelType,
            source: 'driver',
            driverName: r.driver?.fullName || '—',
            driverId: r.driverId,
            odometerPhotoUrl: r.odometerPhotoUrl,
            anomalyFlag: r.anomalyFlag,
            anomalyReasons: r.anomalyReasons || [],
            gpsDistanceKm: r.gpsDistanceKm,
            gpsLocationLat: r.gpsLocationLat,
            gpsLocationLng: r.gpsLocationLng,
            previousOdometer: r.previousOdometer,
            odometerDeltaKm: r.odometerDeltaKm,
            ocrKm: r.ocrKm,
            ocrConfidence: r.ocrConfidence,
            vehicleId,
            plateNumber: vehicle.plateNumber,
            createdAt: r.createdAt.toISOString(),
        }));

        // Merge & sort by date ASC for consumption calculation
        const allAsc = [...metaFuel, ...driverFuel].sort((a, b) =>
            new Date(a.date || a.createdAt).getTime() - new Date(b.date || b.createdAt).getTime()
        );

        // ── Consumption calculation between consecutive fuel records ──
        const CONSUMPTION_THRESHOLD_HIGH = 25; // L/100km - above this = suspicious
        const CONSUMPTION_THRESHOLD_CRITICAL = 35; // L/100km - above this = very suspicious
        let totalDistanceKm = 0;
        let totalConsumptionLiters = 0;
        let consumptionEntries = 0;

        for (let i = 0; i < allAsc.length; i++) {
            const rec = allAsc[i];
            const currentKm = Number(rec.km || rec.odometer || 0);
            if (!currentKm) continue;

            // Find previous record with KM
            let prevKm = null;
            for (let j = i - 1; j >= 0; j--) {
                const pk = Number(allAsc[j].km || allAsc[j].odometer || 0);
                if (pk > 0) { prevKm = pk; break; }
            }

            if (prevKm !== null && prevKm > 0) {
                const distance = currentKm - prevKm;
                rec.distanceTraveled = distance;

                if (distance > 0 && Number(rec.liters) > 0) {
                    const per100 = (Number(rec.liters) / distance) * 100;
                    rec.consumptionPer100km = Math.round(per100 * 100) / 100;
                    totalDistanceKm += distance;
                    totalConsumptionLiters += Number(rec.liters);
                    consumptionEntries++;

                    // Anomaly detection for admin records too
                    if (!rec.anomalyReasons) rec.anomalyReasons = [];
                    if (!rec.anomalyFlag) rec.anomalyFlag = null;

                    if (per100 > CONSUMPTION_THRESHOLD_CRITICAL) {
                        if (!rec.anomalyReasons.includes('HIGH_CONSUMPTION')) {
                            rec.anomalyReasons.push('HIGH_CONSUMPTION');
                        }
                        rec.anomalyFlag = rec.anomalyFlag || 'SUSPICIOUS';
                        rec.consumptionStatus = 'critical'; // yakıt hırsızlığı veya araçta yatma şüphesi
                    } else if (per100 > CONSUMPTION_THRESHOLD_HIGH) {
                        if (!rec.anomalyReasons.includes('HIGH_CONSUMPTION')) {
                            rec.anomalyReasons.push('HIGH_CONSUMPTION');
                        }
                        rec.anomalyFlag = rec.anomalyFlag || 'SUSPICIOUS';
                        rec.consumptionStatus = 'high';
                    } else {
                        rec.consumptionStatus = 'normal';
                    }
                } else if (distance < 0) {
                    // KM decrease
                    rec.distanceTraveled = distance;
                    rec.consumptionStatus = 'km_decrease';
                    if (!rec.anomalyReasons) rec.anomalyReasons = [];
                    if (!rec.anomalyReasons.includes('KM_DECREASE')) {
                        rec.anomalyReasons.push('KM_DECREASE');
                    }
                    rec.anomalyFlag = rec.anomalyFlag || 'SUSPICIOUS';
                } else if (distance === 0) {
                    // 0 KM traveled but fuel added — very suspicious
                    rec.distanceTraveled = 0;
                    rec.consumptionStatus = 'zero_distance';
                    if (!rec.anomalyReasons) rec.anomalyReasons = [];
                    if (!rec.anomalyReasons.includes('HIGH_CONSUMPTION')) {
                        rec.anomalyReasons.push('HIGH_CONSUMPTION');
                    }
                    rec.anomalyFlag = rec.anomalyFlag || 'SUSPICIOUS';
                }

                rec.previousKm = prevKm;
            }
        }

        // Sort descending for display
        const all = allAsc.reverse();

        // Stats
        const totalCost = all.reduce((s, r) => s + (Number(r.totalCost) || 0), 0);
        const totalLiters = all.reduce((s, r) => s + (Number(r.liters) || 0), 0);
        const avgPrice = totalLiters > 0 ? totalCost / totalLiters : 0;
        const anomalyCount = all.filter(r => r.anomalyFlag).length;
        const avgConsumption = totalDistanceKm > 0 ? Math.round((totalConsumptionLiters / totalDistanceKm) * 100 * 100) / 100 : 0;

        res.json({
            success: true,
            data: all,
            stats: {
                totalCost, totalLiters, avgPrice, anomalyCount, total: all.length,
                totalDistanceKm: Math.round(totalDistanceKm),
                avgConsumption, // L/100km average
                consumptionEntries,
            }
        });
    } catch (e) {
        console.error('All fuel error:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// PUT /api/vehicle-tracking/:vehicleId/driver-fuel/:recordId
// Update a driver-submitted fuel record (admin edit)
router.put('/:vehicleId/driver-fuel/:recordId', authMiddleware, async (req, res) => {
    try {
        const { vehicleId, recordId } = req.params;
        const tenantId = req.tenant?.id || req.user?.tenantId;
        const { liters, odometer, km, pricePerLiter, unitPrice, totalCost, notes, fuelType, date } = req.body;

        const existing = await prisma.fuelRecord.findFirst({ where: { id: recordId, vehicleId, tenantId } });
        if (!existing) return res.status(404).json({ success: false, error: 'Kayıt bulunamadı' });

        const updateData = {};
        if (liters !== undefined) updateData.liters = parseFloat(liters);
        if (odometer !== undefined || km !== undefined) updateData.odometer = parseFloat(odometer ?? km);
        if (pricePerLiter !== undefined || unitPrice !== undefined) updateData.pricePerLiter = parseFloat(pricePerLiter ?? unitPrice);
        if (totalCost !== undefined) updateData.totalCost = parseFloat(totalCost);
        if (notes !== undefined) updateData.notes = notes || null;
        if (fuelType !== undefined) updateData.fuelType = fuelType;
        if (date !== undefined) updateData.createdAt = new Date(date);

        await prisma.fuelRecord.update({ where: { id: recordId }, data: updateData });
        res.json({ success: true });
    } catch (e) {
        console.error('Driver fuel update error:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// DELETE /api/vehicle-tracking/:vehicleId/driver-fuel/:recordId
// Delete a driver-submitted fuel record (admin)
router.delete('/:vehicleId/driver-fuel/:recordId', authMiddleware, async (req, res) => {
    try {
        const { vehicleId, recordId } = req.params;
        const tenantId = req.tenant?.id || req.user?.tenantId;

        const existing = await prisma.fuelRecord.findFirst({ where: { id: recordId, vehicleId, tenantId } });
        if (!existing) return res.status(404).json({ success: false, error: 'Kayıt bulunamadı' });

        await prisma.fuelRecord.delete({ where: { id: recordId } });
        res.json({ success: true });
    } catch (e) {
        console.error('Driver fuel delete error:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

/* ─── TOTAL KM UPDATE ────────────────────────────────── */
router.patch('/:vehicleId/km', authMiddleware, async (req, res) => {
    try {
        const { vehicleId } = req.params;
        const tenantId = req.tenant?.id;
        const { totalKm } = req.body;
        const vehicle = await getVehicleWithTracking(vehicleId, tenantId);
        if (!vehicle) return res.status(404).json({ success: false, error: 'Araç bulunamadı' });
        const tracking = { ...vehicle.metadata.tracking, totalKm: Number(totalKm) };
        await saveTracking(vehicleId, tracking);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

module.exports = router;
