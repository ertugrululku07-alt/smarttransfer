const express = require('express');
const crypto = require('crypto');
const Iyzipay = require('iyzipay');

const { authMiddleware } = require('../middleware/auth');
const PaymentService = require('../services/payment/PaymentService');

const prisma = require('../lib/prisma');
const router = express.Router();

/**
 * POST /api/payment/init
 * Initialize a payment transaction
 */
router.post('/init', authMiddleware, async (req, res) => {
    try {
        const { amount, currency, provider, user, basket, orderId } = req.body;

        // Validation
        if (!amount) return res.status(400).json({ error: 'Tutar zorunludur' });

        // Prepare params
        const paymentParams = {
            amount,
            currency: currency || 'TRY',
            provider, // optional
            orderId: orderId || `ORD-${Date.now()}`,
            userIp: req.headers['x-forwarded-for'] || req.connection.remoteAddress,
            user: user || {
                email: req.user.email,
                name: req.user.name || 'Test User',
                phone: req.user.phone,
                address: 'Test Adres'
            },
            basket: basket || [
                { name: 'Test Ürün', price: amount, category: 'General' }
            ]
        };

        const result = await PaymentService.initializePayment(req.user.tenantId, paymentParams);

        if (result.success) {
            res.json({
                success: true,
                data: result
            });
        } else {
            res.status(400).json({
                success: false,
                error: result.error || 'Ödeme başlatılamadı'
            });
        }

    } catch (error) {
        console.error('Payment Init Error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Ödeme sistemi hatası'
        });
    }
});

/**
 * POST /api/payment/callback/paytr
 * PayTR Server-to-Server Webhook
 */
router.post('/callback/paytr', async (req, res) => {
    // PayTR sends application/x-www-form-urlencoded
    const { merchant_oid, status, total_amount, hash, failed_reason_code, failed_reason_msg } = req.body;

    try {
        // 1. Find Booking
        const booking = await prisma.booking.findUnique({
            where: { bookingNumber: merchant_oid },
            include: { tenant: true }
        });

        if (!booking) {
            console.error('PayTR Callback Error: Booking not found', merchant_oid);
            return res.status(200).send('OK'); // Return OK so PayTR stops retrying
        }

        // 2. Get Tenant's PayTR Keys
        const providers = booking.tenant.paymentProviders;
        if (!providers || !providers.paytr) {
            console.error('PayTR Callback Error: Provider not found for tenant', booking.tenantId);
            return res.status(200).send('OK');
        }

        const { merchantKey, merchantSalt } = providers.paytr;

        // 3. Verify Hash Signature
        const hashStr = merchant_oid + merchantSalt + status + total_amount;
        const generatedHash = crypto.createHmac('sha256', merchantKey).update(hashStr).digest('base64');

        if (hash !== generatedHash) {
            console.error('PayTR Callback Error: Hash mismatch', merchant_oid);
            return res.status(200).send('OK');
        }

        // 4. Handle Payment Status
        if (status === 'success') {
            await prisma.$transaction(async (tx) => {
                // Update Booking Status
                const updatedBooking = await tx.booking.update({
                    where: { id: booking.id },
                    data: {
                        status: 'CONFIRMED',
                        paymentStatus: 'PAID',
                        paidAmount: booking.total
                    }
                });

                // Calculate Profit & Add to Agency Balance
                if (booking.agencyId) {
                    const profit = parseFloat(booking.total) - parseFloat(booking.subtotal);
                    if (profit > 0) {
                        await tx.agency.update({
                            where: { id: booking.agencyId },
                            data: { balance: { increment: profit }, credit: { increment: profit } }
                        });
                    }
                }
            });

            return res.send('OK'); // Critical: MUST return 'OK'
        } else {
            console.error('PayTR Payment Failed:', merchant_oid, failed_reason_msg);
            await prisma.booking.update({
                where: { id: booking.id },
                data: {
                    status: 'PENDING',
                    paymentStatus: 'FAILED',
                    internalNotes: `Payment failed: ${failed_reason_msg}`
                }
            });
            return res.send('OK');
        }

    } catch (err) {
        console.error('PayTR Webhook Exception:', err);
        return res.status(500).send('FAIL');
    }
});

/**
 * POST /api/payment/callback/iyzico
 * Iyzico Webhook Callback (User Redirects Here)
 */
router.post('/callback/iyzico', async (req, res) => {
    const { token } = req.body;
    const { tenantId } = req.query;

    if (!token || !tenantId) return res.status(400).send('Eksik parametre');

    try {
        // 1. Get Tenant Keys
        const tenant = await prisma.tenant.findUnique({
            where: { id: tenantId },
            select: { paymentProviders: true }
        });

        if (!tenant || !tenant.paymentProviders?.iyzico) {
            return res.status(400).send('Iyzico config not found');
        }

        const config = tenant.paymentProviders.iyzico;
        const fallbackSuccessUrl = config.successUrl || 'https://smarttransfer-backend-production.up.railway.app/payment/success';
        const fallbackFailUrl = config.failUrl || 'https://smarttransfer-backend-production.up.railway.app/payment/fail';

        const iyzipay = new Iyzipay({
            apiKey: config.apiKey,
            secretKey: config.secretKey,
            uri: config.testMode ? 'https://sandbox-api.iyzipay.com' : (config.baseUrl || 'https://api.iyzipay.com')
        });

        // 2. Retrieve Payment Result
        iyzipay.checkoutForm.retrieve({
            locale: Iyzipay.LOCALE.TR,
            conversationId: 'RETRIEVE_' + Date.now().toString(),
            token: token
        }, async (err, result) => {
            if (err) {
                console.error('Iyzico retrieve error', err);
                return res.redirect(fallbackFailUrl);
            }

            const bookingNumber = result.basketId; // We passed orderId as basketId

            const booking = await prisma.booking.findUnique({
                where: { bookingNumber }
            });

            if (!booking) {
                console.error('Iyzico Callback Error: Booking not found', bookingNumber);
                return res.redirect(fallbackFailUrl);
            }

            // 3. Process Status
            if (result.status === 'success' && result.paymentStatus === 'SUCCESS') {
                await prisma.$transaction(async (tx) => {
                    // Update Booking
                    await tx.booking.update({
                        where: { id: booking.id },
                        data: {
                            status: 'CONFIRMED',
                            paymentStatus: 'PAID',
                            paidAmount: booking.total
                        }
                    });

                    // Add Profit
                    if (booking.agencyId) {
                        const profit = parseFloat(booking.total) - parseFloat(booking.subtotal);
                        if (profit > 0) {
                            await tx.agency.update({
                                where: { id: booking.agencyId },
                                data: { balance: { increment: profit }, credit: { increment: profit } }
                            });
                        }
                    }
                });

                return res.redirect(fallbackSuccessUrl);
            } else {
                console.error('Iyzico Payment Failed:', bookingNumber, result.errorMessage);
                await prisma.booking.update({
                    where: { id: booking.id },
                    data: {
                        status: 'PENDING',
                        paymentStatus: 'FAILED',
                        internalNotes: `Payment failed: ${result.errorMessage}`
                    }
                });
                return res.redirect(fallbackFailUrl);
            }
        });
    } catch (err) {
        console.error('Iyzico Webhook Exception:', err);
        return res.status(500).send('FAIL');
    }
});

module.exports = router;
