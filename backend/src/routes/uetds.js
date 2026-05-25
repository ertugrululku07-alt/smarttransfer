// src/routes/uetds.js
// Centralized UETDS submission queue & history (admin operations)
//
// Concepts:
//   - "Solo" item:    A regular (non-shuttle) transfer booking that has both
//                     driverId and assignedVehicleId set. Each booking sends
//                     once as its own UETDS sefer.
//   - "Run" item:     A shuttle run (group of bookings sharing a runKey) marked
//                     as Hazır (metadata.runLocked = true) and with driver +
//                     vehicle assigned. The whole run is sent as ONE sefer
//                     containing all passengers.
//
// Endpoints:
//   GET  /api/uetds/queue?startDate&endDate
//   GET  /api/uetds/submissions?startDate&endDate&status
//   POST /api/uetds/submit            { items: [{ type, bookingId?, runKey?, bookingIds? }] }
//   POST /api/uetds/cancel            { submissionId }
//   POST /api/uetds/resubmit          { submissionId }
//   DELETE /api/uetds/submission/:id  (only for REJECTED/CANCELLED — clears history)

const express = require('express');
const prisma = require('../lib/prisma');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// ── Helpers ─────────────────────────────────────────────────────────────────

function requireAdmin(req, res) {
    if (req.user.roleType !== 'TENANT_ADMIN' && req.user.roleType !== 'SUPER_ADMIN') {
        res.status(403).json({ success: false, error: 'Yalnızca yöneticiler erişebilir' });
        return false;
    }
    return true;
}

async function loadUetdsConfig(tenantId) {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    const settings = tenant?.settings || {};
    const u = settings.uetdsSettings;
    if (!u || !u.enabled) return { ok: false, error: 'UETDS aktif değil' };
    if (!u.username || !u.password) return { ok: false, error: 'UETDS kimlik bilgileri eksik' };

    const provider = u.provider || 'OFFICIAL';
    const environment = u.environment || 'production';
    let serviceUrl = null;
    // T.C. UDHB UETDS — Tarifesiz Yolcu (Arızı) servisi
    // Transfer / taksi / VIP shuttle bildirimleri için "uetdsarizi" endpoint kullanılır.
    // NOTE: UETDS yetki kapsamı IP whitelist'lidir; gönderim yapacak sunucunun
    // çıkış IP'si UETDS portalından yetki listesine eklenmiş olmalıdır.
    if (provider === 'TURKIYE_GOV' || provider === 'OFFICIAL') {
        serviceUrl = environment === 'production'
            ? 'https://servis.turkiye.gov.tr/services/g2g/kdgm/uetdsarizi'
            : 'https://servis.turkiye.gov.tr/services/g2g/kdgm/test/uetdsarizi';
    }
    return {
        ok: true,
        provider,
        credentials: {
            username: u.username,
            password: u.password,
            firmaKodu: u.firmaKodu,
            yetkiBelgeNo: u.yetkiBelgesiNo || u.firmaKodu,
            serviceUrl,
        }
    };
}

function bookingIsShuttle(b) {
    const m = b.metadata || {};
    const vt = String(m.vehicleType || '').toLowerCase();
    const tt = String(m.transferType || '').toLowerCase();
    return vt.includes('shuttle') || vt.includes('paylaşımlı') || tt === 'shuttle' || !!m.shuttleRouteId || !!m.manualRunId;
}

function dayWindow(startDate, endDate) {
    const TZ = 3 * 3600 * 1000;
    let s = startDate ? String(startDate).slice(0, 10) : null;
    let e = endDate ? String(endDate).slice(0, 10) : null;
    if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) s = new Date().toISOString().slice(0, 10);
    if (!e || !/^\d{4}-\d{2}-\d{2}$/.test(e)) e = s;
    const dayStart = new Date(new Date(`${s}T00:00:00.000Z`).getTime() - TZ);
    const dayEnd = new Date(new Date(`${e}T23:59:59.999Z`).getTime() - TZ);
    return { dayStart, dayEnd };
}

// Build a stable run key for shuttle bookings (mirrors the operations.js logic
// loosely — same key for bookings that should be sent as one sefer).
function buildRunKey(b) {
    const m = b.metadata || {};
    const masterTime = m.shuttleMasterTime || '';
    if (m.manualRunId) {
        return `MANUAL::${m.manualRunId}::${masterTime}`;
    }
    if (m.shuttleRouteId) {
        const dropRC = m.dropoffRegionCode || '';
        const pickRC = m.pickupRegionCode || '';
        return `ROUTE::${m.shuttleRouteId}::${pickRC}_${dropRC}::${masterTime}`;
    }
    const dropRC = m.dropoffRegionCode || '';
    const pickRC = m.pickupRegionCode || '';
    return `ADHOC::${pickRC}_${dropRC}::${masterTime}`;
}

