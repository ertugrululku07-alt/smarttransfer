const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
    try {
        console.log('Testing User query...');
        const tenant = await prisma.tenant.findFirst();
        if (!tenant) {
            console.log('No tenant found');
            return;
        }
        console.log('Using tenant:', tenant.id);
        
        const users = await prisma.user.findMany({
            where: { tenantId: tenant.id },
            select: {
                id: true,
                email: true,
                fullName: true,
                role: { select: { type: true } }
            },
            take: 5
        });
        
        console.log('Users found:', users.length);
        console.log('First user:', users[0] ? { id: users[0].id, email: users[0].email, fullName: users[0].fullName, role: users[0].role?.type } : 'None');
        
    } catch (err) {
        console.error('DATABASE ERROR:', err);
    } finally {
        await prisma.$disconnect();
    }
}

test();
