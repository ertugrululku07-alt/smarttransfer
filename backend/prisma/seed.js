const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
    console.log('🌱 Starting seed...');

    // 1. Create default tenant
    const defaultTenant = await prisma.tenant.upsert({
        where: { slug: 'smarttravel-demo' },
        update: {
            flightEnabled: false,
            carEnabled: false,
            cruiseEnabled: false,
            heroImages: [
                'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?auto=format&fit=crop&w=2021&q=80',
                'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?auto=format&fit=crop&w=2070&q=80'
            ]
        },
        create: {
            id: '00000000-0000-0000-0000-000000000001',
            slug: 'smarttravel-demo',
            name: 'SmartTravel Demo',
            legalName: 'SmartTravel Turizm A.Ş.',
            status: 'ACTIVE',
            plan: 'PREMIUM',
            transferEnabled: true,
            tourEnabled: true,
            hotelEnabled: true,
            flightEnabled: false,
            carEnabled: false,
            cruiseEnabled: false,
            heroImages: [
                'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?auto=format&fit=crop&w=2021&q=80',
                'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?auto=format&fit=crop&w=2070&q=80'
            ]
        }
    });

    console.log('✅ Tenant created');

    // 2. Create permissions
    const perms = [
        { module: 'transfer', resource: 'product', action: 'read', scope: 'TENANT', name: 'View Transfers' },
        { module: 'booking', resource: 'booking', action: 'create', scope: 'ALL', name: 'Create Booking' },
        { module: 'booking', resource: 'booking', action: 'read', scope: 'OWN', name: 'View Own Bookings' },
    ];

    const permissions = [];
    for (const p of perms) {
        const perm = await prisma.permission.upsert({
            where: {
                module_resource_action_scope: {
                    module: p.module,
                    resource: p.resource,
                    action: p.action,
                    scope: p.scope
                }
            },
            update: {},
            create: p
        });
        permissions.push(perm);
    }

    console.log(`✅ Created ${permissions.length} permissions`);

    // 3. Create roles
    let superAdminRole = await prisma.role.findFirst({
        where: {
            tenantId: null,
            code: 'SUPER_ADMIN'
        }
    });

    if (!superAdminRole) {
        superAdminRole = await prisma.role.create({
            data: {
                code: 'SUPER_ADMIN',
                name: 'Super Admin',
                type: 'SUPER_ADMIN',
                isSystem: true
            }
        });
    }
    // Assign permissions
    for (const perm of permissions) {
        await prisma.rolePermission.upsert({
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
        });
    }

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
            isSystem: true
        }
    });

    // 4. Create users
    const hashedPassword = await bcrypt.hash('Admin123!', 10);

    const admin = await prisma.user.upsert({
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
            firstName: 'Super',
            lastName: 'Admin',
            fullName: 'Super Admin',
            roleId: superAdminRole.id,
            emailVerified: true,
            status: 'ACTIVE'
        }
    });

    await prisma.user.upsert({
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
            firstName: 'Demo',
            lastName: 'Customer',
            fullName: 'Demo Customer',
            roleId: customerRole.id,
            emailVerified: true,
            status: 'ACTIVE'
        }
    });

    console.log('✅ Users created');

    // 5. Create theme
    await prisma.theme.upsert({
        where: { code: 'default-light' },
        update: {},
        create: {
            code: 'default-light',
            name: 'Default Light',
            category: 'DEFAULT',
            isDefault: true,
            isActive: true,
            isPublic: true,
            config: {
                meta: { name: 'Default', version: '1.0.0' },
                colors: { primary: { DEFAULT: '#667eea' } }
            }
        }
    });

    // 6. Create vehicle types
    await prisma.vehicleType.upsert({
        where: {
            tenantId_slug: {
                tenantId: defaultTenant.id,
                slug: 'sedan'
            }
        },
        update: {},
        create: {
            tenantId: defaultTenant.id,
            name: 'Sedan',
            slug: 'sedan',
            category: 'SEDAN',
            capacity: 3,
            luggage: 2,
            features: ['ac', 'wifi']
        }
    });

    await prisma.vehicleType.upsert({
        where: {
            tenantId_slug: {
                tenantId: defaultTenant.id,
                slug: 'van'
            }
        },
        update: {},
        create: {
            tenantId: defaultTenant.id,
            name: 'Van',
            slug: 'van',
            category: 'VAN',
            capacity: 6,
            luggage: 4,
            features: ['ac', 'wifi']
        }
    });

    console.log('\n🎉 Seed completed!');
    console.log('🔐 Login: admin@smarttravel.com / Admin123!');
}

main()
    .catch((e) => {
        console.error('❌ Seed failed:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
