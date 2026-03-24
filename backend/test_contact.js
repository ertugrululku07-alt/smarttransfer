const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    // Get a driver
    const driver = await prisma.user.findFirst({
        where: { role: { code: 'DRIVER' } }
    });

    if (!driver) {
        console.log("No driver found!");
        return;
    }

    const tenantId = driver.tenantId;
    console.log("Driver tenantId:", tenantId);

    try {
        // Run the contact logic
        const adminRoles = await prisma.role.findMany({
            where: {
                OR: [
                    { tenantId: tenantId, type: { in: ['TENANT_ADMIN', 'TENANT_MANAGER', 'TENANT_STAFF'] } },
                    { type: { in: ['SUPER_ADMIN', 'PLATFORM_OPS'] } },
                    { code: { in: ['ADMIN', 'OPERATION', 'SUPER_ADMIN', 'TENANT_ADMIN'] } }
                ]
            }
        });

        console.log("Admin Roles Found:", adminRoles.length);

        if (adminRoles.length > 0) {
            const roleIds = adminRoles.map(r => r.id);
            const adminUser = await prisma.user.findFirst({
                where: {
                    roleId: { in: roleIds },
                    status: 'ACTIVE',
                    tenantId: tenantId
                },
                select: { id: true, firstName: true, lastName: true, email: true, status: true, tenantId: true, roleId: true }
            });
            console.log("Admin User Found:", adminUser);
        }
    } catch (e) {
        console.error("FULL ERROR:", e);
    }
}
main().finally(() => prisma.$disconnect());
