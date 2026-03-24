const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs');

async function main() {
    try {
        console.log('--- FINDING BOOKING: Murat ŞAHİN ---');
        // Note: The screenshot shows 'Murat ŞAHİN'. Search logic might need case sensitivity handling or exact match.
        // I'll try contains.
        const bookings = await prisma.booking.findMany({
            where: {
                contactName: {
                    contains: 'Murat'
                }
            }
        });
        fs.writeFileSync('d:/SmartTransfer/backend/debug_murat.json', JSON.stringify(bookings, null, 2));
        console.log(`Found ${bookings.length} bookings.`);
        bookings.forEach(b => console.log(`${b.contactName} - ${b.bookingNumber}`));
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