// ── GET /api/uetds/queue ────────────────────────────────────────────────────
// Returns items ready to be submitted to UETDS.
router.get('/queue', authMiddleware, async (req, res) => {
    try {
        if (!requireAdmin(req, res)) return;
        const tenantId = req.user.tenantId;
        const { dayStart, dayEnd } = dayWindow(req.query.startDate, req.query.endDate);

        const bookings = await prisma.booking.findMany({
            where: {
                tenantId,
                productType: 'TRANSFER',
                startDate: { gte: dayStart, lte: dayEnd },
                status: { notIn: ['CANCELLED', 'PENDING', 'NO_SHOW'] },
            },
            orderBy: { startDate: 'asc' },
        });

        // Existing submissions for this date range (to mark already-sent)
        const submissions = await prisma.uetdsSubmission.findMany({
            where: {
                tenantId,
                createdAt: { gte: new Date(dayStart.getTime() - 7 * 24 * 3600 * 1000) },
                OR: [
                    { bookingId: { in: bookings.map(b => b.id) } },
                ],
            },
            orderBy: { createdAt: 'desc' },
        });

        // Index latest submission per bookingId & per runKey
        const subByBooking = new Map();
        const subByRunKey = new Map();
        for (const s of submissions) {
            if (s.bookingId && !subByBooking.has(s.bookingId)) subByBooking.set(s.bookingId, s);
            const rk = s.request?.runKey || s.response?.runKey;
            if (rk && !subByRunKey.has(rk)) subByRunKey.set(rk, s);
        }

        // Resolve driver + vehicle info
        const driverIds = [...new Set(bookings.map(b => b.driverId).filter(Boolean))];
        const vehicleIds = [...new Set(bookings.map(b => b.metadata?.assignedVehicleId).filter(Boolean))];

        const [drivers, vehicles, personnel] = await Promise.all([
            driverIds.length ? prisma.user.findMany({
                where: { id: { in: driverIds } },
                select: { id: true, fullName: true, phone: true, metadata: true }
            }) : [],
            vehicleIds.length ? prisma.vehicle.findMany({
                where: { id: { in: vehicleIds } },
                select: { id: true, plateNumber: true, brand: true, model: true }
            }) : [],
            driverIds.length ? prisma.personnel.findMany({
                where: { OR: [{ userId: { in: driverIds } }, { id: { in: driverIds } }] },
                select: { id: true, userId: true, firstName: true, lastName: true, phone: true, tcNumber: true }
            }) : [],
        ]);
        const driverMap = new Map(drivers.map(d => [d.id, d]));
        const vehicleMap = new Map(vehicles.map(v => [v.id, v]));
        const personnelByUser = new Map();
        for (const p of personnel) {
            if (p.userId) personnelByUser.set(p.userId, p);
            personnelByUser.set(p.id, p);
        }

        const enrichBooking = (b) => {
            const m = b.metadata || {};
            const drv = b.driverId ? driverMap.get(b.driverId) : null;
            const drvP = b.driverId ? personnelByUser.get(b.driverId) : null;
            const veh = m.assignedVehicleId ? vehicleMap.get(m.assignedVehicleId) : null;
            return {
                id: b.id,
                bookingNumber: b.bookingNumber,
                contactName: b.contactName,
                contactPhone: b.contactPhone,
                pickup: m.pickup || '',
                dropoff: m.dropoff || '',
                pickupRegionCode: m.pickupRegionCode || null,
                dropoffRegionCode: m.dropoffRegionCode || null,
                startDate: b.startDate,
                adults: b.adults || 0,
                children: b.children || 0,
                infants: b.infants || 0,
                status: b.status,
                driver: drv ? {
                    id: drv.id,
                    name: drvP ? `${drvP.firstName || ''} ${drvP.lastName || ''}`.trim() : drv.fullName,
                    phone: drvP?.phone || drv.phone || '',
                    tcNo: drvP?.tcNumber || ''
                } : null,
                vehicle: veh ? {
                    id: veh.id,
                    plate: veh.plateNumber,
                    brand: veh.brand,
                    model: veh.model
                } : null,
                metadata: m,
            };
        };

        // ── Solo items: non-shuttle bookings with driver + vehicle ──────────
        const soloItems = [];
        for (const b of bookings) {
            if (bookingIsShuttle(b)) continue;
            if (!b.driverId) continue;
            if (!b.metadata?.assignedVehicleId) continue;
            const sub = subByBooking.get(b.id);
            const enr = enrichBooking(b);
            soloItems.push({
                kind: 'SOLO',
                key: `SOLO::${b.id}`,
                bookingId: b.id,
                runKey: null,
                bookings: [enr],
                driver: enr.driver,
                vehicle: enr.vehicle,
                pickup: enr.pickup,
                dropoff: enr.dropoff,
                pickupRegionCode: enr.pickupRegionCode,
                dropoffRegionCode: enr.dropoffRegionCode,
                startDate: enr.startDate,
                passengerCount: (enr.adults || 0) + (enr.children || 0),
                submission: sub ? {
                    id: sub.id,
                    status: sub.status,
                    uetdsSeferId: sub.uetdsSeferId,
                    submittedAt: sub.submittedAt,
                    cancelledAt: sub.cancelledAt,
                    errorMessage: sub.errorMessage,
                } : null,
            });
        }

        // ── Run items: shuttle bookings grouped by runKey, only those with
        //              metadata.runLocked === true on at least one booking,
        //              AND driver + vehicle assigned ─────────────────────────
        const runMap = new Map();
        for (const b of bookings) {
            if (!bookingIsShuttle(b)) continue;
            const rk = buildRunKey(b);
            if (!runMap.has(rk)) runMap.set(rk, []);
            runMap.get(rk).push(b);
        }

        const runItems = [];
        for (const [rk, list] of runMap.entries()) {
            const isReady = list.some(b => b.metadata?.runLocked === true);
            if (!isReady) continue;
            const driverId = list.find(b => b.driverId)?.driverId || null;
            const vehicleId = list.find(b => b.metadata?.assignedVehicleId)?.metadata?.assignedVehicleId || null;
            if (!driverId || !vehicleId) continue;

            const enriched = list.map(enrichBooking).sort(
                (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
            );
            const drv = enriched.find(e => e.driver)?.driver || null;
            const veh = enriched.find(e => e.vehicle)?.vehicle || null;

            const sub = subByRunKey.get(rk);

            runItems.push({
                kind: 'RUN',
                key: `RUN::${rk}`,
                runKey: rk,
                bookingId: null,
                bookings: enriched,
                driver: drv,
                vehicle: veh,
                pickup: enriched[0]?.pickup || '',
                dropoff: enriched[enriched.length - 1]?.dropoff || '',
                pickupRegionCode: enriched[0]?.pickupRegionCode || null,
                dropoffRegionCode: enriched[enriched.length - 1]?.dropoffRegionCode || null,
                startDate: enriched[0]?.startDate || null,
                passengerCount: enriched.reduce((s, x) => s + (x.adults || 0) + (x.children || 0), 0),
                routeName: list[0]?.metadata?.manualRunName
                    || `${enriched[0]?.pickupRegionCode || '?'} → ${enriched[enriched.length - 1]?.dropoffRegionCode || '?'}`,
                departureTime: list[0]?.metadata?.shuttleMasterTime || null,
                submission: sub ? {
                    id: sub.id,
                    status: sub.status,
                    uetdsSeferId: sub.uetdsSeferId,
                    submittedAt: sub.submittedAt,
                    cancelledAt: sub.cancelledAt,
                    errorMessage: sub.errorMessage,
                } : null,
            });
        }

        const items = [...soloItems, ...runItems].sort(
            (a, b) => new Date(a.startDate || 0).getTime() - new Date(b.startDate || 0).getTime()
        );

        res.json({ success: true, count: items.length, data: items });
    } catch (error) {
        console.error('UETDS queue error:', error);
        res.status(500).json({ success: false, error: 'Kuyruk alınamadı: ' + error.message });
    }
});

// ── GET /api/uetds/submissions ──────────────────────────────────────────────
router.get('/submissions', authMiddleware, async (req, res) => {
    try {
        if (!requireAdmin(req, res)) return;
        const tenantId = req.user.tenantId;
        const { dayStart, dayEnd } = dayWindow(req.query.startDate, req.query.endDate);
        const status = req.query.status; // SENT | CANCELLED | REJECTED | undefined

        const where = {
            tenantId,
            createdAt: { gte: dayStart, lte: dayEnd },
        };
        if (status && ['SENT', 'CANCELLED', 'REJECTED', 'PENDING'].includes(status)) {
            where.status = status;
        }

        const submissions = await prisma.uetdsSubmission.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: 500,
        });

        const bookingIds = [...new Set(submissions.map(s => s.bookingId).filter(Boolean))];
        const bookings = bookingIds.length
            ? await prisma.booking.findMany({
                where: { id: { in: bookingIds } },
                select: {
                    id: true, bookingNumber: true, contactName: true, contactPhone: true,
                    startDate: true, metadata: true, adults: true, children: true,
                }
            })
            : [];
        const bookingMap = new Map(bookings.map(b => [b.id, b]));

        const enriched = submissions.map(s => {
            const b = s.bookingId ? bookingMap.get(s.bookingId) : null;
            const reqMeta = s.request || {};
            return {
                ...s,
                booking: b ? {
                    id: b.id,
                    bookingNumber: b.bookingNumber,
                    contactName: b.contactName,
                    contactPhone: b.contactPhone,
                    startDate: b.startDate,
                    pickup: b.metadata?.pickup || '',
                    dropoff: b.metadata?.dropoff || '',
                    adults: b.adults,
                    children: b.children,
                } : null,
                runKey: reqMeta.runKey || null,
                runBookingIds: reqMeta.runBookingIds || null,
                runPassengerCount: reqMeta.passengerCount || null,
            };
        });

        res.json({ success: true, count: enriched.length, data: enriched });
    } catch (error) {
        console.error('UETDS submissions error:', error);
        res.status(500).json({ success: false, error: 'Kayıtlar alınamadı: ' + error.message });
    }
});

