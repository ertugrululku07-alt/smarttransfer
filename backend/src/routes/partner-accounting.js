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
const uetdsService = require('../services/uetdsService');
const axios = require('axios');

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

// ─────────────────────────────────────────────────────────────────
// INVOICE PDF / PRINT (server-rendered HTML)
// ─────────────────────────────────────────────────────────────────
function buildInvoiceHtml({ invoice, items, partner, profile }) {
    const fmt = (v, c) => `${Number(v || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${c || 'TRY'}`;
    const escape = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
    const kindMap = { STANDARD: 'Kağıt Fatura', EFATURA: 'e-Fatura', EARCHIVE: 'e-Arşiv', EWAYBILL: 'e-İrsaliye', EXPENSE_RCPT: 'Masraf Fişi' };
    const typeMap = { SALES: 'Satış Faturası', PURCHASE: 'Alış Faturası', EXPENSE: 'Masraf', RETURN_SALES: 'Satış İade', RETURN_PURCHASE: 'Alış İade' };
    const company = profile?.companyName || partner?.fullName || '';
    const companyTax = profile?.taxNumber ? `${profile.taxNumber}${profile.taxOffice ? ' / ' + profile.taxOffice : ''}` : '';
    const companyAddr = profile?.address || '';
    const companyContact = [profile?.contactEmail, profile?.contactPhone].filter(Boolean).join(' · ');

    const rows = items.map((it, i) => `
      <tr>
        <td class="num">${i + 1}</td>
        <td>${escape(it.description)}</td>
        <td class="num">${Number(it.quantity).toLocaleString('tr-TR', { maximumFractionDigits: 3 })}</td>
        <td>${escape(it.unit || '')}</td>
        <td class="num">${fmt(it.unitPrice, invoice.currency)}</td>
        <td class="num">${Number(it.discountRate).toFixed(2)}%</td>
        <td class="num">${Number(it.taxRate).toFixed(0)}%</td>
        <td class="num strong">${fmt(it.total, invoice.currency)}</td>
      </tr>`).join('');

    return `<!doctype html><html lang="tr"><head><meta charset="utf-8">
<title>${escape(invoice.invoiceNo)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1e293b; margin: 0; background: #f8fafc; }
  .wrap { max-width: 820px; margin: 20px auto; background: #fff; padding: 36px 40px; box-shadow: 0 8px 24px rgba(0,0,0,0.06); border-radius: 12px; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #6366f1; padding-bottom: 18px; }
  .head .seller { font-size: 13px; line-height: 1.45; }
  .head .seller h1 { font-size: 22px; margin: 0 0 6px; color: #0f172a; }
  .head .meta { text-align: right; font-size: 12px; line-height: 1.55; }
  .head .meta .num { font-size: 16px; font-weight: 700; color: #4f46e5; letter-spacing: 0.5px; }
  .badges span { display: inline-block; padding: 2px 8px; border-radius: 8px; font-size: 11px; font-weight: 700; margin-left: 6px; }
  .b-blue { background: #eef2ff; color: #4338ca; }
  .b-purple { background: #faf5ff; color: #7c3aed; }
  .b-amber { background: #fef3c7; color: #92400e; }
  .b-green { background: #ecfdf5; color: #047857; }
  .b-red { background: #fef2f2; color: #b91c1c; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 22px; margin: 22px 0 14px; }
  .card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px 16px; }
  .card h3 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; margin: 0 0 8px; }
  .card .row { font-size: 13px; margin-top: 3px; }
  table { width: 100%; border-collapse: collapse; margin-top: 14px; font-size: 12.5px; }
  th, td { padding: 8px 10px; text-align: left; border-bottom: 1px solid #e2e8f0; }
  th { background: #f1f5f9; font-weight: 600; color: #475569; font-size: 11px; text-transform: uppercase; }
  td.num, th.num { text-align: right; }
  td.strong { font-weight: 700; }
  .totals { display: flex; justify-content: flex-end; margin-top: 14px; }
  .totals table { width: 320px; }
  .totals td { padding: 6px 8px; border: none; font-size: 13px; }
  .totals tr.grand td { font-size: 16px; font-weight: 800; color: #0f172a; border-top: 2px solid #6366f1; padding-top: 10px; }
  .foot { margin-top: 28px; padding-top: 14px; border-top: 1px dashed #cbd5e1; font-size: 11px; color: #64748b; line-height: 1.6; }
  .btn-print { position: fixed; right: 16px; top: 16px; background: #4f46e5; color:#fff; padding: 8px 14px; border-radius: 8px; font-weight: 700; border: none; cursor: pointer; box-shadow: 0 4px 12px rgba(99,102,241,0.3); }
  @media print { .btn-print { display: none; } body { background: #fff; } .wrap { box-shadow: none; margin: 0; max-width: none; } }
</style></head><body>
<button class="btn-print" onclick="window.print()">Yazdır / PDF</button>
<div class="wrap">
  <div class="head">
    <div class="seller">
      <h1>${escape(company)}</h1>
      ${companyTax ? `<div>VKN/TCKN: <b>${escape(companyTax)}</b></div>` : ''}
      ${companyAddr ? `<div>${escape(companyAddr)}</div>` : ''}
      ${companyContact ? `<div>${escape(companyContact)}</div>` : ''}
    </div>
    <div class="meta">
      <div class="num">${escape(invoice.invoiceNo)}</div>
      <div>${typeMap[invoice.type] || invoice.type}</div>
      <div class="badges">
        <span class="b-blue">${kindMap[invoice.kind] || invoice.kind}</span>
        <span class="${invoice.status === 'PAID' ? 'b-green' : invoice.status === 'CANCELLED' || invoice.status === 'REJECTED' ? 'b-red' : 'b-amber'}">${invoice.status}</span>
      </div>
      <div style="margin-top:8px;">Düzenleme: <b>${new Date(invoice.issueDate).toLocaleDateString('tr-TR')}</b></div>
      ${invoice.dueDate ? `<div>Vade: <b>${new Date(invoice.dueDate).toLocaleDateString('tr-TR')}</b></div>` : ''}
      ${invoice.eInvoiceUuid ? `<div>UUID: <code style="font-size:10px;">${escape(invoice.eInvoiceUuid)}</code></div>` : ''}
    </div>
  </div>

  <div class="grid">
    <div class="card">
      <h3>Cari</h3>
      <div class="row" style="font-weight:700;">${escape(invoice.counterpartyName || '-')}</div>
      ${invoice.counterpartyTaxNumber ? `<div class="row">VKN/TCKN: ${escape(invoice.counterpartyTaxNumber)}</div>` : ''}
      ${invoice.counterpartyTaxOffice ? `<div class="row">Vergi Dairesi: ${escape(invoice.counterpartyTaxOffice)}</div>` : ''}
      ${invoice.counterpartyAddress ? `<div class="row">${escape(invoice.counterpartyAddress)}</div>` : ''}
      ${invoice.counterpartyEmail ? `<div class="row">${escape(invoice.counterpartyEmail)}</div>` : ''}
      ${invoice.counterpartyPhone ? `<div class="row">${escape(invoice.counterpartyPhone)}</div>` : ''}
    </div>
    <div class="card">
      <h3>Ödeme</h3>
      <div class="row">Para Birimi: <b>${escape(invoice.currency)}</b></div>
      ${invoice.scenario ? `<div class="row">Senaryo: ${escape(invoice.scenario)}</div>` : ''}
      <div class="row">Ödenen: <b style="color:#10b981;">${fmt(invoice.paidTotal, invoice.currency)}</b></div>
      <div class="row">Kalan: <b style="color:${Number(invoice.grandTotal) - Number(invoice.paidTotal) > 0 ? '#ef4444' : '#64748b'};">${fmt(Number(invoice.grandTotal) - Number(invoice.paidTotal), invoice.currency)}</b></div>
    </div>
  </div>

  <table>
    <thead><tr>
      <th class="num">#</th><th>Açıklama</th><th class="num">Miktar</th><th>Birim</th>
      <th class="num">B. Fiyat</th><th class="num">İsk %</th><th class="num">KDV %</th><th class="num">Tutar</th>
    </tr></thead>
    <tbody>${rows || '<tr><td colspan="8" style="text-align:center;color:#94a3b8;padding:24px;">Kalem yok</td></tr>'}</tbody>
  </table>

  <div class="totals">
    <table>
      <tr><td>Ara Toplam</td><td class="num">${fmt(invoice.subtotal, invoice.currency)}</td></tr>
      ${Number(invoice.discountTotal) > 0 ? `<tr><td>İskonto</td><td class="num" style="color:#ef4444;">-${fmt(invoice.discountTotal, invoice.currency)}</td></tr>` : ''}
      <tr><td>KDV</td><td class="num">${fmt(invoice.taxTotal, invoice.currency)}</td></tr>
      ${Number(invoice.withholdingTotal) > 0 ? `<tr><td>Tevkifat</td><td class="num" style="color:#ef4444;">-${fmt(invoice.withholdingTotal, invoice.currency)}</td></tr>` : ''}
      <tr class="grand"><td>Genel Toplam</td><td class="num">${fmt(invoice.grandTotal, invoice.currency)}</td></tr>
    </table>
  </div>

  ${invoice.notes ? `<div class="foot"><b>Notlar:</b> ${escape(invoice.notes)}</div>` : ''}
  <div class="foot" style="text-align:center;">Bu belge ${new Date().toLocaleString('tr-TR')} tarihinde SmartTransfer üzerinden üretilmiştir.</div>
</div></body></html>`;
}

router.get('/invoices/:id/pdf', authMiddleware, async (req, res) => {
    const scope = ensurePartner(req, res);
    if (!scope) return;
    try {
        const invoice = await prisma.partnerInvoice.findFirst({
            where: { id: req.params.id, tenantId: scope.tenantId, partnerId: scope.partnerId },
            include: { items: { orderBy: { lineNo: 'asc' } } },
        });
        if (!invoice) return res.status(404).send('Fatura bulunamadı');
        const profile = await prisma.partnerProfile.findUnique({ where: { userId: scope.partnerId } });
        const partner = await prisma.user.findUnique({ where: { id: scope.partnerId } });
        const html = buildInvoiceHtml({ invoice, items: invoice.items, partner, profile });
        res.set('Content-Type', 'text/html; charset=utf-8');
        res.send(html);
    } catch (error) {
        console.error('Invoice PDF error:', error);
        res.status(500).send('Hata');
    }
});

// ─────────────────────────────────────────────────────────────────
// SEND INVOICE via partner's configured channels
// ─────────────────────────────────────────────────────────────────
function getInvoiceLink(req, invoiceId) {
    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const host = req.headers['x-forwarded-host'] || req.get('host');
    return `${proto}://${host}/api/partner-accounting/invoices/${invoiceId}/pdf`;
}

router.post('/invoices/:id/send-email', authMiddleware, async (req, res) => {
    const scope = ensurePartner(req, res);
    if (!scope) return;
    try {
        const invoice = await prisma.partnerInvoice.findFirst({
            where: { id: req.params.id, tenantId: scope.tenantId, partnerId: scope.partnerId },
            include: { items: { orderBy: { lineNo: 'asc' } } },
        });
        if (!invoice) return res.status(404).json({ success: false, error: 'Fatura bulunamadı' });
        const to = req.body?.to || invoice.counterpartyEmail;
        if (!to) return res.status(400).json({ success: false, error: 'Alıcı e-posta yok' });

        const profile = await prisma.partnerProfile.findUnique({ where: { userId: scope.partnerId } });
        const email = profile?.metadata?.notifications?.email;
        if (!email || !email.smtpHost || !email.smtpUser || !email.smtpPassEnc) {
            return res.status(400).json({ success: false, error: 'SMTP ayarları eksik (Tanımlamalar)' });
        }

        const partner = await prisma.user.findUnique({ where: { id: scope.partnerId } });
        const html = buildInvoiceHtml({ invoice, items: invoice.items, partner, profile });

        const nodemailer = require('nodemailer');
        const transporter = nodemailer.createTransport({
            host: email.smtpHost,
            port: Number(email.smtpPort) || 587,
            secure: !!email.smtpSecure || Number(email.smtpPort) === 465,
            auth: { user: email.smtpUser, pass: uetdsService.decrypt(email.smtpPassEnc) },
            tls: { rejectUnauthorized: false },
        });

        const fromName = email.senderName || profile?.companyName || partner?.fullName || 'Partner';
        const fromAddr = email.senderEmail || email.smtpUser;
        const subject = req.body?.subject || `Fatura ${invoice.invoiceNo} · ${profile?.companyName || partner?.fullName || ''}`;
        const message = req.body?.message
            ? `<p>${String(req.body.message).replace(/</g, '&lt;').replace(/\n/g, '<br>')}</p>`
            : '';

        await transporter.sendMail({
            from: `"${fromName}" <${fromAddr}>`,
            to,
            replyTo: email.replyTo || undefined,
            subject,
            html: `${message}${html}`,
        });

        res.json({ success: true, message: `E-posta gönderildi: ${to}` });
    } catch (error) {
        console.error('Invoice send-email error:', error);
        res.status(500).json({ success: false, error: error.message || 'E-posta gönderilemedi' });
    }
});

