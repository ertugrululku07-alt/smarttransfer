// src/routes/tenant.js
// Tenant & module configuration routes

const express = require('express');

const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
const prisma = require('../lib/prisma');

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
        const { googleMaps, heroBackground, definitions, salaryPaymentDay, hubs, siteTheme, branding, homepageSections, homepageFaq, homepageStats, homepageRoutes, homepageFeatures, customTheme, timeDefinitions, socialMedia, emailSettings, emailTemplate, whatsappSettings, driverSettings, flightTracking, operationSettings, uetdsSettings } = req.body;

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
            customTheme: customTheme !== undefined ? customTheme : currentSettings.customTheme,
            partnerCommissionRate: req.body.partnerCommissionRate !== undefined ? req.body.partnerCommissionRate : currentSettings.partnerCommissionRate,
            timeDefinitions: timeDefinitions !== undefined ? timeDefinitions : currentSettings.timeDefinitions,
            socialMedia: socialMedia !== undefined ? socialMedia : currentSettings.socialMedia,
            emailSettings: emailSettings ? {
                ...currentSettings.emailSettings,
                ...emailSettings
            } : currentSettings.emailSettings,
            emailTemplate: emailTemplate ? {
                ...currentSettings.emailTemplate,
                ...emailTemplate
            } : currentSettings.emailTemplate,
            whatsappSettings: whatsappSettings ? {
                ...currentSettings.whatsappSettings,
                ...whatsappSettings
            } : currentSettings.whatsappSettings,
            driverSettings: driverSettings ? {
                ...currentSettings.driverSettings,
                ...driverSettings
            } : currentSettings.driverSettings,
            flightTracking: flightTracking ? {
                ...currentSettings.flightTracking,
                ...flightTracking
            } : currentSettings.flightTracking,
            operationSettings: operationSettings ? {
                ...currentSettings.operationSettings,
                ...operationSettings
            } : currentSettings.operationSettings,
            uetdsSettings: uetdsSettings ? {
                ...currentSettings.uetdsSettings,
                ...uetdsSettings
            } : currentSettings.uetdsSettings
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

/**
 * POST /api/tenant/test-whatsapp
 * Send test WhatsApp to verify settings
 */