// ── Internal: submit one item using tenant credentials ──────────────────────
async function submitOneItem({ tenantId, userId, item, config, bookings, drivers, personnel, vehicles }) {
    const { provider, credentials } = config;
    const driverMap = new Map(drivers.map(d => [d.id, d]));
    const vehicleMap = new Map(vehicles.map(v => [v.id, v]));
    const personnelByUser = new Map();
    for (const p of personnel) {
        if (p.userId) personnelByUser.set(p.userId, p);
        personnelByUser.set(p.id, p);
    }

    let bookingsForItem;
    let runKey = null;
    if (item.kind === 'SOLO') {
        const b = bookings.find(x => x.id === item.bookingId);
        if (!b) return { ok: false, error: 'Rezervasyon bulunamadı', item };
        bookingsForItem = [b];
    } else {
        runKey = item.runKey;
        bookingsForItem = bookings.filter(x => item.bookingIds.includes(x.id));
        if (bookingsForItem.length === 0) return { ok: false, error: 'Sefer için rezervasyon yok', item };
    }

    const primary = bookingsForItem[0];
    const meta = primary.metadata || {};
    const driverId = primary.driverId || bookingsForItem.find(b => b.driverId)?.driverId;
    const vehicleId = meta.assignedVehicleId || bookingsForItem.find(b => b.metadata?.assignedVehicleId)?.metadata?.assignedVehicleId;

    if (!driverId) return { ok: false, error: 'Şoför atanmamış', item };
    if (!vehicleId) return { ok: false, error: 'Araç atanmamış', item };

    const driver = driverMap.get(driverId);
    const driverP = personnelByUser.get(driverId);
    const vehicle = vehicleMap.get(vehicleId);
    if (!vehicle) return { ok: false, error: 'Araç bilgisi bulunamadı', item };

    const driverName = driverP
        ? { first: driverP.firstName || '', last: driverP.lastName || '' }
        : (() => {
            const parts = (driver?.fullName || '').split(' ');
            return { first: parts[0] || '', last: parts.slice(1).join(' ') || '' };
        })();

    const baslangicTarih = primary.startDate;
    let bitisTarih;
    if (bookingsForItem.length > 1) {
        const last = bookingsForItem[bookingsForItem.length - 1];
        const lastStart = new Date(last.startDate).getTime();
        bitisTarih = new Date(lastStart + 60 * 60 * 1000);
    } else {
        const dur = meta.durationMin ? meta.durationMin * 60 * 1000 : 2 * 60 * 60 * 1000;
        bitisTarih = new Date(new Date(baslangicTarih).getTime() + dur);
    }

    // Build passengers array from all bookings in this item
    const passengers = [];
    for (const b of bookingsForItem) {
        const m = b.metadata || {};
        const passengersMeta = Array.isArray(m.passengers) ? m.passengers : null;
        if (passengersMeta && passengersMeta.length > 0) {
            for (const p of passengersMeta) {
                passengers.push({
                    tcNo: p.tcNo || p.tc || p.passportNo || '',
                    firstName: p.firstName || p.adi || (p.fullName || '').split(' ')[0] || (b.contactName || '').split(' ')[0] || 'Yolcu',
                    lastName: p.lastName || p.soyadi || (p.fullName || '').split(' ').slice(1).join(' ') || (b.contactName || '').split(' ').slice(1).join(' ') || 'Soyadı',
                    phone: p.phone || p.telefon || b.contactPhone || '',
                    nationality: p.nationality || p.uyruk || 'TR',
                    gender: p.gender || p.cinsiyet || '1',
                });
            }
        } else {
            const nameParts = (b.contactName || '').split(' ');
            const adults = b.adults || 1;
            for (let i = 0; i < adults; i++) {
                passengers.push({
                    tcNo: i === 0 ? (m.passportNo || m.tcNo || '') : '',
                    firstName: i === 0 ? (nameParts[0] || 'Yolcu') : `Yolcu${i + 1}`,
                    lastName: i === 0 ? (nameParts.slice(1).join(' ') || 'Soyadı') : (nameParts.slice(1).join(' ') || 'Soyadı'),
                    phone: i === 0 ? (b.contactPhone || '') : '',
                    nationality: m.nationality || 'TR',
                    gender: '1',
                });
            }
        }
    }

    // Pickup / dropoff regions for SOAP "il" fields
    const baslangicIl = meta.pickupCity || 'Antalya';
    const baslangicIlce = meta.pickupDistrict || '';
    const lastBooking = bookingsForItem[bookingsForItem.length - 1];
    const lastMeta = lastBooking.metadata || {};
    const bitisIl = lastMeta.dropoffCity || 'Antalya';
    const bitisIlce = lastMeta.dropoffDistrict || '';

    let seferResult;
    if (provider === 'UETDS_NET') {
        const uetdsRestService = require('../services/uetdsRestService');
        const reservation = {
            pickupCity: baslangicIl, dropoffCity: bitisIl,
            date: new Date(baslangicTarih).toISOString().split('T')[0],
            time: new Date(baslangicTarih).toISOString().split('T')[1].substring(0, 5),
            pickupLocation: meta.pickup || '',
            dropoffLocation: lastMeta.dropoff || '',
            groupName: item.kind === 'RUN' ? 'SHUTTLE' : 'TRANSFER',
            price: Number(primary.total || 0),
        };
        const vehicleData = { plate: vehicle.plateNumber };
        const driverData = { tcNo: driverP?.tcNumber || '11111111111', phone: driverP?.phone || driver?.phone || '' };
        try {
            const submitRes = await uetdsRestService.submitDynamicTrip({
                credentials, reservation, vehicleData, driverData,
                passengers: passengers.map(p => ({
                    firstName: p.firstName, lastName: p.lastName,
                    documentNo: p.tcNo || '11111111111',
                    nationality: p.nationality, gender: p.gender, phone: p.phone
                }))
            });
            seferResult = {
                success: true,
                uetdsSeferId: submitRes.sefer_referans_no,
                refNo: submitRes.iletisim_referans_no,
                errorMessage: null,
                rawResponse: JSON.stringify(submitRes).substring(0, 4000),
            };
        } catch (err) {
            seferResult = {
                success: false,
                errorMessage: err.message,
                rawResponse: JSON.stringify(err.response?.data || err.message).substring(0, 4000),
            };
        }
    } else {
        const uetdsService = require('../services/uetdsService');
        const seferAciklama = item.kind === 'RUN'
            ? `[SHUTTLE] ${meta.pickup || ''} → ${lastMeta.dropoff || ''} (${bookingsForItem.length} rez.)`
            : `${meta.pickup || ''} → ${meta.dropoff || ''} (${primary.bookingNumber})`;
        const firmaSeferNo = item.kind === 'RUN'
            ? `RUN-${runKey}`
            : (primary.bookingNumber || `BK-${primary.id}`);
        seferResult = await uetdsService.seferEkle(credentials, {
            aracPlaka: (vehicle.plateNumber || '').replace(/\s+/g, '').toUpperCase(),
            seferAciklama,
            baslangicTarih,
            bitisTarih,
            firmaSeferNo,
            aracTelefonu: ((driverP?.phone || driver?.phone || '')).replace(/\D/g, ''),
        });
        seferResult.rawResponse = (seferResult.rawResponse || '').substring(0, 4000);
        seferResult.rawRequest = (seferResult.rawRequest || '').substring(0, 4000);
    }

    // Persist submission row
    const submission = await prisma.uetdsSubmission.create({
        data: {
            tenantId,
            partnerId: primary.partnerId || userId,
            bookingId: primary.id,
            vehicleId,
            driverId,
            uetdsSeferId: seferResult.uetdsSeferId || null,
            uetdsRefNo: seferResult.refNo || null,
            status: seferResult.success ? 'SENT' : 'REJECTED',
            errorMessage: seferResult.errorMessage || null,
            request: {
                kind: item.kind,
                runKey,
                runBookingIds: item.kind === 'RUN' ? bookingsForItem.map(b => b.id) : null,
                passengerCount: passengers.length,
                bookingNumbers: bookingsForItem.map(b => b.bookingNumber),
            },
            response: { sefer: seferResult.rawResponse, request: seferResult.rawRequest || null, httpStatus: seferResult.status || null },
            submittedAt: seferResult.success ? new Date() : null,
        }
    });

    if (!seferResult.success) {
        return { ok: false, error: seferResult.errorMessage || 'Bildirim başarısız', submission, item };
    }

    // For OFFICIAL/TURKIYE_GOV: add passengers + driver via separate calls
    let yolcuResults = [];
    if (provider !== 'UETDS_NET' && seferResult.uetdsSeferId) {
        const uetdsService = require('../services/uetdsService');
        let seatCounter = 1;
        for (const p of passengers) {
            try {
                const r = await uetdsService.yolcuEkle(credentials, seferResult.uetdsSeferId, {
                    tcKimlikPasaportNo: p.tcNo || '',
                    adi: p.firstName,
                    soyadi: p.lastName,
                    cinsiyet: (p.gender === 'F' || p.gender === 'K' || p.gender === '2') ? 'K' : 'E',
                    uyrukUlke: (p.nationality && p.nationality.length === 2) ? p.nationality : 'TR',
                    telefon: p.phone || '',
                    koltukNo: String(seatCounter++),
                    grupId: '0',
                });
                yolcuResults.push({ name: `${p.firstName} ${p.lastName}`, success: r.success, error: r.errorMessage });
            } catch (e) {
                yolcuResults.push({ name: `${p.firstName} ${p.lastName}`, success: false, error: e.message });
            }
        }
        if (driverP?.tcNumber) {
            try {
                await uetdsService.personelEkle(credentials, seferResult.uetdsSeferId, {
                    tcKimlikPasaportNo: driverP.tcNumber,
                    adi: driverName.first,
                    soyadi: driverName.last,
                    cinsiyet: 'E',
                    telefon: driverP.phone || driver?.phone || '',
                    turKodu: '1',
                    uyrukUlke: 'TR',
                });
            } catch (_) { /* non-fatal */ }
        }
    }
    if (seferResult.success) {
        await prisma.uetdsSubmission.update({
            where: { id: submission.id },
            data: {
                response: {
                    sefer: seferResult.rawResponse,
                    passengerCount: passengers.length,
                    yolcuResults,
                }
            }
        });
    }

    return {
        ok: true,
        submission,
        uetdsSeferId: seferResult.uetdsSeferId,
        passengerCount: passengers.length,
        yolcuResults,
        item,
    };
}

