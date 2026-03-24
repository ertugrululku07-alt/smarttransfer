const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function run() {
    const b = await prisma.booking.findFirst({ where: { bookingNumber: 'B2B674920' } });
    if (!b) return console.log('Booking not found');
    const exist = await prisma.transaction.findFirst({ where: { referenceId: b.id } });
    if (exist) return console.log('Transaction already exists');
    const tx = await prisma.transaction.create({
        data: {
            tenantId: b.tenantId,
            accountId: `agency-${b.agencyId}`,
            type: 'MANUAL_OUT',
            amount: b.subtotal,
            isCredit: false,
            description: `B2B Transfer Rezervasyonu (PNR: ${b.bookingNumber})`,
            date: b.createdAt,
            referenceId: b.id
        }
    });
    await prisma.agency.update({
        where: { id: b.agencyId },
        data: { debit: { increment: b.subtotal } }
    });
    console.log('Fixed missing transaction:', tx.id);
}
run()
    .catch(e => console.error(e))
    .finally(() => prisma.$disconnect());