router.post('/test-whatsapp', authMiddleware, async (req, res) => {
    try {
        if (req.user.roleType !== 'TENANT_ADMIN' && req.user.roleType !== 'SUPER_ADMIN') {
            return res.status(403).json({ success: false, error: 'Permission denied' });
        }
        const { toPhone } = req.body;
        if (!toPhone) {
            return res.status(400).json({ success: false, error: 'toPhone gerekli' });
        }
        const { sendTestWhatsApp } = require('../lib/whatsappService');
        const result = await sendTestWhatsApp(req.user.tenantId, toPhone);
        if (result.success) {
            res.json({ success: true, message: 'Test WhatsApp mesajı gönderildi' });
        } else {
            res.status(400).json({ success: false, error: result.error });
        }
    } catch (error) {
        console.error('Test WhatsApp error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/tenant/test-email
 * Send test email to verify SMTP settings
 */
router.post('/test-email', authMiddleware, async (req, res) => {
    try {
        if (req.user.roleType !== 'TENANT_ADMIN' && req.user.roleType !== 'SUPER_ADMIN') {
            return res.status(403).json({ success: false, error: 'Permission denied' });
        }
        const { toEmail } = req.body;
        if (!toEmail) {
            return res.status(400).json({ success: false, error: 'toEmail gerekli' });
        }
        const { sendTestEmail } = require('../lib/emailService');
        const result = await sendTestEmail(req.user.tenantId, toEmail);
        if (result.success) {
            res.json({ success: true, message: 'Test e-postası gönderildi' });
        } else {
            res.status(400).json({ success: false, error: result.error });
        }
    } catch (error) {
        console.error('Test email error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/tenant/test-uetds
 * Test UETDS credentials (OFFICIAL or UETDS_NET)
 */
router.post('/test-uetds', authMiddleware, async (req, res) => {
    try {
        if (req.user.roleType !== 'TENANT_ADMIN' && req.user.roleType !== 'SUPER_ADMIN') {
            return res.status(403).json({ success: false, error: 'Permission denied' });
        }
        
        const { provider, username, password, firmaKodu, environment } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ success: false, error: 'Kullanıcı adı ve şifre zorunludur' });
        }

        let result;
        if (provider === 'UETDS_NET') {
            const uetdsRestService = require('../services/uetdsRestService');
            result = await uetdsRestService.testCredentials({
                firmaKodu, username, password
            });
        } else if (provider === 'TURKIYE_GOV') {
            const uetdsService = require('../services/uetdsService');
            // Official T.C. UETDS SOAP service at servis.turkiye.gov.tr
            // Tarifesiz Yolcu (uetdsarizi) = Unscheduled/Vehicle-assigned transport (D2 belgesi)
            const serviceUrl = environment === 'production'
                ? 'https://servis.turkiye.gov.tr/services/g2g/kdgm/uetdsarizi'
                : 'https://servis.turkiye.gov.tr/services/g2g/kdgm/test/uetdsarizi';
            console.log(`[UETDS TURKIYE_GOV] Testing credentials: username=${username}, env=${environment}, url=${serviceUrl}`);
            result = await uetdsService.testCredentials({
                username, password, yetkiBelgeNo: '', serviceUrl
            });
        } else {
            const uetdsService = require('../services/uetdsService');
            result = await uetdsService.testCredentials({
                username, password, yetkiBelgeNo: '', serviceUrl: null
            });
        }

        if (result.success) {
            res.json({ success: true, message: result.message || 'Bağlantı başarılı' });
        } else {
            res.status(400).json({ success: false, error: result.error || 'Bağlantı başarısız' });
        }
    } catch (error) {
        console.error('Test UETDS error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/tenant/uetds-submit
 * Admin operations UETDS submit using tenant settings
 */
router.post('/uetds-submit', authMiddleware, async (req, res) => {
    try {
        if (req.user.roleType !== 'TENANT_ADMIN' && req.user.roleType !== 'SUPER_ADMIN') {
            return res.status(403).json({ success: false, error: 'Permission denied' });
        }
        const { PrismaClient } = require('@prisma/client');
        const prisma = new PrismaClient();

        const {
            bookingId, vehiclePlate,
            driverTc, driverFirstName, driverLastName, driverGender, driverPhone,
            passengerTc, passengerFirstName, passengerLastName, passengerGender, passengerPhone, passengerNationality,
            baslangicIl, baslangicIlce, bitisIl, bitisIlce
        } = req.body;

        if (!bookingId || !vehiclePlate) {
            return res.status(400).json({ success: false, error: 'Rezervasyon ve araç plakası zorunludur' });
        }

        const tenant = await prisma.tenant.findUnique({ where: { id: req.user.tenantId } });
        const settings = tenant?.settings || {};
        const uetdsSettings = settings.uetdsSettings;

        if (!uetdsSettings || !uetdsSettings.enabled) {
            return res.status(403).json({ success: false, error: 'UETDS aktif değil' });
        }
        if (!uetdsSettings.username || !uetdsSettings.password) {
            return res.status(400).json({ success: false, error: 'UETDS kimlik bilgileri eksik' });
        }

        const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
        if (!booking) return res.status(404).json({ success: false, error: 'Rezervasyon bulunamadı' });

        const provider = uetdsSettings.provider || 'OFFICIAL';
        const env = uetdsSettings.environment || 'production';
        let serviceUrl = null;
        if (provider === 'TURKIYE_GOV') {
            serviceUrl = env === 'production'
                ? 'https://servis.turkiye.gov.tr/services/g2g/kdgm/uetdsarizi'
                : 'https://servis.turkiye.gov.tr/services/g2g/kdgm/test/uetdsarizi';
        }
        const credentials = {
            username: uetdsSettings.username,
            password: uetdsSettings.password,
            firmaKodu: uetdsSettings.firmaKodu,
            yetkiBelgeNo: uetdsSettings.yetkiBelgesiNo || uetdsSettings.firmaKodu,
            serviceUrl
        };

        const meta = booking.metadata || {};
        const baslangicTarih = booking.startDate;
        const estDurationMs = meta.durationMin ? meta.durationMin * 60 * 1000 : 2 * 60 * 60 * 1000;
        const bitisTarih = new Date(new Date(baslangicTarih).getTime() + estDurationMs);

        let seferResult;

        if (provider === 'UETDS_NET') {
            const uetdsRestService = require('../services/uetdsRestService');
            const reservation = {
                pickupCity: baslangicIl || 'Antalya', dropoffCity: bitisIl || 'Antalya',
                date: baslangicTarih.toISOString().split('T')[0],
                time: baslangicTarih.toISOString().split('T')[1].substring(0,5),
                pickupLocation: meta.pickup || '', dropoffLocation: meta.dropoff || '',
                groupName: 'TRANSFER', price: booking.total
            };
            const vehicleData = { plate: vehiclePlate };
            const driverData = { tcNo: driverTc || '11111111111', phone: driverPhone || '' };
            const passengers = [{
                firstName: passengerFirstName || 'Yolcu', lastName: passengerLastName || 'Yolcu',
                documentNo: passengerTc || '11111111111', nationality: passengerNationality || 'TR',
                gender: passengerGender || '1', phone: passengerPhone || ''
            }];
            try {
                const submitRes = await uetdsRestService.submitDynamicTrip({ credentials, reservation, vehicleData, driverData, passengers });
                seferResult = { success: true, uetdsSeferId: submitRes.sefer_referans_no, refNo: submitRes.iletisim_referans_no, errorMessage: null, rawRequest: JSON.stringify({ reservation, vehicleData, driverData, passengers }), rawResponse: JSON.stringify(submitRes) };
            } catch (err) {
                seferResult = { success: false, errorMessage: err.message, rawRequest: '', rawResponse: JSON.stringify(err.response?.data || err.message) };
            }
        } else {
            const uetdsService = require('../services/uetdsService');
            seferResult = await uetdsService.seferEkle(credentials, {
                aracPlaka: vehiclePlate, seferAciklama: `${meta.pickup || ''} → ${meta.dropoff || ''} (${booking.bookingNumber})`,
                baslangicTarih, bitisTarih, baslangicIl: baslangicIl || '', baslangicIlce: baslangicIlce || '', bitisIl: bitisIl || '', bitisIlce: bitisIlce || '',
            });
        }

        const submission = await prisma.uetdsSubmission.create({
            data: {
                tenantId: req.user.tenantId, 
                partnerId: booking.partnerId || req.user.id, // Fallback to admin user if no partner
                bookingId,
                vehicleId: meta.assignedVehicleId || null, 
                driverId: booking.driverId || null,
                uetdsSeferId: seferResult.uetdsSeferId || null, 
                uetdsRefNo: seferResult.refNo || null,
                status: seferResult.success ? 'SENT' : 'REJECTED', 
                errorMessage: seferResult.errorMessage || null,
                request: { sefer: seferResult.rawRequest?.substring(0, 2000) }, 
                response: { sefer: seferResult.rawResponse?.substring(0, 2000) },
                submittedAt: seferResult.success ? new Date() : null,
            }
        });

        if (!seferResult.success) {
            return res.status(400).json({ success: false, error: seferResult.errorMessage || 'Sefer bildirimi başarısız', data: submission });
        }

        let yolcuResult = null, personelResult = null;
        if (provider !== 'UETDS_NET') {
            const uetdsService = require('../services/uetdsService');
            if (passengerFirstName && passengerLastName) {
                yolcuResult = await uetdsService.yolcuEkle(credentials, seferResult.uetdsSeferId, { tcKimlikNo: passengerTc || '', adi: passengerFirstName, soyadi: passengerLastName, cinsiyet: passengerGender || '1', uyruk: passengerNationality || 'TC', telefon: passengerPhone || '' });
                await prisma.uetdsSubmission.update({ where: { id: submission.id }, data: { response: { sefer: seferResult.rawResponse?.substring(0, 2000), yolcu: yolcuResult.rawResponse?.substring(0, 1000) } }});
            }
            if (driverTc && driverFirstName && driverLastName) {
                personelResult = await uetdsService.personelEkle(credentials, seferResult.uetdsSeferId, { tcKimlikNo: driverTc, adi: driverFirstName, soyadi: driverLastName, cinsiyet: driverGender || '1', telefonNo: driverPhone || '', gorevTuru: '1' });
            }
        }

        res.json({
            success: true,
            data: { ...submission, uetdsSeferId: seferResult.uetdsSeferId, yolcuSuccess: yolcuResult?.success ?? null, personelSuccess: personelResult?.success ?? null }
        });
    } catch (error) {
        console.error('Admin UETDS submit error:', error);
        res.status(500).json({ success: false, error: 'UETDS bildirimi başarısız: ' + error.message });
    }
});

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
