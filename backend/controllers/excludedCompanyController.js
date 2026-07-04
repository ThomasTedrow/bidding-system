const ExcludedCompany = require('../models/ExcludedCompany');
const Job = require('../models/Job');
const { normalizePattern } = require('../utils/companyExclusion');

const MONTH_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

const formatMonth = (date) => {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
};

const getDefaultReportMonths = () => {
    const now = new Date();
    const currentMonth = formatMonth(now);
    const previousDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const previousMonth = formatMonth(previousDate);
    return { startMonth: previousMonth, endMonth: currentMonth };
};

const getMonthDateRange = (startMonth, endMonth) => {
    const [startYear, startMonthNum] = startMonth.split('-').map(Number);
    const [endYear, endMonthNum] = endMonth.split('-').map(Number);

    const startDate = new Date(Date.UTC(startYear, startMonthNum - 1, 1, 0, 0, 0, 0));
    const endDate = new Date(Date.UTC(endYear, endMonthNum, 0, 23, 59, 59, 999));

    return { startDate, endDate };
};

const getCompanyJobReport = async (req, res) => {
    try {
        const defaults = getDefaultReportMonths();
        const startMonth = (req.query.startMonth || defaults.startMonth).toString().trim();
        const endMonth = (req.query.endMonth || defaults.endMonth).toString().trim();

        if (!MONTH_REGEX.test(startMonth) || !MONTH_REGEX.test(endMonth)) {
            return res.status(400).json({
                error: 'Invalid month format',
                message: 'Months must be in YYYY-MM format'
            });
        }

        if (startMonth > endMonth) {
            return res.status(400).json({
                error: 'Invalid month range',
                message: 'Start month must be before or equal to end month'
            });
        }

        const { startDate, endDate } = getMonthDateRange(startMonth, endMonth);

        const rows = await Job.aggregate([
            {
                $match: {
                    Date: { $gte: startDate, $lte: endDate }
                }
            },
            {
                $group: {
                    _id: {
                        roleName: '$JobTitle',
                        companyName: '$CompanyName'
                    },
                    count: { $sum: 1 }
                }
            },
            {
                $sort: {
                    count: -1,
                    '_id.companyName': 1,
                    '_id.roleName': 1
                }
            },
            {
                $project: {
                    _id: 0,
                    roleName: '$_id.roleName',
                    companyName: '$_id.companyName',
                    count: 1
                }
            }
        ]);

        res.json({
            success: true,
            startMonth,
            endMonth,
            count: rows.length,
            rows
        });
    } catch (error) {
        console.error('Error fetching company job report:', error);
        res.status(500).json({
            error: 'Failed to fetch company job report',
            message: error.message
        });
    }
};

const getExcludedCompanies = async (req, res) => {
    try {
        const companies = await ExcludedCompany.find()
            .select('name createdAt')
            .sort({ name: 1 })
            .lean();

        res.json({
            success: true,
            companies: companies.map((company) => ({
                id: company._id,
                name: company.name,
                createdAt: company.createdAt ? new Date(company.createdAt).toISOString() : null
            }))
        });
    } catch (error) {
        console.error('Error fetching excluded companies:', error);
        res.status(500).json({
            error: 'Failed to fetch excluded companies',
            message: error.message
        });
    }
};

const addExcludedCompany = async (req, res) => {
    try {
        const { name } = req.body;
        const trimmedName = (name || '').toString().trim();

        if (!trimmedName) {
            return res.status(400).json({
                error: 'Name is required',
                message: 'Please provide a company name to exclude'
            });
        }

        const normalized = normalizePattern(trimmedName);
        const existing = await ExcludedCompany.findOne({
            name: { $regex: new RegExp(`^${normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
        }).lean();

        if (existing) {
            return res.status(409).json({
                error: 'Already excluded',
                message: 'This company is already in the excluded list'
            });
        }

        const company = await ExcludedCompany.create({ name: trimmedName });

        res.status(201).json({
            success: true,
            company: {
                id: company._id,
                name: company.name,
                createdAt: company.createdAt ? new Date(company.createdAt).toISOString() : null
            }
        });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({
                error: 'Already excluded',
                message: 'This company is already in the excluded list'
            });
        }

        console.error('Error adding excluded company:', error);
        res.status(500).json({
            error: 'Failed to add excluded company',
            message: error.message
        });
    }
};

const deleteExcludedCompany = async (req, res) => {
    try {
        const { id } = req.params;
        const company = await ExcludedCompany.findByIdAndDelete(id);

        if (!company) {
            return res.status(404).json({
                error: 'Not found',
                message: 'Excluded company not found'
            });
        }

        res.json({
            success: true,
            message: 'Company removed from excluded list',
            company: {
                id: company._id,
                name: company.name
            }
        });
    } catch (error) {
        console.error('Error deleting excluded company:', error);
        res.status(500).json({
            error: 'Failed to delete excluded company',
            message: error.message
        });
    }
};

module.exports = {
    getCompanyJobReport,
    getExcludedCompanies,
    addExcludedCompany,
    deleteExcludedCompany
};
