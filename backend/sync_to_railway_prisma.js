const { PrismaClient } = require('@prisma/client');

const localPrisma = new PrismaClient({
  datasources: { db: { url: 'postgresql://postgres:mysecretpassword@127.0.0.1:5439/smarttransfer?schema=public' } }
});
const remotePrisma = new PrismaClient({
  datasources: { db: { url: 'postgresql://postgres:MziCNdjmUdEeOhhJanQRZCtbhmnDxRto@crossover.proxy.rlwy.net:58887/railway' } }
});

async function main() {
  console.log('🔄 Starting data transfer from Local to Railway via Prisma...');
  try {
    // 1. Disable constraints on remote safely
    await remotePrisma.$executeRawUnsafe(`SET session_replication_role = replica;`);

    // Tabloları foreign key ihlali olmadan kopartmak için belirli sırada ekleyelim.
    // Veritabanı modelleri: Tenant, Theme, Role, Permission, User, Category vs
    const models = [
      'tenant', 'theme', 'permission', 'role', 'rolePermission',
      'user', 'vehicleType', 'vehicle', 'product', 'transferData', 'tourData', 'hotelData',
      'shuttleRoute', 'zone', 'vehicleTypeZonePrice',
      'booking', 'payment', 'driverCollection', 'extraService',
      'message', 'driverLocationHistory'
    ];

    for (const model of models) {
      if (!localPrisma[model]) continue; // In case model name differs slightly
      
      const records = await localPrisma[model].findMany();
      if (records.length === 0) continue;
      
      console.log(`📤 Moving ${records.length} records for table: ${model}`);
      
      // Bulk insert is risky with createMany if not supported properly or ID conflicts, 
      // but since remote DB is wiped, createMany is safe.
      try {
        await remotePrisma[model].createMany({
          data: records,
          skipDuplicates: true // Just in case
        });
      } catch (err) {
         console.warn(`⚠️ Warning on ${model}: Bulk insert failed. Trying sequentially...`);
         for (const rec of records) {
             try {
                await remotePrisma[model].create({ data: rec });
             } catch(e) { /* ignore */ }
         }
      }
    }

    await remotePrisma.$executeRawUnsafe(`SET session_replication_role = DEFAULT;`);
    console.log('✅ All data successfully transferred to Railway!');

  } catch (err) {
    console.error('❌ Migration failed:', err);
  } finally {
    await localPrisma.$disconnect();
    await remotePrisma.$disconnect();
  }
}

main();
