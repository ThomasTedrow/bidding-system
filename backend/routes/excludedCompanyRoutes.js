const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/authMiddleware');
const {
    getCompanyJobReport,
    getExcludedCompanies,
    addExcludedCompany,
    deleteExcludedCompany
} = require('../controllers/excludedCompanyController');

router.use(authenticate);
router.use(authorize('admin'));

router.get('/companies/job-report', getCompanyJobReport);
router.get('/excluded-companies', getExcludedCompanies);
router.post('/excluded-companies', addExcludedCompany);
router.delete('/excluded-companies/:id', deleteExcludedCompany);

module.exports = router;
