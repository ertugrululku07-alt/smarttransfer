require('dotenv').config({ path: '.env.production' });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
    const drivers = await prisma.user.findMany({
        where: { role: { code: 'DRIVER' } }
    });
    console.log(`Found ${drivers.length} drivers`);
    for (const d of drivers) {
        console.log(`- ${d.fullName} (${d.email}): metadata =`, JSON.stringify(d.metadata));
    }
}
check().catch(console.error).finally(() => prisma.$disconnect());
