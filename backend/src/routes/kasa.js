// backend/src/routes/kasa.js
// Kasa (Cash Register) — aggregates all income/expense from every source

const express = require('express');

const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
const prisma = require('../lib/prisma');

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

/* ─── Legacy key mapping ─────────────────────── */
const LEGACY_KEY_MAP = {
    'TL_CASH': 'CASH_TRY',
    'USD_CASH': 'CASH_USD',
    'EUR_CASH': 'CASH_EUR',
    'GBP_CASH': 'CASH_GBP',
};

function normAccountType(key) {
    return LEGACY_KEY_MAP[key] || key;
}

/* ─── Dynamic account types builder ──────────── */
// Well-known currency icons — any unknown currency gets a generic 💰 icon
const KNOWN_ICONS = { TRY: '💵', USD: '🇺🇸', EUR: '🇪🇺', GBP: '🇬🇧', CHF: '🇨🇭', JPY: '🇯🇵', RUB: '🇷🇺', AED: '🇦🇪', SAR: '🇸🇦', NOK: '🇳🇴', SEK: '🇸🇪', DKK: '🇩🇰', CAD: '🇨🇦', AUD: '🇦🇺' };
function getCashIcon(code) { return KNOWN_ICONS[code] || '💰'; }

// Dynamic color palette — assigned by index for unknown currencies
const CASH_COLOR_PALETTE = ['#16a34a', '#2563eb', '#7c3aed', '#0891b2', '#d97706', '#dc2626', '#059669', '#b45309', '#6366f1', '#9333ea'];
function getCashColor(code, idx) {
    const known = { TRY: '#16a34a', USD: '#2563eb', EUR: '#7c3aed', GBP: '#0891b2' };
    return known[code] || CASH_COLOR_PALETTE[idx % CASH_COLOR_PALETTE.length];
}
const BANK_COLORS = ['#d97706', '#dc2626', '#9333ea', '#0891b2', '#6366f1', '#059669', '#0d9488', '#b45309'];

async function buildDynamicAccountTypes(tenantId) {
    // 1. Get currencies from tenant settings
    const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { settings: true }
    });
    const defs = tenant?.settings?.definitions || {};
    const currencies = defs.currencies || [];

    // 2. Get banks with their accounts
    const banks = await prisma.bank.findMany({
        where: { tenantId },
        include: { accounts: true },
        orderBy: { createdAt: 'asc' }
    });

    const accountTypes = [];

    // Cash registers — one per defined currency (fully dynamic)
    currencies.forEach((cur, idx) => {
        accountTypes.push({
            value: `CASH_${cur.code}`,
            label: `${cur.code} Kasa`,
            currency: cur.code,
            symbol: cur.symbol || cur.code,
            icon: getCashIcon(cur.code),
            color: getCashColor(cur.code, idx),
            type: 'cash'
        });
    });

    // Bank accounts — one per bank account
    let bankColorIdx = 0;
    banks.forEach(bank => {
        (bank.accounts || []).forEach(acc => {
            accountTypes.push({
                value: `BANK_${acc.id}`,
                label: `${bank.name} ${acc.accountName}`,
                currency: acc.currency || 'TRY',
                icon: '🏦',
                color: BANK_COLORS[bankColorIdx % BANK_COLORS.length],
                type: 'bank',
                bankId: bank.id,
                bankAccountId: acc.id
            });
            bankColorIdx++;
        });
    });

    return accountTypes;
}

/* Build a legacy→dynamic mapping for a tenant (for auto-entries using BANK_TRY etc.) */
async function buildLegacyBankMapping(tenantId) {
    const banks = await prisma.bank.findMany({
        where: { tenantId },
        include: { accounts: true },
        orderBy: { createdAt: 'asc' }
    });

    const map = {}; // e.g. { BANK_TRY: 'BANK_<uuid>', BANK_USD: 'BANK_<uuid>' }
    const allAccounts = [];
    banks.forEach(b => (b.accounts || []).forEach(a => allAccounts.push(a)));

    // Map old BANK_<CUR> keys to first matching bank account
    ['TRY', 'USD', 'EUR', 'GBP'].forEach(cur => {
        const acc = allAccounts.find(a => (a.currency || 'TRY') === cur);
        if (acc) map[`BANK_${cur}`] = `BANK_${acc.id}`;
    });

    // CREDIT_CARD → first bank account tagged as credit card (by name containing 'kredi' or 'credit'), or first TRY bank account
    const ccAcc = allAccounts.find(a => (a.accountName || '').toLowerCase().includes('kredi') || (a.accountName || '').toLowerCase().includes('credit'));
    if (ccAcc) map['CREDIT_CARD'] = `BANK_${ccAcc.id}`;
    else if (allAccounts.length > 0) map['CREDIT_CARD'] = `BANK_${allAccounts[0].id}`;

    return map;
}

