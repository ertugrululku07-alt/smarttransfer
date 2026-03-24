'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { AutoComplete, Input, Spin, Button } from 'antd';
import { EnvironmentOutlined, SearchOutlined } from '@ant-design/icons';

// Fallback locations when API fails or is not ready
const FALLBACK_LOCATIONS = [
    { value: 'İstanbul Havalimanı (IST)', label: 'İstanbul Havalimanı (IST)', type: 'airport', lat: 41.2753, lng: 28.7519 },
    { value: 'Sabiha Gökçen Havalimanı (SAW)', label: 'Sabiha Gökçen Havalimanı (SAW)', type: 'airport', lat: 40.8986, lng: 29.3092 },
    { value: 'Antalya Havalimanı (AYT)', label: 'Antalya Havalimanı (AYT)', type: 'airport', lat: 36.8987, lng: 30.8005 },
    { value: 'İzmir Adnan Menderes (ADB)', label: 'İzmir Adnan Menderes (ADB)', type: 'airport', lat: 38.2924, lng: 27.1569 },
    { value: 'Ankara Esenboğa (ESB)', label: 'Ankara Esenboğa (ESB)', type: 'airport', lat: 40.1281, lng: 32.9951 },
    { value: 'Bodrum Milas (BJV)', label: 'Bodrum Milas (BJV)', type: 'airport', lat: 37.2506, lng: 27.6643 },
    { value: 'Dalaman Havalimanı (DLM)', label: 'Dalaman Havalimanı (DLM)', type: 'airport', lat: 36.7131, lng: 28.7925 },
    { value: 'Taksim Meydanı, İstanbul', label: 'Taksim Meydanı, İstanbul', type: 'location', lat: 41.0369, lng: 28.9850 },
    { value: 'Sultanahmet, İstanbul', label: 'Sultanahmet, İstanbul', type: 'location', lat: 41.0054, lng: 28.9768 },
    { value: 'Kadıköy, İstanbul', label: 'Kadıköy, İstanbul', type: 'location', lat: 40.9897, lng: 29.0227 },
    { value: 'Alanya, Antalya', label: 'Alanya, Antalya', type: 'location', lat: 36.5438, lng: 31.9998 }
];

interface HereLocationSearchInputProps {
    placeholder?: string;
    style?: React.CSSProperties;
    value?: string;
    onChange?: (value: string) => void;
    onSelect?: (value: string, lat?: number, lng?: number) => void;
    size?: 'large' | 'middle' | 'small';
    prefix?: React.ReactNode;
    onMapClick?: () => void;
    country?: string;
}

const HereLocationSearchInput: React.FC<HereLocationSearchInputProps> = ({
    placeholder,
    style,
    value,
    onChange,
    onSelect,
    size = 'middle',
    prefix,
    onMapClick,
    country = 'TUR'
}) => {
    const [searchValue, setSearchValue] = useState(value || '');
    const [options, setOptions] = useState<{ value: string; label: React.ReactNode; lat?: number; lng?: number }[]>([]);
    const [loading, setLoading] = useState(false);
    
    const debounceTimeout = useRef<NodeJS.Timeout | null>(null);

    const apiKey = process.env.NEXT_PUBLIC_HERE_API_KEY || 'RH04HVBUK6By3GfYWwVlCOG4Or1IzV-rRjygQRHbIvo';

    useEffect(() => {
        if (value !== undefined && value !== searchValue) {
            setSearchValue(value);
        }
    }, [value]);

    const fetchSuggestions = async (query: string) => {
        if (!query || query.length < 3) {
            setOptions([]);
            return;
        }

        setLoading(true);

        try {
            // Convert alpha-2 to alpha-3 for HERE maps (e.g. 'tr' -> 'TUR')
            let hereCountry = country.toUpperCase();
            if (hereCountry === 'TR') hereCountry = 'TUR';
            else if (hereCountry === 'US' || hereCountry === 'UK') hereCountry = hereCountry === 'US' ? 'USA' : 'GBR';
            else if (hereCountry.length === 2) {
                // If it's another 2-letter code, we omit the country filter to avoid 400 Bad Request
                hereCountry = ''; 
            }

            const countryFilter = hereCountry ? `&in=countryCode:${hereCountry}` : '';
            const url = `https://discover.search.hereapi.com/v1/discover?q=${encodeURIComponent(query)}&at=39.0,35.0${countryFilter}&limit=5&apiKey=${apiKey}`;
            
            const response = await fetch(url);
            if (!response.ok) {
                const errText = await response.text();
                console.error("HERE API Error:", response.status, errText);
                throw new Error(`Failed to fetch HERE suggestions: ${response.status} ${errText}`);
            }
            
            const data = await response.json();
            
            if (data.items && data.items.length > 0) {
                const fetchedOptions = data.items.map((item: any) => ({
                    value: item.address.label || item.title,
                    label: (
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                            <EnvironmentOutlined style={{ marginRight: 8, color: '#999' }} />
                            <div>
                                <div style={{ fontSize: '14px' }}>{item.title}</div>
                                {item.title !== item.address.label && (
                                    <div style={{ fontSize: '12px', color: '#888' }}>{item.address.label}</div>
                                )}
                            </div>
                        </div>
                    ),
                    lat: item.position?.lat,
                    lng: item.position?.lng
                }));
                setOptions(fetchedOptions);
            } else {
                setOptions(getFallbackOptions(query));
            }
        } catch (error) {
            console.error("Error searching HERE maps:", error);
            setOptions(getFallbackOptions(query));
        } finally {
            setLoading(false);
        }
    };

    const getFallbackOptions = (query: string) => {
        return FALLBACK_LOCATIONS.filter(loc => 
            loc.label.toLowerCase().includes(query.toLowerCase())
        ).map(loc => ({
            value: loc.value,
            label: (
                <div style={{ display: 'flex', alignItems: 'center' }}>
                    <EnvironmentOutlined style={{ marginRight: 8, color: '#999' }} />
                    {loc.label}
                </div>
            ),
            lat: loc.lat,
            lng: loc.lng
        }));
    };

    const onSearch = (searchText: string) => {
        setSearchValue(searchText);
        if (onChange) {
            onChange(searchText);
        }

        if (debounceTimeout.current) {
            clearTimeout(debounceTimeout.current);
        }

        debounceTimeout.current = setTimeout(() => {
            fetchSuggestions(searchText);
        }, 500);
    };

    const handleSelect = (selectedValue: string, option: any) => {
        setSearchValue(selectedValue);
        if (onChange) onChange(selectedValue);
        if (onSelect) onSelect(selectedValue, option.lat, option.lng);
        setOptions([]); // Clear options after selecting
    };

    return (
        <div style={{ display: 'flex', gap: 8 }}>
            <AutoComplete
                value={searchValue}
                options={options}
                onSelect={handleSelect}
                onSearch={onSearch}
                style={{ width: '100%', ...style }}
            >
                <Input
                    size={size}
                    placeholder={placeholder || "Adres veya mekan arayın..."}
                    prefix={prefix || <SearchOutlined style={{ color: '#bfbfbf' }} />}
                    suffix={loading ? <Spin size="small" /> : null}
                    style={{ borderRadius: 'var(--radius-md)' }}
                />
            </AutoComplete>
            {onMapClick && (
                <Button
                    icon={<EnvironmentOutlined />}
                    onClick={onMapClick}
                    size={size}
                    title="Harita Üzerinde Seç"
                    style={{ borderRadius: 'var(--radius-md)' }}
                />
            )}
        </div>
    );
};

export default HereLocationSearchInput;
