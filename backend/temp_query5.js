const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const tenants = await prisma.tenant.findMany({ select: { slug: true, id: true }});
  for (const t of tenants) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: t.id },
      select: { settings: true, slug: true }
    });
    const pages = tenant?.settings?.pages || [];
    if (pages.length > 0) {
      console.log(`\nPages in tenant ${t.slug}:`);
      for (const p of pages) {
        console.log(`- ${p.slug}: ${p.title}`);
        if (p.title.includes('Kurumsal')) {
           console.log("CONTENT FOUND:\n" + p.content.substring(0, 500) + "...\n");
        }
      }
    } else {
      console.log(`No pages for ${t.slug}`);
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
