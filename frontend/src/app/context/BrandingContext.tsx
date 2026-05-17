'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import axios from 'axios';

const API_URL = (typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1' ? 'https://api.' + window.location.hostname.replace('www.', '') : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000').replace(/[\r\n]+/g, '').trim());
const TENANT_SLUG = (process.env.NEXT_PUBLIC_TENANT_SLUG || 'smarttravel-demo').replace(/[\r\n]+/g, '').trim();

export interface LogoVariants {
  original?: string;
  header?: string;
  favicon?: string;
  voucher?: string;
  email?: string;
}

export interface Branding {
  companyName: string;
  siteName: string;
  siteNameHighlight: string;
  slogan: string;
  logoUrl: string;
  logoVariants?: LogoVariants | null;
  faviconUrl: string;
  phone: string;
  email: string;
}

export interface GoogleMapsSettings {
  enabled: boolean;
  country: string;
  apiKey?: string;
}

const DEFAULT_BRANDING: Branding = {
  companyName: '',
  siteName: '',
  siteNameHighlight: '',
  slogan: '',
  logoUrl: '',
  logoVariants: null,
  faviconUrl: '',
  phone: '',
  email: '',
};

interface BrandingContextType {
  branding: Branding;
  googleMaps: GoogleMapsSettings;
  loading: boolean;
  /** Full display name: siteNameHighlight + siteName */
  fullName: string;
  refreshBranding: () => Promise<void>;
}

const BrandingContext = createContext<BrandingContextType | undefined>(undefined);

export const BrandingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [branding, setBranding] = useState<Branding>(DEFAULT_BRANDING);
  const [googleMaps, setGoogleMaps] = useState<GoogleMapsSettings>({ enabled: false, country: 'tr' });
  const [loading, setLoading] = useState(true);

  const fetchBranding = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/tenant/info`, {
        headers: { 'X-Tenant-Slug': TENANT_SLUG }
      });
      if (res.data.success) {
        const saved = res.data.data.tenant.settings?.branding;
        if (saved) {
          setBranding(prev => ({
            ...prev,
            ...saved,
          }));
        }
        const savedGoogleMaps = res.data.data.tenant.settings?.googleMaps;
        if (savedGoogleMaps) {
          setGoogleMaps({
            enabled: !!savedGoogleMaps.enabled,
            country: savedGoogleMaps.country || 'tr',
            apiKey: savedGoogleMaps.apiKey
          });
        }
      }
    } catch (e) {
      // Use defaults
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBranding();
  }, []);

  const fullName = `${branding.siteNameHighlight}${branding.siteName}`;

  return (
    <BrandingContext.Provider value={{ branding, googleMaps, loading, fullName, refreshBranding: fetchBranding }}>
      {children}
    </BrandingContext.Provider>
  );
};

export const useBranding = (): BrandingContextType => {
  const ctx = useContext(BrandingContext);
  if (!ctx) {
    throw new Error('useBranding must be used within BrandingProvider');
  }
  return ctx;
};
