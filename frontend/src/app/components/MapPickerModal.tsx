'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { Modal, Button, Spin, Input } from 'antd';
import { EnvironmentOutlined, CheckOutlined } from '@ant-design/icons';
import DynamicLocationSearchInput from './DynamicLocationSearchInput';
import dynamic from 'next/dynamic';

const HereMapPicker = dynamic(() => import('./HereMapPicker'), {
    ssr: false,
    loading: () => (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center', justifyContent: 'center', background: '#f5f5f5' }}>
            <Spin size="large" />
            <div>Harita Yükleniyor...</div>
        </div>
    )
});

const defaultCenter = {
    lat: 41.0082,
    lng: 28.9784
};

interface MapPickerModalProps {
    visible: boolean;
    onCancel: () => void;
    onConfirm: (address: string, lat: number, lng: number) => void;
    initialLocation?: { lat: number; lng: number } | null;
    initialAddress?: string;
    title?: string;
    country?: string;
}

const MapPickerModal: React.FC<MapPickerModalProps> = ({
    visible,
    onCancel,
    onConfirm,
    initialLocation,
    initialAddress,
    title = "Konum Seçin",
    country = "TUR"
}) => {
    const [center, setCenter] = useState(defaultCenter);
    const [markerPosition, setMarkerPosition] = useState(defaultCenter);
    const [address, setAddress] = useState(initialAddress || '');
    const [loadingAddress, setLoadingAddress] = useState(false);

    const apiKey = process.env.NEXT_PUBLIC_HERE_API_KEY || 'RH04HVBUK6By3GfYWwVlCOG4Or1IzV-rRjygQRHbIvo';

    // Sync address when prop changes
    useEffect(() => {
        if (visible) {
            if (initialAddress) {
                setAddress(initialAddress);
            }
            if (initialLocation && initialLocation.lat && initialLocation.lng) {
                setCenter(initialLocation);
                setMarkerPosition(initialLocation);
            } else if (!initialLocation) {
                // Try to get user location if no initial location
                if (navigator.geolocation) {
                    navigator.geolocation.getCurrentPosition(
                        (position) => {
                            const pos = {
                                lat: position.coords.latitude,
                                lng: position.coords.longitude,
                            };
                            setCenter(pos);
                            setMarkerPosition(pos);
                        },
                        () => {
                            // Handle location error or denial - stay at default
                        }
                    );
                }
            }
        }
    }, [visible, initialLocation, initialAddress]);

    const handleSearchSelect = (selectedAddress: string, lat?: number, lng?: number) => {
        setAddress(selectedAddress);
        if (lat !== undefined && lng !== undefined) {
            const newPos = { lat, lng };
            setCenter(newPos);
            setMarkerPosition(newPos);
        }
    };

    const handleMapClick = (pos: { lat: number; lng: number }) => {
        setMarkerPosition(pos);
        geocodePosition(pos);
    };

    const handleMarkerDragEnd = (pos: { lat: number; lng: number }) => {
        setMarkerPosition(pos);
        geocodePosition(pos);
    };

    const geocodePosition = async (pos: { lat: number, lng: number }) => {
        setLoadingAddress(true);
        try {
            const response = await fetch(`https://revgeocode.search.hereapi.com/v1/revgeocode?at=${pos.lat},${pos.lng}&apiKey=${apiKey}`);
            if (!response.ok) throw new Error('Failed to reverse geocode');
            const data = await response.json();
            if (data.items && data.items.length > 0) {
                setAddress(data.items[0].address.label);
            } else {
                setAddress(`Enlem: ${pos.lat.toFixed(4)}, Boylam: ${pos.lng.toFixed(4)}`);
            }
        } catch (error) {
            console.error("Reverse geocoding error: ", error);
            setAddress(`Enlem: ${pos.lat.toFixed(4)}, Boylam: ${pos.lng.toFixed(4)}`);
        } finally {
            setLoadingAddress(false);
        }
    };

    const handleConfirm = () => {
        onConfirm(address, markerPosition.lat, markerPosition.lng);
        onCancel();
    };

    return (
        <Modal
            title={
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <EnvironmentOutlined style={{ color: '#1890ff' }} />
                    <span>{title}</span>
                </div>
            }
            open={visible}
            onCancel={onCancel}
            footer={[
                <Button key="back" onClick={onCancel}>
                    İptal
                </Button>,
                <Button
                    key="submit"
                    type="primary"
                    icon={<CheckOutlined />}
                    onClick={handleConfirm}
                    disabled={loadingAddress}
                >
                    Konumu Onayla
                </Button>
            ]}
            width={700}
            destroyOnHidden={true}
            centered
        >
            <div style={{ marginBottom: 16 }}>
                <DynamicLocationSearchInput
                    placeholder="Harita üzerinde ara..."
                    value={address}
                    onChange={setAddress}
                    onSelect={handleSearchSelect}
                    size="large"
                    country={country}
                />
            </div>

            <div style={{ height: '400px', position: 'relative', borderRadius: '12px', overflow: 'hidden', border: '1px solid #f0f0f0' }}>
                <HereMapPicker 
                    center={center} 
                    markerPosition={markerPosition} 
                    onMapClick={handleMapClick} 
                    onMarkerDragEnd={handleMarkerDragEnd} 
                />

                {loadingAddress && (
                    <div style={{
                        position: 'absolute',
                        bottom: 20,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        background: 'white',
                        padding: '8px 16px',
                        borderRadius: '20px',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        zIndex: 1000
                    }}>
                        <Spin size="small" />
                        <span style={{ fontSize: '13px', fontWeight: 500 }}>Adres çözümleniyor...</span>
                    </div>
                )}
            </div>

            <div style={{ 
                marginTop: 16, 
                padding: '12px 16px', 
                background: '#f8f9fa', 
                borderRadius: '8px',
                border: '1px solid #e5e7eb'
            }}>
                <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: 4 }}>Seçilen Adres:</div>
                <div style={{ fontSize: '14px', fontWeight: 500, color: '#111827' }}>
                    {address || 'Haritadan bir konum seçin'}
                </div>
            </div>
        </Modal>
    );
};

export default MapPickerModal;
