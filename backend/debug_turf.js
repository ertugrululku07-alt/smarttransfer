const { PrismaClient } = require('@prisma/client');
const turf = require('@turf/turf');
const flexpolyline = require('@here/flexpolyline');
const axios = require('axios');
const prisma = new PrismaClient();

const HERE_API_KEY = process.env.NEXT_PUBLIC_HERE_API_KEY || 'RH04HVBUK6By3GfYWwVlCOG4Or1IzV-rRjygQRHbIvo';

async function test() {
    const pickupLat = 36.900;
    const pickupLng = 30.797;
    const dropoffLat = 36.541;
    const dropoffLng = 31.996;

    const routerUrl = `https://router.hereapi.com/v8/routes?transportMode=car&origin=${pickupLat},${pickupLng}&destination=${dropoffLat},${dropoffLng}&return=summary,polyline&apiKey=${HERE_API_KEY}`;
    const rRes = await axios.get(routerUrl);
    const encodedPolyline = rRes.data.routes[0].sections[0].polyline;
    
    const decoded = flexpolyline.decode(encodedPolyline);
    const routeCoords = decoded.polyline.map(p => [p[1], p[0]]);
    
    const zones = await prisma.zone.findMany();
    
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

        console.log(`Zone: ${zone.name}`);
        console.log(`distFromStart: ${distFromStart}`);
        console.log(`distFromEnd: ${distFromEnd}`);
        const overage = Math.min(distFromStart, distFromEnd);
        console.log(`overage: ${overage}`);
    }
}
test().finally(() => process.exit(0));
