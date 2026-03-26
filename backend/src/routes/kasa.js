// backend/src/routes/kasa.js
// Kasa (Cash Register) — aggregates all income/expense from every source

const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

/* ─── ID helper ─────────────────────────────── */
function genId() {
    return Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 5).toUpperCase();
}

/* ─── Shared Tenant helper ───────────────────── */
async function getTenantMeta(tenantId) {
    const t = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { metadata: true } });
    return t?.metadata || {};
}
async function saveTenantMeta(tenantId, meta) {
    await prisma.tenant.update({ where: { id: tenantId }, data: { metadata: meta } });
}

// ────────────────────────────────────────────────────────────────────────────
// GET /api/kasa/summary
// Returns totals per account type
// ────────────────────────────────────────────────────────────────────────────
router.get('/summary', authMiddleware, async (req, res) => {
    try {
        const { tenantId } = req.user;
        const { from, to } = req.query;

        const dateFrom = from ? new Date(from) : new Date(new Date().setDate(1)); // first of month
        const dateTo = to ? new Date(to) : new Date();
        dateTo.setHours(23, 59, 59, 999);

        // Pull manual kasa entries
        const meta = await getTenantMeta(tenantId);
        const entries = (meta.kasaEntries || []).filter(e => {
            const d = new Date(e.date);
            return d >= dateFrom && d <= dateTo;
        });

        // Pull bookings in range
        const bookings = await prisma.booking.findMany({
            where: {
                tenantId,
                createdAt: { gte: dateFrom, lte: dateTo },
                status: { not: 'CANCELLED' }
            },
            select: { total: true, currency: true, paymentStatus: true, metadata: true, createdAt: true }
        });

        // Pull agencies for deposit information
        const agencies = await prisma.agency.findMany({
            where: { tenantId },
            select: { id: true, companyName: true, balance: true, credit: true, debit: true }
        });

        // Pull approved invoices
        const invoices = (meta.invoices || []).filter(inv => {
            const d = new Date(inv.invoiceDate || inv.createdAt);
            return inv.status === 'APPROVED' && d >= dateFrom && d <= dateTo;
        });

        // Calculate booking revenue by currency
        const bookingRevByCurrency = {};
        bookings.forEach(b => {
            const cur = b.currency || 'TRY';
            bookingRevByCurrency[cur] = (bookingRevByCurrency[cur] || 0) + Number(b.total || 0);
        });

        // Calculate invoice revenue by currency
        const invoiceRevByCurrency = {};
        invoices.filter(i => i.invoiceType === 'SALES').forEach(inv => {
            const cur = inv.currency || 'TRY';
            invoiceRevByCurrency[cur] = (invoiceRevByCurrency[cur] || 0) + Number(inv.grandTotal || 0);
        });

        // Calculate manual entry subtotals per account
        const accountSummaries = {};
        entries.forEach(e => {
            const key = e.accountType || 'TL_CASH';
            if (!accountSummaries[key]) accountSummaries[key] = { income: 0, expense: 0, currency: e.accountCurrency || 'TRY' };
            if (e.direction === 'IN') accountSummaries[key].income += Number(e.amount || 0);
            else accountSummaries[key].expense += Number(e.amount || 0);
        });

        // Total agency deposits
        const totalAgencyDeposit = agencies.reduce((s, a) => s + Number(a.credit || 0), 0);

        // Sum Vehicle Tracking Expenses 
        let totalVehicleExpenseTRY = 0;
        try {
            const vehicles = await prisma.vehicle.findMany({
                where: { tenantId },
                select: { metadata: true }
            });

            vehicles.forEach(v => {
                const tr = v.metadata?.tracking || {};

                // Fuel
                (tr.fuel || []).filter(f => {
                    const d = new Date(f.date); return d >= dateFrom && d <= dateTo;
                }).forEach(f => { totalVehicleExpenseTRY += Number(f.totalCost || 0); });

                // Maintenance
                (tr.maintenance || []).filter(m => {
                    const d = new Date(m.date); return d >= dateFrom && d <= dateTo;
                }).forEach(m => { totalVehicleExpenseTRY += Number(m.cost || 0); });

                // Insurance
                (tr.insurance || []).filter(i => {
                    const d = new Date(i.startDate); return d >= dateFrom && d <= dateTo;
                }).forEach(i => { totalVehicleExpenseTRY += Number(i.cost || 0); });

                // Inspection
                (tr.inspection || []).filter(i => {
                    const d = new Date(i.date); return d >= dateFrom && d <= dateTo;
                }).forEach(i => { totalVehicleExpenseTRY += Number(i.cost || 0); });
            });
        } catch (_) { }

        res.json({
            success: true,
            data: {
                period: { from: dateFrom, to: dateTo },
                bookingRevenue: bookingRevByCurrency,
                invoiceRevenue: invoiceRevByCurrency,
                agencyDeposits: totalAgencyDeposit,
                vehicleExpensesTRY: totalVehicleExpenseTRY,
                accountSummaries,
                totalBookings: bookings.length,
                totalInvoices: invoices.length,
            }
        });
    } catch (e) {
        console.error('Kasa summary error:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// ────────────────────────────────────────────────────────────────────────────
// GET /api/kasa/entries
// Unified ledger: manual entries + booking revenues + invoice payments
// ────────────────────────────────────────────────────────────────────────────
router.get('/entries', authMiddleware, async (req, res) => {
    try {
        const { tenantId } = req.user;
        const { from, to, accountType, direction, page = 1, limit = 50 } = req.query;

        const dateFrom = from ? new Date(from) : new Date(new Date().setDate(1));
        const dateTo = to ? new Date(to) : new Date();
        dateTo.setHours(23, 59, 59, 999);

        const meta = await getTenantMeta(tenantId);

        // 1. Manual Kasa Entries
        let rows = (meta.kasaEntries || [])
            .filter(e => {
                const d = new Date(e.date);
                return d >= dateFrom && d <= dateTo;
            })
            .map(e => ({ ...e, source: 'MANUAL' }));

        // 2. Bookings (AUTO)
        const bookings = await prisma.booking.findMany({
            where: { tenantId, createdAt: { gte: dateFrom, lte: dateTo }, status: { not: 'CANCELLED' } },
            select: { id: true, bookingNumber: true, total: true, currency: true, paymentStatus: true, contactName: true, createdAt: true, metadata: true }
        });
        bookings.forEach(b => {
            rows.push({
                id: `booking-${b.id}`,
                source: 'BOOKING',
                direction: 'IN',
                date: b.createdAt.toISOString(),
                amount: Number(b.total || 0),
                currency: b.currency || 'TRY',
                accountType: 'TL_CASH',
                accountCurrency: b.currency || 'TRY',
                description: `Transfer Rezervasyonu: ${b.bookingNumber}`,
                category: 'DIRECT_SALE',
                counterpart: b.contactName,
                refNo: b.bookingNumber,
                paymentStatus: b.paymentStatus,
                readonly: true,
            });
        });

        // 3. Approved Sales Invoices (AUTO)
        const invoices = (meta.invoices || [])
            .filter(inv => {
                const d = new Date(inv.invoiceDate || inv.createdAt);
                return inv.status === 'APPROVED' && inv.invoiceType === 'SALES' && d >= dateFrom && d <= dateTo;
            });
        invoices.forEach(inv => {
            rows.push({
                id: `invoice-${inv.id}`,
                source: 'INVOICE',
                direction: 'IN',
                date: inv.invoiceDate || inv.createdAt,
                amount: Number(inv.grandTotal || 0),
                currency: inv.currency || 'TRY',
                accountType: 'TL_CASH',
                accountCurrency: inv.currency || 'TRY',
                description: `${inv.invoiceNo} — Onaylı Satış Faturası`,
                category: 'INVOICE_PAYMENT',
                counterpart: inv.buyerInfo?.companyName || inv.buyerInfo?.fullName,
                refNo: inv.invoiceNo,
                readonly: true,
            });
        });

        // 4. Global Transactions (Cari Hesap - Payments, Salary) (AUTO)
        try {
            const txs = await prisma.transaction.findMany({
                where: {
                    tenantId,
                    date: { gte: dateFrom, lte: dateTo },
                    type: { in: ['PAYMENT_RECEIVED', 'PAYMENT_SENT', 'SALARY', 'MANUAL_IN', 'MANUAL_OUT'] }
                }
            });

            // Extract IDs for mapping names
            const agencyIds = [...new Set(txs.filter(t => t.accountId.startsWith('agency-')).map(t => t.accountId.replace('agency-', '')))];
            const personnelIds = [...new Set(txs.filter(t => t.accountId.startsWith('personnel-')).map(t => t.accountId.replace('personnel-', '')))];

            const [agenciesList, personnelList] = await Promise.all([
                prisma.agency.findMany({ where: { tenantId, id: { in: agencyIds } }, select: { id: true, name: true, companyName: true } }),
                prisma.personnel.findMany({ where: { tenantId, id: { in: personnelIds } }, select: { id: true, firstName: true, lastName: true } })
            ]);

            const agencyMap = {}; agenciesList.forEach(a => agencyMap[a.id] = a.name || a.companyName);
            const personnelMap = {}; personnelList.forEach(p => personnelMap[p.id] = `${p.firstName} ${p.lastName}`);

            txs.forEach(tx => {
                let rawId = tx.accountId;
                let counterpart = rawId;
                let source = 'MANUAL';

                if (rawId.startsWith('agency-')) {
                    source = 'AGENCY';
                    const aId = rawId.replace('agency-', '');
                    counterpart = 'Acente Cari: ' + (agencyMap[aId] || aId);
                } else if (rawId.startsWith('personnel-')) {
                    source = 'PERSONNEL';
                    const pId = rawId.replace('personnel-', '');
                    counterpart = 'Personel Cari: ' + (personnelMap[pId] || pId);
                }

                rows.push({
                    id: `tx-${tx.id}`,
                    source,
                    direction: tx.isCredit ? 'IN' : 'OUT',
                    date: tx.date,
                    amount: Number(tx.amount || 0),
                    currency: tx.currency || 'TRY',
                    accountType: 'TL_CASH',
                    accountCurrency: tx.currency || 'TRY',
                    description: tx.description || 'Cari Hesap İşlemi',
                    category: tx.type === 'SALARY' ? 'Maaş/Avans' : 'Tahsilat/Tediye',
                    counterpart: counterpart,
                    refNo: tx.referenceId || '',
                    readonly: true,
                });
            });
        } catch (_) { }

        // 4.5. Agency Deposits (AUTO)
        try {
            const agDeposits = await prisma.agencyDeposit.findMany({
                where: {
                    tenantId,
                    status: 'APPROVED',
                    OR: [
                        { updatedAt: { gte: dateFrom, lte: dateTo } },
                        { createdAt: { gte: dateFrom, lte: dateTo } }
                    ]
                },
                include: { agency: { select: { name: true, companyName: true } } }
            });

            agDeposits.forEach(dep => {
                rows.push({
                    id: `ag-dep-${dep.id}`,
                    source: 'AGENCY',
                    direction: 'IN', // Deposit from agency to us
                    date: dep.updatedAt || dep.createdAt,
                    amount: Number(dep.amount || 0),
                    currency: dep.currency || 'TRY',
                    accountType: 'BANK_TRY', // Assuming bank transfer usually
                    accountCurrency: dep.currency || 'TRY',
                    description: `Acente Depozitosu (Banka / EFT)`,
                    category: 'Acente Depozitosu',
                    counterpart: dep.agency?.name || dep.agency?.companyName || 'Acente',
                    refNo: dep.transactionRef,
                    readonly: true,
                });
            });
        } catch (_) { }

        // 5. Vehicle Tracking Expenses (Fuel, Maintenance, Insurance, Inspection) (AUTO)
        try {
            const vehicles = await prisma.vehicle.findMany({
                where: { tenantId },
                select: { plateNumber: true, brand: true, model: true, metadata: true }
            });

            vehicles.forEach(v => {
                const tr = v.metadata?.tracking || {};
                const vName = `${v.plateNumber} - ${v.brand} ${v.model}`;

                // Fuel
                (tr.fuel || []).filter(f => {
                    const d = new Date(f.date); return d >= dateFrom && d <= dateTo;
                }).forEach(f => {
                    rows.push({
                        id: `v-fuel-${f.id}`, source: 'MANUAL', direction: 'OUT',
                        date: f.date, amount: Number(f.totalCost || 0), currency: 'TRY', // Default tracking currency
                        accountType: 'TL_CASH', accountCurrency: 'TRY',
                        description: `Yakıt Alımı (${f.liters}L) - ${f.station || ''}`, category: 'Yakıt',
                        counterpart: vName, readonly: true
                    });
                });

                // Maintenance
                (tr.maintenance || []).filter(m => {
                    const d = new Date(m.date); return d >= dateFrom && d <= dateTo;
                }).forEach(m => {
                    rows.push({
                        id: `v-maint-${m.id}`, source: 'MANUAL', direction: 'OUT',
                        date: m.date, amount: Number(m.cost || 0), currency: 'TRY',
                        accountType: 'TL_CASH', accountCurrency: 'TRY',
                        description: `Araç Bakım/Onarım: ${m.type || m.description || ''}`, category: 'Bakım-Onarım',
                        counterpart: vName, readonly: true
                    });
                });

                // Insurance
                (tr.insurance || []).filter(i => {
                    const d = new Date(i.startDate); return d >= dateFrom && d <= dateTo;
                }).forEach(i => {
                    rows.push({
                        id: `v-ins-${i.id}`, source: 'MANUAL', direction: 'OUT',
                        date: i.startDate, amount: Number(i.cost || 0), currency: 'TRY',
                        accountType: 'TL_CASH', accountCurrency: 'TRY',
                        description: `Araç Sigortası/Kasko: ${i.company || ''}`, category: 'Vergi/Sigorta',
                        counterpart: vName, readonly: true
                    });
                });

                // Inspection
                (tr.inspection || []).filter(i => {
                    const d = new Date(i.date); return d >= dateFrom && d <= dateTo;
                }).forEach(i => {
                    rows.push({
                        id: `v-insp-${i.id}`, source: 'MANUAL', direction: 'OUT',
                        date: i.date, amount: Number(i.cost || 0), currency: 'TRY',
                        accountType: 'TL_CASH', accountCurrency: 'TRY',
                        description: `Araç Muayenesi - ${i.station || ''}`, category: 'Vergi/Sigorta',
                        counterpart: vName, readonly: true
                    });
                });
            });
        } catch (_) { }

        // Filter by accountType or direction
        if (accountType) rows = rows.filter(r => r.accountType === accountType);
        if (direction) rows = rows.filter(r => r.direction === direction);

        // Sort newest first
        rows.sort((a, b) => new Date(b.date) - new Date(a.date));

        // Pagination
        const total = rows.length;
        const start = (Number(page) - 1) * Number(limit);
        const paginated = rows.slice(start, start + Number(limit));

        // Calculate running totals
        let totalIn = rows.filter(r => r.direction === 'IN').reduce((s, r) => s + r.amount, 0);
        let totalOut = rows.filter(r => r.direction === 'OUT').reduce((s, r) => s + r.amount, 0);

        res.json({
            success: true,
            data: {
                entries: paginated,
                pagination: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / Number(limit)) },
                totals: { in: totalIn, out: totalOut, net: totalIn - totalOut }
            }
        });
    } catch (e) {
        console.error('Kasa entries error:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// ────────────────────────────────────────────────────────────────────────────
// POST /api/kasa/entries
// Add a manual income/expense entry
// ────────────────────────────────────────────────────────────────────────────
router.post('/entries', authMiddleware, async (req, res) => {
    try {
        const { tenantId, id: userId } = req.user;
        const {
            direction,      // 'IN' | 'OUT'
            amount,
            currency,
            accountType,    // 'TL_CASH' | 'USD_CASH' | 'EUR_CASH' | 'BANK_TRY' | 'BANK_USD' | 'BANK_EUR' | 'CREDIT_CARD'
            accountCurrency,
            description,
            category,       // 'DIRECT_SALE' | 'AGENCY' | 'GENERAL_INCOME' | 'GENERAL_EXPENSE' | etc.
            counterpart,
            refNo,
            date,
            notes,
        } = req.body;

        if (!direction || !amount || !accountType) {
            return res.status(400).json({ success: false, error: 'direction, amount ve accountType zorunludur' });
        }

        const meta = await getTenantMeta(tenantId);
        if (!Array.isArray(meta.kasaEntries)) meta.kasaEntries = [];

        const entry = {
            id: genId(),
            source: 'MANUAL',
            direction,
            amount: Number(amount),
            currency: currency || 'TRY',
            accountType,
            accountCurrency: accountCurrency || currency || 'TRY',
            description: description || '',
            category: category || 'GENERAL',
            counterpart: counterpart || '',
            refNo: refNo || '',
            date: date ? new Date(date).toISOString() : new Date().toISOString(),
            notes: notes || '',
            createdBy: userId,
            createdAt: new Date().toISOString(),
        };

        meta.kasaEntries.push(entry);
        await saveTenantMeta(tenantId, meta);

        res.status(201).json({ success: true, data: entry });
    } catch (e) {
        console.error('Kasa entry create error:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// ────────────────────────────────────────────────────────────────────────────
// PUT /api/kasa/entries/:id
// Update a manual entry
// ────────────────────────────────────────────────────────────────────────────
router.put('/entries/:id', authMiddleware, async (req, res) => {
    try {
        const { tenantId } = req.user;
        const meta = await getTenantMeta(tenantId);
        const idx = (meta.kasaEntries || []).findIndex(e => e.id === req.params.id);
        if (idx === -1) return res.status(404).json({ success: false, error: 'Kayıt bulunamadı' });

        meta.kasaEntries[idx] = { ...meta.kasaEntries[idx], ...req.body, updatedAt: new Date().toISOString() };
        await saveTenantMeta(tenantId, meta);
        res.json({ success: true, data: meta.kasaEntries[idx] });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ────────────────────────────────────────────────────────────────────────────
// DELETE /api/kasa/entries/:id
// ────────────────────────────────────────────────────────────────────────────
router.delete('/entries/:id', authMiddleware, async (req, res) => {
    try {
        const { tenantId } = req.user;
        const meta = await getTenantMeta(tenantId);
        
        const entryToDelete = (meta.kasaEntries || []).find(e => e.id === req.params.id);
        if (!entryToDelete) {
            return res.status(404).json({ success: false, error: 'Kayıt bulunamadı' });
        }

        meta.kasaEntries = meta.kasaEntries.filter(e => e.id !== req.params.id);
        await saveTenantMeta(tenantId, meta);

        // Custom Auditing for Financial Deletions
        const { logActivity } = require('../utils/logger');
        const dirText = entryToDelete.direction === 'IN' ? 'Gelir' : 'Gider';
        const logMsg = `Kasadan ${entryToDelete.amount} ${entryToDelete.currency} değerinde ${dirText} işlemi silindi. (Açıklama: ${entryToDelete.description || 'Yok'})`;
        
        await logActivity({
            tenantId,
            userId: req.user.id,
            userEmail: req.user.email,
            action: 'DELETE_KASA_ENTRY',
            entityType: 'Kasa',
            entityId: req.params.id,
            details: {
                message: logMsg,
                previousState: entryToDelete // Keep full snapshot for undo functionality
            },
            ipAddress: req.headers['x-forwarded-for'] || req.socket?.remoteAddress
        });

        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ────────────────────────────────────────────────────────────────────────────
// GET /api/kasa/accounts
// Returns "drawers": TL_CASH, USD_CASH, EUR_CASH, BANK_TRY, BANK_USD, BANK_EUR, CREDIT_CARD
// Each shows its running balance from all mixed sources
// ────────────────────────────────────────────────────────────────────────────
router.get('/accounts', authMiddleware, async (req, res) => {
    try {
        const { tenantId } = req.user;
        const meta = await getTenantMeta(tenantId);

        let allEntries = [];

        // 1. Manual Kasa Entries
        (meta.kasaEntries || []).forEach(e => {
            allEntries.push({ accountType: e.accountType, direction: e.direction, amount: Number(e.amount || 0) });
        });

        // 2. Bookings (AUTO)
        const bookings = await prisma.booking.findMany({
            where: { tenantId, status: { not: 'CANCELLED' } },
            select: { total: true }
        });
        bookings.forEach(b => {
            allEntries.push({ accountType: 'TL_CASH', direction: 'IN', amount: Number(b.total || 0) });
        });

        // 3. Approved Sales Invoices (AUTO)
        const invoices = (meta.invoices || []).filter(inv => inv.status === 'APPROVED' && inv.invoiceType === 'SALES');
        invoices.forEach(inv => {
            allEntries.push({ accountType: 'TL_CASH', direction: 'IN', amount: Number(inv.grandTotal || 0) });
        });

        // 4. Global Transactions
        const txs = await prisma.transaction.findMany({
            where: {
                tenantId,
                type: { in: ['PAYMENT_RECEIVED', 'PAYMENT_SENT', 'SALARY', 'MANUAL_IN', 'MANUAL_OUT'] }
            }
        });
        txs.forEach(tx => {
            allEntries.push({ accountType: 'TL_CASH', direction: tx.isCredit ? 'IN' : 'OUT', amount: Number(tx.amount || 0) });
        });

        // 4.5. Agency Deposits
        const agDeposits = await prisma.agencyDeposit.findMany({
            where: {
                tenantId,
                status: 'APPROVED'
            },
            select: { amount: true }
        });
        agDeposits.forEach(dep => {
            allEntries.push({ accountType: 'BANK_TRY', direction: 'IN', amount: Number(dep.amount || 0) });
        });

        // 5. Vehicle Tracking Expenses
        const vehicles = await prisma.vehicle.findMany({
            where: { tenantId },
            select: { metadata: true }
        });
        vehicles.forEach(v => {
            const tr = v.metadata?.tracking || {};
            (tr.fuel || []).forEach(f => allEntries.push({ accountType: 'TL_CASH', direction: 'OUT', amount: Number(f.totalCost || 0) }));
            (tr.maintenance || []).forEach(m => allEntries.push({ accountType: 'TL_CASH', direction: 'OUT', amount: Number(m.cost || 0) }));
            (tr.insurance || []).forEach(i => allEntries.push({ accountType: 'TL_CASH', direction: 'OUT', amount: Number(i.cost || 0) }));
            (tr.inspection || []).forEach(i => allEntries.push({ accountType: 'TL_CASH', direction: 'OUT', amount: Number(i.cost || 0) }));
        });

        const accounts = {
            TL_CASH: { label: 'TL Kasa', currency: 'TRY', icon: '💵', balance: 0, in: 0, out: 0 },
            USD_CASH: { label: 'Dolar Kasa', currency: 'USD', icon: '🇺🇸', balance: 0, in: 0, out: 0 },
            EUR_CASH: { label: 'Euro Kasa', currency: 'EUR', icon: '🇪🇺', balance: 0, in: 0, out: 0 },
            GBP_CASH: { label: 'Sterlin Kasa', currency: 'GBP', icon: '🇬🇧', balance: 0, in: 0, out: 0 },
            BANK_TRY: { label: 'Banka TL', currency: 'TRY', icon: '🏦', balance: 0, in: 0, out: 0 },
            BANK_USD: { label: 'Banka Dolar', currency: 'USD', icon: '🏦', balance: 0, in: 0, out: 0 },
            BANK_EUR: { label: 'Banka Euro', currency: 'EUR', icon: '🏦', balance: 0, in: 0, out: 0 },
            CREDIT_CARD: { label: 'Kredi Kartı', currency: 'TRY', icon: '💳', balance: 0, in: 0, out: 0 },
        };

        allEntries.forEach(e => {
            const acc = accounts[e.accountType];
            if (!acc) return;
            if (e.direction === 'IN') {
                acc.in += e.amount;
                acc.balance += e.amount;
            } else {
                acc.out += e.amount;
                acc.balance -= e.amount;
            }
        });

        res.json({ success: true, data: accounts });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

module.exports = router;
