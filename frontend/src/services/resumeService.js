import { API_BASE_URL, buildAuthHeaders, fetchJsonSuccess } from './api';

export async function getTemplatesList(token, limit = 100) {
  return fetchJsonSuccess(`/templates?limit=${limit}`, { token });
}

/**
 * Admin resume generator: returns raw Response (blob body) for download handling.
 */
export async function postGenerateResume(formData, token) {
  const headers = { ...buildAuthHeaders(token) };
  delete headers['Content-Type'];
  const response = await fetch(`${API_BASE_URL}/generate-resume`, {
    method: 'POST',
    headers,
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || errorData.error || 'Failed to generate resume');
  }

  return response;
}
