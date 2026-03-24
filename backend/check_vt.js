const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const activeTenantId = '67d544af-8b17-43ca-9382-fddba4c20fcb'; // Assuming from logs
  const passengers = 1;

  const vehicleTypes = await prisma.vehicleType.findMany({
    where: {
      capacity: {
        gte: Number(passengers)
      },
    },
    include: {
      vehicles: {
        where: { status: 'ACTIVE' },
        include: { zonePrices: true }
      },
      _count: {
        select: { vehicles: true }
      }
    }
  });

  console.log(`Found ${vehicleTypes.length} vehicle types`);
  
  if (vehicleTypes.length > 0) {
     const vt = vehicleTypes[0];
     console.log(`Type: ${vt.name}, Vehicles count: ${vt.vehicles.length}, Count meta: ${vt._count.vehicles}`);
     
     // What does filter do?
     const typeResults = vehicleTypes.filter(vt => vt.vehicles && vt.vehicles.length > 0);
     console.log(`After filter: ${typeResults.length}`);
  }
}
main().finally(() => process.exit(0));
