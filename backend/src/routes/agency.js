const express = require('express');

const { authMiddleware } = require('../middleware/auth');
const bcrypt = require('bcryptjs');

const router = express.Router();
const prisma = require('../lib/prisma');
const { detectRegionCodeByPolygon } = require('../utils/zoneDetection');

// Helper: Load tenant hubs for region code detection
async function loadTenantHubs(tenantId) {
    const defaultHubs = [
        { code: 'AYT', keywords: 'ayt, antalya havalimanı, antalya airport', name: 'Antalya Havalimanı', isAirport: true },
        { code: 'GZP', keywords: 'gzp, gazipasa, gazipaşa', name: 'Gazipaşa Havalimanı', isAirport: true },
    ];
    if (!tenantId) return defaultHubs;
    try {
        // Primary: load from Zone table (unified zone model)
        const zonesWithCode = await prisma.zone.findMany({
            where: { tenantId, code: { not: null } },
            select: { code: true, keywords: true, name: true, isAirport: true }
        });
        if (zonesWithCode.length > 0) {
            return zonesWithCode.map(z => ({ code: z.code, keywords: z.keywords || '', name: z.name, isAirport: z.isAirport || false }));
        }
        // Fallback: legacy settings.hubs
        const tenantInfo = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } });
        if (tenantInfo?.settings?.hubs && Array.isArray(tenantInfo.settings.hubs)) {
            return tenantInfo.settings.hubs;
        }
    } catch (e) {
        console.error("Failed to fetch tenant hubs for region detection", e);
    }
    return defaultHubs;
}

// Helper: Detect region code from location text using tenant hubs
function detectRegionCode(locationText, hubs) {
    if (!locationText || !hubs || !Array.isArray(hubs)) return null;
    const trLower = (s) => (s || '').toLocaleLowerCase('tr');
    const text = trLower(locationText);
    const SKIP_WORDS = new Set(['havalimanı', 'havalimani', 'airport', 'havaalanı', 'merkez', 'center', 'terminal']);

    let bestCode = null;
    let bestPosition = Infinity;
    let bestLength = 0;

    for (const hub of hubs) {
        const keys = hub.keywords ? hub.keywords.split(',').map(k => trLower(k).trim()).filter(k => k) : [];
        keys.push(trLower(hub.code));
        if (hub.name) {
            const nameParts = trLower(hub.name).split(/[\s\/,]+/).filter(p => p.length >= 3 && !SKIP_WORDS.has(p));
            keys.push(...nameParts);
        }

        for (const k of keys) {
            const pos = text.indexOf(k);
            if (pos !== -1) {
                // 'gazipaşa/gazipasa' alone is also a district/street name — require airport context
                if ((k === 'gazipaşa' || k === 'gazipasa') &&
                    !text.includes('havalimanı') && !text.includes('havalimani') &&
                    !text.includes('airport') && !text.includes('havaalanı')) {
                    continue;
                }
                if (pos < bestPosition || (pos === bestPosition && k.length > bestLength)) {
                    bestCode = hub.code;
                    bestPosition = pos;
                    bestLength = k.length;
                }
            }
        }
    }
    return bestCode;
}

// Middleware to ensure user is AGENCY_ADMIN or AGENCY_STAFF
const agencyMiddleware = async (req, res, next) => {
    if (!req.user) return res.status(401).json({ success: false, error: 'Not authenticated' });
    if (req.user.roleType !== 'AGENCY_ADMIN' && req.user.roleType !== 'AGENCY_STAFF') {
        return res.status(403).json({ success: false, error: 'Access denied: Not an agency' });
    }

    // Fetch the agencyId for this user
    const dbUser = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: { agencyId: true, agencyCommissionRate: true }
    });

    if (!dbUser || !dbUser.agencyId) {
        return res.status(403).json({ success: false, error: 'Access denied: No agency linked' });
    }

    req.agencyId = dbUser.agencyId;
    req.agencyCommissionRate = dbUser.agencyCommissionRate || 0;
    next();
};

// ==========================================
// USERS (AGENCY_ADMIN only)
// ==========================================
router.get('/users', authMiddleware, agencyMiddleware, async (req, res) => {
    try {
        if (req.user.roleType !== 'AGENCY_ADMIN') {
            return res.status(403).json({ success: false, error: 'Only Agency Admin can manage users' });
        }

        const users = await prisma.user.findMany({
            where: { agencyId: req.agencyId },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                status: true,
                agencyCommissionRate: true,
                role: { select: { type: true, name: true } },
                createdAt: true
            }
        });

        res.json({ success: true, data: users });
    } catch (error) {
        console.error('Fetch agency users error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch users' });
    }
});

// Create a new Agency Staff
router.post('/users', authMiddleware, agencyMiddleware, async (req, res) => {
    try {
        if (req.user.roleType !== 'AGENCY_ADMIN') {
            return res.status(403).json({ success: false, error: 'Only Agency Admin can manage users' });
        }

        const { firstName, lastName, email, password, agencyCommissionRate, roleType } = req.body;

        // Default to AGENCY_STAFF if not provided or invalid
        const targetRoleType = (roleType === 'AGENCY_ADMIN' || roleType === 'AGENCY_STAFF') ? roleType : 'AGENCY_STAFF';

        // Find requested role ID
        const role = await prisma.role.findFirst({
            where: { tenantId: req.tenant.id, type: targetRoleType }
        });

        if (!role) return res.status(400).json({ success: false, error: `${targetRoleType} role not found in tenant` });

        const passwordHash = await bcrypt.hash(password || '123456', 10);

        const newUser = await prisma.user.create({
            data: {
                tenantId: req.tenant.id,
                agencyId: req.agencyId,
                roleId: role.id,
                email,
                firstName,
                lastName,
                fullName: `${firstName} ${lastName}`,
                passwordHash,
                agencyCommissionRate: agencyCommissionRate || 0,
                status: 'ACTIVE'
            }
        });

        res.json({ success: true, data: { id: newUser.id, email: newUser.email } });
    } catch (error) {
        console.error('Create agency user error:', error);
        res.status(500).json({ success: false, error: 'Failed to create user' });
    }
});

