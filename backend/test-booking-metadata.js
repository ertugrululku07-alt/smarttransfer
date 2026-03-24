const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkBookingMetadata() {
    try {
        const bookings = await prisma.booking.findMany({
            take: 10,
            select: { id: true, metadata: true }
        });

        console.log("Samples of booking metadata:");
        bookings.forEach(b => {
            console.log(b.id, '->', JSON.stringify(b.metadata));
        });
    } catch (err) {
        console.error(err);
    } finally {
        await prisma.$disconnect()
    }
}
checkBookingMetadata();
