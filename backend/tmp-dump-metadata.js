const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
    const v = await prisma.vehicle.findFirst();
    console.log("Vehicle Metadata:", v.metadata);
    console.log("Type of metadata:", typeof v.metadata);
    console.log("openingFee:", v.metadata ? v.metadata.openingFee : undefined);
    console.log("basePricePerKm:", v.metadata ? v.metadata.basePricePerKm : undefined);
}
check().catch(console.error).finally(() => prisma.$disconnect());
