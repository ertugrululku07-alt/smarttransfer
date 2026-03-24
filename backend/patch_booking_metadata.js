const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        const bookingNumber = 'TR-1771100355760'; // Murat ŞAHİN
        console.log(`--- PATCHING BOOKING: ${bookingNumber} ---`);

        const booking = await prisma.booking.findUnique({
            where: { bookingNumber: bookingNumber }
        });

        if (!booking) {
            console.log('Booking not found!');
            return;
        }

        const newMetadata = {
            ...booking.metadata,
            distance: '44.5 km',
            duration: '55 dk'
        };

        const updated = await prisma.booking.update({
            where: { bookingNumber: bookingNumber },
            data: { metadata: newMetadata }
        });

        console.log('Updated metadata:', JSON.stringify(updated.metadata, null, 2));

    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
