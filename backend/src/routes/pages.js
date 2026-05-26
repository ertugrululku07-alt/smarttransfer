// src/routes/pages.js
// CMS Pages management - stored in tenant settings JSON
// Auto-translates pages to all supported languages on save

const express = require('express');

const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
const prisma = require('../lib/prisma');

const SUPPORTED_LOCALES = ['en', 'de', 'ru']; // TR is source, no translation needed

/**
 * Translate page content to all supported languages using DeepL.
 * Stores translations in page.translations = { en: { title, content, excerpt, metaTitle, metaDescription }, de: {...}, ru: {...} }
 */
async function translatePageToAllLanguages(page, tenantId) {
    try {
        // Get DeepL API key from tenant settings
        const tenant = await prisma.tenant.findUnique({
            where: { id: tenantId },
            select: { settings: true }
        });
        const deeplApiKey = tenant?.settings?.deeplApiKey || process.env.DEEPL_API_KEY;
        if (!deeplApiKey) {
            console.warn('[Pages] No DeepL API key configured, skipping auto-translation');
            return page;
        }

        const isFreeKey = deeplApiKey.endsWith(':fx');
        const baseUrl = isFreeKey
            ? 'https://api-free.deepl.com/v2/translate'
            : 'https://api.deepl.com/v2/translate';

        const translations = page.translations || {};

        // Extract text parts from HTML content
        function extractTexts(html) {
            if (!html) return [];
            const parts = html.split(/(<[^>]+>)/);
            const texts = [];
            parts.forEach((part, i) => {
                if (!part.startsWith('<') && part.trim().length > 0) {
                    texts.push({ index: i, text: part });
                }
            });
            return { parts, texts };
        }

        function reassemble(parts, texts, translated) {
            texts.forEach((t, idx) => {
                if (translated[idx]) parts[t.index] = translated[idx];
            });
            return parts.join('');
        }

        for (const lang of SUPPORTED_LOCALES) {
            try {
                // Collect all texts to translate in one batch
                const textsToTranslate = [];
                textsToTranslate.push(page.title || '');
                textsToTranslate.push(page.excerpt || '');
                textsToTranslate.push(page.metaTitle || page.title || '');
                textsToTranslate.push(page.metaDescription || page.excerpt || '');

                // Extract content text parts
                const { parts: contentParts, texts: contentTexts } = extractTexts(page.content);
                contentTexts.forEach(ct => textsToTranslate.push(ct.text));

                // Filter out empty strings
                const nonEmpty = textsToTranslate.map((t, i) => ({ t, i })).filter(x => x.t.trim().length > 0);
                if (nonEmpty.length === 0) {
                    translations[lang] = { title: page.title, content: page.content, excerpt: page.excerpt, metaTitle: page.metaTitle, metaDescription: page.metaDescription };
                    continue;
                }

                // Call DeepL (batch, max 50 per call)
                const allTranslated = [];
                for (let i = 0; i < nonEmpty.length; i += 50) {
                    const chunk = nonEmpty.slice(i, i + 50);
                    const params = new URLSearchParams();
                    chunk.forEach(x => params.append('text', x.t));
                    params.append('target_lang', lang.toUpperCase());
                    params.append('source_lang', 'TR');
                    params.append('preserve_formatting', '1');

                    const response = await fetch(baseUrl, {
                        method: 'POST',
                        headers: {
                            'Authorization': `DeepL-Auth-Key ${deeplApiKey}`,
                            'Content-Type': 'application/x-www-form-urlencoded',
                        },
                        body: params.toString(),
                    });

                    if (response.ok) {
                        const data = await response.json();
                        const results = data.translations || [];
                        results.forEach(r => allTranslated.push(r.text));
                    } else {
                        // Fallback: use original texts
                        chunk.forEach(x => allTranslated.push(x.t));
                    }
                }

                // Map translations back
                const fullResult = [...textsToTranslate];
                nonEmpty.forEach((x, idx) => {
                    fullResult[x.i] = allTranslated[idx] || x.t;
                });

                // Reassemble content HTML
                const translatedContent = reassemble(contentParts, contentTexts, fullResult.slice(4));

                translations[lang] = {
                    title: fullResult[0],
                    excerpt: fullResult[1],
                    metaTitle: fullResult[2],
                    metaDescription: fullResult[3],
                    content: translatedContent,
                };

                console.log(`[Pages] Translated "${page.title}" to ${lang}`);
            } catch (langErr) {
                console.error(`[Pages] Translation to ${lang} failed:`, langErr.message);
                // Keep existing translation if any
                if (!translations[lang]) {
                    translations[lang] = { title: page.title, content: page.content, excerpt: page.excerpt, metaTitle: page.metaTitle, metaDescription: page.metaDescription };
                }
            }
        }

        page.translations = translations;
        return page;
    } catch (err) {
        console.error('[Pages] Auto-translation error:', err.message);
        return page;
    }
}