router.post('/invoices/:id/send-whatsapp', authMiddleware, async (req, res) => {
    const scope = ensurePartner(req, res);
    if (!scope) return;
    try {
        const invoice = await prisma.partnerInvoice.findFirst({
            where: { id: req.params.id, tenantId: scope.tenantId, partnerId: scope.partnerId },
        });
        if (!invoice) return res.status(404).json({ success: false, error: 'Fatura bulunamadı' });
        const phone = req.body?.phone || invoice.counterpartyPhone;
        if (!phone) return res.status(400).json({ success: false, error: 'Telefon numarası yok' });

        const profile = await prisma.partnerProfile.findUnique({ where: { userId: scope.partnerId } });
        const wa = profile?.metadata?.notifications?.whatsapp;
        if (!wa || !wa.enabled) return res.status(400).json({ success: false, error: 'WhatsApp ayarları aktif değil' });

        const normalized = (() => {
            let c = String(phone).replace(/[^\d+]/g, '');
            if (c.startsWith('+')) c = c.slice(1);
            if (c.startsWith('0')) c = '90' + c.slice(1);
            if (c.length === 10 && c.startsWith('5')) c = '90' + c;
            return c;
        })();

        const link = getInvoiceLink(req, invoice.id);
        const total = `${Number(invoice.grandTotal).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ${invoice.currency}`;
        const text = req.body?.message
            || `Sayın ${invoice.counterpartyName || ''}, ${invoice.invoiceNo} numaralı faturanız hazırlanmıştır. Toplam: ${total}. Görüntüle: ${link}`;

        const provider = (wa.provider || 'META').toUpperCase();
        if (provider === 'META') {
            if (!wa.metaPhoneNumberId || !wa.metaAccessTokenEnc) {
                return res.status(400).json({ success: false, error: 'Meta WhatsApp ayarları eksik' });
            }
            const token = uetdsService.decrypt(wa.metaAccessTokenEnc);
            await axios.post(
                `https://graph.facebook.com/v18.0/${wa.metaPhoneNumberId}/messages`,
                { messaging_product: 'whatsapp', to: normalized, type: 'text', text: { body: text } },
                { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, timeout: 15000 }
            );
        } else if (provider === 'GREEN') {
            if (!wa.greenInstanceId || !wa.greenApiTokenEnc) {
                return res.status(400).json({ success: false, error: 'Green API ayarları eksik' });
            }
            const token = uetdsService.decrypt(wa.greenApiTokenEnc);
            await axios.post(
                `https://api.green-api.com/waInstance${wa.greenInstanceId}/sendMessage/${token}`,
                { chatId: `${normalized}@c.us`, message: text },
                { timeout: 15000 }
            );
        } else if (provider === 'WEBHOOK') {
            if (!wa.webhookUrl) return res.status(400).json({ success: false, error: 'Webhook URL gerekli' });
            const secret = wa.webhookSecretEnc ? uetdsService.decrypt(wa.webhookSecretEnc) : null;
            const headers = { 'Content-Type': 'application/json' };
            if (secret) headers['X-Webhook-Secret'] = secret;
            await axios.post(wa.webhookUrl, { phone: normalized, message: text, invoiceId: invoice.id, invoiceLink: link }, { headers, timeout: 15000 });
        } else {
            return res.status(400).json({ success: false, error: 'Sağlayıcı desteklenmiyor' });
        }
        res.json({ success: true, message: `WhatsApp gönderildi: ${normalized}` });
    } catch (error) {
        const apiErr = error.response?.data?.error?.message || error.response?.data?.error || error.message;
        console.error('Invoice send-whatsapp error:', apiErr);
        res.status(500).json({ success: false, error: apiErr });
    }
});

// ─────────────────────────────────────────────────────────────────
// BOOKING → INVOICE bridge
// ─────────────────────────────────────────────────────────────────
router.get('/invoices/booking-candidates', authMiddleware, async (req, res) => {
    const scope = ensurePartner(req, res);
    if (!scope) return;
    try {
        // Partner-owned completed bookings (confirmedBy partner)
        const bookings = await prisma.booking.findMany({
            where: {
                tenantId: scope.tenantId,
                confirmedBy: scope.partnerId,
                productType: 'TRANSFER',
                status: 'COMPLETED',
            },
            orderBy: { updatedAt: 'desc' },
            take: 200,
        });

        // Exclude ones that already have a partner invoice via metadata.partnerInvoiceId
        const invoicedBookingIds = await prisma.partnerInvoice.findMany({
            where: { tenantId: scope.tenantId, partnerId: scope.partnerId, metadata: { path: ['bookingId'], not: null } },
            select: { metadata: true },
        });
        const usedSet = new Set(invoicedBookingIds.map((i) => i.metadata?.bookingId).filter(Boolean));

        const data = bookings
            .filter((b) => !usedSet.has(b.id))
            .map((b) => ({
                id: b.id,
                bookingNumber: b.bookingNumber,
                customerName: b.contactName,
                phone: b.contactPhone,
                email: b.contactEmail,
                pickup: b.metadata?.pickup,
                dropoff: b.metadata?.dropoff,
                date: b.startDate,
                total: Number(b.total || 0),
                currency: b.currency,
                pax: b.adults,
                vehicleType: b.metadata?.vehicleType,
            }));
        res.json({ success: true, data });
    } catch (error) {
        console.error('Booking candidates error:', error);
        res.status(500).json({ success: false, error: 'Aday rezervasyonlar alınamadı' });
    }
});

router.post('/invoices/from-booking', authMiddleware, async (req, res) => {
    const scope = ensurePartner(req, res);
    if (!scope) return;
    try {
        const { bookingId, kind = 'EARCHIVE', taxRate = 20, accountId } = req.body || {};
        if (!bookingId) return res.status(400).json({ success: false, error: 'bookingId gerekli' });
        const booking = await prisma.booking.findFirst({
            where: { id: bookingId, tenantId: scope.tenantId, confirmedBy: scope.partnerId, productType: 'TRANSFER' },
        });
        if (!booking) return res.status(404).json({ success: false, error: 'Rezervasyon bulunamadı veya size ait değil' });

        // Compute base price excluding tax
        const total = Number(booking.total || 0);
        const grossWithTax = total;
        const taxBase = round2(grossWithTax / (1 + Number(taxRate) / 100));
        const taxAmount = round2(grossWithTax - taxBase);
        const description = `Transfer hizmeti · ${booking.metadata?.pickup || ''} → ${booking.metadata?.dropoff || ''} · ${new Date(booking.startDate).toLocaleDateString('tr-TR')}`;

        const invoiceNo = await nextInvoiceNo(scope, 'SALES');
        const account = accountId
            ? await prisma.partnerAccount.findFirst({ where: { id: accountId, tenantId: scope.tenantId, partnerId: scope.partnerId } })
            : null;

        const invoice = await prisma.partnerInvoice.create({
            data: {
                tenantId: scope.tenantId,
                partnerId: scope.partnerId,
                invoiceNo,
                type: 'SALES',
                kind,
                status: 'DRAFT',
                accountId: account?.id || null,
                counterpartyName: account?.name || booking.contactName,
                counterpartyTaxNumber: account?.taxNumber || null,
                counterpartyTaxOffice: account?.taxOffice || null,
                counterpartyAddress: account?.address || null,
                counterpartyEmail: account?.email || booking.contactEmail,
                counterpartyPhone: account?.phone || booking.contactPhone,
                issueDate: new Date(),
                currency: booking.currency || 'TRY',
                subtotal: taxBase,
                taxTotal: taxAmount,
                grandTotal: grossWithTax,
                paidTotal: 0,
                eInvoiceScenario: kind === 'EFATURA' ? 'COMMERCIAL' : 'EARCHIVE',
                metadata: { bookingId: booking.id, bookingNumber: booking.bookingNumber },
                createdById: scope.partnerId,
                items: {
                    create: [{
                        lineNo: 1,
                        description,
                        quantity: 1,
                        unit: 'ADET',
                        unitPrice: taxBase,
                        discountRate: 0,
                        taxRate: Number(taxRate),
                        withholdingRate: 0,
                        subtotal: taxBase,
                        discount: 0,
                        taxBase,
                        taxAmount,
                        withholding: 0,
                        total: grossWithTax,
                    }],
                },
            },
            include: { items: true },
        });

        res.json({ success: true, data: invoice });
    } catch (error) {
        console.error('From-booking invoice error:', error);
        res.status(500).json({ success: false, error: 'Fatura oluşturulamadı' });
    }
});

// ─────────────────────────────────────────────────────────────────
// TCMB FX RATES (cached)
// ─────────────────────────────────────────────────────────────────
let _fxCache = { at: 0, data: null };
router.get('/fx/rates', authMiddleware, async (req, res) => {
    const scope = ensurePartner(req, res);
    if (!scope) return;
    try {
        const now = Date.now();
        if (_fxCache.data && now - _fxCache.at < 30 * 60 * 1000) {
            return res.json({ success: true, data: _fxCache.data, cached: true });
        }
        const r = await axios.get('https://www.tcmb.gov.tr/kurlar/today.xml', { timeout: 12000 });
        const xml = r.data;
        // Lightweight XML parsing for the rates we care about
        const pickRate = (code) => {
            const block = xml.match(new RegExp(`<Currency[^>]+CurrencyCode="${code}"[\\s\\S]*?</Currency>`));
            if (!block) return null;
            const fb = (k) => {
                const m = block[0].match(new RegExp(`<${k}>([^<]+)</${k}>`));
                return m ? Number(m[1].replace(',', '.')) : null;
            };
            return { code, forexBuying: fb('ForexBuying'), forexSelling: fb('ForexSelling'), banknoteBuying: fb('BanknoteBuying'), banknoteSelling: fb('BanknoteSelling') };
        };
        const data = {
            updatedAt: new Date().toISOString(),
            rates: ['USD', 'EUR', 'GBP', 'CHF', 'JPY'].map(pickRate).filter(Boolean),
        };
        _fxCache = { at: now, data };
        res.json({ success: true, data });
    } catch (error) {
        console.error('TCMB FX error:', error.message);
        res.status(500).json({ success: false, error: 'Döviz kuru alınamadı' });
    }
});

// ─────────────────────────────────────────────────────────────────
// CSV EXPORT — universal
// ─────────────────────────────────────────────────────────────────
function csvOf(rows, columns) {
    const esc = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
    const header = columns.map((c) => esc(c.label)).join(',');
    const body = rows.map((r) => columns.map((c) => esc(typeof c.value === 'function' ? c.value(r) : r[c.value])).join(',')).join('\n');
    return `${header}\n${body}`;
}

