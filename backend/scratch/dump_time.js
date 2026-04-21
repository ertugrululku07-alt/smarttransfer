require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const tenant = await prisma.tenant.findFirst({ select: { settings: true } });
  console.log(JSON.stringify(tenant.settings.timeDefinitions, null, 2));
}
main().catch(console.error).finally(() => prisma.$disconnect());
