const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const prices = await prisma.zonePrice.findMany({
    include: {
      zone: true
    }
  });
  console.log('Total prices:', prices.length);
  prices.forEach(p => {
    console.log(`Zone: ${p.zone?.name}, BaseLocation: '${p.baseLocation}', Price: ${p.price}`);
  });
}
main().finally(() => process.exit(0));
