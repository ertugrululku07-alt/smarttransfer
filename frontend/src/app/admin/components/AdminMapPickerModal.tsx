'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { Modal, Button, Slider, InputNumber, Row, Col, Spin, Typography, Input } from 'antd';
import { EnvironmentOutlined, CheckOutlined } from '@ant-design/icons';
import HereLocationSearchInput from '../../components/HereLocationSearchInput'; // Adjusted path
import dynamic from 'next/dynamic';

const HereAdminMapPicker = dynamic(() => import('./HereAdminMapPicker'), {
    ssr: false,
    loading: () => (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center', justifyContent: 'center', background: '#f5f5f5' }}>
            <Spin size="large" />
            <div>Harita Yükleniyor...</div>
        </div>
    )
});

const { Text } = Typography;

const containerStyle = {
    width: '100%',
    height: '400px',
    borderRadius: '12px'
};

const defaultCenter = {
    lat: 41.0082,
    lng: 28.9784
};

interface AdminMapPickerModalProps {
    visible: boolean;
    onCancel: () => void;
    onConfirm: (address: string, lat: number, lng: number, radius: number, polygonPath?: { lat: number; lng: number }[]) => void;
    initialLocation?: { lat: number; lng: number } | null;
    initialAddress?: string;
    initialRadius?: number;
    initialDrawingMode?: "circle" | "polygon" | "freehand";
    initialPolygonPath?: { lat: number; lng: number }[];
    title?: string;
    country?: string;
}

