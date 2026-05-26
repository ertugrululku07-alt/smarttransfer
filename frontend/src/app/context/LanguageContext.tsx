'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { locales, supportedLocales, SupportedLocale } from '../locales';
import { API_URL } from '@/lib/api-client';

interface LanguageContextType {
  locale: SupportedLocale;
  setLocale: (locale: SupportedLocale) => void;
  t: (key: string, params?: Record<string, string>) => string;
  translateDynamic: (text: string, targetLang?: string) => Promise<string>;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const TENANT_SLUG = (process.env.NEXT_PUBLIC_TENANT_SLUG || 'smarttravel-demo').replace(/[\r\n]+/g, '').trim();

// LocalStorage cache key for dynamic translations
const DYNAMIC_CACHE_KEY = 'i18n_dynamic_cache';

function getDynamicCache(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(DYNAMIC_CACHE_KEY) || '{}');
  } catch { return {}; }
}

function setDynamicCache(cache: Record<string, string>) {
  if (typeof window === 'undefined') return;
  try {
    // Limit cache size to 1000 entries
    const entries = Object.entries(cache);
    if (entries.length > 1000) {
      cache = Object.fromEntries(entries.slice(-800));
    }
    localStorage.setItem(DYNAMIC_CACHE_KEY, JSON.stringify(cache));
  } catch { /* storage full */ }
}

/**
 * Detect the best matching locale from the browser's navigator.languages.
 * Falls back to 'en' if no match, or 'tr' if the page is Turkish-origin.
 */
function detectBrowserLocale(): SupportedLocale {
  if (typeof window === 'undefined') return 'tr';

  // Check localStorage first (returning user preference)
  const stored = localStorage.getItem('locale');
  if (stored && supportedLocales.includes(stored as SupportedLocale)) {
    return stored as SupportedLocale;
  }

  // Detect from browser
  const browserLangs = navigator.languages || [navigator.language];
  for (const lang of browserLangs) {
    const code = lang.toLowerCase().split('-')[0];
    if (supportedLocales.includes(code as SupportedLocale)) {
      return code as SupportedLocale;
    }
  }

  // Default fallback
  return 'tr';
}

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [locale, setLocaleState] = useState<SupportedLocale>('tr');
  const [ready, setReady] = useState(false);
  const dynamicCacheRef = useRef<Record<string, string>>({});
  const pendingTranslations = useRef<Map<string, Promise<string>>>(new Map());

  useEffect(() => {
    const detected = detectBrowserLocale();
    setLocaleState(detected);
    dynamicCacheRef.current = getDynamicCache();
    setReady(true);
  }, []);

  const setLocale = useCallback((newLocale: SupportedLocale) => {
    setLocaleState(newLocale);
    if (typeof window !== 'undefined') {
      localStorage.setItem('locale', newLocale);
    }
    // Update html lang attribute
    if (typeof document !== 'undefined') {
      document.documentElement.lang = newLocale;
    }
  }, []);

  const t = useCallback((key: string, params?: Record<string, string>): string => {
    const dict = locales[locale] || locales.tr;
    let value = dict[key] || locales.tr[key] || key;

    // Replace {param} placeholders
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        value = value.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
      });
    }

    return value;
  }, [locale]);

  /**
   * Translate dynamic text using DeepL API with caching.
   * Use for CMS content, dynamic descriptions, etc.
   */
  const translateDynamic = useCallback(async (text: string, targetLang?: string): Promise<string> => {
    const target = targetLang || locale;
    if (target === 'tr') return text; // Source is Turkish, no translation needed

    const cacheKey = `${target}:${text}`;
    
    // Check memory cache
    if (dynamicCacheRef.current[cacheKey]) {
      return dynamicCacheRef.current[cacheKey];
    }

    // Check if already pending
    if (pendingTranslations.current.has(cacheKey)) {
      return pendingTranslations.current.get(cacheKey)!;
    }

    // Call DeepL API
    const promise = (async () => {
      try {
        const res = await fetch(`${API_URL}/api/translate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Tenant-Slug': TENANT_SLUG,
          },
          body: JSON.stringify({
            texts: [text],
            targetLang: target,
            sourceLang: 'tr'
          })
        });

        if (res.ok) {
          const data = await res.json();
          const translated = data?.data?.translations?.[0] || text;
          // Update cache
          dynamicCacheRef.current[cacheKey] = translated;
          setDynamicCache(dynamicCacheRef.current);
          return translated;
        }
      } catch (err) {
        console.warn('Dynamic translation failed:', err);
      }
      return text;
    })();

    pendingTranslations.current.set(cacheKey, promise);
    const result = await promise;
    pendingTranslations.current.delete(cacheKey);
    return result;
  }, [locale]);

  // Don't render children until locale is detected to avoid hydration mismatch
  if (!ready) return null;

  return (
    <LanguageContext.Provider value={{ locale, setLocale, t, translateDynamic }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = (): LanguageContextType => {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error('useLanguage must be used within LanguageProvider');
  }
  return ctx;
};
