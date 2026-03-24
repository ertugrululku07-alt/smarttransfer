const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkBookings() {
    try {
        const count = await prisma.booking.count({
            where: { productType: 'TRANSFER' }
        });
        console.log(`Total Transfer Bookings: ${count}`);

        // Check if there are any other bookings
        const total = await prisma.booking.count();
        console.log(`Total Bookings (Any Type): ${total}`);

        // If existing, show one
        if (count > 0) {
            const one = await prisma.booking.findFirst({
                where: { productType: 'TRANSFER' }
            });
            console.log('Sample:', one);
        }
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

checkBookings();
