/**
 * Partner Accounting Module
 * ─────────────────────────────────────────────────────────────────
 * Full-featured commercial accounting endpoints scoped to a single
 * partner under a single tenant.
 *
 * Strict isolation: every query must filter by BOTH
 *   { tenantId: req.user.tenantId, partnerId: req.user.id }
 * No cross-partner reads or writes are possible.
 */

const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const { authMiddleware } = require('../middleware/auth');

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

function ensurePartner(req, res) {
    if (req.user?.roleType !== 'PARTNER') {
        res.status(403).json({ success: false, error: 'Yalnızca partner kullanıcılar erişebilir' });
        return null;
    }
    const tenantId = req.tenant?.id || req.user.tenantId;
    const partnerId = req.user.id;
    if (!tenantId || !partnerId) {
        res.status(400).json({ success: false, error: 'Geçersiz oturum' });
        return null;
    }
    return { tenantId, partnerId };
}

function toNum(v, fallback = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
}

function round2(v) {
    return Math.round(toNum(v) * 100) / 100;
}

function recalcInvoiceTotals(items) {
    let subtotal = 0;
    let discountTotal = 0;
    let taxTotal = 0;
    let withholdingTotal = 0;
    let grandTotal = 0;

    const normalized = items.map((it, idx) => {
        const quantity = toNum(it.quantity, 1);
        const unitPrice = toNum(it.unitPrice, 0);
        const discountRate = toNum(it.discountRate, 0);
        const taxRate = toNum(it.taxRate, 20);
        const withholdingRate = toNum(it.withholdingRate, 0);

        const sub = round2(quantity * unitPrice);
        const discount = round2(sub * (discountRate / 100));
        const taxBase = round2(sub - discount);
        const taxAmount = round2(taxBase * (taxRate / 100));
        const withholding = round2(taxAmount * (withholdingRate / 100));
        const total = round2(taxBase + taxAmount - withholding);

        subtotal += sub;
        discountTotal += discount;
        taxTotal += taxAmount;
        withholdingTotal += withholding;
        grandTotal += total;

        return {
            lineNo: it.lineNo ?? idx + 1,
            description: it.description || '-',
            quantity,
            unit: it.unit || 'ADET',
            unitPrice,
            discountRate,
            taxRate,
            withholdingRate,
            subtotal: sub,
            discount,
            taxBase,
            taxAmount,
            withholding,
            total,
            gtipCode: it.gtipCode || null,
            productCode: it.productCode || null,
            metadata: it.metadata || null,
        };
    });

    return {
        items: normalized,
        totals: {
            subtotal: round2(subtotal),
            discountTotal: round2(discountTotal),
            taxTotal: round2(taxTotal),
            withholdingTotal: round2(withholdingTotal),
            grandTotal: round2(grandTotal),
        },
    };
}

async function recalcAccountBalance(tx, accountId) {
    const account = await tx.partnerAccount.findUnique({ where: { id: accountId } });
    if (!account) return;
    const agg = await tx.partnerLedgerEntry.aggregate({
        where: { accountId },
        _sum: { amount: true },
    });
    // Compute debit / credit separately
    const debitAgg = await tx.partnerLedgerEntry.aggregate({
        where: { accountId, isCredit: false },
        _sum: { amount: true },
    });
    const creditAgg = await tx.partnerLedgerEntry.aggregate({
        where: { accountId, isCredit: true },
        _sum: { amount: true },
    });
    const debit = Number(debitAgg._sum.amount || 0);
    const credit = Number(creditAgg._sum.amount || 0);
    await tx.partnerAccount.update({
        where: { id: accountId },
        data: { debit, credit, balance: round2(debit - credit) },
    });
}

async function ensureLinkedAccount(tx, scope, employee) {
    if (employee.linkedAccountId) {
        const acc = await tx.partnerAccount.findFirst({
            where: { id: employee.linkedAccountId, tenantId: scope.tenantId, partnerId: scope.partnerId },
        });
        if (acc) return acc;
    }
    const code = `EMP-${employee.id.substring(0, 6).toUpperCase()}`;
    const acc = await tx.partnerAccount.create({
        data: {
            tenantId: scope.tenantId,
            partnerId: scope.partnerId,
            code,
            name: `${employee.firstName} ${employee.lastName}`,
            type: 'EMPLOYEE',
            currency: employee.salaryCurrency || 'TRY',
            phone: employee.phone || null,
            email: employee.email || null,
            identityNo: employee.identityNo || null,
            isCompany: false,
            linkedUserId: employee.userId || null,
        },
    });
    await tx.partnerEmployee.update({ where: { id: employee.id }, data: { linkedAccountId: acc.id } });
    return acc;
}

// ─────────────────────────────────────────────────────────────────
// DASHBOARD — Genel Durum
// ─────────────────────────────────────────────────────────────────
router.get('/dashboard', authMiddleware, async (req, res) => {
    const scope = ensurePartner(req, res);
    if (!scope) return;
    try {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const startOfYear = new Date(now.getFullYear(), 0, 1);

        const [
            accountsCount,
            receivable,
            payable,
            invoiceTotalsMonth,
            cashInMonth,
            cashOutMonth,
            recentInvoices,
            recentLedger,
            overdueInvoices,
            unpaidPayrollSum,
        ] = await Promise.all([
            prisma.partnerAccount.count({ where: { tenantId: scope.tenantId, partnerId: scope.partnerId, isActive: true } }),
            prisma.partnerAccount.aggregate({
                where: { tenantId: scope.tenantId, partnerId: scope.partnerId, balance: { gt: 0 } },
                _sum: { balance: true },
            }),
            prisma.partnerAccount.aggregate({
                where: { tenantId: scope.tenantId, partnerId: scope.partnerId, balance: { lt: 0 } },
                _sum: { balance: true },
            }),
            prisma.partnerInvoice.aggregate({
                where: {
                    tenantId: scope.tenantId, partnerId: scope.partnerId,
                    issueDate: { gte: startOfMonth },
                    status: { in: ['APPROVED', 'SENT', 'ACCEPTED', 'PAID', 'PARTIALLY_PAID'] },
                },
                _sum: { grandTotal: true, paidTotal: true },
                _count: true,
            }),
            prisma.partnerCashEntry.aggregate({
                where: { tenantId: scope.tenantId, partnerId: scope.partnerId, date: { gte: startOfMonth }, direction: 'IN' },
                _sum: { amount: true },
            }),
            prisma.partnerCashEntry.aggregate({
                where: { tenantId: scope.tenantId, partnerId: scope.partnerId, date: { gte: startOfMonth }, direction: 'OUT' },
                _sum: { amount: true },
            }),
            prisma.partnerInvoice.findMany({
                where: { tenantId: scope.tenantId, partnerId: scope.partnerId },
                orderBy: { issueDate: 'desc' },
                take: 10,
                include: { account: { select: { id: true, name: true, code: true } } },
            }),
            prisma.partnerLedgerEntry.findMany({
                where: { tenantId: scope.tenantId, partnerId: scope.partnerId },
                orderBy: { date: 'desc' },
                take: 12,
                include: { account: { select: { id: true, name: true } } },
            }),
            prisma.partnerInvoice.findMany({
                where: {
                    tenantId: scope.tenantId, partnerId: scope.partnerId,
                    status: { in: ['APPROVED', 'SENT', 'ACCEPTED', 'PARTIALLY_PAID'] },
                    dueDate: { lt: now, not: null },
                },
                orderBy: { dueDate: 'asc' },
                take: 10,
                include: { account: { select: { id: true, name: true } } },
            }),
            prisma.partnerPayrollEntry.aggregate({
                where: { tenantId: scope.tenantId, partnerId: scope.partnerId, paid: false },
                _sum: { amount: true },
                _count: true,
            }),
        ]);

        res.json({
            success: true,
            data: {
                kpis: {
                    accountsCount,
                    receivable: Number(receivable._sum.balance || 0),
                    payable: Math.abs(Number(payable._sum.balance || 0)),
                    invoicedMonth: Number(invoiceTotalsMonth._sum.grandTotal || 0),
                    paidMonth: Number(invoiceTotalsMonth._sum.paidTotal || 0),
                    cashIn: Number(cashInMonth._sum.amount || 0),
                    cashOut: Number(cashOutMonth._sum.amount || 0),
                    netCashFlow: Number(cashInMonth._sum.amount || 0) - Number(cashOutMonth._sum.amount || 0),
                    unpaidPayroll: Number(unpaidPayrollSum._sum.amount || 0),
                    unpaidPayrollCount: unpaidPayrollSum._count || 0,
                },
                recentInvoices,
                recentLedger,
                overdueInvoices,
                period: { startOfMonth, startOfYear, now },
            },
        });
    } catch (error) {
        console.error('Partner accounting dashboard error:', error);
        res.status(500).json({ success: false, error: 'Genel durum alınamadı' });
    }
});

