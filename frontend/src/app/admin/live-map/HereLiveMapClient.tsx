'use client';

import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface DriverLocation {
    driverId: string;
    driverName: string;
    lat: number;
    lng: number;
    speed: number;
    timestamp: string;
    heading: number;
}

interface HereLiveMapClientProps {
    drivers: DriverLocation[];
    selectedDriver: DriverLocation | null;
    onSelectDriver: (driver: DriverLocation | null) => void;
}

// Custom vehicle icon
const carIcon = L.icon({
    iconUrl: 'https://cdn-icons-png.flaticon.com/512/3097/3097180.png',
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    popupAnchor: [0, -20]
});

// Component to handle dynamic center updates and follow selected driver
const MapCenterUpdater: React.FC<{ selectedDriver: DriverLocation | null, drivers: DriverLocation[] }> = ({ selectedDriver, drivers }) => {
    const map = useMap();
    useEffect(() => {
        if (selectedDriver && selectedDriver.lat !== 0) {
            map.flyTo([selectedDriver.lat, selectedDriver.lng], 14, { duration: 1.5 });
        } else if (drivers.length > 0) {
            // Auto fit bounds to show all drivers if none is selected
            const validDrivers = drivers.filter(d => d.lat !== 0 && d.lng !== 0);
            if (validDrivers.length > 0) {
                const bounds = L.latLngBounds(validDrivers.map(d => [d.lat, d.lng] as [number, number]));
                map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
            }
        }
    }, [selectedDriver, drivers, map]);
    return null;
};

const HereLiveMapClient: React.FC<HereLiveMapClientProps> = ({ drivers, selectedDriver, onSelectDriver }) => {
    const apiKey = process.env.NEXT_PUBLIC_HERE_API_KEY || 'RH04HVBUK6By3GfYWwVlCOG4Or1IzV-rRjygQRHbIvo';
    const tileUrl = `https://maps.hereapi.com/v3/base/mc/{z}/{x}/{y}/png8?apiKey=${apiKey}&size=256&style=explore.day`;
    const attribution = '&copy; <a href="https://here.com">HERE</a>';

    const driversWithLocation = drivers.filter(d => d.lat !== 0 && d.lng !== 0);

    return (
        <MapContainer 
            center={[36.8969, 30.7133]} // Antalya Default
            zoom={10} 
            style={{ width: '100%', height: '100%' }}
            zoomControl={true}
        >
            <TileLayer
                attribution={attribution}
                url={tileUrl}
            />
            
            <MapCenterUpdater selectedDriver={selectedDriver} drivers={driversWithLocation} />

            {driversWithLocation.map(driver => (
                <Marker
                    key={driver.driverId}
                    position={[driver.lat, driver.lng]}
                    icon={carIcon}
                    eventHandlers={{
                        click: () => onSelectDriver(driver)
                    }}
                >
                    {selectedDriver?.driverId === driver.driverId && (
                        <Popup eventHandlers={{ remove: () => onSelectDriver(null) }}>
                            <div>
                                <h3 style={{ margin: '0 0 5px', fontSize: '14px', fontWeight: 'bold' }}>{driver.driverName}</h3>
                                <div style={{ fontSize: '12px' }}>
                                    Hız: {Math.round(driver.speed)} km/s<br />
                                    Son Güncelleme: {new Date(driver.timestamp).toLocaleTimeString()}
                                </div>
                            </div>
                        </Popup>
                    )}
                </Marker>
            ))}
        </MapContainer>
    );
};

export default HereLiveMapClient;
