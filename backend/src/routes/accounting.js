const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();
const prisma = new PrismaClient();

// ============================================================================
// ACCOUNTS (CARILER)
// ============================================================================

/**
 * GET /api/accounting/accounts
 * List all accounts + auto-include agencies and partners
 */
router.get('/accounts', authMiddleware, async (req, res) => {
    try {
        const tenantId = req.user.tenantId;

        // 1. Manual accounts
        const accounts = await prisma.account.findMany({
            where: { tenantId },
            orderBy: { createdAt: 'desc' }
        });

        // 2. Agencies as synthetic accounts - with proper credit/debit calculation
        const agencies = await prisma.agency.findMany({
            where: { tenantId },
            include: {
                deposits: {
                    where: { status: 'APPROVED' },
                    select: { amount: true }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        const agencyAccounts = agencies.map(a => {
            // Mevcut bakiye (current remaining balance in DB)
            const currentBalance = parseFloat(a.balance) || 0;

            return {
                id: `agency-${a.id}`,
                code: `ACE-${a.id.slice(-5).toUpperCase()}`,
                name: a.companyName || a.name,
                type: 'AGENCY',
                source: 'AGENCY',
                phone: a.phone,
                email: a.email,
                taxOffice: a.taxOffice || '',
                taxNumber: a.taxNumber || '',
                address: a.address || '',
                currency: 'TRY',
                balance: currentBalance,
                debit: parseFloat(a.debit) || 0,
                credit: parseFloat(a.credit) || 0,
                _raw: a
            };
        });

        // 3. Partner users (sürücü partnerler)
        const partnerRoles = await prisma.role.findMany({
            where: { tenantId, type: 'PARTNER' }
        });
        let partnerAccounts = [];
        if (partnerRoles.length > 0) {
            const partnerRoleIds = partnerRoles.map(r => r.id);
            const partners = await prisma.user.findMany({
                where: { tenantId, roleId: { in: partnerRoleIds }, status: 'ACTIVE' },
                include: {
                    vehicles: { take: 1, select: { plateNumber: true, brand: true, model: true } }
                },
                orderBy: { createdAt: 'desc' }
            });
            partnerAccounts = partners.map(p => ({
                id: `partner-${p.id}`,
                code: `PAR-${p.id.slice(-5).toUpperCase()}`,
                name: p.fullName || `${p.firstName} ${p.lastName}`,
                type: 'PARTNER',
                source: 'PARTNER',
                phone: p.phone,
                email: p.email,
                currency: 'TRY',
                balance: parseFloat(p.balance) || 0,
                debit: parseFloat(p.debit) || 0,
                credit: parseFloat(p.credit) || 0,
                vehiclePlate: p.vehicles?.[0]?.plateNumber || null,
                _raw: p
            }));
        }

        // 4. Personnel as synthetic accounts (salary cari)
        const personnel = await prisma.personnel.findMany({
            where: { tenantId, deletedAt: null, isActive: true },
            orderBy: { createdAt: 'desc' }
        });
        const personnelAccounts = personnel.map(p => {
            const salary = parseFloat(p.salary) || 0;
            return {
                id: `personnel-${p.id}`,
                code: `PRS-${p.id.slice(-5).toUpperCase()}`,
                name: `${p.firstName} ${p.lastName}`,
                type: 'PERSONNEL',
                source: 'PERSONNEL',
                phone: p.phone,
                email: p.email,
                currency: 'TRY',
                balance: parseFloat(p.balance) || 0,
                debit: parseFloat(p.debit) || 0,
                credit: parseFloat(p.credit) || 0,
                monthlySalary: salary,
                jobTitle: p.jobTitle,
                _raw: p
            };
        });

        const all = [...accounts, ...agencyAccounts, ...partnerAccounts, ...personnelAccounts];

        res.json({ success: true, data: all });
    } catch (error) {
        console.error('Get accounts error:', error);
        res.status(500).json({ success: false, error: 'Hesaplar yüklenirken bir hata oluştu.' });
    }
});

/**
 * GET /api/accounting/accounts/:id
 */
router.get('/accounts/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const account = await prisma.account.findFirst({
            where: { id, tenantId: req.user.tenantId }
        });
        if (!account) return res.status(404).json({ success: false, error: 'Hesap bulunamadı.' });
        res.json({ success: true, data: account });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Hesap detayları yüklenirken bir hata oluştu.' });
    }
});

