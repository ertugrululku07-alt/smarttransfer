const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
    const tenantId = '00000000-0000-0000-0000-000000000001';

    // Simulate what the UI exactly shows in the screenshot:
    // From: 01.03.2026 To: 04.03.2026
    const dateFrom = new Date('2026-03-01T00:00:00.000Z');
    const dateTo = new Date('2026-03-04T23:59:59.999Z');

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
    bookings.forEach(b => { sums.bookings.in += Number(b.total || 0); });

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

    let totalIn = 0; let totalOut = 0;
    Object.values(sums).forEach(s => { totalIn += s.in; totalOut += s.out; });

    console.log("=== THIS MONTH TOTALS ===");
    console.log({ totalIn, totalOut, net: totalIn - totalOut });
    console.log(sums);

    // ==========================================
    // Check all-time accounts exactly as /accounts sees them when not filtered:
    let accsAllTime = {
        bookings: { in: 0, out: 0 },
        invoices: { in: 0, out: 0 },
        manual: { in: 0, out: 0 },
        txs: { in: 0, out: 0 },
        agDeps: { in: 0, out: 0 },
        vehicles: { in: 0, out: 0 }
    };

    (meta.kasaEntries || []).forEach(e => {
        if (e.direction === 'IN') accsAllTime.manual.in += Number(e.amount);
        else accsAllTime.manual.out += Number(e.amount);
    });

    const bookingsAll = await prisma.booking.findMany({
        where: { tenantId, status: { not: 'CANCELLED' } }
    });
    bookingsAll.forEach(b => accsAllTime.bookings.in += Number(b.total || 0));

    const invoicesAll = (meta.invoices || []).filter(inv => inv.status === 'APPROVED' && inv.invoiceType === 'SALES');
    invoicesAll.forEach(inv => accsAllTime.invoices.in += Number(inv.grandTotal || 0));

    const txsAll = await prisma.transaction.findMany({
        where: { tenantId, type: { in: ['PAYMENT_RECEIVED', 'PAYMENT_SENT', 'SALARY', 'MANUAL_IN', 'MANUAL_OUT'] } }
    });
    txsAll.forEach(tx => {
        if (tx.isCredit) accsAllTime.txs.in += Number(tx.amount || 0);
        else accsAllTime.txs.out += Number(tx.amount || 0);
    });

    const agDepositsAll = await prisma.agencyDeposit.findMany({
        where: { tenantId, status: 'APPROVED' }
    });
    agDepositsAll.forEach(dep => accsAllTime.agDeps.in += Number(dep.amount || 0));

    vehicles.forEach(v => {
        const tr = v.metadata?.tracking || {};
        (tr.fuel || []).forEach(f => accsAllTime.vehicles.out += Number(f.totalCost || 0));
        (tr.maintenance || []).forEach(m => accsAllTime.vehicles.out += Number(m.cost || 0));
        (tr.insurance || []).forEach(i => accsAllTime.vehicles.out += Number(i.cost || 0));
        (tr.inspection || []).forEach(i => accsAllTime.vehicles.out += Number(i.cost || 0));
    });

    let totalInAll = 0; let totalOutAll = 0;
    Object.values(accsAllTime).forEach(s => { totalInAll += s.in; totalOutAll += s.out; });

    console.log("\n=== ALL TIME TOTALS ===");
    console.log({ totalIn: totalInAll, totalOut: totalOutAll, net: totalInAll - totalOutAll });
    console.log(accsAllTime);

}

run().finally(() => prisma.$disconnect());
