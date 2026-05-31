'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { locales, supportedLocales, SupportedLocale, setSupportedLocales, setLocaleLabels } from '../locales';
import { API_URL } from '@/lib/api-client';
import { fetchTenantInfo } from '@/lib/tenant-info-cache';

interface LanguageContextType {
  locale: SupportedLocale;
  setLocale: (locale: SupportedLocale) => void;
  t: (key: string, params?: Record<string, string>) => string;
  translateDynamic: (text: string, targetLang?: string) => Promise<string>;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const TENANT_SLUG = (process.env.NEXT_PUBLIC_TENANT_SLUG || 'smarttravel-demo').replace(/[\r\n]+/g, '').trim();

// LocalStorage cache keys
const DYNAMIC_CACHE_KEY = 'i18n_dynamic_cache';
const AUTO_TRANSLATE_CACHE_KEY = 'i18n_auto_translate';

// ─── Cache Helpers ───
function getCache(storageKey: string): Record<string, string> {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(storageKey) || '{}');
  } catch { return {}; }
}

function setCache(storageKey: string, cache: Record<string, string>, maxEntries = 2000) {
  if (typeof window === 'undefined') return;
  try {
    const entries = Object.entries(cache);
    if (entries.length > maxEntries) {
      cache = Object.fromEntries(entries.slice(-(maxEntries * 0.8)));
    }
    localStorage.setItem(storageKey, JSON.stringify(cache));
  } catch { /* storage full */ }
}

/**
 * Detect locale. Priority:
 * 1. URL path prefix (/en/, /de/, /ru/)
 * 2. localStorage (user's explicit previous choice)
 * 3. Cookie (set by middleware or language switcher)
 * 4. Browser language (navigator.languages) — for first-time SPA navigation
 * 5. Default: 'tr' (site's primary language)
 */
// App route prefixes that must NOT be treated as a language code
const RESERVED_PREFIXES = ['admin', 'account', 'agency', 'driver', 'track', 'login', 'register', 'contact', 'sayfa', 'rate', 'transfer', 'api', 'partner', 'blog'];

function detectBrowserLocale(): SupportedLocale {
  if (typeof window === 'undefined') return 'tr';

  // 1. Check URL path for locale prefix.
  // The middleware has already rewritten /{lang}/... → /... so the URL prefix is
  // authoritative. We must trust ANY valid 2-letter prefix here (not just the
  // built-in ones) because supportedLocales is loaded from the API asynchronously
  // and is not yet populated on first paint — otherwise dynamic languages (e.g. /ar)
  // would incorrectly fall back to 'tr'.
  const pathSegments = window.location.pathname.split('/');
  const urlLocale = pathSegments[1]; // e.g. "en" from "/en/about"
  if (urlLocale && /^[a-z]{2}$/.test(urlLocale) && !RESERVED_PREFIXES.includes(urlLocale)) {
    // Save to localStorage so it persists
    localStorage.setItem('locale', urlLocale);
    return urlLocale as SupportedLocale;
  }

  // 2. Check localStorage (user's explicit choice)
  const stored = localStorage.getItem('locale');
  if (stored && supportedLocales.includes(stored as SupportedLocale)) {
    return stored as SupportedLocale;
  }

  // 3. Check cookie (set by middleware or language switcher)
  const cookieMatch = document.cookie.match(/(?:^|; )locale=([a-z]{2})/);
  const cookieLocale = cookieMatch?.[1];
  if (cookieLocale && supportedLocales.includes(cookieLocale as SupportedLocale)) {
    return cookieLocale as SupportedLocale;
  }

  // 4. Browser language detection (first visit, middleware should have already redirected
  //    but this is a fallback for client-side only scenarios)
  const browserLangs = navigator.languages || [navigator.language];
  for (const lang of browserLangs) {
    const code = lang.toLowerCase().split('-')[0];
    if (code && supportedLocales.includes(code as SupportedLocale)) {
      return code as SupportedLocale;
    }
  }

  // 5. Default
  return 'tr';
}

// ─── Batch Translation Queue ───
let batchQueue: { text: string; cacheKey: string; resolve: (v: string) => void }[] = [];
let batchTimer: ReturnType<typeof setTimeout> | null = null;
let autoTranslateCache: Record<string, string> = {};

