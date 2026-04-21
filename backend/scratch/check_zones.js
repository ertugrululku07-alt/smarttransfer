require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // 1. Check zone prices via Prisma model
  const zonePrices = await prisma.zonePrice.findMany({
    include: {
      vehicleType: { select: { name: true } },
      zone: { select: { name: true, code: true } }
    }
  });
  console.log('\n=== ZONE PRICES ===');
  zonePrices.forEach(zp => {
    console.log(`  ${zp.vehicleType.name} | Zone: ${zp.zone.name} (${zp.zone.code}) | base: ${zp.baseLocation} | fixed: ${zp.fixedPrice} | price: ${zp.price} | extraKm: ${zp.extraKmPrice}`);
  });

  // 2. Check vehicle types
  const types = await prisma.vehicleType.findMany({
    select: { id: true, name: true, capacity: true, metadata: true },
    orderBy: { order: 'asc' }
  });
  console.log('\n=== VEHICLE TYPES ===');
  types.forEach(t => {
    console.log(`  ${t.name} (cap=${t.capacity}) openingFee=${t.metadata?.openingFee} basePricePerKm=${t.metadata?.basePricePerKm}`);
  });

  // 3. Check zones
  const zones = await prisma.zone.findMany({
    select: { id: true, name: true, code: true, keywords: true }
  });
  console.log('\n=== ZONES ===');
  zones.forEach(z => console.log(`  ${z.name} (code=${z.code}) keywords=${z.keywords}`));

  // 4. Check shuttle routes
  const shuttles = await prisma.shuttleRoute.findMany({
    where: { isActive: true },
    select: { fromName: true, toName: true, pricePerSeat: true, maxSeats: true, metadata: true }
  });
  console.log('\n=== SHUTTLE ROUTES ===');
  shuttles.forEach(s => console.log(`  ${s.fromName} → ${s.toName} (${s.pricePerSeat}/seat, max=${s.maxSeats}) meta.toHubCode=${s.metadata?.toHubCode}`));

  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
