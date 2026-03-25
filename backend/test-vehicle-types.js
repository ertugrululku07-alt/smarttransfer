const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
    try {
        console.log("Starting test...");
        const vehicleTypes = await prisma.vehicleType.findMany({
            orderBy: { order: 'asc' },
            include: {
                _count: {
                    select: { vehicles: true }
                },
                zonePrices: true
            }
        });
        console.log("Found:", vehicleTypes.length);
    } catch (e) {
        console.error("Error:", e);
    } finally {
        await prisma.$disconnect();
    }
}
test();
