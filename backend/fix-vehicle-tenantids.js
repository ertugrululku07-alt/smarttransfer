const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const CORRECT_TENANT_ID = '00000000-0000-0000-0000-000000000001';

async function fixVehicleTenantIds() {
    try {
        // Find all vehicles with wrong tenantId
        const allVehicles = await prisma.vehicle.findMany({
            select: { id: true, brand: true, model: true, plateNumber: true, tenantId: true }
        });

        let fixed = 0;
        for (const v of allVehicles) {
            if (v.tenantId !== CORRECT_TENANT_ID) {
                console.log(`Fixing: ${v.brand} ${v.model} [${v.plateNumber}] tenantId: ${v.tenantId} -> ${CORRECT_TENANT_ID}`);
                await prisma.vehicle.update({
                    where: { id: v.id },
                    data: { tenantId: CORRECT_TENANT_ID }
                });
                fixed++;
            }
        }

        console.log(`\nFixed ${fixed} vehicles.`);

        // Verify
        const count = await prisma.vehicle.count({ where: { tenantId: CORRECT_TENANT_ID, status: { not: 'RETIRED' } } });
        console.log(`Now tenant has ${count} non-RETIRED vehicles.`);

    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        await prisma.$disconnect();
    }
}

fixVehicleTenantIds();
