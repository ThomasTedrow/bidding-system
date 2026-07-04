import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  getJobsByDate,
  getJobById,
  createJob,
  updateJob,
  toggleJobStatus,
} from '../services/jobsService';

const Jobs = () => {
  const { isAdmin, getToken } = useAuth();
  
  // Get today's date in YYYY-MM-DD format
  const getTodayDate = () => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  };

  // Format date for display
  const formatDateDisplay = (dateString) => {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (dateString === getTodayDate()) {
      return 'Today';
    } else if (dateString === yesterday.toISOString().split('T')[0]) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric' 
      });
    }
  };

  const [selectedDate, setSelectedDate] = useState(getTodayDate());
  const [selectedLegion, setSelectedLegion] = useState('US');
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionLoadingId, setActionLoadingId] = useState(null);

  // Add Job form (admin only)
  const [addTitle, setAddTitle] = useState('');
  const [addLink, setAddLink] = useState('');
  const [addCompany, setAddCompany] = useState('');
  const [addRegion, setAddRegion] = useState('US');
  const [addIsClearance, setAddIsClearance] = useState(false);
  const [addJobDescription, setAddJobDescription] = useState('');
  const [addJobSubmitting, setAddJobSubmitting] = useState(false);
  const [addJobError, setAddJobError] = useState(null);
  const [addJobModalOpen, setAddJobModalOpen] = useState(false);

  // Job detail modal (click title)
  const [detailJobId, setDetailJobId] = useState(null);
  const [detailJob, setDetailJob] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(null);
  const [detailEditing, setDetailEditing] = useState(false);
  const [editForm, setEditForm] = useState(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState(null);

  // Fetch job details when detail modal is opened
  useEffect(() => {
    if (!detailJobId) {
      setDetailJob(null);
      setDetailError(null);
      setDetailEditing(false);
      setEditForm(null);
      setEditError(null);
      return;
    }
    let cancelled = false;
    const fetchDetail = async () => {
      setDetailLoading(true);
      setDetailError(null);
      try {
        const token = getToken();
        const data = await getJobById(token, detailJobId);
        if (cancelled) return;
        if (data.success) setDetailJob(data.job);
      } catch (err) {
        if (!cancelled) {
          setDetailError(err.message);
          setDetailJob(null);
        }
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    };
    fetchDetail();
    return () => { cancelled = true; };
  }, [detailJobId]);

  // Start editing: fill form from current detail job
  const startEditJob = () => {
    if (!detailJob) return;
    const dateStr = detailJob.date ? detailJob.date.slice(0, 10) : '';
    setEditForm({
      title: detailJob.title || '',
      company: detailJob.company || '',
      jobUrl: detailJob.jobUrl || '',
      date: dateStr,
      source: detailJob.source || '',
      legion: detailJob.legion || '',
      isClearance: !!detailJob.isClearance,
      jobDescription: detailJob.jobDescription || ''
    });
    setEditError(null);
    setDetailEditing(true);
  };

  const cancelEditJob = () => {
    setDetailEditing(false);
    setEditForm(null);
    setEditError(null);
  };

  const handleSaveJob = async (e) => {
    e.preventDefault();
    if (!detailJobId || !editForm) return;
    setEditError(null);
    setEditSaving(true);
    try {
      const token = getToken();
      const body = {
        JobTitle: editForm.title.trim(),
        CompanyName: editForm.company.trim(),
        ApplyLink: editForm.jobUrl.trim(),
        Date: editForm.date ? new Date(editForm.date).toISOString() : new Date().toISOString(),
        Source: (editForm.source && editForm.source.trim()) || null,
        Legion: (editForm.legion && editForm.legion.trim()) || null,
        JobDescription: (editForm.jobDescription && editForm.jobDescription.trim()) || '',
        isClearance: !!editForm.isClearance
      };
      const data = await updateJob(token, detailJobId, body);
      if (data.success) {
        setDetailJob({
          ...detailJob,
          title: editForm.title.trim(),
          company: editForm.company.trim(),
          jobUrl: editForm.jobUrl.trim(),
          date: body.Date,
          source: editForm.source?.trim() || null,
          legion: editForm.legion?.trim() || null,
          isClearance: !!editForm.isClearance,
          jobDescription: editForm.jobDescription?.trim() || ''
        });
        setJobs(prevJobs =>
          prevJobs.map(j =>
            j.id === detailJobId
              ? {
                  ...j,
                  title: editForm.title.trim(),
                  company: editForm.company.trim(),
                  jobUrl: editForm.jobUrl.trim(),
                  date: body.Date,
                  source: editForm.source?.trim() || null,
                  legion: editForm.legion?.trim() || null,
                  isClearance: !!editForm.isClearance
                }
              : j
          )
        );
        cancelEditJob();
      }
    } catch (err) {
      console.error('Error saving job:', err);
      setEditError(err.message || 'Failed to save job');
    } finally {
      setEditSaving(false);
    }
  };

  // Fetch jobs from API
  useEffect(() => {
    const fetchJobs = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const token = getToken();
        const data = await getJobsByDate(token, {
          date: selectedDate,
          legion: selectedLegion,
        });

        if (data.success) {
          setJobs(data.jobs || []);
        } else {
          throw new Error(data.message || 'Failed to fetch jobs');
        }
      } catch (err) {
        console.error('Error fetching jobs:', err);
        setError(err.message);
        setJobs([]);
      } finally {
        setLoading(false);
      }
    };

    fetchJobs();
  }, [selectedDate, selectedLegion]);

  // Format date for table display
  const formatTableDate = (dateString) => {
    if (!dateString) return '—';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    });
  };

  // Add job (admin only) - source is set to 'custom' on backend
  const handleAddJob = async (e) => {
    e.preventDefault();
    setAddJobError(null);
    if (!addTitle.trim() || !addLink.trim() || !addCompany.trim() || !addJobDescription.trim()) {
      setAddJobError('Title, Link, Company, and Job description are required.');
      return;
    }
    setAddJobSubmitting(true);
    try {
      const jobId = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const token = getToken();
      const data = await createJob(token, {
        JobId: jobId,
        JobTitle: addTitle.trim(),
        ApplyLink: addLink.trim(),
        CompanyName: addCompany.trim(),
        JobDescription: addJobDescription.trim(),
        Legion: addRegion || null,
        isClearance: addIsClearance,
      });
      if (data.success) {
        setAddTitle('');
        setAddLink('');
        setAddCompany('');
        setAddJobDescription('');
        setAddRegion('US');
        setAddIsClearance(false);
        setAddJobModalOpen(false);
        setAddJobError(null);
        // Show new job: use today and the added job's region so list includes it
        const today = getTodayDate();
        setSelectedDate(today);
        setSelectedLegion(addRegion || 'US');
        const listData = await getJobsByDate(token, {
          date: today,
          legion: addRegion || 'US',
        });
        if (listData.success && listData.jobs) {
          setJobs(listData.jobs);
        }
      }
    } catch (err) {
      console.error('Error adding job:', err);
      setAddJobError(err.message || 'Failed to add job');
    } finally {
      setAddJobSubmitting(false);
    }
  };

  // Handle toggle job status (activate/deactivate)
  const handleToggleJobStatus = async (job) => {
    try {
      setActionLoadingId(job.id);
      const token = getToken();
      const data = await toggleJobStatus(token, job.id);
      if (data.success) {
        // Update only the specific job in the state
        setJobs(prevJobs => 
          prevJobs.map(j => 
            j.id === job.id
              ? { ...j, isActive: data.job.isActive }
              : j
          )
        );
      }
    } catch (err) {
      console.error('Error toggling job status:', err);
      alert(err.message || 'Failed to toggle job status');
    } finally {
      setActionLoadingId(null);
    }
  };

  const jobsTableColWidths = isAdmin()
    ? ['5%', '22%', '20%', '15%', '9%', '10%', '5%', '5%', '9%']
    : ['5%', '25%', '20%', '14%', '10%', '11%', '7%', '8%'];

  return (
    <div className="flex-1 min-w-0 p-4 lg:p-6">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden min-w-0">
        {/* Header with filters + Add Job button (admin) */}
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
          <div className="flex flex-wrap items-end gap-4">
            {/* Legion Filter */}
            <div className="flex-1 min-w-[200px]">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Legion
              </label>
              <select
                value={selectedLegion}
                onChange={(e) => setSelectedLegion(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="US">US</option>
                <option value="Latin America">Latin America</option>
                <option value="Europe">Europe</option>
              </select>
            </div>

            {/* Date Filter */}
            <div className="flex-1 min-w-[200px]">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Date
              </label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            {isAdmin() && (
              <button
                type="button"
                onClick={() => { setAddJobModalOpen(true); setAddJobError(null); }}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                Add Job
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="mt-2 text-gray-500">Loading jobs...</p>
          </div>
        ) : error ? (
          <div className="p-8 text-center">
            <p className="text-red-600 mb-2">Error: {error}</p>
            <button
              onClick={() => window.location.reload()}
              className="text-blue-600 hover:text-blue-800 underline"
            >
              Try again
            </button>
          </div>
        ) : jobs.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-gray-500">No</p>
          </div>
        ) : (
          <div className="max-h-[calc(100vh-200px)] overflow-y-auto overflow-x-auto">
            <table className="w-full min-w-[720px] table-fixed divide-y divide-gray-200 text-sm">
              <colgroup>
                {jobsTableColWidths.map((width, i) => (
                  <col key={i} style={{ width }} />
                ))}
              </colgroup>
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    No
                  </th>
                  <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Title
                  </th>
                  <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Link
                  </th>
                  <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Company
                  </th>
                  <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Source
                  </th>
                  <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Region
                  </th>
                  <th className="px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider" title="Security clearance">
                    Clearance
                  </th>
                  {isAdmin() && (
                    <th className="px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {jobs.map((job, index) => (
                  <tr key={job.id || job.jobId} className="hover:bg-gray-50">
                    <td className="px-2 py-3 whitespace-nowrap text-center text-gray-900">
                      {index + 1}
                    </td>
                    <td className="min-w-0 px-2 py-3">
                      <button
                        type="button"
                        onClick={() => setDetailJobId(job.id)}
                        className="font-medium text-blue-600 hover:text-blue-800 hover:underline truncate block w-full text-left"
                        title={job.title}
                      >
                        {job.title}
                      </button>
                    </td>
                    <td className="min-w-0 px-2 py-3">
                      <a
                        href={job.jobUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800 hover:underline truncate block"
                        title={job.jobUrl}
                      >
                        {job.jobUrl}
                      </a>
                    </td>
                    <td className="min-w-0 px-2 py-3">
                      <div className="font-medium text-gray-900 truncate" title={job.company}>
                        {job.company}
                      </div>
                    </td>
                    <td className="px-2 py-3 whitespace-nowrap text-gray-500">
                      {formatTableDate(job.date)}
                    </td>
                    <td className="min-w-0 px-2 py-3">
                      <div className="text-gray-600 truncate" title={job.source || undefined}>
                        {job.source || '—'}
                      </div>
                    </td>
                    <td className="px-2 py-3 whitespace-nowrap text-gray-600">
                      {job.legion || '—'}
                    </td>
                    <td className="px-2 py-3 whitespace-nowrap text-center">
                      <span className={job.isClearance ? 'font-medium text-amber-700' : 'text-gray-400'}>
                        {job.isClearance ? 'Yes' : 'No'}
                      </span>
                    </td>
                    {isAdmin() && (
                      <td className="px-2 py-3 whitespace-nowrap text-center">
                        <button
                          onClick={() => handleToggleJobStatus(job)}
                          disabled={actionLoadingId === job.id}
                          className={`px-2 py-1 text-xs font-medium rounded-md border whitespace-nowrap ${
                            actionLoadingId === job.id
                              ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                              : job.isActive !== false
                              ? 'bg-red-600 text-white border-red-600 hover:bg-red-700'
                              : 'bg-green-600 text-white border-green-600 hover:bg-green-700'
                          }`}
                        >
                          {actionLoadingId === job.id
                            ? '...'
                            : job.isActive !== false
                            ? 'Deactivate'
                            : 'Activate'}
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Job modal (admin only) */}
      {isAdmin() && addJobModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          onClick={() => !addJobSubmitting && setAddJobModalOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-job-title"
        >
          <div
            className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 id="add-job-title" className="text-lg font-semibold text-gray-900">Add Job</h2>
              <button
                type="button"
                onClick={() => !addJobSubmitting && setAddJobModalOpen(false)}
                className="p-1 rounded text-gray-500 hover:text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                aria-label="Close"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleAddJob} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                <input
                  type="text"
                  value={addTitle}
                  onChange={(e) => setAddTitle(e.target.value)}
                  placeholder="Job title"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Link</label>
                <input
                  type="url"
                  value={addLink}
                  onChange={(e) => setAddLink(e.target.value)}
                  placeholder="Apply URL"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Company</label>
                <input
                  type="text"
                  value={addCompany}
                  onChange={(e) => setAddCompany(e.target.value)}
                  placeholder="Company name"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Region</label>
                <select
                  value={addRegion}
                  onChange={(e) => setAddRegion(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="US">US</option>
                  <option value="Latin America">Latin America</option>
                  <option value="Europe">Europe</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Job description</label>
                <textarea
                  value={addJobDescription}
                  onChange={(e) => setAddJobDescription(e.target.value)}
                  placeholder="Job description"
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="add-is-clearance"
                  checked={addIsClearance}
                  onChange={(e) => setAddIsClearance(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="add-is-clearance" className="text-sm font-medium text-gray-700">
                  Requires security clearance
                </label>
              </div>
              {addJobError && (
                <p className="text-sm text-red-600">{addJobError}</p>
              )}
              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={addJobSubmitting}
                  className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {addJobSubmitting ? 'Adding...' : 'Add Job'}
                </button>
                <button
                  type="button"
                  onClick={() => !addJobSubmitting && setAddJobModalOpen(false)}
                  disabled={addJobSubmitting}
                  className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Job detail modal (click title) */}
      {detailJobId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          onClick={() => !detailEditing && !editSaving && setDetailJobId(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="job-detail-title"
        >
          <div
            className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between shrink-0">
              <h2 id="job-detail-title" className="text-lg font-semibold text-gray-900">
                {detailEditing ? 'Edit job' : 'Job details'}
              </h2>
              <div className="flex items-center gap-2">
                {isAdmin() && detailJob && !detailLoading && !detailError && (
                  detailEditing ? (
                    <>
                      <button
                        type="button"
                        onClick={cancelEditJob}
                        disabled={editSaving}
                        className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveJob}
                        disabled={editSaving}
                        className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                      >
                        {editSaving ? 'Saving...' : 'Save'}
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={startEditJob}
                      className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                    >
                      Edit
                    </button>
                  )
                )}
                <button
                  type="button"
                  onClick={() => !detailEditing && !editSaving && setDetailJobId(null)}
                  disabled={editSaving}
                  className="p-1 rounded text-gray-500 hover:text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                  aria-label="Close"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              {detailLoading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
                </div>
              ) : detailError ? (
                <p className="text-red-600">{detailError}</p>
              ) : detailEditing && editForm ? (
                <form onSubmit={handleSaveJob} className="space-y-4">
                  {editError && (
                    <p className="text-sm text-red-600">{editError}</p>
                  )}
                  <div>
                    <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Job title</label>
                    <input
                      type="text"
                      value={editForm.title}
                      onChange={(e) => setEditForm(f => ({ ...f, title: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Company</label>
                    <input
                      type="text"
                      value={editForm.company}
                      onChange={(e) => setEditForm(f => ({ ...f, company: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Job URL</label>
                    <input
                      type="url"
                      value={editForm.jobUrl}
                      onChange={(e) => setEditForm(f => ({ ...f, jobUrl: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Source</label>
                    <input
                      type="text"
                      value={editForm.source}
                      onChange={(e) => setEditForm(f => ({ ...f, source: e.target.value }))}
                      placeholder="e.g. custom, indeed"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Date</label>
                    <input
                      type="date"
                      value={editForm.date}
                      onChange={(e) => setEditForm(f => ({ ...f, date: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Region</label>
                    <select
                      value={editForm.legion || ''}
                      onChange={(e) => setEditForm(f => ({ ...f, legion: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">—</option>
                      <option value="US">US</option>
                      <option value="Latin America">Latin America</option>
                      <option value="Europe">Europe</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="edit-is-clearance"
                      checked={!!editForm.isClearance}
                      onChange={(e) => setEditForm(f => ({ ...f, isClearance: e.target.checked }))}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <label htmlFor="edit-is-clearance" className="text-sm font-medium text-gray-700">
                      Requires security clearance
                    </label>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Job description</label>
                    <textarea
                      value={editForm.jobDescription}
                      onChange={(e) => setEditForm(f => ({ ...f, jobDescription: e.target.value }))}
                      rows={8}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                </form>
              ) : detailJob ? (
                <dl className="space-y-4">
                  <div>
                    <dt className="text-xs font-medium text-gray-500 uppercase tracking-wider">Job title</dt>
                    <dd className="mt-1 text-sm text-gray-900">{detailJob.title}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-gray-500 uppercase tracking-wider">Company</dt>
                    <dd className="mt-1 text-sm text-gray-900">{detailJob.company}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-gray-500 uppercase tracking-wider">Job URL</dt>
                    <dd className="mt-1 text-sm">
                      <a href={detailJob.jobUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline break-all">
                        {detailJob.jobUrl}
                      </a>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-gray-500 uppercase tracking-wider">Source</dt>
                    <dd className="mt-1 text-sm text-gray-900">{detailJob.source || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-gray-500 uppercase tracking-wider">Date</dt>
                    <dd className="mt-1 text-sm text-gray-900">
                      {detailJob.date ? formatTableDate(detailJob.date) : '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-gray-500 uppercase tracking-wider">Region</dt>
                    <dd className="mt-1 text-sm text-gray-900">{detailJob.legion || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-gray-500 uppercase tracking-wider">Security clearance</dt>
                    <dd className={`mt-1 text-sm font-medium ${detailJob.isClearance ? 'text-amber-700' : 'text-gray-900'}`}>
                      {detailJob.isClearance ? 'Required' : 'Not required'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-gray-500 uppercase tracking-wider">Job description</dt>
                    <dd className="mt-1 text-sm text-gray-900 whitespace-pre-wrap">{detailJob.jobDescription || '—'}</dd>
                  </div>
                </dl>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Jobs;

