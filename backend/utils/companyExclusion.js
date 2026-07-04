const ExcludedCompany = require('../models/ExcludedCompany');

const normalizePattern = (name) => (name || '').toString().trim().toLowerCase();

const createExcludedCompanyMatcher = (names) => {
    const excludedPatterns = (names || [])
        .map(normalizePattern)
        .filter(Boolean);

    return (companyName) => {
        const company = normalizePattern(companyName);
        if (!company) return false;
        return excludedPatterns.some(
            (pattern) => company.startsWith(pattern) || company.includes(pattern)
        );
    };
};

const getExcludedCompanyNames = async () => {
    const docs = await ExcludedCompany.find()
        .select('name')
        .sort({ name: 1 })
        .lean();
    return docs.map((doc) => doc.name);
};

const getExcludedCompanyMatcher = async () => {
    const names = await getExcludedCompanyNames();
    return createExcludedCompanyMatcher(names);
};

const filterJobsByExcludedCompanies = (jobs, isExcluded) => {
    return jobs.filter((job) => !isExcluded(job.CompanyName));
};

const sortJobsByCalendarDate = (jobs) =>
    [...jobs].sort((a, b) => {
        const dayA = a.Date ? new Date(a.Date).toISOString().slice(0, 10) : '';
        const dayB = b.Date ? new Date(b.Date).toISOString().slice(0, 10) : '';
        const byDate = dayB.localeCompare(dayA);
        if (byDate !== 0) return byDate;
        return (a.CompanyName || '').localeCompare(b.CompanyName || '', undefined, { sensitivity: 'base' });
    });

module.exports = {
    createExcludedCompanyMatcher,
    getExcludedCompanyNames,
    getExcludedCompanyMatcher,
    filterJobsByExcludedCompanies,
    sortJobsByCalendarDate,
    normalizePattern
};
