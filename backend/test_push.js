require('dotenv').config({ path: '.env.production' });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
    const drivers = await prisma.user.findMany({
        where: { role: { code: 'DRIVER' } }
    });

    const user = drivers[0];
    if (!user) return console.log('No driver found');

    let metadata = user.metadata || {};
    if (typeof metadata === 'string') {
        try { metadata = JSON.parse(metadata); } catch (e) { }
    }

    const pushToken = metadata.expoPushToken;
    console.log('Push token found:', pushToken);

    if (pushToken) {
        console.log('Sending test push notification...');
        try {
            const res = await fetch('https://exp.host/--/api/v2/push/send', {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Accept-Encoding': 'gzip, deflate',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    to: pushToken,
                    sound: 'default',
                    title: 'Test Bildirimi!',
                    body: 'Sunucudan manuel tetiklenen test bildirimi.',
                    priority: 'high',
                    channelId: 'operations'
                })
            });
            const json = await res.json();
            console.log('Push API Response:');
            console.dir(json, { depth: null });
        } catch (e) {
            console.error('Fetch error:', e);
        }
    }
}
check().catch(console.error).finally(() => prisma.$disconnect());
