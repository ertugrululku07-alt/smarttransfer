// src/routes/operations.js
// Smart Operations Module — Conflict Detection, Availability Calendar, AI Suggestions

const express = require('express');
const prisma = require('../lib/prisma');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// Lazy-load services to avoid startup errors when env vars missing
let RouteService = null;
let AIAdvisor = null;

const getRouteService = () => {
    if (!RouteService) {
        try { RouteService = require('../services/RouteService'); } catch (e) { }
    }
    return RouteService;
};

const getAIAdvisor = () => {
    if (!AIAdvisor) {
        try { AIAdvisor = require('../services/AIOperationAdvisor'); } catch (e) { }
    }
    return AIAdvisor;
};

// ---------------------------------------------------------------------------
// Helper: calculate occupancy window for a booking
// Returns { start, end } as Date objects
// ---------------------------------------------------------------------------
const getOccupancyWindow = (booking) => {
    const start = new Date(booking.startDate);
    const durationMin = booking.metadata?.estimatedDurationMinutes || 120; // default 2h
    const restMin = 30; // always add 30 min rest
    const end = new Date(start.getTime() + (durationMin + restMin) * 60 * 1000);
    return { start, end };
};

// ---------------------------------------------------------------------------
// Helper: check if two windows overlap
// ---------------------------------------------------------------------------
const windowsOverlap = (a, b) => {
    return a.start < b.end && b.start < a.end;
};

// ---------------------------------------------------------------------------
// Helper: determine trip type based on pickup/dropoff
// Returns 'DEP' | 'ARV' | 'ARA'
// ---------------------------------------------------------------------------
const getTripType = (pickup, dropoff) => {
    const pickupStr = String(pickup || '').toLowerCase();
    const dropoffStr = String(dropoff || '').toLowerCase();
    
    const airportKeywords = ['havalimanı', 'havalimani', 'airport', 'havaalanı', 'havaalani', 'ayt', 'ist', 'sa', 'esenboğa'];
    
    const isPickupAirport = airportKeywords.some(kw => pickupStr.includes(kw));
    const isDropoffAirport = airportKeywords.some(kw => dropoffStr.includes(kw));
    
    if (isPickupAirport && !isDropoffAirport) {
        return 'ARV'; // Arrival: Airport to Hotel
    } else if (!isPickupAirport && isDropoffAirport) {
        return 'DEP'; // Departure: Hotel to Airport
    } else {
        return 'ARA'; // Ara Transfer: Between hotels or other
    }
};

// ---------------------------------------------------------------------------
// GET /api/operations/driver-schedule?driverId=&date=YYYY-MM-DD
// Returns all bookings assigned to a driver on a given date
// ---------------------------------------------------------------------------
router.get('/driver-schedule', authMiddleware, async (req, res) => {
    try {
        const { driverId, date } = req.query;
        if (!driverId || !date) {
            return res.status(400).json({ success: false, error: 'driverId ve date zorunlu' });
        }

        const TZ_OFFSET_MS = 3 * 60 * 60 * 1000; // UTC+3 Turkey
        const dayStart = new Date(new Date(`${date}T00:00:00.000Z`).getTime() - TZ_OFFSET_MS);
        const dayEnd = new Date(new Date(`${date}T23:59:59.999Z`).getTime() - TZ_OFFSET_MS);

        const bookings = await prisma.booking.findMany({
            where: {
                productType: 'TRANSFER',
                driverId: driverId,
                startDate: { gte: dayStart, lte: dayEnd },
                status: { notIn: ['CANCELLED'] }
            },
            orderBy: { startDate: 'asc' }
        });

        const schedule = bookings.map(b => {
            const { start, end } = getOccupancyWindow(b);
            return {
                bookingId: b.id,
                bookingNumber: b.bookingNumber,
                pickup: b.metadata?.pickup || '',
                dropoff: b.metadata?.dropoff || '',
                pickupDateTime: b.startDate,
                estimatedDurationMinutes: b.metadata?.estimatedDurationMinutes || 120,
                freeAt: end.toISOString(),
                status: b.status
            };
        });

        res.json({ success: true, data: schedule });
    } catch (error) {
        console.error('driver-schedule error:', error);
        res.status(500).json({ success: false, error: 'Şöför çizelgesi alınamadı' });
    }
});

// ---------------------------------------------------------------------------
// GET /api/operations/vehicle-schedule?vehicleId=&date=YYYY-MM-DD
// Returns all bookings assigned to a vehicle on a given date
// ---------------------------------------------------------------------------
router.get('/vehicle-schedule', authMiddleware, async (req, res) => {
    try {
        const { vehicleId, date } = req.query;
        if (!vehicleId || !date) {
            return res.status(400).json({ success: false, error: 'vehicleId ve date zorunlu' });
        }

        const TZ_OFFSET_MS = 3 * 60 * 60 * 1000; // UTC+3 Turkey
        const dayStart = new Date(new Date(`${date}T00:00:00.000Z`).getTime() - TZ_OFFSET_MS);
        const dayEnd = new Date(new Date(`${date}T23:59:59.999Z`).getTime() - TZ_OFFSET_MS);

        // assignedVehicleId is stored in metadata
        const allBookings = await prisma.booking.findMany({
            where: {
                productType: 'TRANSFER',
                startDate: { gte: dayStart, lte: dayEnd },
                status: { notIn: ['CANCELLED'] }
            },
            orderBy: { startDate: 'asc' }
        });

        const bookings = allBookings.filter(b => b.metadata?.assignedVehicleId === vehicleId);

        const schedule = bookings.map(b => {
            const { start, end } = getOccupancyWindow(b);
            return {
                bookingId: b.id,
                bookingNumber: b.bookingNumber,
                pickup: b.metadata?.pickup || '',
                dropoff: b.metadata?.dropoff || '',
                pickupDateTime: b.startDate,
                estimatedDurationMinutes: b.metadata?.estimatedDurationMinutes || 120,
                freeAt: end.toISOString(),
                status: b.status
            };
        });

        res.json({ success: true, data: schedule });
    } catch (error) {
        console.error('vehicle-schedule error:', error);
        res.status(500).json({ success: false, error: 'Araç çizelgesi alınamadı' });
    }
});

// ---------------------------------------------------------------------------
// POST /api/operations/check-conflict
// Body: { driverId?, vehicleId?, pickupDateTime, estimatedDurationMinutes?, bookingId? }
// Returns: { conflict: bool, conflictWith?, freeAt? }
// ---------------------------------------------------------------------------
router.post('/check-conflict', authMiddleware, async (req, res) => {
    try {
        const { driverId, vehicleId, pickupDateTime, estimatedDurationMinutes = 120, bookingId } = req.body;

        if (!pickupDateTime || (!driverId && !vehicleId)) {
            return res.status(400).json({ success: false, error: 'pickupDateTime ve driverId veya vehicleId zorunlu' });
        }

        const newStart = new Date(pickupDateTime);
        const newEnd = new Date(newStart.getTime() + (estimatedDurationMinutes + 30) * 60 * 1000);

        // Fetch bookings for the same day ± 1 day (for overnight transfers)
        const dayStart = new Date(newStart);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(newStart);
        dayEnd.setDate(dayEnd.getDate() + 1);
        dayEnd.setHours(23, 59, 59, 999);

        let query = {
            productType: 'TRANSFER',
            startDate: { gte: dayStart, lte: dayEnd },
            status: { notIn: ['CANCELLED'] }
        };

        // Exclude the current booking being edited
        if (bookingId) {
            query.id = { not: bookingId };
        }

        if (driverId) {
            query.driverId = driverId;
        }

        const existingBookings = await prisma.booking.findMany({ where: query });

        // For vehicleId, filter in memory since it's in metadata
        const relevant = driverId
            ? existingBookings
            : existingBookings.filter(b => b.metadata?.assignedVehicleId === vehicleId);

        const conflict = relevant.find(b => {
            const window = getOccupancyWindow(b);
            return windowsOverlap({ start: newStart, end: newEnd }, window);
        });

        if (conflict) {
            const { end } = getOccupancyWindow(conflict);
            return res.json({
                success: true,
                conflict: true,
                conflictWith: conflict.bookingNumber,
                conflictPickup: conflict.metadata?.pickup,
                conflictDropoff: conflict.metadata?.dropoff,
                conflictStart: conflict.startDate,
                freeAt: end.toISOString()
            });
        }

        res.json({ success: true, conflict: false });
    } catch (error) {
        console.error('check-conflict error:', error);
        res.status(500).json({ success: false, error: 'Çakışma kontrolü başarısız' });
    }
});

