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
                        fullName: true
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

        // AIRPORT_STAFF must have an airport zone assigned so the greeter only
        // sees the bookings landing at their airport.
        if (data.jobTitle === 'AIRPORT_STAFF' && !data.assignedAirportZoneId) {
            return res.status(400).json({
                success: false,
                error: 'Karşılama personeli için hangi havalimanında çalışacağı seçilmelidir'
            });
        }

        // Normalize email once and reuse everywhere
        data.email = String(data.email).toLowerCase().trim();

        // Check uniqueness of TC Number within tenant logic...
        const existing = await prisma.personnel.findFirst({
            where: {
                tenantId,
                tcNumber: data.tcNumber,
                deletedAt: null
            }
        });

        if (existing) {
            // If the existing record is blacklisted, return blacklist info so frontend can warn
            if (existing.metadata?.blacklisted) {
                if (!data.forceBlacklistOverride) {
                    return res.status(409).json({
                        success: false,
                        error: 'BLACKLISTED',
                        blacklistInfo: {
                            name: `${existing.firstName} ${existing.lastName}`,
                            tcNumber: existing.tcNumber,
                            reason: existing.metadata?.terminationReason || 'Belirtilmemiş',
                            note: existing.metadata?.blacklistNote || existing.metadata?.terminationNote || '',
                            endDate: existing.endDate,
                            blacklistedAt: existing.metadata?.blacklistedAt
                        }
                    });
                }
                // User confirmed override — soft-delete the old blacklisted record so new one can be created
                await prisma.personnel.update({
                    where: { id: existing.id },
                    data: { deletedAt: new Date() }
                });
            } else if (existing.isActive) {
                return res.status(400).json({ success: false, error: 'Bu TC Kimlik No ile kayıtlı aktif personel zaten var' });
            } else {
                // Inactive but not blacklisted — let them know
                return res.status(400).json({ success: false, error: 'Bu TC Kimlik No ile kayıtlı (pasif) personel zaten var. Mevcut kaydı aktife alabilirsiniz.' });
            }
        }

        // Check if user email exists (only ACTIVE / non-deleted rows count)
        const existingUser = await prisma.user.findFirst({
            where: {
                tenantId,
                email: data.email,
                deletedAt: null
            }
        });

        if (existingUser) {
            return res.status(400).json({ success: false, error: 'Bu e-posta adresi zaten kullanımda' });
        }

        // Determine Role
        let roleCode = 'TENANT_STAFF'; // Default
        if (['DRIVER', 'ACCOUNTANT', 'OPERATION', 'RESERVATION', 'AIRPORT_STAFF'].includes(data.jobTitle)) {
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
                                roleCode === 'RESERVATION' ? 'Rezervasyon' :
                                    roleCode === 'AIRPORT_STAFF' ? 'Havalimanı Karşılama' : 'Personel',
                    type: roleCode === 'AIRPORT_STAFF' ? 'AIRPORT_STAFF' :
                        roleCode === 'DRIVER' ? 'DRIVER' : 'TENANT_STAFF'
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
                    phone: data.phone || null,
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
                    nationality: data.nationality || 'TUR',
                    licenseType: data.licenseType,
                    licenseNumber: data.licenseNumber,
                    licenseExpiry: data.licenseExpiry ? new Date(data.licenseExpiry) : undefined,
                    srcNumber: data.srcNumber,
                    srcType: data.srcType,
                    psychotechDocument: data.psychotechDocument,
                    psychotechExpiry: data.psychotechExpiry ? new Date(data.psychotechExpiry) : undefined,
                    medicalHistory: data.medicalHistory,
                    bloodGroup: data.bloodGroup,
                    photo: data.photo,
                    assignedAirportZoneId: data.assignedAirportZoneId || null
                }
            });

            return { ...newPersonnel, user: { id: newUser.id, email: newUser.email } };
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
            // Resolve role code from jobTitle (fallback DRIVER for backwards-compat)
            let roleCode = 'DRIVER';
            const jt = data.jobTitle || existing.jobTitle;
            if (['DRIVER', 'ACCOUNTANT', 'OPERATION', 'RESERVATION', 'AIRPORT_STAFF'].includes(jt)) {
                roleCode = jt;
            } else if (jt) {
                roleCode = 'TENANT_STAFF';
            }
            let role = await prisma.role.findFirst({ where: { tenantId, code: roleCode } });
            if (!role) {
                role = await prisma.role.create({
                    data: {
                        tenantId,
                        code: roleCode,
                        name: roleCode === 'DRIVER' ? 'Sürücü' :
                            roleCode === 'ACCOUNTANT' ? 'Muhasebe' :
                                roleCode === 'OPERATION' ? 'Operasyon' :
                                    roleCode === 'RESERVATION' ? 'Rezervasyon' :
                                        roleCode === 'AIRPORT_STAFF' ? 'Havalimanı Karşılama' : 'Personel',
                        type: roleCode === 'AIRPORT_STAFF' ? 'AIRPORT_STAFF' :
                            roleCode === 'DRIVER' ? 'DRIVER' : 'TENANT_STAFF'
                    }
                });
            }

            const hashedPassword = await bcrypt.hash(data.password, 10);
            const emailLc = (data.email || existing.email || '').toLowerCase().trim();
            const fName = data.firstName || existing.firstName || '-';
            const lName = data.lastName || existing.lastName || '-';
            const newUser = await prisma.user.create({
                data: {
                    tenantId,
                    email: emailLc || null,
                    phone: data.phone || existing.phone || null,
                    passwordHash: hashedPassword,
                    firstName: fName,
                    lastName: lName,
                    fullName: `${fName} ${lName}`.trim(),
                    roleId: role.id,
                    emailVerified: true,
                    status: 'ACTIVE',
                }
            });
            linkedUserId = newUser.id;
        }

        // If personnel already has a linked user AND a new password is supplied,
        // reset the user's password (this is how admins recover login for staff).
        if (linkedUserId && data.password) {
            const newHash = await bcrypt.hash(data.password, 10);
            await prisma.user.update({
                where: { id: linkedUserId },
                data: { passwordHash: newHash, status: 'ACTIVE' }
            }).catch(err => console.error('Password reset failed:', err));
        }

        // Normalize email if provided so user/personnel stay consistent
        if (data.email !== undefined && data.email !== null) {
            data.email = String(data.email).toLowerCase().trim();
        }

        // Build update payload - only include fields that are explicitly provided
        const updatePayload = {};
        if (data.firstName !== undefined) updatePayload.firstName = data.firstName;
        if (data.lastName !== undefined) updatePayload.lastName = data.lastName;
        if (data.birthDate !== undefined) updatePayload.birthDate = data.birthDate ? new Date(data.birthDate) : null;
        if (data.birthPlace !== undefined) updatePayload.birthPlace = data.birthPlace;
        if (data.gender !== undefined) updatePayload.gender = data.gender;
        if (data.address !== undefined) updatePayload.address = data.address;
        if (data.phone !== undefined) updatePayload.phone = data.phone;
        if (data.relativePhone !== undefined) updatePayload.relativePhone = data.relativePhone;
        if (data.email !== undefined) updatePayload.email = data.email;
        if (data.startDate !== undefined) updatePayload.startDate = data.startDate ? new Date(data.startDate) : null;
        if (data.endDate !== undefined) updatePayload.endDate = data.endDate ? new Date(data.endDate) : null;
        if (data.jobTitle !== undefined) updatePayload.jobTitle = data.jobTitle;
        if (data.department !== undefined) updatePayload.department = data.department;
        if (data.salary !== undefined) updatePayload.salary = data.salary ? parseFloat(data.salary) : null;
        if (data.isActive !== undefined) updatePayload.isActive = data.isActive;
        if (data.nationality !== undefined) updatePayload.nationality = data.nationality;
        if (data.licenseType !== undefined) updatePayload.licenseType = data.licenseType;
        if (data.licenseNumber !== undefined) updatePayload.licenseNumber = data.licenseNumber;
        if (data.licenseExpiry !== undefined) updatePayload.licenseExpiry = data.licenseExpiry ? new Date(data.licenseExpiry) : null;
        if (data.srcNumber !== undefined) updatePayload.srcNumber = data.srcNumber;
        if (data.srcType !== undefined) updatePayload.srcType = data.srcType;
        if (data.psychotechDocument !== undefined) updatePayload.psychotechDocument = data.psychotechDocument;
        if (data.psychotechExpiry !== undefined) updatePayload.psychotechExpiry = data.psychotechExpiry ? new Date(data.psychotechExpiry) : null;
        if (data.medicalHistory !== undefined) updatePayload.medicalHistory = data.medicalHistory;
        if (data.bloodGroup !== undefined) updatePayload.bloodGroup = data.bloodGroup;
        if (data.photo !== undefined) updatePayload.photo = data.photo;
        if (data.metadata !== undefined) updatePayload.metadata = data.metadata;
        if (data.assignedAirportZoneId !== undefined) {
            updatePayload.assignedAirportZoneId = data.assignedAirportZoneId || null;
        }
        if (linkedUserId && !existing.userId) updatePayload.userId = linkedUserId;

        // Enforce airport assignment for AIRPORT_STAFF
        const newJobTitle = data.jobTitle !== undefined ? data.jobTitle : existing.jobTitle;
        const newAirportId = data.assignedAirportZoneId !== undefined
            ? data.assignedAirportZoneId
            : existing.assignedAirportZoneId;
        if (newJobTitle === 'AIRPORT_STAFF' && !newAirportId) {
            return res.status(400).json({
                success: false,
                error: 'Karşılama personeli için hangi havalimanında çalışacağı seçilmelidir'
            });
        }
        // If role changed away from AIRPORT_STAFF, clear the airport assignment
        if (data.jobTitle !== undefined && data.jobTitle !== 'AIRPORT_STAFF' && existing.assignedAirportZoneId) {
            updatePayload.assignedAirportZoneId = null;
        }

        // When jobTitle changes, also update the linked user's role
        if (data.jobTitle !== undefined && data.jobTitle !== existing.jobTitle && (existing.userId || linkedUserId)) {
            const targetUserId = existing.userId || linkedUserId;
            let roleCode = 'TENANT_STAFF';
            if (['DRIVER', 'ACCOUNTANT', 'OPERATION', 'RESERVATION', 'AIRPORT_STAFF'].includes(data.jobTitle)) {
                roleCode = data.jobTitle;
            }
            let role = await prisma.role.findFirst({
                where: { tenantId, code: roleCode }
            });
            if (!role) {
                role = await prisma.role.create({
                    data: {
                        tenantId,
                        code: roleCode,
                        name: roleCode === 'DRIVER' ? 'Sürücü' :
                            roleCode === 'ACCOUNTANT' ? 'Muhasebe' :
                                roleCode === 'OPERATION' ? 'Operasyon' :
                                    roleCode === 'RESERVATION' ? 'Rezervasyon' :
                                        roleCode === 'AIRPORT_STAFF' ? 'Havalimanı Karşılama' : 'Personel',
                        type: roleCode === 'AIRPORT_STAFF' ? 'AIRPORT_STAFF' :
                            roleCode === 'DRIVER' ? 'DRIVER' : 'TENANT_STAFF'
                    }
                });
            }
            await prisma.user.update({
                where: { id: targetUserId },
                data: { roleId: role.id }
            }).catch(err => console.error('Role update failed:', err));
        }

        // When terminating, also deactivate the linked user account
        if (data.isActive === false && existing.userId) {
            await prisma.user.update({
                where: { id: existing.userId },
                data: { status: 'INACTIVE' }
            }).catch(() => {}); // Don't fail if user update fails
        }
        // When reactivating, also activate the linked user account
        if (data.isActive === true && existing.userId && !existing.isActive) {
            await prisma.user.update({
                where: { id: existing.userId },
                data: { status: 'ACTIVE' }
            }).catch(() => {});
        }

        // Mirror profile fields (name / email / phone / avatar) to the linked
        // user so /admin/users and /admin/personnel never drift apart.
        const targetUserId = existing.userId || linkedUserId;
        if (targetUserId) {
            const userPatch = {};
            if (data.firstName !== undefined) userPatch.firstName = data.firstName;
            if (data.lastName !== undefined) userPatch.lastName = data.lastName;
            if (data.firstName !== undefined || data.lastName !== undefined) {
                const fn = data.firstName !== undefined ? data.firstName : existing.firstName;
                const ln = data.lastName !== undefined ? data.lastName : existing.lastName;
                userPatch.fullName = `${fn || ''} ${ln || ''}`.trim() || 'Personel';
            }
            if (data.email !== undefined && data.email) userPatch.email = data.email;
            if (data.phone !== undefined) userPatch.phone = data.phone || null;
            if (data.photo !== undefined) userPatch.avatar = data.photo;
            if (Object.keys(userPatch).length > 0) {
                await prisma.user.update({
                    where: { id: targetUserId },
                    data: userPatch
                }).catch(err => console.error('User mirror update failed:', err));
            }
        }

        const personnel = await prisma.personnel.update({
            where: { id },
            data: updatePayload
        });

        res.json({ success: true, data: personnel });
    } catch (error) {
        console.error('Update personnel error:', error);
        res.status(500).json({ success: false, error: 'Personel güncellenemedi' });
    }
});

