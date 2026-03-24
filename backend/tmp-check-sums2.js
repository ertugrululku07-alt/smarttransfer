const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
    const tenantId = '00000000-0000-0000-0000-000000000001';
    const dateFrom = new Date('2026-03-01T00:00:00.000Z');
    const dateTo = new Date('2026-03-04T23:59:59.999Z');

    let tIn = 0; let tOut = 0;
    const t = await prisma.tenant.findUnique({ where: { id: tenantId } });
    const m = t.metadata;

    // Invoices
    const invs = (m.invoices || []).filter(i => {
        const d = new Date(i.invoiceDate || i.createdAt);
        return i.status === 'APPROVED' && i.invoiceType === 'SALES' && d >= dateFrom && d <= dateTo;
    });
    const iSum = invs.reduce((s, i) => s + Number(i.grandTotal || 0), 0);
    tIn += iSum;

    // Manual entries (Accounts) vs Manual Entries (Entries)
    // Entries does:
    const eManualIn = (m.kasaEntries || []).filter(e => {
        const d = new Date(e.date); return d >= dateFrom && d <= dateTo && e.direction === 'IN';
    }).reduce((s, e) => s + Number(e.amount || 0), 0);
    const eManualOut = (m.kasaEntries || []).filter(e => {
        const d = new Date(e.date); return d >= dateFrom && d <= dateTo && e.direction === 'OUT';
    }).reduce((s, e) => s + Number(e.amount || 0), 0);

    console.log({ invoices: iSum, manualIn: eManualIn, manualOut: eManualOut });

    // Let's check the date parsing difference between entries vs accounts
    // Accounts logic:
    let accManualIn = 0; let accManualOut = 0;
    (m.kasaEntries || []).filter(e => {
        const d = new Date(e.date);
        return d >= dateFrom && d <= dateTo;
    }).forEach(e => {
        if (e.direction === 'IN') accManualIn += Number(e.amount || 0);
        else accManualOut += Number(e.amount || 0);
    });

    console.log({ accManualIn, accManualOut });
}

run().finally(() => prisma.$disconnect());