// ---------------------------------------------------------------------------
// GET /api/operations/driver-availability?date=YYYY-MM-DD
// Returns availability status for ALL drivers
// ---------------------------------------------------------------------------
router.get('/driver-availability', authMiddleware, async (req, res) => {
    try {
        const { date } = req.query;
        if (!date) {
            return res.status(400).json({ success: false, error: 'date zorunlu' });
        }

        const TZ_OFFSET_MS = 3 * 60 * 60 * 1000; // UTC+3 Turkey
        const dayStart = new Date(new Date(`${date}T00:00:00.000Z`).getTime() - TZ_OFFSET_MS);
        const dayEnd = new Date(new Date(`${date}T23:59:59.999Z`).getTime() - TZ_OFFSET_MS);

        // Fetch all personnel with driver job title
        const tenantId = req.tenant?.id;
        const personnel = await prisma.personnel.findMany({
            where: { tenantId, isActive: true }
        });

        const DRIVER_KEYWORDS = ['driver', 'şöför', 'sofor', 'sürücü', 'surucü', 'surücu'];
        const drivers = personnel.filter(p => {
            const title = (p.jobTitle || '').toLowerCase().trim();
            return DRIVER_KEYWORDS.some(kw => title.includes(kw));
        });

        // Fetch all bookings on that date
        const bookings = await prisma.booking.findMany({
            where: {
                productType: 'TRANSFER',
                startDate: { gte: dayStart, lte: dayEnd },
                status: { notIn: ['CANCELLED'] },
                driverId: { not: null }
            },
            orderBy: { startDate: 'asc' }
        });

        // Group by driver
        const bookingsByDriver = {};
        bookings.forEach(b => {
            if (b.driverId) {
                if (!bookingsByDriver[b.driverId]) bookingsByDriver[b.driverId] = [];
                bookingsByDriver[b.driverId].push(b);
            }
        });

        const availability = drivers.map(d => {
            const userId = d.userId;
            const driverBookings = userId ? (bookingsByDriver[userId] || []) : [];

            // Find latest end time
            let busyUntil = null;
            let currentBooking = null;

            driverBookings.forEach(b => {
                const { end } = getOccupancyWindow(b);
                if (!busyUntil || end > busyUntil) {
                    busyUntil = end;
                    currentBooking = b.bookingNumber;
                }
            });

            const now = new Date();
            const isBusy = busyUntil && busyUntil > now;

            return {
                driverId: userId,
                personnelId: d.id,
                name: `${d.firstName} ${d.lastName}`,
                phone: d.phone,
                jobTitle: d.jobTitle,
                status: isBusy ? 'busy' : 'free',
                busyUntil: busyUntil ? busyUntil.toISOString() : null,
                currentBooking,
                totalBookings: driverBookings.length
            };
        });

        res.json({ success: true, data: availability });
    } catch (error) {
        console.error('driver-availability error:', error);
        res.status(500).json({ success: false, error: 'Müsaitlik bilgisi alınamadı' });
    }
});

// ---------------------------------------------------------------------------
// POST /api/operations/ai-suggest
// Body: { bookingId }
// Returns AI-powered driver + vehicle suggestion
// ---------------------------------------------------------------------------
router.post('/ai-suggest', authMiddleware, async (req, res) => {
    try {
        const { bookingId } = req.body;
        if (!bookingId) {
            return res.status(400).json({ success: false, error: 'bookingId zorunlu' });
        }

        const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
        if (!booking) {
            return res.status(404).json({ success: false, error: 'Rezervasyon bulunamadı' });
        }

        const tenantId = req.tenant?.id;

        // Fetch all active vehicles
        const vehicles = await prisma.vehicle.findMany({
            where: { tenantId, status: 'ACTIVE' }
        });

        // Fetch all personnel/drivers
        const personnel = await prisma.personnel.findMany({
            where: { tenantId, isActive: true }
        });
        const DRIVER_KEYWORDS = ['driver', 'şöför', 'sofor', 'sürücü', 'surucü', 'surücu'];
        const drivers = personnel.filter(p => {
            const title = (p.jobTitle || '').toLowerCase().trim();
            return DRIVER_KEYWORDS.some(kw => title.includes(kw));
        });

        // Fetch existing bookings on the same day
        const bookingDate = new Date(booking.startDate);
        const dayStart = new Date(bookingDate);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(bookingDate);
        dayEnd.setHours(23, 59, 59, 999);

        const existingBookings = await prisma.booking.findMany({
            where: {
                productType: 'TRANSFER',
                startDate: { gte: dayStart, lte: dayEnd },
                status: { notIn: ['CANCELLED'] },
                id: { not: bookingId }
            }
        });

        const advisor = getAIAdvisor();
        if (!advisor) {
            return res.status(503).json({
                success: false,
                error: 'AI servisi kullanılamıyor. GEMINI_API_KEY env değişkenini kontrol edin.'
            });
        }

        const suggestion = await advisor.suggestAssignment(booking, drivers, vehicles, existingBookings);

        res.json({ success: true, data: suggestion });
    } catch (error) {
        console.error('ai-suggest error:', error);
        res.status(500).json({ success: false, error: 'AI önerisi alınamadı: ' + error.message });
    }
});

