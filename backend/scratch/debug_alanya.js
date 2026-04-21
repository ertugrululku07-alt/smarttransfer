require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const types = await prisma.vehicleType.findMany({
    include: {
        zonePrices: {
            include: {
                zone: true
            }
        }
    }
  });

  console.log("Vehicle Types and Zone Prices:");
  for (const vt of types) {
      if (vt.zonePrices.length > 0) {
          console.log(`\n🚗 ${vt.name}:`);
          for (const zp of vt.zonePrices) {
              console.log(`  - Zone: ${zp.zone.name} | Base: ${zp.baseLocation} | Fixed: ${zp.fixedPrice} | ExtraKm: ${zp.extraKmPrice}`);
          }
      }
  }

  // Also print all Zones
  const zones = await prisma.zone.findMany();
  console.log("\nZones in DB:");
  for (const z of zones) {
      console.log(`  - ${z.id.substring(0, 8)}... | ${z.name} | Code: ${z.code}`);
  }
}
main().catch(console.error).finally(() => prisma.$disconnect());
