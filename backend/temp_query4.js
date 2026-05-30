const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const tenants = await prisma.tenant.findMany();
  console.log("Tenants:", tenants.map(t => t.slug));
  
  for (const tenant of tenants) {
    const pages = tenant.settings?.pages || [];
    if (pages.length > 0) {
      console.log(`Tenant: ${tenant.slug}`);
      pages.forEach(p => console.log(p.slug, p.title));
      
      const page = pages.find(p => p.slug === 'kurumsal-cozumler' || p.title.includes('Kurumsal') || p.title.includes('hizmet'));
      if (page) {
        console.log("Content:\n", JSON.stringify(page.content, null, 2));
      }
    }
  }
}

main().finally(() => prisma.$disconnect());
