const express = require('express');
const router = express.Router();

const { authMiddleware } = require('../middleware/auth');
const bcrypt = require('bcryptjs');
const prisma = require('../lib/prisma');

// Get all personnel
router.get('/', authMiddleware, async (req, res) => {
    try {
        const { tenantId } = req.user;
        const personnel = await prisma.personnel.findMany({
            where: { tenantId, deletedAt: null },
            orderBy: { createdAt: 'desc' },
            include: {
                user: {
                    select: {
                        id: true,
                        email: true,
                        fullName: true,
                        roleCode: true
                    }
                }
            }
        });
        res.json({ success: true, data: personnel });
    } catch (error) {
        console.error('Get personnel error:', error);
        res.status(500).json({ success: false, error: 'Personel listesi alınamadı' });
    }
});

// Get single personnel
router.get('/:id', authMiddleware, async (req, res) => {
    try {
        const { tenantId } = req.user;
        const { id } = req.params;
        const personnel = await prisma.personnel.findFirst({
            where: { id, tenantId, deletedAt: null },
            include: {
                user: {
                    select: {
                        id: true,
                        email: true,
                        fullName: true
                    }
                }
            }
        });

        if (!personnel) {
            return res.status(404).json({ success: false, error: 'Personel bulunamadı' });
        }

        res.json({ success: true, data: personnel });
    } catch (error) {
        console.error('Get personnel detail error:', error);
        res.status(500).json({ success: false, error: 'Personel detayları alınamadı' });
    }
});

// Create personnel
router.post('/', authMiddleware, async (req, res) => {
    try {
        const { tenantId } = req.user;
        const data = req.body;

        // Basic validation
        if (!data.firstName || !data.lastName || !data.tcNumber) {
            return res.status(400).json({ success: false, error: 'Ad, Soyad ve TC Kimlik No zorunludur' });
        }

        if (!data.email || !data.password) {
            return res.status(400).json({ success: false, error: 'E-posta ve Şifre zorunludur' });
        }

        // Check uniqueness of TC Number within tenant logic...
        const existing = await prisma.personnel.findFirst({
            where: {
                tenantId,
                tcNumber: data.tcNumber,
                deletedAt: null
            }
        });

        if (existing) {
            return res.status(400).json({ success: false, error: 'Bu TC Kimlik No ile kayıtlı personel zaten var' });
        }

        // Check if user email exists
        const existingUser = await prisma.user.findFirst({
            where: {
                tenantId,
                email: data.email
            }
        });

        if (existingUser) {
            return res.status(400).json({ success: false, error: 'Bu e-posta adresi zaten kullanımda' });
        }

        // Determine Role
        let roleCode = 'TENANT_STAFF'; // Default
        if (['DRIVER', 'ACCOUNTANT', 'OPERATION', 'RESERVATION'].includes(data.jobTitle)) {
            roleCode = data.jobTitle;
        }

        // Find or Create Role
        let role = await prisma.role.findFirst({
            where: {
                tenantId,
                code: roleCode
            }
        });

        if (!role) {
            role = await prisma.role.create({
                data: {
                    tenantId,
                    code: roleCode,
                    name: roleCode === 'DRIVER' ? 'Sürücü' :
                        roleCode === 'ACCOUNTANT' ? 'Muhasebe' :
                            roleCode === 'OPERATION' ? 'Operasyon' :
                                roleCode === 'RESERVATION' ? 'Rezervasyon' : 'Personel',
                    type: 'TENANT_STAFF' // Using generic staff type
                }
            });
        }

        // Hash Password
        const hashedPassword = await bcrypt.hash(data.password, 10);

        // Create User & Personnel in transaction
        const result = await prisma.$transaction(async (tx) => {
            // 1. Create User
            const newUser = await tx.user.create({
                data: {
                    tenantId,
                    email: data.email,
                    passwordHash: hashedPassword,
                    firstName: data.firstName,
                    lastName: data.lastName,
                    fullName: `${data.firstName} ${data.lastName}`,
                    roleId: role.id,
                    emailVerified: true,
                    status: 'ACTIVE',
                    avatar: data.photo
                }
            });

            // 2. Create Personnel linked to User
            const newPersonnel = await tx.personnel.create({
                data: {
                    tenantId,
                    userId: newUser.id,
                    firstName: data.firstName,
                    lastName: data.lastName,
                    tcNumber: data.tcNumber,
                    birthDate: data.birthDate ? new Date(data.birthDate) : undefined,
                    birthPlace: data.birthPlace,
                    gender: data.gender,
                    address: data.address,
                    phone: data.phone,
                    relativePhone: data.relativePhone,
                    email: data.email,
                    startDate: data.startDate ? new Date(data.startDate) : undefined,
                    endDate: data.endDate ? new Date(data.endDate) : undefined,
                    jobTitle: data.jobTitle,
                    department: data.department,
                    salary: data.salary ? parseFloat(data.salary) : undefined,
                    isActive: data.isActive !== undefined ? data.isActive : true,
                    licenseType: data.licenseType,
                    srcNumber: data.srcNumber,
                    psychotechDocument: data.psychotechDocument,
                    medicalHistory: data.medicalHistory,
                    bloodGroup: data.bloodGroup,
                    photo: data.photo
                }
            });

            return newPersonnel;
        });

        res.json({ success: true, data: result });
    } catch (error) {
        console.error('Create personnel error:', error);
        res.status(500).json({ success: false, error: 'Personel oluşturulamadı: ' + error.message });
    }
});