// Edit an Agency Staff
router.put('/users/:id', authMiddleware, agencyMiddleware, async (req, res) => {
    try {
        if (req.user.roleType !== 'AGENCY_ADMIN') {
            return res.status(403).json({ success: false, error: 'Only Agency Admin can manage users' });
        }

        const { id } = req.params;
        const { firstName, lastName, email, password, agencyCommissionRate, roleType, status } = req.body;

        const user = await prisma.user.findFirst({
            where: { id, agencyId: req.agencyId, tenantId: req.tenant.id }
        });

        if (!user) return res.status(404).json({ success: false, error: 'Personel bulunamadı' });

        const dataToUpdate = {
            firstName: firstName !== undefined ? firstName : user.firstName,
            lastName: lastName !== undefined ? lastName : user.lastName,
            email: email !== undefined ? email : user.email,
            agencyCommissionRate: agencyCommissionRate !== undefined ? agencyCommissionRate : user.agencyCommissionRate,
            status: status !== undefined ? status : user.status,
            fullName: `${firstName !== undefined ? firstName : user.firstName} ${lastName !== undefined ? lastName : user.lastName}`
        };

        if (password) {
            dataToUpdate.passwordHash = await bcrypt.hash(password, 10);
        }

        if (roleType) {
            const targetRoleType = (roleType === 'AGENCY_ADMIN' || roleType === 'AGENCY_STAFF') ? roleType : 'AGENCY_STAFF';
            const role = await prisma.role.findFirst({
                where: { tenantId: req.tenant.id, type: targetRoleType }
            });
            if (role) {
                dataToUpdate.roleId = role.id;
            }
        }

        const updatedUser = await prisma.user.update({
            where: { id },
            data: dataToUpdate
        });

        res.json({ success: true, data: { id: updatedUser.id, email: updatedUser.email } });
    } catch (error) {
        console.error('Update agency user error:', error);
        res.status(500).json({ success: false, error: 'Personel güncellenirken hata oluştu' });
    }
});

// Soft Delete an Agency Staff
router.delete('/users/:id', authMiddleware, agencyMiddleware, async (req, res) => {
    try {
        if (req.user.roleType !== 'AGENCY_ADMIN') {
            return res.status(403).json({ success: false, error: 'Only Agency Admin can manage users' });
        }

        const { id } = req.params;

        if (id === req.user.id) {
            return res.status(400).json({ success: false, error: 'Kendinizi silemezsiniz' });
        }

        const user = await prisma.user.findFirst({
            where: { id, agencyId: req.agencyId, tenantId: req.tenant.id }
        });

        if (!user) return res.status(404).json({ success: false, error: 'Personel bulunamadı' });

        await prisma.user.update({
            where: { id },
            data: {
                status: 'DELETED',
                deletedAt: new Date()
            }
        });

        res.json({ success: true, message: 'Personel başarıyla silindi' });
    } catch (error) {
        console.error('Delete agency user error:', error);
        res.status(500).json({ success: false, error: 'Personel silinirken hata oluştu' });
    }
});

// ==========================================
// TOURS
// ==========================================
router.get('/tours/available', authMiddleware, agencyMiddleware, async (req, res) => {
    try {
        const tours = await prisma.product.findMany({
            where: {
                tenantId: req.tenant.id,
                type: 'TOUR',
                status: 'PUBLISHED',
                // Show platform tours + agency's own tours
                OR: [
                    { agencyId: null },
                    { agencyId: req.agencyId }
                ]
            },
            include: { tourData: true }
        });

        res.json({ success: true, data: tours });
    } catch (error) {
        console.error('Fetch agency tours error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch tours' });
    }
});

