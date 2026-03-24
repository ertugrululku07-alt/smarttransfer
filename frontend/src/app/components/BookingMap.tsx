'use client';

import React, { useState, useEffect } from 'react';
import { Spin } from 'antd';
import dynamic from 'next/dynamic';

const HereBookingClient = dynamic(() => import('./HereBookingClient'), {
    ssr: false,
    loading: () => (
        <div style={{ width: '100%', height: '250px', display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center', justifyContent: 'center', background: '#f0f2f5', borderRadius: '8px' }}>
            <Spin />
            <div style={{ fontSize: '12px' }}>Harita Yükleniyor...</div>
        </div>
    )
});

interface BookingMapProps {
    pickup: string;
    dropoff: string;
    onDistanceCalculated?: (distance: string, duration: string) => void;
}

const BookingMap: React.FC<BookingMapProps> = ({ pickup, dropoff, onDistanceCalculated }) => {
    const [debouncedPickup, setDebouncedPickup] = useState(pickup);
    const [debouncedDropoff, setDebouncedDropoff] = useState(dropoff);

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedPickup(pickup);
            setDebouncedDropoff(dropoff);
        }, 1000);
        return () => clearTimeout(timer);
    }, [pickup, dropoff]);

    return (
        <div style={{ position: 'relative', width: '100%', height: '250px' }}>
            <HereBookingClient 
                pickup={debouncedPickup} 
                dropoff={debouncedDropoff} 
                onDistanceCalculated={onDistanceCalculated} 
            />
        </div>
    );
};

export default BookingMap;
