/**
 * SmartTransfer Driver App — Centralized Theme
 */

import { Platform } from 'react-native';

// ─── Brand Colors ───
export const Brand = {
  primary: '#4361ee',
  primaryLight: '#a5b4fc',
  primaryDark: '#1e3a8a',
  secondary: '#7c3aed',

  success: '#10b981',
  successBg: '#ecfdf5',
  warning: '#f59e0b',
  warningBg: '#fffbeb',
  danger: '#ef4444',
  dangerBg: '#fef2f2',
  info: '#0ea5e9',
  infoBg: '#f0f9ff',

  text: '#111827',
  textSecondary: '#6b7280',
  textMuted: '#9ca3af',
  textLight: '#d1d5db',

  background: '#f0f2f8',
  surface: '#ffffff',
  border: '#e5e7eb',
  borderLight: '#f3f4f6',

  headerBg: '#1e3a8a',
  cardShadow: '#000',
};

// ─── Status Colors ───
export const StatusColors: Record<string, { bg: string; text: string; label: string }> = {
  CONFIRMED: { bg: '#eff6ff', text: '#2563eb', label: 'Onaylandı' },
  ASSIGNED: { bg: '#eff6ff', text: '#2563eb', label: 'Atandı' },
  ON_WAY: { bg: '#fef3c7', text: '#d97706', label: 'Yolda' },
  PICKUP: { bg: '#fef3c7', text: '#d97706', label: 'Alınıyor' },
  IN_PROGRESS: { bg: '#fff7ed', text: '#ea580c', label: 'Devam Ediyor' },
  COMPLETED: { bg: '#ecfdf5', text: '#059669', label: 'Tamamlandı' },
  CANCELLED: { bg: '#fef2f2', text: '#dc2626', label: 'İptal' },
  NO_SHOW: { bg: '#fef2f2', text: '#dc2626', label: 'Gelmedi' },
  PENDING: { bg: '#f5f3ff', text: '#7c3aed', label: 'Bekliyor' },
};

// ─── Navigation Theme Override ───
const tintColorLight = '#4361ee';
const tintColorDark = '#a5b4fc';

export const Colors = {
  light: {
    text: '#11181C',
    background: '#fff',
    tint: tintColorLight,
    icon: '#687076',
    tabIconDefault: '#9ca3af',
    tabIconSelected: tintColorLight,
  },
  dark: {
    text: '#ECEDEE',
    background: '#151718',
    tint: tintColorDark,
    icon: '#9BA1A6',
    tabIconDefault: '#9BA1A6',
    tabIconSelected: tintColorDark,
  },
};

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
