const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
    const count = await prisma.booking.count({
        where: { productType: 'TRANSFER' }
    });
    console.log('COUNT:' + count);
    await prisma.$disconnect();
}
check();
