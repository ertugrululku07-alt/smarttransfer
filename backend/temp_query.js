const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const page = await prisma.page.findFirst({
    where: { slug: 'hizmetlerimiz' }
  });
  console.log(JSON.stringify(page?.content));
}

main().finally(() => prisma.$disconnect());
