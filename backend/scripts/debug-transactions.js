const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const agencies = await prisma.agency.findMany({ select: { id: true, name: true } });
    console.log('Agencies:', JSON.stringify(agencies, null, 2));

    const txs = await prisma.transaction.findMany({
        where: { accountId: { startsWith: 'agency-' } },
        select: { id: true, accountId: true, type: true, amount: true, currency: true, isCredit: true, description: true },
        take: 20
    });
    console.log('\nAgency Transactions count:', txs.length);
    console.log('Transactions:', JSON.stringify(txs, null, 2));

    // Also check bookings with agencyId
    const bookings = await prisma.booking.findMany({
        where: { agencyId: { not: null } },
        select: { id: true, agencyId: true, bookingNumber: true, status: true, subtotal: true, total: true, currency: true }
    });
    console.log('\nB2B Bookings:', JSON.stringify(bookings, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
