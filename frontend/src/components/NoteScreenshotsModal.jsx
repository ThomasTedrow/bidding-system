import React from 'react';
import PropTypes from 'prop-types';
import { API_BASE_URL } from '../services/api';

const getApiOrigin = () => {
  try {
    return new URL(API_BASE_URL, window.location.href).origin;
  } catch {
    return window.location.origin;
  }
};

const normalizeScreenshots = (value) => {
  if (!Array.isArray(value)) return [];
  return value.filter(Boolean);
};

const resolveScreenshotUrl = (screenshotPath, apiBaseUrl) => {
  if (!screenshotPath) return null;
  if (/^https?:\/\//i.test(screenshotPath)) return screenshotPath;
  try {
    return new URL(screenshotPath, getApiOrigin()).toString();
  } catch {
    return null;
  }
};

const resolveScreenshotUrls = (screenshots, apiBaseUrl) =>
  normalizeScreenshots(screenshots)
    .map((s) => resolveScreenshotUrl(s, API_BASE_URL))
    .filter(Boolean);

const NoteScreenshotsModal = ({
  isOpen,
  note,
  screenshots,
  onClose,
}) => {
  const screenshotUrls = resolveScreenshotUrls(screenshots);

  if (!isOpen || (!note && screenshotUrls.length === 0)) return null;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl max-w-4xl max-h-[90vh] p-6 m-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-gray-900">
            Note & Screenshot
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
        <div className="overflow-auto max-h-[calc(90vh-100px)] space-y-4">
          {note && note.trim() ? (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Note:</h3>
              <p className="text-sm text-gray-900 whitespace-pre-wrap bg-gray-50 p-3 rounded border border-gray-200">
                {note}
              </p>
            </div>
          ) : null}
          {screenshotUrls.length > 0 ? (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Screenshots:</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {screenshotUrls.map((url, index) => (
                  <img
                    key={url + index}
                    src={url}
                    alt={`Screenshot ${index + 1}`}
                    className="w-full h-auto rounded border border-gray-200"
                    onError={(e) => {
                      console.error('Error loading screenshot:', url);
                      e.target.style.display = 'none';
                      e.target.parentElement.innerHTML =
                        '<p class="text-sm text-red-600">Failed to load screenshot</p>';
                    }}
                  />
                ))}
              </div>
            </div>
          ) : null}
          {!note && screenshotUrls.length === 0 && (
            <div className="text-center py-8">
              <p className="text-gray-500">No note or screenshots available.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

NoteScreenshotsModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  note: PropTypes.string,
  screenshots: PropTypes.oneOfType([PropTypes.array, PropTypes.string]),
  onClose: PropTypes.func.isRequired,
};

export default NoteScreenshotsModal;

