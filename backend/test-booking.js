const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkBooking() {
    try {
        const booking = await prisma.booking.findFirst({
            where: { bookingNumber: 'B2B428253' },
            include: {
                agency: true,
                customer: {
                    include: { agency: true }
                }
            }
        });

        console.log(JSON.stringify(booking, null, 2));

        // Also check how the API builds the response:
        console.log('API mapping agencyName ->', booking?.agency?.companyName || booking?.customer?.agency?.companyName || booking?.metadata?.agencyName || 'NULL');

    } catch (error) {
        console.error(error);
    } finally {
        await prisma.$disconnect();
    }
}

checkBooking();
