const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
    const vehicles = await prisma.vehicle.findMany();
    console.log("All Vehicles:", vehicles.map(v => ({ id: v.id, status: v.status })));
}
check().catch(console.error).finally(() => prisma.$disconnect());
