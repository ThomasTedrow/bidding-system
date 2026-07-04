const Job = require('../models/Job');
const User = require('../models/User');
const Template = require('../models/Template');
const BidStatus = require('../models/BidStatus');
const AIResume = require('../models/AIResume');
const { generateResume } = require('../services/resumeGenerator');
const path = require('path');
const fs = require('fs');
const { ensureDirSync, OUTPUTS_DIR, SCREENSHOT_UPLOAD_DIR, TEMPLATE_DIR } = require('../config/storage');
const { getExcludedCompanyMatcher, filterJobsByExcludedCompanies, sortJobsByCalendarDate } = require('../utils/companyExclusion');

// Directory for generated resumes (shared with resumeController)
const outputsDir = OUTPUTS_DIR;
ensureDirSync(outputsDir);

const normalizeScreenshots = (screenshots) => {
    if (!Array.isArray(screenshots)) return [];
    return screenshots
        .filter(Boolean)
        .map((s) => String(s).startsWith('/') ? s : `/${s}`);
};

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Helper to format a job with AIResume and BidStatus info
const formatJobForBids = (job, aiResume, bidStatus, profile) => ({
    id: job._id,
    jobId: job.JobId,
    jobTitle: job.JobTitle,
    company: job.CompanyName,
    jobUrl: job.ApplyLink,
    date: job.Date ? new Date(job.Date).toISOString() : null,
    source: job.Source || null,
    legion: job.Legion || null,
    isClearance: !!job.isClearance,
    profileName: profile?.profileName || null,
    profileId: profile?._id || null,
    generatedResume: aiResume?.GeneratedResume || null,
    hasBidStatus: !!bidStatus,
    note: bidStatus?.Note || null,
    screenshots: normalizeScreenshots(bidStatus?.Screenshots),
    appliedDate: bidStatus?.AppliedDate ? new Date(bidStatus.AppliedDate).toISOString() : null
});

// Format job for admin view (bidStatus null when no application yet)
// id must always be job._id so frontend can send correct jobId for generate/download
const formatJobForAdmin = (job, bidStatus = null, options = {}) => ({
    id: job._id.toString(),
    jobId: job._id,
    jobTitle: job.JobTitle || null,
    jobUrl: job.ApplyLink || null,
    company: job.CompanyName || null,
    date: job.Date ? new Date(job.Date).toISOString() : null,
    legion: job.Legion || null,
    source: job.Source || null,
    isClearance: !!job.isClearance,
    bidder: bidStatus && bidStatus.bidderId ? {
        id: bidStatus.bidderId._id,
        name: bidStatus.bidderId.Name,
        email: bidStatus.bidderId.email
    } : null,
    profileName: bidStatus && bidStatus.profileId ? bidStatus.profileId.profileName : (options.profileName || null),
    profileId: options.profileId || null,
    generatedResume: options.generatedResume || null,
    applied: !!bidStatus,
    appliedDate: bidStatus && bidStatus.AppliedDate ? new Date(bidStatus.AppliedDate).toISOString() : null,
    note: bidStatus ? (bidStatus.Note || null) : null,
    screenshots: normalizeScreenshots(bidStatus?.Screenshots)
});

/**
 * Get bids - different logic for admin vs bidder
 * Admin: Returns BidStatus records (applied jobs) with filters
 * Bidder: Returns jobs filtered by profile and date
 */
