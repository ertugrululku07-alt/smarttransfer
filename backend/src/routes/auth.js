// src/routes/auth.js
// Authentication routes: login, register, refresh token

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const { JWT_SECRET, JWT_EXPIRATION } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

/**
 * POST /api/auth/login
 * Login with email and password
 */
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // Validation
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                error: 'Email and password are required'
            });
        }

        // Find user (across all tenants for now, can be scoped to req.tenant if needed)
        const user = await prisma.user.findFirst({
            where: {
                email: email.toLowerCase(),
                status: 'ACTIVE'
            },
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
                        plan: true,
                        transferEnabled: true,
                        tourEnabled: true,
                        hotelEnabled: true,
                        primaryColor: true,
                        secondaryColor: true,
                        accentColor: true
                    }
                }
            }
        });

        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'Invalid email or password'
            });
        }

        // Verify password
        const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
        if (!isPasswordValid) {
            return res.status(401).json({
                success: false,
                error: 'Invalid email or password'
            });
        }

        // Check tenant status
        if (user.tenant.status !== 'ACTIVE' && user.tenant.status !== 'TRIAL') {
            return res.status(403).json({
                success: false,
                error: 'Your organization account is not active'
            });
        }

        // Generate JWT token
        const token = jwt.sign(
            {
                userId: user.id,
                email: user.email,
                tenantId: user.tenantId,
                roleCode: user.role.code
            },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRATION }
        );

        // Generate refresh token (90 days)
        const refreshToken = jwt.sign(
            { userId: user.id, type: 'refresh' },
            JWT_SECRET,
            { expiresIn: '90d' }
        );

        // Store refresh token
        await prisma.refreshToken.create({
            data: {
                userId: user.id,
                token: refreshToken,
                expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000) // 90 days
            }
        });

        // Update last login
        await prisma.user.update({
            where: { id: user.id },
            data: {
                lastLoginAt: new Date(),
                loginCount: { increment: 1 }
            }
        });

        // Prepare user data
        const userData = {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            fullName: user.fullName,
            avatar: user.avatar,
            role: {
                code: user.role.code,
                name: user.role.name,
                type: user.role.type
            },
            tenant: user.tenant,
            permissions: user.role.permissions.map(rp => ({
                module: rp.permission.module,
                resource: rp.permission.resource,
                action: rp.permission.action,
                scope: rp.permission.scope
            }))
        };

        res.json({
            success: true,
            data: {
                user: userData,
                token,
                refreshToken,
                expiresIn: JWT_EXPIRATION
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            error: 'Login failed'
        });
    }
});

/**
 * POST /api/auth/register
 * Register new customer account
 */
router.post('/register', async (req, res) => {
    try {
        const { email, password, firstName, lastName } = req.body;

        // Validation
        if (!email || !password || !firstName || !lastName) {
            return res.status(400).json({
                success: false,
                error: 'All fields are required'
            });
        }

        if (password.length < 8) {
            return res.status(400).json({
                success: false,
                error: 'Password must be at least 8 characters'
            });
        }

        // Get tenant from middleware
        const tenantId = req.tenant?.id;
        if (!tenantId) {
            return res.status(400).json({
                success: false,
                error: 'Tenant not found'
            });
        }

        // Check if user exists
        const existingUser = await prisma.user.findFirst({
            where: {
                tenantId,
                email: email.toLowerCase()
            }
        });

        if (existingUser) {
            return res.status(409).json({
                success: false,
                error: 'Email already registered'
            });
        }

        // Get customer role
        const customerRole = await prisma.role.findFirst({
            where: {
                tenantId,
                code: 'CUSTOMER'
            }
        });

        if (!customerRole) {
            return res.status(500).json({
                success: false,
                error: 'Customer role not configured'
            });
        }

        // Hash password
        const passwordHash = await bcrypt.hash(password, 10);

        // Create user
        const user = await prisma.user.create({
            data: {
                tenantId,
                email: email.toLowerCase(),
                passwordHash,
                firstName,
                lastName,
                fullName: `${firstName} ${lastName}`,
                roleId: customerRole.id,
                status: 'ACTIVE',
                emailVerified: false
            },
            include: {
                role: true,
                tenant: {
                    select: {
                        id: true,
                        slug: true,
                        name: true,
                        transferEnabled: true,
                        tourEnabled: true,
                        hotelEnabled: true
                    }
                }
            }
        });

        // Generate token
        const token = jwt.sign(
            {
                userId: user.id,
                email: user.email,
                tenantId: user.tenantId,
                roleCode: user.role.code
            },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRATION }
        );

        res.status(201).json({
            success: true,
            data: {
                user: {
                    id: user.id,
                    email: user.email,
                    firstName: user.firstName,
                    lastName: user.lastName,
                    fullName: user.fullName,
                    tenant: user.tenant
                },
                token,
                expiresIn: JWT_EXPIRATION
            }
        });

    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({
            success: false,
            error: 'Registration failed'
        });
    }
});

