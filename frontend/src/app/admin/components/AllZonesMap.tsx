'use client';

import React, { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Polygon, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface Zone {
    id: string;
    name: string;
    code: string | null;
    color: string | null;
    polygon: { lat: number; lng: number }[] | null;
}

interface AllZonesMapProps {
    zones: Zone[];
    height?: number | string;
    onEditZone?: (zone: Zone) => void;
    onNewZone?: () => void;
}

// Auto-fit bounds to show all polygons
const FitBounds: React.FC<{ zones: Zone[] }> = ({ zones }) => {
    const map = useMap();
    const fitted = useRef(false);

    useEffect(() => {
        const allPoints: [number, number][] = [];
        zones.forEach(z => {
            if (z.polygon && z.polygon.length >= 3) {
                z.polygon.forEach(p => allPoints.push([p.lat, p.lng]));
            }
        });
        if (allPoints.length > 0) {
            const bounds = L.latLngBounds(allPoints);
            map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });
            fitted.current = true;
        }
    }, [zones, map]);

    return null;
};

// Fix gray tiles in modals / late renders
const MapInvalidator: React.FC = () => {
    const map = useMap();
    useEffect(() => {
        const timeouts = [100, 300, 600, 1000].map(ms =>
            setTimeout(() => map.invalidateSize(), ms)
        );
        return () => timeouts.forEach(clearTimeout);
    }, [map]);
    return null;
};

// Distinct color palette for auto-coloring zones that share the default blue
const ZONE_PALETTE = [
    '#3b82f6', // blue
    '#ef4444', // red
    '#10b981', // emerald
    '#f59e0b', // amber
    '#8b5cf6', // violet
    '#ec4899', // pink
    '#06b6d4', // cyan
    '#f97316', // orange
    '#14b8a6', // teal
    '#a855f7', // purple
    '#6366f1', // indigo
    '#84cc16', // lime
    '#e11d48', // rose
    '#0ea5e9', // sky
    '#d946ef', // fuchsia
    '#22c55e', // green
    '#eab308', // yellow
    '#64748b', // slate
];

