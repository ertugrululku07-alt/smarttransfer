// src/routes/pages.js
// CMS Pages management - stored in tenant settings JSON

const express = require('express');

const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
const prisma = require('../lib/prisma');

/**
 * GET /api/pages
 * Get all published pages for current tenant (public)
 */
router.get('/', async (req, res) => {
    try {
        const tenant = await prisma.tenant.findUnique({
            where: { id: req.tenant.id },
            select: { settings: true }
        });

        if (!tenant) {
            return res.status(404).json({ success: false, error: 'Tenant not found' });
        }

        const pages = (tenant.settings?.pages || []).filter(p => p.isPublished);

        // Return only public fields
        const publicPages = pages.map(p => ({
            id: p.id,
            title: p.title,
            slug: p.slug,
            excerpt: p.excerpt,
            icon: p.icon,
            showInMenu: p.showInMenu,
            menuOrder: p.menuOrder,
            showInFooter: p.showInFooter,
            category: p.category
        }));

        res.json({ success: true, data: { pages: publicPages } });
    } catch (error) {
        console.error('Get pages error:', error);
        res.status(500).json({ success: false, error: 'Failed to load pages' });
    }
});

/**
 * GET /api/pages/all
 * Get all pages including drafts (Admin only)
 */
router.get('/all', authMiddleware, async (req, res) => {
    try {
        if (req.user.roleType !== 'TENANT_ADMIN' && req.user.roleType !== 'SUPER_ADMIN') {
            return res.status(403).json({ success: false, error: 'Permission denied' });
        }

        const tenant = await prisma.tenant.findUnique({
            where: { id: req.user.tenantId },
            select: { settings: true }
        });

        const pages = tenant?.settings?.pages || [];
        res.json({ success: true, data: { pages } });
    } catch (error) {
        console.error('Get all pages error:', error);
        res.status(500).json({ success: false, error: 'Failed to load pages' });
    }
});

/**
 * GET /api/pages/:slug
 * Get single page by slug (public)
 */
router.get('/:slug', async (req, res) => {
    try {
        const { slug } = req.params;

        const tenant = await prisma.tenant.findUnique({
            where: { id: req.tenant.id },
            select: { settings: true }
        });

        if (!tenant) {
            return res.status(404).json({ success: false, error: 'Tenant not found' });
        }

        const pages = tenant.settings?.pages || [];
        const page = pages.find(p => p.slug === slug && p.isPublished);

        if (!page) {
            return res.status(404).json({ success: false, error: 'Page not found' });
        }

        res.json({ success: true, data: { page } });
    } catch (error) {
        console.error('Get page error:', error);
        res.status(500).json({ success: false, error: 'Failed to load page' });
    }
});

/**
 * POST /api/pages
 * Create a new page (Admin only)
 */
