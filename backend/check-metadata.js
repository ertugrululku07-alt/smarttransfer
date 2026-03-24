const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkAllVehicleMetadata() {
    const vehicles = await prisma.vehicle.findMany({
        select: { id: true, brand: true, model: true, plateNumber: true, metadata: true }
    });

    vehicles.forEach(v => {
        const t = v.metadata?.tracking;
        const ins = t?.insurance?.length || 0;
        const fuel = t?.fuel?.length || 0;
        const insp = t?.inspection?.length || 0;
        const maint = t?.maintenance?.length || 0;
        console.log(`${v.brand} ${v.model} [${v.plateNumber}] - ins:${ins} fuel:${fuel} insp:${insp} maint:${maint}`);
    });
    await prisma.$disconnect();
}
checkAllVehicleMetadata();
