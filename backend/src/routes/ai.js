const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');

// Security middleware for AI tools
const aiAuthMiddleware = (req, res, next) => {
    const aiToken = req.headers['x-ai-token'];
    const secret = process.env.AI_SECRET_TOKEN || 'smart_ai_2026_x';
    
    if (!aiToken || aiToken !== secret) {
        return res.status(401).json({ success: false, error: 'Unauthorized: Invalid AI Token' });
    }
    next();
};

router.use(aiAuthMiddleware);

/**
 * GET /api/ai/status
 * Check booking status
 */
router.get('/status', async (req, res) => {
    try {
        const { ref, contact } = req.query;
        if (!ref) return res.status(400).json({ success: false, error: 'Reference number is required' });

        const booking = await prisma.booking.findFirst({
            where: {
                bookingNumber: ref,
                OR: [
                    { contactEmail: contact },
                    { contactPhone: contact }
                ]
            }
        });

        if (!booking) {
            return res.status(404).json({ success: false, error: 'Booking not found' });
        }

        res.json({
            success: true,
            data: {
                bookingNumber: booking.bookingNumber,
                status: booking.status,
                pickup: booking.metadata?.pickup,
                dropoff: booking.metadata?.dropoff,
                startDate: booking.startDate,
                vehicleType: booking.metadata?.vehicleType,
                total: booking.total,
                currency: booking.currency,
                passengerName: booking.contactName
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/ai/quotes
 * Get pricing quotes for a route
 * Note: Simplified version for AI (text-based matching)
 */
router.get('/quotes', async (req, res) => {
    try {
        const { pickup, dropoff, pax, date } = req.query;
        
        // Fetch all vehicle types to provide generic pricing
        const vehicleTypes = await prisma.vehicleType.findMany({
            where: { capacity: { gte: Number(pax || 1) } },
            include: { vehicles: { where: { status: 'ACTIVE' } } }
        });

        // Simplified Pricing Logic for AI:
        // We'll return a few standard options. In a real scenario, this would call 
        // the same complex logic as transfer.js but with text detection.
        const quotes = vehicleTypes.map(vt => ({
            vehicleType: vt.name,
            capacity: vt.capacity,
            // Mock price if we can't calculate exactly, or we could implement a 
            // basic distance-based estimate here. 
            // For now, let's return a range or a fixed base + estimate.
            estimatedPrice: 50, // Default base
            currency: 'EUR'
        }));

        res.json({ success: true, data: quotes });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/ai/book
 * Create a PENDING booking
 */
router.post('/book', async (req, res) => {
    try {
        const { pickup, dropoff, date, pax, vehicleType, contactName, contactPhone, contactEmail } = req.body;
        
        const bookingNumber = `AI${Date.now().toString().slice(-6)}`;
        
        const booking = await prisma.booking.create({
            data: {
                tenantId: (await prisma.tenant.findFirst()).id,
                bookingNumber,
                productType: 'TRANSFER',
                startDate: new Date(date),
                adults: Number(pax),
                contactName,
                contactPhone,
                contactEmail,
                status: 'PENDING',
                paymentStatus: 'PENDING',
                total: 0, // Admin will set price
                currency: 'EUR',
                metadata: {
                    pickup,
                    dropoff,
                    vehicleType,
                    isAiBooking: true
                }
            }
        });

        res.json({ success: true, data: booking });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
