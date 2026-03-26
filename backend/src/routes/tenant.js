// src/routes/tenant.js
// Tenant & module configuration routes

const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

/**
 * GET /api/tenant/info
 * Get current tenant information
 */
router.get('/info', async (req, res) => {
    try {

        // Fetch fresh tenant data to ensure settings are up to date
        const tenant = await prisma.tenant.findUnique({
            where: { id: req.tenant.id }
        });

        if (!tenant) {
            return res.status(404).json({
                success: false,
                error: 'Tenant not found'
            });
        }

        res.json({
            success: true,
            data: {
                tenant: {
                    id: tenant.id,
                    slug: tenant.slug,
                    name: tenant.name,
                    status: tenant.status,
                    plan: tenant.plan,
                    branding: {
                        primaryColor: tenant.primaryColor,
                        secondaryColor: tenant.secondaryColor,
                        accentColor: tenant.accentColor
                    },
                    modules: {
                        transfer: tenant.transferEnabled,
                        tour: tenant.tourEnabled,
                        hotel: tenant.hotelEnabled
                    },
                    locale: tenant.defaultLocale,
                    currency: tenant.defaultCurrency,
                    settings: tenant.settings || {}
                }
            }
        });
    } catch (error) {
        console.error('Get tenant error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load tenant'
        });
    }
});

/**
 * GET /api/tenant/settings
 * Get tenant settings (hubs, definitions, etc.)
 */
router.get('/settings', async (req, res) => {
    try {
        const tenant = await prisma.tenant.findUnique({
            where: { id: req.tenant.id },
            select: { settings: true }
        });

        if (!tenant) {
            return res.status(404).json({ success: false, error: 'Tenant not found' });
        }

        res.json({
            success: true,
            data: tenant.settings || {}
        });
    } catch (error) {
        console.error('Get settings error:', error);
        res.status(500).json({ success: false, error: 'Failed to load settings' });
    }
});



/**
 * PUT /api/tenant/settings
 * Update tenant settings (Admin only)
 */
router.put('/settings', authMiddleware, async (req, res) => {
    try {
        const { googleMaps, heroBackground, definitions, salaryPaymentDay, hubs, siteTheme, branding, homepageSections, homepageFaq, homepageStats, homepageRoutes, homepageFeatures, customTheme } = req.body;

        // Check permission
        if (req.user.roleType !== 'TENANT_ADMIN' && req.user.roleType !== 'SUPER_ADMIN') {
            return res.status(403).json({
                success: false,
                error: 'Permission denied'
            });
        }

        // Get current settings to merge
        const currentTenant = await prisma.tenant.findUnique({
            where: { id: req.user.tenantId },
            select: { settings: true }
        });

        if (!currentTenant) {
            return res.status(404).json({
                success: false,
                error: 'Tenant not found'
            });
        }

        const currentSettings = currentTenant.settings || {};
        const newSettings = {
            ...currentSettings,
            googleMaps: {
                ...currentSettings.googleMaps,
                ...googleMaps
            },
            heroBackground: heroBackground ? {
                ...currentSettings.heroBackground,
                ...heroBackground
            } : currentSettings.heroBackground,
            definitions: definitions !== undefined ? definitions : currentSettings.definitions,
            salaryPaymentDay: salaryPaymentDay !== undefined ? salaryPaymentDay : currentSettings.salaryPaymentDay,
            hubs: hubs !== undefined ? hubs : currentSettings.hubs,
            siteTheme: siteTheme !== undefined ? siteTheme : currentSettings.siteTheme,
            branding: branding ? {
                ...currentSettings.branding,
                ...branding
            } : currentSettings.branding,
            homepageSections: homepageSections !== undefined ? homepageSections : currentSettings.homepageSections,
            homepageFaq: homepageFaq !== undefined ? homepageFaq : currentSettings.homepageFaq,
            homepageStats: homepageStats !== undefined ? homepageStats : currentSettings.homepageStats,
            homepageRoutes: homepageRoutes !== undefined ? homepageRoutes : currentSettings.homepageRoutes,
            homepageFeatures: homepageFeatures !== undefined ? homepageFeatures : currentSettings.homepageFeatures,
            customTheme: customTheme !== undefined ? customTheme : currentSettings.customTheme
        };

        const updatedTenant = await prisma.tenant.update({
            where: { id: req.user.tenantId },
            data: { settings: newSettings },
            select: { settings: true }
        });

        res.json({
            success: true,
            data: {
                settings: updatedTenant.settings
            }
        });

    } catch (error) {
        console.error('Update settings error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update settings'
        });
    }
});