/**
 * POST /api/accounting/accounts
 */
router.post('/accounts', authMiddleware, async (req, res) => {
    try {
        const { code, name, type, taxNumber, taxOffice, address, phone, email, currency } = req.body;
        const existingAccount = await prisma.account.findFirst({
            where: { tenantId: req.user.tenantId, code }
        });
        if (existingAccount) return res.status(400).json({ success: false, error: 'Bu cari kodu zaten kullanılıyor.' });

        const newAccount = await prisma.account.create({
            data: { tenantId: req.user.tenantId, code, name, type, taxNumber, taxOffice, address, phone, email, currency: currency || 'TRY' }
        });
        res.status(201).json({ success: true, data: newAccount });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Hesap oluşturulurken bir hata oluştu.' });
    }
});

/**
 * PUT /api/accounting/accounts/:id
 */
router.put('/accounts/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { code, name, type, taxNumber, taxOffice, address, phone, email, currency } = req.body;
        const existingAccount = await prisma.account.findFirst({ where: { id, tenantId: req.user.tenantId } });
        if (!existingAccount) return res.status(404).json({ success: false, error: 'Hesap bulunamadı.' });

        if (code !== existingAccount.code) {
            const codeConflict = await prisma.account.findFirst({ where: { tenantId: req.user.tenantId, code, NOT: { id } } });
            if (codeConflict) return res.status(400).json({ success: false, error: 'Bu cari kodu başka bir hesap tarafından kullanılıyor.' });
        }

        const updatedAccount = await prisma.account.update({
            where: { id },
            data: { code, name, type, taxNumber, taxOffice, address, phone, email, currency }
        });
        res.json({ success: true, data: updatedAccount });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Hesap güncellenirken bir hata oluştu.' });
    }
});

/**
 * DELETE /api/accounting/accounts/:id
 */
router.delete('/accounts/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const existingAccount = await prisma.account.findFirst({ where: { id, tenantId: req.user.tenantId } });
        if (!existingAccount) return res.status(404).json({ success: false, error: 'Hesap bulunamadı.' });
        await prisma.account.delete({ where: { id } });
        res.json({ success: true, message: 'Hesap başarıyla silindi.' });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Hesap silinirken bir hata oluştu.' });
    }
});

/**
 * POST /api/accounting/transactions
 */
