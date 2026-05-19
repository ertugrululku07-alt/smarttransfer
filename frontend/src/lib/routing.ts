import axios from 'axios';
import flexpolyline from '@here/flexpolyline';
import { HERE_API_KEY } from './config';

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

/**
 * Geocode an address string using HERE Geocoding API
 */
export const geocodeAddress = async (address: string): Promise<GeocodeResult | null> => {
    if (!HERE_API_KEY) {
        console.warn('[routing] HERE API key not configured');
        return null;
    }

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
 * Great-circle (haversine) distance in kilometres between two points.
 * Used as a sanity-check baseline against routing API results.
 */
const haversineKm = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
    const R = 6371;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
};

/**
 * Calculate a road route between two address strings using HERE Routing.
 * Returns null when no usable land route exists, e.g. when the only path
 * crosses a sea (Alanya → Kıbrıs Ercan), so the caller can refuse to price
 * the trip instead of silently producing a misleading "ferry-routed" price.
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

        // 2. HERE Routing — explicitly reject ferry / car-shuttle segments so we
        //    only get true road routes. If no land route exists HERE returns
        //    no routes (or notices) and we treat the trip as unservable.
        const routerUrl =
            `https://router.hereapi.com/v8/routes` +
            `?transportMode=car` +
            `&origin=${pickupRes.lat},${pickupRes.lng}` +
            `&destination=${dropoffRes.lat},${dropoffRes.lng}` +
            `&avoid[features]=ferry,carShuttleTrain` +
            `&return=summary,polyline,routeHandle` +
            `&apiKey=${HERE_API_KEY}`;
        const res = await axios.get(routerUrl);

        if (!res.data.routes || res.data.routes.length === 0) {
            console.warn('[routing] No road route found (probably no land connection)');
            return null;
        }

        const route = res.data.routes[0];
        const section = route.sections?.[0];
        if (!section || !section.summary) return null;

        // Reject HERE responses that still include ferry / impossible segments
        // (e.g. when avoid was relaxed by the router). The notices array reports
        // when the requested avoidance could not be honoured.
        const notices: any[] = section.notices || route.notices || [];
        const blockingNotice = notices.find(n =>
            ['violatedFerry', 'violatedCarShuttleTrain', 'violatedAvoidFeatures', 'noRouteFound']
                .includes(n.code)
        );
        if (blockingNotice) {
            console.warn('[routing] Rejecting route — HERE notice:', blockingNotice.code);
            return null;
        }

        const distanceKm = Number((section.summary.length / 1000).toFixed(1));
        const durationMin = Math.round(section.summary.duration / 60);

        // Sanity check: if the road route is more than 6× the great-circle
        // distance, the result almost certainly snakes around a sea / dead-end
        // (e.g. driving Anatolia → Syria → Lebanon to reach an island). Refuse.
        const directKm = haversineKm(
            pickupRes.lat, pickupRes.lng,
            dropoffRes.lat, dropoffRes.lng
        );
        if (directKm > 30 && distanceKm > directKm * 6) {
            console.warn(`[routing] Rejecting route — ratio ${distanceKm}/${directKm.toFixed(0)} too high; no realistic land path`);
            return null;
        }

        const decoded = flexpolyline.decode(section.polyline);
        const coords: [number, number][] = decoded.polyline.map((p: any) => [p[0], p[1]]);

        return {
            distanceKm,
            durationMin,
            coords,
            encodedPolyline: section.polyline
        };
    } catch (err) {
        console.error('HERE Routing error:', err);
        return null;
    }
};
