import { API_BASE_URL, fetchJsonSuccess } from './api';

export function getBidResumeDownloadUrl(jobId, profileId) {
  const params = new URLSearchParams();
  params.append('jobId', jobId);
  params.append('profileId', profileId);
  return `${API_BASE_URL}/bids/download-resume?${params.toString()}`;
}

export async function getBids(token, query = {}) {
  const params = new URLSearchParams();
  if (query.date) params.append('date', query.date);
  if (query.profileName && query.profileName.trim()) {
    params.append('profileName', query.profileName.trim());
  }
  if (query.search && query.search.trim()) {
    params.append('search', query.search.trim());
  }
  const q = params.toString();
  return fetchJsonSuccess(`/bids${q ? `?${q}` : ''}`, { token });
}

export async function generateBidResume(token, body) {
  return fetchJsonSuccess('/bids/generate-resume', {
    method: 'POST',
    token,
    body: JSON.stringify(body),
  });
}

export async function applyBid(token, formData) {
  return fetchJsonSuccess('/bids/apply', {
    method: 'POST',
    token,
    body: formData,
  });
}

export async function getBidProfiles(token) {
  return fetchJsonSuccess('/bids/profiles', { token });
}
