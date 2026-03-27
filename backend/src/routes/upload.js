const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// Configuration
const uploadDir = path.join(__dirname, '../../public/uploads');
const urlPrefix = '/uploads'; // Relative path only — absolute URL is resolved by the client


// Ensure upload directory exists
fs.ensureDirSync(uploadDir);

// Multer Storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        // Generate unique filename: timestamp-random-originalName
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, uniqueSuffix + ext);
    }
});

// Filter
const fileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(new Error('Sadece resim dosyaları yüklenebilir!'), false);
    }
};

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
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

module.exports = router;