function sendCsv(res, filename, csv) {
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="${filename}-${new Date().toISOString().slice(0, 10)}.csv"`);
    // BOM for Excel UTF-8
    res.send('\uFEFF' + csv);
}

router.get('/exports/:resource', authMiddleware, async (req, res) => {
    const scope = ensurePartner(req, res);
    if (!scope) return;
    try {
        const where = { tenantId: scope.tenantId, partnerId: scope.partnerId };
        const r = req.params.resource;
        if (r === 'accounts') {
            const rows = await prisma.partnerAccount.findMany({ where, orderBy: { name: 'asc' } });
            return sendCsv(res, 'cariler', csvOf(rows, [
                { label: 'Kod', value: 'code' }, { label: 'Ad', value: 'name' }, { label: 'Tip', value: 'type' },
                { label: 'VKN/TCKN', value: 'taxNumber' }, { label: 'Vergi Dairesi', value: 'taxOffice' },
                { label: 'Telefon', value: 'phone' }, { label: 'E-Posta', value: 'email' },
                { label: 'Borç', value: 'debit' }, { label: 'Alacak', value: 'credit' }, { label: 'Bakiye', value: 'balance' },
                { label: 'Para Birimi', value: 'currency' }, { label: 'Aktif', value: 'isActive' },
            ]));
        }
        if (r === 'invoices') {
            const rows = await prisma.partnerInvoice.findMany({ where, orderBy: { issueDate: 'desc' } });
            return sendCsv(res, 'faturalar', csvOf(rows, [
                { label: 'No', value: 'invoiceNo' }, { label: 'Tarih', value: (x) => new Date(x.issueDate).toISOString().slice(0, 10) },
                { label: 'Tip', value: 'type' }, { label: 'Tür', value: 'kind' }, { label: 'Durum', value: 'status' },
                { label: 'Cari', value: 'counterpartyName' }, { label: 'VKN', value: 'counterpartyTaxNumber' },
                { label: 'Ara Toplam', value: 'subtotal' }, { label: 'KDV', value: 'taxTotal' },
                { label: 'Toplam', value: 'grandTotal' }, { label: 'Ödenen', value: 'paidTotal' },
                { label: 'Para Birimi', value: 'currency' },
            ]));
        }
        if (r === 'cash') {
            const rows = await prisma.partnerCashEntry.findMany({ where, orderBy: { date: 'desc' } });
            return sendCsv(res, 'kasa-banka', csvOf(rows, [
                { label: 'Tarih', value: (x) => new Date(x.date).toISOString() },
                { label: 'Hesap', value: 'accountKey' }, { label: 'Tip', value: 'accountType' },
                { label: 'Yön', value: 'direction' }, { label: 'Tutar', value: 'amount' },
                { label: 'Para Birimi', value: 'currency' }, { label: 'Açıklama', value: 'description' },
            ]));
        }
        if (r === 'collections') {
            const rows = await prisma.partnerDriverCollection.findMany({ where, orderBy: { date: 'desc' } });
            return sendCsv(res, 'sofor-tahsilatlari', csvOf(rows, [
                { label: 'Tarih', value: (x) => new Date(x.date).toISOString() },
                { label: 'Şoför ID', value: 'driverId' }, { label: 'Tutar', value: 'amount' },
                { label: 'Para Birimi', value: 'currency' }, { label: 'Yöntem', value: 'method' },
                { label: 'Durum', value: 'status' }, { label: 'Not', value: 'notes' },
            ]));
        }
        if (r === 'employees') {
            const rows = await prisma.partnerEmployee.findMany({ where, orderBy: { firstName: 'asc' } });
            return sendCsv(res, 'personel', csvOf(rows, [
                { label: 'Ad', value: 'firstName' }, { label: 'Soyad', value: 'lastName' }, { label: 'TCKN', value: 'identityNo' },
                { label: 'Görev', value: 'jobTitle' }, { label: 'Departman', value: 'department' },
                { label: 'Telefon', value: 'phone' }, { label: 'E-Posta', value: 'email' },
                { label: 'İşe Giriş', value: (x) => x.hireDate ? new Date(x.hireDate).toISOString().slice(0, 10) : '' },
                { label: 'Maaş', value: 'baseSalary' }, { label: 'IBAN', value: 'iban' }, { label: 'Banka', value: 'bankName' },
                { label: 'SGK No', value: 'sgkNumber' }, { label: 'Durum', value: 'status' },
            ]));
        }
        if (r === 'payroll') {
            const rows = await prisma.partnerPayrollEntry.findMany({ where, orderBy: { date: 'desc' }, include: { employee: true } });
            return sendCsv(res, 'hakedis-maas', csvOf(rows, [
                { label: 'Tarih', value: (x) => new Date(x.date).toISOString().slice(0, 10) },
                { label: 'Personel', value: (x) => `${x.employee?.firstName || ''} ${x.employee?.lastName || ''}`.trim() },
                { label: 'Tür', value: 'type' }, { label: 'Dönem', value: (x) => x.periodYear ? `${x.periodMonth}/${x.periodYear}` : '' },
                { label: 'Tutar', value: 'amount' }, { label: 'Para Birimi', value: 'currency' },
                { label: 'Ödendi', value: 'paid' }, { label: 'Açıklama', value: 'description' },
            ]));
        }
        if (r === 'leaves') {
            const rows = await prisma.partnerLeave.findMany({ where, orderBy: { startDate: 'desc' }, include: { employee: true } });
            return sendCsv(res, 'izinler', csvOf(rows, [
                { label: 'Personel', value: (x) => `${x.employee?.firstName || ''} ${x.employee?.lastName || ''}`.trim() },
                { label: 'Tür', value: 'type' },
                { label: 'Başlangıç', value: (x) => new Date(x.startDate).toISOString().slice(0, 10) },
                { label: 'Bitiş', value: (x) => new Date(x.endDate).toISOString().slice(0, 10) },
                { label: 'Gün', value: 'days' }, { label: 'Durum', value: 'status' }, { label: 'Sebep', value: 'reason' },
            ]));
        }
        res.status(400).json({ success: false, error: 'Desteklenmeyen kaynak' });
    } catch (error) {
        console.error('CSV export error:', error);
        res.status(500).json({ success: false, error: 'Export başarısız' });
    }
});

// ─────────────────────────────────────────────────────────────────
// XLSX EXPORT — Excel zengin biçim
// ─────────────────────────────────────────────────────────────────
const ExcelJS = require('exceljs');

async function buildXlsx({ title, columns, rows }) {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'SmartTransfer';
    wb.created = new Date();
    const ws = wb.addWorksheet(title.substring(0, 30) || 'Sayfa', {
        views: [{ state: 'frozen', ySplit: 1 }],
    });
    ws.columns = columns.map((c) => ({ header: c.label, key: c.value || c.key, width: c.width || 18 }));
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
    ws.getRow(1).alignment = { vertical: 'middle' };
    ws.getRow(1).height = 22;

    rows.forEach((r) => {
        const out = {};
        columns.forEach((c) => {
            const v = typeof c.value === 'function' ? c.value(r) : r[c.value];
            out[c.value || c.key] = v;
        });
        ws.addRow(out);
    });
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };

    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf);
}

function sendXlsx(res, filename, buffer) {
    res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.set('Content-Disposition', `attachment; filename="${filename}-${new Date().toISOString().slice(0, 10)}.xlsx"`);
    res.send(buffer);
}

router.get('/exports/:resource.xlsx', authMiddleware, async (req, res) => {
    const scope = ensurePartner(req, res);
    if (!scope) return;
    try {
        const where = { tenantId: scope.tenantId, partnerId: scope.partnerId };
        const r = req.params.resource;
        const colsMap = {
            accounts: [
                { label: 'Kod', value: 'code', width: 14 },
                { label: 'Ad', value: 'name', width: 32 },
                { label: 'Tip', value: 'type', width: 14 },
                { label: 'VKN/TCKN', value: 'taxNumber', width: 16 },
                { label: 'Vergi Dairesi', value: 'taxOffice', width: 18 },
                { label: 'Telefon', value: 'phone', width: 16 },
                { label: 'E-Posta', value: 'email', width: 26 },
                { label: 'Borç', value: (x) => Number(x.debit), width: 14 },
                { label: 'Alacak', value: (x) => Number(x.credit), width: 14 },
                { label: 'Bakiye', value: (x) => Number(x.balance), width: 14 },
                { label: 'Para Birimi', value: 'currency', width: 10 },
                { label: 'Aktif', value: 'isActive', width: 8 },
            ],
            invoices: [
                { label: 'No', value: 'invoiceNo', width: 18 },
                { label: 'Tarih', value: (x) => new Date(x.issueDate).toLocaleDateString('tr-TR'), width: 12 },
                { label: 'Tip', value: 'type', width: 12 },
                { label: 'Tür', value: 'kind', width: 12 },
                { label: 'Durum', value: 'status', width: 12 },
                { label: 'Cari', value: 'counterpartyName', width: 30 },
                { label: 'VKN', value: 'counterpartyTaxNumber', width: 16 },
                { label: 'Ara Toplam', value: (x) => Number(x.subtotal), width: 14 },
                { label: 'KDV', value: (x) => Number(x.taxTotal), width: 12 },
                { label: 'Toplam', value: (x) => Number(x.grandTotal), width: 14 },
                { label: 'Ödenen', value: (x) => Number(x.paidTotal), width: 14 },
                { label: 'Para Birimi', value: 'currency', width: 10 },
            ],
            cash: [
                { label: 'Tarih', value: (x) => new Date(x.date).toLocaleString('tr-TR'), width: 18 },
                { label: 'Hesap', value: 'accountKey', width: 18 },
                { label: 'Tip', value: 'accountType', width: 10 },
                { label: 'Yön', value: 'direction', width: 8 },
                { label: 'Tutar', value: (x) => Number(x.amount), width: 14 },
                { label: 'Para Birimi', value: 'currency', width: 10 },
                { label: 'Açıklama', value: 'description', width: 40 },
            ],
            collections: [
                { label: 'Tarih', value: (x) => new Date(x.date).toLocaleString('tr-TR'), width: 18 },
                { label: 'Şoför ID', value: 'driverId', width: 36 },
                { label: 'Tutar', value: (x) => Number(x.amount), width: 12 },
                { label: 'Para Birimi', value: 'currency', width: 10 },
                { label: 'Yöntem', value: 'method', width: 10 },
                { label: 'Durum', value: 'status', width: 12 },
                { label: 'Not', value: 'notes', width: 30 },
            ],
            employees: [
                { label: 'Ad', value: 'firstName', width: 14 },
                { label: 'Soyad', value: 'lastName', width: 14 },
                { label: 'TCKN', value: 'identityNo', width: 14 },
                { label: 'Görev', value: 'jobTitle', width: 16 },
                { label: 'Departman', value: 'department', width: 14 },
                { label: 'Telefon', value: 'phone', width: 16 },
                { label: 'E-Posta', value: 'email', width: 26 },
                { label: 'İşe Giriş', value: (x) => x.hireDate ? new Date(x.hireDate).toLocaleDateString('tr-TR') : '', width: 12 },
                { label: 'Maaş', value: (x) => x.baseSalary ? Number(x.baseSalary) : '', width: 12 },
                { label: 'IBAN', value: 'iban', width: 30 },
                { label: 'Banka', value: 'bankName', width: 16 },
                { label: 'SGK No', value: 'sgkNumber', width: 16 },
                { label: 'Durum', value: 'status', width: 12 },
            ],
            payroll: [
                { label: 'Tarih', value: (x) => new Date(x.date).toLocaleDateString('tr-TR'), width: 12 },
                { label: 'Personel', value: (x) => `${x.employee?.firstName || ''} ${x.employee?.lastName || ''}`.trim(), width: 24 },
                { label: 'Tür', value: 'type', width: 14 },
                { label: 'Dönem', value: (x) => (x.periodYear ? `${x.periodMonth}/${x.periodYear}` : ''), width: 10 },
                { label: 'Tutar', value: (x) => Number(x.amount), width: 14 },
                { label: 'Para Birimi', value: 'currency', width: 10 },
                { label: 'Ödendi', value: 'paid', width: 8 },
                { label: 'Açıklama', value: 'description', width: 30 },
            ],
            leaves: [
                { label: 'Personel', value: (x) => `${x.employee?.firstName || ''} ${x.employee?.lastName || ''}`.trim(), width: 24 },
                { label: 'Tür', value: 'type', width: 14 },
                { label: 'Başlangıç', value: (x) => new Date(x.startDate).toLocaleDateString('tr-TR'), width: 12 },
                { label: 'Bitiş', value: (x) => new Date(x.endDate).toLocaleDateString('tr-TR'), width: 12 },
                { label: 'Gün', value: 'days', width: 6 },
                { label: 'Durum', value: 'status', width: 12 },
                { label: 'Sebep', value: 'reason', width: 30 },
            ],
        };
        if (!colsMap[r]) return res.status(400).json({ success: false, error: 'Desteklenmeyen kaynak' });
        let rows;
        if (r === 'accounts') rows = await prisma.partnerAccount.findMany({ where, orderBy: { name: 'asc' } });
        else if (r === 'invoices') rows = await prisma.partnerInvoice.findMany({ where, orderBy: { issueDate: 'desc' } });
        else if (r === 'cash') rows = await prisma.partnerCashEntry.findMany({ where, orderBy: { date: 'desc' } });
        else if (r === 'collections') rows = await prisma.partnerDriverCollection.findMany({ where, orderBy: { date: 'desc' } });
        else if (r === 'employees') rows = await prisma.partnerEmployee.findMany({ where, orderBy: { firstName: 'asc' } });
        else if (r === 'payroll') rows = await prisma.partnerPayrollEntry.findMany({ where, orderBy: { date: 'desc' }, include: { employee: true } });
        else if (r === 'leaves') rows = await prisma.partnerLeave.findMany({ where, orderBy: { startDate: 'desc' }, include: { employee: true } });
        const buf = await buildXlsx({ title: r, columns: colsMap[r], rows });
        sendXlsx(res, r, buf);
    } catch (error) {
        console.error('XLSX export error:', error);
        res.status(500).json({ success: false, error: 'Excel export başarısız' });
    }
});

// ─────────────────────────────────────────────────────────────────
// BANK STATEMENT IMPORT — CSV / MT940 (lite)
// ─────────────────────────────────────────────────────────────────
function parseCsvBankStatement(text) {
    const lines = text.replace(/\r/g, '').split('\n').filter(Boolean);
    if (!lines.length) return [];
    // Detect delimiter
    const header = lines[0];
    const delim = header.includes(';') ? ';' : ',';
    const parts = (s) => {
        // Naive CSV parser respecting double-quoted commas
        const out = [];
        let cur = '';
        let inQ = false;
        for (let i = 0; i < s.length; i++) {
            const ch = s[i];
            if (ch === '"') { inQ = !inQ; continue; }
            if (!inQ && ch === delim) { out.push(cur); cur = ''; continue; }
            cur += ch;
        }
        out.push(cur);
        return out;
    };
    const cols = parts(header).map((c) => c.trim().toLowerCase());
    const find = (...keys) => {
        for (const k of keys) {
            const idx = cols.findIndex((c) => c === k.toLowerCase());
            if (idx >= 0) return idx;
        }
        for (const k of keys) {
            const idx = cols.findIndex((c) => c.includes(k.toLowerCase()));
            if (idx >= 0) return idx;
        }
        return -1;
    };
    const iDate = find('date', 'tarih', 'işlem tarihi', 'transaction_date', 'islem_tarihi');
    const iDesc = find('description', 'aciklama', 'açıklama', 'narration', 'detay');
    const iAmount = find('amount', 'tutar', 'transaction_amount', 'amount_try');
    const iDebit = find('debit', 'borc', 'borç', 'odeme', 'cikis', 'çıkış');
    const iCredit = find('credit', 'alacak', 'tahsilat', 'giris', 'giriş');
    const iCurrency = find('currency', 'para birimi', 'para_birimi', 'ccy');

    const out = [];
    for (let i = 1; i < lines.length; i++) {
        const row = parts(lines[i]);
        if (!row.length || row.every((v) => !v?.trim())) continue;
        const rawDate = iDate >= 0 ? row[iDate] : null;
        const rawDesc = iDesc >= 0 ? row[iDesc] : '';
        let amount = 0;
        let direction = null;
        if (iAmount >= 0) {
            amount = Number(String(row[iAmount] || '0').replace(/\./g, '').replace(',', '.').replace(/[^\d.\-]/g, ''));
            direction = amount >= 0 ? 'IN' : 'OUT';
            amount = Math.abs(amount);
        } else {
            const dr = iDebit >= 0 ? Number(String(row[iDebit] || '0').replace(/\./g, '').replace(',', '.').replace(/[^\d.\-]/g, '')) : 0;
            const cr = iCredit >= 0 ? Number(String(row[iCredit] || '0').replace(/\./g, '').replace(',', '.').replace(/[^\d.\-]/g, '')) : 0;
            if (cr > 0) { amount = cr; direction = 'IN'; }
            else if (dr > 0) { amount = dr; direction = 'OUT'; }
        }
        const currency = iCurrency >= 0 ? String(row[iCurrency] || 'TRY').trim().toUpperCase() : 'TRY';
        // Date parsing: DD.MM.YYYY or DD/MM/YYYY or ISO
        let dateObj = null;
        if (rawDate) {
            const m = String(rawDate).match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
            if (m) {
                const yy = m[3].length === 2 ? Number('20' + m[3]) : Number(m[3]);
                dateObj = new Date(yy, Number(m[2]) - 1, Number(m[1]));
            } else if (!isNaN(Date.parse(rawDate))) {
                dateObj = new Date(rawDate);
            }
        }
        if (amount > 0 && direction && dateObj) {
            out.push({ date: dateObj.toISOString(), direction, amount, currency, description: String(rawDesc || '').trim() });
        }
    }
    return out;
}

function parseMt940(text) {
    // Very small subset: parse :61: lines and :86: narrations
    const out = [];
    const lines = text.replace(/\r/g, '').split('\n');
    let pendingNarration = null;
    let pendingTx = null;
    for (const raw of lines) {
        const line = raw.trim();
        if (line.startsWith(':61:')) {
            // commit previous
            if (pendingTx) {
                pendingTx.description = pendingNarration || '';
                out.push(pendingTx);
                pendingNarration = null;
            }
            // :61:YYMMDD<DC>amountN<typecode>refs
            const m = line.match(/^:61:(\d{6})\d{0,4}(C|D|CR|DR|RC|RD)([\d,]+)/);
            if (m) {
                const yy = Number(m[1].substring(0, 2));
                const mm = Number(m[1].substring(2, 4)) - 1;
                const dd = Number(m[1].substring(4, 6));
                const year = (yy >= 70 ? 1900 : 2000) + yy;
                const direction = /^C/i.test(m[2]) ? 'IN' : 'OUT';
                const amount = Number(m[3].replace(',', '.'));
                pendingTx = { date: new Date(year, mm, dd).toISOString(), direction, amount, currency: 'TRY' };
            }
        } else if (line.startsWith(':86:')) {
            pendingNarration = (pendingNarration ? pendingNarration + ' ' : '') + line.substring(4).trim();
        } else if (pendingNarration != null && line && !line.startsWith(':')) {
            pendingNarration += ' ' + line;
        }
    }
    if (pendingTx) {
        pendingTx.description = pendingNarration || '';
        out.push(pendingTx);
    }
    return out;
}

router.post('/bank-import/preview', authMiddleware, async (req, res) => {
    const scope = ensurePartner(req, res);
    if (!scope) return;
    try {
        const { format = 'CSV', content } = req.body || {};
        if (!content) return res.status(400).json({ success: false, error: 'İçerik boş' });
        const parsed = format.toUpperCase() === 'MT940' ? parseMt940(String(content)) : parseCsvBankStatement(String(content));
        res.json({ success: true, data: parsed });
    } catch (error) {
        console.error('Bank import preview error:', error);
        res.status(500).json({ success: false, error: 'İçerik çözümlenemedi' });
    }
});

router.post('/bank-import/apply', authMiddleware, async (req, res) => {
    const scope = ensurePartner(req, res);
    if (!scope) return;
    try {
        const { accountKey = 'BANK_DEFAULT', entries = [] } = req.body || {};
        if (!Array.isArray(entries) || !entries.length) return res.status(400).json({ success: false, error: 'Aktarılacak kayıt yok' });
        let imported = 0;
        for (const e of entries) {
            const amount = Number(e.amount);
            if (!(amount > 0)) continue;
            await prisma.partnerCashEntry.create({
                data: {
                    tenantId: scope.tenantId,
                    partnerId: scope.partnerId,
                    accountType: 'BANK',
                    accountKey,
                    currency: e.currency || 'TRY',
                    date: e.date ? new Date(e.date) : new Date(),
                    direction: e.direction === 'OUT' ? 'OUT' : 'IN',
                    amount,
                    description: e.description || 'Banka aktarımı',
                    refType: 'BANK_IMPORT',
                    createdById: scope.partnerId,
                    metadata: { source: 'BANK_IMPORT' },
                },
            });
            imported++;
        }
        res.json({ success: true, imported });
    } catch (error) {
        console.error('Bank import apply error:', error);
        res.status(500).json({ success: false, error: 'Aktarım başarısız' });
    }
});

// ─────────────────────────────────────────────────────────────────
// PERIOD REPORTS — Gelir Tablosu, Mizan, Kâr-Zarar
// ─────────────────────────────────────────────────────────────────
function parsePeriod(req) {
    const now = new Date();
    const from = req.query.from ? new Date(String(req.query.from)) : new Date(now.getFullYear(), now.getMonth(), 1);
    const to = req.query.to ? new Date(String(req.query.to)) : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    return { from, to };
}

router.get('/reports/income-statement', authMiddleware, async (req, res) => {
    const scope = ensurePartner(req, res);
    if (!scope) return;
    try {
        const { from, to } = parsePeriod(req);
        const baseWhere = { tenantId: scope.tenantId, partnerId: scope.partnerId };

        const [invSalesAgg, invPurchaseAgg, invExpenseAgg, cashInAgg, cashOutAgg, payrollAgg, financeIncome, financeExpense] = await Promise.all([
            prisma.partnerInvoice.aggregate({
                where: { ...baseWhere, type: 'SALES', status: { in: ['APPROVED', 'SENT', 'ACCEPTED', 'PAID', 'PARTIALLY_PAID'] }, issueDate: { gte: from, lte: to } },
                _sum: { subtotal: true, taxTotal: true, grandTotal: true, paidTotal: true },
                _count: true,
            }),
            prisma.partnerInvoice.aggregate({
                where: { ...baseWhere, type: 'PURCHASE', status: { in: ['APPROVED', 'SENT', 'ACCEPTED', 'PAID', 'PARTIALLY_PAID'] }, issueDate: { gte: from, lte: to } },
                _sum: { subtotal: true, taxTotal: true, grandTotal: true, paidTotal: true },
                _count: true,
            }),
            prisma.partnerInvoice.aggregate({
                where: { ...baseWhere, type: 'EXPENSE', status: { in: ['APPROVED', 'PAID', 'PARTIALLY_PAID'] }, issueDate: { gte: from, lte: to } },
                _sum: { grandTotal: true },
                _count: true,
            }),
            prisma.partnerCashEntry.aggregate({
                where: { ...baseWhere, direction: 'IN', date: { gte: from, lte: to } },
                _sum: { amount: true },
            }),
            prisma.partnerCashEntry.aggregate({
                where: { ...baseWhere, direction: 'OUT', date: { gte: from, lte: to } },
                _sum: { amount: true },
            }),
            prisma.partnerPayrollEntry.groupBy({
                by: ['type'],
                where: { ...baseWhere, date: { gte: from, lte: to } },
                _sum: { amount: true },
            }),
            prisma.partnerFinanceEntry.aggregate({
                where: { ...baseWhere, type: 'INCOME', date: { gte: from, lte: to } },
                _sum: { amount: true },
            }),
            prisma.partnerFinanceEntry.aggregate({
                where: { ...baseWhere, type: 'EXPENSE', date: { gte: from, lte: to } },
                _sum: { amount: true },
            }),
        ]);

        const revenue = Number(invSalesAgg._sum.subtotal || 0) + Number(financeIncome._sum.amount || 0);
        const cogs = Number(invPurchaseAgg._sum.subtotal || 0);
        const grossProfit = revenue - cogs;
        const operatingExpenses = Number(invExpenseAgg._sum.grandTotal || 0) + Number(financeExpense._sum.amount || 0);
        const payrollByType = {};
        let totalPayroll = 0;
        payrollAgg.forEach((p) => { payrollByType[p.type] = Number(p._sum.amount || 0); totalPayroll += Number(p._sum.amount || 0); });
        const ebit = grossProfit - operatingExpenses - totalPayroll;

        res.json({
            success: true,
            data: {
                period: { from, to },
                revenue: {
                    salesNet: Number(invSalesAgg._sum.subtotal || 0),
                    salesGross: Number(invSalesAgg._sum.grandTotal || 0),
                    salesCount: invSalesAgg._count,
                    otherIncome: Number(financeIncome._sum.amount || 0),
                    total: revenue,
                },
                costs: {
                    purchasesNet: Number(invPurchaseAgg._sum.subtotal || 0),
                    purchasesCount: invPurchaseAgg._count,
                    total: cogs,
                },
                grossProfit,
                operatingExpenses: {
                    invoiceExpenses: Number(invExpenseAgg._sum.grandTotal || 0),
                    otherExpenses: Number(financeExpense._sum.amount || 0),
                    total: operatingExpenses,
                },
                payroll: { byType: payrollByType, total: totalPayroll },
                ebit,
                cashFlow: {
                    inflow: Number(cashInAgg._sum.amount || 0),
                    outflow: Number(cashOutAgg._sum.amount || 0),
                    net: Number(cashInAgg._sum.amount || 0) - Number(cashOutAgg._sum.amount || 0),
                },
            },
        });
    } catch (error) {
        console.error('Income statement error:', error);
        res.status(500).json({ success: false, error: 'Rapor üretilemedi' });
    }
});

router.get('/reports/trial-balance', authMiddleware, async (req, res) => {
    const scope = ensurePartner(req, res);
    if (!scope) return;
    try {
        const accounts = await prisma.partnerAccount.findMany({
            where: { tenantId: scope.tenantId, partnerId: scope.partnerId },
            orderBy: [{ type: 'asc' }, { name: 'asc' }],
        });
        const rows = accounts.map((a) => ({
            id: a.id, code: a.code, name: a.name, type: a.type, currency: a.currency,
            debit: Number(a.debit || 0), credit: Number(a.credit || 0), balance: Number(a.balance || 0),
        }));
        const totals = rows.reduce((acc, r) => ({ debit: acc.debit + r.debit, credit: acc.credit + r.credit }), { debit: 0, credit: 0 });
        res.json({ success: true, data: { rows, totals } });
    } catch (error) {
        console.error('Trial balance error:', error);
        res.status(500).json({ success: false, error: 'Mizan üretilemedi' });
    }
});

router.get('/reports/cash-flow', authMiddleware, async (req, res) => {
    const scope = ensurePartner(req, res);
    if (!scope) return;
    try {
        const { from, to } = parsePeriod(req);
        const entries = await prisma.partnerCashEntry.findMany({
            where: { tenantId: scope.tenantId, partnerId: scope.partnerId, date: { gte: from, lte: to } },
        });
        const byKey = new Map();
        for (const e of entries) {
            const k = e.accountKey;
            if (!byKey.has(k)) byKey.set(k, { accountKey: k, accountType: e.accountType, currency: e.currency, in: 0, out: 0, net: 0 });
            const r = byKey.get(k);
            if (e.direction === 'IN') r.in += Number(e.amount);
            else if (e.direction === 'OUT') r.out += Number(e.amount);
            r.net = round2(r.in - r.out);
        }
        // Daily series
        const daily = new Map();
        for (const e of entries) {
            const day = new Date(e.date).toISOString().slice(0, 10);
            if (!daily.has(day)) daily.set(day, { date: day, in: 0, out: 0, net: 0 });
            const d = daily.get(day);
            if (e.direction === 'IN') d.in += Number(e.amount);
            else if (e.direction === 'OUT') d.out += Number(e.amount);
            d.net = round2(d.in - d.out);
        }
        res.json({ success: true, data: { period: { from, to }, accounts: Array.from(byKey.values()), daily: Array.from(daily.values()).sort((a, b) => a.date.localeCompare(b.date)) } });
    } catch (error) {
        console.error('Cash flow report error:', error);
        res.status(500).json({ success: false, error: 'Nakit akış üretilemedi' });
    }
});

// ─────────────────────────────────────────────────────────────────
// ALERTS — Vade, eksik kimlik, ödenmemiş bordro, kritik stok yok :)
// ─────────────────────────────────────────────────────────────────
router.get('/alerts', authMiddleware, async (req, res) => {
    const scope = ensurePartner(req, res);
    if (!scope) return;
    try {
        const now = new Date();
        const soon = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        const baseWhere = { tenantId: scope.tenantId, partnerId: scope.partnerId };
        const [overdue, upcoming, unpaidPayroll, pendingLeaves, pendingCollections] = await Promise.all([
            prisma.partnerInvoice.findMany({
                where: { ...baseWhere, status: { in: ['APPROVED', 'SENT', 'ACCEPTED', 'PARTIALLY_PAID'] }, dueDate: { not: null, lt: now } },
                orderBy: { dueDate: 'asc' },
                take: 50,
                include: { account: { select: { name: true, phone: true, email: true } } },
            }),
            prisma.partnerInvoice.findMany({
                where: { ...baseWhere, status: { in: ['APPROVED', 'SENT', 'ACCEPTED', 'PARTIALLY_PAID'] }, dueDate: { gte: now, lte: soon } },
                orderBy: { dueDate: 'asc' },
                take: 50,
                include: { account: { select: { name: true, phone: true, email: true } } },
            }),
            prisma.partnerPayrollEntry.findMany({
                where: { ...baseWhere, paid: false },
                orderBy: { date: 'asc' },
                take: 50,
                include: { employee: { select: { firstName: true, lastName: true } } },
            }),
            prisma.partnerLeave.findMany({
                where: { ...baseWhere, status: 'PENDING' },
                orderBy: { startDate: 'asc' },
                take: 30,
                include: { employee: { select: { firstName: true, lastName: true } } },
            }),
            prisma.partnerDriverCollection.findMany({
                where: { ...baseWhere, status: { in: ['PENDING', 'HANDED_OVER'] } },
                orderBy: { date: 'asc' },
                take: 30,
            }),
        ]);

        res.json({
            success: true,
            data: {
                overdueInvoices: overdue.map((i) => ({
                    id: i.id, invoiceNo: i.invoiceNo, dueDate: i.dueDate, daysOverdue: Math.ceil((now.getTime() - new Date(i.dueDate).getTime()) / 86400000),
                    counterparty: i.counterpartyName || i.account?.name, contact: i.counterpartyPhone || i.account?.phone, email: i.counterpartyEmail || i.account?.email,
                    grandTotal: Number(i.grandTotal), paidTotal: Number(i.paidTotal), remaining: Number(i.grandTotal) - Number(i.paidTotal), currency: i.currency,
                })),
                upcomingInvoices: upcoming.map((i) => ({
                    id: i.id, invoiceNo: i.invoiceNo, dueDate: i.dueDate, daysToDue: Math.ceil((new Date(i.dueDate).getTime() - now.getTime()) / 86400000),
                    counterparty: i.counterpartyName || i.account?.name,
                    grandTotal: Number(i.grandTotal), paidTotal: Number(i.paidTotal), remaining: Number(i.grandTotal) - Number(i.paidTotal), currency: i.currency,
                })),
                unpaidPayroll: unpaidPayroll.map((p) => ({
                    id: p.id, type: p.type, amount: Number(p.amount), currency: p.currency, date: p.date,
                    employee: p.employee ? `${p.employee.firstName} ${p.employee.lastName}` : '-',
                })),
                pendingLeaves: pendingLeaves.map((l) => ({
                    id: l.id, type: l.type, startDate: l.startDate, endDate: l.endDate, days: l.days,
                    employee: l.employee ? `${l.employee.firstName} ${l.employee.lastName}` : '-',
                })),
                pendingCollections: pendingCollections.map((c) => ({
                    id: c.id, driverId: c.driverId, amount: Number(c.amount), currency: c.currency, status: c.status, date: c.date,
                })),
            },
        });
    } catch (error) {
        console.error('Alerts error:', error);
        res.status(500).json({ success: false, error: 'Uyarılar alınamadı' });
    }
});

router.post('/alerts/remind-overdue', authMiddleware, async (req, res) => {
    const scope = ensurePartner(req, res);
    if (!scope) return;
    try {
        const { channel = 'EMAIL', invoiceIds = [] } = req.body || {};
        const ids = Array.isArray(invoiceIds) ? invoiceIds : [];
        if (!ids.length) return res.status(400).json({ success: false, error: 'Fatura seçilmedi' });
        const invoices = await prisma.partnerInvoice.findMany({
            where: { id: { in: ids }, tenantId: scope.tenantId, partnerId: scope.partnerId },
        });
        const profile = await prisma.partnerProfile.findUnique({ where: { userId: scope.partnerId } });
        const partner = await prisma.user.findUnique({ where: { id: scope.partnerId } });
        let sent = 0;
        const errors = [];

        for (const inv of invoices) {
            try {
                if (channel === 'EMAIL') {
                    const email = profile?.metadata?.notifications?.email;
                    if (!email || !email.smtpHost || !email.smtpUser || !email.smtpPassEnc) throw new Error('SMTP yapılandırılmamış');
                    if (!inv.counterpartyEmail) throw new Error('Alıcı e-posta yok');
                    const nodemailer = require('nodemailer');
                    const transporter = nodemailer.createTransport({
                        host: email.smtpHost,
                        port: Number(email.smtpPort) || 587,
                        secure: !!email.smtpSecure || Number(email.smtpPort) === 465,
                        auth: { user: email.smtpUser, pass: uetdsService.decrypt(email.smtpPassEnc) },
                        tls: { rejectUnauthorized: false },
                    });
                    const fromName = email.senderName || profile?.companyName || partner?.fullName || 'Partner';
                    const fromAddr = email.senderEmail || email.smtpUser;
                    const days = Math.ceil((Date.now() - new Date(inv.dueDate).getTime()) / 86400000);
                    const total = `${Number(inv.grandTotal).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ${inv.currency}`;
                    const remaining = `${(Number(inv.grandTotal) - Number(inv.paidTotal)).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ${inv.currency}`;
                    await transporter.sendMail({
                        from: `"${fromName}" <${fromAddr}>`,
                        to: inv.counterpartyEmail,
                        subject: `Hatırlatma · Fatura ${inv.invoiceNo} (${days} gün vadesi geçti)`,
                        html: `<p>Sayın ${inv.counterpartyName || ''},</p>
<p><b>${inv.invoiceNo}</b> numaralı faturanızın vadesi <b>${days}</b> gün geçmiştir.</p>
<p>Toplam: <b>${total}</b><br/>Kalan: <b style="color:#b91c1c;">${remaining}</b></p>
<p>En kısa sürede ödeme yapmanızı rica ederiz.</p>`,
                    });
                } else if (channel === 'WHATSAPP') {
                    const wa = profile?.metadata?.notifications?.whatsapp;
                    if (!wa || !wa.enabled) throw new Error('WhatsApp aktif değil');
                    if (!inv.counterpartyPhone) throw new Error('Telefon yok');
                    const phone = (() => {
                        let c = String(inv.counterpartyPhone).replace(/[^\d+]/g, '');
                        if (c.startsWith('+')) c = c.slice(1);
                        if (c.startsWith('0')) c = '90' + c.slice(1);
                        if (c.length === 10 && c.startsWith('5')) c = '90' + c;
                        return c;
                    })();
                    const days = Math.ceil((Date.now() - new Date(inv.dueDate).getTime()) / 86400000);
                    const link = getInvoiceLink(req, inv.id);
                    const text = `Sayın ${inv.counterpartyName || ''}, ${inv.invoiceNo} numaralı faturanızın vadesi ${days} gün geçti. Kalan: ${(Number(inv.grandTotal) - Number(inv.paidTotal)).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ${inv.currency}. Detay: ${link}`;
                    const provider = (wa.provider || 'META').toUpperCase();
                    if (provider === 'META') {
                        const token = uetdsService.decrypt(wa.metaAccessTokenEnc);
                        await axios.post(`https://graph.facebook.com/v18.0/${wa.metaPhoneNumberId}/messages`,
                            { messaging_product: 'whatsapp', to: phone, type: 'text', text: { body: text } },
                            { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 });
                    } else if (provider === 'GREEN') {
                        const token = uetdsService.decrypt(wa.greenApiTokenEnc);
                        await axios.post(`https://api.green-api.com/waInstance${wa.greenInstanceId}/sendMessage/${token}`,
                            { chatId: `${phone}@c.us`, message: text }, { timeout: 15000 });
                    } else if (provider === 'WEBHOOK') {
                        const secret = wa.webhookSecretEnc ? uetdsService.decrypt(wa.webhookSecretEnc) : null;
                        const headers = { 'Content-Type': 'application/json' };
                        if (secret) headers['X-Webhook-Secret'] = secret;
                        await axios.post(wa.webhookUrl, { phone, message: text, invoiceId: inv.id }, { headers, timeout: 15000 });
                    }
                }
                sent++;
            } catch (e) {
                errors.push({ invoiceId: inv.id, error: e.message });
            }
        }
        res.json({ success: true, sent, errors });
    } catch (error) {
        console.error('Reminder error:', error);
        res.status(500).json({ success: false, error: 'Hatırlatma gönderilemedi' });
    }
});

