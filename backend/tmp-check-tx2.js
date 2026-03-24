const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
    const txs = await prisma.transaction.findMany({
        orderBy: { date: 'desc' },
        take: 10
    });
    console.log(JSON.stringify(txs, null, 2));
}

check().catch(console.error).finally(() => prisma.$disconnect());