// ... (rest of the file)

/**
 * GET /api/tenant/modules
 * Get active modules for current tenant
 */
router.get('/modules', async (req, res) => {
    try {
        const tenant = req.tenant;

        if (!tenant) {
            return res.status(404).json({
                success: false,
                error: 'Tenant not found'
            });
        }

        res.json({
            success: true,
            data: {
                modules: {
                    transfer: tenant.transferEnabled,
                    tour: tenant.tourEnabled,
                    hotel: tenant.hotelEnabled,
                    flight: tenant.flightEnabled,
                    car: tenant.carEnabled,
                    cruise: tenant.cruiseEnabled
                }
            }
        });
    } catch (error) {
        console.error('Get modules error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load modules'
        });
    }
});

/**
 * PUT /api/tenant/modules
 * Update active modules (Admin only)
 */
router.put('/modules', authMiddleware, async (req, res) => {
    try {
        const { transfer, tour, hotel, flight, car, cruise } = req.body;

        // Check permission (only tenant admin can update)
        if (req.user.roleType !== 'TENANT_ADMIN' && req.user.roleType !== 'SUPER_ADMIN') {
            return res.status(403).json({
                success: false,
                error: 'Permission denied'
            });
        }

        // Update tenant modules
        const updatedTenant = await prisma.tenant.update({
            where: { id: req.user.tenantId },
            data: {
                transferEnabled: transfer !== undefined ? transfer : undefined,
                tourEnabled: tour !== undefined ? tour : undefined,
                hotelEnabled: hotel !== undefined ? hotel : undefined,
                flightEnabled: flight !== undefined ? flight : undefined,
                carEnabled: car !== undefined ? car : undefined,
                cruiseEnabled: cruise !== undefined ? cruise : undefined
            },
            select: {
                transferEnabled: true,
                tourEnabled: true,
                hotelEnabled: true,
                flightEnabled: true,
                carEnabled: true,
                cruiseEnabled: true
            }
        });

        res.json({
            success: true,
            data: {
                modules: {
                    transfer: updatedTenant.transferEnabled,
                    tour: updatedTenant.tourEnabled,
                    hotel: updatedTenant.hotelEnabled,
                    flight: updatedTenant.flightEnabled,
                    car: updatedTenant.carEnabled,
                    cruise: updatedTenant.cruiseEnabled
                }
            }
        });

    } catch (error) {
        console.error('Update modules error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update modules'
        });
    }
});

/**
 * GET /api/tenant/hero-images
 * Get hero images for current tenant
 */
router.get('/hero-images', async (req, res) => {
    try {
        const tenant = req.tenant;

        if (!tenant) {
            return res.status(404).json({
                success: false,
                error: 'Tenant not found'
            });
        }

        res.json({
            success: true,
            data: {
                heroImages: tenant.heroImages
            }
        });
    } catch (error) {
        console.error('Get hero images error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load hero images'
        });
    }
});

/**
 * PUT /api/tenant/hero-images
 * Update hero images (Admin only)
 */
router.put('/hero-images', authMiddleware, async (req, res) => {
    try {
        const { images } = req.body;

        if (!Array.isArray(images)) {
            return res.status(400).json({
                success: false,
                error: 'Images must be an array'
            });
        }

        // Check permission (only tenant admin can update)
        if (req.user.roleType !== 'TENANT_ADMIN' && req.user.roleType !== 'SUPER_ADMIN') {
            return res.status(403).json({
                success: false,
                error: 'Permission denied'
            });
        }

        // Update tenant images
        const updatedTenant = await prisma.tenant.update({
            where: { id: req.user.tenantId },
            data: {
                heroImages: images
            },
            select: {
                heroImages: true
            }
        });

        res.json({
            success: true,
            data: {
                heroImages: updatedTenant.heroImages
            }
        });

    } catch (error) {
        console.error('Update hero images error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update hero images'
        });
    }
});

/**
 * GET /api/tenant/theme
 * Get active theme for current tenant
 */
