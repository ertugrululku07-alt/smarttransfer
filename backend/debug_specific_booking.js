const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const fs = require('fs');

async function main() {
    try {
        const booking = await prisma.booking.findFirst({
            where: { bookingNumber: 'TR-1770582021579' }
        });
        fs.writeFileSync('d:/SmartTransfer/backend/booking_dump_utf8.json', JSON.stringify(booking, null, 2));
        console.log('Dump written to booking_dump_utf8.json');
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
