const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const turf = require('@turf/turf');

async function check() {
    const zones = await prisma.zone.findMany();
    for (const zone of zones) {
        if (!zone.polygon) continue;
        let polyCoords = zone.polygon.map(p => [p.lng, p.lat]);
        if (polyCoords[0][0] !== polyCoords[polyCoords.length - 1][0] || 
            polyCoords[0][1] !== polyCoords[polyCoords.length - 1][1]) {
            polyCoords.push(polyCoords[0]);
        }
        const zonePolygon = turf.polygon([polyCoords]);
        const bbox = turf.bbox(zonePolygon);
        console.log(`Zone ${zone.name} BBox: [MinLng: ${bbox[0]}, MinLat: ${bbox[1]}, MaxLng: ${bbox[2]}, MaxLat: ${bbox[3]}]`);
    }
}
check().catch(console.error).finally(() => prisma.$disconnect());