/**
 * POST /api/auth/register-driver
 * Register new driver/partner with vehicle
 */
router.post('/register-driver', async (req, res) => {
    try {
        const {
            // User Info
            email, password, firstName, lastName, phone,
            licenseDocument, srcDocument, tursabDocument,
            // Vehicle Info
            vehiclePlate, vehicleBrand, vehicleModel, vehicleYear, vehicleType: vehicleCategory
        } = req.body;

        // 1. Basic Validation
        if (!email || !password || !firstName || !lastName || !vehiclePlate || !vehicleCategory) {
            return res.status(400).json({ success: false, error: 'All fields are required' });
        }

        // 2. Tenant Context
        const tenantId = req.tenant?.id;
        if (!tenantId) {
            return res.status(400).json({ success: false, error: 'Tenant context missing' });
        }

        // 3. Check duplicate email
        const existing = await prisma.user.findFirst({
            where: { tenantId, email: email.toLowerCase() }
        });
        if (existing) {
            return res.status(409).json({ success: false, error: 'Email already registered' });
        }

        // 4. Find PARTNER Role
        let role = await prisma.role.findFirst({
            where: { tenantId, type: 'PARTNER' }
        });
        if (!role) {
            // Fallback: Try to find ANY suitable role or create one?
            // For MVP, if no partner role, try finding 'TENANT_STAFF' or similar
            role = await prisma.role.findFirst({ where: { tenantId, type: 'TENANT_STAFF' } });
        }
        if (!role) {
            return res.status(500).json({ success: false, error: 'Driver role not configured in system' });
        }

        // 5. Find VehicleType ID based on category (SEDAN, VAN, etc.)
        // We assume database has VehicleTypes seeded.
        const vType = await prisma.vehicleType.findFirst({
            where: { tenantId, category: vehicleCategory }
        });

        // Use the found type, or just the FIRST type available as fallback to prevent crash
        const finalVehicleTypeId = vType?.id || (await prisma.vehicleType.findFirst({ where: { tenantId } }))?.id;

        if (!finalVehicleTypeId) {
            return res.status(500).json({ success: false, error: 'No vehicle types defined in system' });
        }

        // 6. Transaction: Create User + Vehicle
        const result = await prisma.$transaction(async (tx) => {
            // Hash password
            const passwordHash = await bcrypt.hash(password, 10);

            // Create User
            const user = await tx.user.create({
                data: {
                    tenantId,
                    email: email.toLowerCase(),
                    passwordHash,
                    firstName,
                    lastName,
                    fullName: `${firstName} ${lastName}`,
                    phone,
                    roleId: role.id,
                    status: 'ACTIVE', // Or PENDING_APPROVAL
                    emailVerified: false,
                    licenseDocument,
                    srcDocument,
                    tursabDocument
                }
            });

            // Create Vehicle
            const vehicle = await tx.vehicle.create({
                data: {
                    tenantId,
                    ownerId: user.id, // Link to new user
                    vehicleTypeId: finalVehicleTypeId,
                    plateNumber: vehiclePlate,
                    brand: vehicleBrand,
                    model: vehicleModel,
                    year: Number(vehicleYear),
                    color: 'Unknown', // Default or ask user
                    isOwned: true,
                    status: 'ACTIVE'
                }
            });

            return { user, vehicle };
        });

        // 7. Generate Token
        const token = jwt.sign(
            {
                userId: result.user.id,
                email: result.user.email,
                tenantId: result.user.tenantId,
                roleCode: role.code
            },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRATION }
        );

        res.status(201).json({
            success: true,
            data: {
                user: result.user,
                vehicle: result.vehicle,
                token,
                expiresIn: JWT_EXPIRATION
            }
        });

    } catch (error) {
        console.error('Register Driver error:', error);
        res.status(500).json({ success: false, error: 'Registration failed: ' + error.message });
    }
});

