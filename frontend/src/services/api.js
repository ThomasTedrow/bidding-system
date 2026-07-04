export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';

export function buildAuthHeaders(token) {
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

function buildUrl(path) {
  if (path.startsWith('http')) return path;
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${p}`;
}

/**
 * JSON API request. Omit Content-Type for FormData (browser sets multipart boundary).
 */
export async function fetchJson(path, options = {}) {
  const { token, headers: userHeaders = {}, ...fetchOptions } = options;
  const headers = {
    ...userHeaders,
    ...buildAuthHeaders(token),
  };

  if (fetchOptions.body && !(fetchOptions.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  if (fetchOptions.body instanceof FormData) {
    delete headers['Content-Type'];
  }

  const response = await fetch(buildUrl(path), { ...fetchOptions, headers });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const msg = data.message || data.error || response.statusText || 'Request failed';
    throw new Error(msg);
  }

  return data;
}

/** Same as fetchJson, but throws if body has success: false */
export async function fetchJsonSuccess(path, options = {}) {
  const data = await fetchJson(path, options);
  if (data && data.success === false) {
    throw new Error(data.message || data.error || 'Request failed');
  }
  return data;
}
