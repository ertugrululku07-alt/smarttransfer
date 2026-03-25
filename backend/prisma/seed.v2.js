// ============================================================================
// SMART TRAVEL PLATFORM - SEED DATA
// Default Tenant, Roles, Permissions & Sample Data
// ============================================================================

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
    console.log('🌱 Starting seed...');

    // ============================================================================
    // 1. CREATE DEFAULT TENANT
    // ============================================================================
    console.log('📦 Creating default tenant...');

    const defaultTenant = await prisma.tenant.upsert({
        where: { slug: 'smarttravel-demo' },
        update: {},
        create: {
            id: '00000000-0000-0000-0000-000000000001',
            slug: 'smarttravel-demo',
            name: 'SmartTravel Demo',
            legalName: 'SmartTravel Turizm A.Ş.',
            taxNumber: '1234567890',
            status: 'ACTIVE',
            plan: 'PREMIUM',
            transferEnabled: true,
            tourEnabled: true,
            hotelEnabled: true,
            email: 'info@smarttravel.demo',
            phone: '+90 212 123 45 67',
            settings: {
                bookingPrefix: 'ST',
                autoConfirm: true,
                requireApproval: false
            }
        }
    });

    console.log('✅ Default tenant created:', defaultTenant.slug);

    // ============================================================================
    // 2. CREATE PERMISSIONS
    // ============================================================================
    console.log('🔐 Creating permissions...');

    const permissionsData = [
        // Transfer Module
        { module: 'transfer', resource: 'product', action: 'create', scope: 'TENANT', name: 'Create Transfer Products' },
        { module: 'transfer', resource: 'product', action: 'read', scope: 'TENANT', name: 'View Transfer Products' },
        { module: 'transfer', resource: 'product', action: 'update', scope: 'TENANT', name: 'Edit Transfer Products' },
        { module: 'transfer', resource: 'product', action: 'delete', scope: 'TENANT', name: 'Delete Transfer Products' },
        { module: 'transfer', resource: 'vehicle', action: 'manage', scope: 'TENANT', name: 'Manage Vehicles' },

        // Tour Module
        { module: 'tour', resource: 'product', action: 'create', scope: 'TENANT', name: 'Create Tour Products' },
        { module: 'tour', resource: 'product', action: 'read', scope: 'TENANT', name: 'View Tour Products' },
        { module: 'tour', resource: 'product', action: 'update', scope: 'TENANT', name: 'Edit Tour Products' },
        { module: 'tour', resource: 'product', action: 'delete', scope: 'TENANT', name: 'Delete Tour Products' },
        { module: 'tour', resource: 'schedule', action: 'manage', scope: 'TENANT', name: 'Manage Tour Schedules' },

        // Hotel Module
        { module: 'hotel', resource: 'product', action: 'create', scope: 'TENANT', name: 'Create Hotels' },
        { module: 'hotel', resource: 'product', action: 'read', scope: 'TENANT', name: 'View Hotels' },
        { module: 'hotel', resource: 'product', action: 'update', scope: 'TENANT', name: 'Edit Hotels' },
        { module: 'hotel', resource: 'product', action: 'delete', scope: 'TENANT', name: 'Delete Hotels' },
        { module: 'hotel', resource: 'room', action: 'manage', scope: 'TENANT', name: 'Manage Rooms' },

        // Booking Module
        { module: 'booking', resource: 'booking', action: 'create', scope: 'ALL', name: 'Create Bookings' },
        { module: 'booking', resource: 'booking', action: 'read', scope: 'TENANT', name: 'View All Bookings' },
        { module: 'booking', resource: 'booking', action: 'read', scope: 'OWN', name: 'View Own Bookings' },
        { module: 'booking', resource: 'booking', action: 'update', scope: 'TENANT', name: 'Update Bookings' },
        { module: 'booking', resource: 'booking', action: 'cancel', scope: 'TENANT', name: 'Cancel Bookings' },
        { module: 'booking', resource: 'booking', action: 'approve', scope: 'TENANT', name: 'Approve Bookings' },

        // Payment Module
        { module: 'payment', resource: 'payment', action: 'process', scope: 'TENANT', name: 'Process Payments' },
        { module: 'payment', resource: 'payment', action: 'refund', scope: 'TENANT', name: 'Refund Payments' },
        { module: 'payment', resource: 'payment', action: 'read', scope: 'TENANT', name: 'View Payments' },

        // User Management
        { module: 'user', resource: 'user', action: 'create', scope: 'TENANT', name: 'Create Users' },
        { module: 'user', resource: 'user', action: 'read', scope: 'TENANT', name: 'View Users' },
        { module: 'user', resource: 'user', action: 'update', scope: 'TENANT', name: 'Update Users' },
        { module: 'user', resource: 'user', action: 'delete', scope: 'TENANT', name: 'Delete Users' },
        { module: 'user', resource: 'role', action: 'manage', scope: 'TENANT', name: 'Manage Roles' },

        // Settings
        { module: 'settings', resource: 'tenant', action: 'update', scope: 'TENANT', name: 'Update Tenant Settings' },
        { module: 'settings', resource: 'theme', action: 'manage', scope: 'TENANT', name: 'Manage Themes' },
        { module: 'settings', resource: 'payment', action: 'configure', scope: 'TENANT', name: 'Configure Payments' },

        // Reports & Analytics
        { module: 'reports', resource: 'analytics', action: 'read', scope: 'TENANT', name: 'View Analytics' },
        { module: 'reports', resource: 'export', action: 'execute', scope: 'TENANT', name: 'Export Reports' },

        // Platform Admin (Super Admin only)
        { module: 'platform', resource: 'tenant', action: 'create', scope: 'ALL', name: 'Create Tenants' },
        { module: 'platform', resource: 'tenant', action: 'delete', scope: 'ALL', name: 'Delete Tenants' },
        { module: 'platform', resource: 'system', action: 'manage', scope: 'ALL', name: 'Manage System' },
    ];

    const permissions = await Promise.all(
        permissionsData.map(async (permData) => {
            return await prisma.permission.upsert({
                where: {
                    module_resource_action_scope: {
                        module: permData.module,
                        resource: permData.resource,
                        action: permData.action,
                        scope: permData.scope
                    }
                },
                update: {},
                create: permData
            });
        })
    );

    console.log(`✅ Created ${permissions.length} permissions`);

    // ============================================================================
    // 3. CREATE ROLES
    // ============================================================================
    console.log('👥 Creating roles...');

    // Super Admin Role (Global)
    const superAdminRole = await prisma.role.upsert({
        where: {
            tenantId_code: {
                tenantId: null,
                code: 'SUPER_ADMIN'
            }
        },
        update: {},
        create: {
            code: 'SUPER_ADMIN',
            name: 'Super Administrator',
            type: 'SUPER_ADMIN',
            description: 'Full platform access',
            isSystem: true
        }
    });

    // Assign ALL permissions to Super Admin
    const allPermissions = await prisma.permission.findMany();
    await Promise.all(
        allPermissions.map(perm =>
            prisma.rolePermission.upsert({
                where: {
                    roleId_permissionId: {
                        roleId: superAdminRole.id,
                        permissionId: perm.id
                    }
                },
                update: {},
                create: {
                    roleId: superAdminRole.id,
                    permissionId: perm.id
                }
            })
        )
    );

    // Tenant Admin Role
    const tenantAdminRole = await prisma.role.upsert({
        where: {
            tenantId_code: {
                tenantId: defaultTenant.id,
                code: 'TENANT_ADMIN'
            }
        },
        update: {},
        create: {
            tenantId: defaultTenant.id,
            code: 'TENANT_ADMIN',
            name: 'Tenant Administrator',
            type: 'TENANT_ADMIN',
            description: 'Full tenant access',
            isSystem: true
        }
    });

    // Assign tenant-level permissions
    const tenantPermissions = allPermissions.filter(p =>
        ['TENANT', 'OWN'].includes(p.scope) && !p.module.startsWith('platform')
    );
    await Promise.all(
        tenantPermissions.map(perm =>
            prisma.rolePermission.upsert({
                where: {
                    roleId_permissionId: {
                        roleId: tenantAdminRole.id,
                        permissionId: perm.id
                    }
                },
                update: {},
                create: {
                    roleId: tenantAdminRole.id,
                    permissionId: perm.id
                }
            })
        )
    );

    // Staff Role
    const staffRole = await prisma.role.upsert({
        where: {
            tenantId_code: {
                tenantId: defaultTenant.id,
                code: 'STAFF'
            }
        },
        update: {},
        create: {
            tenantId: defaultTenant.id,
            code: 'STAFF',
            name: 'Staff Member',
            type: 'TENANT_STAFF',
            description: 'Day-to-day operations',
            isSystem: true
        }
    });

    // Customer Role
    const customerRole = await prisma.role.upsert({
        where: {
            tenantId_code: {
                tenantId: defaultTenant.id,
                code: 'CUSTOMER'
            }
        },
        update: {},
        create: {
            tenantId: defaultTenant.id,
            code: 'CUSTOMER',
            name: 'Customer',
            type: 'CUSTOMER',
            description: 'End user / customer',
            isSystem: true
        }
    });

    // Assign customer permissions (own bookings only)
    const customerPermissions = allPermissions.filter(p =>
        (p.module === 'booking' && p.scope === 'OWN') ||
        (p.module === 'transfer' && p.action === 'read') ||
        (p.module === 'tour' && p.action === 'read') ||
        (p.module === 'hotel' && p.action === 'read')
    );
    await Promise.all(
        customerPermissions.map(perm =>
            prisma.rolePermission.upsert({
                where: {
                    roleId_permissionId: {
                        roleId: customerRole.id,
                        permissionId: perm.id
                    }
                },
                update: {},
                create: {
                    roleId: customerRole.id,
                    permissionId: perm.id
                }
            })
        )
    );

    console.log('✅ Roles created');

    // ============================================================================
    // 4. CREATE DEFAULT USERS
    // ============================================================================
    console.log('👤 Creating default users...');

    const hashedPassword = await bcrypt.hash('Admin123!', 10);

    // Super Admin
    const superAdmin = await prisma.user.upsert({
        where: {
            tenantId_email: {
                tenantId: defaultTenant.id,
                email: 'admin@smarttravel.com'
            }
        },
        update: {},
        create: {
            tenantId: defaultTenant.id,
            email: 'admin@smarttravel.com',
            passwordHash: hashedPassword,
            emailVerified: true,
            firstName: 'Super',
            lastName: 'Admin',
            fullName: 'Super Admin',
            roleId: superAdminRole.id,
            status: 'ACTIVE'
        }
    });

    // Tenant Admin
    const tenantAdmin = await prisma.user.upsert({
        where: {
            tenantId_email: {
                tenantId: defaultTenant.id,
                email: 'tenant@smarttravel.com'
            }
        },
        update: {},
        create: {
            tenantId: defaultTenant.id,
            email: 'tenant@smarttravel.com',
            passwordHash: hashedPassword,
            emailVerified: true,
            firstName: 'Tenant',
            lastName: 'Admin',
            fullName: 'Tenant Admin',
            roleId: tenantAdminRole.id,
        }
    });

    // Demo Customer
    const demoCustomer = await prisma.user.upsert({
        where: {
            tenantId_email: {
                tenantId: defaultTenant.id,
                email: 'customer@example.com'
            }
        },
        update: {},
        create: {
            tenantId: defaultTenant.id,
            email: 'customer@example.com',
            passwordHash: hashedPassword,
            emailVerified: true,
            firstName: 'Demo',
            lastName: 'Customer',
            fullName: 'Demo Customer',
            roleId: customerRole.id,
            status: 'ACTIVE'
        }
    });

    console.log('✅ Default users created');
    console.log('   📧 admin@smarttravel.com / Admin123!');
    console.log('   📧 tenant@smarttravel.com / Admin123!');
    console.log('   📧 customer@example.com / Admin123!');

    // ============================================================================
    // 5. CREATE DEFAULT THEMES
    // ============================================================================
    console.log('🎨 Creating default themes...');

    const defaultTheme = await prisma.theme.upsert({
        where: { code: 'default-light' },
        update: {},
        create: {
            code: 'default-light',
            name: 'Default Light Theme',
            category: 'DEFAULT',
            isDefault: true,
            isActive: true,
            isPublic: true,
            config: {
                meta: { name: 'Default Light', version: '1.0.0' },
                colors: {
                    mode: 'light',
                    primary: { DEFAULT: '#667eea' },
                    secondary: { DEFAULT: '#764ba2' },
                    accent: { DEFAULT: '#f5576c' }
                },
                // ... full theme config
            }
        }
    });

    console.log('✅ Default theme created');

    // ============================================================================
    // 6. CREATE SAMPLE VEHICLE TYPES
    // ============================================================================
    console.log('🚗 Creating vehicle types...');

    const vehicleTypes = [
        { name: 'Sedan', slug: 'sedan', category: 'SEDAN', capacity: 3, luggage: 2 },
        { name: 'VIP Sedan', slug: 'vip-sedan', category: 'LUXURY', capacity: 3, luggage: 2 },
        { name: 'Van', slug: 'van', category: 'VAN', capacity: 6, luggage: 4 },
        { name: 'Minibus', slug: 'minibus', category: 'MINIBUS', capacity: 14, luggage: 10 },
        { name: 'Bus', slug: 'bus', category: 'BUS', capacity: 50, luggage: 40 },
    ];

    await Promise.all(
        vehicleTypes.map(vt =>
            prisma.vehicleType.upsert({
                where: {
                    tenantId_slug: {
                        tenantId: defaultTenant.id,
                        slug: vt.slug
                    }
                },
                update: {},
                create: {
                    tenantId: defaultTenant.id,
                    ...vt,
                    features: ['ac', 'wifi', 'charger']
                }
            })
        )
    );

    console.log('✅ Vehicle types created');

    // ============================================================================
    // SUMMARY
    // ============================================================================
    console.log('\n🎉 Seed completed successfully!');
    console.log('\n📊 Summary:');
    console.log(`   - Tenant: ${defaultTenant.name}`);
    console.log(`   - Permissions: ${permissions.length}`);
    console.log(`   - Roles: 4 (Super Admin, Tenant Admin, Staff, Customer)`);
    console.log(`   - Users: 3 (admin, tenant, customer)`);
    console.log(`   - Vehicle Types: ${vehicleTypes.length}`);
    console.log('\n🔐 Login Credentials:');
    console.log('   admin@smarttravel.com / Admin123!');
    console.log('   tenant@smarttravel.com / Admin123!');
    console.log('   customer@example.com / Admin123!');
}

main()
    .catch((e) => {
        console.error('❌ Seed failed:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
