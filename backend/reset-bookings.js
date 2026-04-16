const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('🧹 Starting Booking Reset (ALL DATA)...');

    try {
        // 1. Delete Payments (Foreign key constraint)
        const d1 = await prisma.payment.deleteMany({});
        console.log(`✅ Deleted ${d1.count} payment records`);

        // 2. Delete/Unlink Messages
        const d2 = await prisma.message.deleteMany({
            where: { bookingId: { not: null } }
        });
        console.log(`✅ Deleted ${d2.count} booking-related messages`);

        // 3. Delete Driver Collections
        const d3 = await prisma.driverCollection.deleteMany({
            where: { bookingId: { not: null } }
        });
        console.log(`✅ Deleted ${d3.count} driver collection records`);

        // 4. Update Speed Violations (Unlink)
        const u1 = await prisma.speedViolation.updateMany({
            where: { bookingId: { not: null } },
            data: { bookingId: null }
        });
        console.log(`✅ Unlinked ${u1.count} speed violations`);

        // 5. Delete Bookings (This will cascade to BookingItems)
        const d4 = await prisma.booking.deleteMany({});
        console.log(`✅ Deleted ${d4.count} booking records (and associated items)`);

        // 6. Optional: Clean up Transactions linked to bookings
        // We'll delete transactions of type related to sales/payments
        const d5 = await prisma.transaction.deleteMany({
            where: {
                OR: [
                    { type: 'SALES_INVOICE' },
                    { type: 'PAYMENT_RECEIVED' }
                ]
            }
        });
        console.log(`✅ Deleted ${d5.count} invoice/payment transactions from accounting`);

        console.log('\n🎉 Database reset successful! The booking-related tables are now empty.');
    } catch (error) {
        console.error('❌ Reset failed:', error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