// ==========================================
// BOOKINGS
// ==========================================
router.post('/bookings', authMiddleware, agencyMiddleware, async (req, res) => {
    try {
        // 'providerPrice' is the B2B Cost. 'amount' is the Customer Selling Price.
        const {
            productId, type, startDate, passengers,
            providerPrice, amount,
            contactName, contactEmail, contactPhone, passengersList, metadata: extraMetadata
        } = req.body;

        const bookingNumber = `B2B${Date.now().toString().slice(-6)}`;

        // Commission Logic
        const commissionRate = req.agencyCommissionRate || 0; // Fetched from agencyMiddleware
        const netAmount = parseFloat(providerPrice) || parseFloat(amount) || 0; // The B2B cost
        const totalAmount = parseFloat(amount) || netAmount; // The Customer Selling Price

        // Payment Method Check
        const paymentMethod = extraMetadata?.paymentMethod || 'BALANCE';

        // Calculate the commission amount
        // Verify Agency Balance (ONLY IF PAYING FROM BALANCE)
        if (paymentMethod === 'BALANCE') {
            const agency = await prisma.agency.findUnique({
                where: { id: req.agencyId },
                select: { balance: true }
            });

            if (!agency || agency.balance < netAmount) {
                return res.status(400).json({ success: false, error: 'Yetersiz bakiye. Lütfen cari hesabınıza depozito yükleyin.' });
            }
        }

        // Prepare metadata safely
        let metadata = { ...(extraMetadata || {}) };
        if (passengersList && Array.isArray(passengersList)) {
            metadata.passengersList = passengersList;
        }

        // Persist customer note in the canonical column used by operations UI (`specialRequests`)
        // Accept different client keys for backwards compatibility.
        const customerNote =
            req.body.customerNotes ??
            req.body.notes ??
            metadata.customerNotes ??
            metadata.customerNote ??
            metadata.note ??
            null;

        // Add routing and vehicle explicit metadata for the list views
        // (Some clients may send pickup/dropoff only inside metadata.)
        const pickupText = req.body.pickup || metadata.pickup || '';
        const dropoffText = req.body.dropoff || metadata.dropoff || '';
        if (pickupText) metadata.pickup = pickupText;
        if (dropoffText) metadata.dropoff = dropoffText;
        if (req.body.vehicleId) metadata.vehicleId = req.body.vehicleId;
        if (req.body.vehicleType) metadata.vehicleType = req.body.vehicleType;

        // Detect region codes using polygon-based detection (with keyword fallback)
        const hubs = await loadTenantHubs(req.tenant.id);
        const zonesForRegion = await prisma.zone.findMany({
            where: { tenantId: req.tenant.id, code: { not: null } },
            select: { id: true, code: true, name: true, keywords: true, polygon: true }
        });
        const pLat = extraMetadata?.pickupLat || req.body.pickupLat;
        const pLng = extraMetadata?.pickupLng || req.body.pickupLng;
        const dLat = extraMetadata?.dropoffLat || req.body.dropoffLat;
        const dLng = extraMetadata?.dropoffLng || req.body.dropoffLng;
        metadata.pickupRegionCode = detectRegionCodeByPolygon(pLat, pLng, pickupText, zonesForRegion, hubs);
        metadata.dropoffRegionCode = detectRegionCodeByPolygon(dLat, dLng, dropoffText, zonesForRegion, hubs);
        if (pLat) metadata.pickupLat = Number(pLat);
        if (pLng) metadata.pickupLng = Number(pLng);
        if (dLat) metadata.dropoffLat = Number(dLat);
        if (dLng) metadata.dropoffLng = Number(dLng);

        // Use transaction to create booking and deduct balance safely
        const booking = await prisma.$transaction(async (tx) => {
            const newBooking = await tx.booking.create({
                data: {
                    tenantId: req.tenant.id,
                    agencyId: req.agencyId,
                    agentId: req.user.id,
                    bookingNumber,
                    productId,
                    productType: type || 'TRANSFER',
                    startDate: new Date(startDate),
                    adults: passengers || 1,
                    currency: req.body.currency || 'TRY',
                    subtotal: netAmount, // B2B Cost
                    tax: 0,
                    serviceFee: 0,
                    total: totalAmount, // Customer Selling Price
                    contactName,
                    contactEmail,
                    contactPhone,
                    status: paymentMethod === 'CREDIT_CARD' ? 'PENDING' : 'CONFIRMED',
                    paymentStatus: paymentMethod === 'BALANCE' ? 'PAID' : 'PENDING',
                    confirmationType: 'INSTANT',
                    specialRequests: customerNote || undefined,

                    // Booking Type & Creator
                    bookingType: 'B2B',
                    bookedByUserId: req.user.id,
                    bookedByName: [req.user?.firstName, req.user?.lastName].filter(Boolean).join(' ') || req.user?.email || 'Acenta',

                    metadata
                }
            });

            // -----------------------------------------------------------
            // ACCOUNTING: Create transaction records for ALL payment methods
            // -----------------------------------------------------------
            const bookingCurrency = req.body.currency || 'TRY';

            if (paymentMethod === 'BALANCE') {
                // Deduct B2B cost from agency balance
                await tx.agency.update({
                    where: { id: req.agencyId },
                    data: { balance: { decrement: netAmount }, debit: { increment: netAmount } }
                });

                await tx.transaction.create({
                    data: {
                        tenantId: req.tenant.id,
                        accountId: `agency-${req.agencyId}`,
                        type: 'PURCHASE_INVOICE',
                        amount: netAmount,
                        currency: bookingCurrency,
                        isCredit: false,
                        description: `B2B Transfer Satın Alma – Bakiyeden (PNR: ${bookingNumber})`,
                        date: new Date(),
                        referenceId: newBooking.id
                    }
                });
            } else if (paymentMethod === 'PAY_IN_VEHICLE') {
                // Cash in vehicle – agency owes us the B2B cost (receivable)
                await tx.agency.update({
                    where: { id: req.agencyId },
                    data: { debit: { increment: netAmount } }
                });

                await tx.transaction.create({
                    data: {
                        tenantId: req.tenant.id,
                        accountId: `agency-${req.agencyId}`,
                        type: 'PURCHASE_INVOICE',
                        amount: netAmount,
                        currency: bookingCurrency,
                        isCredit: false,
                        description: `B2B Transfer – Araçta Ödeme (PNR: ${bookingNumber})`,
                        date: new Date(),
                        referenceId: newBooking.id
                    }
                });
            } else if (paymentMethod === 'CREDIT_CARD') {
                // Credit card – customer pays online; track as debit pending payment
                await tx.agency.update({
                    where: { id: req.agencyId },
                    data: { debit: { increment: netAmount } }
                });

                await tx.transaction.create({
                    data: {
                        tenantId: req.tenant.id,
                        accountId: `agency-${req.agencyId}`,
                        type: 'PURCHASE_INVOICE',
                        amount: netAmount,
                        currency: bookingCurrency,
                        isCredit: false,
                        description: `B2B Transfer – Kredi Kartı (PNR: ${bookingNumber})`,
                        date: new Date(),
                        referenceId: newBooking.id
                    }
                });
            }

            // If agency sells at a higher price, record the markup as agency commission (credit)
            const markup = totalAmount - netAmount;
            if (markup > 0) {
                await tx.transaction.create({
                    data: {
                        tenantId: req.tenant.id,
                        accountId: `agency-${req.agencyId}`,
                        type: 'SALES_INVOICE',
                        amount: markup,
                        currency: bookingCurrency,
                        isCredit: true,
                        description: `Acente Komisyon/Kâr (PNR: ${bookingNumber})`,
                        date: new Date(),
                        referenceId: newBooking.id
                    }
                });

                // Credit the markup to agency balance
                await tx.agency.update({
                    where: { id: req.agencyId },
                    data: { credit: { increment: markup } }
                });
            }

            return newBooking;
        });

        const io = req.app.get('io');
        if (io) {
            io.to('admin_monitoring').emit('new_booking', booking);
        }

        // Send voucher email (async, don't block response)
        if (booking.contactEmail) {
            try {
                const { sendBookingVoucher } = require('../lib/emailService');
                sendBookingVoucher(req.tenant.id, booking).catch(err => {
                    console.error('[EMAIL] Agency voucher send failed (background):', err.message);
                });
            } catch (emailErr) {
                console.error('[EMAIL] Agency voucher setup failed:', emailErr.message);
            }
        }

        // Send WhatsApp voucher (async, don't block response)
        if (booking.contactPhone) {
            try {
                const { sendBookingWhatsApp } = require('../lib/whatsappService');
                sendBookingWhatsApp(req.tenant.id, booking).catch(err => {
                    console.error('[WHATSAPP] Agency voucher send failed (background):', err.message);
                });
            } catch (waErr) {
                console.error('[WHATSAPP] Agency voucher setup failed:', waErr.message);
            }
        }

        res.json({ success: true, data: booking });
    } catch (error) {
        console.error('Agency booking error:', error);
        res.status(500).json({ success: false, error: 'Failed to create booking' });
    }
});

