const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
    const t = await prisma.tenant.findFirst();
    const agTx = t.metadata?.agencyTransactions || [];
    console.log("Tenant Agency Tx Count: ", agTx.length);
    console.log(JSON.stringify(agTx.filter(x => x.amount >= 400000), null, 2));
}

check().catch(console.error).finally(() => prisma.$disconnect());
