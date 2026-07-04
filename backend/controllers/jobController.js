const Job = require('../models/Job');
const { getExcludedCompanyMatcher, filterJobsByExcludedCompanies, sortJobsByCalendarDate } = require('../utils/companyExclusion');

const EXCLUDED_USER_DATE_RULES = [
    {
        email: 'test@bidder.com',
        afterDate: '2026-04-08'
    }
];

/**
 * Get jobs by date
 * Query params: date (YYYY-MM-DD format), legion (optional)
 */
const getJobsByDate = async (req, res) => {
    try {
        const { date, legion } = req.query;

        if (!date) {
            return res.status(400).json({
                error: 'Date parameter is required',
                message: 'Please provide a date in YYYY-MM-DD format'
            });
        }

        // Validate date format
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(date)) {
            return res.status(400).json({
                error: 'Invalid date format',
                message: 'Date must be in YYYY-MM-DD format'
            });
        }

        const userEmail = req.user?.email?.toLowerCase();

        if (userEmail) {
            const matchingRule = EXCLUDED_USER_DATE_RULES.find(rule => rule.email === userEmail);
            if (matchingRule) {
                const requestDate = new Date(`${date}T00:00:00.000Z`);
                const cutoffDate = new Date(`${matchingRule.afterDate}T00:00:00.000Z`);

                if (!Number.isNaN(requestDate.getTime()) && !Number.isNaN(cutoffDate.getTime()) && requestDate > cutoffDate) {
                    return res.json({
                        success: true,
                        count: 0,
                        date: date,
                        jobs: []
                    });
                }
            }
        }

        // Parse the date and create start/end of day range in UTC
        // Parse YYYY-MM-DD format and create UTC dates
        const [year, month, day] = date.split('-').map(Number);
        const startDate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
        const endDate = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));

        // Build query
        const query = {
            Date: { $gte: startDate, $lte: endDate },
            isActive: true // Only show active jobs
        };

        // If legion is provided, filter by legion
        if (legion && legion.trim()) {
            query.Legion = legion.trim();
        }

        // Query jobs for the specified date and legion
        const isExcludedCompany = await getExcludedCompanyMatcher();
        const jobs = sortJobsByCalendarDate(
            filterJobsByExcludedCompanies(
                await Job.find(query)
                    .select('JobTitle ApplyLink Date CompanyName Source JobId Legion isActive isClearance')
                    .lean(),
                isExcludedCompany
            )
        );

        console.log(`Found ${jobs.length} jobs for date ${date}`);

        // Format the response - keep ISO date format
        const formattedJobs = jobs.map(job => ({
            id: job._id,
            jobId: job.JobId,
            title: job.JobTitle,
            jobUrl: job.ApplyLink,
            date: job.Date ? new Date(job.Date).toISOString() : null,
            company: job.CompanyName,
            source: job.Source || null,
            legion: job.Legion || null,
            isActive: job.isActive !== undefined ? job.isActive : true,
            isClearance: !!job.isClearance
        }));

        res.json({
            success: true,
            count: formattedJobs.length,
            date: date,
            jobs: formattedJobs
        });

    } catch (error) {
        console.error('Error fetching jobs by date:', error);
        res.status(500).json({
            error: 'Failed to fetch jobs',
            message: error.message
        });
    }
};

/**
 * Get all jobs (with optional date and legion filter)
 */
const getAllJobs = async (req, res) => {
    try {
        const { date, legion } = req.query;
        let query = {};

        // If date is provided, filter by date
        if (date) {
            const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
            if (!dateRegex.test(date)) {
                return res.status(400).json({
                    error: 'Invalid date format',
                    message: 'Date must be in YYYY-MM-DD format'
                });
            }

            // Parse YYYY-MM-DD format and create UTC dates
            const [year, month, day] = date.split('-').map(Number);
            const startDate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
            const endDate = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));

            query.Date = {
                $gte: startDate,
                $lte: endDate
            };
        }

        // If legion is provided, filter by legion
        if (legion && legion.trim()) {
            query.Legion = legion.trim();
        }

        // Only show active jobs (unless admin wants to see all)
        query.isActive = true;

        const isExcludedCompany = await getExcludedCompanyMatcher();
        const jobs = sortJobsByCalendarDate(
            filterJobsByExcludedCompanies(
                await Job.find(query)
                    .select('JobTitle ApplyLink Date CompanyName Source JobId Legion isActive isClearance')
                    .lean(),
                isExcludedCompany
            )
        );

        const formattedJobs = jobs.map(job => ({
            id: job._id,
            jobId: job.JobId,
            title: job.JobTitle,
            jobUrl: job.ApplyLink,
            date: job.Date ? new Date(job.Date).toISOString() : null,
            company: job.CompanyName,
            source: job.Source || null,
            legion: job.Legion || null,
            isClearance: !!job.isClearance
        }));

        res.json({
            success: true,
            count: formattedJobs.length,
            jobs: formattedJobs
        });

    } catch (error) {
        console.error('Error fetching jobs:', error);
        res.status(500).json({
            error: 'Failed to fetch jobs',
            message: error.message
        });
    }
};

/**
 * Get a single job by id (full details including description)
 */
