const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
    const txs = await prisma.transaction.findMany({
        where: { accountId: { startsWith: 'agency-' } },
        orderBy: { date: 'desc' },
        take: 5
    });
    console.log(JSON.stringify(txs, null, 2));
}

check().catch(console.error).finally(() => prisma.$disconnect());
