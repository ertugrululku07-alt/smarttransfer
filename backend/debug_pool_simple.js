const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        console.log('--- FETCHING 1 BOOKING ---');
        const booking = await prisma.booking.findFirst();
        console.log(booking);

        console.log('--- FETCHING WITH FILTER ---');
        const filtered = await prisma.booking.findMany({
            where: {
                productType: 'TRANSFER'
            }
        });
        console.log(`Found ${filtered.length} transfer bookings.`);

    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
