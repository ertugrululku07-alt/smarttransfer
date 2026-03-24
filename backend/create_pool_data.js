const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    // Get a tenant (assuming one exists)
    const tenant = await prisma.tenant.findFirst();
    if (!tenant) {
        console.log("No tenant found. Please create a tenant first.");
        return;
    }

    const poolBookings = [
        {
            bookingNumber: `POOL-${Date.now()}-1`,
            tenantId: tenant.id,
            productType: 'TRANSFER',
            startDate: new Date(Date.now() + 86400000), // Tomorrow
            endDate: new Date(Date.now() + 86400000 + 3600000),
            adults: 2,
            subtotal: 1200,
            tax: 0,
            serviceFee: 0,
            total: 1200,
            currency: 'TRY',
            status: 'CONFIRMED',
            paymentStatus: 'PAID',
            contactName: 'Mehmet Demir',
            contactEmail: 'mehmet@example.com',
            contactPhone: '+90 555 111 2233',
            metadata: {
                vehicleType: 'Sedan',
                pickup: 'Antalya Havalimanı',
                dropoff: 'Lara Hotel',
                operationalStatus: 'POOL'
            }
        },
        {
            bookingNumber: `POOL-${Date.now()}-2`,
            tenantId: tenant.id,
            productType: 'TRANSFER',
            startDate: new Date(Date.now() + 172800000), // Day after tomorrow
            endDate: new Date(Date.now() + 172800000 + 3600000),
            adults: 4,
            subtotal: 2500,
            tax: 0,
            serviceFee: 0,
            total: 2500,
            currency: 'TRY',
            status: 'CONFIRMED',
            paymentStatus: 'PAID',
            contactName: 'Ayşe Yılmaz',
            contactEmail: 'ayse@example.com',
            contactPhone: '+90 555 444 5566',
            metadata: {
                vehicleType: 'Vito',
                pickup: 'Belek',
                dropoff: 'Antalya Havalimanı',
                operationalStatus: 'POOL'
            }
        }
    ];

    for (const booking of poolBookings) {
        await prisma.booking.create({
            data: booking
        });
    }

    console.log("Seed data created successfully.");
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
