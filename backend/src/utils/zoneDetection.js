/**
 * Polygon-based zone detection utility.
 * Checks if a coordinate point falls inside zone polygons and returns the most specific (smallest area) zone code.
 */
const turf = require('@turf/turf');

/**
 * Detect zone code by checking if coordinates fall inside zone polygons.
 * Returns the most specific (smallest area) zone. Falls back to keyword detection.
 * @param {number|null} lat - Latitude
 * @param {number|null} lng - Longitude
 * @param {string} locationText - Address text (fallback for keyword detection)
 * @param {Array} zones - Zone records with polygon, code, name, keywords fields
 * @param {Array} hubs - Hub list for keyword fallback
 * @returns {string|null} - Zone code
 */
function detectRegionCodeByPolygon(lat, lng, locationText, zones, hubs) {
    // Try polygon-based detection first
    if (lat && lng && zones && zones.length > 0) {
        let bestCode = null;
        let smallestArea = Infinity;
        const point = turf.point([Number(lng), Number(lat)]);
        for (const zone of zones) {
            if (!zone.polygon || !Array.isArray(zone.polygon) || zone.polygon.length < 3) continue;
            if (!zone.code) continue;
            try {
                let polyCoords = zone.polygon.map(p => [p.lng, p.lat]);
                // Close polygon if not closed
                if (polyCoords[0][0] !== polyCoords[polyCoords.length - 1][0] ||
                    polyCoords[0][1] !== polyCoords[polyCoords.length - 1][1]) {
                    polyCoords.push(polyCoords[0]);
                }
                const poly = turf.polygon([polyCoords]);
                if (turf.booleanPointInPolygon(point, poly)) {
                    const area = turf.area(poly);
                    // Pick the smallest polygon (most specific zone)
                    if (area < smallestArea) {
                        smallestArea = area;
                        bestCode = zone.code;
                    }
                }
            } catch (e) { /* skip invalid polygon */ }
        }
        if (bestCode) return bestCode;
    }
    // Fallback: keyword-based detection
    return detectRegionCodeByKeyword(locationText, hubs);
}

/**
 * Keyword-based region code detection (fallback when no coordinates available)
 */
function detectRegionCodeByKeyword(locationText, hubs) {
    if (!locationText || !hubs || !Array.isArray(hubs)) return null;
    const trLower = (s) => (s || '').toLocaleLowerCase('tr');
    const text = trLower(locationText);
    const SKIP_WORDS = new Set(['havalimanı', 'havalimani', 'airport', 'havaalanı', 'merkez', 'center', 'terminal']);

    let bestCode = null;
    let bestPosition = Infinity;
    let bestLength = 0;

    for (const hub of hubs) {
        const keys = hub.keywords ? hub.keywords.split(',').map(k => trLower(k).trim()).filter(k => k) : [];
        keys.push(trLower(hub.code));
        if (hub.name) {
            const nameParts = trLower(hub.name).split(/[\s\/,]+/).filter(p => p.length >= 3 && !SKIP_WORDS.has(p));
            keys.push(...nameParts);
        }

        for (const k of keys) {
            const pos = text.indexOf(k);
            if (pos !== -1) {
                if (pos < bestPosition || (pos === bestPosition && k.length > bestLength)) {
                    bestCode = hub.code;
                    bestPosition = pos;
                    bestLength = k.length;
                }
            }
        }
    }
    return bestCode;
}

module.exports = { detectRegionCodeByPolygon, detectRegionCodeByKeyword };