// ─────────────────────────────────────────────────────────────────
// ACCOUNTS — Cariler
// ─────────────────────────────────────────────────────────────────
router.get('/accounts', authMiddleware, async (req, res) => {
    const scope = ensurePartner(req, res);
    if (!scope) return;
    try {
        const { search, type, isActive } = req.query;
        const where = { tenantId: scope.tenantId, partnerId: scope.partnerId };
        if (type) where.type = type;
        if (isActive !== undefined) where.isActive = isActive === 'true';
        if (search) {
            where.OR = [
                { name: { contains: String(search), mode: 'insensitive' } },
                { code: { contains: String(search), mode: 'insensitive' } },
                { taxNumber: { contains: String(search) } },
                { phone: { contains: String(search) } },
            ];
        }
        const data = await prisma.partnerAccount.findMany({
            where,
            orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
        });
        res.json({ success: true, data });
    } catch (error) {
        console.error('Partner accounts list error:', error);
        res.status(500).json({ success: false, error: 'Cariler alınamadı' });
    }
});

router.post('/accounts', authMiddleware, async (req, res) => {
    const scope = ensurePartner(req, res);
    if (!scope) return;
    try {
        const b = req.body || {};
        const code = (b.code || '').toString().trim() || `C-${Date.now().toString().slice(-6)}`;
        const account = await prisma.partnerAccount.create({
            data: {
                tenantId: scope.tenantId,
                partnerId: scope.partnerId,
                code,
                name: b.name,
                type: b.type || 'CUSTOMER',
                taxNumber: b.taxNumber || null,
                taxOffice: b.taxOffice || null,
                identityNo: b.identityNo || null,
                isCompany: b.isCompany !== false,
                email: b.email || null,
                phone: b.phone || null,
                address: b.address || null,
                city: b.city || null,
                district: b.district || null,
                country: b.country || 'Türkiye',
                currency: b.currency || 'TRY',
                creditLimit: b.creditLimit ? toNum(b.creditLimit) : null,
                paymentTermDays: b.paymentTermDays ? Number(b.paymentTermDays) : null,
                notes: b.notes || null,
                metadata: b.metadata || null,
            },
        });
        res.json({ success: true, data: account });
    } catch (error) {
        if (error.code === 'P2002') return res.status(400).json({ success: false, error: 'Bu cari kodu zaten kullanılıyor' });
        console.error('Partner account create error:', error);
        res.status(500).json({ success: false, error: 'Cari oluşturulamadı' });
    }
});

router.get('/accounts/:id', authMiddleware, async (req, res) => {
    const scope = ensurePartner(req, res);
    if (!scope) return;
    try {
        const account = await prisma.partnerAccount.findFirst({
            where: { id: req.params.id, tenantId: scope.tenantId, partnerId: scope.partnerId },
        });
        if (!account) return res.status(404).json({ success: false, error: 'Cari bulunamadı' });
        res.json({ success: true, data: account });
    } catch (error) {
        console.error('Partner account detail error:', error);
        res.status(500).json({ success: false, error: 'Cari alınamadı' });
    }
});

router.put('/accounts/:id', authMiddleware, async (req, res) => {
    const scope = ensurePartner(req, res);
    if (!scope) return;
    try {
        const existing = await prisma.partnerAccount.findFirst({
            where: { id: req.params.id, tenantId: scope.tenantId, partnerId: scope.partnerId },
        });
        if (!existing) return res.status(404).json({ success: false, error: 'Cari bulunamadı' });
        const b = req.body || {};
        const data = await prisma.partnerAccount.update({
            where: { id: req.params.id },
            data: {
                name: b.name ?? undefined,
                type: b.type ?? undefined,
                taxNumber: b.taxNumber ?? undefined,
                taxOffice: b.taxOffice ?? undefined,
                identityNo: b.identityNo ?? undefined,
                isCompany: b.isCompany ?? undefined,
                email: b.email ?? undefined,
                phone: b.phone ?? undefined,
                address: b.address ?? undefined,
                city: b.city ?? undefined,
                district: b.district ?? undefined,
                country: b.country ?? undefined,
                currency: b.currency ?? undefined,
                creditLimit: b.creditLimit !== undefined ? toNum(b.creditLimit) : undefined,
                paymentTermDays: b.paymentTermDays !== undefined ? Number(b.paymentTermDays) : undefined,
                notes: b.notes ?? undefined,
                isActive: b.isActive ?? undefined,
            },
        });
        res.json({ success: true, data });
    } catch (error) {
        console.error('Partner account update error:', error);
        res.status(500).json({ success: false, error: 'Cari güncellenemedi' });
    }
});

router.delete('/accounts/:id', authMiddleware, async (req, res) => {
    const scope = ensurePartner(req, res);
    if (!scope) return;
    try {
        const existing = await prisma.partnerAccount.findFirst({
            where: { id: req.params.id, tenantId: scope.tenantId, partnerId: scope.partnerId },
        });
        if (!existing) return res.status(404).json({ success: false, error: 'Cari bulunamadı' });
        // Hard delete only if no ledger entries; otherwise mark passive
        const hasEntries = await prisma.partnerLedgerEntry.count({ where: { accountId: existing.id } });
        if (hasEntries > 0) {
            await prisma.partnerAccount.update({ where: { id: existing.id }, data: { isActive: false } });
            return res.json({ success: true, archived: true });
        }
        await prisma.partnerAccount.delete({ where: { id: existing.id } });
        res.json({ success: true, deleted: true });
    } catch (error) {
        console.error('Partner account delete error:', error);
        res.status(500).json({ success: false, error: 'Cari silinemedi' });
    }
});

router.get('/accounts/:id/statement', authMiddleware, async (req, res) => {
    const scope = ensurePartner(req, res);
    if (!scope) return;
    try {
        const account = await prisma.partnerAccount.findFirst({
            where: { id: req.params.id, tenantId: scope.tenantId, partnerId: scope.partnerId },
        });
        if (!account) return res.status(404).json({ success: false, error: 'Cari bulunamadı' });
        const { from, to } = req.query;
        const where = { accountId: account.id };
        if (from || to) where.date = {};
        if (from) where.date.gte = new Date(String(from));
        if (to) where.date.lte = new Date(String(to));
        const entries = await prisma.partnerLedgerEntry.findMany({ where, orderBy: { date: 'asc' } });
        let running = 0;
        const rows = entries.map((e) => {
            running += e.isCredit ? -Number(e.amount) : Number(e.amount);
            return { ...e, runningBalance: round2(running) };
        });
        res.json({ success: true, data: { account, entries: rows, totals: { debit: Number(account.debit), credit: Number(account.credit), balance: Number(account.balance) } } });
    } catch (error) {
        console.error('Partner statement error:', error);
        res.status(500).json({ success: false, error: 'Ekstre alınamadı' });
    }
});

