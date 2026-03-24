const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
    const roles = await prisma.role.findMany({
        where: { type: { in: ['TENANT_ADMIN', 'SUPER_ADMIN', 'ADMIN'] } }
    });
    console.log("Roles:", roles.map(r => ({ id: r.id, name: r.name, type: r.type, code: r.code })));

    const users = await prisma.user.findMany({
        where: { role: { type: { in: ['TENANT_ADMIN', 'SUPER_ADMIN', 'ADMIN'] } } },
        include: { role: true }
    });
    console.log("Users:", users.map(u => ({ email: u.email, roleType: u.role.type, roleCode: u.role.code })));
}
main().finally(() => prisma.$disconnect());