router.post('/', authMiddleware, async (req, res) => {
    try {
        if (req.user.roleType !== 'TENANT_ADMIN' && req.user.roleType !== 'SUPER_ADMIN') {
            return res.status(403).json({ success: false, error: 'Permission denied' });
        }

        const { title, slug, content, excerpt, icon, isPublished, showInMenu, showInFooter, menuOrder, category, metaTitle, metaDescription } = req.body;

        if (!title || !slug) {
            return res.status(400).json({ success: false, error: 'Title and slug are required' });
        }

        const tenant = await prisma.tenant.findUnique({
            where: { id: req.user.tenantId },
            select: { settings: true }
        });

        const currentSettings = tenant?.settings || {};
        const pages = currentSettings.pages || [];

        // Check slug uniqueness
        if (pages.find(p => p.slug === slug)) {
            return res.status(400).json({ success: false, error: 'Bu slug zaten kullanılıyor' });
        }

        const newPage = {
            id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
            title,
            slug: slug.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
            content: content || '',
            excerpt: excerpt || '',
            icon: icon || '',
            isPublished: isPublished !== false,
            showInMenu: showInMenu || false,
            showInFooter: showInFooter || false,
            menuOrder: menuOrder || 0,
            category: category || 'general',
            metaTitle: metaTitle || title,
            metaDescription: metaDescription || excerpt || '',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        pages.push(newPage);

        await prisma.tenant.update({
            where: { id: req.user.tenantId },
            data: { settings: { ...currentSettings, pages } }
        });

        res.json({ success: true, data: { page: newPage } });
    } catch (error) {
        console.error('Create page error:', error);
        res.status(500).json({ success: false, error: 'Failed to create page' });
    }
});

/**
 * PUT /api/pages/:id
 * Update a page (Admin only)
 */
router.put('/:id', authMiddleware, async (req, res) => {
    try {
        if (req.user.roleType !== 'TENANT_ADMIN' && req.user.roleType !== 'SUPER_ADMIN') {
            return res.status(403).json({ success: false, error: 'Permission denied' });
        }

        const { id } = req.params;
        const { title, slug, content, excerpt, icon, isPublished, showInMenu, showInFooter, menuOrder, category, metaTitle, metaDescription } = req.body;

        const tenant = await prisma.tenant.findUnique({
            where: { id: req.user.tenantId },
            select: { settings: true }
        });

        const currentSettings = tenant?.settings || {};
        const pages = currentSettings.pages || [];
        const pageIndex = pages.findIndex(p => p.id === id);

        if (pageIndex === -1) {
            return res.status(404).json({ success: false, error: 'Page not found' });
        }

        // Check slug uniqueness (excluding current page)
        if (slug && pages.find(p => p.slug === slug && p.id !== id)) {
            return res.status(400).json({ success: false, error: 'Bu slug zaten kullanılıyor' });
        }

        const updatedPage = {
            ...pages[pageIndex],
            title: title !== undefined ? title : pages[pageIndex].title,
            slug: slug !== undefined ? slug.toLowerCase().replace(/[^a-z0-9-]/g, '-') : pages[pageIndex].slug,
            content: content !== undefined ? content : pages[pageIndex].content,
            excerpt: excerpt !== undefined ? excerpt : pages[pageIndex].excerpt,
            icon: icon !== undefined ? icon : pages[pageIndex].icon,
            isPublished: isPublished !== undefined ? isPublished : pages[pageIndex].isPublished,
            showInMenu: showInMenu !== undefined ? showInMenu : pages[pageIndex].showInMenu,
            showInFooter: showInFooter !== undefined ? showInFooter : pages[pageIndex].showInFooter,
            menuOrder: menuOrder !== undefined ? menuOrder : pages[pageIndex].menuOrder,
            category: category !== undefined ? category : pages[pageIndex].category,
            metaTitle: metaTitle !== undefined ? metaTitle : pages[pageIndex].metaTitle,
            metaDescription: metaDescription !== undefined ? metaDescription : pages[pageIndex].metaDescription,
            updatedAt: new Date().toISOString()
        };

        pages[pageIndex] = updatedPage;

        await prisma.tenant.update({
            where: { id: req.user.tenantId },
            data: { settings: { ...currentSettings, pages } }
        });

        res.json({ success: true, data: { page: updatedPage } });
    } catch (error) {
        console.error('Update page error:', error);
        res.status(500).json({ success: false, error: 'Failed to update page' });
    }
});

/**
 * DELETE /api/pages/:id
 * Delete a page (Admin only)
 */
router.delete('/:id', authMiddleware, async (req, res) => {
    try {
        if (req.user.roleType !== 'TENANT_ADMIN' && req.user.roleType !== 'SUPER_ADMIN') {
            return res.status(403).json({ success: false, error: 'Permission denied' });
        }

        const { id } = req.params;

        const tenant = await prisma.tenant.findUnique({
            where: { id: req.user.tenantId },
            select: { settings: true }
        });

        const currentSettings = tenant?.settings || {};
        const pages = currentSettings.pages || [];
        const newPages = pages.filter(p => p.id !== id);

        if (newPages.length === pages.length) {
            return res.status(404).json({ success: false, error: 'Page not found' });
        }

        await prisma.tenant.update({
            where: { id: req.user.tenantId },
            data: { settings: { ...currentSettings, pages: newPages } }
        });

        res.json({ success: true, message: 'Page deleted' });
    } catch (error) {
        console.error('Delete page error:', error);
        res.status(500).json({ success: false, error: 'Failed to delete page' });
    }
});

module.exports = router;
