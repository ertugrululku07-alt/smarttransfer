const { Client } = require('pg');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
    console.error('DATABASE_URL env var is required');
    process.exit(1);
}

async function tryTruncate() {
  const client = new Client({
    connectionString: connectionString,
    connectionTimeoutMillis: 5000,
  });

  try {
    console.log(`[${new Date().toLocaleTimeString()}] Bağlanmaya çalışılıyor...`);
    await client.connect();
    console.log('Bağlantı kuruldu! Truncate işlemi başlatılıyor...');
    
    // TRUNCATE işlemi tabloyu tamamen boşaltır ve yer açar
    await client.query('TRUNCATE TABLE "DriverLocationHistory" RESTART IDENTITY CASCADE;');
    
    console.log('✅ BAŞARILI! GPS kayıtları silindi ve yer açıldı.');
    process.exit(0);
  } catch (err) {
    console.log(`❌ Hata: ${err.message}`);
  } finally {
    await client.end().catch(() => {});
  }
}

// Her 0.5 saniyede bir dene
console.log('Acil durum temizlik döngüsü başlatıldı. Veritabanı nefes aldığı an müdahale edilecek...');
setInterval(tryTruncate, 500);
