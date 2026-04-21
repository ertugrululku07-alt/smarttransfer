const { Pool } = require('pg');

const localPool = new Pool({ connectionString: 'postgresql://postgres:mysecretpassword@127.0.0.1:5439/smarttransfer?schema=public' });
const remotePool = new Pool({ connectionString: 'postgresql://postgres:MziCNdjmUdEeOhhJanQRZCtbhmnDxRto@crossover.proxy.rlwy.net:58887/railway' });

async function sync() {
  console.log('Connecting to databases...');
  const localClient = await localPool.connect();
  const remoteClient = await remotePool.connect();

  try {
    // 1. Get all tables
    const { rows } = await localClient.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename != '_prisma_migrations'");
    const tables = rows.map(r => r.tablename);

    // 2. Disable triggers on remote
    console.log('Disabled remote constraints (Replication Mode ON)...');
    await remoteClient.query('SET session_replication_role = replica');

    for (let table of tables) {
      const { rows: data } = await localClient.query(`SELECT * FROM "${table}"`);
      if (data.length === 0) continue;
      
      console.log(`Syncing table ${table} (${data.length} rows)...`);
      
      const columns = Object.keys(data[0]).map(c => `"${c}"`).join(', ');
      
      for (let row of data) {
         const values = Object.values(row).map(v => {
           if (v && typeof v === 'object' && !(v instanceof Date) && !Array.isArray(v)) {
             return JSON.stringify(v);
           }
           return v;
         });
         const placeholders = values.map((_, i) => `$${i+1}`).join(', ');
         await remoteClient.query(
            `INSERT INTO "${table}" (${columns}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
            values
         );
      }
    }

    // 3. Enable triggers back
    await remoteClient.query('SET session_replication_role = DEFAULT');
    console.log('Sync Complete! Remote constraints enabled.');

  } catch (err) {
    console.error('Error during sync:', err);
  } finally {
    localClient.release();
    remoteClient.release();
  }
}
sync();
