// src/middleware/auth.js
// JWT authentication middleware

const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-me-in-production';
const JWT_EXPIRATION = process.env.JWT_EXPIRATION || '30d';

/**
 * Authentication Middleware
 * Verifies JWT token and attaches user to req.user
 */
async function authMiddleware(req, res, next) {
    try {
        // Extract token from Authorization header
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                error: 'No token provided'
            });
        }

        const token = authHeader.substring(7); // Remove 'Bearer ' prefix

        // Verify token
        let decoded;
        try {
            decoded = jwt.verify(token, JWT_SECRET);
        } catch (err) {
            if (err.name === 'TokenExpiredError') {
                // For driver endpoints, auto-renew expired tokens so background sync never fails
                const expiredDecoded = jwt.decode(token);
                if (expiredDecoded && expiredDecoded.userId && req.path && (req.path.includes('/driver/') || req.path.includes('/sync'))) {
                    console.log(`[Auth] Auto-renewing expired token for driver ${expiredDecoded.userId}`);
                    const freshToken = jwt.sign(
                        { userId: expiredDecoded.userId, email: expiredDecoded.email, tenantId: expiredDecoded.tenantId, roleCode: expiredDecoded.roleCode },
                        JWT_SECRET,
                        { expiresIn: JWT_EXPIRATION }
                    );
                    res.setHeader('X-New-Token', freshToken);
                    decoded = expiredDecoded;
                } else {
                    return res.status(401).json({
                        success: false,
                        error: 'Token expired'
                    });
                }
            } else {
                return res.status(401).json({
                    success: false,
                    error: 'Invalid token'
                });
            }
        }

        // Load user from database
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
                tenant: {
                    select: {
                        id: true,
                        slug: true,
                        name: true,
                        status: true,
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

        // Attach user to request
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
            permissions: user.role.permissions.map(rp => ({
                module: rp.permission.module,
                resource: rp.permission.resource,
                action: rp.permission.action,
                scope: rp.permission.scope
            }))
        };

        next();
    } catch (error) {
        console.error('Auth middleware error:', error);
        res.status(500).json({
            success: false,
            error: 'Authentication failed'
        });
    }
}

// Optional authentication middleware
// Tries to load user but doesn't fail if no token or invalid token
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
                tenant: {
                    select: {
                        id: true,
                        slug: true,
                        name: true,
                        status: true,
                        transferEnabled: true,
                        tourEnabled: true,
                        hotelEnabled: true
                    }
                }
            }
        });

        if (user && user.status === 'ACTIVE') {
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
                permissions: user.role.permissions.map(rp => ({
                    module: rp.permission.module,
                    resource: rp.permission.resource,
                    action: rp.permission.action,
                    scope: rp.permission.scope
                }))
            };
        } else {
            req.user = null;
        }
    } catch (err) {
        // Build resilient optional auth: if token invalid/expired, just proceed as guest
        // console.log('Optional auth token invalid:', err.message);
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