// GET /api/agency/bookings - List agency's own bookings with optional filters
router.get('/bookings', authMiddleware, agencyMiddleware, async (req, res) => {
    try {
        const { search, startDate, endDate, status } = req.query;

        const bookings = await prisma.booking.findMany({
            where: {
                agencyId: req.agencyId,
                tenantId: req.tenant.id,
                ...(status && { status }),
                ...(startDate && endDate && {
                    startDate: {
                        gte: new Date(startDate),
                        lte: new Date(endDate)
                    }
                }),
                ...(search && {
                    OR: [
                        { contactName: { contains: search, mode: 'insensitive' } },
                        { contactEmail: { contains: search, mode: 'insensitive' } },
                        { contactPhone: { contains: search } },
                        { bookingNumber: { contains: search, mode: 'insensitive' } }
                    ]
                })
            },
            orderBy: { createdAt: 'desc' },
            take: 200
        });

        res.json({ success: true, data: bookings });
    } catch (error) {
        console.error('Agency GET bookings error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch bookings' });
    }
});

// PUT /api/agency/bookings/:id - Edit booking (only if >6h before startDate)
router.put('/bookings/:id', authMiddleware, agencyMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { contactName, contactPhone, contactEmail, passengersList, agencyNotes, flightNumber, pickup, dropoff } = req.body;

        const booking = await prisma.booking.findFirst({
            where: { id, agencyId: req.agencyId, tenantId: req.tenant.id }
        });

        if (!booking) {
            return res.status(404).json({ success: false, error: 'Rezervasyon bulunamadı' });
        }

        // Check 6-hour edit window
        const hoursUntil = (new Date(booking.startDate) - new Date()) / (1000 * 60 * 60);
        if (hoursUntil <= 6) {
            return res.status(400).json({
                success: false,
                error: 'Transfer saatine 6 saatten az kaldığı için düzenleme yapılamaz. Yalnızca iptal edebilirsiniz.'
            });
        }

        const updatedMetadata = {
            ...(booking.metadata || {}),
            passengersList: passengersList || booking.metadata?.passengersList,
            agencyNotes: agencyNotes ?? booking.metadata?.agencyNotes,
            flightNumber: flightNumber ?? booking.metadata?.flightNumber,
            pickup: pickup !== undefined ? pickup : booking.metadata?.pickup,
            dropoff: dropoff !== undefined ? dropoff : booking.metadata?.dropoff,
        };

        const updated = await prisma.booking.update({
            where: { id },
            data: {
                contactName: contactName || booking.contactName,
                contactPhone: contactPhone || booking.contactPhone,
                contactEmail: contactEmail || booking.contactEmail,
                metadata: updatedMetadata
            }
        });

        res.json({ success: true, data: updated });
    } catch (error) {
        console.error('Agency edit booking error:', error);
        res.status(500).json({ success: false, error: 'Failed to update booking' });
    }
});

