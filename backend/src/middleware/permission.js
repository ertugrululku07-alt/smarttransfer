/**
 * Permission Middleware
 * 
 * Checks if the authenticated user has the required permission(s)
 * for the requested module and action.
 * 
 * Usage in routes:
 *   router.get('/list', authMiddleware, requirePermission('reservations', 'view'), handler);
 *   router.post('/create', authMiddleware, requirePermission('accounting', 'create'), handler);
 *   router.delete('/:id', authMiddleware, requirePermission('accounting', 'delete'), handler);
 */

const SUPER_ROLES = new Set(['SUPER_ADMIN', 'TENANT_ADMIN']);

/**
 * Creates a middleware that checks if user has permission for the given module and action.
 * SUPER_ADMIN and TENANT_ADMIN always have full access (bypass check).
 * 
 * @param {string} module - Module name (e.g., 'reservations', 'accounting')
 * @param {string} action - Action type: 'view', 'create', 'update', 'delete'
 * @returns {Function} Express middleware
 */
function requirePermission(module, action) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }

        // SUPER_ADMIN and TENANT_ADMIN bypass all permission checks
        if (SUPER_ROLES.has(req.user.roleType) || SUPER_ROLES.has(req.user.roleCode)) {
            return next();
        }

        // Check user's permissions array
        const permissions = req.user.permissions || [];
        const hasPermission = permissions.some(p => 
            p.module === module && p.action === action
        );

        if (!hasPermission) {
            return res.status(403).json({
                success: false,
                error: 'Bu işlem için yetkiniz bulunmamaktadır',
                code: 'PERMISSION_DENIED',
                required: { module, action }
            });
        }

        next();
    };
}

/**
 * Check if user has ANY of the given permissions.
 * Useful for routes that need one of several permissions.
 * 
 * @param {Array<{module: string, action: string}>} permList
 * @returns {Function} Express middleware
 */
function requireAnyPermission(permList) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }

        if (SUPER_ROLES.has(req.user.roleType) || SUPER_ROLES.has(req.user.roleCode)) {
            return next();
        }

        const permissions = req.user.permissions || [];
        const hasAny = permList.some(required =>
            permissions.some(p => p.module === required.module && p.action === required.action)
        );

        if (!hasAny) {
            return res.status(403).json({
                success: false,
                error: 'Bu işlem için yetkiniz bulunmamaktadır',
                code: 'PERMISSION_DENIED',
            });
        }

        next();
    };
}

/**
 * Helper to check permission in route handler (non-middleware style)
 * Returns true if user has permission, false otherwise.
 * 
 * @param {object} user - req.user object
 * @param {string} module 
 * @param {string} action 
 * @returns {boolean}
 */
function hasPermission(user, module, action) {
    if (!user) return false;
    if (SUPER_ROLES.has(user.roleType) || SUPER_ROLES.has(user.roleCode)) return true;
    const permissions = user.permissions || [];
    return permissions.some(p => p.module === module && p.action === action);
}

module.exports = { requirePermission, requireAnyPermission, hasPermission };
