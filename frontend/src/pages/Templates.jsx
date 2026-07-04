import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { downloadFile } from '../services/downloadService';
import {
  getBidders,
  getTemplatesPage,
  createTemplate,
  updateTemplateBidder,
  updateTemplate,
  deleteTemplate,
} from '../services/templatesService';

const Templates = () => {
  const { getToken } = useAuth();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Form state
  const [profileName, setProfileName] = useState('');
  const [templateFile, setTemplateFile] = useState(null);
  const [legion, setLegion] = useState('');

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [itemsPerPage] = useState(10);

  // Bidders list
  const [bidders, setBidders] = useState([]);

  // Edit state for bidder
  const [editingBidder, setEditingBidder] = useState(null);
  const [selectedBidderId, setSelectedBidderId] = useState('');

  // Edit state for template file
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [newTemplateFile, setNewTemplateFile] = useState(null);
  const [editProfileName, setEditProfileName] = useState('');

  // Fetch bidders
  useEffect(() => {
    fetchBidders();
  }, []);

  // Fetch templates
  useEffect(() => {
    fetchTemplates();
  }, [currentPage]);

  const fetchBidders = async () => {
    try {
      const token = getToken();
      const data = await getBidders(token);
      setBidders(data.bidders || []);
    } catch (err) {
      console.error('Error fetching bidders:', err);
      setError(err.message);
      setBidders([]);
    }
  };

  const fetchTemplates = async () => {
    setLoading(true);
    setError(null);

    try {
      const token = getToken();
      const data = await getTemplatesPage(token, {
        page: currentPage,
        limit: itemsPerPage,
      });
      setTemplates(data.templates || []);
      setTotalPages(data.totalPages || 1);
    } catch (err) {
      console.error('Error fetching templates:', err);
      setError(err.message);
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadTemplate = async (template) => {
    try {
      if (!template?.templateUrl) {
        throw new Error('Missing template download URL');
      }

      await downloadFile({
        url: template.templateUrl,
        token: getToken(),
        defaultFilename: template.fileName || 'template',
      });
    } catch (err) {
      console.error('Error downloading template:', err);
      setError(err.message);
    }
  };

  // Handle file upload
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const allowedTypes = [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/msword'
      ];

      if (!allowedTypes.includes(file.type)) {
        setError('Please upload a PDF, DOCX, or DOC file');
        return;
      }

      setTemplateFile(file);
      setError(null);
    }
  };

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!profileName.trim()) {
      setError('Profile Name is required');
      return;
    }

    if (!templateFile) {
      setError('Please select a template file');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('profileName', profileName);
      formData.append('template', templateFile);
      if (legion) {
        formData.append('Legion', legion);
      }

      const token = getToken();
      const data = await createTemplate(token, formData);

      if (data.success) {
        // Reset form
        setProfileName('');
        setTemplateFile(null);
        setLegion('');
        document.getElementById('template-file-input').value = '';

        // Refresh templates list
        fetchTemplates();
      } else {
        throw new Error(data.message || 'Failed to upload template');
      }
    } catch (err) {
      console.error('Error uploading template:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Handle start editing bidder
  const handleStartEditBidder = (template) => {
    setEditingBidder(template.id);
    setSelectedBidderId(template.bidderId || '');
  };

  // Handle cancel editing
  const handleCancelEditBidder = () => {
    setEditingBidder(null);
    setSelectedBidderId('');
  };

  // Handle save bidder update
  const handleSaveBidder = async (templateId) => {
    try {
      const token = getToken();
      const data = await updateTemplateBidder(token, templateId, selectedBidderId);

      if (data.success) {
        setEditingBidder(null);
        setSelectedBidderId('');
        fetchTemplates();
      } else {
        throw new Error(data.message || 'Failed to update template');
      }
    } catch (err) {
      console.error('Error updating template:', err);
      setError(err.message);
    }
  };

  // Handle start editing template
  const handleStartEditTemplate = (template) => {
    setEditingTemplate(template.id);
    setEditProfileName(template.profileName);
    setNewTemplateFile(null);
  };

  // Handle cancel editing template
  const handleCancelEditTemplate = () => {
    setEditingTemplate(null);
    setEditProfileName('');
    setNewTemplateFile(null);
  };

  // Handle template file change
  const handleTemplateFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const allowedTypes = [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/msword'
      ];

      if (!allowedTypes.includes(file.type)) {
        setError('Please upload a PDF, DOCX, or DOC file');
        return;
      }

      setNewTemplateFile(file);
      setError(null);
    }
  };

  // Handle save template update
  const handleSaveTemplate = async (templateId) => {
    if (!editProfileName.trim()) {
      setError('Profile Name is required');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('profileName', editProfileName.trim());

      if (newTemplateFile) {
        formData.append('template', newTemplateFile);
      }

      const token = getToken();
      const data = await updateTemplate(token, templateId, formData);

      if (data.success) {
        setEditingTemplate(null);
        setEditProfileName('');
        setNewTemplateFile(null);
        fetchTemplates();
      } else {
        throw new Error(data.message || 'Failed to update template');
      }
    } catch (err) {
      console.error('Error updating template:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Handle delete
  const handleDelete = async (templateId) => {
    if (!window.confirm('Are you sure you want to delete this template?')) {
      return;
    }

    try {
      const token = getToken();
      const data = await deleteTemplate(token, templateId);

      if (data.success) {
        fetchTemplates();
      } else {
        throw new Error(data.message || 'Failed to delete template');
      }
    } catch (err) {
      console.error('Error deleting template:', err);
      setError(err.message);
    }
  };

  // Pagination handlers
  const handlePageChange = (page) => {
    setCurrentPage(page);
  };

  return (
    <div className="flex-1 p-8">

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-600 text-sm">{error}</p>
        </div>
      )}

      {/* Upload Section */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Add Template</h2>
        <form onSubmit={handleSubmit} className="flex items-end gap-4">
          <div className="flex-1">
            <label htmlFor="profile-name" className="block text-sm font-medium text-gray-700 mb-2">
              Profile Name
            </label>
            <input
              type="text"
              id="profile-name"
              value={profileName}
              onChange={(e) => setProfileName(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter profile name"
              required
            />
          </div>

          <div className="flex-1">
            <label htmlFor="template-file-input" className="block text-sm font-medium text-gray-700 mb-2">
              Template (PDF, DOCX, DOC)
            </label>
            <input
              type="file"
              id="template-file-input"
              accept=".pdf,.docx,.doc"
              onChange={handleFileChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>

          <div className="flex-1">
            <label htmlFor="legion-select" className="block text-sm font-medium text-gray-700 mb-2">
              Legion
            </label>
            <select
              id="legion-select"
              value={legion}
              onChange={(e) => setLegion(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">Select Legion</option>
              <option value="US">US</option>
              <option value="Latin America">Latin America</option>
              <option value="Europe">Europe</option>
            </select>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className={`px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors ${loading ? 'opacity-50 cursor-not-allowed' : ''
                }`}
            >
              {loading ? 'Uploading...' : 'Add Template'}
            </button>
          </div>
        </form>
      </div>

      {/* Table Section */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Templates List</h2>
        </div>

        {loading && templates.length === 0 ? (
          <div className="p-8 text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="mt-2 text-gray-500">Loading templates...</p>
          </div>
        ) : templates.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-gray-500">No templates available.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Profile Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Template
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Region
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Bidder
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Update
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {templates.map((template) => (
                    <tr key={template.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        {editingTemplate === template.id ? (
                          <input
                            type="text"
                            value={editProfileName}
                            onChange={(e) => setEditProfileName(e.target.value)}
                            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 w-full"
                            placeholder="Profile Name"
                          />
                        ) : (
                          <div className="text-sm font-medium text-gray-900">
                            {template.profileName}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {editingTemplate === template.id ? (
                          <div>
                            <input
                              type="file"
                              accept=".pdf,.docx,.doc"
                              onChange={handleTemplateFileChange}
                              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            {newTemplateFile && (
                              <p className="mt-1 text-xs text-gray-600 truncate">
                                New: {newTemplateFile.name}
                              </p>
                            )}
                            {!newTemplateFile && template.templateUrl && (
                              <p className="mt-1 text-xs text-gray-500">
                                Current file will be kept if no new file selected
                              </p>
                            )}
                          </div>
                        ) : (
                          template.templateUrl ? (
                            <button
                              type="button"
                              onClick={() => handleDownloadTemplate(template)}
                              className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
                            >
                              Download
                            </button>
                          ) : (
                            <span className="text-sm text-gray-400">—</span>
                          )
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {template.Legion || '—'}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {editingBidder === template.id ? (
                          <select
                            value={selectedBidderId}
                            onChange={(e) => setSelectedBidderId(e.target.value)}
                            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          >
                            <option value="">Select Bidder</option>
                            {bidders.map((bidder) => (
                              <option key={bidder.id} value={bidder.id}>
                                {bidder.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <div className="text-sm text-gray-900">
                            {template.bidderName || (
                              <span className="text-gray-400">No bidder assigned</span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {editingTemplate === template.id ? (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleSaveTemplate(template.id)}
                              disabled={loading}
                              className={`px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors ${loading ? 'opacity-50 cursor-not-allowed' : ''
                                }`}
                            >
                              {loading ? 'Saving...' : 'Save'}
                            </button>
                            <button
                              onClick={handleCancelEditTemplate}
                              disabled={loading}
                              className="px-3 py-1.5 text-sm bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : editingBidder === template.id ? (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleSaveBidder(template.id)}
                              className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                            >
                              Save
                            </button>
                            <button
                              onClick={handleCancelEditBidder}
                              className="px-3 py-1.5 text-sm bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleStartEditTemplate(template)}
                              className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                            >
                              Update Template
                            </button>
                            <button
                              onClick={() => handleStartEditBidder(template)}
                              className="px-3 py-1.5 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                            >
                              Update Bidder
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <button
                          onClick={() => handleDelete(template.id)}
                          className="px-3 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
                <div className="text-sm text-gray-700">
                  Page {currentPage} of {totalPages}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    className={`px-4 py-2 text-sm border border-gray-300 rounded-lg ${currentPage === 1
                        ? 'opacity-50 cursor-not-allowed'
                        : 'hover:bg-gray-50'
                      }`}
                  >
                    Previous
                  </button>
                  {[...Array(totalPages)].map((_, index) => {
                    const page = index + 1;
                    if (
                      page === 1 ||
                      page === totalPages ||
                      (page >= currentPage - 1 && page <= currentPage + 1)
                    ) {
                      return (
                        <button
                          key={page}
                          onClick={() => handlePageChange(page)}
                          className={`px-4 py-2 text-sm border rounded-lg ${currentPage === page
                              ? 'bg-blue-600 text-white border-blue-600'
                              : 'border-gray-300 hover:bg-gray-50'
                            }`}
                        >
                          {page}
                        </button>
                      );
                    } else if (
                      page === currentPage - 2 ||
                      page === currentPage + 2
                    ) {
                      return <span key={page} className="px-2">...</span>;
                    }
                    return null;
                  })}
                  <button
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className={`px-4 py-2 text-sm border border-gray-300 rounded-lg ${currentPage === totalPages
                        ? 'opacity-50 cursor-not-allowed'
                        : 'hover:bg-gray-50'
                      }`}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default Templates;

