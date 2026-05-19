/**
 * Central runtime configuration — all values from environment or hostname derivation.
 * No hardcoded domains, tenant slugs, or API keys.
 */

function resolveApiUrl(): string {
    const fromEnv = process.env.NEXT_PUBLIC_API_URL?.trim();
    if (fromEnv) return fromEnv.replace(/\/$/, '');

    if (typeof window !== 'undefined') {
        const hostname = window.location.hostname;
        if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
            return `https://api.${hostname.replace(/^www\./, '')}`;
        }
    }

    if (process.env.NODE_ENV === 'development') {
        return 'http://localhost:4000';
    }

    throw new Error('NEXT_PUBLIC_API_URL must be set in production');
}

function resolveSocketUrl(): string {
    const fromEnv = process.env.NEXT_PUBLIC_SOCKET_URL?.trim();
    if (fromEnv) return fromEnv.replace(/\/$/, '');
    return resolveApiUrl();
}

function resolveTenantSlug(): string {
    const fromEnv = process.env.NEXT_PUBLIC_TENANT_SLUG?.trim();
    if (fromEnv) return fromEnv;

    if (typeof window !== 'undefined') {
        const hostname = window.location.hostname;
        if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
            const parts = hostname.replace(/^www\./, '').split('.');
            if (parts.length > 2) return parts[0];
        }
    }

    if (process.env.NODE_ENV === 'development') {
        return process.env.NEXT_PUBLIC_TENANT_SLUG || 'smarttravel-demo';
    }

    throw new Error('NEXT_PUBLIC_TENANT_SLUG must be set in production');
}

function resolveHereApiKey(): string {
    const key = process.env.NEXT_PUBLIC_HERE_API_KEY?.trim();
    if (!key) {
        if (process.env.NODE_ENV === 'development') {
            console.warn('[config] NEXT_PUBLIC_HERE_API_KEY is not set — map features will be disabled');
            return '';
        }
        throw new Error('NEXT_PUBLIC_HERE_API_KEY must be set in production');
    }
    return key;
}

/** Lazy getters — resolved at call time so SSR/client both work correctly */
export const config = {
    get apiUrl() { return resolveApiUrl(); },
    get socketUrl() { return resolveSocketUrl(); },
    get tenantSlug() { return resolveTenantSlug(); },
    get hereApiKey() { return resolveHereApiKey(); },
};

export const API_URL = config.apiUrl;
export const SOCKET_URL = config.socketUrl;
export const TENANT_SLUG = config.tenantSlug;
export const HERE_API_KEY = config.hereApiKey;
