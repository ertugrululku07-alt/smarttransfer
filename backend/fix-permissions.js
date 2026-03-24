// Quick fix: Add permissions to Super Admin role
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function fixPermissions() {
    try {
        console.log('🔧 Fixing permissions...');

        // Get Super Admin role
        const superAdminRole = await prisma.role.findFirst({
            where: { code: 'SUPER_ADMIN' }
        });

        if (!superAdminRole) {
            console.log('❌ Super Admin role not found!');
            return;
        }

        console.log('✅ Found Super Admin role:', superAdminRole.id);

        // Get all permissions
        const allPermissions = await prisma.permission.findMany();
        console.log('✅ Found', allPermissions.length, 'permissions');

        // Add all permissions to Super Admin
        for (const perm of allPermissions) {
            await prisma.rolePermission.upsert({
                where: {
                    roleId_permissionId: {
                        roleId: superAdminRole.id,
                        permissionId: perm.id
                    }
                },
                update: {},
                create: {
                    roleId: superAdminRole.id,
                    permissionId: perm.id
                }
            });
        }

        console.log('✅ Permissions added to Super Admin!');

        // Verify
        const count = await prisma.rolePermission.count({
            where: { roleId: superAdminRole.id }
        });

        console.log('✅ Total permissions for Super Admin:', count);

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

fixPermissions();
