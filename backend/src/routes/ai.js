const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const env = require('../config/env');
const { requireTenantId, findBookingForTenant } = require('../utils/tenantScope');

const aiAuthMiddleware = (req, res, next) => {
    const aiToken = req.headers['x-ai-token'];
    if (!aiToken || aiToken !== env.security.aiSecretToken) {
        return res.status(401).json({ success: false, error: 'Unauthorized: Invalid AI Token' });
    }
    next();
};

router.use(aiAuthMiddleware);

router.get('/status', async (req, res) => {
    try {
        const { ref, contact, tenantId: queryTenantId } = req.query;
        if (!ref) return res.status(400).json({ success: false, error: 'Reference number is required' });
        if (!queryTenantId) return res.status(400).json({ success: false, error: 'tenantId is required' });

        const booking = await prisma.booking.findFirst({
            where: {
                tenantId: String(queryTenantId),
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

router.get('/quotes', async (req, res) => {
    try {
        const { pax, tenantId: queryTenantId } = req.query;
        if (!queryTenantId) return res.status(400).json({ success: false, error: 'tenantId is required' });

        const vehicleTypes = await prisma.vehicleType.findMany({
            where: { tenantId: String(queryTenantId), capacity: { gte: Number(pax || 1) } },
            include: { vehicles: { where: { status: 'ACTIVE', tenantId: String(queryTenantId) } } }
        });

        const quotes = vehicleTypes.map(vt => ({
            vehicleType: vt.name,
            capacity: vt.capacity,
            estimatedPrice: 50,
            currency: 'EUR'
        }));

        res.json({ success: true, data: quotes });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/book', async (req, res) => {
    try {
        const { pickup, dropoff, date, pax, vehicleType, contactName, contactPhone, contactEmail, tenantId } = req.body;
        if (!tenantId) return res.status(400).json({ success: false, error: 'tenantId is required' });

        const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } });
        if (!tenant) return res.status(404).json({ success: false, error: 'Tenant not found' });

        const bookingNumber = `AI${Date.now().toString().slice(-6)}`;

        const booking = await prisma.booking.create({
            data: {
                tenantId: tenant.id,
                bookingNumber,
                productType: 'TRANSFER',
                startDate: new Date(date),
                adults: Number(pax),
                contactName,
                contactPhone,
                contactEmail,
                status: 'PENDING',
                paymentStatus: 'PENDING',
                total: 0,
                subtotal: 0,
                tax: 0,
                serviceFee: 0,
                currency: 'EUR',
                metadata: { pickup, dropoff, vehicleType, source: 'AI' }
            }
        });

        res.json({ success: true, data: booking });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
