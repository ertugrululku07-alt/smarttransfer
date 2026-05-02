import { Platform } from 'react-native';

export const Brand = {
  primary: '#059669',
  primaryLight: '#6ee7b7',
  primaryDark: '#047857',
  secondary: '#0f172a',

  success: '#10b981',
  successBg: '#ecfdf5',
  warning: '#f59e0b',
  warningBg: '#fef3c7',
  danger: '#ef4444',
  dangerBg: '#fee2e2',
  info: '#3b82f6',
  infoBg: '#dbeafe',

  text: '#0f172a',
  textSecondary: '#64748b',
  textMuted: '#94a3b8',
  textLight: '#cbd5e1',

  background: '#f8fafc',
  surface: '#ffffff',
  border: '#e2e8f0',
  borderLight: '#f1f5f9',

  headerBg: '#0f172a',
  cardShadow: '#000',
};

export const StatusColors: Record<string, { bg: string; text: string; label: string }> = {
  PENDING:     { bg: '#fef3c7', text: '#92400e', label: 'Bekliyor' },
  CONFIRMED:   { bg: '#d1fae5', text: '#065f46', label: 'Onaylandı' },
  IN_PROGRESS: { bg: '#dbeafe', text: '#1e40af', label: 'Devam Ediyor' },
  COMPLETED:   { bg: '#ecfdf5', text: '#059669', label: 'Tamamlandı' },
  CANCELLED:   { bg: '#fee2e2', text: '#991b1b', label: 'İptal' },
  NO_SHOW:     { bg: '#fee2e2', text: '#991b1b', label: 'Gelmedi' },
  IN_POOL:     { bg: '#fef3c7', text: '#92400e', label: 'Havuzda' },
};

export const Colors = {
  light: {
    text: '#11181C',
    background: '#fff',
    tint: '#059669',
    icon: '#687076',
    tabIconDefault: '#94a3b8',
    tabIconSelected: '#059669',
  },
  dark: {
    text: '#ECEDEE',
    background: '#151718',
    tint: '#6ee7b7',
    icon: '#9BA1A6',
    tabIconDefault: '#9BA1A6',
    tabIconSelected: '#6ee7b7',
  },
};

export const API_URL = 'http://187.127.76.249/api';