// PUT /api/agency/bookings/:id/cancel - Cancel booking (refund balance if >6h)
router.put('/bookings/:id/cancel', authMiddleware, agencyMiddleware, async (req, res) => {
    try {
        const { id } = req.params;

        const booking = await prisma.booking.findFirst({
            where: { id, agencyId: req.agencyId, tenantId: req.tenant.id }
        });

        if (!booking) {
            return res.status(404).json({ success: false, error: 'Rezervasyon bulunamadı' });
        }

        if (booking.status === 'CANCELLED') {
            return res.status(400).json({ success: false, error: 'Bu rezervasyon zaten iptal edilmiş.' });
        }

        const hoursUntil = (new Date(booking.startDate) - new Date()) / (1000 * 60 * 60);
        const payMethod = booking.metadata?.paymentMethod || 'BALANCE';
        const canRefund = hoursUntil > 6;
        const bookingCurrency = booking.currency || 'TRY';
        const b2bCost = Number(booking.subtotal || 0);
        const customerPrice = Number(booking.total || 0);
        const markupAmount = customerPrice - b2bCost;

        await prisma.$transaction(async (tx) => {
            await tx.booking.update({
                where: { id },
                data: { status: 'CANCELLED', paymentStatus: canRefund ? 'REFUNDED' : booking.paymentStatus }
            });

            if (canRefund) {
                // Reverse the B2B debit (credit back)
                await tx.transaction.create({
                    data: {
                        tenantId: req.tenant.id,
                        accountId: `agency-${req.agencyId}`,
                        type: 'PAYMENT_RECEIVED',
                        amount: b2bCost,
                        currency: bookingCurrency,
                        isCredit: true,
                        description: `İptal İadesi – B2B Maliyet (PNR: ${booking.bookingNumber})`,
                        date: new Date(),
                        referenceId: booking.id
                    }
                });

                // Reverse commission/markup if any
                if (markupAmount > 0) {
                    await tx.transaction.create({
                        data: {
                            tenantId: req.tenant.id,
                            accountId: `agency-${req.agencyId}`,
                            type: 'PAYMENT_SENT',
                            amount: markupAmount,
                            currency: bookingCurrency,
                            isCredit: false,
                            description: `İptal – Komisyon İptali (PNR: ${booking.bookingNumber})`,
                            date: new Date(),
                            referenceId: booking.id
                        }
                    });
                }

                // Restore agency balance only if it was deducted (BALANCE method)
                if (payMethod === 'BALANCE') {
                    await tx.agency.update({
                        where: { id: req.agencyId },
                        data: {
                            balance: { increment: b2bCost },
                            debit: { decrement: b2bCost },
                            credit: markupAmount > 0 ? { decrement: markupAmount } : undefined
                        }
                    });
                } else {
                    // For PAY_IN_VEHICLE/CREDIT_CARD: reverse the debit tracking
                    await tx.agency.update({
                        where: { id: req.agencyId },
                        data: {
                            debit: { decrement: b2bCost },
                            credit: markupAmount > 0 ? { decrement: markupAmount } : undefined
                        }
                    });
                }
            }
        });

        res.json({
            success: true,
            refunded: canRefund,
            message: canRefund
                ? `Rezervasyon iptal edildi. ${b2bCost} ${bookingCurrency} iade edildi.`
                : 'Rezervasyon iptal edildi. Transfer saatine 6 saatten az kaldığı için iade yapılmadı.'
        });
    } catch (error) {
        console.error('Agency cancel booking error:', error);
        res.status(500).json({ success: false, error: 'Failed to cancel booking' });
    }
});


router.post('/bookings/bulk', authMiddleware, agencyMiddleware, async (req, res) => {
    try {
        const { transfers } = req.body;
        if (!Array.isArray(transfers)) {
            return res.status(400).json({ success: false, error: 'Invalid data format' });
        }

        let createdCount = 0;
        const commissionRate = req.agencyCommissionRate || 0; // Fetched from agencyMiddleware

        for (const t of transfers) {
            const bookingNumber = `B2B${Date.now().toString().slice(-6)}${createdCount}`;

            const netAmount = parseFloat(t.amount) || 0;
            // Removed agency commission math here because we changed it above to only charge net B2B costs

            let metadata = {};
            if (t.passengersList && Array.isArray(t.passengersList)) {
                metadata.passengersList = t.passengersList;
            }
            if (t.pickup) metadata.pickup = t.pickup;
            if (t.dropoff) metadata.dropoff = t.dropoff;
            if (t.vehicleId) metadata.vehicleId = t.vehicleId;
            if (t.vehicleType) metadata.vehicleType = t.vehicleType;

            // Detect region codes using polygon-based detection (with keyword fallback)
            const hubs = await loadTenantHubs(req.tenant.id);
            const zonesForRegionBulk = await prisma.zone.findMany({
                where: { tenantId: req.tenant.id, code: { not: null } },
                select: { id: true, code: true, name: true, keywords: true, polygon: true }
            });
            const bpLat = t.pickupLat || null;
            const bpLng = t.pickupLng || null;
            const bdLat = t.dropoffLat || null;
            const bdLng = t.dropoffLng || null;
            metadata.pickupRegionCode = detectRegionCodeByPolygon(bpLat, bpLng, metadata.pickup || '', zonesForRegionBulk, hubs);
            metadata.dropoffRegionCode = detectRegionCodeByPolygon(bdLat, bdLng, metadata.dropoff || '', zonesForRegionBulk, hubs);
            if (bpLat) metadata.pickupLat = Number(bpLat);
            if (bpLng) metadata.pickupLng = Number(bpLng);
            if (bdLat) metadata.dropoffLat = Number(bdLat);
            if (bdLng) metadata.dropoffLng = Number(bdLng);

            const bulkCurrency = t.currency || 'TRY';
            const bulkTotal = parseFloat(t.total) || netAmount;

            const newBulkBooking = await prisma.booking.create({
                data: {
                    tenantId: req.tenant.id,
                    agencyId: req.agencyId,
                    agentId: req.user.id,
                    bookingNumber,
                    productType: 'TRANSFER',
                    startDate: new Date(t.date || Date.now()),
                    adults: t.passengers || 1,
                    currency: bulkCurrency,
                    subtotal: netAmount,
                    tax: 0,
                    serviceFee: 0,
                    total: bulkTotal,
                    contactName: t.contactName || 'Guest',
                    contactEmail: t.contactEmail || 'guest@example.com',
                    contactPhone: t.contactPhone || '000',
                    status: 'CONFIRMED',
                    bookingType: 'B2B',
                    bookedByUserId: req.user.id,
                    metadata
                }
            });

            // Create accounting entry for bulk booking
            await prisma.transaction.create({
                data: {
                    tenantId: req.tenant.id,
                    accountId: `agency-${req.agencyId}`,
                    type: 'PURCHASE_INVOICE',
                    amount: netAmount,
                    currency: bulkCurrency,
                    isCredit: false,
                    description: `B2B Toplu Transfer (PNR: ${bookingNumber})`,
                    date: new Date(),
                    referenceId: newBulkBooking.id
                }
            });

            // Markup/commission entry
            const bulkMarkup = bulkTotal - netAmount;
            if (bulkMarkup > 0) {
                await prisma.transaction.create({
                    data: {
                        tenantId: req.tenant.id,
                        accountId: `agency-${req.agencyId}`,
                        type: 'SALES_INVOICE',
                        amount: bulkMarkup,
                        currency: bulkCurrency,
                        isCredit: true,
                        description: `Acente Komisyon/Kâr (PNR: ${bookingNumber})`,
                        date: new Date(),
                        referenceId: newBulkBooking.id
                    }
                });
            }

            createdCount++;
        }

        const io = req.app.get('io');
        if (io) {
            io.to('admin_monitoring').emit('new_booking', { bulk: true, count: createdCount });
        }

        res.json({ success: true, message: `Created ${createdCount} transfers` });
    } catch (error) {
        console.error('Agency bulk booking error:', error);
        res.status(500).json({ success: false, error: 'Failed to create bulk bookings' });
    }
});