router.post('/accounts/:id/transactions', authMiddleware, async (req, res) => {
    const scope = ensurePartner(req, res);
    if (!scope) return;
    try {
        const account = await prisma.partnerAccount.findFirst({
            where: { id: req.params.id, tenantId: scope.tenantId, partnerId: scope.partnerId },
        });
        if (!account) return res.status(404).json({ success: false, error: 'Cari bulunamadı' });
        const b = req.body || {};
        const amount = toNum(b.amount);
        if (!(amount > 0)) return res.status(400).json({ success: false, error: 'Tutar > 0 olmalı' });

        const created = await prisma.$transaction(async (tx) => {
            const entry = await tx.partnerLedgerEntry.create({
                data: {
                    tenantId: scope.tenantId,
                    partnerId: scope.partnerId,
                    accountId: account.id,
                    date: b.date ? new Date(b.date) : new Date(),
                    source: b.source || 'MANUAL',
                    refType: b.refType || null,
                    refId: b.refId || null,
                    description: b.description || null,
                    isCredit: !!b.isCredit,
                    amount,
                    currency: b.currency || account.currency || 'TRY',
                    paymentMethod: b.paymentMethod || null,
                    documentNo: b.documentNo || null,
                    notes: b.notes || null,
                    metadata: b.metadata || null,
                    createdById: scope.partnerId,
                },
            });
            await recalcAccountBalance(tx, account.id);
            return entry;
        });
        res.json({ success: true, data: created });
    } catch (error) {
        console.error('Partner statement entry error:', error);
        res.status(500).json({ success: false, error: 'Hareket eklenemedi' });
    }
});

router.delete('/transactions/:id', authMiddleware, async (req, res) => {
    const scope = ensurePartner(req, res);
    if (!scope) return;
    try {
        const entry = await prisma.partnerLedgerEntry.findFirst({
            where: { id: req.params.id, tenantId: scope.tenantId, partnerId: scope.partnerId },
        });
        if (!entry) return res.status(404).json({ success: false, error: 'Hareket bulunamadı' });
        await prisma.$transaction(async (tx) => {
            await tx.partnerLedgerEntry.delete({ where: { id: entry.id } });
            await recalcAccountBalance(tx, entry.accountId);
        });
        res.json({ success: true });
    } catch (error) {
        console.error('Partner statement delete error:', error);
        res.status(500).json({ success: false, error: 'Hareket silinemedi' });
    }
});

// ─────────────────────────────────────────────────────────────────
// INVOICES — Faturalar (e-Fatura uyumlu alanlar)
// ─────────────────────────────────────────────────────────────────
async function nextInvoiceNo(scope, type) {
    const last = await prisma.partnerInvoice.findFirst({
        where: { tenantId: scope.tenantId, partnerId: scope.partnerId, type },
        orderBy: { createdAt: 'desc' },
    });
    const prefixMap = { SALES: 'STR', PURCHASE: 'ALR', EXPENSE: 'MSR', RETURN_SALES: 'STI', RETURN_PURCHASE: 'ALI' };
    const prefix = prefixMap[type] || 'INV';
    let next = 1;
    if (last?.invoiceNo) {
        const m = last.invoiceNo.match(/(\d+)$/);
        if (m) next = parseInt(m[1], 10) + 1;
    }
    const yyyy = new Date().getFullYear();
    return `${prefix}${yyyy}${String(next).padStart(6, '0')}`;
}

router.get('/invoices/next-no/:type', authMiddleware, async (req, res) => {
    const scope = ensurePartner(req, res);
    if (!scope) return;
    try {
        const no = await nextInvoiceNo(scope, req.params.type);
        res.json({ success: true, data: { invoiceNo: no } });
    } catch (error) {
        console.error('Next invoice no error:', error);
        res.status(500).json({ success: false, error: 'Fatura no üretilemedi' });
    }
});

router.get('/invoices', authMiddleware, async (req, res) => {
    const scope = ensurePartner(req, res);
    if (!scope) return;
    try {
        const { search, type, status, kind, accountId, from, to } = req.query;
        const where = { tenantId: scope.tenantId, partnerId: scope.partnerId };
        if (type) where.type = type;
        if (status) where.status = status;
        if (kind) where.kind = kind;
        if (accountId) where.accountId = String(accountId);
        if (from || to) where.issueDate = {};
        if (from) where.issueDate.gte = new Date(String(from));
        if (to) where.issueDate.lte = new Date(String(to));
        if (search) {
            where.OR = [
                { invoiceNo: { contains: String(search), mode: 'insensitive' } },
                { counterpartyName: { contains: String(search), mode: 'insensitive' } },
                { counterpartyTaxNumber: { contains: String(search) } },
            ];
        }
        const invoices = await prisma.partnerInvoice.findMany({
            where,
            orderBy: { issueDate: 'desc' },
            include: { account: { select: { id: true, name: true, code: true } }, items: true },
        });
        res.json({ success: true, data: invoices });
    } catch (error) {
        console.error('Partner invoices list error:', error);
        res.status(500).json({ success: false, error: 'Faturalar alınamadı' });
    }
});

router.get('/invoices/:id', authMiddleware, async (req, res) => {
    const scope = ensurePartner(req, res);
    if (!scope) return;
    try {
        const invoice = await prisma.partnerInvoice.findFirst({
            where: { id: req.params.id, tenantId: scope.tenantId, partnerId: scope.partnerId },
            include: { items: { orderBy: { lineNo: 'asc' } }, account: true },
        });
        if (!invoice) return res.status(404).json({ success: false, error: 'Fatura bulunamadı' });
        res.json({ success: true, data: invoice });
    } catch (error) {
        console.error('Partner invoice detail error:', error);
        res.status(500).json({ success: false, error: 'Fatura alınamadı' });
    }
});

