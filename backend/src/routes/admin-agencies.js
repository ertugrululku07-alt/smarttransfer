const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authMiddleware } = require('../middleware/auth');
const bcrypt = require('bcryptjs');

const router = express.Router();
const prisma = new PrismaClient();

// List all agencies
router.get('/', authMiddleware, async (req, res) => {
    try {
        const tenantId = req.tenant?.id;
        if (!tenantId) return res.status(400).json({ success: false, error: 'Tenant context missing' });

        const agencies = await prisma.agency.findMany({
            where: { tenantId },
            include: {
                _count: {
                    select: { users: true, bookings: true }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        res.json({ success: true, data: agencies });
    } catch (error) {
        console.error('Fetch agencies error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch agencies' });
    }
});

// Create new agency
router.post('/', authMiddleware, async (req, res) => {
    try {
        const tenantId = req.tenant?.id;
        if (!tenantId) return res.status(400).json({ success: false, error: 'Tenant context missing' });

        const { name, contactName, email, phone, commissionRate, status, password } = req.body;

        if (!password) {
            return res.status(400).json({ success: false, error: 'Password is required for the agency admin' });
        }

        // Check if user email already exists for this tenant
        const existingUser = await prisma.user.findFirst({ where: { tenantId, email } });
        if (existingUser) {
            return res.status(400).json({ success: false, error: 'Email is already in use by another user' });
        }

        let role = await prisma.role.findFirst({
            where: { tenantId, type: 'AGENCY_ADMIN' }
        });

        // Auto-create AGENCY_ADMIN (and AGENCY_STAFF) roles if they don't exist for this tenant
        if (!role) {
            role = await prisma.role.create({
                data: {
                    tenantId,
                    name: 'Acente Yöneticisi',
                    code: 'AGENCY_ADMIN',
                    type: 'AGENCY_ADMIN',
                    description: 'Alt acente yönetici rolü',
                    isActive: true,
                    isSystem: true
                }
            });

            // Also create AGENCY_STAFF if missing
            const staffExists = await prisma.role.findFirst({ where: { tenantId, type: 'AGENCY_STAFF' } });
            if (!staffExists) {
                await prisma.role.create({
                    data: {
                        tenantId,
                        name: 'Acente Personeli',
                        code: 'AGENCY_STAFF',
                        type: 'AGENCY_STAFF',
                        description: 'Alt acente personel rolü',
                        isActive: true,
                        isSystem: true
                    }
                });
            }
        }


        const result = await prisma.$transaction(async (tx) => {
            const agency = await tx.agency.create({
                data: {
                    tenantId,
                    name,
                    contactName,
                    email,
                    phone,
                    commissionRate: commissionRate || 0,
                    status: status || 'ACTIVE'
                }
            });

            const passwordHash = await bcrypt.hash(password, 10);
            const nameParts = contactName.trim().split(' ');
            const firstName = nameParts[0] || 'Agency';
            const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : 'Admin';

            await tx.user.create({
                data: {
                    tenantId,
                    agencyId: agency.id,
                    roleId: role.id,
                    email,
                    firstName,
                    lastName,
                    fullName: contactName,
                    passwordHash,
                    status: 'ACTIVE'
                }
            });

            return agency;
        });

        res.json({ success: true, data: result });
    } catch (error) {
        console.error('Create agency error:', error);
        res.status(500).json({ success: false, error: 'Failed to create agency' });
    }
});

// Update agency
router.put('/:id', authMiddleware, async (req, res) => {
    try {
        const tenantId = req.tenant?.id;
        const { id } = req.params;
        const { name, contactName, email, phone, commissionRate, status } = req.body;

        const agency = await prisma.agency.updateMany({
            where: { id, tenantId },
            data: {
                name,
                contactName,
                email,
                phone,
                commissionRate,
                status
            }
        });

        res.json({ success: true, data: agency });
    } catch (error) {
        console.error('Update agency error:', error);
        res.status(500).json({ success: false, error: 'Failed to update agency' });
    }
});

// Delete agency
router.delete('/:id', authMiddleware, async (req, res) => {
    try {
        const tenantId = req.tenant?.id;
        const { id } = req.params;

        await prisma.agency.deleteMany({
            where: { id, tenantId }
        });

        res.json({ success: true, message: 'Agency deleted successfully' });
    } catch (error) {
        console.error('Delete agency error:', error);
        res.status(500).json({ success: false, error: 'Failed to delete agency' });
    }
});

// ==========================================
// DEPOSITS (CARI HESAP)
// ==========================================

// List all deposits
router.get('/deposits', authMiddleware, async (req, res) => {
    try {
        const tenantId = req.tenant?.id;

        const deposits = await prisma.agencyDeposit.findMany({
            where: { tenantId },
            include: {
                agency: { select: { name: true, contactName: true } },
                bankAccount: { include: { bank: true } },
                approvedBy: { select: { firstName: true, lastName: true } }
            },
            orderBy: { createdAt: 'desc' }
        });

        res.json({ success: true, data: deposits });
    } catch (error) {
        console.error('Fetch all agency deposits error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch deposits' });
    }
});

// Approve a deposit (Bank Transfer / EFT)
router.post('/deposits/:id/approve', authMiddleware, async (req, res) => {
    try {
        const tenantId = req.tenant?.id;
        const { id } = req.params;

        const deposit = await prisma.agencyDeposit.findFirst({
            where: { id, tenantId }
        });

        if (!deposit) {
            return res.status(404).json({ success: false, error: 'Depozito bulunamadı' });
        }

        if (deposit.status === 'APPROVED') {
            return res.status(400).json({ success: false, error: 'Bu depozito zaten onaylanmış' });
        }

        if (deposit.status === 'REJECTED') {
            return res.status(400).json({ success: false, error: 'Bu depozito reddedilmiş' });
        }

        // Use transaction to approve deposit and increment balance
        const result = await prisma.$transaction(async (tx) => {
            const updatedDeposit = await tx.agencyDeposit.update({
                where: { id },
                data: {
                    status: 'APPROVED',
                    approvedById: req.user.id,
                    approvedAt: new Date()
                }
            });

            const updatedAgency = await tx.agency.update({
                where: { id: deposit.agencyId },
                data: { balance: { increment: deposit.amount }, credit: { increment: deposit.amount } }
            });

            await tx.transaction.create({
                data: {
                    tenantId: req.tenant.id,
                    accountId: `agency-${deposit.agencyId}`,
                    type: 'DEPOSIT', // Depozito
                    amount: deposit.amount,
                    isCredit: true,
                    description: `Admin Tarafından Depozito Onayı - ${deposit.transactionRef}`,
                    date: new Date(),
                    referenceId: deposit.id
                }
            });

            return { deposit: updatedDeposit, agency: updatedAgency };
        });

        res.json({ success: true, message: 'Depozito onaylandı ve bakiye eklendi.', data: result });
    } catch (error) {
        console.error('Approve deposit error:', error);
        res.status(500).json({ success: false, error: 'Failed to approve deposit' });
    }
});

// ==========================================
// AGENCY CONTRACT META (General / Fallback pricing per vehicleType)
// ==========================================

// GET meta for a vehicleType
router.get('/:id/contract-meta/:vehicleTypeId', authMiddleware, async (req, res) => {
    try {
        const tenantId = req.tenant?.id;
        const { id: agencyId, vehicleTypeId } = req.params;
        const meta = await prisma.agencyContractMeta.findUnique({
            where: { agencyId_vehicleTypeId: { agencyId, vehicleTypeId } }
        });
        res.json({ success: true, data: meta || null });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Failed' });
    }
});

// POST (upsert) meta for a vehicleType
router.post('/:id/contract-meta/:vehicleTypeId', authMiddleware, async (req, res) => {
    try {
        const tenantId = req.tenant?.id;
        if (!tenantId) return res.status(400).json({ success: false, error: 'Tenant context missing' });

        const { id: agencyId, vehicleTypeId } = req.params;
        const { currency, openingFee, basePricePerKm, fixedPrice, basePricePerHour } = req.body;

        const meta = await prisma.agencyContractMeta.upsert({
            where: { agencyId_vehicleTypeId: { agencyId, vehicleTypeId } },
            create: {
                tenantId, agencyId, vehicleTypeId,
                currency: currency || 'EUR',
                openingFee: openingFee != null ? parseFloat(openingFee) : null,
                basePricePerKm: basePricePerKm != null ? parseFloat(basePricePerKm) : null,
                fixedPrice: fixedPrice != null ? parseFloat(fixedPrice) : null,
                basePricePerHour: basePricePerHour != null ? parseFloat(basePricePerHour) : null,
            },
            update: {
                currency: currency || 'EUR',
                openingFee: openingFee != null ? parseFloat(openingFee) : null,
                basePricePerKm: basePricePerKm != null ? parseFloat(basePricePerKm) : null,
                fixedPrice: fixedPrice != null ? parseFloat(fixedPrice) : null,
                basePricePerHour: basePricePerHour != null ? parseFloat(basePricePerHour) : null,
            }
        });

        res.json({ success: true, data: meta });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Failed to save meta: ' + error.message });
    }
});

// ==========================================
// AGENCY CONTRACT PRICES (ZONE-BASED)
// ==========================================

// GET all contracts for an agency (grouped by vehicleType)
router.get('/:id/contracts', authMiddleware, async (req, res) => {
    try {
        const tenantId = req.tenant?.id;
        const { id } = req.params;

        const contracts = await prisma.agencyContractPrice.findMany({
            where: { agencyId: id, tenantId },
            include: {
                vehicleType: { select: { id: true, name: true, category: true, image: true } },
                zone: { select: { id: true, name: true, color: true } }
            },
            orderBy: [{ vehicleTypeId: 'asc' }, { createdAt: 'asc' }]
        });

        res.json({ success: true, data: contracts });
    } catch (error) {
        console.error('Fetch agency contracts error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch contracts' });
    }
});

// POST /:id/contracts/:vehicleTypeId  — Save all zone rows for one vehicle type (clear + recreate)
router.post('/:id/contracts/:vehicleTypeId', authMiddleware, async (req, res) => {
    try {
        const tenantId = req.tenant?.id;
        if (!tenantId) return res.status(400).json({ success: false, error: 'Tenant context missing' });

        const { id: agencyId, vehicleTypeId } = req.params;
        const { zonePrices } = req.body; // array of zone price rows

        if (!Array.isArray(zonePrices)) {
            return res.status(400).json({ success: false, error: 'zonePrices array gereklidir' });
        }

        await prisma.$transaction(async (tx) => {
            // Clear existing rows for this agency+vehicleType
            await tx.agencyContractPrice.deleteMany({ where: { agencyId, vehicleTypeId } });

            // Create new rows
            if (zonePrices.length > 0) {
                await tx.agencyContractPrice.createMany({
                    data: zonePrices.map(z => ({
                        tenantId,
                        agencyId,
                        vehicleTypeId,
                        zoneId: z.zoneId,
                        baseLocation: z.baseLocation || 'AYT',
                        price: parseFloat(z.price) || 0,
                        childPrice: z.childPrice != null ? parseFloat(z.childPrice) : null,
                        babyPrice: z.babyPrice != null ? parseFloat(z.babyPrice) : null,
                        fixedPrice: z.fixedPrice != null ? parseFloat(z.fixedPrice) : null,
                        cost: z.cost != null ? parseFloat(z.cost) : null,
                        extraKmPrice: z.extraKmPrice != null ? parseFloat(z.extraKmPrice) : null,
                        isActive: z.isActive !== false
                    }))
                });
            }
        });

        const saved = await prisma.agencyContractPrice.findMany({
            where: { agencyId, vehicleTypeId },
            include: {
                vehicleType: { select: { id: true, name: true, category: true } },
                zone: { select: { id: true, name: true, color: true } }
            }
        });

        res.json({ success: true, data: saved });
    } catch (error) {
        console.error('Save agency contract error:', error.message);
        res.status(500).json({ success: false, error: 'Kontrat kaydedilemedi: ' + error.message });
    }
});

// DELETE /:id/contracts/:vehicleTypeId  — Remove all zone rows for one vehicle type
router.delete('/:id/contracts/:vehicleTypeId', authMiddleware, async (req, res) => {
    try {
        const tenantId = req.tenant?.id;
        const { id: agencyId, vehicleTypeId } = req.params;

        await prisma.agencyContractPrice.deleteMany({ where: { agencyId, vehicleTypeId, tenantId } });

        res.json({ success: true, message: 'Kontrat silindi' });
    } catch (error) {
        console.error('Delete agency contract error:', error);
        res.status(500).json({ success: false, error: 'Failed to delete contract' });
    }
});

module.exports = router;

