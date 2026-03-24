import axios from 'axios';
import flexpolyline from '@here/flexpolyline';

// Interfaces
export interface RouteDetails {
    distanceKm: number;
    durationMin: number;
    coords: [number, number][]; // [lat, lng] array for polylines
    encodedPolyline?: string; // HERE flexpolyline
}

export interface GeocodeResult {
    lat: number;
    lng: number;
    displayName: string;
}

const HERE_API_KEY = process.env.NEXT_PUBLIC_HERE_API_KEY || 'RH04HVBUK6By3GfYWwVlCOG4Or1IzV-rRjygQRHbIvo';

/**
 * Geocode an address string using HERE Geocoding API
 */
export const geocodeAddress = async (address: string): Promise<GeocodeResult | null> => {
    try {
        const cleanAddress = address.trim();
        
        const res = await axios.get(`https://geocode.search.hereapi.com/v1/geocode`, {
            params: {
                q: cleanAddress,
                apiKey: HERE_API_KEY,
                limit: 1
            }
        });

        if (res.data && res.data.items && res.data.items.length > 0) {
            const selected = res.data.items[0];
            return {
                lat: selected.position.lat,
                lng: selected.position.lng,
                displayName: selected.address.label
            };
        }

        return null;

    } catch (err) {
        console.error('HERE Geocoding error:', err);
        return null;
    }
};

/**
 * Calculate route between two address strings using HERE Routing API
 */
export const getRouteDetails = async (pickup: string, dropoff: string): Promise<RouteDetails | null> => {
    try {
        // 1. Geocode
        const pickupRes = await geocodeAddress(pickup);
        const dropoffRes = await geocodeAddress(dropoff);

        if (!pickupRes || !dropoffRes) {
            console.warn('HERE Geocoding failed for route addresses');
            return null;
        }

        // 2. HERE Routing
        const routerUrl = `https://router.hereapi.com/v8/routes?transportMode=car&origin=${pickupRes.lat},${pickupRes.lng}&destination=${dropoffRes.lat},${dropoffRes.lng}&return=summary,polyline&apiKey=${HERE_API_KEY}`;
        const res = await axios.get(routerUrl);

        if (res.data.routes && res.data.routes.length > 0) {
            const route = res.data.routes[0];
            const section = route.sections[0];

            // Decode flexpolyline to get coords
            const decoded = flexpolyline.decode(section.polyline);
            const coords: [number, number][] = decoded.polyline.map((p: any) => [p[0], p[1]]);

            return {
                distanceKm: Number((section.summary.length / 1000).toFixed(1)), // HERE gives meters
                durationMin: Math.round(section.summary.duration / 60), // HERE gives seconds
                coords: coords,
                encodedPolyline: section.polyline
            };
        }

        return null;

    } catch (err) {
        console.error('HERE Routing error:', err);
        return null;
    }
};