// ==========================================
// SETTINGS
// ==========================================
router.get('/settings', authMiddleware, agencyMiddleware, async (req, res) => {
    try {
        const agency = await prisma.agency.findUnique({
            where: { id: req.agencyId },
            select: {
                logo: true, markup: true, balance: true,
                companyName: true, address: true,
                taxOffice: true, taxNumber: true,
                contactPhone: true, contactEmail: true, website: true,
                gsm: true, bankInfo: true
            }
        });

        res.json({ success: true, data: agency });
    } catch (error) {
        console.error('Fetch agency settings error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch settings' });
    }
});

router.put('/settings', authMiddleware, agencyMiddleware, async (req, res) => {
    try {
        if (req.user.roleType !== 'AGENCY_ADMIN') {
            return res.status(403).json({ success: false, error: 'Only Agency Admin can update settings' });
        }

        const { logo, markup, companyName, address, taxOffice, taxNumber, contactPhone, contactEmail, website, gsm, bankInfo } = req.body;

        const updated = await prisma.agency.update({
            where: { id: req.agencyId },
            data: {
                logo: logo !== undefined ? logo : undefined,
                markup: markup !== undefined ? parseFloat(markup) : undefined,
                companyName: companyName !== undefined ? companyName : undefined,
                address: address !== undefined ? address : undefined,
                taxOffice: taxOffice !== undefined ? taxOffice : undefined,
                taxNumber: taxNumber !== undefined ? taxNumber : undefined,
                contactPhone: contactPhone !== undefined ? contactPhone : undefined,
                contactEmail: contactEmail !== undefined ? contactEmail : undefined,
                website: website !== undefined ? website : undefined,
                gsm: gsm !== undefined ? gsm : undefined,
                bankInfo: bankInfo !== undefined ? bankInfo : undefined,
            },
            select: {
                logo: true, markup: true,
                companyName: true, address: true,
                taxOffice: true, taxNumber: true,
                contactPhone: true, contactEmail: true, website: true,
                gsm: true, bankInfo: true
            }
        });

        res.json({ success: true, data: updated });
    } catch (error) {
        console.error('Update agency settings error:', error);
        res.status(500).json({ success: false, error: 'Failed to update settings' });
    }
});

// ==========================================
// DEPOSITS (CARI HESAP)
// ==========================================

// Get tenant's bank accounts for EFT/Havale
router.get('/banks', authMiddleware, agencyMiddleware, async (req, res) => {
    try {
        const banks = await prisma.bank.findMany({
            where: { tenantId: req.tenant.id, status: true },
            include: { accounts: true }
        });
        res.json({ success: true, data: banks });
    } catch (error) {
        console.error('Fetch tenant banks error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch bank accounts' });
    }
});

// Get agency's deposit history
router.get('/deposits', authMiddleware, agencyMiddleware, async (req, res) => {
    try {
        const deposits = await prisma.agencyDeposit.findMany({
            where: { agencyId: req.agencyId },
            orderBy: { createdAt: 'desc' },
            include: { bankAccount: { include: { bank: true } } }
        });
        res.json({ success: true, data: deposits });
    } catch (error) {
        console.error('Fetch agency deposits error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch deposits' });
    }
});

// Create a new deposit
router.post('/deposits', authMiddleware, agencyMiddleware, async (req, res) => {
    try {
        const { amount, currency: depositCurrency, method, bankAccountId, notes } = req.body;

        if (!amount || amount <= 0) {
            return res.status(400).json({ success: false, error: 'Geçersiz tutar' });
        }

        const transactionRef = `DEP-${Date.now().toString().slice(-8)}`;

        let status = 'PENDING';

        // If CREDIT_CARD, we assume payment gateway is handled in the frontend or 
        // will be handled here and approved immediately. For now, auto-approve.
        if (method === 'CREDIT_CARD') {
            status = 'APPROVED';
        }

        const depCur = depositCurrency || 'TRY';
        const deposit = await prisma.agencyDeposit.create({
            data: {
                tenantId: req.tenant.id,
                agencyId: req.agencyId,
                amount: parseFloat(amount),
                currency: depCur,
                method,
                bankAccountId: method === 'BANK_TRANSFER' ? bankAccountId : null,
                transactionRef,
                notes,
                status
            }
        });

        // If approved instantly (Credit Card), we increment the agency balance
        if (status === 'APPROVED') {
            await prisma.$transaction(async (tx) => {
                await tx.agency.update({
                    where: { id: req.agencyId },
                    data: { balance: { increment: parseFloat(amount) }, credit: { increment: parseFloat(amount) } }
                });

                await tx.transaction.create({
                    data: {
                        tenantId: req.tenant.id,
                        accountId: `agency-${req.agencyId}`,
                        type: 'DEPOSIT',
                        amount: parseFloat(amount),
                        currency: depCur,
                        isCredit: true,
                        description: `Depozito Yükleme (${method}) - ${transactionRef}`,
                        date: new Date(),
                        referenceId: deposit.id
                    }
                });
            });
        }

        res.json({ success: true, data: deposit });
    } catch (error) {
        console.error('Create agency deposit error:', error);
        res.status(500).json({ success: false, error: 'Failed to create deposit' });
    }
});

