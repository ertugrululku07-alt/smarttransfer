require('dotenv').config({ path: '.env.production' });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
    const drivers = await prisma.user.findMany({
        where: { role: { code: 'DRIVER' } }
    });
    const user = drivers[0];
    let metadata = user.metadata || {};
    if (typeof metadata === 'string') {
        try { metadata = JSON.parse(metadata); } catch (e) { }
    }
    const pushToken = metadata.expoPushToken;
    if (pushToken) {
        try {
            const res = await fetch('https://exp.host/--/api/v2/push/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ to: pushToken, title: 'Test', body: 'Test' })
            });
            const json = await res.json();
            console.log('Error Detail:', json?.data?.[0]?.details?.error || JSON.stringify(json));
        } catch (e) { }
    }
}
check().finally(() => prisma.$disconnect());