// ─────────────────────────────────────────────────────────────────
// UBL TR XML — e-Fatura/e-Arşiv (TR HMRC GIB spesifikasyonu temel)
// ─────────────────────────────────────────────────────────────────
function escapeXml(s) {
    return String(s == null ? '' : s).replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&apos;', '"': '&quot;' }[c]));
}

function buildUblXml({ invoice, items, profile, partner }) {
    const uuid = invoice.eInvoiceUuid || (require('crypto').randomUUID ? require('crypto').randomUUID() : `${invoice.id}`);
    const issueDate = new Date(invoice.issueDate).toISOString().slice(0, 10);
    const issueTime = new Date(invoice.issueDate).toISOString().slice(11, 19);
    const profileId = invoice.kind === 'EARCHIVE' ? 'EARSIVFATURA' : (invoice.eInvoiceProfileId || 'TICARIFATURA');
    const docType = invoice.eInvoiceScenario === 'BASIC' ? 'TEMELFATURA' : profileId;
    const currency = invoice.currency || 'TRY';

    const sellerName = profile?.companyName || partner?.fullName || 'Satıcı';
    const sellerVkn = profile?.taxNumber || '';
    const sellerVdairesi = profile?.taxOffice || '';
    const sellerAddr = profile?.address || '';
    const sellerEmail = profile?.contactEmail || '';
    const sellerPhone = profile?.contactPhone || '';

    const buyerName = invoice.counterpartyName || '';
    const buyerVkn = invoice.counterpartyTaxNumber || '';
    const buyerVdairesi = invoice.counterpartyTaxOffice || '';
    const buyerAddr = invoice.counterpartyAddress || '';
    const buyerEmail = invoice.counterpartyEmail || '';
    const buyerPhone = invoice.counterpartyPhone || '';
    const isCompany = (buyerVkn || '').length >= 10; // 10+ → VKN, less → TCKN

    const lines = items.map((it, i) => `
  <cac:InvoiceLine>
    <cbc:ID>${i + 1}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="${escapeXml(it.unit || 'C62')}">${Number(it.quantity).toFixed(3)}</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="${currency}">${Number(it.taxBase).toFixed(2)}</cbc:LineExtensionAmount>
    ${Number(it.discountRate) > 0 ? `
    <cac:AllowanceCharge>
      <cbc:ChargeIndicator>false</cbc:ChargeIndicator>
      <cbc:MultiplierFactorNumeric>${Number(it.discountRate).toFixed(2)}</cbc:MultiplierFactorNumeric>
      <cbc:Amount currencyID="${currency}">${Number(it.discount).toFixed(2)}</cbc:Amount>
      <cbc:BaseAmount currencyID="${currency}">${Number(it.subtotal).toFixed(2)}</cbc:BaseAmount>
    </cac:AllowanceCharge>` : ''}
    <cac:TaxTotal>
      <cbc:TaxAmount currencyID="${currency}">${Number(it.taxAmount).toFixed(2)}</cbc:TaxAmount>
      <cac:TaxSubtotal>
        <cbc:TaxableAmount currencyID="${currency}">${Number(it.taxBase).toFixed(2)}</cbc:TaxableAmount>
        <cbc:TaxAmount currencyID="${currency}">${Number(it.taxAmount).toFixed(2)}</cbc:TaxAmount>
        <cbc:Percent>${Number(it.taxRate).toFixed(2)}</cbc:Percent>
        <cac:TaxCategory>
          <cac:TaxScheme><cbc:Name>KDV</cbc:Name><cbc:TaxTypeCode>0015</cbc:TaxTypeCode></cac:TaxScheme>
        </cac:TaxCategory>
      </cac:TaxSubtotal>
    </cac:TaxTotal>
    <cac:Item>
      <cbc:Name>${escapeXml(it.description)}</cbc:Name>
      ${it.gtipCode ? `<cac:CommodityClassification><cbc:ItemClassificationCode listID="GTIP">${escapeXml(it.gtipCode)}</cbc:ItemClassificationCode></cac:CommodityClassification>` : ''}
    </cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="${currency}">${Number(it.unitPrice).toFixed(4)}</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>`).join('');

    return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
         xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2">
  <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
  <cbc:CustomizationID>TR1.2</cbc:CustomizationID>
  <cbc:ProfileID>${docType}</cbc:ProfileID>
  <cbc:ID>${escapeXml(invoice.invoiceNo)}</cbc:ID>
  <cbc:CopyIndicator>false</cbc:CopyIndicator>
  <cbc:UUID>${escapeXml(uuid)}</cbc:UUID>
  <cbc:IssueDate>${issueDate}</cbc:IssueDate>
  <cbc:IssueTime>${issueTime}</cbc:IssueTime>
  <cbc:InvoiceTypeCode>SATIS</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>${currency}</cbc:DocumentCurrencyCode>
  <cbc:LineCountNumeric>${items.length}</cbc:LineCountNumeric>

  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyIdentification><cbc:ID schemeID="VKN">${escapeXml(sellerVkn)}</cbc:ID></cac:PartyIdentification>
      <cac:PartyName><cbc:Name>${escapeXml(sellerName)}</cbc:Name></cac:PartyName>
      <cac:PostalAddress><cbc:CityName>${escapeXml((sellerAddr || '').split(',').pop()?.trim() || '')}</cbc:CityName><cbc:Region>${escapeXml(sellerVdairesi)}</cbc:Region><cbc:StreetName>${escapeXml(sellerAddr)}</cbc:StreetName><cac:Country><cbc:Name>Türkiye</cbc:Name></cac:Country></cac:PostalAddress>
      <cac:PartyTaxScheme><cac:TaxScheme><cbc:Name>${escapeXml(sellerVdairesi)}</cbc:Name></cac:TaxScheme></cac:PartyTaxScheme>
      <cac:Contact>${sellerPhone ? `<cbc:Telephone>${escapeXml(sellerPhone)}</cbc:Telephone>` : ''}${sellerEmail ? `<cbc:ElectronicMail>${escapeXml(sellerEmail)}</cbc:ElectronicMail>` : ''}</cac:Contact>
    </cac:Party>
  </cac:AccountingSupplierParty>

  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyIdentification><cbc:ID schemeID="${isCompany ? 'VKN' : 'TCKN'}">${escapeXml(buyerVkn)}</cbc:ID></cac:PartyIdentification>
      <cac:PartyName><cbc:Name>${escapeXml(buyerName)}</cbc:Name></cac:PartyName>
      <cac:PostalAddress><cbc:StreetName>${escapeXml(buyerAddr)}</cbc:StreetName><cac:Country><cbc:Name>Türkiye</cbc:Name></cac:Country></cac:PostalAddress>
      ${buyerVdairesi ? `<cac:PartyTaxScheme><cac:TaxScheme><cbc:Name>${escapeXml(buyerVdairesi)}</cbc:Name></cac:TaxScheme></cac:PartyTaxScheme>` : ''}
      <cac:Contact>${buyerPhone ? `<cbc:Telephone>${escapeXml(buyerPhone)}</cbc:Telephone>` : ''}${buyerEmail ? `<cbc:ElectronicMail>${escapeXml(buyerEmail)}</cbc:ElectronicMail>` : ''}</cac:Contact>
    </cac:Party>
  </cac:AccountingCustomerParty>

  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="${currency}">${Number(invoice.taxTotal).toFixed(2)}</cbc:TaxAmount>
  </cac:TaxTotal>

  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${currency}">${Number(invoice.subtotal).toFixed(2)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="${currency}">${Number(invoice.subtotal).toFixed(2)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="${currency}">${Number(invoice.grandTotal).toFixed(2)}</cbc:TaxInclusiveAmount>
    <cbc:AllowanceTotalAmount currencyID="${currency}">${Number(invoice.discountTotal).toFixed(2)}</cbc:AllowanceTotalAmount>
    <cbc:PayableAmount currencyID="${currency}">${Number(invoice.grandTotal).toFixed(2)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  ${lines}
</Invoice>`;
}

router.get('/invoices/:id/ubl', authMiddleware, async (req, res) => {
    const scope = ensurePartner(req, res);
    if (!scope) return;
    try {
        const invoice = await prisma.partnerInvoice.findFirst({
            where: { id: req.params.id, tenantId: scope.tenantId, partnerId: scope.partnerId },
            include: { items: { orderBy: { lineNo: 'asc' } } },
        });
        if (!invoice) return res.status(404).send('Bulunamadı');
        if (!invoice.eInvoiceUuid) {
            const uuid = require('crypto').randomUUID();
            await prisma.partnerInvoice.update({ where: { id: invoice.id }, data: { eInvoiceUuid: uuid } });
            invoice.eInvoiceUuid = uuid;
        }
        const profile = await prisma.partnerProfile.findUnique({ where: { userId: scope.partnerId } });
        const partner = await prisma.user.findUnique({ where: { id: scope.partnerId } });
        const xml = buildUblXml({ invoice, items: invoice.items, profile, partner });
        res.set('Content-Type', 'application/xml; charset=utf-8');
        res.set('Content-Disposition', `attachment; filename="${invoice.invoiceNo}.xml"`);
        res.send(xml);
    } catch (error) {
        console.error('UBL XML error:', error);
        res.status(500).send('Hata');
    }
});

// e-Invoice provider adapter: webhook-based (Foriba/UYUMSOFT/eFinans)
// Reads provider config from PartnerProfile.metadata.einvoice
router.post('/invoices/:id/efatura/send', authMiddleware, async (req, res) => {
    const scope = ensurePartner(req, res);
    if (!scope) return;
    try {
        const invoice = await prisma.partnerInvoice.findFirst({
            where: { id: req.params.id, tenantId: scope.tenantId, partnerId: scope.partnerId },
            include: { items: { orderBy: { lineNo: 'asc' } } },
        });
        if (!invoice) return res.status(404).json({ success: false, error: 'Fatura bulunamadı' });
        if (invoice.kind !== 'EFATURA' && invoice.kind !== 'EARCHIVE') {
            return res.status(400).json({ success: false, error: 'Bu fatura türü e-Fatura/e-Arşiv değil' });
        }

        const profile = await prisma.partnerProfile.findUnique({ where: { userId: scope.partnerId } });
        const cfg = profile?.metadata?.einvoice;
        if (!cfg || !cfg.endpoint) {
            return res.status(400).json({ success: false, error: 'e-Fatura sağlayıcısı yapılandırılmamış (Tanımlamalar > e-Fatura)' });
        }
        if (!cfg.enabled) {
            return res.status(400).json({ success: false, error: 'e-Fatura sağlayıcısı pasif' });
        }

        if (!invoice.eInvoiceUuid) {
            const uuid = require('crypto').randomUUID();
            await prisma.partnerInvoice.update({ where: { id: invoice.id }, data: { eInvoiceUuid: uuid } });
            invoice.eInvoiceUuid = uuid;
        }

        const partner = await prisma.user.findUnique({ where: { id: scope.partnerId } });
        const xml = buildUblXml({ invoice, items: invoice.items, profile, partner });
        const headers = { 'Content-Type': 'application/json' };
        if (cfg.apiKeyEnc) headers['X-API-Key'] = uetdsService.decrypt(cfg.apiKeyEnc);
        if (cfg.provider) headers['X-Provider'] = cfg.provider;

        try {
            const r = await axios.post(cfg.endpoint, {
                provider: cfg.provider,
                username: cfg.username,
                invoiceUuid: invoice.eInvoiceUuid,
                invoiceNo: invoice.invoiceNo,
                kind: invoice.kind,
                scenario: invoice.eInvoiceScenario || (invoice.kind === 'EARCHIVE' ? 'EARSIVFATURA' : 'COMMERCIAL'),
                ublXml: Buffer.from(xml).toString('base64'),
                callbackUrl: `${(req.headers['x-forwarded-proto'] || req.protocol)}://${req.headers['x-forwarded-host'] || req.get('host')}/api/partner-accounting/invoices/${invoice.id}/efatura/callback`,
            }, { headers, timeout: 30000 });

            const status = r.data?.status || 'SENT';
            const updated = await prisma.partnerInvoice.update({
                where: { id: invoice.id },
                data: {
                    status: status === 'ACCEPTED' ? 'ACCEPTED' : 'SENT',
                    eInvoiceSentAt: new Date(),
                    eInvoiceGibStatus: r.data?.gibStatus || null,
                    eInvoiceXmlUrl: r.data?.xmlUrl || null,
                    eInvoicePdfUrl: r.data?.pdfUrl || null,
                    eInvoiceResponse: r.data || null,
                },
            });
            return res.json({ success: true, data: updated, provider: r.data });
        } catch (sendErr) {
            const errMsg = sendErr.response?.data?.error || sendErr.message;
            await prisma.partnerInvoice.update({
                where: { id: invoice.id },
                data: { eInvoiceErrorMessage: errMsg },
            });
            return res.status(502).json({ success: false, error: `Sağlayıcı reddetti: ${errMsg}` });
        }
    } catch (error) {
        console.error('e-Fatura send error:', error);
        res.status(500).json({ success: false, error: error.message || 'Gönderim başarısız' });
    }
});

