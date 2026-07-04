const express = require('express');
const multer = require('multer');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware');
const { imageUpload } = require('../middleware/screenshotUploadMiddleware');
const {
    getBids,
    getBiddersForFilter,
    getProfilesForFilter,
    generateBidResume,
    downloadBidResume,
    applyBidStatus,
    getDashboardStats
} = require('../controllers/bidController');

// All bid routes require authentication
router.use(authenticate);

// Get bids with filters
router.get('/bids', getBids);

// Get bidders for filter dropdown
router.get('/bids/bidders', getBiddersForFilter);

// Get profiles for filter dropdown
router.get('/bids/profiles', getProfilesForFilter);

// Get dashboard stats
router.get('/bids/dashboard', getDashboardStats);

// Generate resume for a job and profile
router.post('/bids/generate-resume', generateBidResume);

// Download generated resume
router.get('/bids/download-resume', downloadBidResume);

// Apply for a job (create BidStatus with optional note and screenshots)
router.post('/bids/apply', (req, res, next) => {
    imageUpload.array('screenshots', 3)(req, res, (err) => {
        if (err) {
            // Handle multer errors
            if (err instanceof multer.MulterError) {
                if (err.code === 'LIMIT_FILE_SIZE') {
                    return res.status(400).json({
                        error: 'File too large',
                        message: 'Screenshot file size must be less than 5MB'
                    });
                }
                if (err.code === 'LIMIT_UNEXPECTED_FILE') {
                    return res.status(400).json({
                        error: 'Too many files',
                        message: 'You can upload up to 3 screenshots'
                    });
                }
                return res.status(400).json({
                    error: 'Upload error',
                    message: err.message
                });
            }
            // Handle other errors (e.g., file type validation)
            return res.status(400).json({
                error: 'Upload error',
                message: err.message
            });
        }
        next();
    });
}, applyBidStatus);

module.exports = router;


