const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
    const v = await prisma.vehicle.findMany({
        select: { id: true, plateNumber: true, metadata: true }
    });
    console.log(JSON.stringify(v.filter(x => x.metadata?.tracking), null, 2));
}

check().catch(console.error).finally(() => prisma.$disconnect());
