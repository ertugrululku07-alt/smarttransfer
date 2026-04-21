const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({
    datasources: { db: { url: 'postgresql://neondb_owner:npg_lbBOwi3mf0rE@ep-super-smoke-albskb8r-pooler.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require' } }
});

async function main() {
  const meta = await prisma.agencyContractMeta.findMany();
  console.log("AgencyContractMeta:", meta);
}
main().catch(console.error).finally(() => prisma.$disconnect());
