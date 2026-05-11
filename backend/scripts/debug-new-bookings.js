const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    // Look for specific PNRs from screenshot
    const pnrs = ['B2B079605', 'B2B793537', 'B2B159594', 'B2B965406', 'B2B743658', 'B2B690729'];
    
    const found = await prisma.booking.findMany({
        where: { bookingNumber: { in: pnrs } },
        select: { id: true, bookingNumber: true, agencyId: true, tenantId: true, status: true, subtotal: true, total: true, currency: true, createdAt: true }
    });
    console.log('Searched PNRs:', pnrs);
    console.log('Found:', JSON.stringify(found, null, 2));

    // Also get recent bookings
    const recent = await prisma.booking.findMany({
        where: { agencyId: { not: null } },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { id: true, bookingNumber: true, agencyId: true, tenantId: true, status: true, createdAt: true }
    });
    console.log('\nMost recent agency bookings:', JSON.stringify(recent, null, 2));

    // Count ALL transactions
    const txCount = await prisma.transaction.count({ where: { accountId: { startsWith: 'agency-' } } });
    console.log('\nTotal agency transactions:', txCount);
}

main().catch(console.error).finally(() => prisma.$disconnect());
