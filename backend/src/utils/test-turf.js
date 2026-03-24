const turf = require('@turf/turf');

// Dummy route from (0,0) to (10,0) with points every 1 unit
const routeCoords = [];
for(let i=0; i<=10; i++) {
    routeCoords.push([i, 0]); // [lng, lat]
}

// Dummy zone polygon from x=2 to x=8, y=-1 to y=1
const polyCoords = [
    [2, -1], [8, -1], [8, 1], [2, 1], [2, -1]
];
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

console.log('distFromStart', distFromStart);
console.log('distFromEnd', distFromEnd);
console.log('overage', overage);