// ---------------------------------------------------------------------------
// POST /api/operations/auto-assign
// Body: { date: 'YYYY-MM-DD', applyNow?: bool }
// date defaults to today.
// applyNow=false → returns preview (default)
// applyNow=true  → saves assignments immediately
// ---------------------------------------------------------------------------
router.post('/auto-assign', authMiddleware, async (req, res) => {
    try {
        const tenantId = req.tenant?.id;
        const targetDate = req.body.date || new Date().toISOString().split('T')[0];
        const applyNow = req.body.applyNow === true;
        const startDateStr = req.body.startDate;
        const endDateStr = req.body.endDate;

        let dayStart, dayEnd;
        const TZ_OFFSET_MS = 3 * 60 * 60 * 1000; // UTC+3 Turkey
        
        if (startDateStr && endDateStr) {
            dayStart = new Date(new Date(`${startDateStr}T00:00:00.000Z`).getTime() - TZ_OFFSET_MS);
            dayEnd = new Date(new Date(`${endDateStr}T23:59:59.999Z`).getTime() - TZ_OFFSET_MS);
        } else {
            dayStart = new Date(new Date(`${targetDate}T00:00:00.000Z`).getTime() - TZ_OFFSET_MS);
            dayEnd = new Date(new Date(`${targetDate}T23:59:59.999Z`).getTime() - TZ_OFFSET_MS);
        }

        // 1. Fetch unassigned bookings for the date range (no driverId set)
        const allBookings = await prisma.booking.findMany({
            where: {
                tenantId, // Ensure tenant scoping
                productType: 'TRANSFER',
                startDate: { gte: dayStart, lte: dayEnd },
                status: { notIn: ['CANCELLED', 'COMPLETED'] }
            },
            orderBy: { startDate: 'asc' }
        });

        const unassigned = allBookings.filter(b => !b.driverId);
        const alreadyAssigned = allBookings.filter(b => b.driverId);

        if (unassigned.length === 0) {
            return res.json({
                success: true,
                message: 'Atanacak rezervasyon bulunamadı. Tüm transferler zaten atanmış.',
                proposals: [],
                skipped: []
            });
        }

        // 2. Fetch all active drivers (personnel with driver job title who have a userId)
        const personnel = await prisma.personnel.findMany({
            where: { tenantId, isActive: true }
        });
        const DRIVER_KEYWORDS = ['driver', 'şöför', 'sofor', 'sürücü', 'surucü', 'surücu'];
        let drivers = personnel.filter(p => {
            const title = (p.jobTitle || '').toLowerCase().trim();
            return DRIVER_KEYWORDS.some(kw => title.includes(kw)) && p.userId;
        });

        // Exclude drivers with active emergencies
        const driverUserIds = drivers.map(d => d.userId).filter(Boolean);
        const driverUsers = await prisma.user.findMany({
            where: { id: { in: driverUserIds } },
            select: { id: true, metadata: true }
        });
        const emergencyDriverIds = new Set(
            driverUsers.filter(u => u.metadata?.emergency?.active).map(u => u.id)
        );
        if (emergencyDriverIds.size > 0) {
            console.log(`[AutoAssign] ${emergencyDriverIds.size} driver(s) excluded due to active emergency`);
            drivers = drivers.filter(d => !emergencyDriverIds.has(d.userId));
        }

        if (drivers.length === 0) {
            return res.json({
                success: false,
                error: 'Sistemde aktif şöför bulunamadı.',
                proposals: [],
                skipped: []
            });
        }

        // 3. Fetch all active vehicles
        const vehicles = await prisma.vehicle.findMany({
            where: { tenantId, status: 'ACTIVE' }
        });

        // 4. Get route duration for each unassigned booking
        const RouteService = getRouteService();
        for (const b of unassigned) {
            if (!b.metadata?.estimatedDurationMinutes) {
                if (RouteService && b.metadata?.pickup && b.metadata?.dropoff) {
                    try {
                        const r = await RouteService.getRouteDuration(b.metadata.pickup, b.metadata.dropoff);
                        b._estimatedDuration = r.durationMinutes;
                    } catch (_) {
                        b._estimatedDuration = 120;
                    }
                } else {
                    b._estimatedDuration = 120;
                }
            } else {
                b._estimatedDuration = b.metadata.estimatedDurationMinutes;
            }
        }

        // 5. Build a schedule map (in-memory) — starts with existing assignments,
        //    then updates as we assign bookings in this run.
        // schedule[driverId] = array of { start, end } windows
        const schedule = {};
        const vehicleSchedule = {}; // vehicleId → windows

        // Seed with already-assigned bookings
        alreadyAssigned.forEach(b => {
            const start = new Date(b.startDate);
            const dur = (b.metadata?.estimatedDurationMinutes || 120) + 30;
            const end = new Date(start.getTime() + dur * 60000);
            if (b.driverId) {
                if (!schedule[b.driverId]) schedule[b.driverId] = [];
                schedule[b.driverId].push({ start, end });
            }
            const vid = b.metadata?.assignedVehicleId;
            if (vid) {
                if (!vehicleSchedule[vid]) vehicleSchedule[vid] = [];
                vehicleSchedule[vid].push({ start, end });
            }
        });

        const isFree = (windows, newStart, newEnd) => {
            return !(windows || []).some(w => newStart < w.end && w.start < newEnd);
        };

        // Working hours guard: drivers should work between 06:00 and 22:00 local
        // (We check the booking's start time in UTC — simple check)
        const WORK_START_HOUR = 6;
        const WORK_END_HOUR = 22;
        const isWithinWorkHours = (dt, durationMin) => {
            const startH = dt.getUTCHours();
            const endH = new Date(dt.getTime() + durationMin * 60000).getUTCHours();
            return startH >= WORK_START_HOUR && endH <= WORK_END_HOUR;
        };

        const isShuttleBooking = (b) => {
            const vt = (b.metadata?.vehicleType || '').toLowerCase();
            return vt.includes('shuttle') || vt.includes('paylaşımlı');
        };

        const proposals = [];
        const skipped = [];

        // 6. Greedy assignment: for each booking (sorted by time), try each driver
        for (const booking of unassigned) {
            const bStart = new Date(booking.startDate);
            const dur = booking._estimatedDuration;
            const bEnd = new Date(bStart.getTime() + (dur + 30) * 60000);
            const needsShuttle = isShuttleBooking(booking);

            // Filter vehicles by type
            const matchingVehicles = needsShuttle
                ? vehicles.filter(v => v.metadata?.usageType === 'SHUTTLE' || v.metadata?.shuttleMode)
                : vehicles.filter(v => !v.metadata?.usageType || (v.metadata?.usageType !== 'SHUTTLE' && !v.metadata?.shuttleMode));

            let assigned = false;

            // ─── Sort drivers by total MINUTES worked today (not booking count).
            // A driver who worked 12 h will always rank below one who worked 10 h,
            // even if both have the same number of bookings.
            const getTotalMinutes = (driverId) => {
                return (schedule[driverId] || []).reduce((sum, w) => {
                    return sum + (w.end - w.start) / 60000; // ms → minutes
                }, 0);
            };

            const sortedDrivers = [...drivers].sort((a, b) => {
                return getTotalMinutes(a.userId) - getTotalMinutes(b.userId);
            });

            for (const driver of sortedDrivers) {
                const dId = driver.userId;

                // Check driver is free
                if (!isFree(schedule[dId], bStart, bEnd)) continue;

                // Optional: check working hours
                if (!isWithinWorkHours(bStart, dur)) {
                    // Still allow but mark as outside normal hours
                }

                // Find an available vehicle for this driver (prefer driver's own vehicle)
                const driverVehicle = matchingVehicles.find(v => v.driverId === dId && isFree(vehicleSchedule[v.id], bStart, bEnd));
                const anyVehicle = !driverVehicle
                    ? matchingVehicles.find(v => isFree(vehicleSchedule[v.id], bStart, bEnd))
                    : null;

                const vehicle = driverVehicle || anyVehicle;

                // Update in-memory schedule
                if (!schedule[dId]) schedule[dId] = [];
                schedule[dId].push({ start: bStart, end: bEnd });

                if (vehicle) {
                    if (!vehicleSchedule[vehicle.id]) vehicleSchedule[vehicle.id] = [];
                    vehicleSchedule[vehicle.id].push({ start: bStart, end: bEnd });
                }

                // Capture how many minutes this driver had BEFORE this assignment
                const driverMinutesBefore = getTotalMinutes(dId);

                proposals.push({
                    bookingId: booking.id,
                    bookingNumber: booking.bookingNumber,
                    pickup: booking.metadata?.pickup || '',
                    dropoff: booking.metadata?.dropoff || '',
                    pickupDateTime: booking.startDate,
                    estimatedDurationMinutes: dur,
                    freeAt: bEnd.toISOString(),
                    driverId: dId,
                    driverName: `${driver.firstName} ${driver.lastName}`,
                    driverWorkedMinutes: Math.round(driverMinutesBefore), // total minutes before this job
                    vehicleId: vehicle?.id || null,
                    vehiclePlate: vehicle?.plateNumber || null,
                    vehicleModel: vehicle ? `${vehicle.brand || ''} ${vehicle.model || ''}`.trim() : null,
                    outsideWorkHours: !isWithinWorkHours(bStart, dur)
                });

                assigned = true;
                break;
            }

            if (!assigned) {
                skipped.push({
                    bookingId: booking.id,
                    bookingNumber: booking.bookingNumber,
                    pickup: booking.metadata?.pickup || '',
                    dropoff: booking.metadata?.dropoff || '',
                    pickupDateTime: booking.startDate,
                    reason: 'Tüm şöförler bu saat diliminde meşgul'
                });
            }
        }

        // 7. If applyNow, save all proposals
        if (applyNow && proposals.length > 0) {
            for (const p of proposals) {
                const currentBooking = await prisma.booking.findUnique({ where: { id: p.bookingId } });
                if (!currentBooking) continue;

                await prisma.booking.update({
                    where: { id: p.bookingId },
                    data: {
                        driverId: p.driverId,
                        metadata: {
                            ...(currentBooking.metadata || {}),
                            assignedVehicleId: p.vehicleId || currentBooking.metadata?.assignedVehicleId,
                            estimatedDurationMinutes: p.estimatedDurationMinutes,
                            freeAt: p.freeAt,
                            driverId: p.driverId,
                            autoAssigned: true
                        }
                    }
                });
            }
        }

        res.json({
            success: true,
            proposals,
            skipped,
            applied: applyNow,
            summary: {
                total: unassigned.length,
                assigned: proposals.length,
                skipped: skipped.length
            }
        });

    } catch (error) {
        console.error('auto-assign error:', error);
        res.status(500).json({ success: false, error: 'Otomatik atama başarısız: ' + error.message });
    }
});

