const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function run() {
    const bookings = await prisma.booking.findMany({ orderBy: { createdAt: 'desc' }, take: 5, select: { id: true, driverId: true, metadata: true } });
    console.log(JSON.stringify(bookings, null, 2));
}
run().finally(() => prisma.$disconnect());
