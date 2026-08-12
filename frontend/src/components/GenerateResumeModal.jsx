import React, { useCallback, useEffect, useState } from 'react';
import PropTypes from 'prop-types';

const GenerateResumeModal = ({
  isOpen,
  job,
  onGenerate,
  onClose,
  onError,
}) => {
  const [jobDescription, setJobDescription] = useState('');

  const resetState = useCallback(() => {
    setJobDescription(job?.savedJobDescription || '');
    if (onError) onError(null);
  }, [job, onError]);

  useEffect(() => {
    if (isOpen && job) {
      resetState();
    }
  }, [isOpen, job, resetState]);

  const handleGenerateClick = () => {
    if (!job || !onGenerate) return;
    if (!jobDescription.trim()) {
      if (onError) onError('Please enter a job description');
      return;
    }
    onGenerate({ jobDescription: jobDescription.trim() });
  };

  if (!isOpen || !job) return null;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="generate-resume-title"
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-gray-200 shrink-0">
          <h2 id="generate-resume-title" className="text-lg font-semibold text-gray-900">
            Generate Resume
          </h2>
        </div>

        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          <div>
            <dt className="text-xs font-medium text-gray-500 uppercase tracking-wider">Job title</dt>
            <dd className="mt-1 text-sm font-medium text-gray-900">{job.jobTitle}</dd>
          </div>

          <div>
            <dt className="text-xs font-medium text-gray-500 uppercase tracking-wider">Job link</dt>
            <dd className="mt-1 text-sm">
              <a
                href={job.jobUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline break-all"
              >
                {job.jobUrl}
              </a>
            </dd>
          </div>

          <div>
            <label htmlFor="generate-resume-jd" className="block text-sm font-medium text-gray-700 mb-2">
              Job description
            </label>
            <textarea
              id="generate-resume-jd"
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              rows={12}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y leading-relaxed"
              placeholder="Paste the job description from the job link above..."
            />
            <p className="text-right mt-1 text-xs text-gray-500">{jobDescription.length} characters</p>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleGenerateClick}
            className="px-4 py-2 text-sm font-medium text-white rounded-lg bg-blue-600 hover:bg-blue-700"
          >
            Generate
          </button>
        </div>
      </div>
    </div>
  );
};

GenerateResumeModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  job: PropTypes.object,
  onGenerate: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
  onError: PropTypes.func,
};

export default GenerateResumeModal;