const getBids = async (req, res) => {
    try {
        const { profileName, date, bidderId, search } = req.query;
        const { role, userId } = req.user; // From auth middleware

        // Admin: no search → date + profile → all matching jobs (with BidStatus when present).
        // Admin: with search → profileId + text search → applied jobs only.
        if (role === 'admin') {
            const searchTrimmed = search && String(search).trim() ? String(search).trim() : '';
            console.log(`Admin bids request - date: ${date}, profileName: ${profileName}, search: ${searchTrimmed || '(none)'}`);

            // Build job query - show all active jobs
            const jobQuery = {
                isActive: true
            };

            // Text search on title, company, description (scoped with profile/Legion below). Ignores date.
            if (searchTrimmed) {
                const rx = escapeRegex(searchTrimmed);
                jobQuery.$or = [
                    { JobTitle: { $regex: rx, $options: 'i' } },
                    { CompanyName: { $regex: rx, $options: 'i' } },
                    { JobDescription: { $regex: rx, $options: 'i' } }
                ];
            }

            // Filter by date if provided and not searching (search intentionally ignores date)
            if (date && !searchTrimmed) {
                const dateFormatRegex = /^\d{4}-\d{2}-\d{2}$/;
                if (!dateFormatRegex.test(date)) {
                    return res.status(400).json({
                        error: 'Invalid date format',
                        message: 'Date must be in YYYY-MM-DD format'
                    });
                }

                const startOfDay = new Date(date + 'T00:00:00.000Z');
                const endOfDay = new Date(date + 'T23:59:59.999Z');

                jobQuery.Date = {
                    $gte: startOfDay,
                    $lte: endOfDay
                };
                console.log(`Date filter: ${startOfDay.toISOString()} to ${endOfDay.toISOString()}`);
            }

            // Filter by profile if provided (filter by Legion from template)
            let templateLegion = null;
            let profileTemplateId = null;
            if (profileName && profileName.trim() && profileName.trim() !== '') {
                const templates = await Template.find({
                    profileName: profileName.trim()
                }).select('_id Legion').lean();

                console.log(`Found ${templates.length} templates for profile: ${profileName.trim()}`);

                if (templates.length > 0) {
                    profileTemplateId = templates[0]._id;
                    const legions = [...new Set(templates.map(t => t.Legion).filter(Boolean))];
                    if (legions.length > 0) {
                        if (legions.length === 1) {
                            templateLegion = legions[0];
                            jobQuery.Legion = templateLegion;
                            console.log(`Filtering jobs by Legion: ${templateLegion}`);
                        } else {
                            console.log(`Multiple Legions found for profile, showing all jobs`);
                        }
                    }
                }
            } else {
                console.log('No profile filter - showing all jobs');
            }

            // Get all active jobs matching the criteria
            console.log('Admin job query:', JSON.stringify(jobQuery, null, 2));
            const isExcludedCompany = await getExcludedCompanyMatcher();
            const jobs = sortJobsByCalendarDate(
                filterJobsByExcludedCompanies(
                    await Job.find(jobQuery)
                        .lean(),
                    isExcludedCompany
                )
            );

            console.log(`Found ${jobs.length} jobs for admin view`);

            // Get BidStatus records for these jobs (if profile or bidder filter is provided)
            const jobIds = jobs.map(j => j._id);
            const bidStatusQuery = {
                jobId: { $in: jobIds }
            };

            // Filter by bidder if provided
            if (bidderId && bidderId.trim()) {
                bidStatusQuery.bidderId = bidderId.trim();
            }

            // Filter by profile if provided
            if (profileName && profileName.trim()) {
                const templates = await Template.find({
                    profileName: profileName.trim()
                }).select('_id').lean();

                if (templates.length > 0) {
                    const templateIds = templates.map(t => t._id);
                    bidStatusQuery.profileId = { $in: templateIds };
                }
            }

            // Get BidStatus records with populated data
            const bidStatuses = await BidStatus.find(bidStatusQuery)
                .populate('bidderId', 'Name email')
                .populate('profileId', 'profileName Legion')
                .lean();

            // Create a map of jobId -> BidStatus records (can have multiple per job)
            const bidStatusMap = new Map();
            bidStatuses.forEach(bs => {
                const jobIdStr = bs.jobId.toString();
                if (!bidStatusMap.has(jobIdStr)) {
                    bidStatusMap.set(jobIdStr, []);
                }
                bidStatusMap.get(jobIdStr).push(bs);
            });

            // When admin has a profile selected, fetch AIResume per job for that profile (so we show Generate/Regenerate + Download)
            let aiResumeMap = new Map();
            if (profileTemplateId && jobIds.length > 0) {
                const aiResumes = await AIResume.find({
                    jobId: { $in: jobIds },
                    profileId: profileTemplateId
                }).select('jobId GeneratedResume').lean();
                aiResumes.forEach(ar => aiResumeMap.set(ar.jobId.toString(), ar));
            }

            // Format jobs with BidStatus info
            const formattedBids = jobs.map(job => {
                const bidStatusesForJob = (bidStatusMap.get(job._id.toString()) || []).slice();
                bidStatusesForJob.sort((a, b) => {
                    const ta = a.AppliedDate ? new Date(a.AppliedDate).getTime() : 0;
                    const tb = b.AppliedDate ? new Date(b.AppliedDate).getTime() : 0;
                    return tb - ta;
                });

                const bidStatus = bidStatusesForJob.length > 0 ? bidStatusesForJob[0] : null;

                // Search mode: only rows with an application for this profile scope
                if (searchTrimmed && !bidStatus) {
                    return null;
                }

                // Legacy: bidder filter without profile — only jobs with a bid from that bidder
                if (!searchTrimmed && bidderId && bidderId.trim() && !(profileName && profileName.trim()) && !bidStatus) {
                    return null;
                }

                const aiResume = profileTemplateId ? aiResumeMap.get(job._id.toString()) : null;
                const options = {};
                if (profileTemplateId) {
                    options.profileId = profileTemplateId;
                    options.generatedResume = aiResume?.GeneratedResume || null;
                    options.profileName = profileName && profileName.trim() ? profileName.trim() : null;
                }
                return formatJobForAdmin(job, bidStatus, options);
            }).filter(Boolean);

            if (searchTrimmed) {
                formattedBids.sort((a, b) => {
                    const ta = a.appliedDate ? new Date(a.appliedDate).getTime() : 0;
                    const tb = b.appliedDate ? new Date(b.appliedDate).getTime() : 0;
                    return tb - ta;
                });
            } else {
                formattedBids.sort((a, b) => {
                    const ta = a.date ? new Date(a.date).getTime() : 0;
                    const tb = b.date ? new Date(b.date).getTime() : 0;
                    return tb - ta;
                });
            }

            return res.json({
                success: true,
                count: formattedBids.length,
                bids: formattedBids
            });
        }

        // Bidder view: Show jobs filtered by profile and date
        if (role !== 'bider') {
            return res.status(403).json({
                error: 'Forbidden',
                message: 'Only bidders and admins can access this endpoint'
            });
        }

        // Get the profile (template) for the bidder
        if (!profileName || !profileName.trim()) {
            return res.status(400).json({
                error: 'Profile name is required',
                message: 'Please select a profile'
            });
        }

        const template = await Template.findOne({
            profileName: profileName.trim(),
            bidderId: userId // Ensure the template belongs to this bidder
        }).lean();

        if (!template) {
            console.log(`No template found for profileName: ${profileName.trim()}, bidderId: ${userId}`);
            return res.json({
                success: true,
                count: 0,
                bids: []
            });
        }

        console.log(`Found template: ${template.profileName}, Legion: ${template.Legion}, bidderId: ${template.bidderId}`);

        // Build job query based on template's Legion
        const jobQuery = {};

        if (template.Legion) {
            jobQuery.Legion = template.Legion;
            console.log(`Filtering jobs by Legion: ${template.Legion}`);
        } else {
            console.log('Warning: Template has no Legion set, will show all jobs regardless of Legion');
        }

        // Filter by date if provided
        if (date) {
            const dateFormatRegex = /^\d{4}-\d{2}-\d{2}$/;
            if (!dateFormatRegex.test(date)) {
                return res.status(400).json({
                    error: 'Invalid date format',
                    message: 'Date must be in YYYY-MM-DD format'
                });
            }

            const startOfDay = new Date(date + 'T00:00:00.000Z');
            const endOfDay = new Date(date + 'T23:59:59.999Z');

            jobQuery.Date = {
                $gte: startOfDay,
                $lte: endOfDay
            };
        }

        // Only get active jobs
        jobQuery.isActive = true;

        // Get jobs matching the criteria
        console.log('Job query:', JSON.stringify(jobQuery, null, 2));
        const isExcludedCompany = await getExcludedCompanyMatcher();
        const jobs = sortJobsByCalendarDate(
            filterJobsByExcludedCompanies(
                await Job.find(jobQuery)
                    .lean(),
                isExcludedCompany
            )
        );

        console.log(`Found ${jobs.length} jobs matching criteria`);

        // Get AIResume and BidStatus for each job
        const jobIds = jobs.map(j => j._id);

        const [aiResumes, bidStatuses] = await Promise.all([
            AIResume.find({
                jobId: { $in: jobIds },
                bidderId: userId,
                profileId: template._id
            }).lean(),
            BidStatus.find({
                jobId: { $in: jobIds },
                bidderId: userId,
                profileId: template._id
            }).lean()
        ]);

        // Create maps for quick lookup
        const aiResumeMap = new Map(aiResumes.map(ar => [ar.jobId.toString(), ar]));
        const bidStatusMap = new Map(bidStatuses.map(bs => [bs.jobId.toString(), bs]));

        // Format jobs with AIResume and BidStatus info
        const formattedBids = jobs.map(job => {
            const aiResume = aiResumeMap.get(job._id.toString()) || null;
            const bidStatus = bidStatusMap.get(job._id.toString()) || null;
            return formatJobForBids(job, aiResume, bidStatus, template);
        });

        res.json({
            success: true,
            count: formattedBids.length,
            bids: formattedBids
        });

    } catch (error) {
        console.error('Error fetching bids:', error);
        res.status(500).json({
            error: 'Failed to fetch bids',
            message: error.message
        });
    }
};

