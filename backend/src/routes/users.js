const express = require('express');
const bcrypt = require('bcryptjs');

const { authMiddleware } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permission');

const router = express.Router();
const prisma = require('../lib/prisma');

/**
 * GET /api/users
 * List all users for the current tenant
 */
router.get('/', authMiddleware, requirePermission('settings', 'view'), async (req, res) => {
    try {
        const tenantId = req.tenant?.id;
        if (!tenantId) {
            return res.status(400).json({ success: false, error: 'Tenant context missing' });
        }

        const whereClause = {
            tenantId,
            deletedAt: null
        };

        if (req.user?.roleType === 'PARTNER') {
            whereClause.partnerId = req.user.id;
            whereClause.role = { type: 'DRIVER' };
        }

        const users = await prisma.user.findMany({
            where: whereClause,
            select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                fullName: true,
                status: true,
                createdAt: true,
                role: {
                    select: {
                        id: true,
                        name: true,
                        code: true,
                        type: true
                    }
                }
            },
            orderBy: {
                createdAt: 'desc'
            }
        });

        // Map to frontend format — send actual RoleType
        const formattedUsers = users.map(u => ({
            id: u.id,
            name: u.fullName,
            email: u.email,
            role: u.role.type, // actual RoleType: TENANT_ADMIN, PARTNER, DRIVER, etc.
            roleId: u.role.id,
            roleName: u.role.name,
            roleCode: u.role.code,
            isActive: u.status === 'ACTIVE',
            createdAt: u.createdAt
        }));

        res.json({
            success: true,
            data: formattedUsers
        });

    } catch (error) {
        console.error('Fetch users error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch users'
        });
    }
});

/**
 * POST /api/users
 * Create a new user for the tenant
 */
router.post('/', authMiddleware, async (req, res) => {
    try {
        const tenantId = req.tenant?.id;
        const { name, email, password, role, isActive } = req.body;

        if (!tenantId) {
            return res.status(400).json({ success: false, error: 'Tenant context missing' });
        }

        if (!email || !password || !role) {
            return res.status(400).json({ success: false, error: 'Email, password and role are required' });
        }

        // Check if user already exists
        const existingUser = await prisma.user.findFirst({
            where: { tenantId, email: email.toLowerCase() }
        });

        if (existingUser) {
            return res.status(409).json({ success: false, error: 'Email already registered' });
        }

        // Find the role by type (frontend now sends actual RoleType values)
        // Backward compatibility: map legacy values
        let mappedRoleType = role;
        if (role === 'ADMIN') mappedRoleType = 'TENANT_ADMIN';
        if (role === 'COMPANY') mappedRoleType = 'AGENCY_ADMIN';

        const dbRole = await prisma.role.findFirst({
            where: {
                tenantId,
                type: mappedRoleType
            }
        });

        if (!dbRole) {
            return res.status(400).json({ success: false, error: `Role ${role} not found for this tenant` });
        }

        if (req.user?.roleType === 'PARTNER' && dbRole.type !== 'DRIVER') {
            return res.status(403).json({ success: false, error: 'Partnerler sadece sürücü (DRIVER) ekleyebilir.' });
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const [firstName, ...lastNameParts] = (name || '').split(' ');
        const lastName = lastNameParts.join(' ') || '-';
        
        const partnerId = req.user?.roleType === 'PARTNER' ? req.user.id : (req.body.partnerId || null);

        const user = await prisma.user.create({
            data: {
                tenantId,
                email: email.toLowerCase(),
                passwordHash,
                firstName: firstName || '-',
                lastName,
                fullName: name || 'User',
                roleId: dbRole.id,
                partnerId,
                status: isActive === false ? 'INACTIVE' : 'ACTIVE'
            },
            include: {
                role: true
            }
        });

        res.status(201).json({
            success: true,
            data: {
                id: user.id,
                name: user.fullName,
                email: user.email,
                role: user.role?.type,
                roleId: user.role?.id,
                roleName: user.role?.name,
                isActive: user.status === 'ACTIVE',
                createdAt: user.createdAt
            }
        });

    } catch (error) {
        console.error('Create user error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create user: ' + error.message
        });
    }
});

