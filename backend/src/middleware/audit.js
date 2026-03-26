const { logActivity } = require('../utils/logger');

/**
 * Express middleware to automatically log all mutating requests
 * (POST, PUT, PATCH, DELETE) to the ActivityLog table.
 */
function auditLogMiddleware(req, res, next) {
    // Only log mutations
    if (['GET', 'OPTIONS', 'HEAD'].includes(req.method)) {
        return next();
    }

    // Wait for the request to finish to check status code
    res.on('finish', () => {
        // Only log successful actions (e.g. 200, 201, 204)
        // If it failed, we assume it didn't change the database (or mostly didn't).
        if (res.statusCode >= 200 && res.statusCode < 400) {
            
            // Extract tenant and user if available (from tenantMiddleware and authMiddleware)
            const tenantId = req.tenant?.id;
            const userId = req.user?.id || null;
            const userEmail = req.user?.email || null;
            const ipAddress = req.headers['x-forwarded-for'] || req.socket?.remoteAddress;

            // Simple heuristic to determine entityType from URL
            // e.g. /api/users/123 -> entityType = users
            const segments = req.path.split('/').filter(Boolean);
            const apiIndex = segments.indexOf('api');
            let entityType = 'System';
            let entityId = null;

            if (apiIndex >= 0 && segments.length > apiIndex + 1) {
                entityType = segments[apiIndex + 1].toUpperCase();
                // If there's an ID like /api/bookings/45
                if (segments.length > apiIndex + 2) {
                    entityId = segments[apiIndex + 2];
                }
            }

            // Exclude sensitive fields from body logging
            const safeBody = { ...req.body };
            if (safeBody.password) safeBody.password = '***';
            if (safeBody.passwordHash) safeBody.passwordHash = '***';
            if (safeBody.token) safeBody.token = '***';

            const action = `${req.method}_${entityType}`;

            logActivity({
                tenantId,
                userId,
                userEmail,
                action,
                entityType,
                entityId,
                details: {
                    endpoint: req.originalUrl,
                    method: req.method,
                    payload: safeBody,
                    message: "Sistem tarafından otomatik loglandı (Standard Audit)",
                    status: res.statusCode
                },
                ipAddress
            });
        }
    });

    next();
}

module.exports = {
    auditLogMiddleware
};
