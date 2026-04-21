require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const vts = await prisma.vehicleType.findMany({ select: { name: true, metadata: true } });
  for (const vt of vts) {
      console.log(`\n🚗 ${vt.name}:`);
      console.log(JSON.stringify(vt.metadata));
  }
}
main().catch(console.error).finally(() => prisma.$disconnect());
