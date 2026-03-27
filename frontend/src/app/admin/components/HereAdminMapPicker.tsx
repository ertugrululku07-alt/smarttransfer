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

// ─── Click-by-click polygon event catcher ────────────────────────────────────
const MapEventCatcher: React.FC<{ 
    drawingMode: 'circle' | 'polygon' | 'freehand'; 
    onMapClick: (pos: L.LatLng) => void;
}> = ({ drawingMode, onMapClick }) => {
    useMapEvents({
        click(e) {
            if (drawingMode === 'circle' || drawingMode === 'polygon') {
                onMapClick(e.latlng);
            }
        }
    });
    return null;
};

// ─── Freehand drawing handler ─────────────────────────────────────────────────
// drawEnabled = true  → mouse gestures draw on map (panning disabled)
// drawEnabled = false → mouse gestures pan/zoom the map normally (polygon preserved)
const FreehandDrawer: React.FC<{
    drawEnabled: boolean;
    onAppendPoints: (newPoints: { lat: number; lng: number }[]) => void;
}> = ({ drawEnabled, onAppendPoints }) => {
    const map = useMap();
    const isDrawing = useRef(false);
    const strokePoints = useRef<{ lat: number; lng: number }[]>([]);
    const lastAddedAt = useRef<number>(0);

    useEffect(() => {
        const container = map.getContainer();

        if (!drawEnabled) {
            // Ensure dragging is enabled when not in draw mode
            map.dragging.enable();
            return;
        }

        // Disable map dragging while in draw mode
        map.dragging.disable();

        const onMouseDown = (e: MouseEvent) => {
            if (e.button !== 0) return;
            isDrawing.current = true;
            strokePoints.current = [];

            const latlng = map.mouseEventToLatLng(e);
            strokePoints.current.push({ lat: latlng.lat, lng: latlng.lng });
        };

        const onMouseMove = (e: MouseEvent) => {
            if (!isDrawing.current) return;
            const now = Date.now();
            if (now - lastAddedAt.current < 30) return;
            lastAddedAt.current = now;

            const latlng = map.mouseEventToLatLng(e);
            strokePoints.current.push({ lat: latlng.lat, lng: latlng.lng });
        };

        const onMouseUp = () => {
            if (!isDrawing.current) return;
            isDrawing.current = false;

            // Simplify: keep every 2nd point if stroke is long
            let simplified = strokePoints.current;
            if (simplified.length > 20) {
                simplified = simplified.filter((_, i) => i % 2 === 0);
            }

            if (simplified.length > 1) {
                // APPEND to existing polygon (don't replace)
                onAppendPoints(simplified);
            }
            strokePoints.current = [];
        };

        container.addEventListener('mousedown', onMouseDown);
        container.addEventListener('mousemove', onMouseMove);
        container.addEventListener('mouseup', onMouseUp);
        window.addEventListener('mouseup', onMouseUp);

        return () => {
            container.removeEventListener('mousedown', onMouseDown);
            container.removeEventListener('mousemove', onMouseMove);
            container.removeEventListener('mouseup', onMouseUp);
            window.removeEventListener('mouseup', onMouseUp);
        };
    }, [map, drawEnabled, onAppendPoints]);

    return null;
};

// ─── Map center updater ───────────────────────────────────────────────────────
const MapCenterUpdater: React.FC<{ center: { lat: number; lng: number } }> = ({ center }) => {
    const map = useMap();
    useEffect(() => {
        map.setView([center.lat, center.lng]);
    }, [center, map]);
    return null;
};

// ─── Fix gray tiles in modals ─────────────────────────────────────────────────
const MapInvalidator: React.FC = () => {
    const map = useMap();
    useEffect(() => {
        const timeouts = [100, 300, 500].map(ms =>
            setTimeout(() => map.invalidateSize(), ms)
        );
        return () => timeouts.forEach(clearTimeout);
    }, [map]);
    return null;
};

// ─── Props ────────────────────────────────────────────────────────────────────
interface HereAdminMapPickerProps {
    center: { lat: number; lng: number };
    markerPosition: { lat: number; lng: number };
    radius: number;
    drawingMode: 'circle' | 'polygon' | 'freehand';
    freehandDrawEnabled?: boolean; // toggle: draw vs pan
    polygonPath: { lat: number; lng: number }[];
    onMapClick: (pos: { lat: number; lng: number }) => void;
    onMarkerDragEnd: (pos: { lat: number; lng: number }) => void;
    onPolygonClick: (pos: { lat: number; lng: number }) => void;
    onFreehandAppend?: (newPoints: { lat: number; lng: number }[]) => void;
}

const HereAdminMapPicker: React.FC<HereAdminMapPickerProps> = ({ 
    center, 
    markerPosition, 
    radius, 
    drawingMode, 
    freehandDrawEnabled = false,
    polygonPath, 
    onMapClick, 
    onMarkerDragEnd,
    onPolygonClick,
    onFreehandAppend
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
        } else if (drawingMode === 'circle') {
            onMapClick({ lat: latlng.lat, lng: latlng.lng });
        }
    };

    const showPolygon = (drawingMode === 'polygon' || drawingMode === 'freehand') && polygonPath.length > 1;

    return (
        <MapContainer 
            center={[center.lat, center.lng]} 
            zoom={14} 
            style={{ 
                width: '100%', 
                height: '100%', 
                borderRadius: '12px',
                cursor: (drawingMode === 'freehand' && freehandDrawEnabled) ? 'crosshair' : 'grab'
            }}
            zoomControl={false}
        >
            <TileLayer attribution={attribution} url={tileUrl} />
            <MapCenterUpdater center={center} />
            <MapInvalidator />
            <MapEventCatcher drawingMode={drawingMode} onMapClick={handleMapClickInternal} />

            {/* Freehand drawing handler */}
            {drawingMode === 'freehand' && onFreehandAppend && (
                <FreehandDrawer
                    drawEnabled={freehandDrawEnabled}
                    onAppendPoints={onFreehandAppend}
                />
            )}

            {/* Circle overlay */}
            {drawingMode === 'circle' && (
                <Circle 
                    center={[markerPosition.lat, markerPosition.lng]} 
                    radius={radius} 
                    pathOptions={{ color: '#1890ff', fillColor: '#1890ff', fillOpacity: 0.35 }}
                />
            )}

            {/* Polygon overlay */}
            {showPolygon && (
                <Polygon 
                    positions={polygonPath.map(p => [p.lat, p.lng])} 
                    pathOptions={{ color: '#52c41a', fillColor: '#52c41a', fillOpacity: 0.35, weight: 2 }}
                />
            )}

            {/* Single click point indicator */}
            {drawingMode === 'polygon' && polygonPath.length === 1 && (
                <Marker position={[polygonPath[0].lat, polygonPath[0].lng]} />
            )}

            {/* Main location marker (circle mode only) */}
            {drawingMode === 'circle' && (
                <Marker
                    position={[markerPosition.lat, markerPosition.lng]}
                    draggable={true}
                    eventHandlers={{ dragend: handleDragEnd }}
                    ref={markerRef}
                />
            )}
        </MapContainer>
    );
};

export default HereAdminMapPicker;