// Provider callback (acceptance / rejection)
router.post('/invoices/:id/efatura/callback', async (req, res) => {
    try {
        const { status, gibStatus, xmlUrl, pdfUrl, errorMessage } = req.body || {};
        const inv = await prisma.partnerInvoice.findUnique({ where: { id: req.params.id } });
        if (!inv) return res.status(404).json({ success: false });
        await prisma.partnerInvoice.update({
            where: { id: inv.id },
            data: {
                status: status === 'ACCEPTED' ? 'ACCEPTED' : status === 'REJECTED' ? 'REJECTED' : inv.status,
                eInvoiceAcceptedAt: status === 'ACCEPTED' ? new Date() : inv.eInvoiceAcceptedAt,
                eInvoiceRejectedAt: status === 'REJECTED' ? new Date() : inv.eInvoiceRejectedAt,
                eInvoiceGibStatus: gibStatus || inv.eInvoiceGibStatus,
                eInvoiceXmlUrl: xmlUrl || inv.eInvoiceXmlUrl,
                eInvoicePdfUrl: pdfUrl || inv.eInvoicePdfUrl,
                eInvoiceErrorMessage: errorMessage || null,
            },
        });
        res.json({ success: true });
    } catch (error) {
        console.error('e-Fatura callback error:', error);
        res.status(500).json({ success: false });
    }
});