// Delete personnel (Soft delete) — also cascades to the linked User so the
// row disappears from /admin/users and the email becomes reusable.
router.delete('/:id', authMiddleware, async (req, res) => {
    try {
        const { tenantId } = req.user;
        const { id } = req.params;

        const existing = await prisma.personnel.findFirst({
            where: { id, tenantId, deletedAt: null }
        });
        if (!existing) {
            return res.status(404).json({ success: false, error: 'Personel bulunamadı' });
        }

        const now = new Date();
        await prisma.$transaction(async (tx) => {
            await tx.personnel.update({
                where: { id },
                data: { deletedAt: now, isActive: false }
            });

            if (existing.userId) {
                // Free up the email (rename to deleted-<ts>-<email>) so the same
                // address can be re-used for a brand new personnel record.
                const userRow = await tx.user.findUnique({ where: { id: existing.userId } });
                if (userRow) {
                    const freedEmail = userRow.email && !userRow.email.startsWith('deleted-')
                        ? `deleted-${now.getTime()}-${userRow.email}`
                        : userRow.email;
                    await tx.user.update({
                        where: { id: existing.userId },
                        data: {
                            status: 'INACTIVE',
                            deletedAt: now,
                            email: freedEmail,
                        }
                    });
                }
            }
        });

        res.json({ success: true, message: 'Personel ve bağlı kullanıcı silindi' });
    } catch (error) {
        console.error('Delete personnel error:', error);
        res.status(500).json({ success: false, error: 'Personel silinemedi: ' + error.message });
    }
});

