/**
 * import-data.js
 * Imports JSON exports into the new Neon.tech PostgreSQL database.
 * 
 * Run AFTER setting DATABASE_URL to the Neon.tech connection string:
 *   node import-data.js
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function importData() {
    console.log('🚀 Starting data import to Neon.tech...');

    const exportDir = path.join(__dirname, 'db-export');

    // Import order matters due to foreign key constraints
    const importOrder = [
        'tenant', 'role', 'permission', 'rolePermission', 'user',
        'theme', 'vehicleType', 'vehicle', 'product',
        'transferData', 'tourData', 'hotelData',
        'booking', 'payment', 'message', 'account', 'bank',
        'personnel', 'shuttleRoute', 'refreshToken', 'session'
    ];

    for (const model of importOrder) {
        const filePath = path.join(exportDir, `${model}.json`);
        if (!fs.existsSync(filePath)) {
            console.warn(`⚠️  No export file for ${model}, skipping`);
            continue;
        }

        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        if (data.length === 0) {
            console.log(`⏭️  No data for ${model}`);
            continue;
        }

        try {
            // Convert date strings back to Date objects
            const processed = data.map(row => {
                const newRow = { ...row };
                for (const [key, val] of Object.entries(newRow)) {
                    if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(val)) {
                        newRow[key] = new Date(val);
                    }
                }
                return newRow;
            });

            await prisma[model].createMany({
                data: processed,
                skipDuplicates: true
            });
            console.log(`✅ Imported ${data.length} records into ${model}`);
        } catch (err) {
            console.error(`❌ Error importing ${model}: ${err.message}`);
        }
    }

    await prisma.$disconnect();
    console.log('\n✅ Import complete!');
}

importData().catch(console.error);
