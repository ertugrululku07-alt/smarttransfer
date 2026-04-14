'use client';

import React, { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, CircleMarker, Tooltip as LTooltip, Polyline } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export interface DriverMapData {
    driverId: string;
    driverName: string;
    lat: number;
    lng: number;
    speed: number;
    timestamp: string;
    heading: number;
    status: 'idle' | 'on_job' | 'speeding' | 'offline';
    currentJob?: { pickup?: string; dropoff?: string; contactName?: string; startDate?: string } | null;
    vehicle?: { plateNumber?: string; brand?: string; model?: string; color?: string } | null;
    speedViolations?: number;
}

interface HereLiveMapClientProps {
    drivers: DriverMapData[];
    selectedDriver: DriverMapData | null;
    onSelectDriver: (driver: DriverMapData | null) => void;
    routePoints?: { latitude: number; longitude: number; speed: number; timestamp: string }[];
}

const STATUS_CONFIG: Record<string, { markerColor: string; pulseColor: string; label: string }> = {
    on_job:   { markerColor: '#3b82f6', pulseColor: '#60a5fa', label: 'Seferde' },
    idle:     { markerColor: '#22c55e', pulseColor: '#4ade80', label: 'Boşta' },
    speeding: { markerColor: '#ef4444', pulseColor: '#f87171', label: 'Hız İhlali' },
    offline:  { markerColor: '#9ca3af', pulseColor: '#d1d5db', label: 'Çevrimdışı' },
};

function createDriverIcon(status: string, speed: number, isSelected: boolean): L.DivIcon {
    const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.offline;
    const size = isSelected ? 52 : 42;
    const ring = isSelected ? `box-shadow: 0 0 0 4px ${cfg.markerColor}40, 0 0 16px ${cfg.markerColor}60;` : '';
    const speedKm = Math.round(speed);
    const speedColor = speedKm > 120 ? '#ef4444' : speedKm > 80 ? '#f59e0b' : '#fff';

    return L.divIcon({
        className: '',
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
        popupAnchor: [0, -size / 2],
        html: `
            <div style="position:relative;width:${size}px;height:${size}px;">
                <div style="
                    position:absolute;inset:0;border-radius:50%;
                    background:${cfg.markerColor};
                    border:3px solid #fff;
                    ${ring}
                    display:flex;align-items:center;justify-content:center;
                    transition: all 0.3s ease;
                ">
                    <svg width="${size * 0.45}" height="${size * 0.45}" viewBox="0 0 24 24" fill="white">
                        <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/>
                    </svg>
                </div>
                <div style="
                    position:absolute;bottom:-4px;right:-4px;
                    background:#1e293b;color:${speedColor};
                    font-size:9px;font-weight:800;
                    padding:1px 4px;border-radius:8px;
                    border:1.5px solid #fff;
                    font-family:monospace;
                    min-width:26px;text-align:center;
                ">${speedKm}</div>
            </div>
        `
    });
}

const MapController: React.FC<{ selectedDriver: DriverMapData | null; drivers: DriverMapData[]; routePoints?: any[] }> = ({ selectedDriver, drivers, routePoints }) => {
    const map = useMap();
    useEffect(() => {
        if (selectedDriver && routePoints && routePoints.length > 0) {
            const bounds = L.latLngBounds(routePoints.map(p => [p.latitude, p.longitude] as [number, number]));
            // Include current driver location in bounds if present
            if (selectedDriver.lat !== 0) bounds.extend([selectedDriver.lat, selectedDriver.lng]);
            map.fitBounds(bounds, { padding: [60, 60], maxZoom: 15, duration: 1.2 });
        } else if (selectedDriver && selectedDriver.lat !== 0) {
            map.flyTo([selectedDriver.lat, selectedDriver.lng], 15, { duration: 1.2 });
        } else if (drivers.length > 0) {
            const valid = drivers.filter(d => d.lat !== 0 && d.lng !== 0);
            if (valid.length > 0) {
                const bounds = L.latLngBounds(valid.map(d => [d.lat, d.lng] as [number, number]));
                map.fitBounds(bounds, { padding: [60, 60], maxZoom: 14 });
            }
        }
    }, [selectedDriver, drivers, routePoints, map]);
    return null;
};

