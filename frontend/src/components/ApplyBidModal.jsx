import React, { useCallback, useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';

const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

const ApplyBidModal = ({
  isOpen,
  job,
  maxScreenshots,
  onApply,
  onClose,
  onError,
  isApplying,
}) => {
  const [note, setNote] = useState('');
  const [screenshots, setScreenshots] = useState([]);
  const fileInputRef = useRef(null);

  const resetState = useCallback(() => {
    setNote('');
    setScreenshots([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  useEffect(() => {
    if (isOpen && job) {
      resetState();
      if (onError) onError(null);
    }
  }, [isOpen, job, resetState, onError]);

  const addScreenshots = useCallback(
    (files) => {
      if (!files || files.length === 0) return;
      setScreenshots((prev) => {
        const next = [...prev];
        for (const file of files) {
          if (!file) continue;
          if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
            if (onError) onError('Please upload a PNG, JPG, or WEBP image file');
            continue;
          }
          if (file.size > MAX_FILE_SIZE) {
            if (onError) onError('File size must be less than 5MB');
            continue;
          }
          if (next.length >= maxScreenshots) {
            if (onError) onError(`You can upload up to ${maxScreenshots} screenshots`);
            break;
          }
          next.push(file);
        }
        if (next.length > prev.length && onError) {
          onError(null);
        }
        return next;
      });
    },
    [maxScreenshots, onError],
  );

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files || []);
    addScreenshots(files);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemoveScreenshotAt = (index) => {
    setScreenshots((prev) => prev.filter((_, i) => i !== index));
  };

  useEffect(() => {
    if (!isOpen) return;

    const handlePaste = (event) => {
      const clipboardFiles = Array.from(event.clipboardData?.files || []).filter(
        (file) => file && file.type && file.type.startsWith('image/'),
      );

      if (clipboardFiles.length === 0) return;

      event.preventDefault();

      const normalizedFiles = clipboardFiles.map((file, index) => {
        const name =
          file.name && file.name.trim()
            ? file.name
            : `pasted-image-${Date.now()}-${index}.png`;
        return new File([file], name, { type: file.type || 'image/png' });
      });

      addScreenshots(normalizedFiles);
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [isOpen, addScreenshots]);

  const handleApplyClick = () => {
    if (!job || !onApply) return;
    onApply({ note, screenshots });
  };

  if (!isOpen || !job) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Apply for {job.jobTitle}
        </h2>
        <p className="text-sm text-gray-600 mb-4">
          You can optionally add a note and upload screenshots.
        </p>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Note (optional)
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows="3"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Enter note"
          />
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Screenshots (optional)
          </label>
          <div className="flex flex-col gap-2">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/png,image/jpeg,image/jpg,image/webp"
              onChange={handleFileChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-500">
              Up to {maxScreenshots} images. Paste from snipping tool (Ctrl + V) or choose files.
            </p>
            {screenshots.length > 0 && (
              <div className="space-y-2">
                {screenshots.map((file, index) => (
                  <div
                    key={`${file.name}-${index}`}
                    className="flex items-center justify-between rounded border border-gray-200 px-3 py-2 bg-gray-50"
                  >
                    <div className="text-xs text-gray-700 truncate pr-2">{file.name}</div>
                    <button
                      type="button"
                      onClick={() => handleRemoveScreenshotAt(index)}
                      className="text-xs text-red-600 hover:text-red-800"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApplyClick}
            disabled={isApplying}
            className={`px-4 py-2 text-sm font-medium text-white rounded-lg ${
              isApplying ? 'bg-blue-300 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {isApplying ? 'Applying...' : 'Apply'}
          </button>
        </div>
      </div>
    </div>
  );
};

ApplyBidModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  job: PropTypes.object,
  maxScreenshots: PropTypes.number.isRequired,
  onApply: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
  onError: PropTypes.func,
  isApplying: PropTypes.bool.isRequired,
};

export default ApplyBidModal;

