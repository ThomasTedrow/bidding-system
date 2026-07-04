import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { downloadFile } from '../services/downloadService';
import { getJobById } from '../services/jobsService';
import {
  getBids,
  generateBidResume,
  applyBid,
  getBidProfiles,
  getBidResumeDownloadUrl,
} from '../services/bidsService';
import ApplyBidModal from '../components/ApplyBidModal';
import NoteScreenshotsModal from '../components/NoteScreenshotsModal';

const MAX_SCREENSHOTS = 3;

const Bids = () => {
  const { user, getToken, isBider, isAdmin } = useAuth();

  // Get today's date in YYYY-MM-DD format
  const getTodayDate = () => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  };

  // State
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionLoadingId, setActionLoadingId] = useState(null);
  const [actionError, setActionError] = useState(null);
  // Track jobs currently generating resumes
  const [generatingJobs, setGeneratingJobs] = useState(new Set());
  const MAX_CONCURRENT_GENERATIONS = 3;

  // Filter states
  const [selectedDate, setSelectedDate] = useState(getTodayDate());
  const [selectedProfile, setSelectedProfile] = useState('');
  /** Admin: search jobs by title, company, description (scoped to selected profile). Date is ignored while searching. */
  const [jobSearch, setJobSearch] = useState('');
  const [debouncedJobSearch, setDebouncedJobSearch] = useState('');

  // Filter options
  const [profiles, setProfiles] = useState([]);

  // Apply modal state
  const [applyModalOpen, setApplyModalOpen] = useState(false);
  const [selectedJobForApply, setSelectedJobForApply] = useState(null);

  // Screenshot modal state (for admin)
  const [screenshotModalOpen, setScreenshotModalOpen] = useState(false);
  const [selectedScreenshots, setSelectedScreenshots] = useState(null);
  const [selectedNote, setSelectedNote] = useState(null);

  // Job detail modal (click title)
  const [detailJobId, setDetailJobId] = useState(null);
  const [detailJob, setDetailJob] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedJobSearch(jobSearch.trim());
    }, 400);
    return () => clearTimeout(t);
  }, [jobSearch]);

  const clearAdminSearch = useCallback(() => {
    setJobSearch('');
    setDebouncedJobSearch('');
  }, []);

  // Fetch job details when detail modal is opened
  useEffect(() => {
    if (!detailJobId) {
      setDetailJob(null);
      setDetailError(null);
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

  const formatDetailDate = (dateString) => {
    if (!dateString) return '—';
    return new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatBidDate = (dateString) => {
    if (!dateString) return '—';
    const d = new Date(dateString);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
  };

  const fetchJobs = async () => {
    setLoading(true);
    setError(null);

    try {
      const token = getToken();
      const adminSearchActive = isAdmin() && debouncedJobSearch.length > 0;
      const data = await getBids(token, {
        date: adminSearchActive ? undefined : selectedDate,
        profileName: selectedProfile,
        search: adminSearchActive ? debouncedJobSearch : undefined,
      });

      if (data.success) {
        setJobs(data.bids || []);
      } else {
        throw new Error(data.message || 'Failed to fetch bids');
      }
    } catch (err) {
      console.error('Error fetching bids:', err);
      setError(err.message);
      setJobs([]);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateResume = async (job) => {
    // Prevent starting more than MAX_CONCURRENT_GENERATIONS in parallel
    if (generatingJobs.size >= MAX_CONCURRENT_GENERATIONS && !generatingJobs.has(job.id)) {
      return;
    }

    try {
      setActionError(null);
      // Add job ID to generating set
      setGeneratingJobs(prev => new Set(prev).add(job.id));

      const token = getToken();
      const data = await generateBidResume(token, {
        jobId: job.id,
        profileId: job.profileId,
      });
      if (data.success && data.aiResume) {
        // Update only the specific job in the state
        setJobs(prevJobs =>
          prevJobs.map(j =>
            j.id === job.id && j.profileId === job.profileId
              ? { ...j, generatedResume: data.aiResume.generatedResume }
              : j
          )
        );
      }
    } catch (err) {
      console.error('Error generating resume:', err);
      setActionError(err.message);
    } finally {
      // Remove job ID from generating set
      setGeneratingJobs(prev => {
        const newSet = new Set(prev);
        newSet.delete(job.id);
        return newSet;
      });
    }
  };

  const handleDownloadResume = async (job) => {
    if (!job.generatedResume) return;

    try {
      const token = getToken();
      const url = getBidResumeDownloadUrl(job.id, job.profileId);

      await downloadFile({
        url,
        token,
        defaultFilename: 'resume.docx',
        forceExtension: '.docx',
      });
    } catch (err) {
      console.error('Error downloading resume:', err);
      setActionError(err.message);
    }
  };

  const openApplyModal = (job) => {
    setSelectedJobForApply(job);
    setActionError(null);
    setApplyModalOpen(true);
  };

  const closeApplyModal = () => {
    setApplyModalOpen(false);
    setSelectedJobForApply(null);
  };

  const normalizeScreenshots = (value) => {
    if (!Array.isArray(value)) return [];
    return value.filter(Boolean);
  };

  const openNoteModal = (note, screenshots) => {
    // Handle empty strings as null
    setSelectedNote(note && note.trim() ? note : null);
    setSelectedScreenshots(screenshots ?? null);
    setScreenshotModalOpen(true);
  };

  const closeScreenshotModal = () => {
    setScreenshotModalOpen(false);
    setSelectedScreenshots(null);
    setSelectedNote(null);
  };

  const handleApply = async ({ note, screenshots }) => {
    if (!selectedJobForApply) return;

    try {
      setActionError(null);
      setActionLoadingId(selectedJobForApply.id);

      const token = getToken();
      const formData = new FormData();
      formData.append('jobId', selectedJobForApply.id);
      formData.append('profileId', selectedJobForApply.profileId);
      if (note && note.trim()) {
        formData.append('note', note.trim());
      }
      if (screenshots && screenshots.length > 0) {
        screenshots.forEach((file) => formData.append('screenshots', file));
      }

      const data = await applyBid(token, formData);
      if (data.success && data.bidStatus) {
        // Update only the specific job in the state
        setJobs(prevJobs =>
          prevJobs.map(j =>
            j.id === selectedJobForApply.id && j.profileId === selectedJobForApply.profileId
              ? {
                ...j,
                hasBidStatus: true,
                note: data.bidStatus.note || j.note,
                screenshots: normalizeScreenshots(data.bidStatus.screenshots ?? j.screenshots)
              }
              : j
          )
        );
        closeApplyModal();
      }
    } catch (err) {
      console.error('Error applying for job:', err);
      setActionError(err.message);
    } finally {
      setActionLoadingId(null);
    }
  };

  const fetchProfiles = async () => {
    try {
      const token = getToken();
      const data = await getBidProfiles(token);
      if (data.success) {
        setProfiles(data.profiles || []);
      }
    } catch (err) {
      console.error('Error fetching profiles:', err);
    }
  };


  // Fetch filter options
  useEffect(() => {
    if (isAdmin()) {
      fetchProfiles();
    } else if (isBider()) {
      fetchProfiles();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.role]);

  // Set first profile as default when profiles are loaded
  useEffect(() => {
    if (profiles.length > 0 && !selectedProfile) {
      setSelectedProfile(profiles[0].name);
      clearAdminSearch();
    }
  }, [profiles, selectedProfile, clearAdminSearch]);

  // Fetch bids when filters change
  useEffect(() => {
    if (selectedProfile && profiles.length > 0) {
      // Both admin and bidder need a profile selected
      fetchJobs();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, selectedProfile, profiles.length, debouncedJobSearch]);

  // Only show this page to bidders and admins
  if (!isBider() && !isAdmin()) {
    return (
      <div className="flex-1 p-8">
        <div className="text-center">
          <p className="text-gray-500">You don't have access to this page.</p>
        </div>
      </div>
    );
  }

  const bidsTableColWidths = isAdmin()
    ? ['5%', '15%', '6%', '16%', '10%', '7%', '4%', '5%', '8%', '8%', '8%', '8%']
    : ['5%', '20%', '17%', '13%', '7%', '7%', '10%', '7%', '7%', '7%'];

  return (
    <div className="flex-1 min-w-0 p-4 lg:p-6">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden min-w-0">
        {/* Filters Section */}
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
          <div className="flex flex-wrap items-end gap-4">
            {/* Date Filter */}
            <div className="flex-1 min-w-[200px]">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Date
              </label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => {
                  setSelectedDate(e.target.value);
                  clearAdminSearch();
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Profile Filter */}
            <div className="flex-1 min-w-[200px]">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Profile
              </label>
              <select
                value={selectedProfile}
                onChange={(e) => {
                  setSelectedProfile(e.target.value);
                  clearAdminSearch();
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                {profiles.map((profile, index) => (
                  <option key={index} value={profile.name}>
                    {profile.name}
                  </option>
                ))}
              </select>
            </div>

            {isAdmin() && (
              <div className="flex-1 min-w-[220px]">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Search
                </label>
                <input
                  type="search"
                  value={jobSearch}
                  onChange={(e) => setJobSearch(e.target.value)}
                  placeholder="Title, company, or description…"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  autoComplete="off"
                />
                {jobSearch.trim() ? (
                  <p className="text-xs text-gray-500 mt-1">
                    Searching for &quot;{jobSearch.trim()}&quot; — date filter is ignored.
                  </p>
                ) : null}
              </div>
            )}

          </div>
        </div>

        {/* Results Section */}
        {loading ? (
          <div className="p-8 text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="mt-2 text-gray-500">Loading bids...</p>
          </div>
        ) : error ? (
          <div className="p-8 text-center">
            <p className="text-red-600">{error}</p>
          </div>
        ) : jobs.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-gray-500">
              {isAdmin() && debouncedJobSearch.length > 0
                ? 'No applied jobs match your search.'
                : 'No jobs found for this profile and date.'}
            </p>
          </div>
        ) : (
          <div className="max-h-[calc(100vh-200px)] overflow-y-auto overflow-x-auto">
            <table className="w-full min-w-0 table-fixed divide-y divide-gray-200 text-sm">
              <colgroup>
                {bidsTableColWidths.map((width, i) => (
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
                  {isAdmin() && (
                    <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Bidder
                    </th>
                  )}
                  <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Link
                  </th>
                  <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Company
                  </th>
                  {isAdmin() && (
                    <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Bid date
                    </th>
                  )}
                  <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Legion
                  </th>
                  <th className="px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider" title="Security clearance">
                    Clearance
                  </th>
                  {isAdmin() && (
                    <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Source
                    </th>
                  )}
                  <th className="px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider" title="Generate resume">
                    Generate
                  </th>
                  <th className="px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider" title="Download resume">
                    Download
                  </th>
                  {isBider() && !isAdmin() && (
                    <>
                      <th className="px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Note
                      </th>
                      <th className="px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Apply
                      </th>
                    </>
                  )}
                  {isAdmin() && (
                    <th className="px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider" title="Note and screenshot">
                      Note
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {jobs.map((job, index) => (
                  <tr key={job.id} className="hover:bg-gray-50">
                    <td className="px-2 py-3 whitespace-nowrap text-center text-gray-900">
                      {index + 1}
                    </td>
                    <td className="min-w-0 px-2 py-3">
                      <button
                        type="button"
                        onClick={() => setDetailJobId(job.id)}
                        className="font-medium text-blue-600 hover:text-blue-800 hover:underline truncate block w-full text-left"
                        title={job.jobTitle}
                      >
                        {job.jobTitle}
                      </button>
                    </td>
                    {isAdmin() && (
                      <td className="min-w-0 px-2 py-3">
                        <div className="truncate text-gray-900" title={job.bidder?.name}>
                          {job.bidder ? job.bidder.name : '—'}
                        </div>
                      </td>
                    )}
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
                    {isAdmin() && (
                      <td className="px-2 py-3 whitespace-nowrap text-gray-900" title={job.appliedDate || undefined}>
                        {formatBidDate(job.appliedDate)}
                      </td>
                    )}
                    <td className="px-2 py-3 whitespace-nowrap text-gray-900">
                      {job.legion || '—'}
                    </td>
                    <td className="px-2 py-3 whitespace-nowrap text-center">
                      <span className={job.isClearance ? 'font-medium text-amber-700' : 'text-gray-400'}>
                        {job.isClearance ? 'Yes' : 'No'}
                      </span>
                    </td>
                    {isAdmin() && (
                      <td className="min-w-0 px-2 py-3">
                        <div className="text-gray-900 truncate" title={job.source || undefined}>
                          {job.source || '—'}
                        </div>
                      </td>
                    )}
                    <td className="px-2 py-3 text-center">
                      {(() => {
                        const isGenerating = generatingJobs.has(job.id);
                        const reachedLimit = generatingJobs.size >= MAX_CONCURRENT_GENERATIONS;
                        const noProfile = isAdmin() && !job.profileId;
                        const disableButton = noProfile || isGenerating || (reachedLimit && !isGenerating);
                        return (
                          <button
                            onClick={() => handleGenerateResume(job)}
                            disabled={disableButton}
                            title={
                              noProfile
                                ? 'Select a profile to generate resume'
                                : isGenerating
                                  ? 'Generating…'
                                  : job.generatedResume
                                    ? 'Regenerate resume'
                                    : 'Generate resume'
                            }
                            className={`px-2 py-1 text-xs font-medium rounded-md border whitespace-nowrap inline-flex items-center gap-1 max-w-full ${disableButton
                              ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                              : 'bg-white text-blue-600 border-blue-600 hover:bg-blue-50'
                              }`}
                          >
                            {isGenerating ? (
                              <>
                                <svg className="animate-spin h-3.5 w-3.5 shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                <span className="truncate">…</span>
                              </>
                            ) : (
                              job.generatedResume ? 'Regenerate' : 'Generate'
                            )}
                          </button>
                        );
                      })()}
                    </td>
                    <td className="px-2 py-3 text-center">
                      <button
                        onClick={() => handleDownloadResume(job)}
                        disabled={!job.profileId || !job.generatedResume}
                        title={isAdmin() && !job.profileId ? 'Select a profile to download' : undefined}
                        className={`px-2 py-1 text-xs font-medium rounded-md border whitespace-nowrap ${(job.profileId && job.generatedResume)
                          ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700'
                          : 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                          }`}
                      >
                        Download
                      </button>
                    </td>
                    {isBider() && !isAdmin() && (
                      <>
                        <td className="px-2 py-3 text-center">
                          {(job.note && job.note.trim()) || normalizeScreenshots(job.screenshots).length > 0 ? (
                            <button
                              onClick={() => openNoteModal(
                                job.note && job.note.trim() ? job.note : null,
                                job.screenshots || job.screenshot
                              )}
                              className="px-2 py-1 text-xs font-medium rounded-md border bg-white text-blue-600 border-blue-600 hover:bg-blue-50 whitespace-nowrap"
                            >
                              Note
                            </button>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-2 py-3 text-center">
                          <button
                            onClick={() => openApplyModal(job)}
                            disabled={job.hasBidStatus || actionLoadingId === job.id}
                            className={`px-2 py-1 text-xs font-medium rounded-md border whitespace-nowrap ${job.hasBidStatus || actionLoadingId === job.id
                              ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                              : 'bg-white text-green-600 border-green-600 hover:bg-green-50'
                              }`}
                          >
                            {job.hasBidStatus ? 'Applied' : 'Apply'}
                          </button>
                        </td>
                      </>
                    )}
                    {isAdmin() && (
                      <td className="px-2 py-3 text-center">
                        {(job.note && job.note.trim()) || normalizeScreenshots(job.screenshots).length > 0 ? (
                          <button
                            onClick={() => openNoteModal(
                              job.note && job.note.trim() ? job.note : null,
                              job.screenshots || job.screenshot
                            )}
                            className="px-2 py-1 text-xs font-medium rounded-md border bg-white text-blue-600 border-blue-600 hover:bg-blue-50 whitespace-nowrap"
                          >
                            Note
                          </button>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Action error message */}
      {actionError && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-600">{actionError}</p>
        </div>
      )}

      {/* Apply Modal */}
      <ApplyBidModal
        isOpen={applyModalOpen}
        job={selectedJobForApply}
        maxScreenshots={MAX_SCREENSHOTS}
        onClose={closeApplyModal}
        onApply={handleApply}
        onError={setActionError}
        isApplying={!!(selectedJobForApply && actionLoadingId === selectedJobForApply.id)}
      />

      {/* Note & Screenshot Modal */}
      <NoteScreenshotsModal
        isOpen={screenshotModalOpen}
        note={selectedNote}
        screenshots={selectedScreenshots}
        onClose={closeScreenshotModal}
      />

      {/* Job detail modal (click title) */}
      {detailJobId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          onClick={() => setDetailJobId(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="job-detail-title-bids"
        >
          <div
            className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between shrink-0">
              <h2 id="job-detail-title-bids" className="text-lg font-semibold text-gray-900">Job details</h2>
              <button
                type="button"
                onClick={() => setDetailJobId(null)}
                className="p-1 rounded text-gray-500 hover:text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                aria-label="Close"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              {detailLoading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
                </div>
              ) : detailError ? (
                <p className="text-red-600">{detailError}</p>
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
                    <dd className="mt-1 text-sm text-gray-900">{formatDetailDate(detailJob.date)}</dd>
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

export default Bids;

