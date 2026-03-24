'use client';

import React, { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Circle, Polygon, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

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

// Component to catch map events for drawing and marker placement
const MapEventCatcher: React.FC<{ 
    drawingMode: 'circle' | 'polygon'; 
    onMapClick: (pos: L.LatLng) => void;
}> = ({ drawingMode, onMapClick }) => {
    useMapEvents({
        click(e) {
            onMapClick(e.latlng);
        }
    });
    return null;
};

// Component to handle dynamic center updates
const MapCenterUpdater: React.FC<{ center: { lat: number; lng: number } }> = ({ center }) => {
    const map = useMap();
    useEffect(() => {
        map.setView([center.lat, center.lng]);
    }, [center, map]);
    return null;
};

// Component to fix gray map tiles issue inside Modals
const MapInvalidator: React.FC = () => {
    const map = useMap();
    useEffect(() => {
        // Trigger invalidateSize a few times while the modal animation is running
        const timeouts = [100, 300, 500].map(ms => 
            setTimeout(() => map.invalidateSize(), ms)
        );
        return () => timeouts.forEach(clearTimeout);
    }, [map]);
    return null;
};

interface HereAdminMapPickerProps {
    center: { lat: number; lng: number };
    markerPosition: { lat: number; lng: number };
    radius: number;
    drawingMode: 'circle' | 'polygon';
    polygonPath: { lat: number; lng: number }[];
    onMapClick: (pos: { lat: number; lng: number }) => void;
    onMarkerDragEnd: (pos: { lat: number; lng: number }) => void;
    onPolygonClick: (pos: { lat: number; lng: number }) => void;
}

const HereAdminMapPicker: React.FC<HereAdminMapPickerProps> = ({ 
    center, 
    markerPosition, 
    radius, 
    drawingMode, 
    polygonPath, 
    onMapClick, 
    onMarkerDragEnd,
    onPolygonClick 
}) => {
    const apiKey = process.env.NEXT_PUBLIC_HERE_API_KEY || 'RH04HVBUK6By3GfYWwVlCOG4Or1IzV-rRjygQRHbIvo';
    const tileUrl = `https://maps.hereapi.com/v3/base/mc/{z}/{x}/{y}/png8?apiKey=${apiKey}&size=256&style=explore.day`;
    const attribution = '&copy; <a href="https://here.com">HERE</a>';

    const markerRef = useRef<L.Marker>(null);

    const handleDragEnd = () => {
        const marker = markerRef.current;
        if (marker != null) {
            const pos = marker.getLatLng();
            onMarkerDragEnd({ lat: pos.lat, lng: pos.lng });
        }
    };

    const handleMapClickInternal = (latlng: L.LatLng) => {
        if (drawingMode === 'polygon') {
            onPolygonClick({ lat: latlng.lat, lng: latlng.lng });
        } else {
            onMapClick({ lat: latlng.lat, lng: latlng.lng });
        }
    };

    return (
        <MapContainer 
            center={[center.lat, center.lng]} 
            zoom={14} 
            style={{ width: '100%', height: '100%', borderRadius: '12px' }}
            zoomControl={false}
        >
            <TileLayer
                attribution={attribution}
                url={tileUrl}
            />
            <MapCenterUpdater center={center} />
            <MapInvalidator />
            <MapEventCatcher drawingMode={drawingMode} onMapClick={handleMapClickInternal} />
            
            {/* Draw Circle overlay for radius selection */}
            {drawingMode === 'circle' && (
                <Circle 
                    center={[markerPosition.lat, markerPosition.lng]} 
                    radius={radius} 
                    pathOptions={{ color: '#1890ff', fillColor: '#1890ff', fillOpacity: 0.35 }}
                />
            )}
            
            {/* Draw Polygon if points exist */}
            {drawingMode === 'polygon' && polygonPath.length > 0 && (
                <Polygon 
                    positions={polygonPath.map(p => [p.lat, p.lng])} 
                    pathOptions={{ color: '#1890ff', fillColor: '#1890ff', fillOpacity: 0.35, weight: 2 }}
                />
            )}

            <Marker
                position={[markerPosition.lat, markerPosition.lng]}
                draggable={drawingMode === 'circle'}
                eventHandlers={{ dragend: handleDragEnd }}
                ref={markerRef}
            />
        </MapContainer>
    );
};

export default HereAdminMapPicker;
