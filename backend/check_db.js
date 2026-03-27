const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkDb() {
    try {
        const types = await prisma.vehicleType.findMany({
            include: { vehicles: true }
        });
        console.log("Vehicle Types:");
        types.forEach(vt => {
            console.log(`- ${vt.name} (ID: ${vt.id}), Capacity: ${vt.capacity}`);
            console.log(`  Metadata: ${JSON.stringify(vt.metadata)}`);
            console.log(`  Active Vehicles: ${vt.vehicles.filter(v => v.status === 'ACTIVE').length}`);
        });

        const tenant = await prisma.tenant.findFirst();
        console.log("\nTenant Hubs:");
        console.log(JSON.stringify(tenant?.settings?.hubs, null, 2));

    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

checkDb();
