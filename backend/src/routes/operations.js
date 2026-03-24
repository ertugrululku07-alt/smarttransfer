// src/routes/operations.js
// Smart Operations Module — Conflict Detection, Availability Calendar, AI Suggestions

const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

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
// GET /api/operations/driver-schedule?driverId=&date=YYYY-MM-DD
// Returns all bookings assigned to a driver on a given date
// ---------------------------------------------------------------------------
router.get('/driver-schedule', authMiddleware, async (req, res) => {
    try {
        const { driverId, date } = req.query;
        if (!driverId || !date) {
            return res.status(400).json({ success: false, error: 'driverId ve date zorunlu' });
        }

        const dayStart = new Date(`${date}T00:00:00.000Z`);
        const dayEnd = new Date(`${date}T23:59:59.999Z`);

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

        const dayStart = new Date(`${date}T00:00:00.000Z`);
        const dayEnd = new Date(`${date}T23:59:59.999Z`);

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

        const dayStart = new Date(`${date}T00:00:00.000Z`);
        const dayEnd = new Date(`${date}T23:59:59.999Z`);

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
        if (startDateStr && endDateStr) {
            dayStart = new Date(`${startDateStr}T00:00:00.000Z`);
            dayEnd = new Date(`${endDateStr}T23:59:59.999Z`);
        } else {
            dayStart = new Date(`${targetDate}T00:00:00.000Z`);
            dayEnd = new Date(`${targetDate}T23:59:59.999Z`);
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
        const drivers = personnel.filter(p => {
            const title = (p.jobTitle || '').toLowerCase().trim();
            return DRIVER_KEYWORDS.some(kw => title.includes(kw)) && p.userId;
        });

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

module.exports = router;
