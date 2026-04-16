'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { locales, supportedLocales, SupportedLocale } from '../locales';

interface LanguageContextType {
  locale: SupportedLocale;
  setLocale: (locale: SupportedLocale) => void;
  t: (key: string, params?: Record<string, string>) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

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

  useEffect(() => {
    const detected = detectBrowserLocale();
    setLocaleState(detected);
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

  // Don't render children until locale is detected to avoid hydration mismatch
  if (!ready) return null;

  return (
    <LanguageContext.Provider value={{ locale, setLocale, t }}>
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
