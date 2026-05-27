'use client';

import React, { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, Polygon, useMap, Polyline } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export interface FleetMapMarker {
  id: string;
  plate: string;
  brand?: string;
  model?: string;
  lat: number;
  lng: number;
  speed?: number;
  heading?: number;
  status: 'live' | 'recent' | 'offline';
  timestamp?: string;
  minutesAgo?: number | null;
}

export interface FleetGeofence {
  id: string;
  name: string;
  type: 'CIRCLE' | 'POLYGON';
  centerLat?: number | null;
  centerLng?: number | null;
  radiusM?: number | null;
  polygon?: number[][] | null;
  color?: string | null;
}

interface FleetLiveMapProps {
  markers: FleetMapMarker[];
  geofences?: FleetGeofence[];
  route?: { lat: number; lng: number }[];
  selectedId?: string | null;
  onSelect?: (marker: FleetMapMarker | null) => void;
  height?: number | string;
}

const STATUS_COLOR: Record<string, string> = {
  live: '#10b981',
  recent: '#f59e0b',
  offline: '#94a3b8',
};

function createVehicleIcon(status: string, speed = 0, selected = false): L.DivIcon {
  const color = STATUS_COLOR[status] || STATUS_COLOR.offline;
  const size = selected ? 48 : 40;
  const ring = selected ? `box-shadow:0 0 0 4px ${color}55,0 0 14px ${color}88;` : '';
  return L.divIcon({
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
    html: `
      <div style="position:relative;width:${size}px;height:${size}px;">
        <div style="position:absolute;inset:0;border-radius:50%;background:${color};border:3px solid #fff;${ring}
          display:flex;align-items:center;justify-content:center;">
          <svg width="${size * 0.45}" height="${size * 0.45}" viewBox="0 0 24 24" fill="#fff">
            <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99z"/>
          </svg>
        </div>
        <div style="position:absolute;bottom:-3px;right:-3px;background:#0f172a;color:#fff;font-size:9px;font-weight:800;
          padding:1px 4px;border-radius:8px;border:1.5px solid #fff;font-family:monospace;">${Math.round(speed || 0)}</div>
      </div>`,
  });
}

function FitBounds({ markers, route }: { markers: FleetMapMarker[]; route?: { lat: number; lng: number }[] }) {
  const map = useMap();
  useEffect(() => {
    const pts: [number, number][] = [];
    markers.forEach((m) => pts.push([m.lat, m.lng]));
    route?.forEach((p) => pts.push([p.lat, p.lng]));
    if (pts.length === 0) return;
    if (pts.length === 1) {
      map.setView(pts[0], 14);
      return;
    }
    map.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 15 });
  }, [map, markers, route]);
  return null;
}

export default function FleetLiveMap({
  markers,
  geofences = [],
  route,
  selectedId,
  onSelect,
  height = 420,
}: FleetLiveMapProps) {
  const center = useMemo(() => {
    if (markers.length) return [markers[0].lat, markers[0].lng] as [number, number];
    return [36.8969, 30.7133] as [number, number];
  }, [markers]);

  return (
    <div style={{ height, borderRadius: 12, overflow: 'hidden', border: '1px solid #e2e8f0' }}>
      <MapContainer center={center} zoom={11} style={{ height: '100%', width: '100%' }} scrollWheelZoom>
        <TileLayer
          attribution='&copy; OpenStreetMap'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBounds markers={markers} route={route} />

        {geofences.map((gf) => {
          const color = gf.color || '#6366f1';
          if (gf.type === 'CIRCLE' && gf.centerLat != null && gf.centerLng != null && gf.radiusM) {
            return (
              <Circle
                key={gf.id}
                center={[gf.centerLat, gf.centerLng]}
                radius={gf.radiusM}
                pathOptions={{ color, fillColor: color, fillOpacity: 0.12, weight: 2 }}
              />
            );
          }
          if (gf.type === 'POLYGON' && Array.isArray(gf.polygon) && gf.polygon.length >= 3) {
            const positions = gf.polygon.map((p) => [p[0], p[1]] as [number, number]);
            return (
              <Polygon
                key={gf.id}
                positions={positions}
                pathOptions={{ color, fillColor: color, fillOpacity: 0.12, weight: 2 }}
              />
            );
          }
          return null;
        })}

        {route && route.length >= 2 && (
          <Polyline
            positions={route.map((p) => [p.lat, p.lng] as [number, number])}
            pathOptions={{ color: '#6366f1', weight: 4, opacity: 0.85 }}
          />
        )}

        {markers.map((m) => (
          <Marker
            key={m.id}
            position={[m.lat, m.lng]}
            icon={createVehicleIcon(m.status, m.speed || 0, selectedId === m.id)}
            eventHandlers={{ click: () => onSelect?.(m) }}
          >
            <Popup>
              <div style={{ minWidth: 160 }}>
                <div style={{ fontWeight: 800, fontSize: 14 }}>{m.plate}</div>
                <div style={{ fontSize: 12, color: '#64748b' }}>{m.brand} {m.model}</div>
                <div style={{ marginTop: 6, fontSize: 12 }}>
                  Hız: <b>{Math.round(m.speed || 0)} km/sa</b><br />
                  Durum: <b>{m.status === 'live' ? 'CANLI' : m.status === 'recent' ? 'YAKIN' : 'ÇEVRİMDIŞI'}</b>
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
