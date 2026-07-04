const express = require('express');
const router = express.Router();
const { upload } = require('../middleware/uploadMiddleware');
const {
    healthCheck,
    generateResumeController,
    downloadResume
} = require('../controllers/resumeController');

// Health check route
router.get('/health', healthCheck);

// Generate resume route
router.post('/generate-resume', upload.single('template'), generateResumeController);

// Download resume route
router.get('/outputs/:filename', downloadResume);

module.exports = router;

