const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
    const tenantId = '00000000-0000-0000-0000-000000000001';
    const dateFrom = new Date(new Date().setDate(1));
    dateFrom.setHours(0, 0, 0, 0);
    const dateTo = new Date('2099-12-31T23:59:59.999Z');

    const t = await prisma.tenant.findUnique({ where: { id: tenantId } });
    const meta = t.metadata;

    // Simulate /accounts
    let accs = [];
    (meta.kasaEntries || []).filter(e => { const d = new Date(e.date); return d >= dateFrom && d <= dateTo; }).forEach(e => accs.push({ id: e.id, in: e.direction === 'IN' ? Number(e.amount) : 0, out: e.direction === 'OUT' ? Number(e.amount) : 0 }));
    const bookings = await prisma.booking.findMany({ where: { tenantId, createdAt: { gte: dateFrom, lte: dateTo }, status: { not: 'CANCELLED' } } });
    bookings.forEach(b => accs.push({ id: `b-${b.id}`, in: Number(b.total || 0), out: 0 }));
    const invoices = (meta.invoices || []).filter(inv => { const d = new Date(inv.invoiceDate || inv.createdAt); return inv.status === 'APPROVED' && inv.invoiceType === 'SALES' && d >= dateFrom && d <= dateTo; });
    invoices.forEach(inv => accs.push({ id: `i-${inv.id}`, in: Number(inv.grandTotal || 0), out: 0 }));
    const txs = await prisma.transaction.findMany({ where: { tenantId, date: { gte: dateFrom, lte: dateTo }, type: { in: ['PAYMENT_RECEIVED', 'PAYMENT_SENT', 'SALARY', 'MANUAL_IN', 'MANUAL_OUT'] } } });
    txs.forEach(tx => accs.push({ id: `t-${tx.id}`, in: tx.isCredit ? Number(tx.amount) : 0, out: !tx.isCredit ? Number(tx.amount) : 0 }));
    const agDeposits = await prisma.agencyDeposit.findMany({ where: { tenantId, status: 'APPROVED', OR: [{ updatedAt: { gte: dateFrom, lte: dateTo } }, { createdAt: { gte: dateFrom, lte: dateTo } }] } });
    agDeposits.forEach(dep => accs.push({ id: `d-${dep.id}`, in: Number(dep.amount || 0), out: 0 }));
    const vehicles = await prisma.vehicle.findMany({ where: { tenantId } });
    vehicles.forEach(v => {
        const tr = v.metadata?.tracking || {};
        (tr.fuel || []).filter(x => { const d = new Date(x.date); return d >= dateFrom && d <= dateTo; }).forEach(f => accs.push({ id: `v-f-${f.id}`, in: 0, out: Number(f.totalCost || 0) }));
        (tr.maintenance || []).filter(x => { const d = new Date(x.date); return d >= dateFrom && d <= dateTo; }).forEach(m => accs.push({ id: `v-m-${m.id}`, in: 0, out: Number(m.cost || 0) }));
        (tr.insurance || []).filter(x => { const d = new Date(x.startDate); return d >= dateFrom && d <= dateTo; }).forEach(i => accs.push({ id: `v-i-${i.id}`, in: 0, out: Number(i.cost || 0) }));
        (tr.inspection || []).filter(x => { const d = new Date(x.date); return d >= dateFrom && d <= dateTo; }).forEach(i => accs.push({ id: `v-x-${i.id}`, in: 0, out: Number(i.cost || 0) }));
    });

    // Simulate /entries -> totals is just sum over rows, so identical loop
    // But let's see why my local "This Month" IN is 555712, but UI "This Month" IN is 553212
    // Difference is 2500 TL!
    console.log("Looking for 2500 TL diff...");
    const diff2500 = txs.filter(t => Number(t.amount) === 2500);
    console.log("Txs equal to 2500:", diff2500.map(t => ({ id: t.id, type: t.type, amount: t.amount, isCredit: t.isCredit })));
}
run().finally(() => window ? null : prisma.$disconnect());
