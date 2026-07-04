const { generateResume } = require('../services/resumeGenerator');
const path = require('path');
const fs = require('fs');
const { ensureDirSync, OUTPUTS_DIR, TEMPLATE_DIR } = require('../config/storage');
const Template = require('../models/Template');

const outputsDir = OUTPUTS_DIR;
ensureDirSync(outputsDir);

function resolveTemplateFilePath(storedPath, logMissing = false) {
    if (!storedPath) return null;
    const raw = String(storedPath).trim().replace(/^"+|"+$/g, '');
    const basename = path.basename(raw);
    // Try TEMPLATE_DIR + filename first so DB can store just filename (portable)
    const candidates = [
        path.join(TEMPLATE_DIR, basename),
        path.join(TEMPLATE_DIR, raw),
        raw,
        path.resolve(process.cwd(), raw)
    ];
    for (const candidate of candidates) {
        if (candidate && fs.existsSync(candidate)) return candidate;
    }
    if (logMissing) {
        console.error('[resolveTemplateFilePath] Template file not found. Stored path:', raw);
        console.error('[resolveTemplateFilePath] TEMPLATE_DIR:', TEMPLATE_DIR);
        candidates.forEach((c, i) => console.error(`  candidate[${i}]: ${c} exists=${c ? fs.existsSync(c) : false}`));
    }
    return raw;
}

/**
 * Health check endpoint
 */
const healthCheck = (req, res) => {
    res.json({
        status: 'ok',
        message: 'Resume Generator API is running'
    });
};

/**
 * Generate resume from template and job description
 * Accepts either templateId (from DB) or template file upload. templateId takes priority.
 */
const generateResumeController = async (req, res) => {
    try {
        const { jobDescription, templateId } = req.body || {};
        console.log('[generate-resume] body:', { templateId: templateId != null ? String(templateId).slice(0, 24) + '...' : undefined, hasFile: !!req.file, hasJobDesc: !!(jobDescription && jobDescription.trim()) });

        // Validation
        if (!jobDescription || jobDescription.trim().length === 0) {
            return res.status(400).json({
                error: 'Job description is required'
            });
        }

        let templatePath = null;
        let profileName = null; // Name of Template (from DB), used for generated filename
        let companies = null; // Companies array extracted from template

        // Priority 1: Use template from database if templateId provided
        const rawTemplateId = templateId != null ? String(templateId).trim() : '';
        if (rawTemplateId) {
            const template = await Template.findById(rawTemplateId).lean();
            if (!template) {
                return res.status(400).json({
                    error: 'Template not found',
                    message: 'The selected template does not exist'
                });
            }
            templatePath = resolveTemplateFilePath(template.templateUrl, true);
            if (!templatePath || !fs.existsSync(templatePath)) {
                return res.status(400).json({
                    error: 'Template file not found',
                    message: 'The template file is missing on the server. Re-upload the template from the Templates page, or use "upload from local" below.'
                });
            }
            profileName = template.profileName ? String(template.profileName).trim() : null;
            companies = template.companies || null;
        }
        // Priority 2: Use uploaded template file
        else if (req.file) {
            templatePath = req.file.path;
        }

        if (!templatePath) {
            return res.status(400).json({
                error: 'Resume template is required',
                message: 'Please select a template from the database or upload a .docx file'
            });
        }

        console.log('Generating resume...');
        console.log('Job Description length:', jobDescription.length);
        console.log('Template path:', templatePath);

        // Generate resume (companies = companies array from template; profileName = Template name for filename and candidate name)
        const result = await generateResume(
            jobDescription,
            templatePath,
            profileName,
            null, // companyName parameter (not used currently)
            companies // companies array from template or null
        );

        // Send the generated document as download
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
        res.send(result.buffer);

        // Cleanup: only delete temp uploaded file (not DB template)
        if (req.file && req.file.path) {
            setTimeout(() => {
                if (fs.existsSync(req.file.path)) {
                    fs.unlinkSync(req.file.path);
                }
            }, 1000);
        }

    } catch (error) {
        console.error('Error generating resume:', error);
        res.status(500).json({
            error: 'Failed to generate resume',
            message: error.message
        });
    }
};

/**
 * Download generated resume file
 */
const downloadResume = (req, res) => {
    try {
        const filePath = path.join(outputsDir, req.params.filename);

        if (fs.existsSync(filePath)) {
            res.download(filePath);
        } else {
            res.status(404).json({
                error: 'File not found'
            });
        }
    } catch (error) {
        console.error('Error downloading resume:', error);
        res.status(500).json({
            error: 'Failed to download resume',
            message: error.message
        });
    }
};

module.exports = {
    healthCheck,
    generateResumeController,
    downloadResume
};

