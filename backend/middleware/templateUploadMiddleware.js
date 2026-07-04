const multer = require('multer');
const path = require('path');
const { ensureDirSync, TEMPLATE_DIR } = require('../config/storage');

// Use same template directory as rest of app (resume generation, template download)
ensureDirSync(TEMPLATE_DIR);

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, TEMPLATE_DIR);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, `temp-${uniqueSuffix}-${file.originalname}`);
    }
});

// Configure multer for template file uploads
const upload = multer({
    storage,
    fileFilter: (req, file, cb) => {
        const allowedTypes = [
            'application/pdf',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/msword'
        ];
        
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Only PDF, DOCX, and DOC files are allowed'));
        }
    },
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    }
});

module.exports = {
    upload
};

