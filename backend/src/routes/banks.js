const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();
const prisma = new PrismaClient();

// ============================================================================
// BANK ROUTES
// ============================================================================

/**
 * GET /api/banks
 * List all banks for the tenant, including their accounts
 */
router.get('/', authMiddleware, async (req, res) => {
    try {
        const banks = await prisma.bank.findMany({
            where: { tenantId: req.user.tenantId },
            include: { accounts: true },
            orderBy: { createdAt: 'desc' }
        });
        res.json({ success: true, data: banks });
    } catch (error) {
        console.error('List Banks Error:', error);
        res.status(500).json({ success: false, error: 'Bankalar listelenirken bir hata oluştu' });
    }
});

/**
 * POST /api/banks
 * Create a new bank
 */
router.post('/', authMiddleware, async (req, res) => {
    try {
        const { name, code, website } = req.body;
        if (!name) return res.status(400).json({ success: false, error: 'Banka adı zorunludur' });

        const bank = await prisma.bank.create({
            data: {
                tenantId: req.user.tenantId,
                name,
                code,
                website
            }
        });
        res.json({ success: true, data: bank });
    } catch (error) {
        console.error('Create Bank Error:', error);
        res.status(500).json({ success: false, error: 'Banka oluşturulamadı' });
    }
});

/**
 * PUT /api/banks/:id
 * Update a bank
 */
router.put('/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { name, code, website, status } = req.body;

        // Verify ownership
        const existing = await prisma.bank.findFirst({ where: { id, tenantId: req.user.tenantId } });
        if (!existing) return res.status(404).json({ success: false, error: 'Banka bulunamadı' });

        const bank = await prisma.bank.update({
            where: { id },
            data: { name, code, website, status }
        });
        res.json({ success: true, data: bank });
    } catch (error) {
        console.error('Update Bank Error:', error);
        res.status(500).json({ success: false, error: 'Banka güncellenemedi' });
    }
});

/**
 * DELETE /api/banks/:id
 * Delete a bank
 */
router.delete('/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        // Verify ownership
        const existing = await prisma.bank.findFirst({ where: { id, tenantId: req.user.tenantId } });
        if (!existing) return res.status(404).json({ success: false, error: 'Banka bulunamadı' });

        await prisma.bank.delete({ where: { id } });
        res.json({ success: true, message: 'Banka silindi' });
    } catch (error) {
        console.error('Delete Bank Error:', error);
        res.status(500).json({ success: false, error: 'Banka silinemedi' });
    }
});

// ============================================================================
// BANK ACCOUNT ROUTES
// ============================================================================

/**
 * POST /api/banks/:bankId/accounts
 * Add an account to a bank
 */
router.post('/:bankId/accounts', authMiddleware, async (req, res) => {
    try {
        const { bankId } = req.params;
        const { accountName, accountNumber, iban, branchName, branchCode, currency } = req.body;

        // Verify bank ownership
        const bank = await prisma.bank.findFirst({ where: { id: bankId, tenantId: req.user.tenantId } });
        if (!bank) return res.status(404).json({ success: false, error: 'Banka bulunamadı' });

        if (!accountName || !iban) {
            return res.status(400).json({ success: false, error: 'Hesap adı ve IBAN zorunludur' });
        }

        const account = await prisma.bankAccount.create({
            data: {
                bankId,
                accountName,
                accountNumber: accountNumber || '',
                iban,
                branchName,
                branchCode,
                currency: currency || 'TRY'
            }
        });
        res.json({ success: true, data: account });
    } catch (error) {
        console.error('Create Account Error:', error);
        res.status(500).json({ success: false, error: 'Hesap oluşturulamadı' });
    }
});

/**
 * PUT /api/banks/accounts/:id
 * Update an account
 */
router.put('/accounts/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { accountName, accountNumber, iban, branchName, branchCode, currency } = req.body;

        // Verify account ownership through bank
        const account = await prisma.bankAccount.findUnique({
            where: { id },
            include: { bank: true }
        });

        if (!account || account.bank.tenantId !== req.user.tenantId) {
            return res.status(404).json({ success: false, error: 'Hesap bulunamadı' });
        }

        const updated = await prisma.bankAccount.update({
            where: { id },
            data: { accountName, accountNumber, iban, branchName, branchCode, currency }
        });
        res.json({ success: true, data: updated });
    } catch (error) {
        console.error('Update Account Error:', error);
        res.status(500).json({ success: false, error: 'Hesap güncellenemedi' });
    }
});

/**
 * DELETE /api/banks/accounts/:id
 * Delete an account
 */
router.delete('/accounts/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;

        // Verify account ownership through bank
        const account = await prisma.bankAccount.findUnique({
            where: { id },
            include: { bank: true }
        });

        if (!account || account.bank.tenantId !== req.user.tenantId) {
            return res.status(404).json({ success: false, error: 'Hesap bulunamadı' });
        }

        await prisma.bankAccount.delete({ where: { id } });
        res.json({ success: true, message: 'Hesap silindi' });
    } catch (error) {
        console.error('Delete Account Error:', error);
        res.status(500).json({ success: false, error: 'Hesap silinemedi' });
    }
});

module.exports = router;
