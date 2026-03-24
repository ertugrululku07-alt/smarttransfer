const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        console.log('🌱 Starting reproduction script...');

        // 1. Get Tenant ID (assuming admin user)
        const user = await prisma.user.findFirst({
            where: { email: 'admin@smarttravel.com' }
        });

        if (!user) {
            console.error('❌ Admin user not found');
            return;
        }

        const tenantId = user.tenantId;
        console.log(`Using Tenant ID: ${tenantId}`);

        // 2. Fetch current settings
        const currentTenant = await prisma.tenant.findUnique({
            where: { id: tenantId },
            select: { settings: true }
        });
        console.log('Current Settings:', JSON.stringify(currentTenant.settings, null, 2));

        // 3. Construct payload simulating frontend request
        // Frontend sends: { heroBackground: { type: 'video', videoUrl: '...' } }
        const heroBackground = {
            type: 'video',
            videoUrl: 'X-Z12VYZNec' // ID from screenshot
        };

        const currentSettings = currentTenant.settings || {};

        // Logic from tenant.js
        const newSettings = {
            ...currentSettings,
            googleMaps: {
                ...currentSettings.googleMaps,
                // googleMaps is undefined in this specific request if only calling for background
            },
            heroBackground: heroBackground ? {
                ...currentSettings.heroBackground,
                ...heroBackground
            } : currentSettings.heroBackground
        };

        console.log('New Settings Payload:', JSON.stringify(newSettings, null, 2));

        // 4. Attempt Update
        const updated = await prisma.tenant.update({
            where: { id: tenantId },
            data: { settings: newSettings },
            select: { settings: true }
        });
        const fs = require('fs');
        fs.writeFileSync('reproduce_output.txt', '✅ Update Successful! ' + JSON.stringify(updated.settings, null, 2));
        console.log('✅ Update Successful!', JSON.stringify(updated.settings, null, 2));

    } catch (e) {
        const fs = require('fs');
        fs.writeFileSync('reproduce_output.txt', '❌ Update Failed: ' + e.message + '\n' + JSON.stringify(e, null, 2));
        console.error('❌ Update Failed:', e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
