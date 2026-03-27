const express = require('express');

const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
const prisma = require('../lib/prisma');

function genId() {
    return Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();
}

function genInvoiceNo(type, tenantPrefix = 'ST') {
    const now = new Date();
    const yr = now.getFullYear();
    const mon = String(now.getMonth() + 1).padStart(2, '0');
    const seq = Math.floor(Math.random() * 9000 + 1000);
    const prefix = type === 'PURCHASE' ? 'ALF' : 'STF';
    return `${tenantPrefix}-${prefix}-${yr}${mon}-${seq}`;
}

// Helper to update current account (cari) balances when invoice is approved/unapproved
async function applyInvoiceToAccount(tenantId, invoice, multiplier) {
    const isSales = invoice.invoiceType === 'SALES';
    const party = isSales ? invoice.buyerInfo : invoice.sellerInfo;
    let accountId = party?.accountId;

    // Fallback if accountId is missing from older invoices
    if (!accountId && party?.companyName) {
        const agency = await prisma.agency.findFirst({ where: { companyName: party.companyName, tenantId } });
        if (agency) accountId = `agency-${agency.id}`;
        else {
            const partnerName = party.companyName.trim();
            const partner = await prisma.user.findFirst({ where: { tenantId, OR: [{ fullName: partnerName }, { email: partnerName }] } });
            if (partner) accountId = `partner-${partner.id}`;
        }
    }

    if (!accountId) return; // No registered account linked

    const amount = Number(invoice.grandTotal) * multiplier;
    if (isNaN(amount) || amount === 0) return;

    // isSales (We sell): They owe us -> their credit/deposit decreases -> change is negative
    // isPurchase (We buy): We owe them -> their credit/deposit increases -> change is positive
    const change = isSales ? -amount : amount;

    // For specific debit/credit tracking matching UI expectations
    const debitChange = isSales ? amount : 0;
    const creditChange = isSales ? 0 : amount;

    try {
        if (accountId.startsWith('agency-')) {
            const id = accountId.replace('agency-', '');
            await prisma.agency.update({ where: { id }, data: { balance: { increment: change }, debit: { increment: debitChange }, credit: { increment: creditChange } } });
        } else if (accountId.startsWith('personnel-')) {
            const id = accountId.replace('personnel-', '');
            await prisma.personnel.update({ where: { id }, data: { balance: { increment: change }, debit: { increment: debitChange }, credit: { increment: creditChange } } });
        } else if (accountId.startsWith('partner-')) {
            const id = accountId.replace('partner-', '');
            await prisma.user.update({ where: { id }, data: { balance: { increment: change }, debit: { increment: debitChange }, credit: { increment: creditChange } } });
        } else {
            // Standard accounting models
            await prisma.account.update({ where: { id: accountId }, data: { balance: { increment: change }, debit: { increment: debitChange }, credit: { increment: creditChange } } });
        }

        // Record it to the statements
        if (multiplier > 0) { // Only log creations, not deletions/reversals to keep statement clean unless strictly needed
            await prisma.transaction.create({
                data: {
                    tenantId,
                    accountId,
                    type: isSales ? 'SALES_INVOICE' : 'PURCHASE_INVOICE',
                    amount: Math.abs(amount),
                    currency: invoice.currency || 'TRY',
                    isCredit: !isSales, // Sales means they owe us (borç/debit), purchase means we owe them (alacak/credit)
                    description: `${invoice.invoiceNo} Numaralı ${isSales ? 'Satış' : 'Alış'} Faturası`,
                    date: invoice.invoiceDate ? new Date(invoice.invoiceDate) : new Date(),
                    referenceId: invoice.id
                }
            });
        } else {
            // Reversal/Deletion - Remove from the statement
            await prisma.transaction.deleteMany({
                where: {
                    tenantId,
                    accountId,
                    referenceId: invoice.id
                }
            });
        }

    } catch (e) {
        console.error('Error applying invoice balance to account', accountId, e);
    }
}