const HereLiveMapClient: React.FC<HereLiveMapClientProps> = ({ drivers, selectedDriver, onSelectDriver, routePoints }) => {
    const apiKey = process.env.NEXT_PUBLIC_HERE_API_KEY || 'RH04HVBUK6By3GfYWwVlCOG4Or1IzV-rRjygQRHbIvo';
    const tileUrl = `https://maps.hereapi.com/v3/base/mc/{z}/{x}/{y}/png8?apiKey=${apiKey}&size=256&style=explore.day`;

    const driversWithLocation = useMemo(() => drivers.filter(d => d.lat !== 0 && d.lng !== 0), [drivers]);

    // Prepare route polyline coordinates
    const polylineCoords = useMemo(() => {
        if (!routePoints || routePoints.length === 0) return [];
        return routePoints.map(p => [p.latitude, p.longitude] as [number, number]);
    }, [routePoints]);

    return (
        <MapContainer
            center={[36.8969, 30.7133]}
            zoom={10}
            style={{ width: '100%', height: '100%', borderRadius: 16 }}
            zoomControl={false}
        >
            <TileLayer
                attribution='&copy; <a href="https://here.com">HERE</a>'
                url={tileUrl}
            />
            <MapController selectedDriver={selectedDriver} drivers={driversWithLocation} routePoints={routePoints} />

            {/* Render route polyline if available */}
            {polylineCoords.length > 0 && (
                <Polyline 
                    positions={polylineCoords}
                    pathOptions={{ color: '#6366f1', weight: 4, opacity: 0.7, dashArray: '10, 8' }}
                />
            )}

            {/* Render violation markers along the route */}
            {routePoints && routePoints.filter(p => p.speed > 120).map((vp, idx) => (
                <CircleMarker
                    key={`violation-${idx}`}
                    center={[vp.latitude, vp.longitude]}
                    radius={6}
                    pathOptions={{ color: '#ef4444', fillColor: '#ef4444', fillOpacity: 0.6, weight: 1 }}
                >
                    <LTooltip direction="top" offset={[0, -5]}>
                        <div style={{ fontWeight: 600, color: '#dc2626' }}>Hız İhlali</div>
                        <div style={{ fontSize: 11 }}>{Math.round(vp.speed)} km/s</div>
                        <div style={{ fontSize: 10, color: '#64748b' }}>{new Date(vp.timestamp).toLocaleTimeString('tr-TR')}</div>
                    </LTooltip>
                </CircleMarker>
            ))}

            {driversWithLocation.map(driver => {
                const isSelected = selectedDriver?.driverId === driver.driverId;
                const cfg = STATUS_CONFIG[driver.status] || STATUS_CONFIG.offline;
                return (
                    <React.Fragment key={driver.driverId}>
                        {/* Pulse ring for on-job / speeding */}
                        {(driver.status === 'on_job' || driver.status === 'speeding') && (
                            <CircleMarker
                                center={[driver.lat, driver.lng]}
                                radius={isSelected ? 28 : 20}
                                pathOptions={{
                                    color: cfg.pulseColor,
                                    fillColor: cfg.pulseColor,
                                    fillOpacity: 0.15,
                                    weight: 1.5,
                                    opacity: 0.4
                                }}
                            />
                        )}
                        <Marker
                            position={[driver.lat, driver.lng]}
                            icon={createDriverIcon(driver.status, driver.speed, isSelected)}
                            eventHandlers={{ click: () => onSelectDriver(isSelected ? null : driver) }}
                        >
                            {!isSelected && (
                                <LTooltip direction="top" offset={[0, -24]} opacity={0.95}>
                                    <div style={{ fontWeight: 600, fontSize: 11 }}>{driver.driverName}</div>
                                    <div style={{ fontSize: 10, color: cfg.markerColor }}>{cfg.label}</div>
                                </LTooltip>
                            )}
                            {isSelected && (
                                <Popup eventHandlers={{ remove: () => onSelectDriver(null) }} maxWidth={280}>
                                    <div style={{ minWidth: 220, fontFamily: 'system-ui' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                                            <div style={{
                                                width: 36, height: 36, borderRadius: '50%',
                                                background: cfg.markerColor, color: '#fff',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                fontWeight: 800, fontSize: 14
                                            }}>
                                                {driver.driverName.charAt(0)}
                                            </div>
                                            <div>
                                                <div style={{ fontWeight: 700, fontSize: 14 }}>{driver.driverName}</div>
                                                <div style={{
                                                    fontSize: 10, fontWeight: 600, color: cfg.markerColor,
                                                    background: `${cfg.markerColor}15`, padding: '1px 8px',
                                                    borderRadius: 10, display: 'inline-block'
                                                }}>{cfg.label}</div>
                                            </div>
                                        </div>
                                        {driver.vehicle && (
                                            <div style={{
                                                background: '#f8fafc', padding: '6px 10px', borderRadius: 8,
                                                marginBottom: 8, fontSize: 11, display: 'flex', justifyContent: 'space-between'
                                            }}>
                                                <span style={{ fontWeight: 600 }}>{driver.vehicle.plateNumber}</span>
                                                <span style={{ color: '#64748b' }}>{driver.vehicle.brand} {driver.vehicle.model}</span>
                                            </div>
                                        )}
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 11 }}>
                                            <div style={{ background: '#f0f9ff', padding: '4px 8px', borderRadius: 6 }}>
                                                <div style={{ color: '#64748b', fontSize: 9 }}>HIZ</div>
                                                <div style={{ fontWeight: 700, color: driver.speed > 120 ? '#ef4444' : '#1e293b' }}>
                                                    {Math.round(driver.speed)} km/s
                                                </div>
                                            </div>
                                            <div style={{ background: '#fef3c7', padding: '4px 8px', borderRadius: 6 }}>
                                                <div style={{ color: '#64748b', fontSize: 9 }}>İHLAL</div>
                                                <div style={{ fontWeight: 700, color: (driver.speedViolations || 0) > 0 ? '#ef4444' : '#22c55e' }}>
                                                    {driver.speedViolations || 0}
                                                </div>
                                            </div>
                                        </div>
                                        {driver.currentJob && (
                                            <div style={{
                                                marginTop: 8, borderTop: '1px solid #e2e8f0', paddingTop: 8, fontSize: 11
                                            }}>
                                                <div style={{ fontWeight: 600, marginBottom: 4, color: '#3b82f6' }}>Aktif Sefer</div>
                                                <div style={{ color: '#475569' }}>
                                                    <div>Yolcu: <strong>{driver.currentJob.contactName}</strong></div>
                                                    {driver.currentJob.pickup && (
                                                        <div style={{ marginTop: 2, display: 'flex', gap: 4 }}>
                                                            <span style={{ color: '#22c55e' }}>●</span>
                                                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>
                                                                {driver.currentJob.pickup}
                                                            </span>
                                                        </div>
                                                    )}
                                                    {driver.currentJob.dropoff && (
                                                        <div style={{ display: 'flex', gap: 4 }}>
                                                            <span style={{ color: '#ef4444' }}>●</span>
                                                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>
                                                                {driver.currentJob.dropoff}
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                        <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 8, textAlign: 'right' }}>
                                            Son: {new Date(driver.timestamp).toLocaleTimeString('tr-TR')}
                                        </div>
                                    </div>
                                </Popup>
                            )}
                        </Marker>
                    </React.Fragment>
                );
            })}
        </MapContainer>
    );
};

export default HereLiveMapClient;
