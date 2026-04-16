const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const { authMiddleware } = require('../middleware/auth');

// ── Helper: date ranges ──
function startOfDay(d) { const r = new Date(d); r.setHours(0,0,0,0); return r; }
function endOfDay(d)   { const r = new Date(d); r.setHours(23,59,59,999); return r; }
function daysAgo(n)    { const d = new Date(); d.setDate(d.getDate() - n); return startOfDay(d); }
function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }

const DAY_NAMES = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];

/**
 * GET /api/dashboard/summary
 * All-in-one dashboard endpoint — KPIs, charts, recent activity
 */
router.get('/summary', authMiddleware, async (req, res) => {
    try {
        const tenantId = req.tenant?.id || req.user?.tenantId;
        if (!tenantId) return res.status(400).json({ success: false, error: 'Tenant bulunamadı' });

        const now = new Date();
        const today = startOfDay(now);
        const thisMonthStart = startOfMonth(now);
        const lastMonthStart = startOfMonth(new Date(now.getFullYear(), now.getMonth() - 1, 1));
        const lastMonthEnd = new Date(thisMonthStart.getTime() - 1);
        const last30 = daysAgo(30);
        const last7 = daysAgo(7);

        const tenantFilter = { tenantId };

        // ── Parallel Queries ──
        const [
            // Bookings
            totalBookings,
            thisMonthBookings,
            lastMonthBookings,
            todayBookings,
            pendingBookings,
            confirmedBookings,
            completedBookings,
            cancelledBookings,
            inProgressBookings,

            // Revenue (this month)
            revenueThisMonth,
            revenueLastMonth,
            revenueToday,

            // Vehicles
            totalVehicles,
            activeVehicles,

            // Users by type
            totalDrivers,
            onlineDrivers,
            totalCustomers,
            totalAgencies,
            activeAgencies,

            // Personnel
            totalPersonnel,

            // Recent bookings (for table)
            recentBookings,

            // Last 30 days daily revenue
            last30Bookings,

            // Booking status distribution
            statusCounts,

            // Vehicle type distribution
            vehicleTypeCounts,

            // Top agencies
            topAgencyBookings,
        ] = await Promise.all([
            // Bookings counts
            prisma.booking.count({ where: tenantFilter }),
            prisma.booking.count({ where: { ...tenantFilter, createdAt: { gte: thisMonthStart } } }),
            prisma.booking.count({ where: { ...tenantFilter, createdAt: { gte: lastMonthStart, lte: lastMonthEnd } } }),
            prisma.booking.count({ where: { ...tenantFilter, createdAt: { gte: today } } }),
            prisma.booking.count({ where: { ...tenantFilter, status: 'PENDING' } }),
            prisma.booking.count({ where: { ...tenantFilter, status: 'CONFIRMED' } }),
            prisma.booking.count({ where: { ...tenantFilter, status: 'COMPLETED' } }),
            prisma.booking.count({ where: { ...tenantFilter, status: 'CANCELLED' } }),
            prisma.booking.count({ where: { ...tenantFilter, status: 'IN_PROGRESS' } }),

            // Revenue aggregates
            prisma.booking.aggregate({
                where: { ...tenantFilter, createdAt: { gte: thisMonthStart }, status: { not: 'CANCELLED' } },
                _sum: { total: true }
            }),
            prisma.booking.aggregate({
                where: { ...tenantFilter, createdAt: { gte: lastMonthStart, lte: lastMonthEnd }, status: { not: 'CANCELLED' } },
                _sum: { total: true }
            }),
            prisma.booking.aggregate({
                where: { ...tenantFilter, createdAt: { gte: today }, status: { not: 'CANCELLED' } },
                _sum: { total: true }
            }),

            // Vehicles
            prisma.vehicle.count({ where: tenantFilter }),
            prisma.vehicle.count({ where: { ...tenantFilter, status: 'ACTIVE' } }),

            // Users
            prisma.user.count({ where: { ...tenantFilter, role: { type: 'DRIVER' } } }),
            prisma.user.count({ where: { ...tenantFilter, role: { type: 'DRIVER' }, status: 'ACTIVE', lastSeenAt: { gte: new Date(Date.now() - 15 * 60 * 1000) } } }),
            prisma.user.count({ where: { ...tenantFilter, role: { type: 'CUSTOMER' } } }),

            // Agencies
            prisma.agency.count({ where: tenantFilter }),
            prisma.agency.count({ where: { ...tenantFilter, status: 'ACTIVE' } }),

            // Personnel
            prisma.personnel.count({ where: tenantFilter }),

            // Recent bookings
            prisma.booking.findMany({
                where: tenantFilter,
                orderBy: { createdAt: 'desc' },
                take: 8,
                select: {
                    id: true, bookingNumber: true, status: true, total: true, currency: true,
                    contactName: true, startDate: true, createdAt: true, productType: true,
                    driver: { select: { firstName: true, lastName: true } },
                    agency: { select: { name: true } },
                }
            }),

            // Last 30 days bookings for revenue chart
            prisma.booking.findMany({
                where: { ...tenantFilter, createdAt: { gte: last30 }, status: { not: 'CANCELLED' } },
                select: { createdAt: true, total: true }
            }),

            // Status distribution
            prisma.booking.groupBy({
                by: ['status'],
                where: tenantFilter,
                _count: true
            }),

            // Vehicle type counts
            prisma.vehicle.groupBy({
                by: ['vehicleTypeId'],
                where: tenantFilter,
                _count: true
            }).then(async (groups) => {
                const typeIds = groups.map(g => g.vehicleTypeId);
                const types = await prisma.vehicleType.findMany({ where: { id: { in: typeIds } }, select: { id: true, name: true } });
                const typeMap = Object.fromEntries(types.map(t => [t.id, t.name]));
                return groups.map(g => ({ name: typeMap[g.vehicleTypeId] || 'Bilinmeyen', count: g._count }));
            }),

            // Top agencies by booking count
            prisma.booking.groupBy({
                by: ['agencyId'],
                where: { ...tenantFilter, agencyId: { not: null } },
                _count: true,
                orderBy: { _count: { agencyId: 'desc' } },
                take: 5
            }).then(async (groups) => {
                const ids = groups.map(g => g.agencyId).filter(Boolean);
                const agencies = await prisma.agency.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
                const map = Object.fromEntries(agencies.map(a => [a.id, a.name]));
                return groups.map(g => ({ name: map[g.agencyId] || 'Bilinmeyen', count: g._count }));
            }),
        ]);

        // ── Revenue chart (last 30 days, grouped by day) ──
        const revByDay = {};
        for (let i = 29; i >= 0; i--) {
            const d = new Date(); d.setDate(d.getDate() - i);
            const key = d.toISOString().slice(0, 10);
            revByDay[key] = { date: key, revenue: 0, bookings: 0, label: `${d.getDate()}.${d.getMonth()+1}` };
        }
        for (const b of last30Bookings) {
            const key = b.createdAt.toISOString().slice(0, 10);
            if (revByDay[key]) {
                revByDay[key].revenue += Number(b.total) || 0;
                revByDay[key].bookings += 1;
            }
        }
        const revenueChart = Object.values(revByDay);

        // ── Weekly chart (last 7 days) ──
        const weeklyChart = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date(); d.setDate(d.getDate() - i);
            const key = d.toISOString().slice(0, 10);
            const dayData = revByDay[key] || { revenue: 0, bookings: 0 };
            weeklyChart.push({ name: DAY_NAMES[d.getDay()], revenue: dayData.revenue, bookings: dayData.bookings });
        }

        // ── Growth calculations ──
        const revThisNum = Number(revenueThisMonth._sum.total) || 0;
        const revLastNum = Number(revenueLastMonth._sum.total) || 0;
        const revenueGrowth = revLastNum > 0 ? ((revThisNum - revLastNum) / revLastNum * 100) : (revThisNum > 0 ? 100 : 0);
        const bookingGrowth = lastMonthBookings > 0 ? ((thisMonthBookings - lastMonthBookings) / lastMonthBookings * 100) : (thisMonthBookings > 0 ? 100 : 0);

        // ── Status distribution for pie chart ──
        const STATUS_COLORS = {
            PENDING: '#f59e0b', CONFIRMED: '#3b82f6', IN_PROGRESS: '#8b5cf6',
            COMPLETED: '#10b981', CANCELLED: '#ef4444', NO_SHOW: '#6b7280'
        };
        const STATUS_LABELS = {
            PENDING: 'Bekleyen', CONFIRMED: 'Onaylı', IN_PROGRESS: 'Devam Eden',
            COMPLETED: 'Tamamlanan', CANCELLED: 'İptal', NO_SHOW: 'Gelmedi'
        };
        const bookingDistribution = statusCounts.map(s => ({
            name: STATUS_LABELS[s.status] || s.status,
            value: s._count,
            color: STATUS_COLORS[s.status] || '#94a3b8'
        }));

        // ── Vehicle utilization ──
        const vehicleUtil = totalVehicles > 0 ? Math.round(activeVehicles / totalVehicles * 100) : 0;

        res.json({
            success: true,
            data: {
                kpis: {
                    totalRevenue: revThisNum,
                    revenueGrowth: Math.round(revenueGrowth * 10) / 10,
                    todayRevenue: Number(revenueToday._sum.total) || 0,
                    totalBookings,
                    thisMonthBookings,
                    bookingGrowth: Math.round(bookingGrowth * 10) / 10,
                    todayBookings,
                    pendingBookings,
                    confirmedBookings,
                    completedBookings,
                    cancelledBookings,
                    inProgressBookings,
                    totalVehicles,
                    activeVehicles,
                    vehicleUtilization: vehicleUtil,
                    totalDrivers,
                    onlineDrivers,
                    totalCustomers,
                    totalAgencies,
                    activeAgencies,
                    totalPersonnel,
                },
                charts: {
                    revenueChart,
                    weeklyChart,
                    bookingDistribution,
                    vehicleTypes: vehicleTypeCounts,
                    topAgencies: topAgencyBookings,
                },
                recentBookings: recentBookings.map(b => ({
                    ...b,
                    total: Number(b.total),
                })),
            }
        });
    } catch (error) {
        console.error('Dashboard summary error:', error);
        res.status(500).json({ success: false, error: 'Dashboard verisi yüklenemedi' });
    }
});