/**
 * Get all bidders for filter dropdown
 */
const getBiddersForFilter = async (req, res) => {
    try {
        const bidders = await User.find({
            role: 'bider',
            isActive: true
        })
            .select('Name email')
            .sort({ Name: 1 })
            .lean();

        const formattedBidders = bidders.map(bidder => ({
            id: bidder._id,
            name: bidder.Name,
            email: bidder.email
        }));

        res.json({
            success: true,
            bidders: formattedBidders
        });

    } catch (error) {
        console.error('Error fetching bidders for filter:', error);
        res.status(500).json({
            error: 'Failed to fetch bidders',
            message: error.message
        });
    }
};

/**
 * Get profile names for filter dropdown
 * For admin: returns all profiles or profiles for a specific bidder (if bidderId provided)
 * For bidder: returns only profiles assigned to them
 */
const getProfilesForFilter = async (req, res) => {
    try {
        const { role, userId } = req.user;
        const { bidderId } = req.query; // Optional bidderId parameter for admin

        let query = {};

        // If user is bidder, only show templates assigned to them
        if (role === 'bider') {
            query.bidderId = userId;
        } else if (role === 'admin' && bidderId) {
            // Admin can filter by specific bidder
            query.bidderId = bidderId;
        }
        // If admin and no bidderId, show all profiles (query remains empty)

        const templates = await Template.find(query)
            .select('profileName')
            .lean();

        // Get distinct profile names
        const distinctProfileNames = [...new Set(templates.map(t => t.profileName))].filter(Boolean);

        const formattedProfiles = distinctProfileNames.map(profileName => ({
            name: profileName
        }));

        res.json({
            success: true,
            profiles: formattedProfiles
        });

    } catch (error) {
        console.error('Error fetching profiles for filter:', error);
        res.status(500).json({
            error: 'Failed to fetch profiles',
            message: error.message
        });
    }
};