// ── POST /api/uetds/submit ──────────────────────────────────────────────────
router.post('/submit', authMiddleware, async (req, res) => {
    try {
        if (!requireAdmin(req, res)) return;
        const tenantId = req.user.tenantId;
        const userId = req.user.id;
        const { items } = req.body || {};
        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ success: false, error: 'En az bir öğe gerekli' });
        }

        const config = await loadUetdsConfig(tenantId);
        if (!config.ok) return res.status(400).json({ success: false, error: config.error });

        // Pre-load all bookings referenced by items
        const allBookingIds = new Set();
        for (const it of items) {
            if (it.kind === 'SOLO' && it.bookingId) allBookingIds.add(it.bookingId);
            if (it.kind === 'RUN' && Array.isArray(it.bookingIds)) it.bookingIds.forEach(id => allBookingIds.add(id));
        }
        const bookings = await prisma.booking.findMany({
            where: { id: { in: [...allBookingIds] }, tenantId }
        });
        const driverIds = [...new Set(bookings.map(b => b.driverId).filter(Boolean))];
        const vehicleIds = [...new Set(bookings.map(b => b.metadata?.assignedVehicleId).filter(Boolean))];
        const [drivers, vehicles, personnel] = await Promise.all([
            driverIds.length ? prisma.user.findMany({
                where: { id: { in: driverIds } },
                select: { id: true, fullName: true, phone: true }
            }) : [],
            vehicleIds.length ? prisma.vehicle.findMany({
                where: { id: { in: vehicleIds } },
                select: { id: true, plateNumber: true, brand: true, model: true }
            }) : [],
            driverIds.length ? prisma.personnel.findMany({
                where: { OR: [{ userId: { in: driverIds } }, { id: { in: driverIds } }] },
                select: { id: true, userId: true, firstName: true, lastName: true, phone: true, tcNumber: true }
            }) : [],
        ]);

        const results = [];
        for (const item of items) {
            // Skip items already SENT to avoid duplicates
            const checkWhere = item.kind === 'SOLO'
                ? { bookingId: item.bookingId, status: 'SENT', tenantId }
                : { tenantId, status: 'SENT', request: { path: ['runKey'], equals: item.runKey } };
            try {
                const existing = await prisma.uetdsSubmission.findFirst({ where: checkWhere });
                if (existing) {
                    results.push({ ok: false, skipped: true, error: 'Zaten gönderilmiş', item, submission: existing });
                    continue;
                }
            } catch (_) { /* json path query may not be supported on all DB engines; ignore */ }

            const r = await submitOneItem({
                tenantId, userId, item, config, bookings, drivers, personnel, vehicles
            });
            results.push(r);
        }

        const okCount = results.filter(r => r.ok).length;
        res.json({
            success: true,
            total: results.length,
            okCount,
            failedCount: results.length - okCount,
            results,
        });
    } catch (error) {
        console.error('UETDS submit error:', error);
        res.status(500).json({ success: false, error: 'Toplu gönderim başarısız: ' + error.message });
    }
});