/* Resolve any entry's accountType into a dynamic key */
function resolveAccountType(key, legacyBankMap) {
    // 1. Direct legacy cash mapping
    if (LEGACY_KEY_MAP[key]) return LEGACY_KEY_MAP[key];
    // 2. Legacy bank mapping
    if (legacyBankMap && legacyBankMap[key]) return legacyBankMap[key];
    // 3. Already a dynamic key
    return key;
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
        
        // Get dynamic types and mappings for converting legacy keys
        const dynamicTypes = await buildDynamicAccountTypes(tenantId);
        const legacyBankMap = await buildLegacyBankMapping(tenantId);
        
        // Get default currency
        const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } });
        const defs = tenant?.settings?.definitions || {};
        const defCurrencies = defs.currencies || [];
        const defaultCur = (defCurrencies.find(c => c.isDefault) || defCurrencies[0])?.code || 'TRY';

        // 1. Manual Kasa Entries (resolve legacy keys)
        let rows = (meta.kasaEntries || [])
            .filter(e => {
                const d = new Date(e.date);
                return d >= dateFrom && d <= dateTo;
            })
            .map(e => ({ 
                ...e, 
                source: 'MANUAL',
                accountType: resolveAccountType(e.accountType || `CASH_${defaultCur}`, legacyBankMap)
            }));

        // 2. Bookings (AUTO) → Dynamic: CASH_<currency>
        const bookings = await prisma.booking.findMany({
            where: { tenantId, createdAt: { gte: dateFrom, lte: dateTo }, status: { not: 'CANCELLED' } },
            select: { id: true, bookingNumber: true, total: true, currency: true, paymentStatus: true, contactName: true, createdAt: true, metadata: true }
        });
        bookings.forEach(b => {
            const cur = b.currency || defaultCur;
            rows.push({
                id: `booking-${b.id}`,
                source: 'BOOKING',
                direction: 'IN',
                date: b.createdAt.toISOString(),
                amount: Number(b.total || 0),
                currency: cur,
                accountType: `CASH_${cur}`,
                accountCurrency: cur,
                description: `Transfer Rezervasyonu: ${b.bookingNumber}`,
                category: 'DIRECT_SALE',
                counterpart: b.contactName,
                refNo: b.bookingNumber,
                paymentStatus: b.paymentStatus,
                readonly: true,
            });
        });

        // 3. Approved Sales Invoices (AUTO) → Dynamic: CASH_<currency>
        const invoices = (meta.invoices || [])
            .filter(inv => {
                const d = new Date(inv.invoiceDate || inv.createdAt);
                return inv.status === 'APPROVED' && inv.invoiceType === 'SALES' && d >= dateFrom && d <= dateTo;
            });
        invoices.forEach(inv => {
            const cur = inv.currency || defaultCur;
            rows.push({
                id: `invoice-${inv.id}`,
                source: 'INVOICE',
                direction: 'IN',
                date: inv.invoiceDate || inv.createdAt,
                amount: Number(inv.grandTotal || 0),
                currency: cur,
                accountType: `CASH_${cur}`,
                accountCurrency: cur,
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
                
                const cur = tx.currency || defaultCur;
                rows.push({
                    id: `tx-${tx.id}`,
                    source,
                    direction: tx.isCredit ? 'IN' : 'OUT',
                    date: tx.date,
                    amount: Number(tx.amount || 0),
                    currency: cur,
                    accountType: `CASH_${cur}`,
                    accountCurrency: cur,
                    description: tx.description || 'Cari Hesap İşlemi',
                    category: tx.type === 'SALARY' ? 'Maaş/Avans' : 'Tahsilat/Tediye',
                    counterpart: counterpart,
                    refNo: tx.referenceId || '',
                    readonly: true,
                });
            });
        } catch (_) { }

        // 4.5. Agency Deposits (AUTO) → Dynamic: find bank account matching currency, fallback to cash
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
                const cur = dep.currency || defaultCur;
                // Try to find a bank account for this currency
                const bankAcc = dynamicTypes.find(t => t.type === 'bank' && t.currency === cur);
                rows.push({
                    id: `ag-dep-${dep.id}`,
                    source: 'AGENCY',
                    direction: 'IN',
                    date: dep.updatedAt || dep.createdAt,
                    amount: Number(dep.amount || 0),
                    currency: cur,
                    accountType: bankAcc ? bankAcc.value : `CASH_${cur}`,
                    accountCurrency: cur,
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

                // Fuel → Default cash
                (tr.fuel || []).filter(f => {
                    const d = new Date(f.date); return d >= dateFrom && d <= dateTo;
                }).forEach(f => {
                    rows.push({
                        id: `v-fuel-${f.id}`, source: 'MANUAL', direction: 'OUT',
                        date: f.date, amount: Number(f.totalCost || 0), currency: defaultCur,
                        accountType: `CASH_${defaultCur}`, accountCurrency: defaultCur,
                        description: `Yakıt Alımı (${f.liters}L) - ${f.station || ''}`, category: 'Yakıt',
                        counterpart: vName, readonly: true
                    });
                });

                // Maintenance → Default cash
                (tr.maintenance || []).filter(m => {
                    const d = new Date(m.date); return d >= dateFrom && d <= dateTo;
                }).forEach(m => {
                    rows.push({
                        id: `v-maint-${m.id}`, source: 'MANUAL', direction: 'OUT',
                        date: m.date, amount: Number(m.cost || 0), currency: defaultCur,
                        accountType: `CASH_${defaultCur}`, accountCurrency: defaultCur,
                        description: `Araç Bakım/Onarım: ${m.type || m.description || ''}`, category: 'Bakım-Onarım',
                        counterpart: vName, readonly: true
                    });
                });

                // Insurance → Default cash
                (tr.insurance || []).filter(i => {
                    const d = new Date(i.startDate); return d >= dateFrom && d <= dateTo;
                }).forEach(i => {
                    rows.push({
                        id: `v-ins-${i.id}`, source: 'MANUAL', direction: 'OUT',
                        date: i.startDate, amount: Number(i.cost || 0), currency: defaultCur,
                        accountType: `CASH_${defaultCur}`, accountCurrency: defaultCur,
                        description: `Araç Sigortası/Kasko: ${i.company || ''}`, category: 'Vergi/Sigorta',
                        counterpart: vName, readonly: true
                    });
                });

                // Inspection → Default cash
                (tr.inspection || []).filter(i => {
                    const d = new Date(i.date); return d >= dateFrom && d <= dateTo;
                }).forEach(i => {
                    rows.push({
                        id: `v-insp-${i.id}`, source: 'MANUAL', direction: 'OUT',
                        date: i.date, amount: Number(i.cost || 0), currency: defaultCur,
                        accountType: `CASH_${defaultCur}`, accountCurrency: defaultCur,
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

        // Calculate running totals — per currency
        let totalIn = rows.filter(r => r.direction === 'IN').reduce((s, r) => s + r.amount, 0);
        let totalOut = rows.filter(r => r.direction === 'OUT').reduce((s, r) => s + r.amount, 0);

        // Per-currency breakdown
        const byCurrency = {};
        rows.forEach(r => {
            const cur = r.currency || defaultCur;
            if (!byCurrency[cur]) byCurrency[cur] = { in: 0, out: 0, net: 0 };
            if (r.direction === 'IN') byCurrency[cur].in += r.amount;
            else byCurrency[cur].out += r.amount;
            byCurrency[cur].net = byCurrency[cur].in - byCurrency[cur].out;
        });

        res.json({
            success: true,
            data: {
                entries: paginated,
                pagination: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / Number(limit)) },
                totals: { in: totalIn, out: totalOut, net: totalIn - totalOut },
                totalsByCurrency: byCurrency
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
// GET /api/kasa/account-types
// Returns dynamically built account types from currencies + bank accounts
// ────────────────────────────────────────────────────────────────────────────
router.get('/account-types', authMiddleware, async (req, res) => {
    try {
        const types = await buildDynamicAccountTypes(req.user.tenantId);
        res.json({ success: true, data: types });
    } catch (e) {
        console.error('Account types error:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// ────────────────────────────────────────────────────────────────────────────
// GET /api/kasa/accounts
// Returns dynamic "drawers" built from tenant currencies + bank accounts
// Each shows its running balance from all mixed sources
// ────────────────────────────────────────────────────────────────────────────
router.get('/accounts', authMiddleware, async (req, res) => {
    try {
        const { tenantId } = req.user;
        const meta = await getTenantMeta(tenantId);

        // Build dynamic account types
        const dynamicTypes = await buildDynamicAccountTypes(tenantId);
        const legacyBankMap = await buildLegacyBankMapping(tenantId);

        // Get default currency from tenant settings
        const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } });
        const defs = tenant?.settings?.definitions || {};
        const defCurrencies = defs.currencies || [];
        const defaultCur = (defCurrencies.find(c => c.isDefault) || defCurrencies[0])?.code || 'TRY';

        // Initialize accounts from dynamic types
        const accounts = {};
        dynamicTypes.forEach(t => {
            accounts[t.value] = { label: t.label, currency: t.currency, icon: t.icon, color: t.color, type: t.type, balance: 0, in: 0, out: 0 };
        });

        let allEntries = [];

        // 1. Manual Kasa Entries (resolve legacy keys)
        (meta.kasaEntries || []).forEach(e => {
            const resolved = resolveAccountType(e.accountType || 'CASH_' + defaultCur, legacyBankMap);
            allEntries.push({ accountType: resolved, direction: e.direction, amount: Number(e.amount || 0) });
        });

        // 2. Bookings (AUTO) → goes to CASH_<booking.currency>
        const bookings = await prisma.booking.findMany({
            where: { tenantId, status: { not: 'CANCELLED' } },
            select: { total: true, currency: true }
        });
        bookings.forEach(b => {
            const cur = b.currency || defaultCur;
            allEntries.push({ accountType: `CASH_${cur}`, direction: 'IN', amount: Number(b.total || 0) });
        });

        // 3. Approved Sales Invoices (AUTO)
        const invoices = (meta.invoices || []).filter(inv => inv.status === 'APPROVED' && inv.invoiceType === 'SALES');
        invoices.forEach(inv => {
            const cur = inv.currency || defaultCur;
            allEntries.push({ accountType: `CASH_${cur}`, direction: 'IN', amount: Number(inv.grandTotal || 0) });
        });

        // 4. Global Transactions
        const txs = await prisma.transaction.findMany({
            where: {
                tenantId,
                type: { in: ['PAYMENT_RECEIVED', 'PAYMENT_SENT', 'SALARY', 'MANUAL_IN', 'MANUAL_OUT'] }
            }
        });
        txs.forEach(tx => {
            const cur = tx.currency || defaultCur;
            allEntries.push({ accountType: `CASH_${cur}`, direction: tx.isCredit ? 'IN' : 'OUT', amount: Number(tx.amount || 0) });
        });

        // 4.5. Agency Deposits → first bank account matching currency, or cash
        const agDeposits = await prisma.agencyDeposit.findMany({
            where: { tenantId, status: 'APPROVED' },
            select: { amount: true, currency: true }
        });
        agDeposits.forEach(dep => {
            const cur = dep.currency || defaultCur;
            // Try to find a bank account for this currency
            const bankAcc = dynamicTypes.find(t => t.type === 'bank' && t.currency === cur);
            allEntries.push({ accountType: bankAcc ? bankAcc.value : `CASH_${cur}`, direction: 'IN', amount: Number(dep.amount || 0) });
        });

        // 5. Vehicle Tracking Expenses → default cash
        const vehicles = await prisma.vehicle.findMany({
            where: { tenantId },
            select: { metadata: true }
        });
        vehicles.forEach(v => {
            const tr = v.metadata?.tracking || {};
            (tr.fuel || []).forEach(f => allEntries.push({ accountType: `CASH_${defaultCur}`, direction: 'OUT', amount: Number(f.totalCost || 0) }));
            (tr.maintenance || []).forEach(m => allEntries.push({ accountType: `CASH_${defaultCur}`, direction: 'OUT', amount: Number(m.cost || 0) }));
            (tr.insurance || []).forEach(i => allEntries.push({ accountType: `CASH_${defaultCur}`, direction: 'OUT', amount: Number(i.cost || 0) }));
            (tr.inspection || []).forEach(i => allEntries.push({ accountType: `CASH_${defaultCur}`, direction: 'OUT', amount: Number(i.cost || 0) }));
        });

        // Aggregate
        allEntries.forEach(e => {
            const acc = accounts[e.accountType];
            if (!acc) return; // unknown account type, skip
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
        console.error('Kasa accounts error:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

module.exports = router;
