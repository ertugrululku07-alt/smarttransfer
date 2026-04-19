const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const routes = await prisma.shuttleRoute.findMany({
    where: {
      fromName: { contains: 'Alanya', mode: 'insensitive' },
      toName: { contains: 'Antalya', mode: 'insensitive' }
    }
  });
  console.log(JSON.stringify(routes, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