const getJobById = async (req, res) => {
    try {
        const { id } = req.params;

        const job = await Job.findById(id)
            .select('JobTitle JobDescription ApplyLink Date CompanyName Source Legion isClearance')
            .lean();

        if (!job) {
            return res.status(404).json({
                error: 'Job not found',
                message: 'No job found with this id'
            });
        }

        res.json({
            success: true,
            job: {
                id: job._id,
                title: job.JobTitle,
                jobDescription: job.JobDescription || '',
                jobUrl: job.ApplyLink,
                date: job.Date ? new Date(job.Date).toISOString() : null,
                company: job.CompanyName,
                source: job.Source || null,
                legion: job.Legion || null,
                isClearance: !!job.isClearance
            }
        });
    } catch (error) {
        console.error('Error fetching job:', error);
        res.status(500).json({
            error: 'Failed to fetch job',
            message: error.message
        });
    }
};

/**
 * Create a new job
 */
const createJob = async (req, res) => {
    try {
        const {
            JobId,
            JobTitle,
            JobDescription,
            CompanyName,
            ApplyLink,
            Date: jobDate,
            Source,
            Legion,
            UserId,
            isClearance
        } = req.body;

        // Validation
        if (!JobId || !JobTitle || !JobDescription || !CompanyName || !ApplyLink) {
            return res.status(400).json({
                error: 'Missing required fields',
                message: 'JobId, JobTitle, JobDescription, CompanyName, and ApplyLink are required'
            });
        }

        // Check if JobId already exists
        const existingJob = await Job.findOne({ JobId });
        if (existingJob) {
            return res.status(400).json({
                error: 'Job already exists',
                message: 'A job with this JobId already exists'
            });
        }

        // Use 'custom' as source when not provided (e.g. jobs added via admin form)
        const resolvedSource = (Source && String(Source).trim()) ? String(Source).trim() : 'custom';

        // Create job
        const job = new Job({
            JobId,
            JobTitle,
            JobDescription,
            CompanyName,
            ApplyLink,
            Date: jobDate ? new Date(jobDate) : new Date(),
            Source: resolvedSource,
            Legion: Legion || null,
            UserId: UserId || null, // Will be set from auth middleware later
            isClearance: !!isClearance
        });

        await job.save();

        res.status(201).json({
            success: true,
            message: 'Job created successfully',
            job: {
                id: job._id,
                jobId: job.JobId,
                title: job.JobTitle,
                company: job.CompanyName,
                date: job.Date ? new Date(job.Date).toISOString() : null
            }
        });

    } catch (error) {
        console.error('Error creating job:', error);

        if (error.name === 'ValidationError') {
            return res.status(400).json({
                error: 'Validation error',
                message: error.message
            });
        }

        res.status(500).json({
            error: 'Failed to create job',
            message: error.message
        });
    }
};

/**
 * Update a job
 */
const updateJob = async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = req.body;

        // Remove fields that shouldn't be updated directly
        delete updateData._id;
        delete updateData.createdAt;
        delete updateData.updatedAt;

        // If Date is provided, convert it to Date object
        if (updateData.Date) {
            updateData.Date = new Date(updateData.Date);
        }

        const job = await Job.findByIdAndUpdate(
            id,
            { $set: updateData },
            { new: true, runValidators: true }
        );

        if (!job) {
            return res.status(404).json({
                error: 'Job not found'
            });
        }

        res.json({
            success: true,
            message: 'Job updated successfully',
            job: {
                id: job._id,
                jobId: job.JobId,
                title: job.JobTitle,
                company: job.CompanyName,
                date: job.Date ? new Date(job.Date).toISOString() : null
            }
        });

    } catch (error) {
        console.error('Error updating job:', error);
        res.status(500).json({
            error: 'Failed to update job',
            message: error.message
        });
    }
};

/**
 * Delete a job
 */
const deleteJob = async (req, res) => {
    try {
        const { id } = req.params;

        const job = await Job.findByIdAndDelete(id);

        if (!job) {
            return res.status(404).json({
                error: 'Job not found'
            });
        }

        res.json({
            success: true,
            message: 'Job deleted successfully'
        });

    } catch (error) {
        console.error('Error deleting job:', error);
        res.status(500).json({
            error: 'Failed to delete job',
            message: error.message
        });
    }
};

/**
 * Toggle job active status (activate/deactivate)
 */
const toggleJobStatus = async (req, res) => {
    try {
        const { id } = req.params;

        const job = await Job.findById(id);

        if (!job) {
            return res.status(404).json({
                error: 'Job not found'
            });
        }

        // Toggle isActive status
        job.isActive = !job.isActive;
        await job.save();

        res.json({
            success: true,
            message: `Job ${job.isActive ? 'activated' : 'deactivated'} successfully`,
            job: {
                id: job._id,
                jobId: job.JobId,
                title: job.JobTitle,
                isActive: job.isActive
            }
        });

    } catch (error) {
        console.error('Error toggling job status:', error);
        res.status(500).json({
            error: 'Failed to toggle job status',
            message: error.message
        });
    }
};

module.exports = {
    getJobsByDate,
    getAllJobs,
    getJobById,
    createJob,
    updateJob,
    deleteJob,
    toggleJobStatus
};