// One-off cleanup: deactivate user rows that point at a soft-deleted
// personnel record OR that are flagged as personnel but have no personnel
// record at all. Useful to fix orphan users created before this patch.
router.post('/sync-users', authMiddleware, async (req, res) => {
    try {
        const { tenantId } = req.user;

        // 1. Users linked to a soft-deleted personnel → soft-delete user too
        const orphanByDeletedPersonnel = await prisma.user.findMany({
            where: {
                tenantId,
                deletedAt: null,
                personnel: { is: { deletedAt: { not: null } } }
            },
            select: { id: true, email: true }
        });
        const now = new Date();
        for (const u of orphanByDeletedPersonnel) {
            const freedEmail = u.email && !u.email.startsWith('deleted-')
                ? `deleted-${now.getTime()}-${u.email}`
                : u.email;
            await prisma.user.update({
                where: { id: u.id },
                data: { status: 'INACTIVE', deletedAt: now, email: freedEmail }
            });
        }

        res.json({
            success: true,
            cleaned: orphanByDeletedPersonnel.length,
            details: orphanByDeletedPersonnel
        });
    } catch (error) {
        console.error('sync-users error:', error);
        res.status(500).json({ success: false, error: 'Senkronizasyon başarısız: ' + error.message });
    }
});

module.exports = router;
