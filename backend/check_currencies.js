const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const tenant = await prisma.tenant.findFirst();
    console.log(JSON.stringify(tenant.settings.definitions.currencies, null, 2));
}

main().finally(() => process.exit(0));
