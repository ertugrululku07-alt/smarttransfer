'use client';

import React, { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
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

interface HereMapPickerProps {
  center: { lat: number; lng: number };
  markerPosition: { lat: number; lng: number };
  onMapClick: (pos: { lat: number; lng: number }) => void;
  onMarkerDragEnd: (pos: { lat: number; lng: number }) => void;
}

// A component to catch map events
const MapEventCatcher: React.FC<{ onMapClick: (pos: { lat: number; lng: number }) => void }> = ({ onMapClick }) => {
  useMapEvents({
    click(e) {
      onMapClick({ lat: e.latlng.lat, lng: e.latlng.lng });
    }
  });
  return null;
};

// Component to handle dynamic center updates
const MapCenterUpdater: React.FC<{ center: { lat: number; lng: number } }> = ({ center }) => {
  const map = useMapEvents({});
  useEffect(() => {
    map.setView([center.lat, center.lng]);
  }, [center, map]);
  return null;
};

// Component to handle modal resize invalidation
const MapResizer: React.FC = () => {
  const map = useMapEvents({});
  useEffect(() => {
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 250); // wait for modal animation
    return () => clearTimeout(timer);
  }, [map]);
  return null;
};

const HereMapPicker: React.FC<HereMapPickerProps> = ({ center, markerPosition, onMapClick, onMarkerDragEnd }) => {
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

  return (
    <MapContainer 
      center={[center.lat, center.lng]} 
      zoom={13} 
      style={{ width: '100%', height: '100%', borderRadius: '12px' }}
      zoomControl={true}
    >
      <TileLayer
        attribution={attribution}
        url={tileUrl}
      />
      <MapCenterUpdater center={center} />
      <MapResizer />
      <MapEventCatcher onMapClick={onMapClick} />
      <Marker
        position={[markerPosition.lat, markerPosition.lng]}
        draggable={true}
        eventHandlers={{ dragend: handleDragEnd }}
        ref={markerRef}
      />
    </MapContainer>
  );
};

export default HereMapPicker;
