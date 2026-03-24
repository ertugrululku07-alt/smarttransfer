const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
    const vehicles = await prisma.vehicle.findMany({ select: { id: true, metadata: true, status: true, updatedAt: true } });
    console.log(JSON.stringify(vehicles, null, 2));
}
check().catch(console.error).finally(() => prisma.$disconnect());