router.get('/theme', async (req, res) => {
    try {
        const tenant = req.tenant;

        if (!tenant) {
            return res.status(404).json({
                success: false,
                error: 'Tenant not found'
            });
        }

        // Check for active theme
        const now = new Date();
        const activeTheme = await prisma.theme.findFirst({
            where: {
                OR: [
                    { tenantId: tenant.id, isActive: true },
                    { isPublic: true, isActive: true }
                ],
                AND: [
                    {
                        OR: [
                            { activeFrom: null },
                            { activeFrom: { lte: now } }
                        ]
                    },
                    {
                        OR: [
                            { activeTo: null },
                            { activeTo: { gte: now } }
                        ]
                    }
                ]
            },
            orderBy: [
                { tenantId: 'desc' }, // Tenant-specific themes first
                { category: 'asc' }   // SEASONAL before DEFAULT
            ]
        });

        // Fallback to default theme
        const theme = activeTheme || await prisma.theme.findFirst({
            where: { isDefault: true }
        });

        if (!theme) {
            return res.json({
                success: true,
                data: {
                    theme: {
                        code: 'default',
                        name: 'Default',
                        colors: {
                            primary: tenant.primaryColor,
                            secondary: tenant.secondaryColor,
                            accent: tenant.accentColor
                        }
                    }
                }
            });
        }

        res.json({
            success: true,
            data: {
                theme: {
                    code: theme.code,
                    name: theme.name,
                    category: theme.category,
                    config: theme.config
                }
            }
        });

    } catch (error) {
        console.error('Get theme error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load theme'
        });
    }
});

/**
 * GET /api/tenant/payment-providers
 * Get payment provider settings (PayTR, İyzico etc.)
 */
router.get('/payment-providers', authMiddleware, async (req, res) => {
    try {
        const tenant = await prisma.tenant.findUnique({
            where: { id: req.user.tenantId },
            select: { paymentProviders: true }
        });

        if (!tenant) {
            return res.status(404).json({ success: false, error: 'Tenant not found' });
        }

        // Never expose secret keys in full — mask them
        const providers = tenant.paymentProviders || {};
        const maskedProviders = {};

        for (const [key, config] of Object.entries(providers)) {
            maskedProviders[key] = { ...config };
            // Mask secret keys
            if (maskedProviders[key].secretKey) {
                maskedProviders[key].secretKey = '••••••••' + String(maskedProviders[key].secretKey).slice(-4);
            }
            if (maskedProviders[key].paytrKey) {
                maskedProviders[key].paytrKey = '••••••••' + String(maskedProviders[key].paytrKey).slice(-4);
            }
        }

        res.json({ success: true, data: { paymentProviders: maskedProviders } });
    } catch (error) {
        console.error('Get payment providers error:', error);
        res.status(500).json({ success: false, error: 'Failed to load payment providers' });
    }
});

/**
 * PUT /api/tenant/payment-providers
 * Update payment provider settings
 */
router.put('/payment-providers', authMiddleware, async (req, res) => {
    try {
        if (req.user.roleType !== 'TENANT_ADMIN' && req.user.roleType !== 'SUPER_ADMIN') {
            return res.status(403).json({ success: false, error: 'Permission denied' });
        }

        const { provider, config } = req.body;
        // provider: 'paytr' | 'iyzico'
        if (!provider || !config) {
            return res.status(400).json({ success: false, error: 'provider ve config zorunludur' });
        }

        // Get current providers to merge
        const currentTenant = await prisma.tenant.findUnique({
            where: { id: req.user.tenantId },
            select: { paymentProviders: true }
        });

        const currentProviders = currentTenant?.paymentProviders || {};

        // Masked fields: if the incoming value starts with '••••', keep old value
        const oldConfig = currentProviders[provider] || {};
        const mergedConfig = { ...oldConfig };

        for (const [key, val] of Object.entries(config)) {
            if (typeof val === 'string' && val.startsWith('••••••••')) {
                mergedConfig[key] = oldConfig[key]; // keep old
            } else {
                mergedConfig[key] = val;
            }
        }

        const updatedProviders = {
            ...currentProviders,
            [provider]: mergedConfig
        };

        await prisma.tenant.update({
            where: { id: req.user.tenantId },
            data: { paymentProviders: updatedProviders }
        });

        res.json({ success: true, message: `${provider} ayarları kaydedildi` });
    } catch (error) {
        console.error('Update payment providers error:', error);
        res.status(500).json({ success: false, error: 'Failed to update payment providers' });
    }
});

module.exports = router;
