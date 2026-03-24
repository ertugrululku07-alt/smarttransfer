const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function debugVehicleTracking() {
    try {
        // List all vehicles
        const vehicles = await prisma.vehicle.findMany({
            select: {
                id: true,
                brand: true,
                model: true,
                plateNumber: true,
                status: true,
                tenantId: true,
            }
        });

        console.log(`\n=== All vehicles in DB: ${vehicles.length} ===`);
        vehicles.forEach(v => {
            console.log(`  - ${v.brand} ${v.model} [${v.plateNumber}] status=${v.status} tenantId=${v.tenantId}`);
        });

        // List all tenants
        const tenants = await prisma.tenant.findMany({
            select: { id: true, name: true, slug: true }
        });

        console.log(`\n=== All tenants: ${tenants.length} ===`);
        tenants.forEach(t => {
            console.log(`  - ${t.name} [${t.slug}] id=${t.id}`);
        });

        // Find vehicles per tenant
        for (const tenant of tenants) {
            const count = await prisma.vehicle.count({
                where: { tenantId: tenant.id, status: { not: 'RETIRED' } }
            });
            console.log(`\n  Tenant "${tenant.name}" has ${count} non-RETIRED vehicles`);
        }

    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        await prisma.$disconnect();
    }
}

debugVehicleTracking();