router.post('/transactions', authMiddleware, async (req, res) => {
    try {
        const { accountId, type, amount, description, date, isCredit } = req.body;
        const tenantId = req.user.tenantId;

        if (!accountId || !amount) {
            return res.status(400).json({ success: false, error: 'Hesap ve tutar zorunludur.' });
        }

        const numericAmount = parseFloat(amount);
        if (isNaN(numericAmount) || numericAmount <= 0) {
            return res.status(400).json({ success: false, error: 'Geçerli bir tutar girin.' });
        }

        // isCredit denotes if this is an operation increasing Alacak (true) or Borç (false). 
        // Wait, in accounts page: `const isCredit = txType === 'DEBIT_IN' || txType === 'SALES_INVOICE';` 
        // Wait, "DEBIT_IN" means customer pays us? No, it's called Cari Giriş.
        // Actually, DEBIT_IN = Müşteri bize para verdi (Credit increases, balance increases? No, Müşteri owes us -> balance decreases).
        // The logic from invoices: SALES (Müşteri owes us) -> balance decreases (isSales ? -amount). Debit increases.
        // Müşteri bize ödeme yaptı (Cari Giriş/DEBIT_IN): their balance increases, Credit increases.
        // Let's just adjust balance based on isCredit:
        // isCredit = true -> balance increases -> Credit increases
        // isCredit = false -> balance decreases -> Debit increases
        const balanceChange = isCredit ? numericAmount : -numericAmount;
        const debitChange = isCredit ? 0 : numericAmount;
        const creditChange = isCredit ? numericAmount : 0;

        let transactionType = 'MANUAL_IN';
        if (type === 'DEBIT_IN' || isCredit) transactionType = 'MANUAL_IN';
        if (type === 'DEBIT_OUT' || !isCredit) transactionType = 'MANUAL_OUT';

        // 1. Log transaction
        await prisma.transaction.create({
            data: {
                tenantId,
                accountId,
                type: transactionType,
                amount: numericAmount,
                isCredit: isCredit === true,
                description: description || 'Manuel Cari İşlem',
                date: date ? new Date(date) : new Date(),
            }
        });

        // 2. Adjust Balance
        if (accountId.startsWith('agency-')) {
            const id = accountId.replace('agency-', '');
            await prisma.agency.update({
                where: { id },
                data: { balance: { increment: balanceChange }, debit: { increment: debitChange }, credit: { increment: creditChange } }
            });
        } else if (accountId.startsWith('personnel-')) {
            const id = accountId.replace('personnel-', '');
            await prisma.personnel.update({
                where: { id },
                data: { balance: { increment: balanceChange }, debit: { increment: debitChange }, credit: { increment: creditChange } }
            });
        } else if (accountId.startsWith('partner-')) {
            const id = accountId.replace('partner-', '');
            await prisma.user.update({
                where: { id },
                data: { balance: { increment: balanceChange }, debit: { increment: debitChange }, credit: { increment: creditChange } }
            });
        } else {
            await prisma.account.update({
                where: { id: accountId, tenantId },
                data: { balance: { increment: balanceChange }, debit: { increment: debitChange }, credit: { increment: creditChange } }
            });
        }

        res.json({ success: true, message: 'İşlem başarıyla kaydedildi' });
    } catch (error) {
        console.error('Transactions route error:', error);
        res.status(500).json({ success: false, error: 'İşlem kaydedilirken bir hata oluştu.' });
    }
});

/**
 * GET /api/accounting/accounts/:id/transactions
 * Retrieve statement/history for a specific account chronologically.
 */
router.get('/accounts/:id/transactions', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const tenantId = req.user.tenantId;
        console.log(`[DEBUG] Fetching transactions for accountId: ${id}, tenantId: ${tenantId}`);

        const transactions = await prisma.transaction.findMany({
            where: {
                tenantId,
                accountId: id
            },
            orderBy: {
                date: 'asc' // Oldest to newest for running balance
            }
        });

        console.log(`[DEBUG] Returned ${transactions.length} transactions`);

        // Fetch account info based on prefix
        let accountInfo = null;
        if (id.startsWith('agency-')) {
            const agId = id.replace('agency-', '');
            const agency = await prisma.agency.findUnique({ where: { id: agId } });
            if (agency) accountInfo = { name: agency.name, phone: agency.phone, email: agency.email, code: agency.code, balance: Number(agency.balance || 0), debit: Number(agency.debit || 0), credit: Number(agency.credit || 0) };
        } else if (id.startsWith('personnel-')) {
            const pId = id.replace('personnel-', '');
            const personnel = await prisma.personnel.findUnique({ where: { id: pId } });
            if (personnel) accountInfo = { name: `${personnel.firstName} ${personnel.lastName}`, phone: personnel.phone, email: personnel.email, balance: Number(personnel.balance || 0), debit: Number(personnel.debit || 0), credit: Number(personnel.credit || 0) };
        } else if (id.startsWith('partner-')) {
            const pId = id.replace('partner-', '');
            const partner = await prisma.user.findUnique({ where: { id: pId } });
            if (partner) accountInfo = { name: `${partner.firstName} ${partner.lastName}`, phone: partner.phone, email: partner.email, balance: Number(partner.balance || 0), debit: Number(partner.debit || 0), credit: Number(partner.credit || 0) };
        } else {
            const account = await prisma.account.findUnique({ where: { id, tenantId } });
            if (account) accountInfo = { name: account.name, phone: account.phone, email: account.email, code: account.code, balance: Number(account.balance || 0), debit: Number(account.debit || 0), credit: Number(account.credit || 0) };
        }

        res.json({ success: true, data: transactions, account: accountInfo });
    } catch (error) {
        console.error('Fetch transactions error:', error);
        res.status(500).json({ success: false, error: 'Ekstre alınırken hata oluştu.' });
    }
});

