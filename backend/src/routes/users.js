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

        // Map to frontend expected format
        const formattedUsers = users.map(u => {
            let mappedRole = 'CUSTOMER';
            const rt = u.role.type;
            
            if (['SUPER_ADMIN', 'TENANT_ADMIN', 'TENANT_MANAGER', 'TENANT_STAFF'].includes(rt)) mappedRole = 'ADMIN';
            else if (['AGENCY_ADMIN', 'AGENCY_STAFF', 'PARTNER'].includes(rt)) mappedRole = 'COMPANY';
            else if (rt === 'DRIVER') mappedRole = 'DRIVER';
            else if (rt === 'CUSTOMER') mappedRole = 'CUSTOMER';

            return {
                id: u.id,
                name: u.fullName,
                email: u.email,
                role: mappedRole,
                isActive: u.status === 'ACTIVE',
                createdAt: u.createdAt
            };
        });

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

        // Find the role ID based on the type provided by frontend (ADMIN, COMPANY, DRIVER, CUSTOMER)
        // We'll map these to the standard RoleTypes
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

        // Map role type back to frontend format for consistency
        let mappedReturnRole = 'CUSTOMER';
        const rt = user.role?.type;
        if (['SUPER_ADMIN', 'TENANT_ADMIN', 'TENANT_MANAGER', 'TENANT_STAFF'].includes(rt)) mappedReturnRole = 'ADMIN';
        else if (['AGENCY_ADMIN', 'AGENCY_STAFF', 'PARTNER'].includes(rt)) mappedReturnRole = 'COMPANY';
        else if (rt === 'DRIVER') mappedReturnRole = 'DRIVER';
        else if (rt === 'CUSTOMER') mappedReturnRole = 'CUSTOMER';

        res.status(201).json({
            success: true,
            data: {
                id: user.id,
                name: user.fullName,
                email: user.email,
                role: mappedReturnRole,
                roleType: user.role?.type,
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
            let prevMappedRole = 'CUSTOMER';
            const prt = prevUser.role?.type;
            if (['SUPER_ADMIN', 'TENANT_ADMIN', 'TENANT_MANAGER', 'TENANT_STAFF'].includes(prt)) prevMappedRole = 'ADMIN';
            else if (['AGENCY_ADMIN', 'AGENCY_STAFF', 'PARTNER'].includes(prt)) prevMappedRole = 'COMPANY';
            else if (prt === 'DRIVER') prevMappedRole = 'DRIVER';
            req._auditPreviousState = {
                name: prevUser.fullName,
                email: prevUser.email,
                role: prevMappedRole,
                roleType: prevUser.role?.type,
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

        // Map role type back to frontend format for consistency
        let mappedReturnRole = 'CUSTOMER';
        const rt = user.role?.type;
        if (['SUPER_ADMIN', 'TENANT_ADMIN', 'TENANT_MANAGER', 'TENANT_STAFF'].includes(rt)) mappedReturnRole = 'ADMIN';
        else if (['AGENCY_ADMIN', 'AGENCY_STAFF', 'PARTNER'].includes(rt)) mappedReturnRole = 'COMPANY';
        else if (rt === 'DRIVER') mappedReturnRole = 'DRIVER';
        else if (rt === 'CUSTOMER') mappedReturnRole = 'CUSTOMER';

        res.json({
            success: true,
            data: {
                id: user.id,
                name: user.fullName,
                email: user.email,
                role: mappedReturnRole,
                roleType: user.role?.type,
                roleId: user.role?.id,
                roleName: user.role?.name,
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