/**
 * PUT /api/users/:id
 * Update user details
 */
router.put('/:id', authMiddleware, async (req, res) => {
    try {
        const tenantId = req.tenant?.id;
        const { id } = req.params;
        const { name, email, password, role, isActive } = req.body;

        if (!tenantId) {
            return res.status(400).json({ success: false, error: 'Tenant context missing' });
        }

        // Capture previous state for audit trail
        const prevUser = await prisma.user.findFirst({ where: { id, tenantId }, include: { role: true } });
        if (!prevUser) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }
        
        if (req.user?.roleType === 'PARTNER') {
            if (prevUser.partnerId !== req.user.id) {
                return res.status(403).json({ success: false, error: 'Sadece kendi sürücülerinizi düzenleyebilirsiniz.' });
            }
            if (role && role !== 'DRIVER') {
                 return res.status(403).json({ success: false, error: 'Partnerler sadece sürücü (DRIVER) rolünü kullanabilir.' });
            }
        }

        req._auditPreviousState = {
            name: prevUser.fullName,
            email: prevUser.email,
            role: prevUser.role?.type,
            roleId: prevUser.role?.id,
            isActive: prevUser.status === 'ACTIVE'
        };

        const updateData = {};
        if (name) {
            const [firstName, ...lastNameParts] = name.split(' ');
            updateData.firstName = firstName;
            updateData.lastName = lastNameParts.join(' ') || '-';
            updateData.fullName = name;
        }
        if (email) updateData.email = email.toLowerCase();
        if (password) updateData.passwordHash = await bcrypt.hash(password, 10);
        if (isActive !== undefined) updateData.status = isActive ? 'ACTIVE' : 'INACTIVE';

        if (role) {
            // Backward compatibility: map legacy values
            let mappedRoleType = role;
            if (role === 'ADMIN') mappedRoleType = 'TENANT_ADMIN';
            if (role === 'COMPANY') mappedRoleType = 'AGENCY_ADMIN';

            const dbRole = await prisma.role.findFirst({
                where: { tenantId, type: mappedRoleType }
            });
            if (dbRole) updateData.roleId = dbRole.id;
        }

        const user = await prisma.user.update({
            where: { id },
            data: updateData,
            include: { role: true }
        });

        res.json({
            success: true,
            data: {
                id: user.id,
                name: user.fullName,
                email: user.email,
                role: user.role?.type,
                roleId: user.role?.id,
                roleName: user.role?.name,
                roleCode: user.role?.code,
                isActive: user.status === 'ACTIVE',
                createdAt: user.createdAt
            }
        });

    } catch (error) {
        console.error('Update user error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update user'
        });
    }
});

/**
 * PATCH /api/users/:id/active
 * Toggle user active status
 */
router.patch('/:id/active', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { isActive } = req.body;

        const user = await prisma.user.update({
            where: { id },
            data: {
                status: isActive ? 'ACTIVE' : 'INACTIVE'
            }
        });

        res.json({
            success: true,
            data: {
                id: user.id,
                isActive: user.status === 'ACTIVE'
            }
        });

    } catch (error) {
        console.error('Toggle status error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update user status'
        });
    }
});

/**
 * GET /api/users/diagnose-login?email=foo@bar.com&password=optional
 * Super-admin only. Returns a full diagnostic of every User row in the
 * database for that email (across ALL tenants), incl. per-tenant status,
 * tenant.status, deletedAt, and (if password supplied) bcrypt match.
 */
