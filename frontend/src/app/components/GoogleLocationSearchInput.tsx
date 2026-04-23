'use client';

import React, { useState, useEffect } from 'react';
import { AutoComplete, Input, Spin, Button } from 'antd';
import { EnvironmentOutlined, SearchOutlined } from '@ant-design/icons';
import usePlacesAutocomplete, {
    getGeocode,
    getLatLng,
} from 'use-places-autocomplete';
import { useLoadScript } from '@react-google-maps/api';

const libraries: "places"[] = ['places'];

interface GoogleLocationSearchInputProps {
    placeholder?: string;
    style?: React.CSSProperties;
    value?: string;
    onChange?: (value: string) => void;
    onSelect?: (value: string, lat?: number, lng?: number) => void;
    size?: 'large' | 'middle' | 'small';
    prefix?: React.ReactNode;
    onMapClick?: () => void;
    country?: string; // e.g. "TR"
}

const GoogleLocationSearchInput: React.FC<GoogleLocationSearchInputProps> = ({
    placeholder,
    style,
    value,
    onChange,
    onSelect,
    size = 'middle',
    prefix,
    onMapClick,
    country = 'TR'
}) => {
    // Load Google Maps script
    const { isLoaded, loadError } = useLoadScript({
        googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '',
        libraries,
        language: 'tr',
        region: 'tr'
    });

    const {
        ready,
        value: searchValue,
        suggestions: { status, data },
        setValue,
        clearSuggestions,
    } = usePlacesAutocomplete({
        requestOptions: {
            componentRestrictions: { country: country.toLowerCase() === 'tur' ? 'tr' : (country.toLowerCase() || 'tr') },
        },
        debounce: 300,
        initOnMount: isLoaded, // initialize when script is loaded
    });

    useEffect(() => {
        if (value !== undefined && value !== searchValue) {
            setValue(value, false);
        }
    }, [value, setValue, searchValue]);

    const handleSearch = (val: string) => {
        setValue(val);
        if (onChange) {
            onChange(val);
        }
    };

    const handleSelect = async (val: string, option: any) => {
        setValue(val, false);
        clearSuggestions();
        if (onChange) onChange(val);

        try {
            const results = await getGeocode({ address: val });
            const { lat, lng } = await getLatLng(results[0]);
            if (onSelect) onSelect(val, lat, lng);
        } catch (error) {
            console.error("Error: ", error);
            if (onSelect) onSelect(val);
        }
    };

    const options = status === 'OK' ? data.map(({ place_id, description, structured_formatting }) => ({
        value: description,
        label: (
            <div style={{ display: 'flex', alignItems: 'center' }}>
                <EnvironmentOutlined style={{ marginRight: 8, color: '#999' }} />
                <div>
                    <div style={{ fontSize: '14px' }}>{structured_formatting?.main_text || description}</div>
                    {structured_formatting?.secondary_text && (
                        <div style={{ fontSize: '12px', color: '#888' }}>{structured_formatting.secondary_text}</div>
                    )}
                </div>
            </div>
        )
    })) : [];

    if (loadError) return <div>Error loading Google Maps</div>;

    return (
        <div style={{ display: 'flex', gap: 8 }}>
            <AutoComplete
                value={searchValue}
                options={options}
                onSelect={handleSelect}
                onSearch={handleSearch}
                style={{ width: '100%', ...style }}
                disabled={!ready}
            >
                <Input
                    size={size}
                    placeholder={placeholder || "Adres veya mekan arayın..."}
                    prefix={prefix || <SearchOutlined style={{ color: '#bfbfbf' }} />}
                    suffix={!ready && isLoaded ? <Spin size="small" /> : <img src="https://developers.google.com/maps/documentation/images/powered_by_google_on_white.png" alt="Powered by Google" style={{ height: 14, opacity: 0.6 }} />}
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

export default GoogleLocationSearchInput;
