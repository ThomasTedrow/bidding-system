import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getTemplatesList, postGenerateResume } from '../services/resumeService';

function Resumes() {
  const { getToken } = useAuth();
  const [jobDescription, setJobDescription] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [template, setTemplate] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Fetch templates from database
  useEffect(() => {
    const fetchTemplates = async () => {
      setTemplatesLoading(true);
      try {
        const token = getToken();
        const data = await getTemplatesList(token, 100);
        if (data?.success && Array.isArray(data.templates)) {
          setTemplates(data.templates.filter(t => t.fileType === 'docx'));
        }
      } catch (err) {
        console.error('Error fetching templates:', err);
      } finally {
        setTemplatesLoading(false);
      }
    };
    fetchTemplates();
  }, []);

  const handleTemplateSelect = (e) => {
    const id = e.target.value || '';
    setSelectedTemplateId(id);
    setTemplate(null);
    setError('');
    setSuccess(id ? 'Template selected from database' : '');
  };

  const handleTemplateUpload = (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (file) {
      if (file.name.endsWith('.docx')) {
        setTemplate(file);
        setSelectedTemplateId('');
        setError('');
        setSuccess(`Template uploaded: ${file.name}`);
      } else {
        setError('Please upload a .docx file');
        setTemplate(null);
      }
    }
  };

  const handleGenerateResume = async () => {
    // Validation
    if (!jobDescription.trim()) {
      setError('Please enter a job description');
      return;
    }

    if (!selectedTemplateId && !template) {
      setError('Please select a template from the database or upload a .docx file');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const formData = new FormData();
      formData.append('jobDescription', jobDescription);
      if (selectedTemplateId) {
        formData.append('templateId', selectedTemplateId);
      } else {
        formData.append('template', template);
      }

      const token = getToken();
      const response = await postGenerateResume(formData, token);

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;

      const contentDisposition = response.headers.get('content-disposition');
      let filename = 'resume.docx';
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
        if (filenameMatch && filenameMatch[1]) {
          filename = filenameMatch[1].replace(/['"]/g, '');
        }
      }

      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      setSuccess('✅ Resume generated successfully! Download started.');

    } catch (err) {
      console.error('Error generating resume:', err);
      setError(err.message || 'Failed to generate resume. Please check if the backend is running.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full min-h-screen py-10 px-5 bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <header className="text-center mb-10 text-white">
          <h1 className="text-5xl font-bold mb-2.5 drop-shadow-[2px_2px_4px_rgba(0,0,0,0.2)]">
            🎯 AI Resume Generator
          </h1>
          <p className="text-xl opacity-95 font-light">
            Create tailored resumes powered by GPT-4
          </p>
        </header>

        {/* Error Alert */}
        {error && (
          <div className="p-4 px-5 rounded-xl mb-5 font-medium flex items-center gap-2.5 bg-red-50 border-2 border-red-200 text-red-600 animate-slideIn">
            ❌ {error}
          </div>
        )}

        {/* Success Alert */}
        {success && (
          <div className="p-4 px-5 rounded-xl mb-5 font-medium flex items-center gap-2.5 bg-green-50 border-2 border-green-200 text-green-600 animate-slideIn">
            {success}
          </div>
        )}

        {/* Main Grid Layout - 60/40 split */}
        <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-6 items-start">
          {/* Job Description Card - 60% width */}
          <div className="bg-white rounded-2xl p-6 shadow-[0_10px_40px_rgba(0,0,0,0.1)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_48px_rgba(0,0,0,0.15)]">
            <h2 className="text-gray-800 mb-4 text-xl flex items-center gap-2">
              📋 Job Description
            </h2>
            <textarea
              className="w-full p-3 border-2 border-gray-200 rounded-xl text-sm font-inherit resize-y transition-all duration-300 leading-relaxed focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10"
              placeholder="Paste the job description here..."
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              rows={10}
            />
            <div className="text-right mt-2 text-xs text-gray-600">
              {jobDescription.length} characters
            </div>
          </div>

          {/* Right Column - Resume Template + Generate Button - 40% width */}
          <div className="flex flex-col gap-6">
            {/* Resume Template Card */}
            <div className="bg-white rounded-2xl p-6 shadow-[0_10px_40px_rgba(0,0,0,0.1)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_48px_rgba(0,0,0,0.15)]">
              <h2 className="text-gray-800 mb-4 text-xl flex items-center gap-2">
                📄 Resume Template
              </h2>
              <div className="flex flex-col gap-4">
                {/* Option 1 (Priority): Select from database */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    1. Select from database <span className="text-indigo-600">(recommended)</span>
                  </label>
                  <select
                    value={selectedTemplateId}
                    onChange={handleTemplateSelect}
                    className="w-full px-3 py-2 border-2 border-gray-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                  >
                    <option value="">Choose a template...</option>
                    {templatesLoading ? (
                      <option disabled>Loading templates...</option>
                    ) : (
                      templates.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.profileName} {t.Legion ? `(${t.Legion})` : ''} — {t.fileName}
                        </option>
                      ))
                    )}
                  </select>
                </div>

                {/* Option 2: Upload from local */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    2. Or upload from local
                  </label>
                  <label
                    htmlFor="template-upload"
                    className="flex flex-col items-center justify-center gap-3 py-6 px-6 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer transition-all duration-300 bg-slate-50 text-gray-600 font-medium w-full hover:border-indigo-500 hover:bg-indigo-50 hover:text-indigo-500"
                  >
                    {template ? (
                      <>
                        <span className="text-3xl">✅</span>
                        <span className="text-sm text-center break-all">{template.name}</span>
                        <span className="text-xs text-gray-500">(clears database selection)</span>
                      </>
                    ) : (
                      <>
                        <span className="text-3xl">📎</span>
                        <span className="text-sm text-center">Click to upload .docx template</span>
                      </>
                    )}
                  </label>
                  <input
                    id="template-upload"
                    type="file"
                    accept=".docx"
                    onChange={handleTemplateUpload}
                    className="hidden"
                  />
                </div>
              </div>
            </div>

            {/* Generate Button Card */}
            <div className="bg-white rounded-2xl p-6 shadow-[0_10px_40px_rgba(0,0,0,0.1)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_48px_rgba(0,0,0,0.15)]">
              <h2 className="text-gray-800 mb-4 text-xl flex items-center gap-2">
                🚀 Generate
              </h2>
              <div className="flex flex-col items-center justify-center">
                <button
                  className={`w-full py-6 px-6 text-base font-semibold text-white border-none rounded-xl cursor-pointer transition-all duration-300 shadow-[0_4px_20px_rgba(102,126,234,0.4)] flex flex-col items-center justify-center gap-3 ${loading
                      ? 'bg-gradient-purple-light opacity-70 cursor-not-allowed'
                      : 'bg-gradient-purple hover:-translate-y-0.5 hover:shadow-[0_6px_30px_rgba(102,126,234,0.5)] active:translate-y-0'
                    }`}
                  onClick={handleGenerateResume}
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <span className="w-5 h-5 border-3 border-white/30 border-t-white rounded-full animate-spin"></span>
                      <span className="text-sm">Generating Resume...</span>
                    </>
                  ) : (
                    <>
                      <span className="text-3xl">⬇️</span>
                      <span className="text-center">Generate & Download Resume</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="text-center mt-10 text-white opacity-90 text-sm">
          <p>Powered by OpenAI GPT-4 • Optimized for ATS</p>
        </footer>
      </div>
    </div>
  );
}

export default Resumes;
