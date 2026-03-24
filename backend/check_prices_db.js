const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const prisma = new PrismaClient();
async function main() {
  const prices = await prisma.zonePrice.findMany({ include: { zone: true } });
  fs.writeFileSync('db_out.json', JSON.stringify(prices, null, 2));
}
main().finally(() => process.exit(0));
