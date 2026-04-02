const express = require('express');

const { authMiddleware } = require('../middleware/auth');
const bcrypt = require('bcryptjs');

const router = express.Router();
const prisma = require('../lib/prisma');

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

        // Add routing and vehicle explicit metadata for the list views
        if (req.body.pickup) metadata.pickup = req.body.pickup;
        if (req.body.dropoff) metadata.dropoff = req.body.dropoff;
        if (req.body.vehicleId) metadata.vehicleId = req.body.vehicleId;
        if (req.body.vehicleType) metadata.vehicleType = req.body.vehicleType;

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
                    currency: 'TRY', // default
                    subtotal: netAmount, // B2B Cost
                    tax: 0,
                    serviceFee: 0,
                    total: totalAmount, // Customer Selling Price
                    contactName,
                    contactEmail,
                    contactPhone,
                    status: paymentMethod === 'CREDIT_CARD' ? 'PENDING' : 'CONFIRMED',
                    paymentStatus: paymentMethod === 'CREDIT_CARD' ? 'PENDING' : 'PAID',
                    confirmationType: 'INSTANT',
                    metadata
                }
            });

            // Deduct the net amount (B2B cost) from agency balance ONLY IF PAYING FROM BALANCE
            if (paymentMethod === 'BALANCE') {
                await tx.agency.update({
                    where: { id: req.agencyId },
                    data: { balance: { decrement: netAmount }, debit: { increment: netAmount } }
                });

                // Create a transaction record for the account statement
                await tx.transaction.create({
                    data: {
                        tenantId: req.tenant.id,
                        accountId: `agency-${req.agencyId}`,
                        type: 'MANUAL_OUT', // Cari Çıkış (Borçlanma)
                        amount: netAmount,
                        isCredit: false,
                        description: `B2B Transfer Rezervasyonu (PNR: ${bookingNumber})`,
                        date: new Date(),
                        referenceId: newBooking.id
                    }
                });
            }

            return newBooking;
        });

        const io = req.app.get('io');
        if (io) {
            io.to('admin_monitoring').emit('new_booking', booking);
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
        const canRefund = hoursUntil > 6 && booking.paymentStatus === 'PAID';

        await prisma.$transaction(async (tx) => {
            await tx.booking.update({
                where: { id },
                data: { status: 'CANCELLED', paymentStatus: 'REFUNDED' }
            });

            // Refund B2B cost to agency balance if >6h before transfer
            if (canRefund && booking.paymentStatus === 'PAID' && booking.metadata?.paymentMethod !== 'CREDIT_CARD') {
                await tx.agency.update({
                    where: { id: req.agencyId },
                    data: { balance: { increment: Number(booking.subtotal || 0) }, credit: { increment: Number(booking.subtotal || 0) } }
                });

                await tx.transaction.create({
                    data: {
                        tenantId: req.tenant.id,
                        accountId: `agency-${req.agencyId}`,
                        type: 'MANUAL_IN', // Cari Giriş (İade/Alacak)
                        amount: Number(booking.subtotal || 0),
                        isCredit: true,
                        description: `İptal İadesi (PNR: ${booking.bookingNumber})`,
                        date: new Date(),
                        referenceId: booking.id
                    }
                });
            }
        });

        res.json({
            success: true,
            refunded: canRefund,
            message: canRefund
                ? `Rezervasyon iptal edildi. ${booking.subtotal} TRY bakiyenize iade edildi.`
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

            await prisma.booking.create({
                data: {
                    tenantId: req.tenant.id,
                    agencyId: req.agencyId,
                    agentId: req.user.id,
                    bookingNumber,
                    productType: 'TRANSFER',
                    startDate: new Date(t.date || Date.now()),
                    adults: t.passengers || 1,
                    currency: 'TRY',
                    subtotal: netAmount,
                    tax: 0,
                    serviceFee: 0,
                    total: netAmount,
                    contactName: t.contactName || 'Guest',
                    contactEmail: t.contactEmail || 'guest@example.com',
                    contactPhone: t.contactPhone || '000',
                    status: 'CONFIRMED',
                    metadata
                }
            });
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
                contactPhone: true, contactEmail: true, website: true
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

        const { logo, markup, companyName, address, taxOffice, taxNumber, contactPhone, contactEmail, website } = req.body;

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
            },
            select: {
                logo: true, markup: true,
                companyName: true, address: true,
                taxOffice: true, taxNumber: true,
                contactPhone: true, contactEmail: true, website: true
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
        const { amount, method, bankAccountId, notes } = req.body;

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

        const deposit = await prisma.agencyDeposit.create({
            data: {
                tenantId: req.tenant.id,
                agencyId: req.agencyId,
                amount: parseFloat(amount),
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
// ACCOUNT STATEMENT (HESAP EKSTRESİ)
// ==========================================
// Get agency's account statement (includes transactions with personnel details)
router.get('/statement', authMiddleware, agencyMiddleware, async (req, res) => {
    try {
        const { startDate, endDate } = req.query;

        // Fetch all transactions for this agency
        // We fetch all of them to calculate a proper running balance up to the selected date
        // But we will only return the transactions that fall within the requested date range
        const allTransactions = await prisma.transaction.findMany({
            where: {
                tenantId: req.tenant.id,
                accountId: `agency-${req.agencyId}`
            },
            orderBy: { date: 'asc' } // chronological for balance calculation
        });

        // Resolve reference IDs to get personnel details in parallel
        const statementEntries = await Promise.all(allTransactions.map(async (t) => {
            let personnelName = null;
            let referenceData = null;

            if (t.referenceId) {
                // Determine if it was a booking (Booking type) or a deposit
                if (t.type === 'MANUAL_OUT' || t.type === 'MANUAL_IN') {
                    // Usually implies a booking purchase or cancellation refund
                    const booking = await prisma.booking.findUnique({
                        where: { id: t.referenceId },
                        select: {
                            bookingNumber: true,
                            agent: { select: { firstName: true, lastName: true, fullName: true } }
                        }
                    });
                    if (booking) {
                        personnelName = booking.agent ? booking.agent.fullName : 'Bilinmeyen Personel';
                        referenceData = booking.bookingNumber;
                    }
                } else if (t.type === 'DEPOSIT') {
                    const deposit = await prisma.agencyDeposit.findUnique({
                        where: { id: t.referenceId },
                        select: {
                            transactionRef: true,
                            approvedBy: { select: { fullName: true } }
                        }
                    });
                    if (deposit) {
                        personnelName = deposit.approvedBy ? `Onaylayan: ${deposit.approvedBy.fullName}` : 'Sistem / Otomatik';
                        referenceData = deposit.transactionRef;
                    }
                }
            }

            return {
                id: t.id,
                date: t.date,
                type: t.type,
                amount: parseFloat(t.amount),
                isCredit: t.isCredit,
                description: t.description,
                personnelName: personnelName || 'Sistem',
                referenceData,
                runningBalance: 0 // Will calculate in the next step
            };
        }));

        // Calculate running balance
        let currentBalance = 0;
        statementEntries.forEach(entry => {
            if (entry.isCredit) {
                currentBalance += entry.amount;
            } else {
                currentBalance -= entry.amount;
            }
            entry.runningBalance = currentBalance;
        });

        // Filter by dates if provided
        let filteredEntries = statementEntries;
        if (startDate && endDate) {
            const startStr = new Date(startDate).toISOString().slice(0, 10);
            const endStr = new Date(endDate).toISOString().slice(0, 10);
            filteredEntries = statementEntries.filter(e => {
                const eDateStr = new Date(e.date).toISOString().slice(0, 10);
                return eDateStr >= startStr && eDateStr <= endStr;
            });
        }

        // Return from newest to oldest for the table
        filteredEntries.reverse();

        // Also fetch the current live agency balance just to be sure
        const agency = await prisma.agency.findUnique({
            where: { id: req.agencyId },
            select: { balance: true }
        });

        res.json({
            success: true,
            data: {
                transactions: filteredEntries,
                currentBalance: agency ? parseFloat(agency.balance) : currentBalance
            }
        });
    } catch (error) {
        console.error('Fetch agency statement error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch statement' });
    }
});

module.exports = router;