// ── POST /api/uetds/cancel ──────────────────────────────────────────────────
router.post('/cancel', authMiddleware, async (req, res) => {
    try {
        if (!requireAdmin(req, res)) return;
        const tenantId = req.user.tenantId;
        const { submissionId } = req.body || {};
        if (!submissionId) return res.status(400).json({ success: false, error: 'submissionId gerekli' });

        const submission = await prisma.uetdsSubmission.findFirst({ where: { id: submissionId, tenantId } });
        if (!submission) return res.status(404).json({ success: false, error: 'Kayıt bulunamadı' });
        if (submission.status !== 'SENT') {
            return res.status(400).json({ success: false, error: 'Sadece gönderilmiş kayıtlar iptal edilebilir' });
        }

        const config = await loadUetdsConfig(tenantId);
        if (!config.ok) return res.status(400).json({ success: false, error: config.error });

        let cancelOk = false;
        let errorMessage = null;
        let rawResponse = '';

        if (config.provider === 'UETDS_NET') {
            // No standardized cancel endpoint exposed in our REST wrapper; mark cancelled locally.
            cancelOk = true;
        } else if (submission.uetdsSeferId) {
            const uetdsService = require('../services/uetdsService');
            const r = await uetdsService.seferIptal(config.credentials, submission.uetdsSeferId);
            cancelOk = !!r.success;
            errorMessage = r.errorMessage || null;
            rawResponse = (r.rawResponse || '').substring(0, 2000);
        } else {
            return res.status(400).json({ success: false, error: 'SeferId yok — iptal edilemez' });
        }

        await prisma.uetdsSubmission.update({
            where: { id: submission.id },
            data: {
                status: cancelOk ? 'CANCELLED' : submission.status,
                cancelledAt: cancelOk ? new Date() : null,
                errorMessage: errorMessage || submission.errorMessage,
                response: {
                    ...(typeof submission.response === 'object' && submission.response !== null ? submission.response : {}),
                    iptal: rawResponse,
                },
            }
        });

        if (!cancelOk) {
            return res.status(400).json({ success: false, error: errorMessage || 'İptal başarısız' });
        }
        res.json({ success: true, message: 'UETDS seferi iptal edildi' });
    } catch (error) {
        console.error('UETDS cancel error:', error);
        res.status(500).json({ success: false, error: 'İptal işlemi başarısız: ' + error.message });
    }
});

