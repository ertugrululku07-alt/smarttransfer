const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
    const vehicleCount = await prisma.vehicle.count();
    console.log('VEHICLES:' + vehicleCount);

    // personnel.js likely filters by role or type. 
    // Let's check Users with role 'DRIVER' or Personnel table if exists. 
    // Checking Prisma schema would be ideal, but let's guess User first or Personnel.
    // Actually, let's just inspect the routes/personnel.js file to see where it reads from.

    await prisma.$disconnect();
}
check();
