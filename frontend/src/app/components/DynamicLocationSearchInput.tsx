'use client';

import React from 'react';
import { useBranding } from '../context/BrandingContext';
import GoogleLocationSearchInput from './GoogleLocationSearchInput';
import HereLocationSearchInput from './HereLocationSearchInput';

interface LocationSearchInputProps {
    placeholder?: string;
    value?: string;
    onChange?: (value: string) => void;
    onSelect?: (address: string, lat?: number, lng?: number) => void;
    onMapClick?: () => void;
    size?: 'large' | 'middle' | 'small';
    prefix?: React.ReactNode;
    style?: React.CSSProperties;
    country?: string;
}

const DynamicLocationSearchInput: React.FC<LocationSearchInputProps> = (props) => {
    const { googleMaps } = useBranding();

    // If Google Maps is enabled in admin settings, use Google Places
    if (googleMaps.enabled) {
        return <GoogleLocationSearchInput {...props} country={googleMaps.country || props.country} />;
    }

    // Otherwise, fallback to the old Here Maps system
    return <HereLocationSearchInput {...props} country={props.country} />;
};

export default DynamicLocationSearchInput;
