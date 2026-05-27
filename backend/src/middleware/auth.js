// src/middleware/auth.js
// JWT authentication middleware

const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');
const env = require('../config/env');
const { assertTenantHeaderMatch } = require('../utils/tenantScope');

const JWT_SECRET = env.jwt.secret;
const JWT_EXPIRATION = env.jwt.expiration;

/**
 * Authentication Middleware
 * Verifies JWT token and attaches user to req.user
 */
async function authMiddleware(req, res, next) {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                error: 'No token provided'
            });
        }

        const token = authHeader.substring(7);

        let decoded;
        try {
            decoded = jwt.verify(token, JWT_SECRET);
        } catch (err) {
            if (err.name === 'TokenExpiredError') {
                return res.status(401).json({
                    success: false,
                    error: 'Token expired',
                    code: 'TOKEN_EXPIRED'
                });
            }
            return res.status(401).json({
                success: false,
                error: 'Invalid token'
            });
        }

        const user = await prisma.user.findUnique({
            where: { id: decoded.userId },
            include: {
                role: {
                    include: {
                        permissions: {
                            include: {
                                permission: true
                            }
                        }
                    }
                },
                userPermissions: {
                    include: {
                        permission: true
                    }
                },
                tenant: {
                    select: {
                        id: true,
                        slug: true,
                        name: true,
                        status: true,
                        settings: true,
                        transferEnabled: true,
                        tourEnabled: true,
                        hotelEnabled: true
                    }
                }
            }
        });

        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'User not found'
            });
        }

        if (user.status !== 'ACTIVE') {
            return res.status(403).json({
                success: false,
                error: 'User account is not active'
            });
        }

        // User-level permissions take priority; fallback to role permissions
        const perms = user.userPermissions.length > 0
            ? user.userPermissions.map(up => ({
                module: up.permission.module,
                resource: up.permission.resource,
                action: up.permission.action,
                scope: up.permission.scope
            }))
            : user.role.permissions.map(rp => ({
                module: rp.permission.module,
                resource: rp.permission.resource,
                action: rp.permission.action,
                scope: rp.permission.scope
            }));

        req.user = {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            fullName: user.fullName,
            avatar: user.avatar,
            roleCode: user.role.code,
            roleType: user.role.type,
            tenantId: user.tenantId,
            tenant: user.tenant,
            permissions: perms
        };

        // Bind tenant context to JWT — ignore spoofed headers
        req.tenant = user.tenant;

        if (!assertTenantHeaderMatch(req, res)) return;

        next();
    } catch (error) {
        console.error('Auth middleware error:', error);
        res.status(500).json({
            success: false,
            error: 'Authentication failed'
        });
    }
}

async function optionalAuthMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        req.user = null;
        return next();
    }

    const token = authHeader.substring(7);

    try {
        const decoded = jwt.verify(token, JWT_SECRET);

        const user = await prisma.user.findUnique({
            where: { id: decoded.userId },
            include: {
                role: {
                    include: {
                        permissions: {
                            include: {
                                permission: true
                            }
                        }
                    }
                },
                userPermissions: {
                    include: {
                        permission: true
                    }
                },
                tenant: {
                    select: {
                        id: true,
                        slug: true,
                        name: true,
                        status: true,
                        settings: true,
                        transferEnabled: true,
                        tourEnabled: true,
                        hotelEnabled: true
                    }
                }
            }
        });

        if (user && user.status === 'ACTIVE') {
            const perms = user.userPermissions.length > 0
                ? user.userPermissions.map(up => ({
                    module: up.permission.module,
                    resource: up.permission.resource,
                    action: up.permission.action,
                    scope: up.permission.scope
                }))
                : user.role.permissions.map(rp => ({
                    module: rp.permission.module,
                    resource: rp.permission.resource,
                    action: rp.permission.action,
                    scope: rp.permission.scope
                }));

            req.user = {
                id: user.id,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
                fullName: user.fullName,
                roleCode: user.role.code,
                roleType: user.role.type,
                tenantId: user.tenantId,
                tenant: user.tenant,
                permissions: perms
            };
            req.tenant = user.tenant;
        } else {
            req.user = null;
        }
    } catch {
        req.user = null;
    }

    next();
}

module.exports = {
    authMiddleware,
    optionalAuthMiddleware,
    JWT_SECRET,
    JWT_EXPIRATION
};
