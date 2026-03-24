'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import axios from 'axios';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'https://smarttransfer-backend-production.up.railway.app').replace(/[\r\n]+/g, '').trim();
const TENANT_SLUG = (process.env.NEXT_PUBLIC_TENANT_SLUG || 'smarttravel-demo').replace(/[\r\n]+/g, '').trim();

export interface Branding {
  companyName: string;
  siteName: string;
  siteNameHighlight: string;
  slogan: string;
  logoUrl: string;
  faviconUrl: string;
  phone: string;
  email: string;
}

const DEFAULT_BRANDING: Branding = {
  companyName: 'SmartTransfer',
  siteName: 'Transfer',
  siteNameHighlight: 'Smart',
  slogan: 'Güvenilir, konforlu ve profesyonel transfer hizmetleri',
  logoUrl: '',
  faviconUrl: '',
  phone: '+90 (212) XXX XX XX',
  email: 'info@smarttransfer.com',
};

interface BrandingContextType {
  branding: Branding;
  loading: boolean;
  /** Full display name: siteNameHighlight + siteName */
  fullName: string;
  refreshBranding: () => Promise<void>;
}

const BrandingContext = createContext<BrandingContextType | undefined>(undefined);

export const BrandingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [branding, setBranding] = useState<Branding>(DEFAULT_BRANDING);
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
    <BrandingContext.Provider value={{ branding, loading, fullName, refreshBranding: fetchBranding }}>
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
