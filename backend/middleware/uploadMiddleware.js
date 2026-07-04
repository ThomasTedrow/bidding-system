const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { ensureDirSync, TEMP_UPLOAD_DIR } = require('../../backend/config/storage');

// Configure multer storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // Temp storage for /generate-resume uploads (deleted after response)
        ensureDirSync(TEMP_UPLOAD_DIR);
        cb(null, TEMP_UPLOAD_DIR);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname) || '.docx';
        cb(null, `template-${uniqueSuffix}${ext}`);
    }
});

// Configure multer for file uploads
const upload = multer({
    storage,
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
            cb(null, true);
        } else {
            cb(new Error('Only .docx files are allowed'));
        }
    },
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    }
});

module.exports = {
    upload
};