// e-Invoice provider config (GET/PUT) — stored in PartnerProfile.metadata.einvoice
router.get('/einvoice-config', authMiddleware, async (req, res) => {
    const scope = ensurePartner(req, res);
    if (!scope) return;
    try {
        const profile = await prisma.partnerProfile.findUnique({ where: { userId: scope.partnerId } });
        const cfg = profile?.metadata?.einvoice || {};
        res.json({
            success: true, data: {
                enabled: !!cfg.enabled,
                provider: cfg.provider || 'GENERIC',
                endpoint: cfg.endpoint || '',
                username: cfg.username || '',
                hasApiKey: !!cfg.apiKeyEnc,
                testMode: !!cfg.testMode,
            },
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Yapılandırma alınamadı' });
    }
});

router.put('/einvoice-config', authMiddleware, async (req, res) => {
    const scope = ensurePartner(req, res);
    if (!scope) return;
    try {
        const b = req.body || {};
        const profile = await prisma.partnerProfile.findUnique({ where: { userId: scope.partnerId } });
        const metadata = profile?.metadata || {};
        const prev = metadata.einvoice || {};
        const next = {
            enabled: b.enabled === undefined ? !!prev.enabled : !!b.enabled,
            provider: b.provider || prev.provider || 'GENERIC',
            endpoint: b.endpoint ?? prev.endpoint ?? '',
            username: b.username ?? prev.username ?? '',
            apiKeyEnc: b.apiKey ? uetdsService.encrypt(String(b.apiKey)) : (prev.apiKeyEnc || null),
            testMode: b.testMode === undefined ? !!prev.testMode : !!b.testMode,
        };
        const updated = await prisma.partnerProfile.upsert({
            where: { userId: scope.partnerId },
            update: { metadata: { ...metadata, einvoice: next } },
            create: { tenantId: scope.tenantId, userId: scope.partnerId, metadata: { einvoice: next } },
        });
        const cfg = updated.metadata?.einvoice || {};
        res.json({
            success: true, data: {
                enabled: !!cfg.enabled, provider: cfg.provider || 'GENERIC',
                endpoint: cfg.endpoint || '', username: cfg.username || '',
                hasApiKey: !!cfg.apiKeyEnc, testMode: !!cfg.testMode,
            },
        });
    } catch (error) {
        console.error('e-Invoice config save error:', error);
        res.status(500).json({ success: false, error: 'Yapılandırma kaydedilemedi' });
    }
});

// ─────────────────────────────────────────────────────────────────
// BANK SYNC ADAPTER — generic webhook (partner provides bank API integrator URL)
// Config in PartnerProfile.metadata.bankSync
// ─────────────────────────────────────────────────────────────────
router.get('/bank-sync/config', authMiddleware, async (req, res) => {
    const scope = ensurePartner(req, res);
    if (!scope) return;
    try {
        const profile = await prisma.partnerProfile.findUnique({ where: { userId: scope.partnerId } });
        const cfg = profile?.metadata?.bankSync || {};
        res.json({
            success: true, data: {
                enabled: !!cfg.enabled,
                provider: cfg.provider || 'GENERIC',
                endpoint: cfg.endpoint || '',
                hasApiKey: !!cfg.apiKeyEnc,
                accountKey: cfg.accountKey || 'BANK_DEFAULT',
                lastSyncAt: cfg.lastSyncAt || null,
            },
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Yapılandırma alınamadı' });
    }
});

router.put('/bank-sync/config', authMiddleware, async (req, res) => {
    const scope = ensurePartner(req, res);
    if (!scope) return;
    try {
        const b = req.body || {};
        const profile = await prisma.partnerProfile.findUnique({ where: { userId: scope.partnerId } });
        const metadata = profile?.metadata || {};
        const prev = metadata.bankSync || {};
        const next = {
            enabled: b.enabled === undefined ? !!prev.enabled : !!b.enabled,
            provider: b.provider || prev.provider || 'GENERIC',
            endpoint: b.endpoint ?? prev.endpoint ?? '',
            apiKeyEnc: b.apiKey ? uetdsService.encrypt(String(b.apiKey)) : (prev.apiKeyEnc || null),
            accountKey: b.accountKey ?? prev.accountKey ?? 'BANK_DEFAULT',
            lastSyncAt: prev.lastSyncAt || null,
        };
        await prisma.partnerProfile.upsert({
            where: { userId: scope.partnerId },
            update: { metadata: { ...metadata, bankSync: next } },
            create: { tenantId: scope.tenantId, userId: scope.partnerId, metadata: { bankSync: next } },
        });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Yapılandırma kaydedilemedi' });
    }
});

router.post('/bank-sync/run', authMiddleware, async (req, res) => {
    const scope = ensurePartner(req, res);
    if (!scope) return;
    try {
        const profile = await prisma.partnerProfile.findUnique({ where: { userId: scope.partnerId } });
        const cfg = profile?.metadata?.bankSync;
        if (!cfg || !cfg.enabled) return res.status(400).json({ success: false, error: 'Banka sync pasif' });
        if (!cfg.endpoint) return res.status(400).json({ success: false, error: 'Endpoint tanımlı değil' });
        const since = cfg.lastSyncAt || new Date(Date.now() - 7 * 86400000).toISOString();
        const headers = { 'Content-Type': 'application/json' };
        if (cfg.apiKeyEnc) headers['X-API-Key'] = uetdsService.decrypt(cfg.apiKeyEnc);
        if (cfg.provider) headers['X-Provider'] = cfg.provider;
        const r = await axios.post(cfg.endpoint, { since }, { headers, timeout: 30000 });
        const txs = Array.isArray(r.data?.transactions) ? r.data.transactions : Array.isArray(r.data) ? r.data : [];
        let imported = 0;
        let duplicates = 0;
        for (const t of txs) {
            const externalId = t.id || t.externalId || `${t.date}-${t.amount}-${t.description?.substring(0, 16)}`;
            // Dedupe via metadata.externalId
            const existing = await prisma.partnerCashEntry.findFirst({
                where: { tenantId: scope.tenantId, partnerId: scope.partnerId, metadata: { path: ['externalId'], equals: externalId } },
            });
            if (existing) { duplicates++; continue; }
            const amount = Number(t.amount);
            if (!(amount > 0)) continue;
            await prisma.partnerCashEntry.create({
                data: {
                    tenantId: scope.tenantId,
                    partnerId: scope.partnerId,
                    accountType: 'BANK',
                    accountKey: cfg.accountKey || 'BANK_DEFAULT',
                    currency: (t.currency || 'TRY').toUpperCase(),
                    date: t.date ? new Date(t.date) : new Date(),
                    direction: (t.direction || (amount >= 0 ? 'IN' : 'OUT')).toUpperCase() === 'OUT' ? 'OUT' : 'IN',
                    amount: Math.abs(amount),
                    description: t.description || 'Banka sync',
                    refType: 'BANK_SYNC',
                    metadata: { externalId, source: 'BANK_SYNC' },
                    createdById: scope.partnerId,
                },
            });
            imported++;
        }

        // Update lastSyncAt
        const md = profile.metadata || {};
        await prisma.partnerProfile.update({
            where: { userId: scope.partnerId },
            data: { metadata: { ...md, bankSync: { ...md.bankSync, lastSyncAt: new Date().toISOString() } } },
        });
        res.json({ success: true, imported, duplicates });
    } catch (error) {
        console.error('Bank sync run error:', error.message);
        res.status(500).json({ success: false, error: error.response?.data?.error || error.message });
    }
});

// ─────────────────────────────────────────────────────────────────
// TIMESHEETS — Puantaj
// ─────────────────────────────────────────────────────────────────
function calcHours(clockIn, clockOut, breakMinutes) {
    if (!clockIn || !clockOut) return null;
    const ms = new Date(clockOut).getTime() - new Date(clockIn).getTime();
    if (ms <= 0) return null;
    const minutes = Math.floor(ms / 60000) - Number(breakMinutes || 0);
    return Math.max(0, round2(minutes / 60));
}

router.get('/timesheets', authMiddleware, async (req, res) => {
    const scope = ensurePartner(req, res);
    if (!scope) return;
    try {
        const { employeeId, from, to } = req.query;
        const where = { tenantId: scope.tenantId, partnerId: scope.partnerId };
        if (employeeId) where.employeeId = String(employeeId);
        if (from || to) where.date = {};
        if (from) where.date.gte = new Date(String(from));
        if (to) where.date.lte = new Date(String(to));
        const data = await prisma.partnerTimesheet.findMany({
            where,
            orderBy: { date: 'desc' },
            include: { employee: { select: { id: true, firstName: true, lastName: true, jobTitle: true } } },
        });
        res.json({ success: true, data });
    } catch (error) {
        console.error('Timesheets list error:', error);
        res.status(500).json({ success: false, error: 'Puantaj alınamadı' });
    }
});

router.post('/timesheets', authMiddleware, async (req, res) => {
    const scope = ensurePartner(req, res);
    if (!scope) return;
    try {
        const b = req.body || {};
        const employee = await prisma.partnerEmployee.findFirst({
            where: { id: b.employeeId, tenantId: scope.tenantId, partnerId: scope.partnerId },
        });
        if (!employee) return res.status(400).json({ success: false, error: 'Personel bulunamadı' });

        const breakMinutes = Number(b.breakMinutes || 0);
        const computed = calcHours(b.clockIn, b.clockOut, breakMinutes);
        const standardDay = 9; // saat
        const overtime = computed != null ? Math.max(0, round2(computed - standardDay)) : null;

        const date = b.date ? new Date(b.date) : new Date();
        const dayKey = new Date(date.getFullYear(), date.getMonth(), date.getDate());

        const data = await prisma.partnerTimesheet.upsert({
            where: { employeeId_date: { employeeId: employee.id, date: dayKey } },
            update: {
                clockIn: b.clockIn ? new Date(b.clockIn) : undefined,
                clockOut: b.clockOut ? new Date(b.clockOut) : undefined,
                breakMinutes,
                hours: b.hours !== undefined ? toNum(b.hours) : computed,
                overtime: b.overtime !== undefined ? toNum(b.overtime) : overtime,
                hourlyRate: b.hourlyRate !== undefined ? toNum(b.hourlyRate) : undefined,
                notes: b.notes || null,
                source: b.source || 'MANUAL',
            },
            create: {
                tenantId: scope.tenantId,
                partnerId: scope.partnerId,
                employeeId: employee.id,
                date: dayKey,
                clockIn: b.clockIn ? new Date(b.clockIn) : null,
                clockOut: b.clockOut ? new Date(b.clockOut) : null,
                breakMinutes,
                hours: b.hours !== undefined ? toNum(b.hours) : computed,
                overtime: b.overtime !== undefined ? toNum(b.overtime) : overtime,
                hourlyRate: b.hourlyRate !== undefined ? toNum(b.hourlyRate) : null,
                notes: b.notes || null,
                source: b.source || 'MANUAL',
            },
        });
        res.json({ success: true, data });
    } catch (error) {
        console.error('Timesheet save error:', error);
        res.status(500).json({ success: false, error: 'Kayıt başarısız' });
    }
});

router.delete('/timesheets/:id', authMiddleware, async (req, res) => {
    const scope = ensurePartner(req, res);
    if (!scope) return;
    try {
        const existing = await prisma.partnerTimesheet.findFirst({
            where: { id: req.params.id, tenantId: scope.tenantId, partnerId: scope.partnerId },
        });
        if (!existing) return res.status(404).json({ success: false, error: 'Bulunamadı' });
        await prisma.partnerTimesheet.delete({ where: { id: existing.id } });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Silinemedi' });
    }
});

router.get('/timesheets/summary', authMiddleware, async (req, res) => {
    const scope = ensurePartner(req, res);
    if (!scope) return;
    try {
        const periodYear = Number(req.query.periodYear) || new Date().getFullYear();
        const periodMonth = Number(req.query.periodMonth) || new Date().getMonth() + 1;
        const start = new Date(periodYear, periodMonth - 1, 1);
        const end = new Date(periodYear, periodMonth, 0, 23, 59, 59, 999);
        const rows = await prisma.partnerTimesheet.findMany({
            where: { tenantId: scope.tenantId, partnerId: scope.partnerId, date: { gte: start, lte: end } },
            include: { employee: { select: { id: true, firstName: true, lastName: true, jobTitle: true, baseSalary: true, salaryCurrency: true } } },
        });
        const byEmp = new Map();
        for (const r of rows) {
            const key = r.employee?.id || r.employeeId;
            if (!byEmp.has(key)) byEmp.set(key, { employee: r.employee, days: 0, hours: 0, overtime: 0 });
            const acc = byEmp.get(key);
            acc.days += 1;
            acc.hours += Number(r.hours || 0);
            acc.overtime += Number(r.overtime || 0);
        }
        res.json({ success: true, data: { period: { year: periodYear, month: periodMonth }, rows: Array.from(byEmp.values()) } });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Özet üretilemedi' });
    }
});

// ─────────────────────────────────────────────────────────────────
// BUDGET — Bütçe planı vs gerçekleşen
// ─────────────────────────────────────────────────────────────────
router.get('/budgets', authMiddleware, async (req, res) => {
    const scope = ensurePartner(req, res);
    if (!scope) return;
    try {
        const periodYear = Number(req.query.periodYear) || new Date().getFullYear();
        const periodMonth = req.query.periodMonth !== undefined ? Number(req.query.periodMonth) : new Date().getMonth() + 1;
        const where = { tenantId: scope.tenantId, partnerId: scope.partnerId, periodYear, ...(periodMonth ? { periodMonth } : {}) };
        const budgets = await prisma.partnerBudget.findMany({ where, orderBy: { category: 'asc' } });

        // Actuals from PartnerFinanceEntry (EXPENSE) for the same period and category enum match
        let from, to;
        if (periodMonth) {
            from = new Date(periodYear, periodMonth - 1, 1);
            to = new Date(periodYear, periodMonth, 0, 23, 59, 59, 999);
        } else {
            from = new Date(periodYear, 0, 1);
            to = new Date(periodYear, 11, 31, 23, 59, 59, 999);
        }
        const actuals = await prisma.partnerFinanceEntry.groupBy({
            by: ['category'],
            where: { tenantId: scope.tenantId, partnerId: scope.partnerId, type: 'EXPENSE', date: { gte: from, lte: to } },
            _sum: { amount: true },
        });
        const actualMap = new Map();
        actuals.forEach((a) => actualMap.set(a.category, Number(a._sum.amount || 0)));

        // Payroll actuals (per type → category mapping)
        const payrolls = await prisma.partnerPayrollEntry.groupBy({
            by: ['type'],
            where: { tenantId: scope.tenantId, partnerId: scope.partnerId, date: { gte: from, lte: to } },
            _sum: { amount: true },
        });
        const payrollSum = payrolls.reduce((acc, p) => acc + Number(p._sum.amount || 0), 0);
        if (payrollSum > 0) actualMap.set('SALARY', (actualMap.get('SALARY') || 0) + payrollSum);

        const merged = budgets.map((b) => {
            const actual = actualMap.get(b.category) || 0;
            const planned = Number(b.plannedAmount);
            const variance = round2(planned - actual);
            const usagePct = planned > 0 ? Math.round((actual / planned) * 100) : 0;
            return { ...b, plannedAmount: planned, actual, variance, usagePct };
        });
        // Add categories spent without plan
        for (const [cat, actual] of actualMap.entries()) {
            if (!merged.find((m) => m.category === cat)) {
                merged.push({ id: `unplanned-${cat}`, partnerId: scope.partnerId, periodYear, periodMonth, category: cat, plannedAmount: 0, actual, variance: -actual, usagePct: 0, unplanned: true });
            }
        }
        res.json({ success: true, data: { period: { year: periodYear, month: periodMonth }, rows: merged } });
    } catch (error) {
        console.error('Budgets error:', error);
        res.status(500).json({ success: false, error: 'Bütçe alınamadı' });
    }
});

router.post('/budgets', authMiddleware, async (req, res) => {
    const scope = ensurePartner(req, res);
    if (!scope) return;
    try {
        const b = req.body || {};
        const data = await prisma.partnerBudget.upsert({
            where: { partnerId_periodYear_periodMonth_category: { partnerId: scope.partnerId, periodYear: Number(b.periodYear), periodMonth: Number(b.periodMonth || 0), category: String(b.category) } },
            update: {
                plannedAmount: toNum(b.plannedAmount),
                currency: b.currency || 'TRY',
                notes: b.notes || null,
            },
            create: {
                tenantId: scope.tenantId,
                partnerId: scope.partnerId,
                periodYear: Number(b.periodYear),
                periodMonth: Number(b.periodMonth || 0),
                category: String(b.category),
                plannedAmount: toNum(b.plannedAmount),
                currency: b.currency || 'TRY',
                notes: b.notes || null,
            },
        });
        res.json({ success: true, data });
    } catch (error) {
        console.error('Budget save error:', error);
        res.status(500).json({ success: false, error: 'Bütçe kaydı başarısız' });
    }
});

router.delete('/budgets/:id', authMiddleware, async (req, res) => {
    const scope = ensurePartner(req, res);
    if (!scope) return;
    try {
        const existing = await prisma.partnerBudget.findFirst({
            where: { id: req.params.id, tenantId: scope.tenantId, partnerId: scope.partnerId },
        });
        if (!existing) return res.status(404).json({ success: false, error: 'Bulunamadı' });
        await prisma.partnerBudget.delete({ where: { id: existing.id } });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Silinemedi' });
    }
});

// ─────────────────────────────────────────────────────────────────
// MONTHLY CONSOLIDATED REPORT — email PDF-like HTML
// ─────────────────────────────────────────────────────────────────
function buildMonthlyReportHtml({ partner, profile, period, dashboard, income, trial }) {
    const fmt = (v, c = 'TRY') => `${Number(v || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ${c}`;
    const escape = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
    const company = profile?.companyName || partner?.fullName || '';

    return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Aylık Rapor</title>
<style>
  body { font-family: -apple-system, Arial, sans-serif; color: #1e293b; background: #f8fafc; margin: 0; }
  .wrap { max-width: 820px; margin: 20px auto; background: #fff; padding: 32px 36px; border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,0.06); }
  h1 { margin: 0 0 8px; color: #0f172a; }
  .sub { color: #64748b; font-size: 13px; margin-bottom: 24px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 12px; margin-bottom: 20px; }
  .card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px; }
  .card .lbl { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 0.4px; }
  .card .val { font-size: 17px; font-weight: 800; color: #0f172a; margin-top: 4px; }
  h2 { font-size: 14px; color: #4f46e5; border-bottom: 2px solid #6366f1; padding-bottom: 6px; margin: 24px 0 10px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { padding: 6px 10px; text-align: left; border-bottom: 1px solid #e2e8f0; }
  th { background: #f1f5f9; font-weight: 700; color: #475569; font-size: 11px; text-transform: uppercase; }
  td.num, th.num { text-align: right; }
  .pos { color: #10b981; } .neg { color: #ef4444; }
  .foot { margin-top: 24px; padding-top: 12px; border-top: 1px dashed #cbd5e1; color: #64748b; font-size: 11px; }
</style></head><body><div class="wrap">
  <h1>Aylık Konsolide Rapor</h1>
  <div class="sub">${escape(company)} · ${period.from.toLocaleDateString('tr-TR')} – ${period.to.toLocaleDateString('tr-TR')}</div>

  <div class="grid">
    <div class="card"><div class="lbl">Toplam Gelir</div><div class="val pos">${fmt(income.revenue.total)}</div></div>
    <div class="card"><div class="lbl">Brüt Kâr</div><div class="val">${fmt(income.grossProfit)}</div></div>
    <div class="card"><div class="lbl">EBIT</div><div class="val ${income.ebit >= 0 ? 'pos' : 'neg'}">${fmt(income.ebit)}</div></div>
    <div class="card"><div class="lbl">Kasa Akışı</div><div class="val">${fmt(income.cashFlow.net)}</div></div>
  </div>

  <h2>Gelir / Gider Detayı</h2>
  <table>
    <tbody>
      <tr><td>Net Satış</td><td class="num pos">${fmt(income.revenue.salesNet)}</td></tr>
      <tr><td>Diğer Gelir</td><td class="num pos">${fmt(income.revenue.otherIncome)}</td></tr>
      <tr><td>Alış Maliyeti</td><td class="num neg">−${fmt(income.costs.total)}</td></tr>
      <tr><td>Fatura Giderleri</td><td class="num neg">−${fmt(income.operatingExpenses.invoiceExpenses)}</td></tr>
      <tr><td>Diğer Giderler</td><td class="num neg">−${fmt(income.operatingExpenses.otherExpenses)}</td></tr>
      <tr><td>Personel Giderleri</td><td class="num neg">−${fmt(income.payroll.total)}</td></tr>
      <tr><td style="font-weight:800;">EBIT</td><td class="num" style="font-weight:800;">${fmt(income.ebit)}</td></tr>
    </tbody>
  </table>

  <h2>Mizan — Top 15</h2>
  <table>
    <thead><tr><th>Kod</th><th>Cari</th><th>Tip</th><th class="num">Bakiye</th></tr></thead>
    <tbody>${trial.rows.slice(0, 15).map((r) => `
      <tr><td>${escape(r.code)}</td><td>${escape(r.name)}</td><td>${escape(r.type)}</td><td class="num ${Number(r.balance) >= 0 ? 'pos' : 'neg'}">${fmt(r.balance, r.currency)}</td></tr>`).join('')}</tbody>
  </table>

  <h2>Uyarılar</h2>
  <div>${dashboard.overdueInvoices.length} adet vadesi geçmiş fatura · ${dashboard.kpis.unpaidPayrollCount} ödenmemiş bordro · ${fmt(dashboard.kpis.unpaidPayroll)} ödenmemiş bordro tutarı</div>

  <div class="foot">Bu rapor ${new Date().toLocaleString('tr-TR')} tarihinde otomatik üretilmiştir.</div>
</div></body></html>`;
}

router.post('/reports/monthly/email', authMiddleware, async (req, res) => {
    const scope = ensurePartner(req, res);
    if (!scope) return;
    try {
        const { to, periodYear, periodMonth } = req.body || {};
        const year = Number(periodYear) || new Date().getFullYear();
        const month = Number(periodMonth) || new Date().getMonth() + 1;
        const from = new Date(year, month - 1, 1);
        const periodTo = new Date(year, month, 0, 23, 59, 59, 999);

        const profile = await prisma.partnerProfile.findUnique({ where: { userId: scope.partnerId } });
        const partner = await prisma.user.findUnique({ where: { id: scope.partnerId } });
        const email = profile?.metadata?.notifications?.email;
        if (!email || !email.smtpHost) return res.status(400).json({ success: false, error: 'SMTP yapılandırılmamış' });
        const recipient = to || email.senderEmail || email.smtpUser;
        if (!recipient) return res.status(400).json({ success: false, error: 'Alıcı e-posta yok' });

        const fakeReq = { query: { from: from.toISOString(), to: periodTo.toISOString() } };
        const { from: pf, to: pt } = parsePeriod(fakeReq);

        const baseWhere = { tenantId: scope.tenantId, partnerId: scope.partnerId };
        const [invSalesAgg, invPurchaseAgg, invExpenseAgg, cashInAgg, cashOutAgg, payrollAgg, financeIncome, financeExpense, accounts, overdue, unpaidPayroll] = await Promise.all([
            prisma.partnerInvoice.aggregate({ where: { ...baseWhere, type: 'SALES', status: { in: ['APPROVED', 'SENT', 'ACCEPTED', 'PAID', 'PARTIALLY_PAID'] }, issueDate: { gte: pf, lte: pt } }, _sum: { subtotal: true, taxTotal: true, grandTotal: true, paidTotal: true }, _count: true }),
            prisma.partnerInvoice.aggregate({ where: { ...baseWhere, type: 'PURCHASE', status: { in: ['APPROVED', 'SENT', 'ACCEPTED', 'PAID', 'PARTIALLY_PAID'] }, issueDate: { gte: pf, lte: pt } }, _sum: { subtotal: true, grandTotal: true }, _count: true }),
            prisma.partnerInvoice.aggregate({ where: { ...baseWhere, type: 'EXPENSE', status: { in: ['APPROVED', 'PAID', 'PARTIALLY_PAID'] }, issueDate: { gte: pf, lte: pt } }, _sum: { grandTotal: true } }),
            prisma.partnerCashEntry.aggregate({ where: { ...baseWhere, direction: 'IN', date: { gte: pf, lte: pt } }, _sum: { amount: true } }),
            prisma.partnerCashEntry.aggregate({ where: { ...baseWhere, direction: 'OUT', date: { gte: pf, lte: pt } }, _sum: { amount: true } }),
            prisma.partnerPayrollEntry.groupBy({ by: ['type'], where: { ...baseWhere, date: { gte: pf, lte: pt } }, _sum: { amount: true } }),
            prisma.partnerFinanceEntry.aggregate({ where: { ...baseWhere, type: 'INCOME', date: { gte: pf, lte: pt } }, _sum: { amount: true } }),
            prisma.partnerFinanceEntry.aggregate({ where: { ...baseWhere, type: 'EXPENSE', date: { gte: pf, lte: pt } }, _sum: { amount: true } }),
            prisma.partnerAccount.findMany({ where: baseWhere, orderBy: { name: 'asc' } }),
            prisma.partnerInvoice.findMany({ where: { ...baseWhere, status: { in: ['APPROVED', 'SENT', 'ACCEPTED', 'PARTIALLY_PAID'] }, dueDate: { not: null, lt: new Date() } } }),
            prisma.partnerPayrollEntry.aggregate({ where: { ...baseWhere, paid: false }, _sum: { amount: true }, _count: true }),
        ]);

        const revenue = Number(invSalesAgg._sum.subtotal || 0) + Number(financeIncome._sum.amount || 0);
        const cogs = Number(invPurchaseAgg._sum.subtotal || 0);
        const grossProfit = revenue - cogs;
        const operatingExpenses = Number(invExpenseAgg._sum.grandTotal || 0) + Number(financeExpense._sum.amount || 0);
        const totalPayroll = payrollAgg.reduce((a, p) => a + Number(p._sum.amount || 0), 0);
        const ebit = grossProfit - operatingExpenses - totalPayroll;
        const cashIn = Number(cashInAgg._sum.amount || 0);
        const cashOut = Number(cashOutAgg._sum.amount || 0);

        const income = {
            revenue: { salesNet: Number(invSalesAgg._sum.subtotal || 0), otherIncome: Number(financeIncome._sum.amount || 0), total: revenue },
            costs: { total: cogs },
            grossProfit,
            operatingExpenses: { invoiceExpenses: Number(invExpenseAgg._sum.grandTotal || 0), otherExpenses: Number(financeExpense._sum.amount || 0), total: operatingExpenses },
            payroll: { total: totalPayroll },
            ebit,
            cashFlow: { net: cashIn - cashOut },
        };

        const trial = {
            rows: accounts.map((a) => ({ code: a.code, name: a.name, type: a.type, balance: Number(a.balance), currency: a.currency })).sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance)),
        };

        const dashboard = {
            overdueInvoices: overdue,
            kpis: { unpaidPayroll: Number(unpaidPayroll._sum.amount || 0), unpaidPayrollCount: unpaidPayroll._count || 0 },
        };

        const html = buildMonthlyReportHtml({ partner, profile, period: { from: pf, to: pt }, dashboard, income, trial });

        const nodemailer = require('nodemailer');
        const transporter = nodemailer.createTransport({
            host: email.smtpHost,
            port: Number(email.smtpPort) || 587,
            secure: !!email.smtpSecure || Number(email.smtpPort) === 465,
            auth: { user: email.smtpUser, pass: uetdsService.decrypt(email.smtpPassEnc) },
            tls: { rejectUnauthorized: false },
        });
        const fromName = email.senderName || profile?.companyName || partner?.fullName || 'Partner';
        const fromAddr = email.senderEmail || email.smtpUser;
        await transporter.sendMail({
            from: `"${fromName}" <${fromAddr}>`,
            to: recipient,
            subject: `Aylık Konsolide Rapor — ${month}/${year}`,
            html,
        });
        res.json({ success: true, message: `Rapor gönderildi: ${recipient}` });
    } catch (error) {
        console.error('Monthly report email error:', error);
        res.status(500).json({ success: false, error: error.message || 'Rapor gönderilemedi' });
    }
});

module.exports = router;
