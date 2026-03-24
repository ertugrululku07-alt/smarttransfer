const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs');

async function main() {
    try {
        console.log('--- CHECKING LEAKED BOOKINGS ---');
        const bookings = await prisma.booking.findMany({
            where: {
                contactName: {
                    in: ['Ayşe Yılmaz', 'Mehmet Demir']
                }
            }
        });
        fs.writeFileSync('d:/SmartTransfer/backend/debug_leak.json', JSON.stringify(bookings, null, 2));
        console.log(`Dumped ${bookings.length} bookings to debug_leak.json`);
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
