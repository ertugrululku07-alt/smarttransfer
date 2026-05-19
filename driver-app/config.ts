import Constants from 'expo-constants';

type ExtraConfig = {
  apiUrl?: string;
  socketUrl?: string;
  tenantSlug?: string;
};

function readExtra(): ExtraConfig {
  return (Constants.expoConfig?.extra ?? {}) as ExtraConfig;
}

function requireConfig(envKey: string, extraKey: keyof ExtraConfig): string {
  const extra = readExtra();
  const value = (process.env[envKey] || extra[extraKey] || '').trim();
  if (value) return value.replace(/\/$/, '');

  if (__DEV__) {
    console.warn(
      `[config] Missing ${envKey}. Set it in .env or run 'node setup.js' from the project root.`
    );
    return '';
  }

  throw new Error(`Missing required mobile config: ${envKey}`);
}

const rawApiUrl = requireConfig('EXPO_PUBLIC_API_URL', 'apiUrl');
export const API_URL = rawApiUrl.endsWith('/api') ? rawApiUrl : `${rawApiUrl}/api`;
export const BASE_URL = API_URL.replace(/\/api$/, '');
export const SOCKET_URL = requireConfig('EXPO_PUBLIC_SOCKET_URL', 'socketUrl') || BASE_URL;
export const TENANT_SLUG = requireConfig('EXPO_PUBLIC_TENANT_SLUG', 'tenantSlug');

export function apiHeaders(token?: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (TENANT_SLUG) headers['X-Tenant-Slug'] = TENANT_SLUG;
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}
