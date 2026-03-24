const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fix() {
    await prisma.vehicle.updateMany({
        data: { status: 'ACTIVE' }
    });
    console.log("All vehicles activated.");
}
fix().catch(console.error).finally(() => prisma.$disconnect());