// ==========================================
// AGENCY DASHBOARD STATS
// ==========================================
router.get('/dashboard', authMiddleware, agencyMiddleware, async (req, res) => {
    try {
        const agencyId = req.agencyId;
        const tenantId = req.tenant.id;

        // Fetch agency balance and staff count in parallel
        const [agency, staffCount, bookings] = await Promise.all([
            prisma.agency.findUnique({
                where: { id: agencyId },
                select: { balance: true, companyName: true }
            }),
            prisma.user.count({
                where: { agencyId, tenantId, status: { not: 'DELETED' } }
            }),
            prisma.booking.findMany({
                where: { agencyId, tenantId },
                select: { status: true, startDate: true, createdAt: true }
            })
        ]);

        const totalTransfers = bookings.length;
        const completedTransfers = bookings.filter(b => b.status === 'COMPLETED').length;
        const pendingTransfers = bookings.filter(b => b.status === 'PENDING').length;
        const inProgressTransfers = bookings.filter(b => b.status === 'CONFIRMED').length;
        const cancelledTransfers = bookings.filter(b => b.status === 'CANCELLED').length;

        // Monthly transfer chart data for current year
        const currentYear = new Date().getFullYear();
        const monthlyData = Array.from({ length: 12 }, (_, i) => ({
            month: i + 1,
            label: new Date(currentYear, i, 1).toLocaleString('tr-TR', { month: 'short' }),
            count: 0
        }));

        bookings.forEach(b => {
            const d = new Date(b.startDate || b.createdAt);
            if (d.getFullYear() === currentYear) {
                const m = d.getMonth(); // 0-indexed
                if (monthlyData[m]) monthlyData[m].count++;
            }
        });

        res.json({
            success: true,
            data: {
                totalTransfers,
                completedTransfers,
                pendingTransfers,
                inProgressTransfers,
                cancelledTransfers,
                staffCount,
                balance: agency ? parseFloat(agency.balance) : 0,
                companyName: agency?.companyName,
                monthlyChart: monthlyData
            }
        });
    } catch (error) {
        console.error('Agency dashboard stats error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch dashboard stats' });
    }
});