// ── POST /api/uetds/resubmit ────────────────────────────────────────────────
// Cancels an existing SENT submission then resubmits the same item.
router.post('/resubmit', authMiddleware, async (req, res) => {
    try {
        if (!requireAdmin(req, res)) return;
        const tenantId = req.user.tenantId;
        const userId = req.user.id;
        const { submissionId } = req.body || {};
        if (!submissionId) return res.status(400).json({ success: false, error: 'submissionId gerekli' });

        const submission = await prisma.uetdsSubmission.findFirst({ where: { id: submissionId, tenantId } });
        if (!submission) return res.status(404).json({ success: false, error: 'Kayıt bulunamadı' });

        const config = await loadUetdsConfig(tenantId);
        if (!config.ok) return res.status(400).json({ success: false, error: config.error });

        // Cancel first if currently SENT
        if (submission.status === 'SENT' && submission.uetdsSeferId && config.provider !== 'UETDS_NET') {
            const uetdsService = require('../services/uetdsService');
            const r = await uetdsService.seferIptal(config.credentials, submission.uetdsSeferId);
            await prisma.uetdsSubmission.update({
                where: { id: submission.id },
                data: {
                    status: r.success ? 'CANCELLED' : submission.status,
                    cancelledAt: r.success ? new Date() : null,
                }
            });
            if (!r.success) {
                return res.status(400).json({ success: false, error: 'Eski kayıt iptal edilemedi: ' + (r.errorMessage || '') });
            }
        }

        // Build item from submission metadata
        const reqMeta = submission.request || {};
        let item;
        if (reqMeta.kind === 'RUN') {
            item = {
                kind: 'RUN',
                runKey: reqMeta.runKey || '',
                bookingIds: reqMeta.runBookingIds || (submission.bookingId ? [submission.bookingId] : []),
            };
        } else {
            item = { kind: 'SOLO', bookingId: submission.bookingId };
        }

        const allIds = item.kind === 'SOLO' ? [item.bookingId] : (item.bookingIds || []);
        const bookings = await prisma.booking.findMany({ where: { id: { in: allIds }, tenantId } });
        const driverIds = [...new Set(bookings.map(b => b.driverId).filter(Boolean))];
        const vehicleIds = [...new Set(bookings.map(b => b.metadata?.assignedVehicleId).filter(Boolean))];
        const [drivers, vehicles, personnel] = await Promise.all([
            driverIds.length ? prisma.user.findMany({ where: { id: { in: driverIds } }, select: { id: true, fullName: true, phone: true } }) : [],
            vehicleIds.length ? prisma.vehicle.findMany({ where: { id: { in: vehicleIds } }, select: { id: true, plateNumber: true, brand: true, model: true } }) : [],
            driverIds.length ? prisma.personnel.findMany({ where: { OR: [{ userId: { in: driverIds } }, { id: { in: driverIds } }] }, select: { id: true, userId: true, firstName: true, lastName: true, phone: true, tcNumber: true } }) : [],
        ]);

        const r = await submitOneItem({ tenantId, userId, item, config, bookings, drivers, personnel, vehicles });
        if (!r.ok) return res.status(400).json({ success: false, error: r.error });
        res.json({ success: true, data: r });
    } catch (error) {
        console.error('UETDS resubmit error:', error);
        res.status(500).json({ success: false, error: 'Yeniden gönderim başarısız: ' + error.message });
    }
});

