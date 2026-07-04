import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  getDefaultReportMonths,
  getCompanyJobReport,
  getExcludedCompanies,
  addExcludedCompany,
  deleteExcludedCompany,
  isCompanyExcluded,
} from '../services/excludedCompaniesService';

const Companies = () => {
  const { getToken } = useAuth();
  const defaultMonths = getDefaultReportMonths();

  const [companies, setCompanies] = useState([]);
  const [reportRows, setReportRows] = useState([]);
  const [startMonth, setStartMonth] = useState(defaultMonths.startMonth);
  const [endMonth, setEndMonth] = useState(defaultMonths.endMonth);
  const [companiesLoading, setCompaniesLoading] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [excludingCompany, setExcludingCompany] = useState(null);
  const [error, setError] = useState(null);
  const [reportError, setReportError] = useState(null);
  const [companyName, setCompanyName] = useState('');

  useEffect(() => {
    fetchCompanies();
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadReport = async () => {
      if (!startMonth || !endMonth) {
        return;
      }

      if (startMonth > endMonth) {
        setReportError('Start month must be before or equal to end month');
        setReportRows([]);
        setReportLoading(false);
        return;
      }

      setReportLoading(true);
      setReportError(null);
      setReportRows([]);

      try {
        const token = getToken();
        const data = await getCompanyJobReport(token, { startMonth, endMonth });
        if (!cancelled) {
          setReportRows(data.rows || []);
        }
      } catch (err) {
        console.error('Error fetching company job report:', err);
        if (!cancelled) {
          setReportError(err.message);
          setReportRows([]);
        }
      } finally {
        if (!cancelled) {
          setReportLoading(false);
        }
      }
    };

    loadReport();

    return () => {
      cancelled = true;
    };
  }, [startMonth, endMonth]);

  const fetchCompanies = async () => {
    setCompaniesLoading(true);
    setError(null);

    try {
      const token = getToken();
      const data = await getExcludedCompanies(token);
      setCompanies(data.companies || []);
    } catch (err) {
      console.error('Error fetching excluded companies:', err);
      setError(err.message);
      setCompanies([]);
    } finally {
      setCompaniesLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!companyName.trim()) {
      setError('Company name is required');
      return;
    }

    setCompaniesLoading(true);
    setError(null);

    try {
      const token = getToken();
      const data = await addExcludedCompany(token, companyName.trim());

      if (data.success) {
        setCompanyName('');
        fetchCompanies();
      } else {
        throw new Error(data.message || 'Failed to add excluded company');
      }
    } catch (err) {
      console.error('Error adding excluded company:', err);
      setError(err.message);
    } finally {
      setCompaniesLoading(false);
    }
  };

  const handleExcludeFromReport = async (name) => {
    if (!name?.trim() || isCompanyExcluded(name, companies)) {
      return;
    }

    setExcludingCompany(name);
    setError(null);

    try {
      const token = getToken();
      const data = await addExcludedCompany(token, name.trim());

      if (data.success) {
        await fetchCompanies();
      } else {
        throw new Error(data.message || 'Failed to add excluded company');
      }
    } catch (err) {
      console.error('Error excluding company from report:', err);
      setError(err.message);
    } finally {
      setExcludingCompany(null);
    }
  };

  const handleRemove = async (companyId) => {
    setCompaniesLoading(true);
    setError(null);

    try {
      const token = getToken();
      const data = await deleteExcludedCompany(token, companyId);

      if (data.success) {
        fetchCompanies();
      } else {
        throw new Error(data.message || 'Failed to remove excluded company');
      }
    } catch (err) {
      console.error('Error removing excluded company:', err);
      setError(err.message);
    } finally {
      setCompaniesLoading(false);
    }
  };

  const formatMonthLabel = (monthValue) => {
    const [year, month] = monthValue.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, 1));
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  };

  return (
    <div className="flex-1 p-8">
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-600 text-sm">{error}</p>
        </div>
      )}

      {reportError && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-600 text-sm">{reportError}</p>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
        <div className="xl:col-span-2 space-y-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Job Posting Report</h2>
            <div className="flex flex-col sm:flex-row gap-4 mb-4">
              <div className="flex-1">
                <label htmlFor="startMonth" className="block text-sm font-medium text-gray-700 mb-2">
                  Start Month
                </label>
                <input
                  type="month"
                  id="startMonth"
                  value={startMonth}
                  onChange={(e) => setStartMonth(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div className="flex-1">
                <label htmlFor="endMonth" className="block text-sm font-medium text-gray-700 mb-2">
                  End Month
                </label>
                <input
                  type="month"
                  id="endMonth"
                  value={endMonth}
                  onChange={(e) => setEndMonth(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
            <p className="text-sm text-gray-500 mb-4">
              Showing jobs posted from {formatMonthLabel(startMonth)} through {formatMonthLabel(endMonth)}.
            </p>

            <div className="border border-gray-200 rounded-lg overflow-hidden">
              {reportLoading ? (
                <div className="p-8 text-center">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  <p className="mt-2 text-gray-500">Loading report...</p>
                </div>
              ) : reportRows.length === 0 ? (
                <div className="p-8 text-center">
                  <p className="text-gray-500">No job postings found for this period.</p>
                </div>
              ) : (
                <div className="overflow-x-auto max-h-[calc(100vh-12rem)] overflow-y-auto">
                  <table key={`${startMonth}-${endMonth}`} className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Company Name
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Role Name
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Count
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {reportRows.map((row, index) => {
                        const excluded = isCompanyExcluded(row.companyName, companies);

                        return (
                          <tr key={`${row.companyName}-${row.roleName}-${index}`} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-sm text-gray-900">
                              <div className="flex items-center gap-2">
                                <span>{row.companyName}</span>
                                {excluded && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">
                                    excluded
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-900">
                              {row.roleName}
                            </td>
                            <td className="px-4 py-3 text-sm font-medium text-gray-900">
                              {row.count}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-900">
                              {excluded ? (
                                <span className="text-gray-400">—</span>
                              ) : (
                                <button
                                  onClick={() => handleExcludeFromReport(row.companyName)}
                                  disabled={excludingCompany === row.companyName || companiesLoading}
                                  className={`px-3 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors ${
                                    excludingCompany === row.companyName || companiesLoading
                                      ? 'opacity-50 cursor-not-allowed'
                                      : ''
                                  }`}
                                >
                                  {excludingCompany === row.companyName ? 'Excluding...' : 'Exclude'}
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="xl:col-span-1 space-y-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Add Excluded Company</h2>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="w-full">
                <label htmlFor="companyName" className="block text-sm font-medium text-gray-700 mb-2">
                  Company Name
                </label>
                <input
                  type="text"
                  id="companyName"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Enter company name to exclude"
                  required
                />
              </div>

              <div>
                <button
                  type="submit"
                  disabled={companiesLoading}
                  className={`w-full px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors ${
                    companiesLoading ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  {companiesLoading ? 'Adding...' : 'Add'}
                </button>
              </div>
            </form>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Excluded Companies</h2>
            </div>

            {companiesLoading && companies.length === 0 ? (
              <div className="p-8 text-center">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <p className="mt-2 text-gray-500">Loading excluded companies...</p>
              </div>
            ) : companies.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-gray-500">No excluded companies yet.</p>
              </div>
            ) : (
              <div className="overflow-x-auto max-h-[calc(100vh-20rem)] overflow-y-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Company Name
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {companies.map((company) => (
                      <tr key={company.id} className="hover:bg-gray-50">
                        <td className="px-4 py-4">
                          <div className="text-sm font-medium text-gray-900 break-words">
                            {company.name}
                          </div>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          <button
                            onClick={() => handleRemove(company.id)}
                            disabled={companiesLoading}
                            className={`px-3 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors ${
                              companiesLoading ? 'opacity-50 cursor-not-allowed' : ''
                            }`}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Companies;
