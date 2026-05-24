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

let cachedData: TenantInfoResponse | null = null;
let cachedAt = 0;
let inflight: Promise<TenantInfoResponse> | null = null;

/**
 * Returns the tenant info response. Reuses an in-flight request if one is
 * already pending, returns cached data if fresh, otherwise issues a new GET.
 */
export async function fetchTenantInfo(options?: { force?: boolean }): Promise<TenantInfoResponse> {
    const now = Date.now();
    if (!options?.force && cachedData && (now - cachedAt) < TTL_MS) {
        return cachedData;
    }
    if (inflight && !options?.force) {
        return inflight;
    }
    inflight = apiClient
        .get('/api/tenant/info')
        .then((res) => {
            cachedData = res;
            cachedAt = Date.now();
            inflight = null;
            return res;
        })
        .catch((err) => {
            inflight = null;
            throw err;
        });
    return inflight;
}

/** Drops the cached tenant info, forcing the next call to refetch. */
export function invalidateTenantInfo() {
    cachedData = null;
    cachedAt = 0;
    inflight = null;
}

/** Returns currently cached tenant info synchronously, or null if not loaded. */
export function getCachedTenantInfo(): TenantInfoResponse | null {
    return cachedData;
}
