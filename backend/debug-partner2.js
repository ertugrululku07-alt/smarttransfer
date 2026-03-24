const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
    const roles = await prisma.role.findMany({ where: { type: 'PARTNER' } });
    const pIds = roles.map(r => r.id);
    const partners = await prisma.user.findMany({
        where: { roleId: { in: pIds } },
        select: { id: true, balance: true, debit: true, credit: true, firstName: true, lastName: true }
    });
    console.log('ALL PARTNERS:', partners);
}
main().catch(console.error).finally(() => prisma.$disconnect());
