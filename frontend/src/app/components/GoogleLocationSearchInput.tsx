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
    /**
     * Optional ISO-3166 country code (or array of codes) to restrict results.
     * When omitted, NO country restriction is applied so that nearby destinations
     * outside Turkey (e.g. KKTC — Kıbrıs Ercan Havalimanı, Greek islands) can be
     * found. Turkish results are still ranked first via region/language bias.
     */
    country?: string | string[];
    apiKey?: string;
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
    country,
    apiKey
}) => {
    // Load Google Maps script
    const { isLoaded, loadError } = useLoadScript({
        googleMapsApiKey: apiKey || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '',
        libraries,
        language: 'tr',
        region: 'tr'
    });

    // Build componentRestrictions only when caller explicitly provides a country.
    // Leaving it undefined lets Google return cross-border matches (e.g. KKTC)
    // while the script-level region:'tr' / language:'tr' still biases ranking
    // toward Turkish results.
    const requestOptions = React.useMemo(() => {
        if (!country) return {};
        const normalize = (c: string) => {
            const lc = (c || '').trim().toLowerCase();
            // Translate the legacy 3-letter "TUR" we historically saved into the
            // ISO-3166 alpha-2 code that the Places API actually expects.
            if (lc === 'tur') return 'tr';
            return lc;
        };
        // Accept either an array, or a comma/space separated string like
        // "tr,cy" so admins can whitelist neighbouring countries (e.g. KKTC's
        // Ercan Airport) without code changes.
        const list = Array.isArray(country)
            ? country
            : String(country).split(/[\s,]+/);
        const codes = list.map(normalize).filter(c => c && c.length === 2);
        if (codes.length === 0) return {};
        return { componentRestrictions: { country: codes.length === 1 ? codes[0] : codes } } as const;
    }, [country]);

    const {
        ready,
        value: searchValue,
        suggestions: { status, data },
        setValue,
        clearSuggestions,
    } = usePlacesAutocomplete({
        requestOptions,
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
                    suffix={!ready && isLoaded ? <Spin size="small" /> : <img src="https://maps.gstatic.com/mapfiles/api-3/images/powered-by-google-on-white3.png" alt="Powered by Google" style={{ height: 14, opacity: 0.6 }} />}
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