/**
 * POST /api/auth/refresh
 * Refresh access token using refresh token
 */
router.post('/refresh', async (req, res) => {
    try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            return res.status(400).json({
                success: false,
                error: 'Refresh token required'
            });
        }

        // Verify refresh token
        let decoded;
        try {
            decoded = jwt.verify(refreshToken, JWT_SECRET);
        } catch (err) {
            return res.status(401).json({
                success: false,
                error: 'Invalid refresh token'
            });
        }

        // Check if refresh token exists in DB
        const storedToken = await prisma.refreshToken.findFirst({
            where: {
                userId: decoded.userId,
                token: refreshToken
            }
        });

        if (!storedToken) {
            return res.status(401).json({
                success: false,
                error: 'Refresh token not found'
            });
        }

        // Check if expired
        if (new Date() > storedToken.expiresAt) {
            await prisma.refreshToken.delete({
                where: { id: storedToken.id }
            });
            return res.status(401).json({
                success: false,
                error: 'Refresh token expired'
            });
        }

        // Load user
        const user = await prisma.user.findUnique({
            where: { id: decoded.userId },
            include: { role: true }
        });

        if (!user || user.status !== 'ACTIVE') {
            return res.status(401).json({
                success: false,
                error: 'User not found or inactive'
            });
        }

        // Generate new access token
        const newToken = jwt.sign(
            {
                userId: user.id,
                email: user.email,
                tenantId: user.tenantId,
                roleCode: user.role.code
            },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRATION }
        );

        res.json({
            success: true,
            data: {
                token: newToken,
                expiresIn: JWT_EXPIRATION
            }
        });

    } catch (error) {
        console.error('Refresh token error:', error);
        res.status(500).json({
            success: false,
            error: 'Token refresh failed'
        });
    }
});

/**
 * GET /api/auth/me
 * Get current user info
 */
router.get('/me', require('../middleware/auth').authMiddleware, async (req, res) => {
    try {
        res.json({
            success: true,
            data: {
                user: req.user
            }
        });
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load user'
        });
    }
});

/**
 * GET /api/auth/metadata
 * Get current user metadata/preferences
 */
router.get('/metadata', require('../middleware/auth').authMiddleware, async (req, res) => {
    try {
        const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { metadata: true } });
        res.json({ success: true, data: user?.metadata || {} });
    } catch(err) {
        res.status(500).json({ success: false, error: 'Failed' });
    }
});

/**
 * PUT /api/auth/metadata
 * Update current user metadata/preferences
 */
router.put('/metadata', require('../middleware/auth').authMiddleware, async (req, res) => {
    try {
        const { preferences } = req.body;
        const user = await prisma.user.findUnique({ where: { id: req.user.id } });
        const currentMetadata = (user.metadata && typeof user.metadata === 'object') ? user.metadata : {};
        const updatedMetadata = { ...currentMetadata, ...preferences };
        await prisma.user.update({ where: { id: req.user.id }, data: { metadata: updatedMetadata } });
        res.json({ success: true, data: updatedMetadata });
    } catch(err) {
        res.status(500).json({ success: false, error: 'Failed' });
    }
});

module.exports = router;
