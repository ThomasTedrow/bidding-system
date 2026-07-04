const Template = require('../models/Template');
const path = require('path');
const fs = require('fs');
const { ensureDirSync, TEMPLATE_DIR } = require('../config/storage');
const { extractCompanyInfoFromTemplate } = require('../services/templateExtractor');

// Ensure templates directory exists (Render Disk: /var/data/template)
ensureDirSync(TEMPLATE_DIR);

function resolveTemplateFilePath(storedPath) {
    if (!storedPath) return null;
    const raw = String(storedPath).trim().replace(/^"+|"+$/g, '');
    const basename = path.basename(raw);
    // Prefer TEMPLATE_DIR + filename so DB can store just filename (portable)
    const candidates = [
        path.join(TEMPLATE_DIR, basename),
        path.join(TEMPLATE_DIR, raw),
        raw,
        path.resolve(process.cwd(), raw)
    ];

    for (const candidate of candidates) {
        if (candidate && fs.existsSync(candidate)) return candidate;
    }
    return raw;
}

/**
 * Get all templates with pagination
 */
const getTemplates = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const totalTemplates = await Template.countDocuments();
        const totalPages = Math.ceil(totalTemplates / limit);

        const templates = await Template.find()
            .populate('bidderId', 'Name email')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        const publicBaseUrl = (process.env.PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');

        // Format response
        const formattedTemplates = templates.map(template => ({
            id: template._id,
            profileName: template.profileName,
            // Prefer relative URL to avoid https/http mixed-content issues.
            // If you want absolute URLs, set PUBLIC_BASE_URL=https://your-domain
            templateUrl: publicBaseUrl
                ? `${publicBaseUrl}/api/templates/${template._id}/download`
                : `/api/templates/${template._id}/download`,
            fileName: template.fileName,
            fileType: template.fileType,
            bidderId: template.bidderId?._id || null,
            bidderName: template.bidderId?.Name || null,
            Legion: template.Legion || null,
            createdAt: template.createdAt
        }));

        res.json({
            success: true,
            templates: formattedTemplates,
            currentPage: page,
            totalPages,
            totalTemplates
        });

    } catch (error) {
        console.error('Error fetching templates:', error);
        res.status(500).json({
            error: 'Failed to fetch templates',
            message: error.message
        });
    }
};

/**
 * Create a new template
 */
const createTemplate = async (req, res) => {
    try {
        const { profileName, Legion } = req.body;

        if (!profileName || !profileName.trim()) {
            return res.status(400).json({
                error: 'Profile Name is required'
            });
        }

        if (!req.file) {
            return res.status(400).json({
                error: 'Template file is required'
            });
        }

        // Validate Legion if provided
        if (Legion && !['US', 'Latin America', 'Europe'].includes(Legion)) {
            return res.status(400).json({
                error: 'Invalid Legion value. Must be US, Latin America, or Europe'
            });
        }

        // Determine file type
        const fileExt = path.extname(req.file.originalname).toLowerCase().slice(1);
        const allowedTypes = ['pdf', 'docx', 'doc'];

        if (!allowedTypes.includes(fileExt)) {
            return res.status(400).json({
                error: 'Invalid file type. Only PDF, DOCX, and DOC files are allowed'
            });
        }

        // File is already saved into TEMPLATE_DIR by multer. Store filename only so path works across envs.
        const filePath = req.file.path;
        const storedPath = path.basename(filePath);

        // Extract company info from template file if it's a DOCX file
        let companies = null;
        if (fileExt === 'docx') {
            try {
                const extractedInfo = await extractCompanyInfoFromTemplate(filePath);
                companies = extractedInfo?.companies || null;
            } catch (error) {
                console.error('Error extracting company info from template:', error);
                // Continue without company info if extraction fails
            }
        }

        // Create template record
        const template = new Template({
            profileName: profileName.trim(),
            templateUrl: storedPath,
            fileName: req.file.originalname,
            fileType: fileExt,
            fileSize: req.file.size,
            Legion: Legion || null,
            companies: companies
        });

        await template.save();

        res.status(201).json({
            success: true,
            message: 'Template uploaded successfully',
            template: {
                id: template._id,
                profileName: template.profileName,
                fileName: template.fileName
            }
        });

    } catch (error) {
        console.error('Error creating template:', error);

        // Clean up uploaded file if template creation failed
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }

        res.status(500).json({
            error: 'Failed to create template',
            message: error.message
        });
    }
};

/**
 * Update template (profile name, file, bidder assignment, legion)
 */
