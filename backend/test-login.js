// Test script to verify database and login
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function test() {
    try {
        console.log('🧪 Testing database connection...');

        // Test 1: Check if tenant exists
        const tenant = await prisma.tenant.findFirst({
            where: { slug: 'smarttravel-demo' }
        });
        console.log('✅ Tenant found:', tenant ? tenant.name : 'NOT FOUND');

        // Test 2: Check if admin user exists
        const admin = await prisma.user.findFirst({
            where: { email: 'admin@smarttravel.com' }
        });
        console.log('✅ Admin user found:', admin ? admin.email : 'NOT FOUND');

        if (admin) {
            // Test 3: Verify password
            const isPasswordValid = await bcrypt.compare('Admin123!', admin.passwordHash);
            console.log('✅ Password check:', isPasswordValid ? 'VALID' : 'INVALID');
            console.log('   Stored hash:', admin.passwordHash.substring(0, 20) + '...');

            // Test 4: Load with relations
            const userWithRelations = await prisma.user.findUnique({
                where: { id: admin.id },
                include: {
                    role: {
                        include: {
                            permissions: {
                                include: {
                                    permission: true
                                }
                            }
                        }
                    },
                    tenant: true
                }
            });

            console.log('✅ User with relations:');
            console.log('   Role:', userWithRelations.role.name);
            console.log('   Tenant:', userWithRelations.tenant.name);
            console.log('   Permissions:', userWithRelations.role.permissions.length);
        }

        console.log('\n✅ All tests passed!');

    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error('Full error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

test();
