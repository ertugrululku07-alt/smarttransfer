/**
 * export-data.js
 * Exports all data from the local PostgreSQL database to JSON files
 * so it can be imported into Neon.tech after migration.
 * 
 * Run: node export-data.js
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function exportData() {
    console.log('🚀 Starting data export...');

    const exportDir = path.join(__dirname, 'db-export');
    if (!fs.existsSync(exportDir)) {
        fs.mkdirSync(exportDir);
    }

    const models = [
        'tenant', 'role', 'permission', 'rolePermission', 'user',
        'refreshToken', 'session', 'theme', 'product', 'vehicleType',
        'vehicle', 'transferData', 'tourData', 'hotelData',
        'booking', 'payment', 'message', 'account', 'bank',
        'personnel', 'shuttleRoute'
    ];

    for (const model of models) {
        try {
            const data = await prisma[model].findMany();
            const filePath = path.join(exportDir, `${model}.json`);
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
            console.log(`✅ Exported ${data.length} records from ${model}`);
        } catch (err) {
            console.warn(`⚠️  Skipped ${model}: ${err.message}`);
        }
    }

    await prisma.$disconnect();
    console.log('\n✅ Export complete! Files saved to ./db-export/');
}

exportData().catch(console.error);
