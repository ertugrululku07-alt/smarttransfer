import React, { useState, useEffect } from 'react';
import { Tag, Tooltip } from 'antd';
import { RocketOutlined, SyncOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import apiClient from '@/lib/api-client';

interface FlightTrackerProps {
    flightNumber: string;
    arrivalDate: string; // ISO string or date string from DB
}

const FlightTracker: React.FC<FlightTrackerProps> = ({ flightNumber, arrivalDate }) => {
    const [status, setStatus] = useState<'LANDED' | 'AIRBORNE' | 'SCHEDULED' | 'ACTIVE'>('SCHEDULED');
    const [remaining, setRemaining] = useState<string>('');
    const [loading, setLoading] = useState(false);
    const [isLiveData, setIsLiveData] = useState(false);
    const [error, setError] = useState(false);

    // Helper to calculate fallback timer (Pickup Time based)
    const calculateFallbackStatus = () => {
        const now = new Date();
        const arrival = new Date(arrivalDate);
        const diff = arrival.getTime() - now.getTime();
        const isToday = now.toDateString() === arrival.toDateString();

        if (diff <= 0) {
            setStatus('LANDED');
            setRemaining('Uçak İndi (Tahmini)');
        } else if (isToday) {
            setStatus('AIRBORNE');
            const hours = Math.floor(diff / (1000 * 60 * 60));
            const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            setRemaining(`Karşılama: ${hours > 0 ? `${hours}sa ` : ''}${minutes}dk`);
        } else {
            setStatus('SCHEDULED');
            setRemaining('Planlandı');
        }
        setIsLiveData(false);
    };

    const fetchFlightStatus = async () => {
        if (!flightNumber) return;

        // Only fetch if it's today or tomorrow (to save API calls)
        const arrival = new Date(arrivalDate);
        const now = new Date();
        const diffDays = (arrival.getTime() - now.getTime()) / (1000 * 3600 * 24);

        if (diffDays > 2 || diffDays < -1) {
            calculateFallbackStatus();
            return;
        }

        setLoading(true);
        try {
            const res = await apiClient.get('/api/flight/status', {
                params: { flightNumber, date: arrivalDate }
            });

            if (res.data.success && res.data.source !== 'fallback-mock') {
                const flight = res.data.data;
                setIsLiveData(true);
                setError(false);

                // Map API status to our status
                // aviationstack statuses: scheduled, active, landed, cancelled, incident, diverted
                const apiStatus = flight.status.toLowerCase();

                if (apiStatus === 'landed') {
                    setStatus('LANDED');
                    setRemaining(`İndi: ${new Date(flight.arrival.actual || flight.arrival.estimated).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`);
                } else if (apiStatus === 'active') {
                    // Calculate remaining based on estimated arrival
                    const estimatedArrival = new Date(flight.arrival.estimated || flight.arrival.scheduled);
                    const diff = estimatedArrival.getTime() - new Date().getTime();

                    // Check if we have live ground status saying it's flying
                    const isFlying = flight.live && flight.live.is_ground === false;

                    // If estimated arrival was more than 15 minutes ago, assume landed, UNLESS likely flying
                    if (!isFlying && diff < -15 * 60 * 1000) {
                        setStatus('LANDED');
                        setRemaining(`İndi: ${estimatedArrival.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`);
                    } else if (diff > 0) {
                        setStatus('AIRBORNE');
                        const hours = Math.floor(diff / (1000 * 60 * 60));
                        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                        setRemaining(`İnişe: ${hours > 0 ? `${hours}sa ` : ''}${minutes}dk`);
                    } else {
                        // Between 0 and -15 minutes, or flying with outdated time
                        setStatus('AIRBORNE');
                        setRemaining('İniş Yapıyor...');
                    }
                } else if (apiStatus === 'cancelled') {
                    setStatus('CANCELLED' as any); // Type assertion or update type
                    setRemaining('İPTAL');
                } else {
                    setStatus('SCHEDULED');
                    setRemaining(`Plan: ${new Date(flight.arrival.scheduled).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`);
                }
            } else {
                // API returned fallback or failed to find flight
                calculateFallbackStatus();
            }
        } catch (err) {
            console.error('Flight fetch error', err);
            setError(true);
            calculateFallbackStatus();
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchFlightStatus();
        // Poll every 5 minutes for live data, or 1 minute for fallback
        const intervalTime = isLiveData ? 5 * 60 * 1000 : 60 * 1000;
        const timer = setInterval(() => {
            if (isLiveData) fetchFlightStatus();
            else calculateFallbackStatus();
        }, intervalTime);

        return () => clearInterval(timer);
    }, [flightNumber, arrivalDate]);

    // Color mapping
    const getColor = () => {
        if (loading && !status) return 'default';
        switch (status) {
            case 'LANDED': return 'green';
            case 'AIRBORNE': return 'orange';
            case 'ACTIVE': return 'orange';
            case 'SCHEDULED': return 'blue';
            case 'CANCELLED' as any: return 'red';
            default: return 'default';
        }
    };

    return (
        <div style={{ marginTop: '8px', background: '#f0f9ff', padding: '4px 8px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '8px', width: 'fit-content' }}>
            <div style={{ display: 'flex', alignItems: 'center', fontSize: '12px' }}>
                <RocketOutlined style={{ marginRight: '6px', color: '#1890ff' }} />
                <span style={{ color: '#1890ff', fontWeight: 500 }}>{flightNumber}</span>
            </div>

            <Tooltip title={isLiveData ? "Canlı Uçuş Verisi" : "Tahmini (Rezervasyon Saati)"}>
                <Tag color={getColor()} icon={isLiveData ? <SyncOutlined spin={loading} /> : (error ? <ExclamationCircleOutlined /> : undefined)} style={{ margin: 0, fontSize: '10px', lineHeight: '18px', cursor: 'help' }}>
                    {loading && !status ? 'Yükleniyor...' : (status === 'LANDED' ? 'İNDİ' : (status === 'AIRBORNE' || status === 'ACTIVE' ? remaining : 'Planlandı'))}
                </Tag>
            </Tooltip>
        </div>
    );
};

export default FlightTracker;
