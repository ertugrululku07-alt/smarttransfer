const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const user = await prisma.user.findFirst({
        where: { role: { code: 'DRIVER' } },
        select: { fullName: true, metadata: true }
    });
    console.log(JSON.stringify(user, null, 2));
}

main()
    .catch(e => console.error(e))
    .finally(() => prisma.$disconnect());
