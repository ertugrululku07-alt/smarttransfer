/**
 * Permission Seed Script
 * Creates all module permissions and assigns them to default roles.
 * 
 * Usage: node prisma/seed-permissions.js
 * 
 * This is idempotent — safe to run multiple times.
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// ─── Module Definitions ─────────────────────────────────────────────────────
const MODULES = [
    { module: 'dashboard', resource: 'dashboard', label: 'Panel' },
    { module: 'reservations', resource: 'booking', label: 'Rezervasyonlar' },
    { module: 'operations', resource: 'operation', label: 'Operasyon Yönetimi' },
    { module: 'accounting', resource: 'accounting', label: 'Muhasebe' },
    { module: 'partners', resource: 'agency', label: 'Partner / Acente' },
    { module: 'banks', resource: 'bank', label: 'Banka Yönetimi' },
    { module: 'vehicles', resource: 'vehicle', label: 'Araç & Fiyat Tanımları' },
    { module: 'vehicle-tracking', resource: 'vehicle-tracking', label: 'Araç Takip' },
    { module: 'personnel', resource: 'personnel', label: 'Personel Tanımları' },
    { module: 'campaigns', resource: 'campaign', label: 'Kampanyalar & Sadakat' },
    { module: 'reports', resource: 'report', label: 'Raporlar' },
    { module: 'settings', resource: 'settings', label: 'Ayarlar & Kullanıcılar' },
    { module: 'live-support', resource: 'support', label: 'Canlı Destek' },
];

const ACTIONS = ['view', 'create', 'update', 'delete'];

// ─── Default Role Permission Mapping ────────────────────────────────────────
const ROLE_PERMISSIONS = {
    SUPER_ADMIN: '*', // All permissions
    TENANT_ADMIN: '*', // All permissions
    TENANT_MANAGER: [
        'dashboard:view',
        'reservations:view', 'reservations:create', 'reservations:update',
        'operations:view', 'operations:create', 'operations:update', 'operations:delete',
        'partners:view', 'partners:create', 'partners:update',
        'vehicles:view', 'vehicles:create', 'vehicles:update',
        'vehicle-tracking:view', 'vehicle-tracking:create', 'vehicle-tracking:update',
        'personnel:view', 'personnel:create', 'personnel:update',
        'campaigns:view', 'campaigns:create', 'campaigns:update',
        'reports:view',
        'live-support:view', 'live-support:create', 'live-support:update',
    ],
    TENANT_STAFF: [
        'dashboard:view',
        'reservations:view', 'reservations:create', 'reservations:update',
        'operations:view',
        'live-support:view', 'live-support:create',
    ],
    DRIVER: [], // No admin panel access
    PARTNER: [], // No admin panel access (has own panel)
    AGENCY_ADMIN: [], // No admin panel access (has own panel)
    AGENCY_STAFF: [], // No admin panel access
};

async function seedPermissions() {
    console.log('🔑 Seeding permissions...\n');

    // 0. Clean up stale permissions (non-TENANT scope or orphan records)
    const validModules = MODULES.map(m => m.module);
    await prisma.permission.deleteMany({
        where: {
            OR: [
                { scope: { not: 'TENANT' } },
                { module: { notIn: validModules } },
            ]
        }
    });

    // 1. Create all permissions (upsert)
    const allPermissions = [];
    for (const mod of MODULES) {
        for (const action of ACTIONS) {
            const name = `${mod.label} - ${actionLabel(action)}`;
            const perm = await prisma.permission.upsert({
                where: {
                    module_resource_action_scope: {
                        module: mod.module,
                        resource: mod.resource,
                        action: action,
                        scope: 'TENANT',
                    }
                },
                update: { name },
                create: {
                    module: mod.module,
                    resource: mod.resource,
                    action: action,
                    scope: 'TENANT',
                    name,
                    description: `${mod.label} modülünde ${actionLabel(action)} yetkisi`,
                },
            });
            allPermissions.push(perm);
        }
    }
    console.log(`   ✅ ${allPermissions.length} permission oluşturuldu/güncellendi`);

    // 2. Handle global roles (tenantId: null) like SUPER_ADMIN
    const globalRoles = await prisma.role.findMany({
        where: { tenantId: null },
        select: { id: true, code: true, type: true, name: true }
    });
    console.log(`\n   🌐 ${globalRoles.length} global rol bulundu`);
    for (const role of globalRoles) {
        if (ROLE_PERMISSIONS[role.type] === '*' || ROLE_PERMISSIONS[role.code] === '*') {
            for (const perm of allPermissions) {
                await prisma.rolePermission.upsert({
                    where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } },
                    update: {},
                    create: { roleId: role.id, permissionId: perm.id },
                });
            }
            console.log(`      ✅ ${role.name} (GLOBAL): TÜM YETKİLER (${allPermissions.length})`);
        }
    }

    // 3. Create missing roles and assign permissions for each tenant
    const REQUIRED_ROLES = [
        { type: 'TENANT_ADMIN', code: 'ADMIN', name: 'Yönetici', isSystem: true },
        { type: 'TENANT_MANAGER', code: 'MANAGER', name: 'Müdür', isSystem: true },
        { type: 'TENANT_STAFF', code: 'STAFF', name: 'Personel', isSystem: true },
    ];

    const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });
    console.log(`\n   📋 ${tenants.length} tenant bulundu`);

    for (const tenant of tenants) {
        console.log(`\n   🏢 Tenant: ${tenant.name}`);

        // Create missing required roles
        for (const reqRole of REQUIRED_ROLES) {
            const exists = await prisma.role.findFirst({
                where: { tenantId: tenant.id, type: reqRole.type }
            });
            if (!exists) {
                await prisma.role.create({
                    data: {
                        tenantId: tenant.id,
                        name: reqRole.name,
                        code: reqRole.code,
                        type: reqRole.type,
                        isSystem: reqRole.isSystem,
                    }
                });
                console.log(`      🆕 Oluşturuldu: ${reqRole.name} (${reqRole.type})`);
            }
        }

        const roles = await prisma.role.findMany({
            where: { tenantId: tenant.id },
            select: { id: true, code: true, type: true, name: true }
        });

        for (const role of roles) {
            const rolePerms = ROLE_PERMISSIONS[role.type] || ROLE_PERMISSIONS[role.code] || [];

            if (rolePerms === '*') {
                // Full access — assign all permissions
                for (const perm of allPermissions) {
                    await prisma.rolePermission.upsert({
                        where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } },
                        update: {},
                        create: { roleId: role.id, permissionId: perm.id },
                    });
                }
                console.log(`      ✅ ${role.name} (${role.type}): TÜM YETKİLER (${allPermissions.length})`);
            } else if (rolePerms.length > 0) {
                let assigned = 0;
                for (const permKey of rolePerms) {
                    const [mod, act] = permKey.split(':');
                    const perm = allPermissions.find(p => p.module === mod && p.action === act);
                    if (perm) {
                        await prisma.rolePermission.upsert({
                            where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } },
                            update: {},
                            create: { roleId: role.id, permissionId: perm.id },
                        });
                        assigned++;
                    }
                }
                console.log(`      ✅ ${role.name} (${role.type}): ${assigned} yetki atandı`);
            } else {
                console.log(`      ⚫ ${role.name} (${role.type}): Admin yetkisi yok`);
            }
        }
    }

    // 4. Seed user-level permissions (copy from role defaults)
    console.log('\n   👤 Kullanıcı bazlı yetkiler atanıyor...');
    const adminUsers = await prisma.user.findMany({
        where: {
            deletedAt: null,
            role: {
                type: { in: ['SUPER_ADMIN', 'TENANT_ADMIN', 'TENANT_MANAGER', 'TENANT_STAFF'] }
            }
        },
        include: {
            role: {
                include: {
                    permissions: { select: { permissionId: true } }
                }
            },
            userPermissions: { select: { permissionId: true } }
        }
    });

    for (const u of adminUsers) {
        // Skip if user already has individual permissions
        if (u.userPermissions.length > 0) {
            console.log(`      ⏭️  ${u.fullName} (${u.role.type}): Zaten ${u.userPermissions.length} bireysel yetki var`);
            continue;
        }

        // SUPER_ADMIN and TENANT_ADMIN get all permissions
        const isFull = u.role.type === 'SUPER_ADMIN' || u.role.type === 'TENANT_ADMIN';
        const permIds = isFull
            ? allPermissions.map(p => p.id)
            : u.role.permissions.map(rp => rp.permissionId);

        if (permIds.length > 0) {
            await prisma.userPermission.createMany({
                data: permIds.map(permId => ({
                    userId: u.id,
                    permissionId: permId,
                })),
                skipDuplicates: true,
            });
        }
        console.log(`      ✅ ${u.fullName} (${u.role.type}): ${permIds.length} bireysel yetki atandı`);
    }

    console.log('\n🎉 Permission seeding tamamlandı!\n');
}

function actionLabel(action) {
    switch (action) {
        case 'view': return 'Görüntüleme';
        case 'create': return 'Ekleme';
        case 'update': return 'Düzenleme';
        case 'delete': return 'Silme';
        default: return action;
    }
}

seedPermissions()
    .catch(e => {
        console.error('❌ Seed error:', e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