/**
 * PUT /api/accounting/transactions/:id
 * Only allows editing of MANUAL transactions (Cari Giriş/Çıkış)
 */
router.put('/transactions/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const tenantId = req.user.tenantId;
        const { amount, description, date, isCredit } = req.body;

        const transaction = await prisma.transaction.findFirst({
            where: { id, tenantId }
        });

        if (!transaction) {
            return res.status(404).json({ success: false, error: 'İşlem bulunamadı' });
        }

        if (transaction.type !== 'MANUAL_IN' && transaction.type !== 'MANUAL_OUT') {
            return res.status(400).json({ success: false, error: 'Sadece manuel işlemler düzenlenebilir. Fatura/Tahsilat sistem tarafından oluşturulur.' });
        }

        const numericAmount = parseFloat(amount);
        if (isNaN(numericAmount) || numericAmount <= 0) {
            return res.status(400).json({ success: false, error: 'Geçerli bir tutar girin.' });
        }

        const oldAmount = Number(transaction.amount);
        const oldIsCredit = transaction.isCredit;
        const accountId = transaction.accountId;

        // Calculate differences to revert the old and apply the new
        // Previous effect on balance:
        const oldBalanceEffect = oldIsCredit ? oldAmount : -oldAmount;
        const oldDebitEffect = oldIsCredit ? 0 : oldAmount;
        const oldCreditEffect = oldIsCredit ? oldAmount : 0;

        // New effect on balance:
        const newBalanceEffect = isCredit ? numericAmount : -numericAmount;
        const newDebitEffect = isCredit ? 0 : numericAmount;
        const newCreditEffect = isCredit ? numericAmount : 0;

        const diffBalance = newBalanceEffect - oldBalanceEffect;
        const diffDebit = newDebitEffect - oldDebitEffect;
        const diffCredit = newCreditEffect - oldCreditEffect;

        let transactionType = 'MANUAL_IN';
        if (isCredit) transactionType = 'MANUAL_IN';
        if (!isCredit) transactionType = 'MANUAL_OUT';

        // 1. Update Transaction
        await prisma.transaction.update({
            where: { id },
            data: {
                amount: numericAmount,
                isCredit: isCredit === true,
                type: transactionType,
                description: description || transaction.description,
                date: date ? new Date(date) : transaction.date,
            }
        });

        // 2. Adjust Balance Diff
        if (accountId.startsWith('agency-')) {
            const accId = accountId.replace('agency-', '');
            await prisma.agency.update({
                where: { id: accId },
                data: { balance: { increment: diffBalance }, debit: { increment: diffDebit }, credit: { increment: diffCredit } }
            });
        } else if (accountId.startsWith('personnel-')) {
            const accId = accountId.replace('personnel-', '');
            await prisma.personnel.update({
                where: { id: accId },
                data: { balance: { increment: diffBalance }, debit: { increment: diffDebit }, credit: { increment: diffCredit } }
            });
        } else if (accountId.startsWith('partner-')) {
            const accId = accountId.replace('partner-', '');
            await prisma.user.update({
                where: { id: accId },
                data: { balance: { increment: diffBalance }, debit: { increment: diffDebit }, credit: { increment: diffCredit } }
            });
        } else {
            await prisma.account.update({
                where: { id: accountId, tenantId },
                data: { balance: { increment: diffBalance }, debit: { increment: diffDebit }, credit: { increment: diffCredit } }
            });
        }

        res.json({ success: true, message: 'İşlem başarıyla güncellendi' });
    } catch (error) {
        console.error('Update transaction error:', error);
        res.status(500).json({ success: false, error: 'İşlem güncellenirken hata oluştu' });
    }
});