router.post('/invoices', authMiddleware, async (req, res) => {
    const scope = ensurePartner(req, res);
    if (!scope) return;
    try {
        const b = req.body || {};
        const type = b.type || 'SALES';
        const invoiceNo = b.invoiceNo || (await nextInvoiceNo(scope, type));
        const items = Array.isArray(b.items) ? b.items : [];
        const { items: normalized, totals } = recalcInvoiceTotals(items);

        let account = null;
        if (b.accountId) {
            account = await prisma.partnerAccount.findFirst({
                where: { id: b.accountId, tenantId: scope.tenantId, partnerId: scope.partnerId },
            });
            if (!account) return res.status(400).json({ success: false, error: 'Cari bulunamadı' });
        }

        const invoice = await prisma.partnerInvoice.create({
            data: {
                tenantId: scope.tenantId,
                partnerId: scope.partnerId,
                invoiceNo,
                serieCode: b.serieCode || null,
                type,
                kind: b.kind || 'STANDARD',
                status: b.status || 'DRAFT',
                accountId: account ? account.id : null,
                counterpartyName: b.counterpartyName || account?.name || null,
                counterpartyTaxNumber: b.counterpartyTaxNumber || account?.taxNumber || null,
                counterpartyTaxOffice: b.counterpartyTaxOffice || account?.taxOffice || null,
                counterpartyAddress: b.counterpartyAddress || account?.address || null,
                counterpartyEmail: b.counterpartyEmail || account?.email || null,
                counterpartyPhone: b.counterpartyPhone || account?.phone || null,
                issueDate: b.issueDate ? new Date(b.issueDate) : new Date(),
                dueDate: b.dueDate ? new Date(b.dueDate) : null,
                scenario: b.scenario || null,
                currency: b.currency || account?.currency || 'TRY',
                fxRate: b.fxRate ? toNum(b.fxRate) : null,
                subtotal: totals.subtotal,
                discountTotal: totals.discountTotal,
                taxTotal: totals.taxTotal,
                withholdingTotal: totals.withholdingTotal,
                grandTotal: totals.grandTotal,
                paidTotal: 0,
                eInvoiceScenario: b.eInvoiceScenario || null,
                eInvoiceProfileId: b.eInvoiceProfileId || null,
                notes: b.notes || null,
                internalNote: b.internalNote || null,
                metadata: b.metadata || null,
                createdById: scope.partnerId,
                items: { create: normalized },
            },
            include: { items: true },
        });

        res.json({ success: true, data: invoice });
    } catch (error) {
        if (error.code === 'P2002') return res.status(400).json({ success: false, error: 'Bu fatura numarası zaten var' });
        console.error('Partner invoice create error:', error);
        res.status(500).json({ success: false, error: 'Fatura oluşturulamadı' });
    }
});

router.put('/invoices/:id', authMiddleware, async (req, res) => {
    const scope = ensurePartner(req, res);
    if (!scope) return;
    try {
        const existing = await prisma.partnerInvoice.findFirst({
            where: { id: req.params.id, tenantId: scope.tenantId, partnerId: scope.partnerId },
        });
        if (!existing) return res.status(404).json({ success: false, error: 'Fatura bulunamadı' });
        if (['PAID', 'CANCELLED', 'ACCEPTED'].includes(existing.status)) {
            return res.status(400).json({ success: false, error: 'Onaylanmış / ödenmiş fatura düzenlenemez' });
        }
        const b = req.body || {};
        const items = Array.isArray(b.items) ? b.items : null;
        const totals = items ? recalcInvoiceTotals(items).totals : null;

        const updated = await prisma.$transaction(async (tx) => {
            if (items) {
                await tx.partnerInvoiceItem.deleteMany({ where: { invoiceId: existing.id } });
                await tx.partnerInvoiceItem.createMany({
                    data: recalcInvoiceTotals(items).items.map((it) => ({ ...it, invoiceId: existing.id })),
                });
            }
            return tx.partnerInvoice.update({
                where: { id: existing.id },
                data: {
                    serieCode: b.serieCode ?? undefined,
                    type: b.type ?? undefined,
                    kind: b.kind ?? undefined,
                    status: b.status ?? undefined,
                    accountId: b.accountId === null ? null : b.accountId ?? undefined,
                    counterpartyName: b.counterpartyName ?? undefined,
                    counterpartyTaxNumber: b.counterpartyTaxNumber ?? undefined,
                    counterpartyTaxOffice: b.counterpartyTaxOffice ?? undefined,
                    counterpartyAddress: b.counterpartyAddress ?? undefined,
                    counterpartyEmail: b.counterpartyEmail ?? undefined,
                    counterpartyPhone: b.counterpartyPhone ?? undefined,
                    issueDate: b.issueDate ? new Date(b.issueDate) : undefined,
                    dueDate: b.dueDate ? new Date(b.dueDate) : undefined,
                    scenario: b.scenario ?? undefined,
                    currency: b.currency ?? undefined,
                    fxRate: b.fxRate !== undefined ? toNum(b.fxRate) : undefined,
                    notes: b.notes ?? undefined,
                    internalNote: b.internalNote ?? undefined,
                    metadata: b.metadata ?? undefined,
                    ...(totals
                        ? {
                              subtotal: totals.subtotal,
                              discountTotal: totals.discountTotal,
                              taxTotal: totals.taxTotal,
                              withholdingTotal: totals.withholdingTotal,
                              grandTotal: totals.grandTotal,
                          }
                        : {}),
                },
                include: { items: true },
            });
        });

        res.json({ success: true, data: updated });
    } catch (error) {
        console.error('Partner invoice update error:', error);
        res.status(500).json({ success: false, error: 'Fatura güncellenemedi' });
    }
});

router.patch('/invoices/:id/status', authMiddleware, async (req, res) => {
    const scope = ensurePartner(req, res);
    if (!scope) return;
    try {
        const existing = await prisma.partnerInvoice.findFirst({
            where: { id: req.params.id, tenantId: scope.tenantId, partnerId: scope.partnerId },
            include: { account: true, items: true },
        });
        if (!existing) return res.status(404).json({ success: false, error: 'Fatura bulunamadı' });
        const { status } = req.body || {};
        const valid = ['DRAFT', 'APPROVED', 'SENT', 'ACCEPTED', 'REJECTED', 'PAID', 'PARTIALLY_PAID', 'CANCELLED'];
        if (!valid.includes(status)) return res.status(400).json({ success: false, error: 'Geçersiz durum' });

        const updated = await prisma.$transaction(async (tx) => {
            const inv = await tx.partnerInvoice.update({
                where: { id: existing.id },
                data: { status, eInvoiceSentAt: status === 'SENT' ? new Date() : existing.eInvoiceSentAt, eInvoiceAcceptedAt: status === 'ACCEPTED' ? new Date() : existing.eInvoiceAcceptedAt, eInvoiceRejectedAt: status === 'REJECTED' ? new Date() : existing.eInvoiceRejectedAt },
            });

            // When moving to APPROVED for first time, post to ledger
            const shouldPost = ['APPROVED', 'SENT', 'ACCEPTED'].includes(status) && !['APPROVED', 'SENT', 'ACCEPTED', 'PAID', 'PARTIALLY_PAID'].includes(existing.status);
            if (shouldPost && existing.accountId) {
                const isSales = ['SALES'].includes(existing.type);
                const isReturnSales = existing.type === 'RETURN_SALES';
                const amount = Number(existing.grandTotal);
                if (amount > 0) {
                    await tx.partnerLedgerEntry.create({
                        data: {
                            tenantId: scope.tenantId,
                            partnerId: scope.partnerId,
                            accountId: existing.accountId,
                            date: existing.issueDate,
                            source: 'INVOICE',
                            refType: 'INVOICE',
                            refId: existing.id,
                            description: `${existing.invoiceNo} · ${existing.type}`,
                            // Sales invoice → cari borçlu (we have receivable) → isCredit=false (borç)
                            // Purchase / expense → cari alacaklı → isCredit=true
                            isCredit: isReturnSales ? true : (existing.type === 'PURCHASE' || existing.type === 'EXPENSE'),
                            amount,
                            currency: existing.currency,
                            documentNo: existing.invoiceNo,
                            createdById: scope.partnerId,
                        },
                    });
                    await recalcAccountBalance(tx, existing.accountId);
                }
            }

            return inv;
        });

        res.json({ success: true, data: updated });
    } catch (error) {
        console.error('Partner invoice status error:', error);
        res.status(500).json({ success: false, error: 'Durum güncellenemedi' });
    }
});