// ─── GET all invoices ───────────────────────────────────
router.get('/', authMiddleware, async (req, res) => {
    try {
        const tenantId = req.user.tenantId;
        const { type, status } = req.query;
        const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { metadata: true } });
        const invoices = (tenant?.metadata?.invoices || [])
            .filter(inv => (!type || inv.invoiceType === type) && (!status || inv.status === status))
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        res.json({ success: true, data: invoices });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ─── GET single invoice ─────────────────────────────────
router.get('/:id', authMiddleware, async (req, res) => {
    try {
        const tenantId = req.user.tenantId;
        const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { metadata: true } });
        const invoices = tenant?.metadata?.invoices || [];
        const inv = invoices.find(i => i.id === req.params.id);
        if (!inv) return res.status(404).json({ success: false, error: 'Fatura bulunamadı' });
        res.json({ success: true, data: inv });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ─── POST create invoice ────────────────────────────────
router.post('/', authMiddleware, async (req, res) => {
    try {
        const tenantId = req.user.tenantId;
        const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { metadata: true } });
        const meta = { ...(tenant?.metadata || {}) };
        if (!Array.isArray(meta.invoices)) meta.invoices = [];

        const data = req.body;
        // Calculate totals
        const lines = (data.lines || []).map(l => ({
            ...l,
            lineTotal: Number(l.quantity) * Number(l.unitPrice),
            vatAmount: Number(l.quantity) * Number(l.unitPrice) * (Number(l.vatRate) / 100),
        }));
        const subTotal = lines.reduce((s, l) => s + l.lineTotal, 0);
        const totalVat = lines.reduce((s, l) => s + l.vatAmount, 0);
        const grandTotal = subTotal + totalVat - (Number(data.discount) || 0);

        const invoice = {
            id: genId(),
            invoiceNo: data.invoiceNo || genInvoiceNo(data.invoiceType),
            invoiceType: data.invoiceType || 'SALES', // SALES | PURCHASE
            invoiceKind: data.invoiceKind || 'STANDARD', // STANDARD | EFATURA | EARCHIVE
            status: data.status || 'DRAFT',
            // Seller/Buyer
            sellerInfo: data.sellerInfo || {},
            buyerInfo: data.buyerInfo || {},
            // Lines
            lines,
            // Financials
            subTotal,
            totalVat,
            discount: Number(data.discount) || 0,
            grandTotal,
            currency: data.currency || 'TRY',
            // Dates
            invoiceDate: data.invoiceDate || new Date().toISOString(),
            dueDate: data.dueDate,
            // E-Fatura fields
            eInvoiceUUID: data.invoiceKind === 'EFATURA' ? `${crypto.randomUUID?.() || genId()}` : null,
            eInvoiceScenario: data.eInvoiceScenario || 'COMMERCIAL', // COMMERCIAL | EXPORT | BASIC
            paymentMethod: data.paymentMethod || 'BANK_TRANSFER',
            notes: data.notes || '',
            // Meta
            createdBy: req.user.id,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            bookingRef: data.bookingRef || null,
        };

        meta.invoices.push(invoice);
        await prisma.tenant.update({ where: { id: tenantId }, data: { metadata: meta } });

        // Apply balance if created as APPROVED
        if (invoice.status === 'APPROVED') {
            await applyInvoiceToAccount(tenantId, invoice, 1);
        }

        res.status(201).json({ success: true, data: invoice });
    } catch (e) {
        console.error(e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// ─── PUT update invoice ─────────────────────────────────
router.put('/:id', authMiddleware, async (req, res) => {
    try {
        const tenantId = req.user.tenantId;
        const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { metadata: true } });
        const meta = { ...(tenant?.metadata || {}) };
        if (!Array.isArray(meta.invoices)) meta.invoices = [];

        const idx = meta.invoices.findIndex(i => i.id === req.params.id);
        if (idx === -1) return res.status(404).json({ success: false, error: 'Fatura bulunamadı' });

        const data = req.body;
        const lines = (data.lines || meta.invoices[idx].lines || []).map(l => ({
            ...l,
            lineTotal: Number(l.quantity) * Number(l.unitPrice),
            vatAmount: Number(l.quantity) * Number(l.unitPrice) * (Number(l.vatRate) / 100),
        }));
        const subTotal = lines.reduce((s, l) => s + l.lineTotal, 0);
        const totalVat = lines.reduce((s, l) => s + l.vatAmount, 0);
        const grandTotal = subTotal + totalVat - (Number(data.discount) || 0);

        const oldInvoice = meta.invoices[idx];
        const wasApproved = oldInvoice.status === 'APPROVED';

        // Revert old invoice if it was approved
        if (wasApproved) {
            await applyInvoiceToAccount(tenantId, oldInvoice, -1);
        }

        meta.invoices[idx] = {
            ...oldInvoice,
            ...data,
            lines,
            subTotal,
            totalVat,
            grandTotal,
            updatedAt: new Date().toISOString(),
        };

        const isNowApproved = meta.invoices[idx].status === 'APPROVED';

        // Re-apply the new invoice if it is currently approved
        if (isNowApproved) {
            await applyInvoiceToAccount(tenantId, meta.invoices[idx], 1);
        }

        await prisma.tenant.update({ where: { id: tenantId }, data: { metadata: meta } });
        res.json({ success: true, data: meta.invoices[idx] });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ─── PATCH status ───────────────────────────────────────
router.patch('/:id/status', authMiddleware, async (req, res) => {
    try {
        const tenantId = req.user.tenantId;
        const { status } = req.body; // DRAFT | APPROVED | SENT | PAID | CANCELLED
        const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { metadata: true } });
        const meta = { ...(tenant?.metadata || {}) };
        const idx = (meta.invoices || []).findIndex(i => i.id === req.params.id);
        if (idx === -1) return res.status(404).json({ success: false, error: 'Fatura bulunamadı' });
        const invoice = meta.invoices[idx];
        const oldStatus = invoice.status;
        invoice.status = status;
        invoice.updatedAt = new Date().toISOString();
        if (status === 'SENT') invoice.sentAt = new Date().toISOString();

        // Cari Update Logic
        if (oldStatus !== 'APPROVED' && status === 'APPROVED') {
            await applyInvoiceToAccount(tenantId, invoice, 1);
        } else if (oldStatus === 'APPROVED' && status !== 'APPROVED') {
            // Revert changes if un-approved or cancelled
            await applyInvoiceToAccount(tenantId, invoice, -1);
        }

        await prisma.tenant.update({ where: { id: tenantId }, data: { metadata: meta } });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ─── DELETE invoice ─────────────────────────────────────
router.delete('/:id', authMiddleware, async (req, res) => {
    try {
        const tenantId = req.user.tenantId;
        const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { metadata: true } });
        const invoiceToDelete = (meta.invoices || []).find(i => i.id === req.params.id);
        if (invoiceToDelete && invoiceToDelete.status === 'APPROVED') {
            await applyInvoiceToAccount(tenantId, invoiceToDelete, -1);
        }

        meta.invoices = (meta.invoices || []).filter(i => i.id !== req.params.id);
        await prisma.tenant.update({ where: { id: tenantId }, data: { metadata: meta } });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ─── GET next invoice number ────────────────────────────
router.get('/next-no/:type', authMiddleware, async (req, res) => {
    try {
        const tenantId = req.user.tenantId;
        const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { metadata: true, name: true } });
        const prefix = (tenant?.name || 'ST').replace(/\s/g, '').substring(0, 4).toUpperCase();
        const no = genInvoiceNo(req.params.type.toUpperCase(), prefix);
        res.json({ success: true, data: no });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

module.exports = router;
