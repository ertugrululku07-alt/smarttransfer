'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import apiClient from '@/lib/api-client';

interface Currency {
  code: string;
  symbol: string;
  rate: number;
  isDefault?: boolean;
}

interface CurrencyContextType {
  currencies: Currency[];
  selectedCurrency: string;
  setCurrency: (code: string) => void;
  convertPrice: (amount: number, fromCurrencyCode: string, toCurrencyCode?: string) => number;
  formatPrice: (amount: number, fromCurrencyCode: string) => string;
  loading: boolean;
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

export const CurrencyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [selectedCurrency, setSelectedCurrency] = useState<string>('EUR'); // Safe default
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Determine user preferred or timezone-based currency
    const detectCurrency = () => {
      try {
        const saved = localStorage.getItem('preferredCurrency');
        if (saved) return saved;

        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
        
        // Turkey
        if (tz === 'Europe/Istanbul') return 'TRY';
        
        // Eurozone defaults (List of common European non-USD/TRY timezones)
        // Explicitly exclude Russia (Moscow, Samara, etc), UK (London), Ukraine (Kyiv)
        if (tz.startsWith('Europe/') && 
            !tz.includes('Moscow') && 
            !tz.includes('Istanbul') &&
            !tz.includes('Samara') &&
            !tz.includes('Volgograd') &&
            !tz.includes('Saratov') &&
            !tz.includes('London') &&
            !tz.includes('Kyiv') &&
            !tz.includes('Minsk')) {
          return 'EUR';
        }

        // Africa, Asia (Arab countries), Americas, Russia -> USD
        return 'USD';
      } catch (e) {
        return 'USD';
      }
    };

    const fetchCurrencies = async () => {
      try {
        const res = await apiClient.get('/api/tenant/info');
        if (res.data.success && res.data.data.tenant?.settings?.definitions?.currencies) {
          const fetchedCurrencies = res.data.data.tenant.settings.definitions.currencies;
          setCurrencies(fetchedCurrencies);
          
          const autoDetected = detectCurrency();
          
          // Ensure auto-detected currency exists in the fetched list
          const exists = fetchedCurrencies.some((c: Currency) => c.code === autoDetected);
          if (exists) {
            setSelectedCurrency(autoDetected);
          } else {
             // Fallback to tenant default
             const tenantDefault = fetchedCurrencies.find((c: Currency) => c.isDefault);
             if (tenantDefault) setSelectedCurrency(tenantDefault.code);
             else if (fetchedCurrencies.length > 0) setSelectedCurrency(fetchedCurrencies[0].code);
          }
        }
      } catch (error) {
        console.error('Failed to strict-fetch currencies', error);
      } finally {
        setLoading(false);
      }
    };

    fetchCurrencies();
  }, []);

  const handleSetCurrency = (code: string) => {
    setSelectedCurrency(code);
    localStorage.setItem('preferredCurrency', code);
  };

  /**
   * Convert price from one currency to another using the tenant rates.
   * e.g., if Base is EUR (1) -> TRY (35), converting 50 EUR to TRY = 50 * 35 / 1 = 1750
   */
  const convertPrice = (amount: number, fromCode: string, toCode?: string) => {
    if (!currencies.length) return amount;
    const targetCode = toCode || selectedCurrency;
    if (fromCode === targetCode) return amount;

    const fromCurr = currencies.find(c => c.code === fromCode);
    const toCurr = currencies.find(c => c.code === targetCode);

    // If exchange rates aren't found, return raw (failsafe)
    if (!fromCurr || !toCurr) return amount;

    // Standard cross-multiplication: (Amount / FromRate) * ToRate
    // e.g., if TRY=1 (base), EUR=35, USD=30:
    // Converting 50 EUR to USD: (50 / 35) * 30 -> No wait, 
    // Their Kur in screenshot: TRY=1, EUR=51.5, USD=44.5
    // If EUR is 51.5 TRY, then Base is TRY=1.
    // 1 EUR = 51.5 base units.
    // 50 EUR in Base = 50 * 51.5 = 2575.
    // Base to USD = 2575 / 44.5 = 57.86.
    // Formula: (amount * fromCurr.rate) / toCurr.rate
    
    const baseValue = amount * (fromCurr.rate || 1);
    const converted = baseValue / (toCurr.rate || 1);

    return Math.round(converted);
  };

  const formatPrice = (amount: number, fromCode: string) => {
    const converted = convertPrice(amount, fromCode);
    const curr = currencies.find(c => c.code === selectedCurrency);
    const symbol = curr ? curr.symbol : selectedCurrency;
    
    // Some formats prefer symbol first, some last. The user requested symbol on the right (e.g. 61.00 € or 3.142 ₺)
    // We will use 2 decimal places to match their "61.00" request, and output matching TR locale.
    const formattedNum = converted.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `${formattedNum} ${symbol}`;
  };

  return (
    <CurrencyContext.Provider value={{ currencies, selectedCurrency, setCurrency: handleSetCurrency, convertPrice, formatPrice, loading }}>
      {children}
    </CurrencyContext.Provider>
  );
};

export const useCurrency = () => {
  const context = useContext(CurrencyContext);
  if (context === undefined) {
    throw new Error('useCurrency must be used within a CurrencyProvider');
  }
  return context;
};
