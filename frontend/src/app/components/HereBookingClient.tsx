'use client';

import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import flexpolyline from '@here/flexpolyline';
import 'leaflet/dist/leaflet.css';
import { Spin } from 'antd';

// Fix Leaflet's default icon paths for Next.js
const icon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  tooltipAnchor: [16, -28],
  shadowSize: [41, 41]
});
L.Marker.prototype.options.icon = icon;

// Component to handle dynamic center/bounds updates
const MapBoundsUpdater: React.FC<{ bounds: L.LatLngBounds | null }> = ({ bounds }) => {
  const map = useMap();
  useEffect(() => {
    if (bounds && bounds.isValid()) {
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [bounds, map]);
  return null;
};

interface HereBookingClientProps {
  pickup: string;
  dropoff: string;
  onDistanceCalculated?: (distance: string, duration: string) => void;
}

const HereBookingClient: React.FC<HereBookingClientProps> = ({ pickup, dropoff, onDistanceCalculated }) => {
  const [routeCoords, setRouteCoords] = useState<[number, number][]>([]);
  const [loading, setLoading] = useState(false);
  const [markers, setMarkers] = useState<{lat: number, lng: number}[]>([]);
  const [mapBounds, setMapBounds] = useState<L.LatLngBounds | null>(null);

  const apiKey = process.env.NEXT_PUBLIC_HERE_API_KEY || 'RH04HVBUK6By3GfYWwVlCOG4Or1IzV-rRjygQRHbIvo';
  const tileUrl = `https://maps.hereapi.com/v3/base/mc/{z}/{x}/{y}/png8?apiKey=${apiKey}&size=256&style=explore.day`;
  const attribution = '&copy; <a href="https://here.com">HERE</a>';

  useEffect(() => {
    if (!pickup || !dropoff) return;
    
    let isMounted = true;
    
    const fetchRoute = async () => {
      setLoading(true);
      try {
        const geocodeAddress = async (address: string) => {
          const res = await fetch(`https://geocode.search.hereapi.com/v1/geocode?q=${encodeURIComponent(address)}&apiKey=${apiKey}`);
          if (!res.ok) throw new Error("Geocoding failed");
          const data = await res.json();
          if (data.items && data.items.length > 0) {
             return data.items[0].position;
          }
          throw new Error("Address not found");
        };

        const originPos = await geocodeAddress(pickup);
        const destPos = await geocodeAddress(dropoff);

        const oLat = originPos.lat;
        const oLng = originPos.lng;
        const dLat = destPos.lat;
        const dLng = destPos.lng;
        
        if (isMounted) setMarkers([{lat: oLat, lng: oLng}, {lat: dLat, lng: dLng}]);
        
        // Fetch HERE Routing
        const routeUrl = `https://router.hereapi.com/v8/routes?transportMode=car&origin=${oLat},${oLng}&destination=${dLat},${dLng}&return=summary,polyline&apiKey=${apiKey}`;
        
        const response = await fetch(routeUrl);
        const data = await response.json();
        
        if (data.routes && data.routes.length > 0) {
           const route = data.routes[0];
           const section = route.sections[0];
           
           // Decode flexpolyline
           const decoded = flexpolyline.decode(section.polyline);
           const coords: [number, number][] = decoded.polyline.map((p: any) => [p[0], p[1]]);
           
           if (isMounted) {
             setRouteCoords(coords);
             
             // Format distance and duration
             const distanceM = section.summary.length;
             const durationS = section.summary.duration;
             
             const distanceText = distanceM > 1000 ? `${(distanceM / 1000).toFixed(1)} km` : `${distanceM} m`;
             const hours = Math.floor(durationS / 3600);
             const mins = Math.floor((durationS % 3600) / 60);
             const durationText = hours > 0 ? `${hours} saat ${mins} dk` : `${mins} dk`;
             
             if (onDistanceCalculated) {
                onDistanceCalculated(distanceText, durationText);
             }
             
             // Update Map Bounds
             const bounds = L.latLngBounds(coords);
             setMapBounds(bounds);
           }
        } else {
           if (onDistanceCalculated && isMounted) onDistanceCalculated('Hesaplanamadı', 'Hesaplanamadı');
        }
      } catch (err) {
        console.error("Routing error: ", err);
        if (onDistanceCalculated && isMounted) onDistanceCalculated('Hesaplanamadı', 'Hesaplanamadı');
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    
    fetchRoute();
    
    return () => { isMounted = false; };
  }, [pickup, dropoff, apiKey]); // removed onDistanceCalculated to prevent infinite re-render loops

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {loading && (
        <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            zIndex: 1000,
            width: '100%',
            height: '100%',
            background: 'rgba(255,255,255,0.7)',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '8px'
        }}>
            <Spin />
            <div style={{ fontSize: '12px' }}>Rota Hesaplanıyor...</div>
        </div>
      )}
      <MapContainer 
        center={[41.0082, 28.9784]} 
        zoom={10} 
        style={{ width: '100%', height: '100%', borderRadius: '8px', zIndex: 1 }}
        zoomControl={true}
      >
        <TileLayer
          attribution={attribution}
          url={tileUrl}
        />
        {mapBounds && <MapBoundsUpdater bounds={mapBounds} />}
        {routeCoords.length > 0 && <Polyline positions={routeCoords} color="#1890ff" weight={5} opacity={0.7} />}
        {markers.map((pos, idx) => (
          <Marker key={idx} position={[pos.lat, pos.lng]} />
        ))}
      </MapContainer>
    </div>
  );
};

export default HereBookingClient;
