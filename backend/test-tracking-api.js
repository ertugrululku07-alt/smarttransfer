const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const TENANT_ID = '00000000-0000-0000-0000-000000000001';

async function testTrackingAPI() {
    try {
        console.log(`Querying vehicles for tenant: ${TENANT_ID} where status != RETIRED`);
        const vehicles = await prisma.vehicle.findMany({
            where: { tenantId: TENANT_ID, status: { not: 'RETIRED' } },
            include: { vehicleType: true }
        });

        console.log(`Found ${vehicles.length} vehicles.`);

        if (vehicles.length > 0) {
            console.log('Sample vehicle metadata:', JSON.stringify(vehicles[0].metadata, null, 2));
        }

        const transfers = await prisma.booking.findMany({
            where: { tenantId: TENANT_ID, status: { in: ['COMPLETED', 'CONFIRMED'] } },
            select: { assignedVehicleId: true, metadata: true, routeDetails: true }
        });
        console.log(`Found ${transfers.length} related transfers.`);

    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        await prisma.$disconnect();
    }
}

testTrackingAPI();