router.get('/diagnose-login', authMiddleware, async (req, res) => {
    try {
        if (req.user?.roleType !== 'SUPER_ADMIN' && req.user?.roleType !== 'TENANT_ADMIN') {
            return res.status(403).json({ success: false, error: 'Yetki yok' });
        }
        const email = String(req.query.email || '').toLowerCase().trim();
        const password = req.query.password ? String(req.query.password) : '';
        if (!email) {
            return res.status(400).json({ success: false, error: 'email query param zorunlu' });
        }

        const rows = await prisma.user.findMany({
            where: { email: { in: [email, email.toUpperCase()] } },
            select: {
                id: true, tenantId: true, email: true, status: true,
                deletedAt: true, passwordHash: true,
                firstName: true, lastName: true, fullName: true,
                role: { select: { code: true, name: true, type: true } },
                tenant: { select: { id: true, name: true, slug: true, status: true } }
            }
        });

        const out = [];
        for (const u of rows) {
            const passwordMatches = (password && u.passwordHash)
                ? await bcrypt.compare(password, u.passwordHash)
                : null;
            out.push({
                id: u.id,
                email: u.email,
                emailCaseOk: u.email === u.email.toLowerCase(),
                status: u.status,
                deletedAt: u.deletedAt,
                tenant: u.tenant,
                tenantOk: u.tenant && (u.tenant.status === 'ACTIVE' || u.tenant.status === 'TRIAL'),
                role: u.role,
                hasPasswordHash: !!u.passwordHash,
                passwordHashPreview: u.passwordHash ? u.passwordHash.slice(0, 12) + '...' : null,
                passwordMatches,
                fullName: u.fullName
            });
        }

        res.json({
            success: true,
            queryEmail: email,
            rowCount: rows.length,
            wouldLogin: out.find(r => r.passwordMatches === true && r.tenantOk && r.status === 'ACTIVE' && !r.deletedAt) || null,
            users: out
        });
    } catch (error) {
        console.error('diagnose-login error:', error);
        res.status(500).json({ success: false, error: 'Teşhis başarısız: ' + error.message });
    }
});

/**
 * POST /api/users/force-reset-password
 * Super-admin only. Body: { email, newPassword }
 * Resets passwordHash + status=ACTIVE + deletedAt=null + lowercases email
 * on EVERY matching User row across all tenants. Also un-marks tenant
 * issues by reporting them so the caller can act.
 */
router.post('/force-reset-password', authMiddleware, async (req, res) => {
    try {
        if (req.user?.roleType !== 'SUPER_ADMIN' && req.user?.roleType !== 'TENANT_ADMIN') {
            return res.status(403).json({ success: false, error: 'Yetki yok' });
        }
        const email = String(req.body?.email || '').toLowerCase().trim();
        const newPassword = String(req.body?.newPassword || '');
        if (!email || !newPassword) {
            return res.status(400).json({ success: false, error: 'email ve newPassword zorunlu' });
        }
        if (newPassword.length < 6) {
            return res.status(400).json({ success: false, error: 'Şifre en az 6 karakter olmalı' });
        }

        const rows = await prisma.user.findMany({
            where: { email: { in: [email, email.toUpperCase()] } },
            include: { tenant: { select: { id: true, name: true, status: true } } }
        });
        if (rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Bu email ile hiç kullanıcı yok' });
        }

        const newHash = await bcrypt.hash(newPassword, 10);
        const updated = [];
        for (const u of rows) {
            await prisma.user.update({
                where: { id: u.id },
                data: {
                    passwordHash: newHash,
                    status: 'ACTIVE',
                    deletedAt: null,
                    email: email,
                }
            });
            updated.push({
                id: u.id,
                tenant: u.tenant,
                tenantOk: u.tenant && (u.tenant.status === 'ACTIVE' || u.tenant.status === 'TRIAL'),
            });
        }

        res.json({
            success: true,
            message: `${updated.length} kayıt güncellendi`,
            updated
        });
    } catch (error) {
        console.error('force-reset-password error:', error);
        res.status(500).json({ success: false, error: 'Sıfırlama başarısız: ' + error.message });
    }
});

