'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Button, InputNumber, Slider, Space, Tag } from 'antd';
import { MapContainer, TileLayer, Marker, Circle, Polygon, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export type GeofenceDrawType = 'CIRCLE' | 'POLYGON';

export interface GeofenceDrawValue {
  type: GeofenceDrawType;
  centerLat?: number | null;
  centerLng?: number | null;
  radiusM?: number | null;
  polygon?: number[][] | null;
  color?: string;
}

interface FleetGeofenceDrawerProps {
  value?: GeofenceDrawValue;
  onChange?: (value: GeofenceDrawValue) => void;
  height?: number;
}

const DEFAULT_CENTER = { lat: 36.8969, lng: 30.7133 };

function MapInvalidator() {
  const map = useMap();
  useEffect(() => {
    const t = [100, 300].map((ms) => setTimeout(() => map.invalidateSize(), ms));
    return () => t.forEach(clearTimeout);
  }, [map]);
  return null;
}

function MapClickHandler({
  drawType,
  onCircleClick,
  onPolygonClick,
}: {
  drawType: GeofenceDrawType;
  onCircleClick: (lat: number, lng: number) => void;
  onPolygonClick: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click(e) {
      if (drawType === 'CIRCLE') onCircleClick(e.latlng.lat, e.latlng.lng);
      else onPolygonClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function DraggableCenter({
  lat,
  lng,
  onMove,
}: {
  lat: number;
  lng: number;
  onMove: (lat: number, lng: number) => void;
}) {
  const ref = useRef<L.Marker>(null);
  return (
    <Marker
      ref={ref}
      position={[lat, lng]}
      draggable
      eventHandlers={{
        dragend: () => {
          const m = ref.current;
          if (!m) return;
          const p = m.getLatLng();
          onMove(p.lat, p.lng);
        },
      }}
    />
  );
}

export default function FleetGeofenceDrawer({ value, onChange, height = 340 }: FleetGeofenceDrawerProps) {
  const drawType = value?.type || 'CIRCLE';
  const color = value?.color || 'var(--brand-primary)';
  const [polygonDraft, setPolygonDraft] = useState<number[][]>(
    Array.isArray(value?.polygon) ? value!.polygon! : [],
  );

  useEffect(() => {
    if (drawType === 'POLYGON' && Array.isArray(value?.polygon)) {
      setPolygonDraft(value.polygon);
    }
  }, [drawType, value?.polygon]);

  const centerLat = value?.centerLat ?? DEFAULT_CENTER.lat;
  const centerLng = value?.centerLng ?? DEFAULT_CENTER.lng;
  const radiusM = value?.radiusM ?? 1000;

  const emit = (patch: Partial<GeofenceDrawValue>) => {
    onChange?.({
      type: drawType,
      centerLat,
      centerLng,
      radiusM,
      polygon: polygonDraft.length >= 3 ? polygonDraft : polygonDraft,
      color,
      ...patch,
    });
  };

  const onCircleClick = (lat: number, lng: number) => {
    emit({ type: 'CIRCLE', centerLat: lat, centerLng: lng });
  };

  const onPolygonClick = (lat: number, lng: number) => {
    const next = [...polygonDraft, [lat, lng]];
    setPolygonDraft(next);
    emit({ type: 'POLYGON', polygon: next });
  };

  const undoPoint = () => {
    const next = polygonDraft.slice(0, -1);
    setPolygonDraft(next);
    emit({ type: 'POLYGON', polygon: next });
  };

  const clearPolygon = () => {
    setPolygonDraft([]);
    emit({ type: 'POLYGON', polygon: [] });
  };

  const finishPolygon = () => {
    if (polygonDraft.length < 3) return;
    emit({ type: 'POLYGON', polygon: polygonDraft });
  };

  const mapCenter: [number, number] = drawType === 'CIRCLE'
    ? [centerLat, centerLng]
    : polygonDraft[0]
      ? [polygonDraft[0][0], polygonDraft[0][1]]
      : [DEFAULT_CENTER.lat, DEFAULT_CENTER.lng];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
        <Space wrap size={[6, 6]}>
          <Tag color={drawType === 'CIRCLE' ? 'blue' : 'default'}>Daire: haritaya tıkla</Tag>
          <Tag color={drawType === 'POLYGON' ? 'green' : 'default'}>Poligon: nokta ekle</Tag>
          {drawType === 'POLYGON' && (
            <>
              <Button size="small" onClick={undoPoint} disabled={!polygonDraft.length}>Geri Al</Button>
              <Button size="small" onClick={clearPolygon} disabled={!polygonDraft.length}>Temizle</Button>
              <Button size="small" type="primary" onClick={finishPolygon} disabled={polygonDraft.length < 3}>Tamamla ({polygonDraft.length})</Button>
            </>
          )}
        </Space>
      </div>

      {drawType === 'CIRCLE' && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>Yarıçap: {radiusM} m · Merkez sürüklenebilir</div>
          <Slider min={100} max={50000} step={50} value={radiusM} onChange={(v) => emit({ radiusM: v })} />
          <Space style={{ marginTop: 6 }}>
            <span style={{ fontSize: 12 }}>Enlem</span>
            <InputNumber size="small" step={0.0001} value={centerLat} onChange={(v) => v != null && emit({ centerLat: Number(v) })} />
            <span style={{ fontSize: 12 }}>Boylam</span>
            <InputNumber size="small" step={0.0001} value={centerLng} onChange={(v) => v != null && emit({ centerLng: Number(v) })} />
          </Space>
        </div>
      )}

      <div style={{ height, borderRadius: 12, overflow: 'hidden', border: '1px solid #e2e8f0', cursor: drawType === 'POLYGON' ? 'crosshair' : 'pointer' }}>
        <MapContainer center={mapCenter} zoom={13} style={{ height: '100%', width: '100%' }} scrollWheelZoom>
          <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <MapInvalidator />
          <MapClickHandler drawType={drawType} onCircleClick={onCircleClick} onPolygonClick={onPolygonClick} />

          {drawType === 'CIRCLE' && (
            <>
              <Circle
                center={[centerLat, centerLng]}
                radius={radiusM}
                pathOptions={{ color, fillColor: color, fillOpacity: 0.2, weight: 2 }}
              />
              <DraggableCenter
                lat={centerLat}
                lng={centerLng}
                onMove={(lat, lng) => emit({ centerLat: lat, centerLng: lng })}
              />
            </>
          )}

          {drawType === 'POLYGON' && polygonDraft.length >= 2 && (
            <Polygon
              positions={polygonDraft.map((p) => [p[0], p[1]] as [number, number])}
              pathOptions={{ color, fillColor: color, fillOpacity: 0.2, weight: 2, dashArray: polygonDraft.length < 3 ? '6 6' : undefined }}
            />
          )}

          {drawType === 'POLYGON' && polygonDraft.map((p, i) => (
            <Marker key={`${p[0]}-${p[1]}-${i}`} position={[p[0], p[1]]} />
          ))}
        </MapContainer>
      </div>
    </div>
  );
}
