/**
 * Role & Permission Management API
 * 
 * Endpoints:
 * GET    /api/roles                  - List all roles for tenant
 * GET    /api/roles/permissions      - List all available permissions (module definitions)
 * GET    /api/roles/:id              - Get role detail with permissions
 * PUT    /api/roles/:id/permissions  - Update role permissions (bulk assign)
 * POST   /api/roles                  - Create a new custom role
 * PUT    /api/roles/:id              - Update role info
 * DELETE /api/roles/:id              - Delete a custom role
 */

const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const { authMiddleware } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permission');
const { requireTenantId } = require('../utils/tenantScope');

// ─── Module definitions (shared with seed script) ───────────────────────────
const MODULE_DEFINITIONS = [
    { module: 'dashboard', label: 'Panel', icon: 'DashboardOutlined' },
    { module: 'reservations', label: 'Rezervasyonlar', icon: 'CalendarOutlined' },
    { module: 'operations', label: 'Operasyon Yönetimi', icon: 'AppstoreOutlined' },
    { module: 'accounting', label: 'Muhasebe', icon: 'BankOutlined' },
    { module: 'partners', label: 'Partner / Acente', icon: 'TeamOutlined' },
    { module: 'banks', label: 'Banka Yönetimi', icon: 'CreditCardOutlined' },
    { module: 'vehicles', label: 'Araç & Fiyat Tanımları', icon: 'CarOutlined' },
    { module: 'vehicle-tracking', label: 'Araç Takip', icon: 'BarChartOutlined' },
    { module: 'personnel', label: 'Personel Tanımları', icon: 'UserOutlined' },
    { module: 'campaigns', label: 'Kampanyalar & Sadakat', icon: 'GiftOutlined' },
    { module: 'reports', label: 'Raporlar', icon: 'BarChartOutlined' },
    { module: 'settings', label: 'Ayarlar & Kullanıcılar', icon: 'SettingOutlined' },
    { module: 'live-support', label: 'Canlı Destek', icon: 'MessageOutlined' },
];

const ACTIONS = [
    { action: 'view', label: 'Görüntüleme' },
    { action: 'create', label: 'Ekleme' },
    { action: 'update', label: 'Düzenleme' },
    { action: 'delete', label: 'Silme' },
];

/**
 * GET /api/roles/permissions
 * Returns available modules and their actions (for the permission management UI)
 */
router.get('/permissions', authMiddleware, requirePermission('settings', 'view'), async (req, res) => {
    try {
        const tenantId = requireTenantId(req, res);
        if (!tenantId) return;

        // Get all permissions from DB
        const dbPermissions = await prisma.permission.findMany({
            orderBy: [{ module: 'asc' }, { action: 'asc' }]
        });

        res.json({
            success: true,
            data: {
                modules: MODULE_DEFINITIONS,
                actions: ACTIONS,
                permissions: dbPermissions,
            }
        });
    } catch (error) {
        console.error('Get permissions error:', error);
        res.status(500).json({ success: false, error: 'Failed to load permissions' });
    }
});

/**
 * GET /api/roles
 * List all roles for the tenant with permission count
 */
router.get('/', authMiddleware, requirePermission('settings', 'view'), async (req, res) => {
    try {
        const tenantId = requireTenantId(req, res);
        if (!tenantId) return;

        const [roles, allPermissions] = await Promise.all([
            prisma.role.findMany({
                where: { tenantId },
                include: {
                    permissions: {
                        include: { permission: true }
                    },
                    _count: { select: { users: true } }
                },
                orderBy: { createdAt: 'asc' }
            }),
            prisma.permission.findMany({
                where: { scope: 'TENANT' },
                orderBy: [{ module: 'asc' }, { action: 'asc' }]
            })
        ]);

        const formatted = roles.map(role => ({
            id: role.id,
            name: role.name,
            code: role.code,
            type: role.type,
            description: role.description,
            isSystem: role.isSystem,
            isActive: role.isActive,
            userCount: role._count.users,
            permissions: role.permissions.map(rp => ({
                id: rp.permission.id,
                module: rp.permission.module,
                resource: rp.permission.resource,
                action: rp.permission.action,
                scope: rp.permission.scope,
            })),
            createdAt: role.createdAt,
        }));

        res.json({
            success: true,
            data: formatted,
            allPermissions: allPermissions.map(p => ({
                id: p.id,
                module: p.module,
                resource: p.resource,
                action: p.action,
            }))
        });
    } catch (error) {
        console.error('List roles error:', error);
        res.status(500).json({ success: false, error: 'Failed to load roles' });
    }
});

/**
 * GET /api/roles/:id
 * Get single role with full permission details
 */
router.get('/:id', authMiddleware, requirePermission('settings', 'view'), async (req, res) => {
    try {
        const tenantId = requireTenantId(req, res);
        if (!tenantId) return;

        const role = await prisma.role.findFirst({
            where: { id: req.params.id, tenantId },
            include: {
                permissions: { include: { permission: true } },
                _count: { select: { users: true } }
            }
        });

        if (!role) {
            return res.status(404).json({ success: false, error: 'Rol bulunamadı' });
        }

        res.json({
            success: true,
            data: {
                id: role.id,
                name: role.name,
                code: role.code,
                type: role.type,
                description: role.description,
                isSystem: role.isSystem,
                isActive: role.isActive,
                userCount: role._count.users,
                permissions: role.permissions.map(rp => ({
                    id: rp.permission.id,
                    module: rp.permission.module,
                    resource: rp.permission.resource,
                    action: rp.permission.action,
                })),
            }
        });
    } catch (error) {
        console.error('Get role error:', error);
        res.status(500).json({ success: false, error: 'Failed to load role' });
    }
});