async function flushBatchQueue(targetLang: string) {
  const items = [...batchQueue];
  batchQueue = [];
  batchTimer = null;

  if (items.length === 0) return;

  const texts = items.map(i => i.text);

  try {
    const res = await fetch(`${API_URL}/api/translate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Tenant-Slug': TENANT_SLUG,
      },
      body: JSON.stringify({
        texts,
        targetLang,
        sourceLang: 'tr'
      })
    });

    if (res.ok) {
      const data = await res.json();
      const translations: string[] = data?.data?.translations || [];
      items.forEach((item, idx) => {
        const translated = translations[idx] || item.text;
        autoTranslateCache[item.cacheKey] = translated;
        item.resolve(translated);
      });
      setCache(AUTO_TRANSLATE_CACHE_KEY, autoTranslateCache);
    } else {
      items.forEach(item => item.resolve(item.text));
    }
  } catch {
    items.forEach(item => item.resolve(item.text));
  }
}

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [locale, setLocaleState] = useState<SupportedLocale>('tr');
  const [ready, setReady] = useState(false);
  const dynamicCacheRef = useRef<Record<string, string>>({});
  const pendingTranslations = useRef<Map<string, Promise<string>>>(new Map());
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    const detected = detectBrowserLocale();
    setLocaleState(detected);
    dynamicCacheRef.current = getCache(DYNAMIC_CACHE_KEY);
    autoTranslateCache = getCache(AUTO_TRANSLATE_CACHE_KEY);
    setReady(true);

    // Load dynamic languages from tenant info
    fetchTenantInfo({ lang: detected }).then(res => {
      const tenant = res?.data?.data?.tenant;
      if (tenant?.supportedLanguages) {
        setSupportedLocales(tenant.supportedLanguages);
      }
      if (tenant?.availableLanguages) {
        setLocaleLabels(tenant.availableLanguages);
      }
    }).catch(() => {});
  }, []);

  // Keep <html lang> and text direction in sync with the active locale.
  // RTL languages need dir="rtl" for correct layout (Arabic, Hebrew, Farsi, Urdu).
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const RTL_LOCALES = ['ar', 'he', 'fa', 'ur'];
    document.documentElement.lang = locale;
    document.documentElement.dir = RTL_LOCALES.includes(locale) ? 'rtl' : 'ltr';
  }, [locale]);

  const setLocale = useCallback((newLocale: SupportedLocale) => {
    setLocaleState(newLocale);
    if (typeof window !== 'undefined') {
      localStorage.setItem('locale', newLocale);
      document.cookie = `locale=${newLocale};path=/;max-age=${365 * 24 * 60 * 60};SameSite=Lax`;

      // Navigate to locale-prefixed URL for SEO
      const currentPath = window.location.pathname;
      const pathSegments = currentPath.split('/');
      const currentUrlLocale = pathSegments[1];
      const hasLocalePrefix = supportedLocales.includes(currentUrlLocale as SupportedLocale);
      
      let newPath: string;
      if (newLocale === 'tr') {
        // TR is default — no prefix
        newPath = hasLocalePrefix ? '/' + pathSegments.slice(2).join('/') || '/' : currentPath;
      } else {
        // Non-default locale — add prefix
        const basePath = hasLocalePrefix ? '/' + pathSegments.slice(2).join('/') || '/' : currentPath;
        newPath = `/${newLocale}${basePath === '/' ? '' : basePath}`;
      }
      
      if (newPath !== currentPath) {
        window.location.href = newPath;
        return;
      }
    }
    if (typeof document !== 'undefined') {
      document.documentElement.lang = newLocale;
    }
  }, []);

  /**
   * Translation function with automatic DeepL fallback.
   * 
   * Priority:
   * 1. Current locale file (instant)
   * 2. Auto-translate cache from localStorage (instant)
   * 3. DeepL API call (async, returns TR text first then re-renders with translation)
   * 
   * For keys that exist in TR but not in the current locale,
   * it will automatically translate via DeepL and cache permanently.
   */
  const t = useCallback((key: string, params?: Record<string, string>): string => {
    const trDict = locales.tr;
    // A locale is "built-in" only if it has its own static dictionary (tr/en/de/ru).
    // For dynamic languages (ar, fr, es, ...) there is NO dictionary, so we must NOT
    // fall back to the TR dict here — otherwise value would be the Turkish string
    // (truthy) and the DeepL auto-translate path below would be skipped, leaving the
    // whole UI in Turkish.
    const isBuiltIn = !!locales[locale];
    const currentDict = isBuiltIn ? locales[locale] : {};

    // 1. Key exists in current built-in locale → use it directly
    let value = currentDict[key];

    // 2. Key not available in current locale but exists in TR → auto-translate via DeepL
    if (!value && locale !== 'tr' && trDict[key]) {
      const trText = trDict[key];
      const cacheKey = `${locale}:${key}`;

      // Check auto-translate cache (instant)
      if (autoTranslateCache[cacheKey]) {
        value = autoTranslateCache[cacheKey];
      } else {
        // Return TR text immediately, queue background translation
        value = trText;

        // Queue for batch translation (debounced)
        const alreadyQueued = batchQueue.some(q => q.cacheKey === cacheKey);
        if (!alreadyQueued) {
          const p = new Promise<string>((resolve) => {
            batchQueue.push({ text: trText, cacheKey, resolve });
          });
          p.then(() => {
            // Force re-render when translation arrives
            forceUpdate(n => n + 1);
          });

          // Debounce: flush after 100ms of no new additions
          if (batchTimer) clearTimeout(batchTimer);
          batchTimer = setTimeout(() => flushBatchQueue(locale), 100);
        }
      }
    }

    // 3. Key doesn't exist anywhere → return key itself
    if (!value) value = trDict[key] || key;

    // Replace {param} placeholders
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        value = value.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
      });
    }

    return value;
  }, [locale]);

  /**
   * Translate dynamic/CMS text using DeepL API with caching.
   * For content not in locale files (e.g., user-generated content, CMS pages).
   */
  const translateDynamic = useCallback(async (text: string, targetLang?: string): Promise<string> => {
    const target = targetLang || locale;
    if (target === 'tr') return text;
    if (!text || text.trim().length === 0) return text;

    const cacheKey = `${target}:${text.substring(0, 100)}`;
    
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
          dynamicCacheRef.current[cacheKey] = translated;
          setCache(DYNAMIC_CACHE_KEY, dynamicCacheRef.current);
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
