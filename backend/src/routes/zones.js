const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const { authMiddleware: auth } = require('../middleware/auth');

const prisma = new PrismaClient();

// Get all zones
router.get('/', auth, async (req, res) => {
    try {
        const tenantId = req.user.tenantId;

        const zones = await prisma.zone.findMany({
            where: { tenantId },
            orderBy: { createdAt: 'desc' },
        });

        res.json({ success: true, data: zones });
    } catch (error) {
        console.error('Error fetching zones:', error);
        res.status(500).json({ success: false, error: 'Server error' });
    }
});

// Create a new zone
router.post('/', auth, async (req, res) => {
    try {
        const tenantId = req.user.tenantId;
        const { name, code, keywords, color, polygon } = req.body;

        if (!name) {
            return res.status(400).json({ success: false, error: 'Bölge adı zorunludur' });
        }

        const newZone = await prisma.zone.create({
            data: {
                tenantId,
                name,
                code: code || null,
                keywords: keywords || null,
                color: color || '#3388ff',
                polygon: polygon || null,
            },
        });

        res.json({ success: true, data: newZone });
    } catch (error) {
        console.error('Error creating zone:', error);
        res.status(500).json({ success: false, error: 'Server error' });
    }
});

// Update a zone
router.put('/:id', auth, async (req, res) => {
    try {
        const tenantId = req.user.tenantId;
        const { id } = req.params;
        const { name, code, keywords, color, polygon } = req.body;

        const existing = await prisma.zone.findFirst({
            where: { id, tenantId }
        });

        if (!existing) {
            return res.status(404).json({ success: false, error: 'Zone not found' });
        }

        const updatedZone = await prisma.zone.update({
            where: { id },
            data: {
                name: name !== undefined ? name : existing.name,
                code: code !== undefined ? code : existing.code,
                keywords: keywords !== undefined ? keywords : existing.keywords,
                color: color !== undefined ? color : existing.color,
                polygon: polygon !== undefined ? polygon : existing.polygon,
            },
        });

        res.json({ success: true, data: updatedZone });
    } catch (error) {
        console.error('Error updating zone:', error);
        res.status(500).json({ success: false, error: 'Server error' });
    }
});

// Delete a zone
router.delete('/:id', auth, async (req, res) => {
    try {
        const tenantId = req.user.tenantId;
        const { id } = req.params;

        const existing = await prisma.zone.findFirst({
            where: { id, tenantId }
        });

        if (!existing) {
            return res.status(404).json({ success: false, error: 'Zone not found' });
        }

        await prisma.zone.delete({
            where: { id },
        });

        res.json({ success: true, message: 'Zone deleted successfully' });
    } catch (error) {
        console.error('Error deleting zone:', error);
        res.status(500).json({ success: false, error: 'Server error' });
    }
});

// Migrate hubs from tenant.settings.hubs into Zone table
router.post('/migrate-hubs', auth, async (req, res) => {
    try {
        const tenantId = req.user.tenantId;
        
        // Get existing hubs from tenant settings
        const tenant = await prisma.tenant.findUnique({
            where: { id: tenantId },
            select: { settings: true }
        });
        const hubs = tenant?.settings?.hubs || [];
        
        if (hubs.length === 0) {
            return res.json({ success: true, message: 'Taşınacak hub bulunamadı', migrated: 0 });
        }

        // Check which hubs already exist as zones (by code)
        const existingZones = await prisma.zone.findMany({
            where: { tenantId },
            select: { code: true }
        });
        const existingCodes = new Set(existingZones.map(z => z.code).filter(Boolean));

        let migrated = 0;
        for (const hub of hubs) {
            if (existingCodes.has(hub.code)) continue; // skip if already exists
            
            await prisma.zone.create({
                data: {
                    tenantId,
                    name: hub.name,
                    code: hub.code,
                    keywords: hub.keywords || null,
                    color: '#3388ff',
                    polygon: null, // hubs originally had no polygon
                }
            });
            migrated++;
        }

        res.json({ success: true, message: `${migrated} hub bölge olarak taşındı`, migrated });
    } catch (error) {
        console.error('Hub migration error:', error);
        res.status(500).json({ success: false, error: 'Migration failed: ' + error.message });
    }
});

module.exports = router;
