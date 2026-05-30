const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const tenant = await prisma.tenant.findUnique({
    where: { slug: 'smarttravel-demo' },
    select: { settings: true }
  });
  const pages = tenant?.settings?.pages || [];
  const hizmetlerimiz = pages.find(p => p.slug === 'hizmetlerimiz');
  
  if (hizmetlerimiz) {
    console.log("Content length:", hizmetlerimiz.content?.length);
    console.log("Content:\n", JSON.stringify(hizmetlerimiz.content, null, 2));
  } else {
    console.log("Page 'hizmetlerimiz' not found.");
  }
}

main().finally(() => prisma.$disconnect());
