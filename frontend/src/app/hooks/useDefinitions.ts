'use client';

import { useState, useEffect } from 'react';
import apiClient from '@/lib/api-client';

// ── Types ──
export interface DefinitionCurrency {
  id: string;
  code: string;
  symbol: string;
  rate: number;
  isDefault?: boolean;
}

export interface DefinitionVatRate {
  id: string;
  name: string;
  rate: number;
  isDefault?: boolean;
}

interface DefinitionsState {
  currencies: DefinitionCurrency[];
  vatRates: DefinitionVatRate[];
  loading: boolean;
  defaultCurrency: DefinitionCurrency | null;
  defaultVatRate: DefinitionVatRate | null;
}

// ── Module-level cache (singleton, shared across all hook instances) ──
let _cache: { currencies: DefinitionCurrency[]; vatRates: DefinitionVatRate[] } | null = null;
let _fetched = false; // true once we got a server response (even if empty)
let _promise: Promise<void> | null = null;
let _retryCount = 0;
let _retryTimer: ReturnType<typeof setTimeout> | null = null;
const MAX_RETRIES = 3;
const RETRY_COOLDOWN = 30000; // 30s cooldown after max retries
let _lastFailTime = 0;
const _listeners = new Set<() => void>();

function notifyAll() {
  // Batch notification in a microtask to prevent render storms
  Promise.resolve().then(() => {
    _listeners.forEach(fn => fn());
  });
}

async function fetchOnce(isRetry = false) {
  // Skip if we already have successful data
  if (_fetched && _cache) return;
  // Skip if in cooldown after max retries
  if (_lastFailTime && Date.now() - _lastFailTime < RETRY_COOLDOWN) return;
  if (_promise) return _promise;
  _promise = (async () => {
    try {
      const res = await apiClient.get('/api/tenant/info');
      const defs = res.data?.data?.tenant?.settings?.definitions || {};
      _cache = {
        currencies: defs.currencies || [],
        vatRates: defs.vatRates || [],
      };
      _fetched = true;
      _retryCount = 0;
      _lastFailTime = 0;
    } catch (e) {
      console.error('[useDefinitions] fetch failed', e);
      // On Network Error, retry with backoff instead of caching empty
      if (_retryCount < MAX_RETRIES) {
        _retryCount++;
        _promise = null;
        const delay = Math.min(2000 * _retryCount, 8000);
        console.log(`[useDefinitions] retrying in ${delay}ms (attempt ${_retryCount}/${MAX_RETRIES})`);
        _retryTimer = setTimeout(() => fetchOnce(true), delay);
        return;
      }
      // After max retries, set empty cache so UI doesn't break
      _lastFailTime = Date.now();
      _cache = { currencies: [], vatRates: [] };
    } finally {
      _promise = null;
      notifyAll();
    }
  })();
  return _promise;
}

// Allow other contexts (CurrencyContext, ThemeContext) to populate cache without extra fetch
export function populateDefinitionsCache(defs: { currencies?: any[]; vatRates?: any[] }) {
  if (_fetched && _cache && _cache.currencies.length > 0) return; // already have good data
  _cache = {
    currencies: defs.currencies || [],
    vatRates: defs.vatRates || [],
  };
  if (_cache.currencies.length > 0) {
    _fetched = true;
    _retryCount = 0;
    _lastFailTime = 0;
    if (_retryTimer) { clearTimeout(_retryTimer); _retryTimer = null; }
    notifyAll();
  }
}

// ── Hook ──
export function useDefinitions(): DefinitionsState {
  const [, rerender] = useState(0);

  useEffect(() => {
    const cb = () => rerender(n => n + 1);
    _listeners.add(cb);
    // Defer initial fetch to avoid competing with other contexts hitting the same endpoint
    const timer = setTimeout(() => fetchOnce(), _cache ? 0 : 500);
    return () => { _listeners.delete(cb); clearTimeout(timer); };
  }, []);

  const currencies = _cache?.currencies || [];
  const vatRates = _cache?.vatRates || [];

  return {
    currencies,
    vatRates,
    loading: !_cache,
    defaultCurrency: currencies.find(c => c.isDefault) || currencies[0] || null,
    defaultVatRate: vatRates.find(v => v.isDefault) || vatRates[0] || null,
  };
}

// Force re-fetch (e.g. after editing definitions)
export function invalidateDefinitions() {
  _cache = null;
  _fetched = false;
  _promise = null;
  _retryCount = 0;
  _lastFailTime = 0;
  if (_retryTimer) { clearTimeout(_retryTimer); _retryTimer = null; }
  fetchOnce();
}
