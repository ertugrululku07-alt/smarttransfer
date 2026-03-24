const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
    const deps = await prisma.agencyDeposit.findMany({
        where: { amount: { gte: 400000 } }
    });
    console.log("AgencyDeposits:", JSON.stringify(deps, null, 2));

    // Also check transactions for this amount
    const txs = await prisma.transaction.findMany({
        where: { amount: { gte: 400000 } }
    });
    console.log("Transactions:", JSON.stringify(txs, null, 2));

    // Also check agency balance
    const ags = await prisma.agency.findMany({
        where: { balance: { gte: 400000 } }
    });
    console.log("Agencies:", JSON.stringify(ags, null, 2));
}

check().catch(console.error).finally(() => prisma.$disconnect());
