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
        const { name, color, polygon } = req.body;

        if (!name || !polygon || !Array.isArray(polygon)) {
            return res.status(400).json({ success: false, error: 'Name and a valid polygon array are required' });
        }

        const newZone = await prisma.zone.create({
            data: {
                tenantId,
                name,
                color: color || '#3388ff',
                polygon,
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
        const { name, color, polygon } = req.body;

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

module.exports = router;
