const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
    const v = await prisma.vehicle.findFirst({ orderBy: { updatedAt: 'desc' } });
    console.log("Metadata stringified:", JSON.stringify(v.metadata, null, 2));
}
main().catch(console.error).finally(() => prisma.$disconnect());