router.delete('/invoices/:id', authMiddleware, async (req, res) => {
    const scope = ensurePartner(req, res);
    if (!scope) return;
    try {
        const existing = await prisma.partnerInvoice.findFirst({
            where: { id: req.params.id, tenantId: scope.tenantId, partnerId: scope.partnerId },
        });
        if (!existing) return res.status(404).json({ success: false, error: 'Fatura bulunamadı' });
        if (existing.status !== 'DRAFT') return res.status(400).json({ success: false, error: 'Sadece taslak faturalar silinebilir' });
        await prisma.partnerInvoice.delete({ where: { id: existing.id } });
        res.json({ success: true });
    } catch (error) {
        console.error('Partner invoice delete error:', error);
        res.status(500).json({ success: false, error: 'Fatura silinemedi' });
    }
});

router.post('/invoices/:id/payment', authMiddleware, async (req, res) => {
    const scope = ensurePartner(req, res);
    if (!scope) return;
    try {
        const inv = await prisma.partnerInvoice.findFirst({
            where: { id: req.params.id, tenantId: scope.tenantId, partnerId: scope.partnerId },
        });
        if (!inv) return res.status(404).json({ success: false, error: 'Fatura bulunamadı' });
        const b = req.body || {};
        const amount = toNum(b.amount);
        if (!(amount > 0)) return res.status(400).json({ success: false, error: 'Tutar > 0 olmalı' });
        const accountKey = b.accountKey || 'CASH_TRY';

        const result = await prisma.$transaction(async (tx) => {
            // Cash IN/OUT entry
            const direction = inv.type === 'SALES' || inv.type === 'RETURN_PURCHASE' ? 'IN' : 'OUT';
            const cash = await tx.partnerCashEntry.create({
                data: {
                    tenantId: scope.tenantId,
                    partnerId: scope.partnerId,
                    accountType: b.accountType || (accountKey.startsWith('BANK_') ? 'BANK' : 'CASH'),
                    accountKey,
                    currency: inv.currency,
                    date: b.date ? new Date(b.date) : new Date(),
                    direction,
                    amount,
                    description: `${inv.invoiceNo} · Ödeme`,
                    invoiceId: inv.id,
                    accountId: inv.accountId,
                    refType: 'INVOICE',
                    refId: inv.id,
                    createdById: scope.partnerId,
                },
            });
            // Ledger reverse on cari (settle)
            if (inv.accountId) {
                await tx.partnerLedgerEntry.create({
                    data: {
                        tenantId: scope.tenantId,
                        partnerId: scope.partnerId,
                        accountId: inv.accountId,
                        date: cash.date,
                        source: 'PAYMENT',
                        refType: 'INVOICE',
                        refId: inv.id,
                        description: `${inv.invoiceNo} · Ödeme`,
                        isCredit: direction === 'IN', // Sales collection → credit cari (close debt)
                        amount,
                        currency: inv.currency,
                        paymentMethod: b.paymentMethod || (accountKey.startsWith('BANK_') ? 'BANK' : 'CASH'),
                        documentNo: inv.invoiceNo,
                        createdById: scope.partnerId,
                    },
                });
                await recalcAccountBalance(tx, inv.accountId);
            }
            const paid = Number(inv.paidTotal) + amount;
            const status = paid >= Number(inv.grandTotal) ? 'PAID' : 'PARTIALLY_PAID';
            const updated = await tx.partnerInvoice.update({
                where: { id: inv.id },
                data: { paidTotal: round2(paid), status },
            });
            return { invoice: updated, cash };
        });

        res.json({ success: true, data: result });
    } catch (error) {
        console.error('Partner invoice payment error:', error);
        res.status(500).json({ success: false, error: 'Ödeme alınamadı' });
    }
});

// ─────────────────────────────────────────────────────────────────
// CASH BOOK — Kasa
// ─────────────────────────────────────────────────────────────────
router.get('/cash/accounts', authMiddleware, async (req, res) => {
    const scope = ensurePartner(req, res);
    if (!scope) return;
    try {
        const entries = await prisma.partnerCashEntry.findMany({
            where: { tenantId: scope.tenantId, partnerId: scope.partnerId },
            select: { accountKey: true, accountType: true, currency: true, amount: true, direction: true },
        });
        const map = new Map();
        for (const e of entries) {
            const key = e.accountKey;
            if (!map.has(key)) map.set(key, { accountKey: key, accountType: e.accountType, currency: e.currency, in: 0, out: 0, balance: 0 });
            const r = map.get(key);
            if (e.direction === 'IN') r.in += Number(e.amount);
            else if (e.direction === 'OUT') r.out += Number(e.amount);
            r.balance = round2(r.in - r.out);
        }
        // Always include CASH_TRY
        if (!map.has('CASH_TRY')) map.set('CASH_TRY', { accountKey: 'CASH_TRY', accountType: 'CASH', currency: 'TRY', in: 0, out: 0, balance: 0 });
        res.json({ success: true, data: Array.from(map.values()) });
    } catch (error) {
        console.error('Cash accounts error:', error);
        res.status(500).json({ success: false, error: 'Kasa hesapları alınamadı' });
    }
});

router.get('/cash/entries', authMiddleware, async (req, res) => {
    const scope = ensurePartner(req, res);
    if (!scope) return;
    try {
        const { accountKey, from, to, direction } = req.query;
        const where = { tenantId: scope.tenantId, partnerId: scope.partnerId };
        if (accountKey) where.accountKey = String(accountKey);
        if (direction) where.direction = String(direction);
        if (from || to) where.date = {};
        if (from) where.date.gte = new Date(String(from));
        if (to) where.date.lte = new Date(String(to));
        const entries = await prisma.partnerCashEntry.findMany({ where, orderBy: { date: 'desc' } });
        res.json({ success: true, data: entries });
    } catch (error) {
        console.error('Cash entries error:', error);
        res.status(500).json({ success: false, error: 'Kasa hareketleri alınamadı' });
    }
});

router.post('/cash/entries', authMiddleware, async (req, res) => {
    const scope = ensurePartner(req, res);
    if (!scope) return;
    try {
        const b = req.body || {};
        const amount = toNum(b.amount);
        if (!(amount > 0)) return res.status(400).json({ success: false, error: 'Tutar > 0 olmalı' });
        const entry = await prisma.partnerCashEntry.create({
            data: {
                tenantId: scope.tenantId,
                partnerId: scope.partnerId,
                accountType: b.accountType || 'CASH',
                accountKey: b.accountKey || 'CASH_TRY',
                currency: b.currency || 'TRY',
                date: b.date ? new Date(b.date) : new Date(),
                direction: b.direction || 'IN',
                amount,
                description: b.description || null,
                accountId: b.accountId || null,
                refType: b.refType || null,
                refId: b.refId || null,
                transferToAccountKey: b.transferToAccountKey || null,
                metadata: b.metadata || null,
                createdById: scope.partnerId,
            },
        });
        res.json({ success: true, data: entry });
    } catch (error) {
        console.error('Cash entry create error:', error);
        res.status(500).json({ success: false, error: 'Kasa kaydı oluşturulamadı' });
    }
});

router.delete('/cash/entries/:id', authMiddleware, async (req, res) => {
    const scope = ensurePartner(req, res);
    if (!scope) return;
    try {
        const entry = await prisma.partnerCashEntry.findFirst({
            where: { id: req.params.id, tenantId: scope.tenantId, partnerId: scope.partnerId },
        });
        if (!entry) return res.status(404).json({ success: false, error: 'Kayıt bulunamadı' });
        await prisma.partnerCashEntry.delete({ where: { id: entry.id } });
        res.json({ success: true });
    } catch (error) {
        console.error('Cash entry delete error:', error);
        res.status(500).json({ success: false, error: 'Kayıt silinemedi' });
    }
});

