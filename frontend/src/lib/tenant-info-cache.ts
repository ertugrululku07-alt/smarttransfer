/**
 * Singleton in-flight cache for /api/tenant/info.
 *
 * Eliminates duplicate network requests when multiple providers/components
 * (BrandingContext, CurrencyContext, ThemeContext, SiteFooter, HomePageClient,
 * contact, track, etc.) all mount at the same time during initial page load.
 *
 * - Single in-flight promise is shared across simultaneous callers.
 * - Successful responses are cached for `TTL_MS` (default 30s).
 * - On error, the cache is invalidated so the next caller retries.
 * - Call `invalidateTenantInfo()` after admin saves to force a refresh.
 */

import apiClient from './api-client';

type TenantInfoResponse = any;

const TTL_MS = 30_000;

// Per-locale cache
const cache: Record<string, { data: TenantInfoResponse; at: number }> = {};
const inflights: Record<string, Promise<TenantInfoResponse>> = {};

/**
 * Returns the tenant info response. Reuses an in-flight request if one is
 * already pending, returns cached data if fresh, otherwise issues a new GET.
 * Pass `lang` to get locale-translated settings from the backend.
 */
export async function fetchTenantInfo(options?: { force?: boolean; lang?: string }): Promise<TenantInfoResponse> {
    const lang = options?.lang || getCurrentLocale();
    const cacheKey = lang;
    const now = Date.now();

    if (!options?.force && cache[cacheKey] && (now - cache[cacheKey].at) < TTL_MS) {
        return cache[cacheKey].data;
    }
    if (cacheKey in inflights && !options?.force) {
        return inflights[cacheKey];
    }
    inflights[cacheKey] = apiClient
        .get(`/api/tenant/info?lang=${lang}`)
        .then((res) => {
            cache[cacheKey] = { data: res, at: Date.now() };
            delete inflights[cacheKey];
            return res;
        })
        .catch((err) => {
            delete inflights[cacheKey];
            throw err;
        });
    return inflights[cacheKey];
}

/** Drops the cached tenant info for all locales, forcing the next call to refetch. */
export function invalidateTenantInfo() {
    Object.keys(cache).forEach(k => delete cache[k]);
    Object.keys(inflights).forEach(k => delete inflights[k]);
}

/** Helper to detect current locale from URL or localStorage */
function getCurrentLocale(): string {
    if (typeof window === 'undefined') return 'tr';
    const pathLocale = window.location.pathname.split('/')[1];
    if (['en', 'de', 'ru'].includes(pathLocale)) return pathLocale;
    return localStorage.getItem('locale') || 'tr';
}

/** Returns currently cached tenant info synchronously, or null if not loaded. */
export function getCachedTenantInfo(): TenantInfoResponse | null {
    const lang = getCurrentLocale();
    return cache[lang]?.data || null;
}