// ============================================================================
// PAYROLL (PERSONEL HAKEDİŞ & MAAŞ)
// ============================================================================

/**
 * GET /api/accounting/payroll/personnel
 * List all personnel with payroll summary
 */
router.get('/payroll/personnel', authMiddleware, async (req, res) => {
    try {
        const { tenantId } = req.user;
        const personnel = await prisma.personnel.findMany({
            where: { tenantId, deletedAt: null, isActive: true },
            orderBy: { firstName: 'asc' }
        });

        const result = personnel.map(p => {
            const meta = (p.metadata && typeof p.metadata === 'object') ? p.metadata : {};
            const transactions = Array.isArray(meta.transactions) ? meta.transactions : [];
            const totalAdvance = transactions.filter(t => t.type === 'ADVANCE').reduce((s, t) => s + (t.amount || 0), 0);
            const totalSalary = transactions.filter(t => t.type === 'SALARY').reduce((s, t) => s + (t.amount || 0), 0);
            const totalEntitlement = transactions.filter(t => t.type === 'ENTITLEMENT').reduce((s, t) => s + (t.amount || 0), 0);
            return {
                id: p.id,
                firstName: p.firstName,
                lastName: p.lastName,
                jobTitle: p.jobTitle,
                department: p.department,
                phone: p.phone,
                email: p.email,
                salary: parseFloat(p.salary) || 0,
                totalAdvance,
                totalSalary,
                totalEntitlement,
                balance: totalEntitlement - (totalAdvance + totalSalary),
                transactions
            };
        });

        res.json({ success: true, data: result });
    } catch (error) {
        console.error('Payroll personnel error:', error);
        res.status(500).json({ success: false, error: 'Personel listesi alınamadı.' });
    }
});

/**
 * GET /api/accounting/payroll/transactions/:personnelId
 * Get transaction history for a specific personnel
 */
router.get('/payroll/transactions/:personnelId', authMiddleware, async (req, res) => {
    try {
        const { tenantId } = req.user;
        const { personnelId } = req.params;
        const p = await prisma.personnel.findFirst({ where: { id: personnelId, tenantId } });
        if (!p) return res.status(404).json({ success: false, error: 'Personel bulunamadı.' });

        const meta = (p.metadata && typeof p.metadata === 'object') ? p.metadata : {};
        const transactions = Array.isArray(meta.transactions) ? meta.transactions : [];
        res.json({ success: true, data: transactions.sort((a, b) => new Date(b.date) - new Date(a.date)) });
    } catch (error) {
        res.status(500).json({ success: false, error: 'İşlem geçmişi alınamadı.' });
    }
});

/**
 * POST /api/accounting/payroll/advance
 * Record an advance payment for personnel
 */
