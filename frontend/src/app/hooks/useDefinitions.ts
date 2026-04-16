'use client';

import { useState, useEffect, useCallback } from 'react';
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
let _promise: Promise<void> | null = null;
const _listeners = new Set<() => void>();

function notifyAll() {
  _listeners.forEach(fn => fn());
}

async function fetchOnce() {
  if (_cache) return;
  if (_promise) return _promise;
  _promise = (async () => {
    try {
      const res = await apiClient.get('/api/tenant/info');
      const defs = res.data?.data?.tenant?.settings?.definitions || {};
      _cache = {
        currencies: defs.currencies || [],
        vatRates: defs.vatRates || [],
      };
    } catch (e) {
      console.error('[useDefinitions] fetch failed', e);
      _cache = { currencies: [], vatRates: [] };
    } finally {
      _promise = null;
      notifyAll();
    }
  })();
  return _promise;
}

// ── Hook ──
export function useDefinitions(): DefinitionsState {
  const [, rerender] = useState(0);

  useEffect(() => {
    const cb = () => rerender(n => n + 1);
    _listeners.add(cb);
    fetchOnce();
    return () => { _listeners.delete(cb); };
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
  _promise = null;
  fetchOnce();
}
