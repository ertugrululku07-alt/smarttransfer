const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({
    datasources: { db: { url: 'postgresql://neondb_owner:npg_lbBOwi3mf0rE@ep-super-smoke-albskb8r-pooler.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require' } }
});

async function main() {
  const zones = await prisma.zone.findMany({
      select: { name: true, code: true, keywords: true }
  });
  console.log("Prod Zones:", zones);
}
main().catch(console.error).finally(() => prisma.$disconnect());
