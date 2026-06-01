/**
 * Dynamic Brand Configuration
 * All brand/company names are fetched from the backend tenant settings.
 * This module provides helpers to read/write the cached brand info.
 */

import * as SecureStore from 'expo-secure-store';

const BRAND_KEY = 'tenant_brand';

export interface BrandInfo {
  name: string;
  slug: string;
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
}

const DEFAULT_BRAND: BrandInfo = {
  name: 'Sürücü',
  slug: '',
};

let cachedBrand: BrandInfo | null = null;

export async function loadBrand(): Promise<BrandInfo> {
  if (cachedBrand) return cachedBrand;
  try {
    const raw = await SecureStore.getItemAsync(BRAND_KEY);
    if (raw) {
      cachedBrand = JSON.parse(raw);
      return cachedBrand!;
    }
  } catch {}
  return DEFAULT_BRAND;
}

export async function saveBrand(info: BrandInfo): Promise<void> {
  cachedBrand = info;
  try {
    await SecureStore.setItemAsync(BRAND_KEY, JSON.stringify(info));
  } catch {}
}

export function getBrandSync(): BrandInfo {
  return cachedBrand || DEFAULT_BRAND;
}

export function getAppName(): string {
  return cachedBrand?.name || DEFAULT_BRAND.name;
}
