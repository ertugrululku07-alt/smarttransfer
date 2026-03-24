const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
    console.log("Fetching vehicles...");
    const vs = await prisma.vehicle.findMany({ include: { zonePrices: true } });
    console.log(JSON.stringify(vs, null, 2));
}
main().finally(() => window.process.exit());
