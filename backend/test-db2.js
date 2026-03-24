const { PrismaClient } = require('@prisma/client');

async function test() {
    const prisma = new PrismaClient();
    const id = "partner-0fad6bec-9abf-47e8-ac78-3b2868b627bf";
    const tenantId = "00000000-0000-0000-0000-000000000001";

    const tx = await prisma.transaction.findMany({
        where: { tenantId, accountId: id },
        orderBy: { date: 'asc' }
    });
    console.log("Found transactions for account:", tx.length);
    if (tx.length > 0) { console.log(tx[0]); }

    await prisma.$disconnect();
}
test().catch(console.error);
