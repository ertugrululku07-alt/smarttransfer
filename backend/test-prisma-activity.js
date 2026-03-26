const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
    try {
        if (prisma.activityLog) {
            console.log("ActivityLog is available!");
        } else {
            console.log("ActivityLog is NOT available in Prisma Client.");
        }
    } catch (err) {
        console.error(err);
    } finally {
        await prisma.$disconnect();
    }
}
test();
