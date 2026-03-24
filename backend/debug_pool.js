const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        console.log('--- CHECKING BOOKINGS ---');
        // Simple query without comments to avoid parsing issues
        const bookings = await prisma.booking.findMany({
            where: {
                productType: 'TRANSFER'
            },
            include: {
                vehicle: true
            }
        });

        console.log(`Found ${bookings.length} total bookings.`);

        const poolBookings = bookings.filter(b => {
            const meta = b.metadata || {};
            const opStatus = meta.operationalStatus;
            console.log(`Booking ${b.bookingNumber}: Status=${b.status}, OpStatus=${opStatus}`);
            return opStatus === 'POOL';
        });

        console.log(`\nFound ${poolBookings.length} POOL bookings (in memory filter).`);

    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
