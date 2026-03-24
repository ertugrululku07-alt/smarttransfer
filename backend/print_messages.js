const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const prisma = new PrismaClient();

async function main() {
    const messages = await prisma.message.findMany({
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: {
            sender: { select: { id: true, email: true, role: { select: { type: true, code: true } } } },
            receiver: { select: { id: true, email: true, role: { select: { type: true, code: true } } } }
        }
    });
    fs.writeFileSync('messages.json', JSON.stringify(messages, null, 2), 'utf8');
}

main().catch(console.error).finally(() => prisma.$disconnect());
