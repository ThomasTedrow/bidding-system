const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware');
const { upload } = require('../middleware/templateUploadMiddleware');
const {
    getTemplates,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    downloadTemplate
} = require('../controllers/templateController');

router.use(authenticate);

// Get all templates with pagination
router.get('/templates', getTemplates);

// Create a new template
router.post('/templates', upload.single('template'), createTemplate);

// Update a template (with file upload support)
router.put('/templates/:id', upload.single('template'), updateTemplate);

// Delete a template
router.delete('/templates/:id', deleteTemplate);

// Download template file
router.get('/templates/:id/download', downloadTemplate);

module.exports = router;