/**
 * PUT /api/roles/:id/permissions
 * Bulk update role permissions.
 * Body: { permissions: ["permissionId1", ...] }
 *   OR: { moduleActions: ["dashboard:view", "reservations:create", ...] }
 */
router.put('/:id/permissions', authMiddleware, requirePermission('settings', 'update'), async (req, res) => {
    try {
        const tenantId = requireTenantId(req, res);
        if (!tenantId) return;

        let { permissions: permissionIds, moduleActions } = req.body;

        // Support module:action format
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

        const role = await prisma.role.findFirst({
            where: { id: req.params.id, tenantId }
        });

        if (!role) {
            return res.status(404).json({ success: false, error: 'Rol bulunamadı' });
        }

        // Don't allow modifying SUPER_ADMIN or TENANT_ADMIN permissions
        if (role.type === 'SUPER_ADMIN' || role.type === 'TENANT_ADMIN') {
            return res.status(403).json({ success: false, error: 'Bu rolün yetkileri değiştirilemez (tam yetkili)' });
        }

        // Transaction: delete all current permissions, then add new ones
        await prisma.$transaction(async (tx) => {
            // Remove all existing permissions
            await tx.rolePermission.deleteMany({
                where: { roleId: role.id }
            });

            // Add new permissions
            if (permissionIds.length > 0) {
                await tx.rolePermission.createMany({
                    data: permissionIds.map(permId => ({
                        roleId: role.id,
                        permissionId: permId,
                    })),
                    skipDuplicates: true,
                });
            }
        });

        // Return updated role
        const updated = await prisma.role.findFirst({
            where: { id: role.id },
            include: {
                permissions: { include: { permission: true } }
            }
        });

        res.json({
            success: true,
            message: `${permissionIds.length} yetki atandı`,
            data: {
                id: updated.id,
                name: updated.name,
                permissions: updated.permissions.map(rp => ({
                    id: rp.permission.id,
                    module: rp.permission.module,
                    action: rp.permission.action,
                }))
            }
        });
    } catch (error) {
        console.error('Update role permissions error:', error);
        res.status(500).json({ success: false, error: 'Failed to update permissions' });
    }
});

/**
 * POST /api/roles
 * Create a new custom role
 * Body: { name, code, type, description }
 */
router.post('/', authMiddleware, requirePermission('settings', 'create'), async (req, res) => {
    try {
        const tenantId = requireTenantId(req, res);
        if (!tenantId) return;

        const { name, code, type, description } = req.body;

        if (!name || !code || !type) {
            return res.status(400).json({ success: false, error: 'name, code, type zorunludur' });
        }

        // Check for duplicate code in tenant
        const existing = await prisma.role.findFirst({
            where: { tenantId, code: code.toUpperCase() }
        });

        if (existing) {
            return res.status(409).json({ success: false, error: 'Bu kod zaten kullanılıyor' });
        }

        const role = await prisma.role.create({
            data: {
                tenantId,
                name,
                code: code.toUpperCase(),
                type,
                description: description || null,
                isSystem: false,
            }
        });

        res.status(201).json({ success: true, data: role });
    } catch (error) {
        console.error('Create role error:', error);
        res.status(500).json({ success: false, error: 'Failed to create role' });
    }
});

/**
 * PUT /api/roles/:id
 * Update role info (name, description)
 */
router.put('/:id', authMiddleware, requirePermission('settings', 'update'), async (req, res) => {
    try {
        const tenantId = requireTenantId(req, res);
        if (!tenantId) return;

        const role = await prisma.role.findFirst({
            where: { id: req.params.id, tenantId }
        });

        if (!role) {
            return res.status(404).json({ success: false, error: 'Rol bulunamadı' });
        }

        if (role.isSystem) {
            return res.status(403).json({ success: false, error: 'Sistem rolü düzenlenemez' });
        }

        const { name, description, isActive } = req.body;

        const updated = await prisma.role.update({
            where: { id: role.id },
            data: {
                ...(name && { name }),
                ...(description !== undefined && { description }),
                ...(isActive !== undefined && { isActive }),
            }
        });

        res.json({ success: true, data: updated });
    } catch (error) {
        console.error('Update role error:', error);
        res.status(500).json({ success: false, error: 'Failed to update role' });
    }
});

/**
 * DELETE /api/roles/:id
 * Delete a custom role (only if no users assigned)
 */
router.delete('/:id', authMiddleware, requirePermission('settings', 'delete'), async (req, res) => {
    try {
        const tenantId = requireTenantId(req, res);
        if (!tenantId) return;

        const role = await prisma.role.findFirst({
            where: { id: req.params.id, tenantId },
            include: { _count: { select: { users: true } } }
        });

        if (!role) {
            return res.status(404).json({ success: false, error: 'Rol bulunamadı' });
        }

        if (role.isSystem) {
            return res.status(403).json({ success: false, error: 'Sistem rolü silinemez' });
        }

        if (role._count.users > 0) {
            return res.status(409).json({
                success: false,
                error: `Bu role ${role._count.users} kullanıcı atanmış. Önce kullanıcıları başka role taşıyın.`
            });
        }

        await prisma.role.delete({ where: { id: role.id } });

        res.json({ success: true, message: 'Rol silindi' });
    } catch (error) {
        console.error('Delete role error:', error);
        res.status(500).json({ success: false, error: 'Failed to delete role' });
    }
});

module.exports = router;