// Legacy endpoints — redirect to summary
router.get('/stats', authMiddleware, async (req, res) => {
    try {
        const tenantId = req.tenant?.id || req.user?.tenantId;
        const thisMonthStart = startOfMonth(new Date());
        const tenantFilter = { tenantId };

        const [totalBookings, totalVehicles, activeVehicles, revAgg] = await Promise.all([
            prisma.booking.count({ where: tenantFilter }),
            prisma.vehicle.count({ where: tenantFilter }),
            prisma.vehicle.count({ where: { ...tenantFilter, status: 'ACTIVE' } }),
            prisma.booking.aggregate({ where: { ...tenantFilter, createdAt: { gte: thisMonthStart }, status: { not: 'CANCELLED' } }, _sum: { total: true } }),
        ]);

        res.json({
            success: true,
            data: {
                kpis: {
                    totalRevenue: Number(revAgg._sum.total) || 0,
                    revenueGrowth: 0,
                    totalBookings,
                    bookingsGrowth: 0,
                    activeCustomers: 0,
                    customersGrowth: 0,
                    activeVehicles,
                    totalVehicles,
                }
            }
        });
    } catch (e) {
        console.error('Dashboard stats error:', e);
        res.status(500).json({ success: false, error: 'Stats yüklenemedi' });
    }
});

