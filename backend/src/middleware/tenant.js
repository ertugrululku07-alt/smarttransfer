// src/middleware/tenant.js
// Multi-tenant resolver middleware

const prisma = require('../lib/prisma');
const env = require('../config/env');

const tenantCache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

function getCachedTenant(key) {
    if (!key) return null;
    const cached = tenantCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
        return cached.data;
    }
    return null;
}

function setCachedTenant(key, data) {
    if (!key) return;
    tenantCache.set(key, {
        data,
        expiresAt: Date.now() + CACHE_TTL
    });
}

const selectFields = {
    id: true,
    slug: true,
    name: true,
    status: true,
    plan: true,
    transferEnabled: true,
    tourEnabled: true,
    hotelEnabled: true,
    flightEnabled: true,
    carEnabled: true,
    cruiseEnabled: true,
    heroImages: true,
    primaryColor: true,
    secondaryColor: true,
    accentColor: true,
    defaultCurrency: true,
    defaultLocale: true
};

async function resolveTenantFromRequest(req) {
    const tenantId = req.headers['x-tenant-id'];
    const tenantSlug = req.headers['x-tenant-slug'];
    const host = req.headers.host || '';
    const subdomain = host.split('.')[0];

    let cacheKey = null;
    if (tenantId) cacheKey = `id-${tenantId}`;
    else if (tenantSlug) cacheKey = `slug-${tenantSlug}`;
    else if (subdomain && subdomain !== 'www' && subdomain !== 'localhost' && !subdomain.includes(':')) {
        cacheKey = `subdomain-${subdomain}`;
    }

    if (cacheKey) {
        const cached = getCachedTenant(cacheKey);
        if (cached) return cached;
    }

    let tenant = null;

    if (tenantId) {
        tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: selectFields });
    }

    if (!tenant && tenantSlug) {
        tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug }, select: selectFields });
    }

    if (!tenant && subdomain && subdomain !== 'www' && subdomain !== 'localhost' && !subdomain.includes(':')) {
        tenant = await prisma.tenant.findUnique({ where: { slug: subdomain }, select: selectFields });
    }

    // Development-only fallback — never grab arbitrary tenant in production
    if (!tenant && !env.isProduction) {
        tenant = await prisma.tenant.findUnique({
            where: { slug: env.tenant.devDefaultSlug },
            select: selectFields
        });
    }

    if (tenant && cacheKey) {
        setCachedTenant(cacheKey, tenant);
    }

    return tenant;
}

async function tenantMiddleware(req, res, next) {
    try {
        // Authenticated requests: tenant is bound to JWT in authMiddleware
        if (req.user?.tenant) {
            req.tenant = req.user.tenant;
            return next();
        }

        const tenant = await resolveTenantFromRequest(req);

        if (!tenant) {
            return res.status(404).json({
                success: false,
                error: env.isProduction
                    ? 'Tenant not found. Provide X-Tenant-Slug or use a tenant subdomain.'
                    : `Tenant not found. Set DEFAULT_TENANT_SLUG or create tenant "${env.tenant.devDefaultSlug}".`
            });
        }

        if (tenant.status !== 'ACTIVE' && tenant.status !== 'TRIAL') {
            return res.status(403).json({
                success: false,
                error: 'Tenant is not active',
                status: tenant.status
            });
        }

        req.tenant = tenant;
        next();
    } catch (error) {
        console.error('Tenant middleware error:', error);
        res.status(500).json({
            success: false,
            error: 'Tenant resolution failed'
        });
    }
}

async function optionalTenantMiddleware(req, res, next) {
    try {
        if (req.user?.tenant) {
            req.tenant = req.user.tenant;
            return next();
        }

        const tenant = await resolveTenantFromRequest(req);
        req.tenant = tenant || null;
        next();
    } catch (error) {
        console.error('Optional tenant middleware error:', error);
        req.tenant = null;
        next();
    }
}

function clearTenantCache(tenantId, tenantSlug) {
    // Clear all possible cache keys for this tenant
    for (const [key, entry] of tenantCache.entries()) {
        if (entry.data && (entry.data.id === tenantId || entry.data.slug === tenantSlug)) {
            tenantCache.delete(key);
        }
    }
}

module.exports = tenantMiddleware;
module.exports.optionalTenantMiddleware = optionalTenantMiddleware;
module.exports.clearTenantCache = clearTenantCache;
