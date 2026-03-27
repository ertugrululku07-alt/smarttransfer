// src/middleware/tenant.js
// Multi-tenant resolver middleware

const prisma = require('../lib/prisma');

// Simple in-memory cache to prevent DB exhaustion on every request
const tenantCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes in milliseconds

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

/**
 * Tenant Middleware
 * Resolves tenant from request and attaches to req.tenant
 * Supports multiple strategies: subdomain, header, custom domain
 */
async function tenantMiddleware(req, res, next) {
    try {
        let tenant = null;
        let cacheKey = null;

        // Determine the lookup strategy and cache key
        const tenantId = req.headers['x-tenant-id'];
        const tenantSlug = req.headers['x-tenant-slug'];
        const host = req.headers.host || '';
        const subdomain = host.split('.')[0];

        if (tenantId) {
            cacheKey = `id-${tenantId}`;
        } else if (tenantSlug) {
            cacheKey = `slug-${tenantSlug}`;
        } else if (subdomain && subdomain !== 'www' && subdomain !== 'localhost') {
            cacheKey = `subdomain-${subdomain}`;
        } else {
            cacheKey = `fallback-tenant`;
        }

        // Check if we have a valid cached tenant
        const cachedTenant = getCachedTenant(cacheKey);
        if (cachedTenant) {
            req.tenant = cachedTenant;
            return next();
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

        // Strategy 1: X-Tenant-ID header (preferred for development)
        if (tenantId) {
            tenant = await prisma.tenant.findUnique({
                where: { id: tenantId },
                select: selectFields
            });
        }

        // Strategy 2: X-Tenant-Slug header
        if (!tenant && tenantSlug) {
            tenant = await prisma.tenant.findUnique({
                where: { slug: tenantSlug },
                select: selectFields
            });
        }

        // Strategy 3: Subdomain (e.g., acme.smarttravel.com)
        if (!tenant && subdomain && subdomain !== 'www' && subdomain !== 'localhost') {
            tenant = await prisma.tenant.findUnique({
                where: { slug: subdomain },
                select: selectFields
            });
        }

        // Fallback: Use default tenant for development
        if (!tenant) {
            // First try specific demo tenant
            tenant = await prisma.tenant.findUnique({
                where: { slug: 'smarttravel-demo' },
                select: selectFields
            });

            // If still no tenant, just grab the first one (for local dev robustness)
            if (!tenant) {
                tenant = await prisma.tenant.findFirst({
                    where: {}, // any tenant
                    select: selectFields
                });
            }
        }

        // Validate tenant status
        if (!tenant) {
            return res.status(404).json({
                success: false,
                error: 'Tenant not found. Please ensure a tenant with slug "smarttravel-demo" exists.'
            });
        }

        if (tenant.status !== 'ACTIVE' && tenant.status !== 'TRIAL') {
            return res.status(403).json({
                success: false,
                error: 'Tenant is not active',
                status: tenant.status
            });
        }

        // Save to cache before passing to next middleware
        setCachedTenant(cacheKey, tenant);

        // Attach tenant to request
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

module.exports = tenantMiddleware;
