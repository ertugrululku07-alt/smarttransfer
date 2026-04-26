const express = require('express');
const bcrypt = require('bcryptjs');

const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
const prisma = require('../lib/prisma');

/**
 * GET /api/users
 * List all users for the current tenant
 */
router.get('/', authMiddleware, async (req, res) => {
    try {
        const tenantId = req.tenant?.id;
        if (!tenantId) {
            return res.status(400).json({ success: false, error: 'Tenant context missing' });
        }

        const users = await prisma.user.findMany({
            where: {
                tenantId,
                deletedAt: null
            },
            select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                fullName: true,
                status: true,
                createdAt: true,
                role: {
                    select: {
                        id: true,
                        name: true,
                        code: true,
                        type: true
                    }
                }
            },
            orderBy: {
                createdAt: 'desc'
            }
        });

        // Map to frontend format — send actual RoleType
        const formattedUsers = users.map(u => ({
            id: u.id,
            name: u.fullName,
            email: u.email,
            role: u.role.type, // actual RoleType: TENANT_ADMIN, PARTNER, DRIVER, etc.
            roleId: u.role.id,
            roleName: u.role.name,
            roleCode: u.role.code,
            isActive: u.status === 'ACTIVE',
            createdAt: u.createdAt
        }));

        res.json({
            success: true,
            data: formattedUsers
        });

    } catch (error) {
        console.error('Fetch users error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch users'
        });
    }
});

/**
 * POST /api/users
 * Create a new user for the tenant
 */
router.post('/', authMiddleware, async (req, res) => {
    try {
        const tenantId = req.tenant?.id;
        const { name, email, password, role, isActive } = req.body;

        if (!tenantId) {
            return res.status(400).json({ success: false, error: 'Tenant context missing' });
        }

        if (!email || !password || !role) {
            return res.status(400).json({ success: false, error: 'Email, password and role are required' });
        }

        // Check if user already exists
        const existingUser = await prisma.user.findFirst({
            where: { tenantId, email: email.toLowerCase() }
        });

        if (existingUser) {
            return res.status(409).json({ success: false, error: 'Email already registered' });
        }

        // Find the role by type (frontend now sends actual RoleType values)
        // Backward compatibility: map legacy values
        let mappedRoleType = role;
        if (role === 'ADMIN') mappedRoleType = 'TENANT_ADMIN';
        if (role === 'COMPANY') mappedRoleType = 'AGENCY_ADMIN';

        const dbRole = await prisma.role.findFirst({
            where: {
                tenantId,
                type: mappedRoleType
            }
        });

        if (!dbRole) {
            return res.status(400).json({ success: false, error: `Role ${role} not found for this tenant` });
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const [firstName, ...lastNameParts] = (name || '').split(' ');
        const lastName = lastNameParts.join(' ') || '-';

        const user = await prisma.user.create({
            data: {
                tenantId,
                email: email.toLowerCase(),
                passwordHash,
                firstName: firstName || '-',
                lastName,
                fullName: name || 'User',
                roleId: dbRole.id,
                status: isActive === false ? 'INACTIVE' : 'ACTIVE'
            },
            include: {
                role: true
            }
        });

        res.status(201).json({
            success: true,
            data: {
                id: user.id,
                name: user.fullName,
                email: user.email,
                role: user.role?.type,
                roleId: user.role?.id,
                roleName: user.role?.name,
                isActive: user.status === 'ACTIVE',
                createdAt: user.createdAt
            }
        });

    } catch (error) {
        console.error('Create user error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create user: ' + error.message
        });
    }
});

/**
 * PUT /api/users/:id
 * Update user details
 */
router.put('/:id', authMiddleware, async (req, res) => {
    try {
        const tenantId = req.tenant?.id;
        const { id } = req.params;
        const { name, email, password, role, isActive } = req.body;

        if (!tenantId) {
            return res.status(400).json({ success: false, error: 'Tenant context missing' });
        }

        // Capture previous state for audit trail
        const prevUser = await prisma.user.findUnique({ where: { id }, include: { role: true } });
        if (prevUser) {
            req._auditPreviousState = {
                name: prevUser.fullName,
                email: prevUser.email,
                role: prevUser.role?.type,
                roleId: prevUser.role?.id,
                isActive: prevUser.status === 'ACTIVE'
            };
        }

        const updateData = {};
        if (name) {
            const [firstName, ...lastNameParts] = name.split(' ');
            updateData.firstName = firstName;
            updateData.lastName = lastNameParts.join(' ') || '-';
            updateData.fullName = name;
        }
        if (email) updateData.email = email.toLowerCase();
        if (password) updateData.passwordHash = await bcrypt.hash(password, 10);
        if (isActive !== undefined) updateData.status = isActive ? 'ACTIVE' : 'INACTIVE';

        if (role) {
            // Backward compatibility: map legacy values
            let mappedRoleType = role;
            if (role === 'ADMIN') mappedRoleType = 'TENANT_ADMIN';
            if (role === 'COMPANY') mappedRoleType = 'AGENCY_ADMIN';

            const dbRole = await prisma.role.findFirst({
                where: { tenantId, type: mappedRoleType }
            });
            if (dbRole) updateData.roleId = dbRole.id;
        }

        const user = await prisma.user.update({
            where: { id },
            data: updateData,
            include: { role: true }
        });

        res.json({
            success: true,
            data: {
                id: user.id,
                name: user.fullName,
                email: user.email,
                role: user.role?.type,
                roleId: user.role?.id,
                roleName: user.role?.name,
                roleCode: user.role?.code,
                isActive: user.status === 'ACTIVE',
                createdAt: user.createdAt
            }
        });

    } catch (error) {
        console.error('Update user error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update user'
        });
    }
});

/**
 * PATCH /api/users/:id/active
 * Toggle user active status
 */
router.patch('/:id/active', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { isActive } = req.body;

        const user = await prisma.user.update({
            where: { id },
            data: {
                status: isActive ? 'ACTIVE' : 'INACTIVE'
            }
        });

        res.json({
            success: true,
            data: {
                id: user.id,
                isActive: user.status === 'ACTIVE'
            }
        });

    } catch (error) {
        console.error('Toggle status error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update user status'
        });
    }
});

module.exports = router;