// ─────────────────────────────────────────────────────────────────
// EMPLOYEES — Personel
// ─────────────────────────────────────────────────────────────────
router.get('/employees', authMiddleware, async (req, res) => {
    const scope = ensurePartner(req, res);
    if (!scope) return;
    try {
        const { search, status, jobTitle } = req.query;
        const where = { tenantId: scope.tenantId, partnerId: scope.partnerId };
        if (status) where.status = String(status);
        if (jobTitle) where.jobTitle = String(jobTitle);
        if (search) {
            where.OR = [
                { firstName: { contains: String(search), mode: 'insensitive' } },
                { lastName: { contains: String(search), mode: 'insensitive' } },
                { identityNo: { contains: String(search) } },
                { phone: { contains: String(search) } },
                { email: { contains: String(search), mode: 'insensitive' } },
            ];
        }
        const data = await prisma.partnerEmployee.findMany({
            where,
            orderBy: [{ status: 'asc' }, { firstName: 'asc' }],
        });
        res.json({ success: true, data });
    } catch (error) {
        console.error('Employees list error:', error);
        res.status(500).json({ success: false, error: 'Personeller alınamadı' });
    }
});

router.post('/employees', authMiddleware, async (req, res) => {
    const scope = ensurePartner(req, res);
    if (!scope) return;
    try {
        const b = req.body || {};
        if (!b.firstName || !b.lastName) return res.status(400).json({ success: false, error: 'Ad ve soyad zorunlu' });
        const employee = await prisma.partnerEmployee.create({
            data: {
                tenantId: scope.tenantId,
                partnerId: scope.partnerId,
                firstName: b.firstName,
                lastName: b.lastName,
                jobTitle: b.jobTitle || null,
                department: b.department || null,
                identityNo: b.identityNo || null,
                birthDate: b.birthDate ? new Date(b.birthDate) : null,
                gender: b.gender || null,
                phone: b.phone || null,
                email: b.email || null,
                address: b.address || null,
                hireDate: b.hireDate ? new Date(b.hireDate) : null,
                contractType: b.contractType || 'FULL_TIME',
                status: b.status || 'ACTIVE',
                baseSalary: b.baseSalary ? toNum(b.baseSalary) : null,
                salaryCurrency: b.salaryCurrency || 'TRY',
                paymentDay: b.paymentDay ? Number(b.paymentDay) : null,
                iban: b.iban || null,
                bankName: b.bankName || null,
                sgkNumber: b.sgkNumber || null,
                sgkStartDate: b.sgkStartDate ? new Date(b.sgkStartDate) : null,
                userId: b.userId || null,
                notes: b.notes || null,
                metadata: b.metadata || null,
            },
        });
        res.json({ success: true, data: employee });
    } catch (error) {
        console.error('Employee create error:', error);
        res.status(500).json({ success: false, error: 'Personel oluşturulamadı' });
    }
});

router.put('/employees/:id', authMiddleware, async (req, res) => {
    const scope = ensurePartner(req, res);
    if (!scope) return;
    try {
        const existing = await prisma.partnerEmployee.findFirst({
            where: { id: req.params.id, tenantId: scope.tenantId, partnerId: scope.partnerId },
        });
        if (!existing) return res.status(404).json({ success: false, error: 'Personel bulunamadı' });
        const b = req.body || {};
        const data = await prisma.partnerEmployee.update({
            where: { id: existing.id },
            data: {
                firstName: b.firstName ?? undefined,
                lastName: b.lastName ?? undefined,
                jobTitle: b.jobTitle ?? undefined,
                department: b.department ?? undefined,
                identityNo: b.identityNo ?? undefined,
                birthDate: b.birthDate ? new Date(b.birthDate) : undefined,
                gender: b.gender ?? undefined,
                phone: b.phone ?? undefined,
                email: b.email ?? undefined,
                address: b.address ?? undefined,
                hireDate: b.hireDate ? new Date(b.hireDate) : undefined,
                terminationDate: b.terminationDate ? new Date(b.terminationDate) : undefined,
                contractType: b.contractType ?? undefined,
                status: b.status ?? undefined,
                baseSalary: b.baseSalary !== undefined ? toNum(b.baseSalary) : undefined,
                salaryCurrency: b.salaryCurrency ?? undefined,
                paymentDay: b.paymentDay !== undefined ? Number(b.paymentDay) : undefined,
                iban: b.iban ?? undefined,
                bankName: b.bankName ?? undefined,
                sgkNumber: b.sgkNumber ?? undefined,
                sgkStartDate: b.sgkStartDate ? new Date(b.sgkStartDate) : undefined,
                sgkExitDate: b.sgkExitDate ? new Date(b.sgkExitDate) : undefined,
                notes: b.notes ?? undefined,
            },
        });
        res.json({ success: true, data });
    } catch (error) {
        console.error('Employee update error:', error);
        res.status(500).json({ success: false, error: 'Personel güncellenemedi' });
    }
});

router.delete('/employees/:id', authMiddleware, async (req, res) => {
    const scope = ensurePartner(req, res);
    if (!scope) return;
    try {
        const existing = await prisma.partnerEmployee.findFirst({
            where: { id: req.params.id, tenantId: scope.tenantId, partnerId: scope.partnerId },
        });
        if (!existing) return res.status(404).json({ success: false, error: 'Personel bulunamadı' });
        const hasPayroll = await prisma.partnerPayrollEntry.count({ where: { employeeId: existing.id } });
        if (hasPayroll > 0) {
            await prisma.partnerEmployee.update({ where: { id: existing.id }, data: { status: 'TERMINATED', isActive: false, terminationDate: new Date() } });
            return res.json({ success: true, archived: true });
        }
        await prisma.partnerEmployee.delete({ where: { id: existing.id } });
        res.json({ success: true, deleted: true });
    } catch (error) {
        console.error('Employee delete error:', error);
        res.status(500).json({ success: false, error: 'Personel silinemedi' });
    }
});

// ─────────────────────────────────────────────────────────────────
// PAYROLL — Hakediş & Maaş
// ─────────────────────────────────────────────────────────────────
router.get('/payroll', authMiddleware, async (req, res) => {
    const scope = ensurePartner(req, res);
    if (!scope) return;
    try {
        const { employeeId, type, periodYear, periodMonth, paid } = req.query;
        const where = { tenantId: scope.tenantId, partnerId: scope.partnerId };
        if (employeeId) where.employeeId = String(employeeId);
        if (type) where.type = String(type);
        if (periodYear) where.periodYear = Number(periodYear);
        if (periodMonth) where.periodMonth = Number(periodMonth);
        if (paid !== undefined) where.paid = paid === 'true';
        const data = await prisma.partnerPayrollEntry.findMany({
            where,
            orderBy: { date: 'desc' },
            include: { employee: { select: { id: true, firstName: true, lastName: true, jobTitle: true } } },
        });
        res.json({ success: true, data });
    } catch (error) {
        console.error('Payroll list error:', error);
        res.status(500).json({ success: false, error: 'Bordrolar alınamadı' });
    }
});

