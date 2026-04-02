const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Find Sami booking
  const b = await prisma.booking.findFirst({
    where: { bookingNumber: 'TR-20260401-5536' },
    select: { id: true, bookingNumber: true, contactName: true, metadata: true, tenantId: true }
  });
  if (!b) { console.log('Booking bulunamadi!'); return; }
  console.log('Sami ID:', b.id);
  console.log('TenantId:', b.tenantId);
  console.log('Mevcut metadata:', JSON.stringify(b.metadata, null, 2));

  // Find aly-ayt route
  const routes = await prisma.shuttleRoute.findMany({ where: { tenantId: b.tenantId } });
  console.log('\nMevcut rotalar:', routes.map(r => ({ id: r.id, from: r.fromName, to: r.toName, times: r.departureTimes })));

  // Simulate the move: set shuttleRouteId and shuttleMasterTime
  // First figure out which route is "aly-ayt"
  const alyAyt = routes.find(r => (r.toName && r.toName.toLowerCase().includes('ayt')) || (r.fromName && r.fromName.toLowerCase().includes('aly')));
  if (!alyAyt) { console.log('\naly-ayt rotası bulunamadı. Tüm rotalar yukarıda.'); return; }
  
  console.log('\naly-ayt rotası:', alyAyt.id, alyAyt.fromName, '->', alyAyt.toName);
  
  // Now directly update Sami's metadata
  const updated = await prisma.booking.update({
    where: { id: b.id },
    data: {
      metadata: {
        ...(b.metadata || {}),
        shuttleRouteId: alyAyt.id,
        shuttleMasterTime: '12:00',
        manualRunId: null,
        manualRunName: null
      }
    }
  });
  console.log('\nGÜNCELLENDİ! Yeni metadata:');
  console.log('  shuttleRouteId:', updated.metadata.shuttleRouteId);
  console.log('  shuttleMasterTime:', updated.metadata.shuttleMasterTime);
}

main().catch(console.error).finally(() => prisma.$disconnect());
