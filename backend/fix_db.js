const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const vehicles = await prisma.vehicle.findMany();
    for(let v of vehicles) {
        let meta = v.metadata || {};
        meta.openingFee = 0;
        meta.basePricePerKm = 1.50; // Use basePricePerKm for Km Başı Fiyat!!
        meta.fixedPrice = 0; // Sabit Fiyat (0)
        meta.currency = 'EUR';
        
        await prisma.vehicle.update({
            where: { id: v.id },
            data: { metadata: meta }
        });
        console.log(`Updated ${v.name || v.brand} metadata.`);
    }
}
main().finally(() => process.exit(0));
