// src/services/RouteService.js
// Calculates route distance and duration using OpenRouteService API
// Fallback: straight-line distance with average speed estimate

const https = require('https');
const http = require('http');

const ORS_API_KEY = process.env.ORS_API_KEY;
const ORS_BASE = 'https://api.openrouteservice.org';

// ---------------------------------------------------------------------------
// Geocode a text address to {lat, lng} using Nominatim (free, no key needed)
// ---------------------------------------------------------------------------
const geocodeAddress = (address) => {
    return new Promise((resolve, reject) => {
        const query = encodeURIComponent(address);
        const options = {
            hostname: 'nominatim.openstreetmap.org',
            path: `/search?q=${query}&format=json&limit=1`,
            method: 'GET',
            headers: {
                'User-Agent': 'SmartTransfer/1.0 (contact@smartransfer.com)'
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const results = JSON.parse(data);
                    if (results && results.length > 0) {
                        resolve({ lat: parseFloat(results[0].lat), lng: parseFloat(results[0].lon) });
                    } else {
                        reject(new Error(`Could not geocode: ${address}`));
                    }
                } catch (e) {
                    reject(e);
                }
            });
        });

        req.on('error', reject);
        req.setTimeout(8000, () => {
            req.destroy(new Error('Geocoding timeout'));
        });
        req.end();
    });
};

// ---------------------------------------------------------------------------
// Calculate route duration using OpenRouteService (if API key available)
// Returns { distanceKm, durationMinutes }
// ---------------------------------------------------------------------------
const getRouteFromORS = (fromLat, fromLng, toLat, toLng) => {
    return new Promise((resolve, reject) => {
        if (!ORS_API_KEY) {
            return reject(new Error('ORS_API_KEY not set'));
        }

        const body = JSON.stringify({
            coordinates: [[fromLng, fromLat], [toLng, toLat]],
            radiuses: [-1, -1]
        });

        const options = {
            hostname: 'api.openrouteservice.org',
            path: '/v2/directions/driving-car',
            method: 'POST',
            headers: {
                'Authorization': ORS_API_KEY,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body)
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    if (parsed.routes && parsed.routes.length > 0) {
                        const route = parsed.routes[0].summary;
                        resolve({
                            distanceKm: Math.round(route.distance / 1000 * 10) / 10,
                            durationMinutes: Math.round(route.duration / 60)
                        });
                    } else {
                        reject(new Error('No route found from ORS'));
                    }
                } catch (e) {
                    reject(e);
                }
            });
        });

        req.on('error', reject);
        req.setTimeout(10000, () => req.destroy(new Error('ORS timeout')));
        req.write(body);
        req.end();
    });
};

// ---------------------------------------------------------------------------
// Haversine fallback: straight-line distance, then apply 1.3 road factor
// ---------------------------------------------------------------------------
const haversineFallback = (lat1, lng1, lat2, lng2) => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLng / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const straightKm = R * c;
    const roadKm = straightKm * 1.35; // road factor
    const durationMinutes = Math.round(roadKm / 80 * 60); // assume avg 80 km/h
    return {
        distanceKm: Math.round(roadKm * 10) / 10,
        durationMinutes
    };
};

// ---------------------------------------------------------------------------
// Main exported function
// Input: pickup text, dropoff text
// Output: { distanceKm, durationMinutes, source: 'ors'|'haversine'|'default' }
// ---------------------------------------------------------------------------
const getRouteDuration = async (pickupText, dropoffText) => {
    if (!pickupText || !dropoffText) {
        return { distanceKm: 0, durationMinutes: 120, source: 'default' };
    }

    try {
        // 1. Geocode both locations
        const [from, to] = await Promise.all([
            geocodeAddress(pickupText),
            geocodeAddress(dropoffText)
        ]);

        // 2. Try ORS first
        if (ORS_API_KEY) {
            try {
                const result = await getRouteFromORS(from.lat, from.lng, to.lat, to.lng);
                console.log(`[RouteService] ORS: ${pickupText} → ${dropoffText}: ${result.distanceKm}km, ${result.durationMinutes}min`);
                return { ...result, source: 'ors' };
            } catch (orsErr) {
                console.warn('[RouteService] ORS failed, falling back to haversine:', orsErr.message);
            }
        }

        // 3. Haversine fallback
        const result = haversineFallback(from.lat, from.lng, to.lat, to.lng);
        console.log(`[RouteService] Haversine: ${pickupText} → ${dropoffText}: ${result.distanceKm}km, ${result.durationMinutes}min`);
        return { ...result, source: 'haversine' };

    } catch (err) {
        console.warn('[RouteService] Geocoding failed, using default 120 min:', err.message);
        return { distanceKm: 0, durationMinutes: 120, source: 'default' };
    }
};

module.exports = { getRouteDuration };
