const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
const sharp = require('sharp');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// Configuration
const uploadDir = path.join(__dirname, '../../public/uploads');
const urlPrefix = '/uploads'; // Relative path only — absolute URL is resolved by the client

// Logo variants directory
const logoDir = path.join(uploadDir, 'logos');

// Ensure upload directories exist
fs.ensureDirSync(uploadDir);
fs.ensureDirSync(logoDir);

// Multer Storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        console.log(`UPLOADING FILE TO: ${uploadDir}`);
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        const finalName = uniqueSuffix + ext;
        console.log(`SAVING AS: ${finalName}`);
        cb(null, finalName);
    }
});

// Filter
const fileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('audio/') || file.mimetype.startsWith('video/')) {
        cb(null, true);
    } else {
        cb(new Error('Sadece resim, ses veya video dosyaları yüklenebilir!'), false);
    }
};

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 20 * 1024 * 1024 // 20MB limit
    },
    fileFilter: fileFilter
});



/**
 * POST /api/upload/driver-docs
 * Upload a single file for driver registration (Public)
 */
router.post('/driver-docs', upload.single('file'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'Dosya yüklenemedi'
            });
        }

        const fileUrl = `${urlPrefix}/${req.file.filename}`;

        res.json({
            success: true,
            data: {
                url: fileUrl,
                filename: req.file.filename,
                mimetype: req.file.mimetype,
                size: req.file.size
            }
        });

    } catch (error) {
        console.error('Driver Upload error:', error);
        res.status(500).json({
            success: false,
            error: 'Dosya yüklenirken bir hata oluştu'
        });
    }
});

/**
 * POST /api/upload

 * Upload a single file
 */
router.post('/', authMiddleware, upload.single('file'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'Dosya yüklenemedi'
            });
        }

        const fileUrl = `${urlPrefix}/${req.file.filename}`;

        res.json({
            success: true,
            data: {
                url: fileUrl,
                filename: req.file.filename,
                mimetype: req.file.mimetype,
                size: req.file.size
            }
        });

    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({
            success: false,
            error: 'Dosya yüklenirken bir hata oluştu'
        });
    }
});

/**
 * POST /api/upload/logo
 * Upload and auto-optimize a logo image.
 * Creates multiple optimized variants for different use cases:
 *   - original: max 800px wide, quality 90, PNG
 *   - header:   max 200x60, fit inside, transparent bg, PNG
 *   - favicon:  64x64, square, PNG
 *   - voucher:  max 300x80, fit inside, PNG
 *   - email:    max 200x50, fit inside, PNG
 */
router.post('/logo', authMiddleware, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'Dosya yüklenemedi' });
        }

        const inputPath = req.file.path;
        const baseName = Date.now() + '-' + Math.round(Math.random() * 1E9);

        // Define logo variants with their sizing constraints
        const variants = [
            { name: 'original', maxWidth: 800, maxHeight: 400, suffix: '' },
            { name: 'header',   maxWidth: 200, maxHeight: 60,  suffix: '-header' },
            { name: 'favicon',  maxWidth: 64,  maxHeight: 64,  suffix: '-favicon' },
            { name: 'voucher',  maxWidth: 300, maxHeight: 80,  suffix: '-voucher' },
            { name: 'email',    maxWidth: 200, maxHeight: 50,  suffix: '-email' },
        ];

        const results = {};

        for (const variant of variants) {
            const outputFilename = `${baseName}${variant.suffix}.png`;
            const outputPath = path.join(logoDir, outputFilename);

            let pipeline = sharp(inputPath).trim();
            pipeline = pipeline.resize(variant.maxWidth, variant.maxHeight, {
                fit: variant.name === 'favicon' ? 'cover' : 'inside',
                withoutEnlargement: false,
                background: { r: 0, g: 0, b: 0, alpha: 0 }
            });
            await pipeline
                .png({ quality: 90, compressionLevel: 8 })
                .toFile(outputPath);

            results[variant.name] = `${urlPrefix}/logos/${outputFilename}`;
        }

        // Clean up the raw uploaded file
        await fs.remove(inputPath);

        res.json({
            success: true,
            data: {
                url: results.original,       // Main logo URL (backward compatible)
                variants: results,            // All variant URLs
                filename: `${baseName}.png`,
                mimetype: 'image/png'
            }
        });

    } catch (error) {
        console.error('Logo upload/optimize error:', error);
        // Clean up on error
        if (req.file?.path) await fs.remove(req.file.path).catch(() => {});
        res.status(500).json({ success: false, error: 'Logo yüklenirken bir hata oluştu' });
    }
});

module.exports = router;
