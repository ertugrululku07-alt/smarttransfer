/**
 * Tenant isolation helpers — every tenant-scoped query must go through these.
 */

const prisma = require('../lib/prisma');

const ADMIN_ROLE_TYPES = new Set([
    'SUPER_ADMIN', 'TENANT_ADMIN', 'TENANT_MANAGER', 'TENANT_STAFF', 'PLATFORM_OPS',
]);
const ADMIN_ROLE_CODES = new Set(['SUPER_ADMIN', 'ADMIN', 'OPERATION', 'DISPATCHER', 'AGENCY_ADMIN']);

/**
 * Effective tenant ID: authenticated users always use JWT tenantId.
 * Unauthenticated/public routes use resolved tenant middleware context.
 */
function getEffectiveTenantId(req) {
    if (req.user?.tenantId) return req.user.tenantId;
    if (req.tenant?.id) return req.tenant.id;
    return null;
}

/**
 * Reject cross-tenant header spoofing when user is authenticated.
 */
function assertTenantHeaderMatch(req, res) {
    if (!req.user?.tenantId) return true;

    const headerTenantId = req.headers['x-tenant-id'];
    if (headerTenantId && headerTenantId !== req.user.tenantId) {
        res.status(403).json({ success: false, error: 'Tenant header does not match authenticated user' });
        return false;
    }

    const headerSlug = req.headers['x-tenant-slug'];
    if (headerSlug && req.user.tenant?.slug && headerSlug !== req.user.tenant.slug) {
        res.status(403).json({ success: false, error: 'Tenant slug does not match authenticated user' });
        return false;
    }

    return true;
}

function requireTenantId(req, res) {
    if (!assertTenantHeaderMatch(req, res)) return null;
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) {
        res.status(400).json({ success: false, error: 'Tenant context is required' });
        return null;
    }
    return tenantId;
}

function isAdminUser(user) {
    if (!user) return false;
    return ADMIN_ROLE_TYPES.has(user.roleType) || ADMIN_ROLE_CODES.has(user.roleCode);
}

function requireAdmin(req, res) {
    if (!req.user) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return false;
    }
    if (!isAdminUser(req.user)) {
        res.status(403).json({ success: false, error: 'Admin access required' });
        return false;
    }
    return true;
}

function bookingWhere(id, tenantId) {
    return { id, tenantId };
}

async function findBookingForTenant(id, tenantId) {
    return prisma.booking.findFirst({ where: bookingWhere(id, tenantId) });
}

async function findUserForTenant(id, tenantId) {
    return prisma.user.findFirst({ where: { id, tenantId } });
}

async function findExtraServiceForTenant(id, tenantId) {
    return prisma.extraService.findFirst({ where: { id, tenantId } });
}

async function findMessageForTenant(id, tenantId) {
    return prisma.message.findFirst({ where: { id, tenantId } });
}

function tenantRoom(tenantId) {
    return `tenant_${tenantId}`;
}

function adminMonitoringRoom(tenantId) {
    return `admin_monitoring_${tenantId}`;
}

function adminMiddleware(req, res, next) {
    if (!requireAdmin(req, res)) return;
    next();
}

module.exports = {
    getEffectiveTenantId,
    assertTenantHeaderMatch,
    requireTenantId,
    isAdminUser,
    requireAdmin,
    adminMiddleware,
    bookingWhere,
    findBookingForTenant,
    findUserForTenant,
    findExtraServiceForTenant,
    findMessageForTenant,
    tenantRoom,
    adminMonitoringRoom,
    ADMIN_ROLE_TYPES,
    ADMIN_ROLE_CODES,
};
