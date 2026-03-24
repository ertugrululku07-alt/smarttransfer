const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkInvoices() {
    const tenant = await prisma.tenant.findUnique({
        where: { slug: 'smarttravel-demo' },
        select: { metadata: true }
    });

    const invoices = tenant?.metadata?.invoices || [];
    console.log(`Found ${invoices.length} total invoices in Tenant metadata. invoices:`,
        invoices.slice(-1).map(i => ({ no: i.invoiceNo, buyer: i.buyerInfo?.fullName || i.buyerInfo?.companyName, status: i.status }))
    );
    await prisma.$disconnect();
}
checkInvoices();
