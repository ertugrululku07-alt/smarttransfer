import tr from './tr';
import en from './en';
import de from './de';
import ru from './ru';

// Built-in locales with full static translations
export type BuiltInLocale = 'tr' | 'en' | 'de' | 'ru';

// SupportedLocale now accepts any string for dynamic languages
export type SupportedLocale = string;

// Built-in locales that have static .ts files
export const builtInLocales: BuiltInLocale[] = ['tr', 'en', 'de', 'ru'];

// Default supported locales (can be overridden by tenant settings from API)
export let supportedLocales: string[] = ['tr', 'en', 'de', 'ru'];

// Allow updating from API
export function setSupportedLocales(langs: string[]) {
  supportedLocales = langs;
}

export const locales: Record<string, Record<string, string>> = {
  tr,
  en,
  de,
  ru,
};

// Default labels for built-in locales
export const localeLabels: Record<string, { label: string; flag: string }> = {
  tr: { label: 'Türkçe', flag: '🇹🇷' },
  en: { label: 'English', flag: '🇬🇧' },
  de: { label: 'Deutsch', flag: '🇩🇪' },
  ru: { label: 'Русский', flag: '🇷🇺' },
};

// Allow adding dynamic labels from API
export function setLocaleLabels(langs: { code: string; name: string; flag: string }[]) {
  for (const l of langs) {
    localeLabels[l.code] = { label: l.name, flag: l.flag };
  }
}

// DeepL language code mapping
export const localeToDeepL: Record<string, string> = {
  tr: 'TR',
  en: 'EN',
  de: 'DE',
  ru: 'RU',
};

export default locales;
