const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
    console.log("Fetching zones for Van...");
    const van = await prisma.vehicle.findFirst({
        where: { vehicleType: { name: 'Van' }},
        include: { zonePrices: { include: { zone: true } } }
    });
    console.dir(van.zonePrices, { depth: null });
}
main().finally(() => process.exit(0));