const AllZonesMap: React.FC<AllZonesMapProps> = ({ zones, height = 600, onEditZone, onNewZone }) => {
    const apiKey = process.env.NEXT_PUBLIC_HERE_API_KEY || 'RH04HVBUK6By3GfYWwVlCOG4Or1IzV-rRjygQRHbIvo';
    const tileUrl = `https://maps.hereapi.com/v3/base/mc/{z}/{x}/{y}/png8?apiKey=${apiKey}&size=256&style=explore.day`;
    const attribution = '&copy; <a href="https://here.com">HERE</a>';

    const zonesWithPolygon = zones.filter(z => z.polygon && z.polygon.length >= 3);
    const zonesWithoutPolygon = zones.filter(z => !z.polygon || z.polygon.length < 3);

    // Auto-assign distinct colors: if many zones share the same default color, give each a unique one
    const defaultColor = '#3388ff';
    const sameColorCount = zonesWithPolygon.filter(z => !z.color || z.color === defaultColor).length;
    const needsAutoColor = sameColorCount > 1;

    const getZoneColor = (zone: Zone, index: number): string => {
        if (zone.color && zone.color !== defaultColor) return zone.color;
        if (needsAutoColor) return ZONE_PALETTE[index % ZONE_PALETTE.length];
        return zone.color || defaultColor;
    };

    // Default center: Antalya
    const defaultCenter: [number, number] = [36.89, 30.69];

    return (
        <div style={{ position: 'relative' }}>
            <div style={{
                borderRadius: 16, overflow: 'hidden',
                border: '1px solid #e2e8f0',
                boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
            }}>
                <MapContainer
                    center={defaultCenter}
                    zoom={9}
                    style={{ width: '100%', height: typeof height === 'number' ? `${height}px` : height }}
                    zoomControl={true}
                >
                    <TileLayer attribution={attribution} url={tileUrl} />
                    <MapInvalidator />
                    <FitBounds zones={zones} />

                    {zonesWithPolygon.map((zone, idx) => {
                        const color = getZoneColor(zone, idx);
                        const positions: [number, number][] = zone.polygon!.map(p => [p.lat, p.lng]);
                        // Alternate dash patterns so adjacent zones are visually distinct
                        const dashPatterns = ['', '8 4', '4 4', '12 6', '6 3 2 3'];
                        const dashArray = dashPatterns[idx % dashPatterns.length];
                        return (
                            <Polygon
                                key={zone.id}
                                positions={positions}
                                pathOptions={{
                                    color,
                                    fillColor: color,
                                    fillOpacity: 0.15,
                                    weight: 3,
                                    opacity: 0.9,
                                    dashArray: dashArray || undefined,
                                }}
                                eventHandlers={{
                                    click: () => onEditZone?.(zone),
                                    mouseover: (e) => {
                                        e.target.bringToFront();
                                        e.target.setStyle({ fillOpacity: 0.35, weight: 4, dashArray: '' });
                                    },
                                    mouseout: (e) => {
                                        e.target.setStyle({ fillOpacity: 0.15, weight: 3, dashArray: dashArray || undefined });
                                    },
                                }}
                            >
                                <Tooltip direction="center" permanent
                                    className="zone-label-tooltip"
                                >
                                    <div style={{
                                        display: 'flex', flexDirection: 'column',
                                        alignItems: 'center', gap: 2,
                                        cursor: onEditZone ? 'pointer' : 'default',
                                    }}>
                                        <span style={{
                                            fontWeight: 800, fontSize: 13,
                                            color: '#1a1a2e',
                                            textShadow: '0 1px 3px rgba(255,255,255,0.9), 0 0 6px rgba(255,255,255,0.8)',
                                            letterSpacing: '-0.3px',
                                        }}>
                                            {zone.name}
                                        </span>
                                        {zone.code && (
                                            <span style={{
                                                fontWeight: 700, fontSize: 10,
                                                color: '#fff',
                                                background: color,
                                                padding: '1px 7px', borderRadius: 4,
                                                letterSpacing: '0.5px',
                                            }}>
                                                {zone.code}
                                            </span>
                                        )}
                                        {onEditZone && (
                                            <span style={{ fontSize: 9, color: '#94a3b8', marginTop: 1 }}>
                                                ✏️ tıkla → düzenle
                                            </span>
                                        )}
                                    </div>
                                </Tooltip>
                            </Polygon>
                        );
                    })}
                </MapContainer>
            </div>

            {/* Legend */}
            <div style={{
                position: 'absolute', top: 12, right: 12, zIndex: 1000,
                background: 'rgba(255,255,255,0.95)', borderRadius: 12,
                padding: '12px 16px', boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                maxHeight: '50%', overflowY: 'auto', minWidth: 180,
                backdropFilter: 'blur(10px)',
            }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                    Bölgeler ({zonesWithPolygon.length}/{zones.length})
                </div>
                {zonesWithPolygon.map(z => (
                    <div key={z.id}
                        onClick={() => onEditZone?.(z)}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 8, padding: '5px 6px',
                            borderRadius: 6, cursor: onEditZone ? 'pointer' : 'default',
                            transition: 'background 0.15s',
                        }}
                        onMouseEnter={e => { if (onEditZone) e.currentTarget.style.background = '#f1f5f9'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                    >
                        <div style={{
                            width: 14, height: 14, borderRadius: 4,
                            background: getZoneColor(z, zonesWithPolygon.indexOf(z)),
                            border: '2px solid rgba(255,255,255,0.8)',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                            flexShrink: 0,
                        }} />
                        <span style={{ fontSize: 12, fontWeight: 600, color: '#1e293b', flex: 1 }}>{z.name}</span>
                        {z.code && <span style={{ fontSize: 10, color: '#94a3b8', fontFamily: 'monospace' }}>{z.code}</span>}
                        {onEditZone && <span style={{ fontSize: 11, color: '#94a3b8' }}>✏️</span>}
                    </div>
                ))}
                {zonesWithoutPolygon.length > 0 && (
                    <>
                        <div style={{ borderTop: '1px solid #f1f5f9', margin: '8px 0 6px' }} />
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#dc2626', marginBottom: 4 }}>
                            Poligonu Yok ({zonesWithoutPolygon.length})
                        </div>
                        {zonesWithoutPolygon.map(z => (
                            <div key={z.id}
                                onClick={() => onEditZone?.(z)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px',
                                    borderRadius: 6, cursor: onEditZone ? 'pointer' : 'default',
                                    transition: 'background 0.15s',
                                }}
                                onMouseEnter={e => { if (onEditZone) e.currentTarget.style.background = '#fef2f2'; }}
                                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                            >
                                <div style={{
                                    width: 10, height: 10, borderRadius: 3,
                                    border: '2px dashed #fca5a5', flexShrink: 0,
                                }} />
                                <span style={{ fontSize: 11, color: '#94a3b8', flex: 1 }}>{z.name}</span>
                                {onEditZone && <span style={{ fontSize: 11, color: '#dc2626' }}>✏️</span>}
                            </div>
                        ))}
                    </>
                )}
                {onNewZone && (
                    <>
                        <div style={{ borderTop: '1px solid #f1f5f9', margin: '8px 0 6px' }} />
                        <button
                            onClick={onNewZone}
                            style={{
                                width: '100%', padding: '8px 10px', borderRadius: 8,
                                border: '2px dashed #c7d2fe', background: '#eef2ff',
                                color: '#6366f1', fontWeight: 700, fontSize: 12,
                                cursor: 'pointer', transition: 'all 0.15s',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = '#e0e7ff'; e.currentTarget.style.borderColor = '#a5b4fc'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = '#eef2ff'; e.currentTarget.style.borderColor = '#c7d2fe'; }}
                        >
                            + Yeni Bölge Çiz
                        </button>
                    </>
                )}
            </div>

            {/* Global tooltip style override */}
            <style jsx global>{`
                .zone-label-tooltip {
                    background: rgba(255,255,255,0.88) !important;
                    border: none !important;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.1) !important;
                    border-radius: 8px !important;
                    padding: 4px 10px !important;
                    white-space: nowrap !important;
                }
                .zone-label-tooltip::before {
                    display: none !important;
                }
            `}</style>
        </div>
    );
};

export default AllZonesMap;
