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
 * Supports both authenticated (booking page) and retry (fail page) flows
 */
router.post('/init', async (req, res) => {
    // Optional auth: try to extract user from token if present
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (token) {
            const jwt = require('jsonwebtoken');
            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'smarttransfer_secret_key');
            req.user = decoded;
        }
    } catch { /* no auth — continue as guest */ }

    try {
        let { amount, currency, provider, user, basket, orderId } = req.body;

        // Determine tenantId from auth or from booking lookup
        let tenantId = req.user?.tenantId;

        // Retry flow: look up booking to get amount and tenantId
        if ((!amount || amount === 0) && orderId) {
            const booking = await prisma.booking.findUnique({
                where: { bookingNumber: orderId }
            });
            if (!booking) return res.status(404).json({ success: false, error: 'Rezervasyon bulunamadı' });
            amount = parseFloat(booking.total);
            currency = currency || booking.currency || 'TRY';
            tenantId = booking.tenantId;
            if (!user) {
                user = {
                    email: booking.contactEmail || 'guest@example.com',
                    name: booking.contactName || 'Müşteri',
                    phone: booking.contactPhone || '',
                    address: 'Transfer Rezervasyonu'
                };
            }
            if (!basket || basket.length === 0 || (basket[0] && basket[0].price === 0)) {
                basket = [{ name: 'Transfer Hizmeti', price: amount, category: 'Transfer' }];
            }
        }

        if (!tenantId) {
            // Try from tenant middleware (public routes)
            tenantId = req.tenant?.id;
        }

        if (!tenantId) return res.status(400).json({ success: false, error: 'Tenant belirlenemedi' });
        if (!amount) return res.status(400).json({ success: false, error: 'Tutar zorunludur' });

        // Prepare params
        const paymentParams = {
            amount,
            currency: currency || 'TRY',
            provider, // optional
            orderId: orderId || `ORD-${Date.now()}`,
            userIp: req.headers['x-forwarded-for'] || req.connection?.remoteAddress,
            user: user || {
                email: req.user?.email || 'guest@example.com',
                name: req.user?.name || 'Müşteri',
                phone: req.user?.phone,
                address: 'Transfer Rezervasyonu'
            },
            basket: basket || [
                { name: 'Transfer Hizmeti', price: amount, category: 'Transfer' }
            ]
        };

        const result = await PaymentService.initializePayment(tenantId, paymentParams);

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
        const fallbackSuccessUrl = config.successUrl || `${process.env.BACKEND_URL || 'http://localhost:4000'}/payment/success`;
        const fallbackFailUrl = config.failUrl || `${process.env.BACKEND_URL || 'http://localhost:4000'}/payment/fail`;

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

/**
 * POST /api/payment/callback/nestpay
 * NestPay (EST/Asseco) 3D Secure Callback — Ziraat, İşbank, Akbank, etc.
 */
router.post('/callback/nestpay', async (req, res) => {
    const { tenantId, bankId } = req.query;
    const callbackData = req.body;

    console.log(`[NestPay Callback] tenantId=${tenantId}, bankId=${bankId}, oid=${callbackData.oid}, mdStatus=${callbackData.mdStatus}`);

    if (!tenantId) return res.status(400).send('Eksik parametre: tenantId');

    try {
        // 1. Get Tenant & Bank Config
        const tenant = await prisma.tenant.findUnique({
            where: { id: tenantId },
            select: { paymentProviders: true }
        });

        if (!tenant) {
            console.error('[NestPay Callback] Tenant not found:', tenantId);
            return res.status(400).send('Tenant bulunamadı');
        }

        const banks = tenant.paymentProviders?.banks || {};
        const bankConfig = banks[bankId];

        if (!bankConfig) {
            console.error('[NestPay Callback] Bank config not found:', bankId);
            return res.status(400).send('Banka yapılandırması bulunamadı');
        }

        const successRedirect = bankConfig.successUrl || `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment/success`;
        const failRedirect = bankConfig.failUrl || `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment/fail`;

        // 2. Verify Hash
        const NestPayProvider = require('../services/payment/providers/nestpay');
        const hashValid = NestPayProvider.verifyCallbackHash(callbackData, bankConfig.storeKey);

        if (!hashValid) {
            console.error('[NestPay Callback] Hash verification failed for oid:', callbackData.oid);
            return res.redirect(failRedirect + '?error=hash_mismatch');
        }

        // 3. Check 3D Status
        // mdStatus: 1 = Full 3D verification, 2/3/4 = Attempted, 5 = Validation error, 0/others = Failed
        const mdStatus = callbackData.mdStatus;
        const isSuccess = ['1', '2', '3', '4'].includes(mdStatus) && callbackData.Response === 'Approved';

        // 4. Find Booking
        const bookingNumber = callbackData.oid;
        const booking = await prisma.booking.findUnique({
            where: { bookingNumber }
        });

        if (!booking) {
            console.error('[NestPay Callback] Booking not found:', bookingNumber);
            return res.redirect(failRedirect + '?error=booking_not_found');
        }

        // 5. Process Result
        if (isSuccess) {
            await prisma.$transaction(async (tx) => {
                await tx.booking.update({
                    where: { id: booking.id },
                    data: {
                        status: 'CONFIRMED',
                        paymentStatus: 'PAID',
                        paidAmount: booking.total,
                        metadata: {
                            ...(booking.metadata || {}),
                            paymentProvider: `bank_${bankId}`,
                            bankName: bankConfig.name || bankId,
                            transId: callbackData.TransId || '',
                            authCode: callbackData.AuthCode || '',
                            mdStatus: mdStatus,
                        }
                    }
                });

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

            console.log(`[NestPay Callback] Payment SUCCESS: ${bookingNumber}, TransId: ${callbackData.TransId}`);
            return res.redirect(successRedirect + `?oid=${bookingNumber}`);
        } else {
            const errorMsg = callbackData.ErrMsg || callbackData.mdErrorMsg || 'Ödeme başarısız';
            console.error(`[NestPay Callback] Payment FAILED: ${bookingNumber}, mdStatus=${mdStatus}, error=${errorMsg}`);

            await prisma.booking.update({
                where: { id: booking.id },
                data: {
                    status: 'PENDING',
                    paymentStatus: 'FAILED',
                    metadata: {
                        ...(booking.metadata || {}),
                        paymentError: errorMsg,
                        paymentProvider: `bank_${bankId}`,
                    }
                }
            });

            return res.redirect(failRedirect + `?error=${encodeURIComponent(errorMsg)}&oid=${encodeURIComponent(bookingNumber)}`);
        }
    } catch (err) {
        console.error('[NestPay Callback] Exception:', err);
        return res.status(500).send('Ödeme işlemi sırasında hata oluştu');
    }
});

module.exports = router;
