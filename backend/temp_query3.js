const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const tenant = await prisma.tenant.findUnique({
    where: { slug: 'smarttravel-demo' },
    select: { settings: true }
  });
  const pages = tenant?.settings?.pages || [];
  pages.forEach(p => console.log(p.slug, p.title));
  
  const page = pages.find(p => p.slug === 'kurumsal-cozumler' || p.title.includes('Kurumsal'));
  if (page) {
    console.log("Content:\n", JSON.stringify(page.content, null, 2));
  }
}

main().finally(() => prisma.$disconnect());