/**
 * Generate resume for a job and save to AIResume model
 * Uses the job description and the assigned profile's template
 */
const generateBidResume = async (req, res) => {
    try {
        const { jobId, profileId } = req.body;
        const { userId, role } = req.user;

        if (!jobId || !profileId) {
            return res.status(400).json({
                error: 'Missing required fields',
                message: 'jobId and profileId are required'
            });
        }

        const isAdmin = role === 'admin';
        if (!isAdmin && role !== 'bider') {
            return res.status(403).json({
                error: 'Forbidden',
                message: 'Only bidders and admins can generate resumes'
            });
        }

        // Bidders: profile must belong to them. Admins: any template with this profileId.
        const templateQuery = isAdmin
            ? { _id: profileId }
            : { _id: profileId, bidderId: userId };
        const template = await Template.findOne(templateQuery);

        if (!template || !template.templateUrl) {
            return res.status(404).json({
                error: 'Template not found',
                message: 'Profile does not exist or does not belong to the current user'
            });
        }

        // Get the job
        const job = await Job.findById(jobId);
        if (!job) {
            return res.status(404).json({
                error: 'Job not found',
                message: 'Job does not exist'
            });
        }

        // Resolve template path
        let templatePath = template.templateUrl ? String(template.templateUrl).trim().replace(/^"+|"+$/g, '') : '';
        if (!templatePath) {
            return res.status(400).json({
                error: 'Template file not found',
                message: 'Template does not have a valid file path'
            });
        }

        const candidates = [];
        candidates.push(templatePath);

        // Try relative resolutions
        if (!path.isAbsolute(templatePath)) {
            candidates.push(path.resolve(process.cwd(), templatePath));
            candidates.push(path.join(TEMPLATE_DIR, templatePath));
            candidates.push(path.join(TEMPLATE_DIR, path.basename(templatePath)));
        } else {
            // If an absolute/legacy path is stored, also try basename in TEMPLATE_DIR
            candidates.push(path.join(TEMPLATE_DIR, path.basename(templatePath)));
        }

        const existing = candidates.find(p => p && fs.existsSync(p));
        if (existing) {
            templatePath = existing;
        }

        // Verify template file exists
        if (!fs.existsSync(templatePath)) {
            return res.status(400).json({
                error: 'Template file not found',
                message: `Template file does not exist at path: ${template.templateUrl}`
            });
        }

        const stats = fs.statSync(templatePath);
        if (!stats.isFile()) {
            return res.status(400).json({
                error: 'Invalid template file',
                message: `Template path is not a file: ${template.templateUrl}`
            });
        }

        const fileExt = path.extname(templatePath).toLowerCase();
        if (fileExt !== '.docx') {
            return res.status(400).json({
                error: 'Invalid template format',
                message: `Resume generation requires a DOCX template file. Current template is ${fileExt || 'unknown format'}.`
            });
        }

        const jobDescription = job.JobDescription || '';
        if (!jobDescription || jobDescription.trim().length === 0) {
            return res.status(400).json({
                error: 'Missing job description',
                message: 'Job description is required to generate a resume'
            });
        }

        const jobTitle = job.JobTitle || '';

        // Generate resume with profile name and companies
        const result = await generateResume(
            `Job Title: ${jobTitle}, Job Description: ${jobDescription}`,
            templatePath,
            template.profileName,
            job.CompanyName,
            template.companies || null
        );

        // Save generated file to outputs directory under date folder (yyyy-mm-dd)
        const dateFolder = new Date().toISOString().slice(0, 10); // yyyy-mm-dd
        const dateDir = path.join(outputsDir, dateFolder);
        fs.mkdirSync(dateDir, { recursive: true });
        const outputPath = path.join(dateDir, result.filename);
        fs.writeFileSync(outputPath, result.buffer);
        const relativePath = `${dateFolder}/${result.filename}`;

        // Save or update AIResume. Admin: update any existing (jobId+profileId) or create with admin as bidderId.
        let aiResume;
        if (isAdmin) {
            aiResume = await AIResume.findOneAndUpdate(
                { jobId: job._id, profileId: template._id },
                { $set: { GeneratedResume: relativePath } },
                { new: true }
            );
            if (!aiResume) {
                aiResume = await AIResume.create({
                    jobId: job._id,
                    bidderId: userId,
                    profileId: template._id,
                    GeneratedResume: relativePath
                });
            }
        } else {
            aiResume = await AIResume.findOneAndUpdate(
                {
                    jobId: job._id,
                    bidderId: userId,
                    profileId: template._id
                },
                { GeneratedResume: relativePath },
                { new: true, upsert: true }
            );
        }

        res.json({
            success: true,
            message: 'Resume generated successfully',
            aiResume: {
                id: aiResume._id,
                generatedResume: aiResume.GeneratedResume
            }
        });

    } catch (error) {
        console.error('Error generating resume:', error);
        res.status(500).json({
            error: 'Failed to generate resume',
            message: error.message
        });
    }
};