router.post('/payroll/advance', authMiddleware, async (req, res) => {
    try {
        const { tenantId } = req.user;
        const { personnelId, amount, note, date } = req.body;
        if (!personnelId || !amount) return res.status(400).json({ success: false, error: 'Personel ve tutar zorunludur.' });

        const p = await prisma.personnel.findFirst({ where: { id: personnelId, tenantId } });
        if (!p) return res.status(404).json({ success: false, error: 'Personel bulunamadı.' });

        const meta = (p.metadata && typeof p.metadata === 'object') ? p.metadata : { transactions: [] };
        if (!Array.isArray(meta.transactions)) meta.transactions = [];

        const tx = {
            id: `tx-${Date.now()}`,
            type: 'ADVANCE',
            amount: parseFloat(amount),
            note: note || '',
            date: date || new Date().toISOString(),
            createdBy: req.user.id
        };
        meta.transactions.push(tx);

        await prisma.personnel.update({
            where: { id: personnelId },
            data: {
                metadata: meta,
                balance: { decrement: parseFloat(amount) },
                debit: { increment: parseFloat(amount) }
            }
        });

        // Also record to the global Transaction statement
        await prisma.transaction.create({
            data: {
                tenantId,
                accountId: `personnel-${personnelId}`,
                type: 'SALARY', // or generic salary/advance type
                amount: parseFloat(amount),
                currency: 'TRY',
                isCredit: false, // Advance = payment out (Bizden çıkan / Debit)
                description: `Personel Avans Ödemesi: ${note || ''}`,
                date: tx.date ? new Date(tx.date) : new Date()
            }
        });

        res.json({ success: true, data: tx, message: 'Avans kaydedildi.' });
    } catch (error) {
        console.error('Payroll advance error:', error);
        res.status(500).json({ success: false, error: 'Avans kaydedilemedi: ' + error.message });
    }
});

/**
 * POST /api/accounting/payroll/salary
 * Record a salary payment for personnel
 */
router.post('/payroll/salary', authMiddleware, async (req, res) => {
    try {
        const { tenantId } = req.user;
        const { personnelId, amount, note, period, date } = req.body;
        if (!personnelId || !amount) return res.status(400).json({ success: false, error: 'Personel ve tutar zorunludur.' });

        const p = await prisma.personnel.findFirst({ where: { id: personnelId, tenantId } });
        if (!p) return res.status(404).json({ success: false, error: 'Personel bulunamadı.' });

        const meta = (p.metadata && typeof p.metadata === 'object') ? p.metadata : { transactions: [] };
        if (!Array.isArray(meta.transactions)) meta.transactions = [];

        const tx = {
            id: `tx-${Date.now()}`,
            type: 'SALARY',
            amount: parseFloat(amount),
            note: note || '',
            period: period || '',
            date: date || new Date().toISOString(),
            createdBy: req.user.id
        };
        meta.transactions.push(tx);

        await prisma.personnel.update({
            where: { id: personnelId },
            data: {
                metadata: meta,
                balance: { decrement: parseFloat(amount) },
                debit: { increment: parseFloat(amount) }
            }
        });

        // Also record to the global Transaction statement
        await prisma.transaction.create({
            data: {
                tenantId,
                accountId: `personnel-${personnelId}`,
                type: 'SALARY',
                amount: parseFloat(amount),
                currency: 'TRY',
                isCredit: false, // Salary = payment out (Bizden çıkan / Debit)
                description: `Personel Maaş Ödemesi - Dönem: ${period || ''} - Not: ${note || ''}`,
                date: tx.date ? new Date(tx.date) : new Date()
            }
        });

        res.json({ success: true, data: tx, message: 'Maaş ödemesi kaydedildi.' });
    } catch (error) {
        console.error('Payroll salary error:', error);
        res.status(500).json({ success: false, error: 'Maaş ödemesi kaydedilemedi: ' + error.message });
    }
});

/**
 * DELETE /api/accounting/payroll/transaction
 * Delete a payroll transaction
 */
router.delete('/payroll/transaction', authMiddleware, async (req, res) => {
    try {
        const { tenantId } = req.user;
        const { personnelId, transactionId } = req.body;
        const p = await prisma.personnel.findFirst({ where: { id: personnelId, tenantId } });
        if (!p) return res.status(404).json({ success: false, error: 'Personel bulunamadı.' });

        const meta = (p.metadata && typeof p.metadata === 'object') ? p.metadata : { transactions: [] };
        meta.transactions = (meta.transactions || []).filter(t => t.id !== transactionId);
        await prisma.personnel.update({ where: { id: personnelId }, data: { metadata: meta } });
        res.json({ success: true, message: 'İşlem silindi.' });
    } catch (error) {
        res.status(500).json({ success: false, error: 'İşlem silinemedi.' });
    }
});

module.exports = router;

