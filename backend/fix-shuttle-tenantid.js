// Fix: assign tenantId to shuttle routes that have null tenantId
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Find routes with null tenantId
  const nullRoutes = await prisma.shuttleRoute.findMany({
    where: { tenantId: null },
    select: { id: true, fromName: true, toName: true }
  });
  
  if (nullRoutes.length === 0) {
    console.log('tenantId=null olan rota yok, sorun başka bir yerde.');
    return;
  }
  
  // Get the tenant
  const tenant = await prisma.tenant.findFirst({ select: { id: true, name: true } });
  console.log(`Tenant: ${tenant.name} (${tenant.id})`);
  console.log(`${nullRoutes.length} rota tenant'a atanacak:`, nullRoutes.map(r => `${r.fromName} → ${r.toName}`));
  
  // Update all null-tenant routes to this tenant
  const result = await prisma.shuttleRoute.updateMany({
    where: { tenantId: null },
    data: { tenantId: tenant.id }
  });
  
  console.log(`\n✅ ${result.count} rota güncellendi! Artık tenantId = ${tenant.id}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