/**
 * Download generated resume
 */
const downloadBidResume = async (req, res) => {
    try {
        const { jobId, profileId } = req.query;
        const { userId, role } = req.user;

        if (!jobId || !profileId) {
            return res.status(400).json({
                error: 'Missing required fields',
                message: 'jobId and profileId are required'
            });
        }

        const isAdmin = role === 'admin';
        if (!isAdmin && role !== 'bider') {
            return res.status(403).json({
                error: 'Forbidden',
                message: 'Only bidders and admins can download resumes'
            });
        }

        const aiResume = await AIResume.findOne(
            isAdmin ? { jobId, profileId } : { jobId, bidderId: userId, profileId }
        );

        if (!aiResume || !aiResume.GeneratedResume) {
            return res.status(404).json({
                error: 'Resume not found',
                message: 'Resume has not been generated yet'
            });
        }

        const filePath = path.join(outputsDir, aiResume.GeneratedResume);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({
                error: 'File not found',
                message: 'Resume file does not exist'
            });
        }

        // Use basename so stored path "yyyy-mm-dd/file.docx" becomes "file.docx" for download
        let filename = path.basename(aiResume.GeneratedResume);
        // Sanitize filename to remove trailing underscores, dashes, and periods
        // This handles old filenames that might have these issues
        filename = filename
            .replace(/[-_]+$/, '') // Remove trailing dashes and underscores
            .replace(/\.+$/, '') // Remove trailing periods
            .trim();

        // Ensure it still has .docx extension
        if (!filename.endsWith('.docx')) {
            // If extension was removed, add it back
            if (filename && !filename.includes('.')) {
                filename = `${filename}.docx`;
            } else {
                // If there's already an extension, replace it with .docx
                filename = filename.replace(/\.[^.]+$/, '.docx');
            }
        }

        // If filename is empty after sanitization, use a default
        if (!filename || filename === '.docx') {
            filename = 'resume.docx';
        }

        res.download(filePath, filename, (err) => {
            if (err) {
                console.error('Error downloading file:', err);
                if (!res.headersSent) {
                    res.status(500).json({
                        error: 'Failed to download file',
                        message: err.message
                    });
                }
            }
        });

    } catch (error) {
        console.error('Error downloading resume:', error);
        res.status(500).json({
            error: 'Failed to download resume',
            message: error.message
        });
    }
};