router.post('/payroll', authMiddleware, async (req, res) => {
    const scope = ensurePartner(req, res);
    if (!scope) return;
    try {
        const b = req.body || {};
        const employee = await prisma.partnerEmployee.findFirst({
            where: { id: b.employeeId, tenantId: scope.tenantId, partnerId: scope.partnerId },
        });
        if (!employee) return res.status(400).json({ success: false, error: 'Personel bulunamadı' });
        const amount = toNum(b.amount);
        if (!(amount > 0)) return res.status(400).json({ success: false, error: 'Tutar > 0 olmalı' });

        const result = await prisma.$transaction(async (tx) => {
            const account = await ensureLinkedAccount(tx, scope, employee);
            const payroll = await tx.partnerPayrollEntry.create({
                data: {
                    tenantId: scope.tenantId,
                    partnerId: scope.partnerId,
                    employeeId: employee.id,
                    type: b.type || 'SALARY',
                    periodYear: b.periodYear ? Number(b.periodYear) : new Date().getFullYear(),
                    periodMonth: b.periodMonth ? Number(b.periodMonth) : new Date().getMonth() + 1,
                    date: b.date ? new Date(b.date) : new Date(),
                    amount,
                    currency: b.currency || employee.salaryCurrency || 'TRY',
                    description: b.description || null,
                    paid: !!b.paid,
                    paidAt: b.paid ? new Date() : null,
                    paymentMethod: b.paymentMethod || null,
                    cashAccountKey: b.cashAccountKey || null,
                    metadata: b.metadata || null,
                    createdById: scope.partnerId,
                },
            });

            // Accrual: borç to employee cari for SALARY/BONUS/OVERTIME; ADVANCE direct debit (we owe them less)
            const isAccrual = ['SALARY', 'BONUS', 'OVERTIME', 'REIMBURSEMENT', 'TIP'].includes(payroll.type);
            const isDeduction = ['DEDUCTION', 'ADVANCE'].includes(payroll.type);
            await tx.partnerLedgerEntry.create({
                data: {
                    tenantId: scope.tenantId,
                    partnerId: scope.partnerId,
                    accountId: account.id,
                    date: payroll.date,
                    source: payroll.type === 'ADVANCE' ? 'ADVANCE' : 'PAYROLL',
                    refType: 'PAYROLL',
                    refId: payroll.id,
                    description: `${payroll.type} · ${employee.firstName} ${employee.lastName}`,
                    isCredit: isAccrual,
                    amount,
                    currency: payroll.currency,
                    metadata: { payrollType: payroll.type },
                    createdById: scope.partnerId,
                },
            });
            await recalcAccountBalance(tx, account.id);

            if (payroll.paid) {
                await tx.partnerCashEntry.create({
                    data: {
                        tenantId: scope.tenantId,
                        partnerId: scope.partnerId,
                        accountType: payroll.cashAccountKey?.startsWith('BANK_') ? 'BANK' : 'CASH',
                        accountKey: payroll.cashAccountKey || 'CASH_TRY',
                        currency: payroll.currency,
                        date: payroll.date,
                        direction: 'OUT',
                        amount,
                        description: `Maaş/avans: ${employee.firstName} ${employee.lastName}`,
                        accountId: account.id,
                        refType: 'PAYROLL',
                        refId: payroll.id,
                        payrollId: payroll.id,
                        createdById: scope.partnerId,
                    },
                });
                // Settle on cari (reverse direction)
                await tx.partnerLedgerEntry.create({
                    data: {
                        tenantId: scope.tenantId,
                        partnerId: scope.partnerId,
                        accountId: account.id,
                        date: payroll.date,
                        source: 'PAYMENT',
                        refType: 'PAYROLL',
                        refId: payroll.id,
                        description: `Ödeme · ${payroll.type}`,
                        isCredit: !isAccrual,
                        amount,
                        currency: payroll.currency,
                        createdById: scope.partnerId,
                    },
                });
                await recalcAccountBalance(tx, account.id);
            }

            return payroll;
        });

        res.json({ success: true, data: result });
    } catch (error) {
        console.error('Payroll create error:', error);
        res.status(500).json({ success: false, error: 'Bordro oluşturulamadı' });
    }
});

router.post('/payroll/:id/pay', authMiddleware, async (req, res) => {
    const scope = ensurePartner(req, res);
    if (!scope) return;
    try {
        const payroll = await prisma.partnerPayrollEntry.findFirst({
            where: { id: req.params.id, tenantId: scope.tenantId, partnerId: scope.partnerId },
            include: { employee: true },
        });
        if (!payroll) return res.status(404).json({ success: false, error: 'Bordro bulunamadı' });
        if (payroll.paid) return res.status(400).json({ success: false, error: 'Zaten ödendi' });
        const b = req.body || {};
        const accountKey = b.accountKey || payroll.cashAccountKey || 'CASH_TRY';

        await prisma.$transaction(async (tx) => {
            const account = await ensureLinkedAccount(tx, scope, payroll.employee);
            await tx.partnerCashEntry.create({
                data: {
                    tenantId: scope.tenantId,
                    partnerId: scope.partnerId,
                    accountType: accountKey.startsWith('BANK_') ? 'BANK' : 'CASH',
                    accountKey,
                    currency: payroll.currency,
                    date: new Date(),
                    direction: 'OUT',
                    amount: Number(payroll.amount),
                    description: `Maaş/avans ödeme: ${payroll.employee.firstName} ${payroll.employee.lastName}`,
                    accountId: account.id,
                    refType: 'PAYROLL',
                    refId: payroll.id,
                    payrollId: payroll.id,
                    createdById: scope.partnerId,
                },
            });
            const isAccrual = ['SALARY', 'BONUS', 'OVERTIME', 'REIMBURSEMENT', 'TIP'].includes(payroll.type);
            await tx.partnerLedgerEntry.create({
                data: {
                    tenantId: scope.tenantId,
                    partnerId: scope.partnerId,
                    accountId: account.id,
                    date: new Date(),
                    source: 'PAYMENT',
                    refType: 'PAYROLL',
                    refId: payroll.id,
                    description: `Ödeme · ${payroll.type}`,
                    isCredit: !isAccrual,
                    amount: Number(payroll.amount),
                    currency: payroll.currency,
                    paymentMethod: accountKey.startsWith('BANK_') ? 'BANK' : 'CASH',
                    createdById: scope.partnerId,
                },
            });
            await recalcAccountBalance(tx, account.id);
            await tx.partnerPayrollEntry.update({
                where: { id: payroll.id },
                data: { paid: true, paidAt: new Date(), cashAccountKey: accountKey, paymentMethod: b.paymentMethod || (accountKey.startsWith('BANK_') ? 'BANK_TRANSFER' : 'CASH') },
            });
        });

        res.json({ success: true });
    } catch (error) {
        console.error('Payroll pay error:', error);
        res.status(500).json({ success: false, error: 'Ödeme yapılamadı' });
    }
});

router.delete('/payroll/:id', authMiddleware, async (req, res) => {
    const scope = ensurePartner(req, res);
    if (!scope) return;
    try {
        const entry = await prisma.partnerPayrollEntry.findFirst({
            where: { id: req.params.id, tenantId: scope.tenantId, partnerId: scope.partnerId },
        });
        if (!entry) return res.status(404).json({ success: false, error: 'Bordro bulunamadı' });
        if (entry.paid) return res.status(400).json({ success: false, error: 'Ödenmiş bordro silinemez' });
        await prisma.partnerPayrollEntry.delete({ where: { id: entry.id } });
        res.json({ success: true });
    } catch (error) {
        console.error('Payroll delete error:', error);
        res.status(500).json({ success: false, error: 'Bordro silinemedi' });
    }
});