/**
 * GET /api/pages
 * Get all published pages for current tenant (public)
 */
router.get('/', async (req, res) => {
    try {
        const lang = (req.query.lang || 'tr').toString().toLowerCase();

        const tenant = await prisma.tenant.findUnique({
            where: { id: req.tenant.id },
            select: { settings: true }
        });

        if (!tenant) {
            return res.status(404).json({ success: false, error: 'Tenant not found' });
        }

        const pages = (tenant.settings?.pages || []).filter(p => p.isPublished);

        // Return only public fields, with translated title/excerpt if available
        const publicPages = pages.map(p => {
            const translated = (lang !== 'tr' && p.translations && p.translations[lang]) ? p.translations[lang] : null;
            return {
                id: p.id,
                title: translated?.title || p.title,
                slug: p.slug,
                excerpt: translated?.excerpt || p.excerpt,
                icon: p.icon,
                showInMenu: p.showInMenu,
                menuOrder: p.menuOrder,
                showInFooter: p.showInFooter,
                category: p.category
            };
        });

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
        const lang = (req.query.lang || 'tr').toString().toLowerCase();

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

        // If requesting non-TR language and translation exists, return translated version
        if (lang !== 'tr' && page.translations && page.translations[lang]) {
            const translated = page.translations[lang];
            const localizedPage = {
                ...page,
                title: translated.title || page.title,
                content: translated.content || page.content,
                excerpt: translated.excerpt || page.excerpt,
                metaTitle: translated.metaTitle || page.metaTitle,
                metaDescription: translated.metaDescription || page.metaDescription,
            };
            // Don't send all translations to frontend (save bandwidth)
            delete localizedPage.translations;
            return res.json({ success: true, data: { page: localizedPage } });
        }

        // Return TR version (strip translations object to save bandwidth)
        const { translations, ...pageWithoutTranslations } = page;
        res.json({ success: true, data: { page: pageWithoutTranslations } });
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

        const { title, slug, content, excerpt, icon, isPublished, showInMenu, showInFooter, menuOrder, category, metaTitle, metaDescription, heroImage } = req.body;

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
            heroImage: heroImage || '',
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

        // Auto-translate to all languages in background (don't block response)
        res.json({ success: true, data: { page: newPage } });

        // Background translation
        translatePageToAllLanguages(newPage, req.user.tenantId).then(async (translatedPage) => {
            if (translatedPage.translations) {
                const freshTenant = await prisma.tenant.findUnique({ where: { id: req.user.tenantId }, select: { settings: true } });
                const freshPages = freshTenant?.settings?.pages || [];
                const idx = freshPages.findIndex(p => p.id === newPage.id);
                if (idx !== -1) {
                    freshPages[idx] = translatedPage;
                    await prisma.tenant.update({
                        where: { id: req.user.tenantId },
                        data: { settings: { ...freshTenant.settings, pages: freshPages } }
                    });
                    console.log(`[Pages] Auto-translated "${newPage.title}" saved to DB`);
                }
            }
        }).catch(err => console.error('[Pages] Background translation failed:', err.message));
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
        const { title, slug, content, excerpt, icon, isPublished, showInMenu, showInFooter, menuOrder, category, metaTitle, metaDescription, heroImage } = req.body;

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
            heroImage: heroImage !== undefined ? heroImage : pages[pageIndex].heroImage,
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

        // Auto-translate to all languages in background
        res.json({ success: true, data: { page: updatedPage } });

        translatePageToAllLanguages(updatedPage, req.user.tenantId).then(async (translatedPage) => {
            if (translatedPage.translations) {
                const freshTenant = await prisma.tenant.findUnique({ where: { id: req.user.tenantId }, select: { settings: true } });
                const freshPages = freshTenant?.settings?.pages || [];
                const idx = freshPages.findIndex(p => p.id === updatedPage.id);
                if (idx !== -1) {
                    freshPages[idx] = translatedPage;
                    await prisma.tenant.update({
                        where: { id: req.user.tenantId },
                        data: { settings: { ...freshTenant.settings, pages: freshPages } }
                    });
                    console.log(`[Pages] Re-translated "${updatedPage.title}" saved to DB`);
                }
            }
        }).catch(err => console.error('[Pages] Background translation failed:', err.message));
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
