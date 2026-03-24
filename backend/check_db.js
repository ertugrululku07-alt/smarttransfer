const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
async function main() {
    const roles = await p.role.findMany({ select: { id: true, code: true, type: true, name: true }, take: 20 });
    console.log('ROLES:', JSON.stringify(roles, null, 2));

    const bookings = await p.booking.findMany({
        where: { driverId: { not: null } },
        select: { id: true, driverId: true, status: true, bookingNumber: true },
        take: 5
    });
    console.log('BOOKINGS WITH DRIVER:', JSON.stringify(bookings, null, 2));

    const driver = await p.user.findFirst({
        where: { role: { OR: [{ type: 'DRIVER' }, { code: 'DRIVER' }] } },
        select: { id: true, firstName: true, lastName: true, role: { select: { type: true, code: true } }, tenantId: true }
    });
    console.log('DRIVER USER:', JSON.stringify(driver, null, 2));

    await p.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