// ── DELETE /api/uetds/submission/:id ────────────────────────────────────────
// Removes a REJECTED/CANCELLED record from history. Cannot delete SENT.
router.delete('/submission/:id', authMiddleware, async (req, res) => {
    try {
        if (!requireAdmin(req, res)) return;
        const tenantId = req.user.tenantId;
        const submission = await prisma.uetdsSubmission.findFirst({
            where: { id: req.params.id, tenantId }
        });
        if (!submission) return res.status(404).json({ success: false, error: 'Kayıt bulunamadı' });
        if (submission.status === 'SENT') {
            return res.status(400).json({ success: false, error: 'Aktif gönderim silinemez — önce iptal edin' });
        }
        await prisma.uetdsSubmission.delete({ where: { id: submission.id } });
        res.json({ success: true });
    } catch (error) {
        console.error('UETDS delete error:', error);
        res.status(500).json({ success: false, error: 'Silinemedi: ' + error.message });
    }
});

// ── GET /api/uetds/server-ip ────────────────────────────────────────────────
// Returns the outbound IP of this server (needed for UETDS IP whitelist)
router.get('/server-ip', authMiddleware, async (req, res) => {
    try {
        if (!requireAdmin(req, res)) return;
        const axios = require('axios');
        const result = await axios.get('https://api.ipify.org?format=json', { timeout: 10000 });
        res.json({ success: true, ip: result.data.ip });
    } catch (error) {
        res.status(500).json({ success: false, error: 'IP alınamadı: ' + error.message });
    }
});

module.exports = router;
