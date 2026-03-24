const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const turf = require('@turf/turf');

// Replace with actual decoding if needed, or just mock the route points roughly from Antalya to Manavgat
const routeCoords = [
  // AYT: 36.8986, 30.7333
  // Manavgat: 36.7865, 31.4429
  // Points along the straight line:
  [30.7333, 36.8986],
  [31.0000, 36.8500],
  [31.2000, 36.8000],
  [31.4429, 36.7865]
];

async function check() {
    const zones = await prisma.zone.findMany();
    let zoneOverages = {};

    for (const zone of zones) {
        if (!zone.polygon || zone.polygon.length < 3) continue;
        
        let polyCoords = zone.polygon.map(p => [p.lng, p.lat]);
        if (polyCoords[0][0] !== polyCoords[polyCoords.length - 1][0] || 
            polyCoords[0][1] !== polyCoords[polyCoords.length - 1][1]) {
            polyCoords.push(polyCoords[0]);
        }
        
        const zonePolygon = turf.polygon([polyCoords]);
        
        let distFromStart = 0;
        let hitStart = false;
        for (let i = 0; i < routeCoords.length - 1; i++) {
            if (turf.booleanPointInPolygon(turf.point(routeCoords[i]), zonePolygon)) {
                hitStart = true;
                break;
            }
            distFromStart += turf.distance(turf.point(routeCoords[i]), turf.point(routeCoords[i+1]), { units: 'kilometers' });
        }
        if (!hitStart) distFromStart = Infinity;

        let distFromEnd = 0;
        let hitEnd = false;
        for (let i = routeCoords.length - 1; i > 0; i--) {
            if (turf.booleanPointInPolygon(turf.point(routeCoords[i]), zonePolygon)) {
                hitEnd = true;
                break;
            }
            distFromEnd += turf.distance(turf.point(routeCoords[i]), turf.point(routeCoords[i-1]), { units: 'kilometers' });
        }
        if (!hitEnd) distFromEnd = Infinity;

        const overage = Math.min(distFromStart, distFromEnd);
        
        console.log(`Zone: ${zone.name}, hitStart: ${hitStart}, hitEnd: ${hitEnd}, distStart: ${distFromStart}, distEnd: ${distFromEnd}, overage: ${overage}`);
        if (overage !== Infinity) {
            zoneOverages[zone.id] = overage;
        }
    }
    console.log("Final Overages:", zoneOverages);
}

check().catch(console.error).finally(() => prisma.$disconnect());
