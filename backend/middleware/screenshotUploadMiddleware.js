const multer = require('multer');
const path = require('path');
const fs = require('fs');


// Configure multer storage for bid screenshots
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // Base directory from env
        const baseDir = process.env.SCREENSHOT_UPLOAD_DIR;
        if (!baseDir) {
            return cb(new Error('SCREENSHOT_UPLOAD_DIR is not configured'), null);
        }

        // Create dated subfolder: YYYY-MM-DD
        const today = new Date();
        const folderName = today.toISOString().split('T')[0]; // YYYY-MM-DD
        const uploadDir = path.join(baseDir, folderName);

        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }

        console.log('Screenshot upload directory:', uploadDir);
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, `screenshot-${uniqueSuffix}${ext}`);
    }
});

// Only allow common image types
const imageUpload = multer({
    storage,
    fileFilter: (req, file, cb) => {
        const allowedTypes = [
            'image/png',
            'image/jpeg',
            'image/jpg',
            'image/webp'
        ];

        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Only PNG, JPG, and WEBP image files are allowed for screenshots'));
        }
    },
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB
    }
});

module.exports = {
    imageUpload
};


