const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware');
const {
    getJobsByDate,
    getAllJobs,
    getJobById,
    createJob,
    updateJob,
    deleteJob,
    toggleJobStatus
} = require('../controllers/jobController');

// All job routes require authentication
router.use(authenticate);

// Get jobs by date (for jobs page)
router.get('/jobs', getJobsByDate);

// Get all jobs (optional date filter)
router.get('/jobs/all', getAllJobs);

// Get single job by id (full details)
router.get('/jobs/:id', getJobById);

// Create a new job
router.post('/jobs', createJob);

// Update a job
router.put('/jobs/:id', updateJob);

// Delete a job
router.delete('/jobs/:id', deleteJob);

// Toggle job active status (activate/deactivate)
router.patch('/jobs/:id/toggle-status', toggleJobStatus);

module.exports = router;

