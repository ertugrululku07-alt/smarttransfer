const turf = require('@turf/turf');

function testTurf() {
    const pt = turf.point([31.9998, 36.5438]); // [lng, lat]
    // A simple polygon
    const polyCoords = [[
        [32.0, 36.5],
        [32.1, 36.5],
        [32.1, 36.6],
        [32.0, 36.6],
        [32.0, 36.5]
    ]];
    const poly = turf.polygon(polyCoords);

    // Is there a pointToLineDistance?
    try {
        const polygonBoundary = turf.polygonToLine(poly);
        const distance = turf.pointToLineDistance(pt, polygonBoundary, { units: 'kilometers' });
        console.log("Distance from point to polygon edge:", distance);
    } catch (e) {
        console.error(e);
    }
}
testTurf();
