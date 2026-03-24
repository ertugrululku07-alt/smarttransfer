const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
    const roles = await prisma.role.findMany();
    console.log("Roles:", roles.map(r => ({ id: r.id, code: r.code })));

    const users = await prisma.user.findMany({ include: { role: true }, take: 10 });
    console.log("Users:", users.map(u => ({ email: u.email, roleCode: u.role ? u.role.code : null })));
}
main().finally(() => prisma.$disconnect());
