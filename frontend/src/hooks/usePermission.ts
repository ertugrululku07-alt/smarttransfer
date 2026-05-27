'use client';

import { useAuth } from '@/app/context/AuthContext';
import { useCallback, useMemo } from 'react';

// ─── Module Definitions (must match backend) ────────────────────────────────
export const MODULE_DEFINITIONS = [
    { module: 'dashboard', label: 'Panel', icon: 'DashboardOutlined' },
    { module: 'reservations', label: 'Rezervasyonlar', icon: 'CalendarOutlined' },
    { module: 'operations', label: 'Operasyon Yönetimi', icon: 'AppstoreOutlined' },
    { module: 'accounting', label: 'Muhasebe', icon: 'BankOutlined' },
    { module: 'partners', label: 'Partner / Acente', icon: 'TeamOutlined' },
    { module: 'banks', label: 'Banka Yönetimi', icon: 'CreditCardOutlined' },
    { module: 'vehicles', label: 'Araç & Fiyat Tanımları', icon: 'CarOutlined' },
    { module: 'vehicle-tracking', label: 'Araç Takip', icon: 'BarChartOutlined' },
    { module: 'personnel', label: 'Personel Tanımları', icon: 'UserOutlined' },
    { module: 'campaigns', label: 'Kampanyalar & Sadakat', icon: 'GiftOutlined' },
    { module: 'reports', label: 'Raporlar', icon: 'BarChartOutlined' },
    { module: 'settings', label: 'Ayarlar & Kullanıcılar', icon: 'SettingOutlined' },
    { module: 'live-support', label: 'Canlı Destek', icon: 'MessageOutlined' },
] as const;

export type ModuleName = typeof MODULE_DEFINITIONS[number]['module'];
export type ActionName = 'view' | 'create' | 'update' | 'delete';

const SUPER_ROLES = new Set(['SUPER_ADMIN', 'TENANT_ADMIN']);

/**
 * Hook for checking user permissions.
 * 
 * Usage:
 *   const { can, canView, canCreate, canUpdate, canDelete, isSuperAdmin } = usePermission();
 *   
 *   if (can('accounting', 'view')) { ... }
 *   if (canView('reservations')) { ... }
 *   if (canDelete('personnel')) { ... }
 */
export function usePermission() {
    const { user } = useAuth();

    const isSuperAdmin = useMemo(() => {
        if (!user) return false;
        return SUPER_ROLES.has(user.role?.type) || SUPER_ROLES.has(user.role?.code);
    }, [user]);

    const can = useCallback((module: string, action: ActionName): boolean => {
        if (!user) return false;
        if (isSuperAdmin) return true;
        const permissions = user.permissions || [];
        return permissions.some(p => p.module === module && p.action === action);
    }, [user, isSuperAdmin]);

    const canView = useCallback((module: string) => can(module, 'view'), [can]);
    const canCreate = useCallback((module: string) => can(module, 'create'), [can]);
    const canUpdate = useCallback((module: string) => can(module, 'update'), [can]);
    const canDelete = useCallback((module: string) => can(module, 'delete'), [can]);

    const canAny = useCallback((module: string): boolean => {
        return canView(module) || canCreate(module) || canUpdate(module) || canDelete(module);
    }, [canView, canCreate, canUpdate, canDelete]);

    return { can, canView, canCreate, canUpdate, canDelete, canAny, isSuperAdmin, user };
}

/**
 * Map admin menu keys to their required module permissions.
 * Used by AdminLayout to filter menu items.
 */
export const MENU_MODULE_MAP: Record<string, ModuleName> = {
    // Dashboard
    'dashboard': 'dashboard',
    // Reservations
    'reservations': 'reservations',
    'transfers': 'reservations',
    // Operations
    'operations': 'operations',
    'op-dashboard': 'operations',
    'driver-tracking': 'operations',
    'operations-list': 'operations',
    'pool-transfers': 'operations',
    'partner-transfers': 'operations',
    'airport-greeting': 'operations',
    'uetds-submission': 'operations',
    // Accounting
    'accounting': 'accounting',
    'accounting-dashboard': 'accounting',
    'accounting-accounts': 'accounting',
    'accounting-invoices': 'accounting',
    'driver-collections': 'accounting',
    'kasa': 'accounting',
    'agency-deposits': 'accounting',
    'payroll': 'accounting',
    // Partners
    'partner-operations': 'partners',
    'partner-applications': 'partners',
    'agencies': 'partners',
    'agency-contracts': 'partners',
    'agency-statement': 'partners',
    // Banks
    'bank-management': 'banks',
    'bank-list': 'banks',
    'virtual-pos': 'banks',
    // Vehicles
    'vehicles-definitions': 'vehicles',
    'vehicles': 'vehicles',
    'vehicle-types': 'vehicles',
    'pricing': 'vehicles',
    'zones': 'vehicles',
    'shuttle-routes': 'vehicles',
    'extra-services': 'vehicles',
    // Vehicle Tracking
    'vehicle-tracking-group': 'vehicle-tracking',
    'vehicle-tracking-dashboard': 'vehicle-tracking',
    'vehicle-tracking-insurance': 'vehicle-tracking',
    'vehicle-tracking-fuel': 'vehicle-tracking',
    'vehicle-tracking-inspection': 'vehicle-tracking',
    'vehicle-tracking-maintenance': 'vehicle-tracking',
    // Personnel
    'personnel-definitions': 'personnel',
    'personnel-list': 'personnel',
    'driver-ratings': 'personnel',
    // Campaigns
    'campaigns-loyalty': 'campaigns',
    'campaigns': 'campaigns',
    'loyalty': 'campaigns',
    'messaging': 'campaigns',
    // Reports
    'reports': 'reports',
    'general-reports': 'reports',
    'logs': 'reports',
    // Settings
    'settings-group': 'settings',
    'site-settings': 'settings',
    'pages': 'settings',
    'users': 'settings',
    'blog': 'settings',
    'seo-tools': 'settings',
    'definitions': 'settings',
    'role-management': 'settings',
    // Live Support
    'live-support': 'live-support',
};
