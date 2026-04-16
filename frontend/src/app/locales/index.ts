import tr from './tr';
import en from './en';
import de from './de';
import ru from './ru';

export type SupportedLocale = 'tr' | 'en' | 'de' | 'ru';

export const locales: Record<SupportedLocale, Record<string, string>> = {
  tr,
  en,
  de,
  ru,
};

export const localeLabels: Record<SupportedLocale, { label: string; flag: string }> = {
  tr: { label: 'Türkçe', flag: '🇹🇷' },
  en: { label: 'English', flag: '🇬🇧' },
  de: { label: 'Deutsch', flag: '🇩🇪' },
  ru: { label: 'Русский', flag: '🇷🇺' },
};

export const supportedLocales: SupportedLocale[] = ['tr', 'en', 'de', 'ru'];

export default locales;