// ---------------------------------------------------------------------------
// GET /api/operations/shuttle-runs?date=YYYY-MM-DD
// Groups shuttle bookings into "runs" (grouped by shuttleRouteId + departureTime)
// ---------------------------------------------------------------------------
router.get('/shuttle-runs', authMiddleware, async (req, res, next) => {
    let LOG_TAG = "INIT";
    try {
        const { date } = req.query;
        LOG_TAG = "PARSE_DATE";
        
        // Safety for array dates or invalid strings
        let targetDate;
        if (Array.isArray(date)) {
            targetDate = date[0];
        } else {
            targetDate = date || new Date().toISOString().split('T')[0];
        }

        if (!targetDate || typeof targetDate !== 'string') {
            targetDate = new Date().toISOString().split('T')[0];
        }

        LOG_TAG = "CONSTRUCT_DATES";
        // Ensure valid date string for ISO
        let datePart = targetDate;
        if (targetDate.includes('T')) {
            datePart = targetDate.split('T')[0];
        }
        
        if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart.substring(0, 10))) {
             datePart = new Date().toISOString().split('T')[0];
        }
        
        // Türkiye UTC+3'te çalışır. UTC midnight kullanırsak 02:15 TR = 23:15 UTC önceki gün,
        // bu yüzden gece saatindeki bookinglar yanlış güne düşüyor.
        // Çözüm: TR günü 00:00 → UTC 21:00 önceki gün, TR günü 23:59 → UTC 20:59 aynı gün
        const TZ_OFFSET_MS = 3 * 60 * 60 * 1000; // UTC+3
        const dayStart = new Date(new Date(`${datePart}T00:00:00.000Z`).getTime() - TZ_OFFSET_MS);
        const dayEnd   = new Date(new Date(`${datePart}T23:59:59.999Z`).getTime() - TZ_OFFSET_MS);

        LOG_TAG = "CHECK_TENANT";
        const user = req.user;
        const tenantId = user?.tenantId;
        if (!tenantId) {
             return res.status(401).json({ success: false, error: 'Tenant context missing.' });
        }

        LOG_TAG = "FETCH_TENANT_HUBS";
        const tenantInfo = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } });
        const hubs = tenantInfo?.settings?.hubs || [];
        const trLower = (s) => (s||'').toLocaleLowerCase('tr');
        
        function getAbbreviationAndType(fromStr, toStr) {
             let fromCode = null;
             let toCode = null;
             let fromIsAirport = false;
             let toIsAirport = false;
             
             for (const hub of hubs) {
                 const keys = hub.keywords ? hub.keywords.split(',').map(k => trLower(k).trim()) : [];
                 if (hub.code) keys.push(trLower(hub.code));
                 if (hub.name) keys.push(trLower(hub.name));
                 
                 const isAirportHub = hub.name && (trLower(hub.name).includes('havaliman') || trLower(hub.name).includes('airport') || ['ayt', 'gzp'].includes(trLower(hub.code)));

                 if (!fromCode && keys.some(k => k && trLower(fromStr).includes(k))) {
                     fromCode = hub.code || '???';
                     if(isAirportHub) fromIsAirport = true;
                 }
                 if (!toCode && keys.some(k => k && trLower(toStr).includes(k))) {
                     toCode = hub.code || '???';
                     if(isAirportHub) toIsAirport = true;
                 }
             }
             
             const safeUpper = s => (s||'').substring(0,3).toUpperCase();
             if (!fromCode) fromCode = safeUpper(fromStr) || '???';
             if (!toCode) toCode = safeUpper(toStr) || '???';
             
             let type = '';
             let fLower = trLower(fromStr);
             let tLower = trLower(toStr);
             
             if (toIsAirport && !fromIsAirport) type = 'DEP';
             else if (fromIsAirport && !toIsAirport) type = 'ARV';
             else if (tLower.includes('havaliman') || tLower.includes('airport')) type = 'DEP';
             else if (fLower.includes('havaliman') || fLower.includes('airport')) type = 'ARV';
             else type = 'TRF';
             
             return { fromCode, toCode, type };
        }

        const bookings = await prisma.booking.findMany({
            where: {
                tenantId: tenantId, 
                productType: 'TRANSFER',
                startDate: { gte: dayStart, lte: dayEnd },
                status: { notIn: ['CANCELLED', 'COMPLETED', 'PENDING'] },
            },
            include: { customer: true, agency: true },
            orderBy: { startDate: 'asc' }
        });

        LOG_TAG = "FILTER_SHUTTLES";
        const shuttleBookings = bookings.filter(b => {
            const m = b.metadata || {};
            const vt = String(m.vehicleType || '').toLowerCase();
            const tt = String(m.transferType || '').toLowerCase();
            return vt.includes('shuttle') || vt.includes('paylaşımlı') || tt === 'shuttle' || m.shuttleRouteId;
        });

        // DEBUG: Log shuttle bookings summary
        console.log('[DEBUG shuttle-runs] Total bookings:', bookings.length, '| Shuttle bookings:', shuttleBookings.length);
        console.log('[DEBUG shuttle-runs] All booking IDs:', bookings.map(b => ({ id: b.id, name: b.contactName, status: b.status, driverId: b.driverId, routeId: b.metadata?.shuttleRouteId })));
        console.log('[DEBUG shuttle-runs] Shuttle booking IDs:', shuttleBookings.map(b => ({ id: b.id, name: b.contactName, driverId: b.driverId, routeId: b.metadata?.shuttleRouteId })));

        LOG_TAG = "QUERY_ROUTES";
        const shuttleRoutes = await prisma.shuttleRoute.findMany({
            where: { tenantId: tenantId },
            include: { vehicle: true }
        });
        
        const routeMap = {};
        if (shuttleRoutes && Array.isArray(shuttleRoutes)) {
            shuttleRoutes.forEach(r => { if (r && r.id) routeMap[r.id] = r; });
        }

        LOG_TAG = "GROUP_RUNS";
        const runsMap = {};
        shuttleBookings.forEach(b => {
            const m = b.metadata || {};
            const routeId = m.shuttleRouteId;

            let key;
            let routeNameForGrouping;
            let fromNameForGrouping = m.pickup || '';
            let toNameForGrouping = m.dropoff || '';
            let maxSeatsForGrouping = 0;
            let pricePerSeatForGrouping = 0;
            const masterTime = m.shuttleMasterTime || '';

            if (m.manualRunId) {
                key = m.manualRunId.startsWith('MANUAL::') ? m.manualRunId : `MANUAL::${m.manualRunId}`;
                routeNameForGrouping = m.manualRunName || 'Manuel Sefer';
                fromNameForGrouping = 'Manuel';
                toNameForGrouping = m.manualRunName || 'Manuel Sefer';
            } else if (routeId && routeMap[routeId]) {
                key = `ROUTE::${routeId}${masterTime ? '::' + masterTime : ''}`;
                const route = routeMap[routeId];
                
                const { fromCode, toCode, type } = getAbbreviationAndType(route.fromName, route.toName);
                routeNameForGrouping = `${fromCode} - ${toCode} ${type}`;
                
                if (masterTime) {
                    routeNameForGrouping += ` (${masterTime})`;
                }
                fromNameForGrouping = route.fromName || fromNameForGrouping;
                toNameForGrouping = route.toName || toNameForGrouping;
                maxSeatsForGrouping = Number(route.maxSeats) || 0;
                pricePerSeatForGrouping = Number(route.pricePerSeat) || 0;
            } else {
                const dropoff = String(m.dropoff || 'Bilinmeyen Varış').trim();
                const dropoffKey = dropoff.substring(0, 60).toLowerCase().replace(/\s+/g, ' ');
                key = `ADHOC::${dropoffKey}${masterTime ? '::' + masterTime : ''}`;
                
                const { fromCode, toCode, type } = getAbbreviationAndType('Bilinmeyen', dropoff);
                routeNameForGrouping = `Shuttle → ${toCode} ${type}`;
                
                if (masterTime) {
                    routeNameForGrouping += ` (${masterTime})`;
                }
                fromNameForGrouping = 'Çeşitli Noktalar';
                toNameForGrouping = dropoff;
            }

            if (!runsMap[key]) {
                // Determine trip type: use metadata if available, otherwise detect from booking pickup/dropoff
                let tripType;
                if (m.tripType) {
                    tripType = m.tripType; // Use saved trip type from booking
                } else {
                    // Detect from actual pickup/dropoff locations
                    tripType = getTripType(m.pickup, m.dropoff);
                }
                
                runsMap[key] = {
                    runKey: key,
                    shuttleRouteId: routeId || null,
                    routeName: routeNameForGrouping,
                    fromName: fromNameForGrouping,
                    toName:   toNameForGrouping,
                    tripType: tripType,
                    departureTime: masterTime || null,
                    _originalMasterTime: masterTime || null,
                    date: datePart,
                    maxSeats: maxSeatsForGrouping,
                    pricePerSeat: pricePerSeatForGrouping,
                    driverId: null,
                    vehicleId: null,
                    bookings: []
                };
            }

            if (b.driverId && !runsMap[key].driverId) runsMap[key].driverId = b.driverId;
            if (m.assignedVehicleId && !runsMap[key].vehicleId) runsMap[key].vehicleId = m.assignedVehicleId;

            runsMap[key].bookings.push({
                id: b.id,
                bookingNumber: b.bookingNumber,
                contactName: b.contactName,
                contactPhone: b.contactPhone,
                contactEmail: b.contactEmail || b.customer?.email || null,
                adults: b.adults || 0,
                children: b.children || 0,
                infants: b.infants || 0,
                pickup: m.pickup || '',
                dropoff: m.dropoff || '',
                pickupDateTime: b.startDate,
                status: b.status,
                paymentStatus: b.paymentStatus || null,
                paymentMethod: m.paymentMethod || null,
                driverId: b.driverId,
                agencyId: b.agencyId || null,
                assignedVehicleId: m.assignedVehicleId || null,
                agencyName: b.agency?.name || null,
                flightNumber: m.flightNumber || null,
                flightTime: m.flightTime || null,
                pickupRegionCode: m.pickupRegionCode || null,
                dropoffRegionCode: m.dropoffRegionCode || null,
                shuttleSortOrder: m.shuttleSortOrder || null,
                extraServices: m.extraServices || null,
                acknowledgedAt: m.acknowledgedAt || null,
                notes: b.specialRequests || m.notes || null,
                tripType: m.tripType || null,
                metadata: m,
            });
        });

        LOG_TAG = "POST_PROCESS_TIMES";
        Object.values(runsMap).forEach(run => {
            run.bookings.sort((a, b) => {
                const orderA = a.shuttleSortOrder ?? Number.MAX_SAFE_INTEGER;
                const orderB = b.shuttleSortOrder ?? Number.MAX_SAFE_INTEGER;
                
                if (orderA !== orderB) {
                    return orderA - orderB;
                }

                const dA = a.pickupDateTime ? new Date(a.pickupDateTime).getTime() : 0;
                const dB = b.pickupDateTime ? new Date(b.pickupDateTime).getTime() : 0;
                return dA - dB;
            });

            if (run.bookings.length > 0 && !run.departureTime) {
                try {
                    const firstPickup = run.bookings[0].pickupDateTime;
                    if (firstPickup) {
                        const d = new Date(firstPickup);
                        if (!isNaN(d.getTime())) {
                            const hours = d.getHours();
                            const mins = d.getMinutes();
                            run.departureTime = `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
                        } else { run.departureTime = "--:--"; }
                    } else { run.departureTime = "--:--"; }
                } catch (e) {
                    run.departureTime = "??:??";
                }
            }
            if (!run.departureTime) run.departureTime = "--:--";
        });

        LOG_TAG = "SORT_RUNS";
        const runs = Object.values(runsMap).sort((a, b) => {
            const timeA = a.departureTime || '99:99';
            const timeB = b.departureTime || '99:99';
            if (timeA < timeB) return -1;
            if (timeA > timeB) return 1;
            return (a.routeName || '').localeCompare(b.routeName || '');
        });

        LOG_TAG = "FINALIZE";
        res.json({ success: true, count: runs.length, data: runs });

    } catch (error) {
        console.error(`SHUTTLE_RUNS_ERROR at [${LOG_TAG}]:`, error);
        // Enrich error for global handler
        error.LOG_TAG = LOG_TAG;
        next(error); // Pass to global error handler in index.js for lastServerError capturing
    }
});


// ---------------------------------------------------------------------------
// PATCH /api/operations/shuttle-runs/assign
// Body: { bookingIds: string[], driverId?: string, vehicleId?: string }
// Bulk-assigns driver and/or vehicle to all bookings in a run
// ---------------------------------------------------------------------------
router.patch('/shuttle-runs/assign', authMiddleware, async (req, res) => {
    try {
        const { bookingIds, driverId, vehicleId } = req.body;

        if (!bookingIds || !Array.isArray(bookingIds) || bookingIds.length === 0) {
            return res.status(400).json({ success: false, error: 'bookingIds array zorunlu' });
        }
        if (driverId === undefined && vehicleId === undefined) {
            return res.status(400).json({ success: false, error: 'driverId veya vehicleId gerekli' });
        }

        const updates = [];
        for (const bookingId of bookingIds) {
            const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
            if (!booking) continue;

            const updateData = { metadata: { ...(booking.metadata || {}) } };
            
            // Explicitly handle null values for unassigning
            if (driverId !== undefined) {
                updateData.driverId = driverId; // Can be string or null
                updateData.metadata.driverId = driverId;
            }
            if (vehicleId !== undefined) {
                updateData.metadata.assignedVehicleId = vehicleId; // Can be string or null
            }

            const updated = await prisma.booking.update({
                where: { id: bookingId },
                data: updateData
            });
            updates.push(updated.id);
        }

        const io = req.app.get('io');
        if (io) {
            io.to('admin_monitoring').emit('shuttle_runs_updated', { updatedCount: updates.length });
        }

        // Send push notification to driver if driverId provided
        if (driverId) {
            try {
                const driver = await prisma.user.findUnique({ where: { id: driverId } });
                console.log(`[Push] shuttle-runs/assign driverId=${driverId} found=${!!driver} pushToken=${driver?.pushToken}`);

                let resolvedDriver = driver;
                if (!resolvedDriver) {
                    const personnel = await prisma.personnel.findFirst({ where: { id: driverId }, include: { user: true } });
                    resolvedDriver = personnel?.user || null;
                    if (resolvedDriver) console.log(`[Push] Resolved via personnel: userId=${resolvedDriver.id} pushToken=${resolvedDriver.pushToken}`);
                }

                let driverMeta = resolvedDriver?.metadata || {};
                if (typeof driverMeta === 'string') {
                    try { driverMeta = JSON.parse(driverMeta); } catch (e) { driverMeta = {}; }
                }

                const pushToken = resolvedDriver?.pushToken || driverMeta?.expoPushToken;

                if (pushToken && pushToken.startsWith('ExponentPushToken')) {
                    const firstUpdated = await prisma.booking.findFirst({ where: { id: { in: updates } }, select: { metadata: true, startDate: true, bookingNumber: true } });
                    const pickupStr = firstUpdated?.metadata?.pickup || 'Belirtilmemiş';
                    const dateStr = firstUpdated?.startDate
                        ? new Date(firstUpdated.startDate).toLocaleString('tr-TR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
                        : '';

                    fetch('https://exp.host/--/api/v2/push/send', {
                        method: 'POST',
                        headers: {
                            'Accept': 'application/json',
                            'Accept-Encoding': 'gzip, deflate',
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            to: pushToken,
                            sound: 'default',
                            title: '🚗 Yeni İş Atandı!',
                            body: `${pickupStr} • ${dateStr}`,
                            data: {
                                bookingIds: updates,
                                bookingNumber: firstUpdated?.bookingNumber,
                                type: 'operationAssigned',
                                pickup: pickupStr,
                                start: firstUpdated?.startDate
                            },
                            priority: 'high',
                            channelId: 'operations'
                        })
                    }).then(() => console.log(`[Push] Sent to driver ${driverId} for ${updates.length} bookings`))
                      .catch(e => console.error('[Push] Send error:', e.message));
                } else {
                    console.log(`[Push] No valid pushToken for driverId=${driverId}`);
                }
            } catch (pushErr) {
                console.error('Push notification error (non-fatal):', pushErr.message);
            }
        }

        res.json({ success: true, updatedCount: updates.length, updatedIds: updates });
    } catch (error) {
        console.error('shuttle-runs/assign error:', error);
        res.status(500).json({ success: false, error: 'Shuttle atama başarısız: ' + error.message });
    }
});

// ---------------------------------------------------------------------------
// POST /api/operations/shuttle-runs/move
// Body: { bookingIds: string[], sampleBookingId?: string, targetRun?: {...} }
// Moves bookings into a specific shuttle run by mirroring metadata from a sibling booking
// ---------------------------------------------------------------------------
router.post('/shuttle-runs/move', authMiddleware, async (req, res) => {
    try {
        const { bookingIds, targetRun, sampleBookingId, targetBookingIds } = req.body;
        
        if (!bookingIds || !Array.isArray(bookingIds) || bookingIds.length === 0) {
            return res.status(400).json({ success: false, error: 'bookingIds array zorunlu' });
        }

        // ── Trip Type Compatibility Check ──
        // If moving to an existing run with passengers, ensure trip types match
        if (sampleBookingId) {
            const sample = await prisma.booking.findUnique({ where: { id: sampleBookingId } });
            if (sample && sample.metadata?.tripType) {
                const targetTripType = sample.metadata.tripType;
                
                // Check all bookings being moved have compatible trip types
                for (const bookingId of bookingIds) {
                    const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
                    if (!booking) continue;
                    
                    const bookingTripType = booking.metadata?.tripType;
                    // Allow move if no tripType defined yet, or if types match
                    if (bookingTripType && bookingTripType !== targetTripType) {
                        return res.status(400).json({ 
                            success: false, 
                            error: 'TRIP_TYPE_MISMATCH',
                            message: `Bu rezervasyon ${bookingTripType} tipinde, hedef sefer ise ${targetTripType} tipinde. Farklı yönlerdeki rezervasyonlar aynı sefere eklenemez.`,
                            bookingTripType,
                            targetTripType,
                            bookingId: booking.id,
                            bookingName: booking.contactName
                        });
                    }
                }
            }
        }

        let metaToApply = {
            shuttleRouteId: targetRun?.shuttleRouteId || null,
            shuttleMasterTime: targetRun?.shuttleMasterTime || null,
            manualRunId: targetRun?.manualRunId || null,
            manualRunName: targetRun?.manualRunName || null,
        };

        if (sampleBookingId) {
            const sample = await prisma.booking.findUnique({ where: { id: sampleBookingId } });
            if (sample && sample.metadata) {
                const m = sample.metadata;
                // If the target is an ADHOC run (no standard metadata grouping keys), upgrade it to a manual run
                // to support reliable continuous grouping for the old and new moved passenger(s).
                if (!m.shuttleRouteId && !m.manualRunId) {
                    const upgradeId = `MANUAL::${Date.now()}`;
                    metaToApply.manualRunId = upgradeId;
                    metaToApply.manualRunName = targetRun?.manualRunName || 'Birleştirilmiş Shuttle Seferi';
                    
                    // Upgrade all existing bookings in the target run to the same new manual run ID
                    if (targetBookingIds && targetBookingIds.length > 0) {
                        for (const tbId of targetBookingIds) {
                            const tb = await prisma.booking.findUnique({ where: { id: tbId } });
                            if (tb) {
                                await prisma.booking.update({
                                    where: { id: tbId },
                                    data: {
                                        metadata: { ...(tb.metadata || {}), manualRunId: metaToApply.manualRunId, manualRunName: metaToApply.manualRunName }
                                    }
                                });
                            }
                        }
                    }
                } else {
                    metaToApply.shuttleRouteId = m.shuttleRouteId || null;
                    metaToApply.shuttleMasterTime = m.shuttleMasterTime || null;
                    metaToApply.manualRunId = m.manualRunId || null;
                    metaToApply.manualRunName = m.manualRunName || null;
                }
            }
        }

        if (!metaToApply.shuttleRouteId && !metaToApply.manualRunId && !metaToApply.shuttleMasterTime) {
            return res.status(400).json({ success: false, error: 'Hedef sefer bilgisi yetersiz (shuttleRouteId, manualRunId veya shuttleMasterTime gerekli)' });
        }

        const updates = [];
        for (const bookingId of bookingIds) {
            const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
            if (!booking) continue;

            let driverIdToSet = booking.driverId;
            let vehicleIdToSet = booking.metadata?.assignedVehicleId || null;

            if (sampleBookingId) {
                // If joining an existing run with passengers, adopt the target run's explicit vehicle/driver mappings
                const sample = await prisma.booking.findUnique({ where: { id: sampleBookingId } });
                driverIdToSet = sample ? sample.driverId : null;
                vehicleIdToSet = sample?.metadata?.assignedVehicleId || null;
            } else if (targetRun) {
                // New/empty manual runs start without a driver/vehicle assigned implicitly
                // Ensure moving a passenger into an empty run does NOT automatically link their vehicle to the generic run.
                driverIdToSet = null;
                vehicleIdToSet = null;
            }

            const updated = await prisma.booking.update({
                where: { id: bookingId },
                data: {
                    driverId: driverIdToSet,
                    metadata: {
                        ...(booking.metadata || {}),
                        ...metaToApply,
                        assignedVehicleId: vehicleIdToSet
                    }
                }
            });
            updates.push(updated.id);
        }

        const io = req.app.get('io');
        if (io) {
            io.to('admin_monitoring').emit('shuttle_runs_updated', { updatedCount: updates.length });
        }

        res.json({ success: true, updatedCount: updates.length });
    } catch (error) {
        console.error('shuttle-runs/move error:', error);
        res.status(500).json({ success: false, error: 'Geçiş işlemi başarısız: ' + error.message });
    }
});
// ---------------------------------------------------------------------------
// POST /api/operations/shuttle-runs/sort
// Body: { items: [{ bookingId: string, sortOrder: number }, ...] }
// Updates shuttleSortOrder in Booking metadata
// ---------------------------------------------------------------------------
router.post('/shuttle-runs/sort', authMiddleware, async (req, res) => {
    try {
        const { items } = req.body;
        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ success: false, error: 'items dizisi zorunlu' });
        }

        let updatedCount = 0;
        for (const item of items) {
            const booking = await prisma.booking.findUnique({ where: { id: item.bookingId } });
            if (booking) {
                await prisma.booking.update({
                    where: { id: item.bookingId },
                    data: {
                        metadata: {
                            ...(booking.metadata || {}),
                            shuttleSortOrder: item.sortOrder
                        }
                    }
                });
                updatedCount++;
            }
        }

        const io = req.app.get('io');
        if (io) {
            io.to('admin_monitoring').emit('shuttle_runs_updated', { updatedCount });
        }

        res.json({ success: true, updatedCount });
    } catch (error) {
        console.error('shuttle-runs/sort error:', error);
        res.status(500).json({ success: false, error: 'Sıralama işlemi başarısız: ' + error.message });
    }
});

// ---------------------------------------------------------------------------
// PATCH /api/operations/shuttle-runs/update
// Body: { runKey: string, departureTime: string, routeName: string, tripType: string, bookingIds: string[] }
// Updates shuttleMasterTime and/or manualRunName and/or tripType for all bookings in a run
// ---------------------------------------------------------------------------
router.patch('/shuttle-runs/update', authMiddleware, async (req, res) => {
    try {
        const { runKey, departureTime, routeName, tripType, bookingIds } = req.body;
        
        if (!bookingIds || !Array.isArray(bookingIds) || bookingIds.length === 0) {
            return res.status(400).json({ success: false, error: 'bookingIds dizisi zorunlu' });
        }

        let updatedCount = 0;
        for (const bookingId of bookingIds) {
            const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
            if (!booking) continue;

            const meta = booking.metadata || {};
            const updatedMeta = { ...meta };

            // Update departure time
            if (departureTime !== undefined) {
                updatedMeta.shuttleMasterTime = departureTime;
            }

            // Update route name for manual runs
            if (routeName !== undefined && meta.manualRunId) {
                updatedMeta.manualRunName = routeName;
            }

            // Update trip type
            if (tripType !== undefined && ['DEP', 'ARV', 'ARA'].includes(tripType)) {
                updatedMeta.tripType = tripType;
            }

            await prisma.booking.update({
                where: { id: bookingId },
                data: { metadata: updatedMeta }
            });
            updatedCount++;
        }

        const io = req.app.get('io');
        if (io) {
            io.to('admin_monitoring').emit('shuttle_runs_updated', { runKey, updatedCount });
        }

        res.json({ success: true, updatedCount });
    } catch (error) {
        console.error('shuttle-runs/update error:', error);
        res.status(500).json({ success: false, error: 'Sefer güncelleme başarısız: ' + error.message });
    }
});

// ---------------------------------------------------------------------------
// POST /api/operations/shuttle-runs/optimize-route
// Body: { bookingIds: string[], destinationAddress: string }
// Geocodes pickup addresses and sorts by distance to destination (farthest first)
// Returns optimized order of booking IDs
// ---------------------------------------------------------------------------
router.post('/shuttle-runs/optimize-route', authMiddleware, async (req, res) => {
    try {
        const { bookingIds, destinationAddress } = req.body;
        
        if (!bookingIds || !Array.isArray(bookingIds) || bookingIds.length === 0) {
            return res.status(400).json({ success: false, error: 'bookingIds dizisi zorunlu' });
        }

        const { getRouteDuration } = require('../services/RouteService');
        
        // Geocode helper (same as RouteService)
        const geocodeAddress = (address) => {
            return new Promise((resolve, reject) => {
                const https = require('https');
                const query = encodeURIComponent(address);
                const options = {
                    hostname: 'nominatim.openstreetmap.org',
                    path: `/search?q=${query}&format=json&limit=1`,
                    method: 'GET',
                    headers: { 'User-Agent': 'SmartTransfer/1.0 (contact@smartransfer.com)' }
                };
                const req = https.request(options, (res) => {
                    let data = '';
                    res.on('data', chunk => data += chunk);
                    res.on('end', () => {
                        try {
                            const results = JSON.parse(data);
                            if (results && results.length > 0) {
                                resolve({ lat: parseFloat(results[0].lat), lng: parseFloat(results[0].lon) });
                            } else {
                                resolve(null); // Could not geocode
                            }
                        } catch (e) { resolve(null); }
                    });
                });
                req.on('error', () => resolve(null));
                req.setTimeout(8000, () => { req.destroy(); resolve(null); });
                req.end();
            });
        };

        // Haversine distance in km
        const haversine = (lat1, lng1, lat2, lng2) => {
            const R = 6371;
            const dLat = (lat2 - lat1) * Math.PI / 180;
            const dLng = (lng2 - lng1) * Math.PI / 180;
            const a = Math.sin(dLat / 2) ** 2 +
                Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                Math.sin(dLng / 2) ** 2;
            return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        };

        // 1. Get bookings with metadata (pickup is stored in metadata)
        const bookings = await prisma.booking.findMany({
            where: { id: { in: bookingIds } },
            select: { id: true, metadata: true }
        });

        // 2. Geocode destination - try multiple formats
        console.log('[optimize-route] Destination address:', destinationAddress);
        let destCoords = null;
        
        // Try the provided address first
        if (destinationAddress) {
            destCoords = await geocodeAddress(destinationAddress);
        }
        
        // Fallback attempts
        if (!destCoords) {
            console.log('[optimize-route] Trying fallback: Gazipaşa Havalimanı, Alanya');
            destCoords = await geocodeAddress('Gazipaşa Havalimanı, Alanya, Antalya, Türkiye');
        }
        if (!destCoords) {
            console.log('[optimize-route] Trying fallback: Gazipasa Airport');
            destCoords = await geocodeAddress('Gazipasa Airport, Alanya, Turkey');
        }
        if (!destCoords) {
            // Last resort: use known coords for Gazipaşa Airport
            console.log('[optimize-route] Using hardcoded Gazipaşa Airport coords');
            destCoords = { lat: 36.2992, lng: 32.3006 };
        }

        // 3. Geocode each booking's pickup and calculate distance
        const results = [];
        for (const booking of bookings) {
            const m = booking.metadata || {};
            const pickupAddr = m.pickup || m.pickupLocation || m.pickupAddress || '';
            
            // Add delay between requests to respect Nominatim rate limits (1 req/sec)
            if (results.length > 0) {
                await new Promise(r => setTimeout(r, 1100));
            }
            
            const coords = await geocodeAddress(pickupAddr);
            const distanceKm = coords ? haversine(coords.lat, coords.lng, destCoords.lat, destCoords.lng) : 0;
            
            results.push({
                bookingId: booking.id,
                pickup: pickupAddr,
                coords,
                distanceKm: Math.round(distanceKm * 10) / 10
            });
        }

        // 4. Sort by distance to destination: farthest first (picked up first on the way)
        results.sort((a, b) => b.distanceKm - a.distanceKm);

        // 5. Update sort order in metadata
        let sortOrder = 1;
        for (const item of results) {
            const booking = await prisma.booking.findUnique({ where: { id: item.bookingId } });
            if (booking) {
                await prisma.booking.update({
                    where: { id: item.bookingId },
                    data: {
                        metadata: {
                            ...(booking.metadata || {}),
                            shuttleSortOrder: sortOrder
                        }
                    }
                });
            }
            sortOrder++;
        }

        const io = req.app.get('io');
        if (io) {
            io.to('admin_monitoring').emit('shuttle_runs_updated', { optimized: true });
        }

        res.json({ 
            success: true, 
            optimizedOrder: results.map(r => ({
                bookingId: r.bookingId,
                pickup: r.pickup,
                distanceKm: r.distanceKm,
                sortOrder: results.indexOf(r) + 1
            })),
            destination: destinationAddress || 'Gazipaşa Alanya Havalimanı'
        });
    } catch (error) {
        console.error('shuttle-runs/optimize-route error:', error);
        res.status(500).json({ success: false, error: 'Güzergah optimizasyonu başarısız: ' + error.message });
    }
});

/**
 * POST /api/operations/migrate-region-codes
 * One-time migration: detect and save region codes for existing bookings
 */
router.post('/migrate-region-codes', authMiddleware, async (req, res) => {
    try {
        const tenantId = req.user?.tenantId;
        if (!tenantId) return res.status(400).json({ success: false, error: 'Tenant context missing' });

        // Load hubs from Zone table (unified model), fallback to settings.hubs
        const zonesWithCode = await prisma.zone.findMany({
            where: { tenantId, code: { not: null } },
            select: { code: true, keywords: true, name: true }
        });
        let hubs = zonesWithCode.length > 0
            ? zonesWithCode.map(z => ({ code: z.code, keywords: z.keywords || '', name: z.name }))
            : [];
        if (!hubs.length) {
            const tenantInfo = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } });
            hubs = tenantInfo?.settings?.hubs || [];
        }
        if (!hubs.length) return res.json({ success: true, message: 'No hubs defined', updated: 0 });

        const trLower = (s) => (s || '').toLocaleLowerCase('tr');
        const SKIP_WORDS = new Set(['havalimanı', 'havalimani', 'airport', 'havaalanı', 'merkez', 'center', 'terminal']);
        function detectCode(text) {
            if (!text) return null;
            const lower = trLower(text);
            let bestCode = null;
            let bestPos = Infinity;
            let bestLen = 0;
            for (const hub of hubs) {
                const keys = hub.keywords ? hub.keywords.split(',').map(k => trLower(k).trim()).filter(k => k) : [];
                keys.push(trLower(hub.code));
                if (hub.name) {
                    const nameParts = trLower(hub.name).split(/[\s\/,]+/).filter(p => p.length >= 3 && !SKIP_WORDS.has(p));
                    keys.push(...nameParts);
                }
                for (const k of keys) {
                    const pos = lower.indexOf(k);
                    if (pos !== -1 && (pos < bestPos || (pos === bestPos && k.length > bestLen))) {
                        bestCode = hub.code;
                        bestPos = pos;
                        bestLen = k.length;
                    }
                }
            }
            return bestCode;
        }

        // Find all bookings without region codes
        const bookings = await prisma.booking.findMany({
            where: { tenantId, productType: 'TRANSFER' },
            select: { id: true, metadata: true }
        });

        let updated = 0;
        for (const b of bookings) {
            const m = b.metadata || {};
            
            // Always recalculate (don't skip existing)
            const pickupRC = detectCode(m.pickup);
            const dropoffRC = detectCode(m.dropoff);
            
            if (pickupRC || dropoffRC) {
                await prisma.booking.update({
                    where: { id: b.id },
                    data: {
                        metadata: {
                            ...m,
                            pickupRegionCode: pickupRC || null,
                            dropoffRegionCode: dropoffRC || null
                        }
                    }
                });
                updated++;
            }
        }

        res.json({ success: true, message: `Region codes updated for ${updated} bookings`, updated });
    } catch (error) {
        console.error('migrate-region-codes error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================================
// ADMIN: DRIVER COLLECTIONS MANAGEMENT
// ============================================================================

// GET /api/operations/driver-collections
// Admin views all driver collections with handover status
router.get('/driver-collections', authMiddleware, async (req, res) => {
    try {
        const { status, driverId, startDate, endDate } = req.query;
        const tenantId = req.user?.tenantId;
        
        if (!tenantId) {
            return res.status(401).json({ success: false, error: 'Tenant context missing' });
        }

        const where = { tenantId };
        if (status) where.status = status;
        if (driverId) where.driverId = driverId;
        
        if (startDate || endDate) {
            where.createdAt = {};
            if (startDate) where.createdAt.gte = new Date(startDate);
            if (endDate) where.createdAt.lte = new Date(endDate + 'T23:59:59.999Z');
        }

        const collections = await prisma.driverCollection.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            include: {
                driver: { select: { fullName: true, id: true } },
                handedOverToUser: { select: { fullName: true, id: true } },
                booking: { select: { bookingNumber: true, contactName: true } }
            }
        });

        const summary = collections.reduce((acc, c) => {
            const key = c.status;
            acc[key] = acc[key] || { count: 0, amounts: {} };
            acc[key].count++;
            const amt = typeof c.amount === 'object' ? parseFloat(c.amount.toString()) : Number(c.amount);
            acc[key].amounts[c.currency] = (acc[key].amounts[c.currency] || 0) + amt;
            return acc;
        }, {});

        // Also ensure each collection's amount is a proper number for frontend
        const cleanCollections = collections.map(c => ({
            ...c,
            amount: typeof c.amount === 'object' ? parseFloat(c.amount.toString()) : Number(c.amount)
        }));

        res.json({ success: true, data: { collections: cleanCollections, summary } });
    } catch (error) {
        console.error('Driver collections fetch error:', error);
        res.status(500).json({ success: false, error: 'Server error' });
    }
});

// POST /api/operations/driver-collections/:id/confirm
// Admin confirms receipt of handed-over collection
router.post('/driver-collections/:id/confirm', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { notes } = req.body;
        const tenantId = req.user?.tenantId;
        const adminId = req.user?.id;

        if (!tenantId) {
            return res.status(401).json({ success: false, error: 'Tenant context missing' });
        }

        const collection = await prisma.driverCollection.findFirst({
            where: { id, tenantId, status: 'HANDED_OVER' }
        });

        if (!collection) {
            return res.status(404).json({ success: false, error: 'Teslimat bulunamadı veya zaten onaylandı' });
        }

        const updated = await prisma.driverCollection.update({
            where: { id },
            data: {
                status: 'CONFIRMED',
                handoverNotes: notes || collection.handoverNotes
            }
        });

        // Notify driver that collection is confirmed
        const io = req.app.get('io');
        if (io) {
            io.to(`user_${collection.driverId}`).emit('collection_confirmed', {
                collectionId: id,
                confirmedBy: adminId,
                confirmedAt: new Date().toISOString(),
                amount: collection.amount,
                currency: collection.currency
            });
        }

        res.json({ success: true, data: updated });
    } catch (error) {
        console.error('Collection confirm error:', error);
        res.status(500).json({ success: false, error: 'Server error' });
    }
});

// GET /api/operations/driver-collections/summary
// Summary for dashboard: pending confirmations, today's totals
router.get('/driver-collections/summary', authMiddleware, async (req, res) => {
    try {
        const tenantId = req.user?.tenantId;
        if (!tenantId) {
            return res.status(401).json({ success: false, error: 'Tenant context missing' });
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const [pendingCount, todayCollections, allPending] = await Promise.all([
            prisma.driverCollection.count({
                where: { tenantId, status: 'HANDED_OVER' }
            }),
            prisma.driverCollection.findMany({
                where: {
                    tenantId,
                    createdAt: { gte: today }
                },
                select: { amount: true, currency: true, status: true }
            }),
            prisma.driverCollection.findMany({
                where: {
                    tenantId,
                    status: 'PENDING'
                },
                select: { amount: true, currency: true }
            })
        ]);

        // Calculate totals
        const todayTotals = todayCollections.reduce((acc, c) => {
            acc[c.currency] = (acc[c.currency] || 0) + Number(c.amount);
            return acc;
        }, {});

        const driverPendingTotals = allPending.reduce((acc, c) => {
            acc[c.currency] = (acc[c.currency] || 0) + Number(c.amount);
            return acc;
        }, {});

        res.json({
            success: true,
            data: {
                pendingConfirmations: pendingCount,
                todayTotals,
                driverPendingTotals
            }
        });
    } catch (error) {
        console.error('Collections summary error:', error);
        res.status(500).json({ success: false, error: 'Server error' });
    }
});

module.exports = router;
