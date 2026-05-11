const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    // Get all tenants
    const tenants = await prisma.tenant.findMany({ select: { id: true, name: true, slug: true } });
    console.log('Tenants:', JSON.stringify(tenants, null, 2));

    // Get agency with its tenantId
    const agency = await prisma.agency.findFirst({ select: { id: true, name: true, tenantId: true } });
    console.log('\nAgency:', JSON.stringify(agency, null, 2));

    // Get transactions and their tenantId
    const txs = await prisma.transaction.findMany({
        where: { accountId: { startsWith: 'agency-' } },
        select: { id: true, tenantId: true, accountId: true, description: true },
        take: 5
    });
    console.log('\nTransaction tenantIds:', JSON.stringify(txs, null, 2));

    // Check if agency.tenantId matches transaction.tenantId
    if (agency && txs.length > 0) {
        const match = agency.tenantId === txs[0].tenantId;
        console.log(`\nAgency tenantId: ${agency.tenantId}`);
        console.log(`Transaction tenantId: ${txs[0].tenantId}`);
        console.log(`Match: ${match}`);
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
