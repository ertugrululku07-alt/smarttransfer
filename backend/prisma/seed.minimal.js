const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
    console.log('🌱 Starting minimal seed...');

    // 1. Create Tenant
    const tenant = await prisma.tenant.upsert({
        where: { slug: 'smarttravel-demo' },
        update: {},
        create: {
            slug: 'smarttravel-demo',
            name: 'SmartTravel Demo',
            status: 'ACTIVE',
            plan: 'PREMIUM',
        }
    });
    console.log('✅ Tenant created:', tenant.slug);

    // 2. Create Role (Global SUPER_ADMIN)
    // We'll try to find any role first to avoid upsert issues with null tenantId
    let role = await prisma.role.findFirst({
        where: { code: 'SUPER_ADMIN' }
    });

    if (!role) {
        role = await prisma.role.create({
            data: {
                code: 'SUPER_ADMIN',
                name: 'Super Administrator',
                type: 'SUPER_ADMIN',
                isSystem: true
            }
        });
        console.log('✅ Role created:', role.code);
    } else {
        console.log('ℹ️ Role already exists:', role.code);
    }

    // 3. Create User
    const hashedPassword = await bcrypt.hash('Admin123!', 10);
    const user = await prisma.user.upsert({
        where: {
            tenantId_email: {
                tenantId: tenant.id,
                email: 'admin@smarttravel.com'
            }
        },
        update: {
            passwordHash: hashedPassword
        },
        create: {
            tenantId: tenant.id,
            email: 'admin@smarttravel.com',
            passwordHash: hashedPassword,
            firstName: 'Admin',
            lastName: 'User',
            fullName: 'Admin User',
            roleId: role.id,
            status: 'ACTIVE'
        }
    });

    console.log('✅ User created: admin@smarttravel.com / Admin123!');
    console.log('🚀 Minimal seed completed!');
}

main()
    .catch((e) => {
        console.error('❌ Seed failed:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