/**
 * Apply for a job (create BidStatus with note and screenshots)
 */
const applyBidStatus = async (req, res) => {
    try {
        const { jobId, profileId, note } = req.body;
        const { userId, role } = req.user;

        if (role !== 'bider') {
            return res.status(403).json({
                error: 'Forbidden',
                message: 'Only bidders can apply for jobs'
            });
        }

        if (!jobId || !profileId) {
            return res.status(400).json({
                error: 'Missing required fields',
                message: 'jobId and profileId are required'
            });
        }

        // Verify the profile belongs to this bidder
        const template = await Template.findOne({
            _id: profileId,
            bidderId: userId
        });

        if (!template) {
            return res.status(404).json({
                error: 'Profile not found',
                message: 'Profile does not exist or does not belong to the current user'
            });
        }

        // Check if BidStatus already exists
        const existingBidStatus = await BidStatus.findOne({
            jobId,
            bidderId: userId,
            profileId
        });

        if (existingBidStatus) {
            return res.status(400).json({
                error: 'Already applied',
                message: 'You have already applied for this job with this profile'
            });
        }

        // Handle screenshot uploads
        const uploadedScreenshots = Array.isArray(req.files) ? req.files : [];
        const screenshotUrls = uploadedScreenshots.map(file => {
            console.log('Screenshot uploaded:', file.filename, file.size, 'bytes');
            console.log('File saved to:', file.path);
            console.log('File exists:', fs.existsSync(file.path));

            // Store relative URL under the static mount root, including the dated subfolder
            // SCREENSHOT_UPLOAD_DIR is both the filesystem path and the URL mount path
            // file.path is something like `${SCREENSHOT_UPLOAD_DIR}/YYYY-MM-DD/filename.ext`
            const relativePath = file.path.replace(String(SCREENSHOT_UPLOAD_DIR), '').replace(/\\/g, '/');
            return path.posix.join(SCREENSHOT_UPLOAD_DIR, relativePath);
        });
        if (screenshotUrls.length === 0) {
            console.log('No screenshot files in request');
        }

        console.log('Request body:', { jobId, profileId, note: note ? 'present' : 'empty' });
        console.log('Request files:', uploadedScreenshots.length > 0 ? uploadedScreenshots.map(f => ({
            filename: f.filename,
            path: f.path,
            size: f.size,
            mimetype: f.mimetype
        })) : 'not present');

        // Create BidStatus
        const bidStatus = await BidStatus.create({
            jobId,
            bidderId: userId,
            profileId,
            Note: note && note.trim() ? note.trim() : null,
            Screenshots: screenshotUrls,
            AppliedDate: new Date()
        });

        // Populate for response
        const populatedBidStatus = await BidStatus.findById(bidStatus._id)
            .populate('jobId', 'JobTitle CompanyName ApplyLink Date Source Legion')
            .populate('profileId', 'profileName Legion')
            .lean();

        res.json({
            success: true,
            message: 'Successfully applied for job',
            bidStatus: {
                id: populatedBidStatus._id,
                jobId: populatedBidStatus.jobId?._id,
                jobTitle: populatedBidStatus.jobId?.JobTitle,
                company: populatedBidStatus.jobId?.CompanyName,
                profileName: populatedBidStatus.profileId?.profileName,
                note: populatedBidStatus.Note,
                screenshots: normalizeScreenshots(populatedBidStatus.Screenshots),
                appliedDate: populatedBidStatus.AppliedDate ? new Date(populatedBidStatus.AppliedDate).toISOString() : null
            }
        });

    } catch (error) {
        console.error('Error applying for job:', error);

        if (error.code === 11000) {
            return res.status(400).json({
                error: 'Already applied',
                message: 'You have already applied for this job with this profile'
            });
        }

        res.status(500).json({
            error: 'Failed to apply for job',
            message: error.message
        });
    }
};

