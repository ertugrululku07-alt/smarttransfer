const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
    const tenantId = '00000000-0000-0000-0000-000000000001';

    // According to /entries, dateFrom defaults to start of month
    const dateFrom = new Date(new Date().setDate(1));
    dateFrom.setHours(0, 0, 0, 0);
    const dateTo = new Date('2099-12-31T23:59:59.999Z');

    let sums = {
        bookings: { in: 0, out: 0 },
        invoices: { in: 0, out: 0 },
        manual: { in: 0, out: 0 },
        txs: { in: 0, out: 0 },
        agDeps: { in: 0, out: 0 },
        vehicles: { in: 0, out: 0 }
    };

    const t = await prisma.tenant.findUnique({ where: { id: tenantId } });
    const meta = t.metadata;

    // 1. Manual
    (meta.kasaEntries || []).filter(e => {
        const d = new Date(e.date); return d >= dateFrom && d <= dateTo;
    }).forEach(e => {
        if (e.direction === 'IN') sums.manual.in += Number(e.amount);
        else sums.manual.out += Number(e.amount);
    });

    // 2. Bookings (Filtered by createdAt in /entries)
    const bookings = await prisma.booking.findMany({
        where: { tenantId, createdAt: { gte: dateFrom, lte: dateTo }, status: { not: 'CANCELLED' } }
    });
    bookings.forEach(b => {
        sums.bookings.in += Number(b.total || 0);
    });

    // 3. Invoices (Filtered)
    const invoices = (meta.invoices || []).filter(inv => {
        const d = new Date(inv.invoiceDate || inv.createdAt);
        return inv.status === 'APPROVED' && inv.invoiceType === 'SALES' && d >= dateFrom && d <= dateTo;
    });
    invoices.forEach(inv => sums.invoices.in += Number(inv.grandTotal || 0));

    // 4. Global Txs (Filtered)
    const txs = await prisma.transaction.findMany({
        where: { tenantId, date: { gte: dateFrom, lte: dateTo }, type: { in: ['PAYMENT_RECEIVED', 'PAYMENT_SENT', 'SALARY', 'MANUAL_IN', 'MANUAL_OUT'] } }
    });
    txs.forEach(tx => {
        if (tx.isCredit) sums.txs.in += Number(tx.amount || 0);
        else sums.txs.out += Number(tx.amount || 0);
    });

    // 4.5. Ag Deps (Filtered)
    const agDeposits = await prisma.agencyDeposit.findMany({
        where: {
            tenantId, status: 'APPROVED',
            OR: [{ updatedAt: { gte: dateFrom, lte: dateTo } }, { createdAt: { gte: dateFrom, lte: dateTo } }]
        }
    });
    agDeposits.forEach(dep => sums.agDeps.in += Number(dep.amount || 0));

    // 5. Vehicles (Filtered)
    const vehicles = await prisma.vehicle.findMany({ where: { tenantId } });
    vehicles.forEach(v => {
        const tr = v.metadata?.tracking || {};
        (tr.fuel || []).filter(x => { const d = new Date(x.date); return d >= dateFrom && d <= dateTo; }).forEach(f => sums.vehicles.out += Number(f.totalCost || 0));
        (tr.maintenance || []).filter(x => { const d = new Date(x.date); return d >= dateFrom && d <= dateTo; }).forEach(m => sums.vehicles.out += Number(m.cost || 0));
        (tr.insurance || []).filter(x => { const d = new Date(x.startDate); return d >= dateFrom && d <= dateTo; }).forEach(i => sums.vehicles.out += Number(i.cost || 0));
        (tr.inspection || []).filter(x => { const d = new Date(x.date); return d >= dateFrom && d <= dateTo; }).forEach(i => sums.vehicles.out += Number(i.cost || 0));
    });

    console.log(sums);
    let totalIn = 0; let totalOut = 0;
    Object.values(sums).forEach(s => { totalIn += s.in; totalOut += s.out; });
    console.log({ totalIn, totalOut, net: totalIn - totalOut });
}

run().finally(() => prisma.$disconnect());
