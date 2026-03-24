const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
    const passengers = 1;
    const vehicleTypes = await prisma.vehicleType.findMany({
        where: {
            capacity: {
                gte: Number(passengers)
            },
        },
        include: {
            vehicles: {
                where: { status: 'ACTIVE' },
                include: { zonePrices: true }
            },
            _count: {
                select: { vehicles: true }
            }
        }
    });

    console.log("Found Vehicle Types:", vehicleTypes.length);
    let totalVehicles = 0;
    vehicleTypes.forEach(vt => {
        totalVehicles += vt.vehicles.length;
    });
    console.log("Total Active Vehicles:", totalVehicles);
}
check().catch(console.error).finally(() => prisma.$disconnect());
