const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
    const passengers = 1;
    const distance = 59.3;
    const typeMult = 1;
    let agencyMarkup = 0;
    
    const vehicleTypes = await prisma.vehicleType.findMany({
        where: { capacity: { gte: passengers } },
        include: {
            vehicles: {
                where: { status: 'ACTIVE' },
                include: { zonePrices: true }
            }
        }
    });

    console.log("Types found:", vehicleTypes.length);
    if(vehicleTypes.length > 0) console.log("Vehicles in Type:", vehicleTypes[0].vehicles.length);

    const typeResults = vehicleTypes
        .filter(vt => vt.vehicles && vt.vehicles.length > 0)
        .map(vt => {
            let calculatedPrice;
            const firstVehicle = vt.vehicles[0];
            let zonePriceConfig = null; // No zones for Kemer

            const openingFee = firstVehicle?.metadata?.openingFee;
            const pricePerKmField = firstVehicle?.metadata?.basePricePerKm;
            
            console.log("openingFee:", openingFee, "typeof:", typeof openingFee);
            console.log("pricePerKmField:", pricePerKmField, "typeof:", typeof pricePerKmField);
            
            const hasValidFallback = (openingFee != null && Number(openingFee) > 0) || 
                                     (pricePerKmField != null && Number(pricePerKmField) > 0);
            
            console.log("hasValidFallback:", hasValidFallback);
                                     
            if (!hasValidFallback) {
                return null;
            }
            
            const basePrice = openingFee ? Number(openingFee) : 0; 
            const pricePerKm = pricePerKmField ? Number(pricePerKmField) : 0;
            
            const dist = distance ? Number(distance) : 50;
            calculatedPrice = Math.round((basePrice + (dist * pricePerKm)) * typeMult);

            return {
                id: vt.id,
                price: calculatedPrice
            };
        }).filter(Boolean);
        
    console.log("Final typeResults:", typeResults);
}

run().catch(console.error).finally(() => prisma.$disconnect());
