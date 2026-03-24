const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        console.log('--- ROLES ---');
        const roles = await prisma.role.findMany();
        console.log(JSON.stringify(roles, null, 2));

        console.log('\n--- VEHICLE TYPES ---');
        const vTypes = await prisma.vehicleType.findMany();
        console.log(JSON.stringify(vTypes, null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