router.get('/revenue-trend', authMiddleware, async (req, res) => {
    try {
        const tenantId = req.tenant?.id || req.user?.tenantId;
        const last7 = daysAgo(7);
        const bookings = await prisma.booking.findMany({
            where: { tenantId, createdAt: { gte: last7 }, status: { not: 'CANCELLED' } },
            select: { createdAt: true, total: true }
        });
        const byDay = {};
        for (let i = 6; i >= 0; i--) {
            const d = new Date(); d.setDate(d.getDate() - i);
            byDay[d.toISOString().slice(0,10)] = { name: DAY_NAMES[d.getDay()], revenue: 0 };
        }
        for (const b of bookings) {
            const k = b.createdAt.toISOString().slice(0,10);
            if (byDay[k]) byDay[k].revenue += Number(b.total) || 0;
        }
        res.json({ success: true, data: Object.values(byDay) });
    } catch (e) {
        console.error('Revenue trend error:', e);
        res.status(500).json({ success: false, error: 'Veri yüklenemedi' });
    }
});

router.get('/booking-distribution', authMiddleware, async (req, res) => {
    try {
        const tenantId = req.tenant?.id || req.user?.tenantId;
        const counts = await prisma.booking.groupBy({ by: ['status'], where: { tenantId }, _count: true });
        const COLORS = { PENDING: '#f59e0b', CONFIRMED: '#3b82f6', IN_PROGRESS: '#8b5cf6', COMPLETED: '#10b981', CANCELLED: '#ef4444', NO_SHOW: '#6b7280' };
        const LABELS = { PENDING: 'Bekleyen', CONFIRMED: 'Onaylı', IN_PROGRESS: 'Devam Eden', COMPLETED: 'Tamamlanan', CANCELLED: 'İptal', NO_SHOW: 'Gelmedi' };
        res.json({ success: true, data: counts.map(s => ({ name: LABELS[s.status] || s.status, value: s._count, color: COLORS[s.status] || '#94a3b8' })) });
    } catch (e) {
        console.error('Booking dist error:', e);
        res.status(500).json({ success: false, error: 'Veri yüklenemedi' });
    }
});

router.get('/vehicle-stats', authMiddleware, async (req, res) => {
    try {
        const tenantId = req.tenant?.id || req.user?.tenantId;
        const groups = await prisma.vehicle.groupBy({ by: ['vehicleTypeId', 'status'], where: { tenantId }, _count: true });
        const typeIds = [...new Set(groups.map(g => g.vehicleTypeId))];
        const types = await prisma.vehicleType.findMany({ where: { id: { in: typeIds } }, select: { id: true, name: true } });
        const typeMap = Object.fromEntries(types.map(t => [t.id, t.name]));
        const result = {};
        for (const g of groups) {
            const name = typeMap[g.vehicleTypeId] || 'Bilinmeyen';
            if (!result[name]) result[name] = { type: name, active: 0, idle: 0 };
            if (g.status === 'ACTIVE') result[name].active += g._count;
            else result[name].idle += g._count;
        }
        res.json({ success: true, data: Object.values(result) });
    } catch (e) {
        console.error('Vehicle stats error:', e);
        res.status(500).json({ success: false, error: 'Veri yüklenemedi' });
    }
});

module.exports = router;