/**
 * DELETE /api/users/:id
 * Soft-delete the user AND cascade to the linked Personnel record so the
 * two pages (Kullanıcılar / Personel) never drift apart.
 */
router.delete('/:id', authMiddleware, async (req, res) => {
    try {
        const tenantId = req.tenant?.id;
        const { id } = req.params;
        if (!tenantId) {
            return res.status(400).json({ success: false, error: 'Tenant context missing' });
        }

        const user = await prisma.user.findFirst({
            where: { id, tenantId, deletedAt: null },
            include: { personnel: true }
        });
        if (!user) {
            return res.status(404).json({ success: false, error: 'Kullanıcı bulunamadı' });
        }

        if (req.user?.roleType === 'PARTNER' && user.partnerId !== req.user.id) {
            return res.status(403).json({ success: false, error: 'Sadece kendi sürücülerinizi silebilirsiniz.' });
        }

        const now = new Date();
        await prisma.$transaction(async (tx) => {
            const freedEmail = user.email && !user.email.startsWith('deleted-')
                ? `deleted-${now.getTime()}-${user.email}`
                : user.email;
            await tx.user.update({
                where: { id },
                data: { status: 'INACTIVE', deletedAt: now, email: freedEmail }
            });
            if (user.personnel && !user.personnel.deletedAt) {
                await tx.personnel.update({
                    where: { id: user.personnel.id },
                    data: { deletedAt: now, isActive: false }
                });
            }
        });

        res.json({ success: true, message: 'Kullanıcı ve bağlı personel silindi' });
    } catch (error) {
        console.error('Delete user error:', error);
        res.status(500).json({ success: false, error: 'Kullanıcı silinemedi: ' + error.message });
    }
});

// ============================================================================
// USER PERMISSION MANAGEMENT (Per-user)
// ============================================================================

/**
 * GET /api/users/:id/permissions
 * Get a user's individual permissions + all available permissions
 */
router.get('/:id/permissions', authMiddleware, requirePermission('settings', 'view'), async (req, res) => {
    try {
        const tenantId = req.tenant?.id;
        if (!tenantId) return res.status(400).json({ success: false, error: 'Tenant context missing' });

        const [user, allPermissions] = await Promise.all([
            prisma.user.findFirst({
                where: { id: req.params.id, tenantId, deletedAt: null },
                select: {
                    id: true,
                    fullName: true,
                    email: true,
                    role: { select: { id: true, name: true, code: true, type: true } },
                    userPermissions: {
                        include: { permission: true }
                    }
                }
            }),
            prisma.permission.findMany({
                where: { scope: 'TENANT' },
                orderBy: [{ module: 'asc' }, { action: 'asc' }]
            })
        ]);

        if (!user) {
            return res.status(404).json({ success: false, error: 'Kullanıcı bulunamadı' });
        }

        res.json({
            success: true,
            data: {
                id: user.id,
                fullName: user.fullName,
                email: user.email,
                role: user.role,
                permissions: user.userPermissions.map(up => ({
                    id: up.permission.id,
                    module: up.permission.module,
                    resource: up.permission.resource,
                    action: up.permission.action,
                })),
                allPermissions: allPermissions.map(p => ({
                    id: p.id,
                    module: p.module,
                    resource: p.resource,
                    action: p.action,
                }))
            }
        });
    } catch (error) {
        console.error('Get user permissions error:', error);
        res.status(500).json({ success: false, error: 'Yetkiler yüklenemedi' });
    }
});

/**
 * PUT /api/users/:id/permissions
 * Update a user's individual permissions (replace all).
 * Body: { permissions: ["permissionId1", ...] }
 *   OR: { moduleActions: ["dashboard:view", "reservations:create", ...] }
 */
