const express = require('express');
const router = express.Router();

/**
 * GET /api/dashboard/stats
 * Dashboard KPI statistics
 */
router.get('/stats', (req, res) => {
    // Mock KPI data
    res.json({
        success: true,
        data: {
            kpis: {
                totalRevenue: 124500.00,
                revenueGrowth: 15.4,
                totalBookings: 342,
                bookingsGrowth: 8.2,
                activeCustomers: 1250,
                customersGrowth: 12.5,
                activeVehicles: 18,
                totalVehicles: 25
            }
        }
    });
});

/**
 * GET /api/dashboard/revenue-trend
 * Revenue data for chart
 */
router.get('/revenue-trend', (req, res) => {
    const days = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
    const data = days.map(day => ({
        name: day,
        revenue: Math.floor(Math.random() * 5000) + 2000 // Random 2000-7000
    }));

    res.json({
        success: true,
        data: data
    });
});

/**
 * GET /api/dashboard/booking-distribution
 * Booking distribution by type for Pie Chart
 */
router.get('/booking-distribution', (req, res) => {
    res.json({
        success: true,
        data: [
            { name: 'VIP Transfer', value: 45, color: '#667eea' },
            { name: 'Shuttle', value: 30, color: '#764ba2' },
            { name: 'Özel Tur', value: 15, color: '#f093fb' },
            { name: 'Kurumsal', value: 10, color: '#4facfe' }
        ]
    });
});

/**
 * GET /api/dashboard/vehicle-stats
 * Vehicle status metrics
 */
router.get('/vehicle-stats', (req, res) => {
    res.json({
        success: true,
        data: [
            { type: 'Sedan', active: 8, idle: 2 },
            { type: 'Vito', active: 6, idle: 4 },
            { type: 'Sprinter', active: 3, idle: 1 },
            { type: 'Otobüs', active: 1, idle: 0 },
        ]
    });
});

module.exports = router;