// ==========================================
// ACCOUNT STATEMENT (HESAP EKSTRESİ) — Multi-Currency
// ==========================================
router.get('/statement', authMiddleware, agencyMiddleware, async (req, res) => {
    try {
        const { startDate, endDate, currency: filterCurrency } = req.query;

        // ── Auto-backfill: create missing transactions for existing bookings ──
        const accountId = `agency-${req.agencyId}`;
        const existingTxCount = await prisma.transaction.count({
            where: { tenantId: req.tenant.id, accountId }
        });
        if (existingTxCount === 0) {
            // Check if there are bookings that should have transactions
            const bookings = await prisma.booking.findMany({
                where: { tenantId: req.tenant.id, agencyId: req.agencyId },
                select: { id: true, tenantId: true, agencyId: true, bookingNumber: true, currency: true, subtotal: true, total: true, status: true, metadata: true, createdAt: true },
                orderBy: { createdAt: 'asc' }
            });
            if (bookings.length > 0) {
                for (const booking of bookings) {
                    const b2bCost = Number(booking.subtotal || 0);
                    const customerPrice = Number(booking.total || 0);
                    const markup = customerPrice - b2bCost;
                    const cur = booking.currency || 'TRY';
                    const payMethod = booking.metadata?.paymentMethod || 'BALANCE';
                    if (b2bCost <= 0) continue;
                    const txs = [];
                    txs.push({ tenantId: booking.tenantId, accountId, type: 'PURCHASE_INVOICE', amount: b2bCost, currency: cur, isCredit: false, description: `B2B Transfer Satın Alma – ${payMethod === 'BALANCE' ? 'Bakiyeden' : payMethod === 'PAY_IN_VEHICLE' ? 'Araçta Ödeme' : 'Kredi Kartı'} (PNR: ${booking.bookingNumber})`, date: booking.createdAt, referenceId: booking.id });
                    if (markup > 0) txs.push({ tenantId: booking.tenantId, accountId, type: 'SALES_INVOICE', amount: markup, currency: cur, isCredit: true, description: `Acente Komisyon/Kâr (PNR: ${booking.bookingNumber})`, date: booking.createdAt, referenceId: booking.id });
                    if (booking.status === 'CANCELLED') {
                        txs.push({ tenantId: booking.tenantId, accountId, type: 'PAYMENT_RECEIVED', amount: b2bCost, currency: cur, isCredit: true, description: `İptal İadesi – B2B Maliyet (PNR: ${booking.bookingNumber})`, date: booking.createdAt, referenceId: booking.id });
                        if (markup > 0) txs.push({ tenantId: booking.tenantId, accountId, type: 'PAYMENT_SENT', amount: markup, currency: cur, isCredit: false, description: `İptal – Komisyon İptali (PNR: ${booking.bookingNumber})`, date: booking.createdAt, referenceId: booking.id });
                    }
                    await prisma.transaction.createMany({ data: txs });
                }
                console.log(`[Statement] Auto-backfilled transactions for agency ${req.agencyId}`);
            }
        }
        // ── End backfill ──

        // Fetch all transactions for this agency (chronological for balance calc)
        const allTransactions = await prisma.transaction.findMany({
            where: {
                tenantId: req.tenant.id,
                accountId
            },
            orderBy: { date: 'asc' }
        });

        // Pre-fetch all referenced bookings and deposits in bulk (avoid N+1)
        const refIds = allTransactions.map(t => t.referenceId).filter(Boolean);
        const [refBookings, refDeposits] = await Promise.all([
            prisma.booking.findMany({
                where: { id: { in: refIds } },
                select: { id: true, bookingNumber: true, agent: { select: { fullName: true } } }
            }),
            prisma.agencyDeposit.findMany({
                where: { id: { in: refIds } },
                select: { id: true, transactionRef: true, approvedBy: { select: { fullName: true } } }
            })
        ]);
        const bookingMap = Object.fromEntries(refBookings.map(b => [b.id, b]));
        const depositMap = Object.fromEntries(refDeposits.map(d => [d.id, d]));

        // Build entries with reference resolution
        const statementEntries = allTransactions.map(t => {
            let personnelName = 'Sistem';
            let referenceData = null;
            const cur = t.currency || 'TRY';

            if (t.referenceId) {
                const booking = bookingMap[t.referenceId];
                const deposit = depositMap[t.referenceId];
                if (booking) {
                    personnelName = booking.agent?.fullName || 'Bilinmeyen Personel';
                    referenceData = booking.bookingNumber;
                } else if (deposit) {
                    personnelName = deposit.approvedBy ? `Onaylayan: ${deposit.approvedBy.fullName}` : 'Sistem / Otomatik';
                    referenceData = deposit.transactionRef;
                }
            }

            return {
                id: t.id,
                date: t.date,
                type: t.type,
                amount: parseFloat(t.amount),
                currency: cur,
                isCredit: t.isCredit,
                description: t.description,
                personnelName,
                referenceData,
                runningBalance: 0
            };
        });

        // Compute running balance PER CURRENCY
        const balanceByCurrency = {}; // { TRY: 0, EUR: 0, USD: 0 }
        statementEntries.forEach(entry => {
            if (!balanceByCurrency[entry.currency]) balanceByCurrency[entry.currency] = 0;
            if (entry.isCredit) {
                balanceByCurrency[entry.currency] += entry.amount;
            } else {
                balanceByCurrency[entry.currency] -= entry.amount;
            }
            entry.runningBalance = Math.round(balanceByCurrency[entry.currency] * 100) / 100;
        });

        // Filter by date range if provided
        let filteredEntries = statementEntries;
        if (startDate && endDate) {
            const s = new Date(startDate).toISOString().slice(0, 10);
            const e = new Date(endDate).toISOString().slice(0, 10);
            filteredEntries = statementEntries.filter(en => {
                const d = new Date(en.date).toISOString().slice(0, 10);
                return d >= s && d <= e;
            });
        }

        // Filter by currency if provided
        if (filterCurrency) {
            filteredEntries = filteredEntries.filter(en => en.currency === filterCurrency);
        }

        // Newest first for table display
        filteredEntries.reverse();

        // Compute per-currency summaries from ALL transactions (not just filtered)
        const currencySummaries = {};
        statementEntries.forEach(entry => {
            const c = entry.currency;
            if (!currencySummaries[c]) {
                currencySummaries[c] = { currency: c, totalCredit: 0, totalDebit: 0, balance: 0 };
            }
            if (entry.isCredit) {
                currencySummaries[c].totalCredit += entry.amount;
            } else {
                currencySummaries[c].totalDebit += entry.amount;
            }
        });
        // Apply running balance to summary
        Object.keys(currencySummaries).forEach(c => {
            const s = currencySummaries[c];
            s.balance = Math.round((s.totalCredit - s.totalDebit) * 100) / 100;
            s.totalCredit = Math.round(s.totalCredit * 100) / 100;
            s.totalDebit = Math.round(s.totalDebit * 100) / 100;
        });

        // If date range is provided, also compute period-only summaries
        let periodSummaries = null;
        if (startDate && endDate) {
            periodSummaries = {};
            const s = new Date(startDate).toISOString().slice(0, 10);
            const e = new Date(endDate).toISOString().slice(0, 10);
            statementEntries.forEach(entry => {
                const d = new Date(entry.date).toISOString().slice(0, 10);
                if (d >= s && d <= e) {
                    const c = entry.currency;
                    if (!periodSummaries[c]) periodSummaries[c] = { currency: c, totalCredit: 0, totalDebit: 0 };
                    if (entry.isCredit) periodSummaries[c].totalCredit += entry.amount;
                    else periodSummaries[c].totalDebit += entry.amount;
                }
            });
            Object.values(periodSummaries).forEach(ps => {
                ps.totalCredit = Math.round(ps.totalCredit * 100) / 100;
                ps.totalDebit = Math.round(ps.totalDebit * 100) / 100;
            });
        }

        // Fetch tenant currencies from definitions (dynamic, not hardcoded)
        const tenantFull = await prisma.tenant.findUnique({
            where: { id: req.tenant.id },
            select: { settings: true }
        });
        const defCurrencies = tenantFull?.settings?.definitions?.currencies || [];
        const dynamicCurrencyCodes = defCurrencies.map(c => c.code);

        res.json({
            success: true,
            data: {
                transactions: filteredEntries,
                currencySummaries: Object.values(currencySummaries),
                periodSummaries: periodSummaries ? Object.values(periodSummaries) : null,
                supportedCurrencies: dynamicCurrencyCodes.length > 0 ? dynamicCurrencyCodes : ['TRY'],
                defaultCurrency: (defCurrencies.find(c => c.isDefault) || defCurrencies[0])?.code || 'TRY',
                // Legacy field for backward compat
                currentBalance: balanceByCurrency['TRY'] || 0
            }
        });
    } catch (error) {
        console.error('Fetch agency statement error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch statement' });
    }
});

module.exports = router;