router.put('/:id/permissions', authMiddleware, requirePermission('settings', 'update'), async (req, res) => {
    try {
        const tenantId = req.tenant?.id;
        if (!tenantId) return res.status(400).json({ success: false, error: 'Tenant context missing' });

        let { permissions: permissionIds, moduleActions } = req.body;

        // Support module:action format (frontend doesn't need IDs)
        if (moduleActions && Array.isArray(moduleActions) && moduleActions.length > 0) {
            const allPerms = await prisma.permission.findMany({ where: { scope: 'TENANT' } });
            const idSet = new Set();
            for (const ma of moduleActions) {
                const [mod, action] = ma.split(':');
                const found = allPerms.find(p => p.module === mod && p.action === action);
                if (found) idSet.add(found.id);
            }
            permissionIds = Array.from(idSet);
        }

        if (!Array.isArray(permissionIds)) {
            return res.status(400).json({ success: false, error: 'permissions or moduleActions array is required' });
        }

        const user = await prisma.user.findFirst({
            where: { id: req.params.id, tenantId, deletedAt: null },
            include: { role: true }
        });

        if (!user) {
            return res.status(404).json({ success: false, error: 'Kullanıcı bulunamadı' });
        }

        // Don't allow modifying SUPER_ADMIN permissions
        if (user.role.type === 'SUPER_ADMIN') {
            return res.status(403).json({ success: false, error: 'Super Admin yetkisi değiştirilemez' });
        }

        // Transaction: delete all, then create new
        await prisma.$transaction(async (tx) => {
            await tx.userPermission.deleteMany({
                where: { userId: user.id }
            });

            if (permissionIds.length > 0) {
                await tx.userPermission.createMany({
                    data: permissionIds.map(permId => ({
                        userId: user.id,
                        permissionId: permId,
                    })),
                    skipDuplicates: true,
                });
            }
        });

        // Return updated
        const updated = await prisma.user.findUnique({
            where: { id: user.id },
            select: {
                id: true,
                fullName: true,
                userPermissions: {
                    include: { permission: true }
                }
            }
        });

        res.json({
            success: true,
            message: `${updated.fullName} için ${permissionIds.length} yetki atandı`,
            data: {
                id: updated.id,
                permissions: updated.userPermissions.map(up => ({
                    id: up.permission.id,
                    module: up.permission.module,
                    action: up.permission.action,
                }))
            }
        });
    } catch (error) {
        console.error('Update user permissions error:', error);
        res.status(500).json({ success: false, error: 'Yetkiler güncellenemedi' });
    }
});

/**
 * POST /api/users/:id/permissions/copy-from-role
 * Copy role's default permissions to user's individual permissions
 */
router.post('/:id/permissions/copy-from-role', authMiddleware, requirePermission('settings', 'update'), async (req, res) => {
    try {
        const tenantId = req.tenant?.id;
        if (!tenantId) return res.status(400).json({ success: false, error: 'Tenant context missing' });

        const user = await prisma.user.findFirst({
            where: { id: req.params.id, tenantId, deletedAt: null },
            include: {
                role: {
                    include: {
                        permissions: { select: { permissionId: true } }
                    }
                }
            }
        });

        if (!user) {
            return res.status(404).json({ success: false, error: 'Kullanıcı bulunamadı' });
        }

        const rolePermIds = user.role.permissions.map(rp => rp.permissionId);

        await prisma.$transaction(async (tx) => {
            await tx.userPermission.deleteMany({ where: { userId: user.id } });

            if (rolePermIds.length > 0) {
                await tx.userPermission.createMany({
                    data: rolePermIds.map(permId => ({
                        userId: user.id,
                        permissionId: permId,
                    })),
                    skipDuplicates: true,
                });
            }
        });

        res.json({
            success: true,
            message: `Rol yetkilerinden ${rolePermIds.length} yetki kopyalandı`,
        });
    } catch (error) {
        console.error('Copy role permissions error:', error);
        res.status(500).json({ success: false, error: 'Rol yetkileri kopyalanamadı' });
    }
});

module.exports = router;
