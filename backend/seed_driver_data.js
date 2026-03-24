const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        console.log('🌱 Seeding Driver Data...');

        // 1. Get Tenant (Assuming at least one exists)
        const tenant = await prisma.tenant.findFirst();
        if (!tenant) {
            console.error('❌ No tenant found! Cannot seed.');
            return;
        }
        console.log(`Using Tenant: ${tenant.name} (${tenant.id})`);

        // 2. Ensure PARTNER Role
        let partnerRole = await prisma.role.findFirst({
            where: { tenantId: tenant.id, type: 'PARTNER' }
        });

        if (!partnerRole) {
            // Try finding by code
            partnerRole = await prisma.role.findFirst({
                where: { tenantId: tenant.id, code: 'PARTNER' }
            });
        }

        if (!partnerRole) {
            partnerRole = await prisma.role.create({
                data: {
                    tenantId: tenant.id,
                    name: 'Sürücü (Partner)',
                    code: 'PARTNER',
                    type: 'PARTNER',
                    description: 'External driver partner',
                    isActive: true,
                    isSystem: true
                }
            });
            console.log('✅ Created PARTNER role.');
        } else {
            console.log('ℹ️ PARTNER role already exists.');
        }

        // 3. Ensure Vehicle Types
        const types = [
            { name: 'Binek (Sedan)', slug: 'sedan', category: 'SEDAN', capacity: 4, luggage: 2 },
            { name: 'VIP Van (Vito)', slug: 'van', category: 'VAN', capacity: 6, luggage: 6 },
            { name: 'Minibüs (Sprinter)', slug: 'minibus', category: 'MINIBUS', capacity: 16, luggage: 10 },
            { name: 'Otobüs', slug: 'bus', category: 'BUS', capacity: 45, luggage: 45 },
        ];

        for (const t of types) {
            const existing = await prisma.vehicleType.findFirst({
                where: { tenantId: tenant.id, category: t.category }
            });

            if (!existing) {
                await prisma.vehicleType.create({
                    data: {
                        tenantId: tenant.id,
                        name: t.name,
                        slug: t.slug, // slug must be unique per tenant
                        category: t.category,
                        capacity: t.capacity,
                        luggage: t.luggage,
                        features: ['ac', 'wifi'],
                        description: t.name
                    }
                });
                console.log(`✅ Created VehicleType: ${t.name}`);
            } else {
                console.log(`ℹ️ VehicleType ${t.category} already exists.`);
            }
        }

        console.log('✨ Seeding completed successfully.');

    } catch (e) {
        console.error('❌ Seeding error:', e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