const updateTemplate = async (req, res) => {
    try {
        const { id } = req.params;
        const { profileName, bidderId, Legion } = req.body;

        console.log('Update template request:', {
            id,
            body: req.body,
            file: req.file ? req.file.originalname : 'no file'
        });

        const template = await Template.findById(id);
        if (!template) {
            return res.status(404).json({
                error: 'Template not found'
            });
        }

        const updateData = {};

        // Update profile name if provided
        if (profileName !== undefined && profileName !== null && profileName.trim()) {
            updateData.profileName = profileName.trim();
        }

        // Update bidder assignment if provided
        if (bidderId !== undefined) {
            updateData.bidderId = bidderId || null;
        }

        // Update Legion if provided
        if (Legion !== undefined) {
            if (Legion === '' || Legion === null) {
                updateData.Legion = null;
            } else if (['US', 'Latin America', 'Europe'].includes(Legion)) {
                updateData.Legion = Legion;
            } else {
                return res.status(400).json({
                    error: 'Invalid Legion value',
                    message: 'Legion must be US, Latin America, or Europe'
                });
            }
        }

        // Handle file update if a new file is uploaded
        if (req.file) {
            // Delete old file if it exists
            const oldPath = resolveTemplateFilePath(template.templateUrl);
            if (oldPath && fs.existsSync(oldPath)) {
                try {
                    fs.unlinkSync(oldPath);
                } catch (err) {
                    console.error('Error deleting old template file:', err);
                    // Continue even if old file deletion fails
                }
            }

            // Determine file type
            const fileExt = path.extname(req.file.originalname).toLowerCase().slice(1);
            const allowedTypes = ['pdf', 'docx', 'doc'];

            if (!allowedTypes.includes(fileExt)) {
                // Clean up uploaded file
                if (fs.existsSync(req.file.path)) {
                    fs.unlinkSync(req.file.path);
                }
                return res.status(400).json({
                    error: 'Invalid file type',
                    message: 'Only PDF, DOCX, and DOC files are allowed'
                });
            }

            // Update file-related fields (store filename only for portability)
            updateData.templateUrl = path.basename(req.file.path);
            updateData.fileName = req.file.originalname;
            updateData.fileType = fileExt;
            updateData.fileSize = req.file.size;

            // Extract company info from template file if it's a DOCX file
            if (fileExt === 'docx') {
                try {
                    const extractedInfo = await extractCompanyInfoFromTemplate(req.file.path);
                    updateData.companies = extractedInfo?.companies || null;
                } catch (error) {
                    console.error('Error extracting company info from template:', error);
                    // Continue without updating company info if extraction fails
                }
            }
        }

        // Check if there's anything to update
        if (Object.keys(updateData).length === 0 && !req.file) {
            return res.status(400).json({
                error: 'No updates provided',
                message: 'Please provide at least one field to update (profileName, template file, bidderId, or Legion)'
            });
        }

        // Update template
        const updatedTemplate = await Template.findByIdAndUpdate(
            id,
            { $set: updateData },
            { new: true, runValidators: true }
        ).populate('bidderId', 'Name email');

        console.log('Template updated successfully:', updatedTemplate._id);

        res.json({
            success: true,
            message: 'Template updated successfully',
            template: {
                id: updatedTemplate._id,
                profileName: updatedTemplate.profileName,
                fileName: updatedTemplate.fileName,
                bidderId: updatedTemplate.bidderId?._id || null,
                bidderName: updatedTemplate.bidderId?.Name || null,
                Legion: updatedTemplate.Legion || null
            }
        });

    } catch (error) {
        console.error('Error updating template:', error);

        // Clean up uploaded file if update failed
        if (req.file && fs.existsSync(req.file.path)) {
            try {
                fs.unlinkSync(req.file.path);
            } catch (err) {
                console.error('Error cleaning up uploaded file:', err);
            }
        }

        if (error.name === 'ValidationError') {
            return res.status(400).json({
                error: 'Validation error',
                message: error.message
            });
        }

        res.status(500).json({
            error: 'Failed to update template',
            message: error.message
        });
    }
};

/**
 * Delete template
 */
const deleteTemplate = async (req, res) => {
    try {
        const { id } = req.params;

        const template = await Template.findById(id);

        if (!template) {
            return res.status(404).json({
                error: 'Template not found'
            });
        }

        // Delete file from filesystem
        const filePath = resolveTemplateFilePath(template.templateUrl);
        if (filePath && fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        // Delete template record
        await Template.findByIdAndDelete(id);

        res.json({
            success: true,
            message: 'Template deleted successfully'
        });

    } catch (error) {
        console.error('Error deleting template:', error);
        res.status(500).json({
            error: 'Failed to delete template',
            message: error.message
        });
    }
};

/**
 * Download template file
 */
const downloadTemplate = async (req, res) => {
    try {
        const { id } = req.params;

        const template = await Template.findById(id);

        if (!template) {
            return res.status(404).json({
                error: 'Template not found'
            });
        }

        const filePath = resolveTemplateFilePath(template.templateUrl);

        if (!filePath || !fs.existsSync(filePath)) {
            return res.status(404).json({
                error: 'Template file not found',
                message: 'Template file is missing on the server'
            });
        }

        const downloadName = template.fileName || path.basename(filePath);
        res.download(filePath, downloadName, (err) => {
            if (err) {
                console.error('Error downloading template:', err);
                if (!res.headersSent) {
                    res.status(500).json({
                        error: 'Failed to download template'
                    });
                }
            }
        });

    } catch (error) {
        console.error('Error downloading template:', error);
        res.status(500).json({
            error: 'Failed to download template',
            message: error.message
        });
    }
};

module.exports = {
    getTemplates,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    downloadTemplate
};