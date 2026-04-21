const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
    const users = await prisma.user.count().catch(() => 0);
    const bookings = await prisma.booking.count().catch(() => 0);
    const vehicles = await prisma.vehicle.count().catch(() => 0);
    console.log(`Local DB Stats: Users=${users}, Bookings=${bookings}, Vehicles=${vehicles}`);
}
main().finally(() => prisma.$disconnect());