/**
 * Get dashboard stats - bid count and resume generation count per profile
 * For bidders: only show their assigned profiles
 * For admins: show all profiles
 */
const getDashboardStats = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const { role, userId } = req.user;

        // Validate date format if provided
        const dateFormatRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (startDate && !dateFormatRegex.test(startDate)) {
            return res.status(400).json({
                error: 'Invalid date format',
                message: 'Start date must be in YYYY-MM-DD format'
            });
        }
        if (endDate && !dateFormatRegex.test(endDate)) {
            return res.status(400).json({
                error: 'Invalid date format',
                message: 'End date must be in YYYY-MM-DD format'
            });
        }

        // Build date filter for queries
        let dateFilter = {};
        if (startDate || endDate) {
            dateFilter = {};
            if (startDate) {
                const startOfDay = new Date(startDate + 'T00:00:00.000Z');
                dateFilter.$gte = startOfDay;
            }
            if (endDate) {
                const endOfDay = new Date(endDate + 'T23:59:59.999Z');
                dateFilter.$lte = endOfDay;
            }
        }

        // Get templates/profiles based on role
        let templateQuery = {};
        if (role === 'bider') {
            // Bidders only see their assigned profiles
            templateQuery.bidderId = userId;
        }
        // Admins see all profiles (empty query)

        const templates = await Template.find(templateQuery)
            .select('_id profileName Legion')
            .lean();

        // Get distinct profile names with their Legion
        const profileMap = new Map();
        templates.forEach(t => {
            if (t.profileName) {
                if (!profileMap.has(t.profileName)) {
                    profileMap.set(t.profileName, {
                        profileName: t.profileName,
                        legion: t.Legion || null,
                        templateIds: []
                    });
                }
                profileMap.get(t.profileName).templateIds.push(t._id);
            }
        });

        const distinctProfiles = Array.from(profileMap.values());

        // Build stats for each profile
        const stats = await Promise.all(
            distinctProfiles.map(async (profileInfo) => {
                const { profileName, legion, templateIds } = profileInfo;

                // Build query filters
                const bidStatusQuery = {
                    profileId: { $in: templateIds }
                };
                const aiResumeQuery = {
                    profileId: { $in: templateIds }
                };

                // Add date filter if provided
                if (Object.keys(dateFilter).length > 0) {
                    bidStatusQuery.AppliedDate = dateFilter;
                    aiResumeQuery.createdAt = dateFilter;
                }

                // Add bidder filter for bidders
                if (role === 'bider') {
                    bidStatusQuery.bidderId = userId;
                    aiResumeQuery.bidderId = userId;
                }

                // Count bids as distinct jobs applied to (matches Bids page "Applied" count)
                const bidCountResult = await BidStatus.aggregate([
                    { $match: bidStatusQuery },
                    { $group: { _id: '$jobId' } },
                    { $count: 'total' }
                ]);
                const bidCount = bidCountResult[0]?.total ?? 0;

                // Count resume generations (AIResume records)
                const resumeCount = await AIResume.countDocuments(aiResumeQuery);

                return {
                    profile: profileName,
                    region: legion,
                    bidCount,
                    resumeGenerationCount: resumeCount
                };
            })
        );

        // Sort by profile name
        stats.sort((a, b) => a.profile.localeCompare(b.profile));

        res.json({
            success: true,
            stats
        });

    } catch (error) {
        console.error('Error fetching dashboard stats:', error);
        res.status(500).json({
            error: 'Failed to fetch dashboard stats',
            message: error.message
        });
    }
};

module.exports = {
    getBids,
    getBiddersForFilter,
    getProfilesForFilter,
    generateBidResume,
    downloadBidResume,
    applyBidStatus,
    getDashboardStats
};

