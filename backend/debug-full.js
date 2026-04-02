const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // All tenants
  const tenants = await prisma.tenant.findMany({ select: { id: true, name: true, slug: true } });
  console.log('Tenants:', tenants);
  
  // All shuttle routes (all tenants)
  const routes = await prisma.shuttleRoute.findMany({ select: { id: true, fromName: true, toName: true, tenantId: true, departureTimes: true } });
  console.log('\nTüm ShuttleRoute\'lar:', JSON.stringify(routes, null, 2));

  // Murat's booking metadata
  const murat = await prisma.booking.findFirst({
    where: { bookingNumber: 'TR-20260401-2358' },
    select: { id: true, contactName: true, metadata: true, tenantId: true }
  });
  if (murat) {
    console.log('\nMurat metadata:', JSON.stringify({ shuttleRouteId: murat.metadata?.shuttleRouteId, shuttleMasterTime: murat.metadata?.shuttleMasterTime, manualRunId: murat.metadata?.manualRunId, dropoff: murat.metadata?.dropoff }, null, 2));
  }
  
  // Sami's booking metadata (current)
  const sami = await prisma.booking.findFirst({
    where: { bookingNumber: 'TR-20260401-5536' },
    select: { id: true, contactName: true, metadata: true, tenantId: true }
  });
  if (sami) {
    console.log('\nSami metadata:', JSON.stringify({ shuttleRouteId: sami.metadata?.shuttleRouteId, shuttleMasterTime: sami.metadata?.shuttleMasterTime, manualRunId: sami.metadata?.manualRunId, dropoff: sami.metadata?.dropoff }, null, 2));
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
