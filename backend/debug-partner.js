const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const p = await prisma.user.findFirst({
        where: { firstName: { contains: 'mustafa' } },
        select: { id: true, balance: true, debit: true, credit: true, firstName: true, lastName: true }
    });
    console.log('Partner State:', p);

    const t = await prisma.tenant.findFirst({ select: { metadata: true } });
    if (t?.metadata?.invoices) {
        const invs = t.metadata.invoices.filter(i =>
            i.buyerInfo?.accountId === 'partner-' + p.id ||
            i.sellerInfo?.accountId === 'partner-' + p.id
        );
        console.log('Invoices:', invs.map(i => ({ id: i.id, type: i.invoiceType, status: i.status, total: i.grandTotal })));
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
