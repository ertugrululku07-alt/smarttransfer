const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const vehicles = await prisma.vehicle.findMany({ select: { id: true, plateNumber: true, metadata: true } });
    console.log("--- Vehicles ---");
    for (const v of vehicles) {
        if (v.metadata?.driverId) {
            console.log(`Vehicle ${v.plateNumber}: driverId='${v.metadata.driverId}'`);
        }
    }
    
    const personnel = await prisma.personnel.findMany({ select: { id: true, firstName: true, lastName: true, userId: true } });
    console.log("\n--- Personnel ---");
    for (const p of personnel) {
        if (p.firstName === 'Ali' || p.firstName === 'ali') {
            console.log(`Personnel ${p.firstName} ${p.lastName}: id='${p.id}', userId='${p.userId}'`);
        }
    }
}
main().finally(() => prisma.$disconnect());