// ─────────────────────────────────────────────────────────────────
// LEAVES — İzin
// ─────────────────────────────────────────────────────────────────
router.get('/leaves', authMiddleware, async (req, res) => {
    const scope = ensurePartner(req, res);
    if (!scope) return;
    try {
        const { employeeId, status, from, to } = req.query;
        const where = { tenantId: scope.tenantId, partnerId: scope.partnerId };
        if (employeeId) where.employeeId = String(employeeId);
        if (status) where.status = String(status);
        if (from || to) where.startDate = {};
        if (from) where.startDate.gte = new Date(String(from));
        if (to) where.startDate.lte = new Date(String(to));
        const data = await prisma.partnerLeave.findMany({
            where,
            orderBy: { startDate: 'desc' },
            include: { employee: { select: { id: true, firstName: true, lastName: true, jobTitle: true } } },
        });
        res.json({ success: true, data });
    } catch (error) {
        console.error('Leaves list error:', error);
        res.status(500).json({ success: false, error: 'İzinler alınamadı' });
    }
});

router.post('/leaves', authMiddleware, async (req, res) => {
    const scope = ensurePartner(req, res);
    if (!scope) return;
    try {
        const b = req.body || {};
        const employee = await prisma.partnerEmployee.findFirst({
            where: { id: b.employeeId, tenantId: scope.tenantId, partnerId: scope.partnerId },
        });
        if (!employee) return res.status(400).json({ success: false, error: 'Personel bulunamadı' });
        if (!b.startDate || !b.endDate) return res.status(400).json({ success: false, error: 'Başlangıç ve bitiş tarihi gerekli' });
        const start = new Date(b.startDate);
        const end = new Date(b.endDate);
        const days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1);
        const data = await prisma.partnerLeave.create({
            data: {
                tenantId: scope.tenantId,
                partnerId: scope.partnerId,
                employeeId: employee.id,
                type: b.type || 'ANNUAL',
                startDate: start,
                endDate: end,
                days,
                reason: b.reason || null,
                status: b.status || 'PENDING',
                metadata: b.metadata || null,
            },
        });
        res.json({ success: true, data });
    } catch (error) {
        console.error('Leave create error:', error);
        res.status(500).json({ success: false, error: 'İzin oluşturulamadı' });
    }
});

router.patch('/leaves/:id', authMiddleware, async (req, res) => {
    const scope = ensurePartner(req, res);
    if (!scope) return;
    try {
        const existing = await prisma.partnerLeave.findFirst({
            where: { id: req.params.id, tenantId: scope.tenantId, partnerId: scope.partnerId },
        });
        if (!existing) return res.status(404).json({ success: false, error: 'İzin bulunamadı' });
        const b = req.body || {};
        const data = await prisma.partnerLeave.update({
            where: { id: existing.id },
            data: {
                type: b.type ?? undefined,
                startDate: b.startDate ? new Date(b.startDate) : undefined,
                endDate: b.endDate ? new Date(b.endDate) : undefined,
                days: b.days !== undefined ? Number(b.days) : undefined,
                reason: b.reason ?? undefined,
                status: b.status ?? undefined,
                rejectedReason: b.rejectedReason ?? undefined,
                approvedById: b.status === 'APPROVED' ? scope.partnerId : undefined,
                approvedAt: b.status === 'APPROVED' ? new Date() : undefined,
            },
        });
        res.json({ success: true, data });
    } catch (error) {
        console.error('Leave update error:', error);
        res.status(500).json({ success: false, error: 'İzin güncellenemedi' });
    }
});

router.delete('/leaves/:id', authMiddleware, async (req, res) => {
    const scope = ensurePartner(req, res);
    if (!scope) return;
    try {
        const existing = await prisma.partnerLeave.findFirst({
            where: { id: req.params.id, tenantId: scope.tenantId, partnerId: scope.partnerId },
        });
        if (!existing) return res.status(404).json({ success: false, error: 'İzin bulunamadı' });
        await prisma.partnerLeave.delete({ where: { id: existing.id } });
        res.json({ success: true });
    } catch (error) {
        console.error('Leave delete error:', error);
        res.status(500).json({ success: false, error: 'İzin silinemedi' });
    }
});

// ─────────────────────────────────────────────────────────────────
// DRIVER COLLECTIONS — Şoför Tahsilatları
// ─────────────────────────────────────────────────────────────────
router.get('/collections', authMiddleware, async (req, res) => {
    const scope = ensurePartner(req, res);
    if (!scope) return;
    try {
        const { driverId, status, from, to } = req.query;
        const where = { tenantId: scope.tenantId, partnerId: scope.partnerId };
        if (driverId) where.driverId = String(driverId);
        if (status) where.status = String(status);
        if (from || to) where.date = {};
        if (from) where.date.gte = new Date(String(from));
        if (to) where.date.lte = new Date(String(to));
        const data = await prisma.partnerDriverCollection.findMany({
            where,
            orderBy: { date: 'desc' },
        });
        res.json({ success: true, data });
    } catch (error) {
        console.error('Collections list error:', error);
        res.status(500).json({ success: false, error: 'Tahsilatlar alınamadı' });
    }
});

router.post('/collections', authMiddleware, async (req, res) => {
    const scope = ensurePartner(req, res);
    if (!scope) return;
    try {
        const b = req.body || {};
        // Verify driver is in partner team
        if (b.driverId) {
            const driver = await prisma.user.findFirst({
                where: { id: b.driverId, partnerId: scope.partnerId, tenantId: scope.tenantId },
            });
            if (!driver) return res.status(400).json({ success: false, error: 'Şoför ekibinizde değil' });
        }
        const amount = toNum(b.amount);
        if (!(amount > 0)) return res.status(400).json({ success: false, error: 'Tutar > 0 olmalı' });
        const data = await prisma.partnerDriverCollection.create({
            data: {
                tenantId: scope.tenantId,
                partnerId: scope.partnerId,
                driverId: b.driverId,
                bookingId: b.bookingId || null,
                amount,
                currency: b.currency || 'TRY',
                method: b.method || 'CASH',
                date: b.date ? new Date(b.date) : new Date(),
                status: b.status || 'PENDING',
                notes: b.notes || null,
            },
        });
        res.json({ success: true, data });
    } catch (error) {
        console.error('Collection create error:', error);
        res.status(500).json({ success: false, error: 'Tahsilat oluşturulamadı' });
    }
});

router.post('/collections/:id/confirm', authMiddleware, async (req, res) => {
    const scope = ensurePartner(req, res);
    if (!scope) return;
    try {
        const entry = await prisma.partnerDriverCollection.findFirst({
            where: { id: req.params.id, tenantId: scope.tenantId, partnerId: scope.partnerId },
        });
        if (!entry) return res.status(404).json({ success: false, error: 'Tahsilat bulunamadı' });
        if (entry.status === 'CONFIRMED') return res.status(400).json({ success: false, error: 'Zaten onaylı' });

        const updated = await prisma.$transaction(async (tx) => {
            const u = await tx.partnerDriverCollection.update({
                where: { id: entry.id },
                data: { status: 'CONFIRMED', confirmedAt: new Date(), confirmedById: scope.partnerId },
            });
            await tx.partnerCashEntry.create({
                data: {
                    tenantId: scope.tenantId,
                    partnerId: scope.partnerId,
                    accountType: (entry.method === 'TRANSFER' ? 'BANK' : 'CASH'),
                    accountKey: entry.method === 'TRANSFER' ? 'BANK_DEFAULT' : 'CASH_TRY',
                    currency: entry.currency,
                    date: new Date(),
                    direction: 'IN',
                    amount: Number(entry.amount),
                    description: `Şoför tahsilat onayı`,
                    refType: 'COLLECTION',
                    refId: entry.id,
                    createdById: scope.partnerId,
                },
            });
            return u;
        });
        res.json({ success: true, data: updated });
    } catch (error) {
        console.error('Collection confirm error:', error);
        res.status(500).json({ success: false, error: 'Onaylanamadı' });
    }
});

module.exports = router;