const AdminMapPickerModal: React.FC<AdminMapPickerModalProps> = ({
    visible,
    onCancel,
    onConfirm,
    initialLocation,
    initialAddress,
    initialRadius = 1000,
    initialDrawingMode = "circle",
    initialPolygonPath = [],
    title = "Konum ve Alan Seçin",
    country = "TUR"
}) => {
    const [center, setCenter] = useState(defaultCenter);
    const [markerPosition, setMarkerPosition] = useState(defaultCenter);
    const [address, setAddress] = useState(initialAddress || '');
    const [radius, setRadius] = useState(initialRadius);
    const [loadingAddress, setLoadingAddress] = useState(false);

    // Polygon State
    const [drawingMode, setDrawingMode] = useState<"circle" | "polygon" | "freehand">(initialDrawingMode);
    const [polygonPath, setPolygonPath] = useState<{ lat: number; lng: number }[]>(initialPolygonPath);
    const [freehandDrawEnabled, setFreehandDrawEnabled] = useState(false);

    // APPEND new stroke points to existing polygon (cumulative drawing)
    const handleFreehandAppend = (newPoints: { lat: number; lng: number }[]) => {
        setPolygonPath(prev => [...prev, ...newPoints]);
    };

    const switchToFreehand = () => {
        setDrawingMode('freehand');
        setPolygonPath([]);
        setFreehandDrawEnabled(false); // start in pan mode — user explicitly starts drawing
    };

    const apiKey = process.env.NEXT_PUBLIC_HERE_API_KEY || 'RH04HVBUK6By3GfYWwVlCOG4Or1IzV-rRjygQRHbIvo';

    const clearPolygon = () => {
        setPolygonPath([]);
    }

    // Sync props when visible changes
    useEffect(() => {
        if (visible) {
            if (initialAddress) setAddress(initialAddress);
            if (initialRadius) setRadius(initialRadius);
            if (initialDrawingMode) setDrawingMode(initialDrawingMode);

            if (initialPolygonPath && initialPolygonPath.length > 0) {
                setPolygonPath(initialPolygonPath);
                // Set center to the first point of the polygon for better UX
                setCenter(initialPolygonPath[0]);
            } else {
                setPolygonPath([]);
            }

            if (initialLocation && initialLocation.lat && initialLocation.lng) {
                setCenter(initialLocation);
                setMarkerPosition(initialLocation);
            } else if (!initialLocation) {
                // Default logic or user location
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
                        () => { }
                    );
                }
            }
        }
    }, [visible, initialLocation, initialAddress, initialRadius]);


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

    const handlePolygonClick = (pos: { lat: number; lng: number }) => {
        setPolygonPath(prev => [...prev, pos]);
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

    const generateCirclePolygon = (center: { lat: number, lng: number }, radiusInMeters: number) => {
        const points = [];
        const numPoints = 64;
        const radiusInKm = Math.max(radiusInMeters, 10) / 1000;
        const earthRadiusKm = 6371;
        
        for (let i = 0; i < numPoints; i++) {
            const bearing = (i * 360) / numPoints;
            const brng = bearing * (Math.PI / 180);
            const lat1 = center.lat * (Math.PI / 180);
            const lon1 = center.lng * (Math.PI / 180);
            
            const lat2 = Math.asin(Math.sin(lat1) * Math.cos(radiusInKm / earthRadiusKm) + 
                                   Math.cos(lat1) * Math.sin(radiusInKm / earthRadiusKm) * Math.cos(brng));
            const lon2 = lon1 + Math.atan2(Math.sin(brng) * Math.sin(radiusInKm / earthRadiusKm) * Math.cos(lat1), 
                                           Math.cos(radiusInKm / earthRadiusKm) - Math.sin(lat1) * Math.sin(lat2));
                                           
            points.push({
                lat: lat2 * (180 / Math.PI),
                lng: lon2 * (180 / Math.PI)
            });
        }
        return points;
    };

    const handleConfirm = () => {
        let finalPolygon = (drawingMode === 'polygon' || drawingMode === 'freehand')
            ? polygonPath
            : generateCirclePolygon(markerPosition, radius);
        onConfirm(address, markerPosition.lat, markerPosition.lng, radius, finalPolygon);
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
                <Button key="back" onClick={onCancel}>İptal</Button>,
                <Button
                    key="submit"
                    type="primary"
                    icon={<CheckOutlined />}
                    onClick={handleConfirm}
                    disabled={loadingAddress}
                >
                    Konumu ve Alanı Kaydet
                </Button>
            ]}
            width={800}
            destroyOnHidden={true}
            centered
        >
            <div style={{ marginBottom: 16 }}>
                <div style={{ marginBottom: 12, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <Button
                        type={drawingMode === 'circle' ? 'primary' : 'default'}
                        onClick={() => { setDrawingMode('circle'); setFreehandDrawEnabled(false); }}
                    >
                        🔵 Daire (Yarıçap)
                    </Button>
                    <Button
                        type={drawingMode === 'polygon' ? 'primary' : 'default'}
                        onClick={() => { setDrawingMode('polygon'); clearPolygon(); setFreehandDrawEnabled(false); }}
                    >
                        🔺 Tıkla-Çiz (Polygon)
                    </Button>
                    <Button
                        type={drawingMode === 'freehand' ? 'primary' : 'default'}
                        onClick={switchToFreehand}
                        style={drawingMode === 'freehand' ? { background: '#52c41a', borderColor: '#52c41a' } : {}}
                    >
                        ✏️ Kalemle Çiz (Serbest)
                    </Button>
                    {(drawingMode === 'polygon' || drawingMode === 'freehand') && (
                        <Button onClick={() => { clearPolygon(); setFreehandDrawEnabled(false); }} danger disabled={polygonPath.length === 0}>
                            Çizimi Temizle
                        </Button>
                    )}
                </div>
            </div>

            {drawingMode === 'circle' && (
                <Row gutter={16} style={{ marginBottom: 16 }}>
                    <Col span={12}>
                        <HereLocationSearchInput
                            placeholder="Harita üzerinde ara..."
                            value={address}
                            onChange={setAddress}
                            onSelect={handleSearchSelect}
                            size="large"
                            country={country}
                        />
                    </Col>
                    <Col span={12}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Text strong>Yarıçap (m):</Text>
                            <Slider
                                min={100}
                                max={5000}
                                step={100}
                                style={{ flex: 1 }}
                                value={radius}
                                onChange={setRadius}
                            />
                            <InputNumber
                                min={100}
                                max={10000}
                                style={{ width: 80 }}
                                value={radius}
                                onChange={(val) => setRadius(val || 1000)}
                            />
                        </div>
                    </Col>
                </Row>
            )}

            {drawingMode === 'polygon' && (
                <div style={{ fontSize: 13, color: '#666', marginBottom: 16 }}>
                    🖱️ Harita üzerine <strong>tıklayarak</strong> alanın köşe noktalarını belirleyin. Poligon otomatik kapanır.
                </div>
            )}
            {drawingMode === 'freehand' && (
                <div style={{ fontSize: 13, color: '#389e0d', marginBottom: 16, background: '#f6ffed', padding: '8px 12px', borderRadius: 6, border: '1px solid #b7eb8f', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    {freehandDrawEnabled
                        ? <><strong>✏️ Çizim aktif.</strong> Fare tuşuna basılı tutarak haritada alan çizin.&nbsp;&nbsp;<Button size="small" onClick={() => setFreehandDrawEnabled(false)}>✋ Haritayı Kaydır</Button></>
                        : <><strong>✋ Çizim pasif.</strong> Haritayı kaydırabilirsiniz.&nbsp;&nbsp;<Button size="small" type="primary" style={{ background: '#52c41a', borderColor: '#52c41a' }} onClick={() => setFreehandDrawEnabled(true)}>✏️ Çizimi Başlat</Button></>
                    }
                </div>
            )}

            <div style={{ height: '400px', position: 'relative', borderRadius: '12px', overflow: 'hidden', border: '1px solid #f0f0f0' }}>
                <HereAdminMapPicker 
                    center={center}
                    markerPosition={markerPosition}
                    radius={radius}
                    drawingMode={drawingMode}
                    freehandDrawEnabled={freehandDrawEnabled}
                    polygonPath={polygonPath}
                    onMapClick={handleMapClick}
                    onMarkerDragEnd={handleMarkerDragEnd}
                    onPolygonClick={handlePolygonClick}
                    onFreehandAppend={handleFreehandAppend}
                />
                
                {loadingAddress && (
                    <div style={{
                        position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)',
                        background: 'rgba(255,255,255,0.9)', padding: '8px 16px', borderRadius: '20px',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.15)', display: 'flex', alignItems: 'center', gap: 8, zIndex: 1000
                    }}>
                        <Spin size="small" />
                        <span style={{ fontSize: 13, fontWeight: 500 }}>Adres alınıyor...</span>
                    </div>
                )}
            </div>
            <div style={{ marginTop: 8, fontSize: 13, color: '#666' }}>
                * Kırmızı marker konumu, mavi daire ise kabul edilecek alanı gösterir.
            </div>
        </Modal >
    );
};

export default AdminMapPickerModal;
