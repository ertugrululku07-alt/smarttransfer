const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        console.log('--- CHECKING TENANTS ---');
        const tenants = await prisma.tenant.findMany();
        console.log(JSON.stringify(tenants, null, 2));

        const demoTenant = await prisma.tenant.findUnique({
            where: { slug: 'smarttravel-demo' }
        });
        console.log('Demo Tenant:', demoTenant);

    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