// Update personnel
router.put('/:id', authMiddleware, async (req, res) => {
    try {
        const { tenantId } = req.user;
        const { id } = req.params;
        const data = req.body;

        // Check existence
        const existing = await prisma.personnel.findFirst({
            where: { id, tenantId, deletedAt: null }
        });

        if (!existing) {
            return res.status(404).json({ success: false, error: 'Personel bulunamadı' });
        }

        // If personnel has no userId but has phone/email + password, create and link a user account
        let linkedUserId = existing.userId;
        if (!linkedUserId && data.password && (data.phone || data.email)) {
            const hashedPassword = await bcrypt.hash(data.password, 10);
            const newUser = await prisma.user.create({
                data: {
                    tenantId,
                    fullName: `${data.firstName || existing.firstName} ${data.lastName || existing.lastName}`.trim(),
                    email: data.email || existing.email || null,
                    phone: data.phone || existing.phone || null,
                    password: hashedPassword,
                    roleCode: 'DRIVER',
                    roleType: 'DRIVER',
                    isActive: true,
                }
            });
            linkedUserId = newUser.id;
        }

        const personnel = await prisma.personnel.update({
            where: { id },
            data: {
                firstName: data.firstName,
                lastName: data.lastName,
                // tcNumber: data.tcNumber, // Usually TC doesn't change, but if allowed, check uniqueness
                birthDate: data.birthDate ? new Date(data.birthDate) : undefined,
                birthPlace: data.birthPlace,
                gender: data.gender,
                address: data.address,
                phone: data.phone,
                relativePhone: data.relativePhone,
                email: data.email,
                startDate: data.startDate ? new Date(data.startDate) : undefined,
                endDate: data.endDate ? new Date(data.endDate) : undefined,
                jobTitle: data.jobTitle,
                department: data.department,
                salary: data.salary ? parseFloat(data.salary) : undefined,
                isActive: data.isActive,
                licenseType: data.licenseType,
                srcNumber: data.srcNumber,
                psychotechDocument: data.psychotechDocument,
                medicalHistory: data.medicalHistory,
                bloodGroup: data.bloodGroup,
                photo: data.photo,
                ...(linkedUserId && !existing.userId ? { userId: linkedUserId } : {})
            }
        });

        if (personnel.userId && data.photo !== undefined) {
            await prisma.user.update({
                where: { id: personnel.userId },
                data: { avatar: data.photo }
            });
        }

        res.json({ success: true, data: personnel });
    } catch (error) {
        console.error('Update personnel error:', error);
        res.status(500).json({ success: false, error: 'Personel güncellenemedi' });
    }
});

// Delete personnel (Soft delete)
router.delete('/:id', authMiddleware, async (req, res) => {
    try {
        const { tenantId } = req.user;
        const { id } = req.params;

        const personnel = await prisma.personnel.updateMany({
            where: { id, tenantId },
            data: { deletedAt: new Date(), isActive: false }
        });

        if (personnel.count === 0) {
            return res.status(404).json({ success: false, error: 'Personel bulunamadı' });
        }

        res.json({ success: true, message: 'Personel silindi' });
    } catch (error) {
        console.error('Delete personnel error:', error);
        res.status(500).json({ success: false, error: 'Personel silinemedi' });
    }
});

module.exports = router;
