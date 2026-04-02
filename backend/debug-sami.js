const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Find Sami's booking
  const bookings = await prisma.booking.findMany({
    where: {
      bookingNumber: { in: ['TR-20260401-5536', 'TR-20260401-6172', 'TR-20260401-2358'] }
    },
    select: { id: true, bookingNumber: true, contactName: true, metadata: true, startDate: true }
  });
  
  console.log('=== BOOKING METADATA ===');
  bookings.forEach(b => {
    console.log(`\n[${b.bookingNumber}] ${b.contactName}`);
    const m = b.metadata || {};
    console.log('  shuttleRouteId:', m.shuttleRouteId || '(yok)');
    console.log('  shuttleMasterTime:', m.shuttleMasterTime || '(yok)');
    console.log('  manualRunId:', m.manualRunId || '(yok)');
    console.log('  dropoff:', m.dropoff || '(yok)');
    console.log('  startDate:', b.startDate);
  });
  
  // Also show all shuttle routes
  const routes = await prisma.shuttleRoute.findMany({ select: { id: true, fromName: true, toName: true, departureTimes: true } });
  console.log('\n=== SHUTTLE ROUTES ===');
  routes.forEach(r => console.log(`  [${r.id}] ${r.fromName} → ${r.toName} | Saatler:`, r.departureTimes));
}

main().catch(console.error).finally(() => prisma.$disconnect());
