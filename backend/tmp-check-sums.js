const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
    const tenantId = '00000000-0000-0000-0000-000000000001';
    const dateFrom = new Date('2026-03-01T00:00:00.000Z');
    const dateTo = new Date('2026-03-04T23:59:59.999Z');

    let entriesIn = 0; let entriesOut = 0;

    // 1. Bookings
    const bookings = await prisma.booking.findMany({
        where: { tenantId, status: { not: 'CANCELLED' }, createdAt: { gte: dateFrom, lte: dateTo } }
    });
    const bSum = bookings.reduce((s, b) => s + Number(b.total || 0), 0);
    entriesIn += bSum;

    // 2. Tx
    const txs = await prisma.transaction.findMany({
        where: { tenantId, date: { gte: dateFrom, lte: dateTo }, type: { in: ['PAYMENT_RECEIVED', 'PAYMENT_SENT', 'SALARY', 'MANUAL_IN', 'MANUAL_OUT'] } }
    });
    const tIn = txs.filter(t => t.isCredit).reduce((s, t) => s + Number(t.amount || 0), 0);
    const tOut = txs.filter(t => !t.isCredit).reduce((s, t) => s + Number(t.amount || 0), 0);
    entriesIn += tIn; entriesOut += tOut;

    // 3. Agency Deps
    const agDeposits = await prisma.agencyDeposit.findMany({
        where: {
            tenantId,
            status: 'APPROVED',
            OR: [{ updatedAt: { gte: dateFrom, lte: dateTo } }, { createdAt: { gte: dateFrom, lte: dateTo } }]
        }
    });
    const agSum = agDeposits.reduce((s, d) => s + Number(d.amount || 0), 0);
    entriesIn += agSum;

    console.log({ Bookings: bSum, TxIn: tIn, TxOut: tOut, AgDeps: agSum });
    console.log("Total IN:", entriesIn, "Total OUT:", entriesOut);
}
run().finally(() => prisma.$disconnect());
