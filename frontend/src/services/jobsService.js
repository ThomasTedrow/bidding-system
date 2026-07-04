import { fetchJsonSuccess } from './api';

export async function getJobsByDate(token, { date, legion } = {}) {
  const params = new URLSearchParams();
  if (date) params.append('date', date);
  if (legion) params.append('legion', legion);
  const q = params.toString();
  return fetchJsonSuccess(`/jobs${q ? `?${q}` : ''}`, { token });
}

export async function getJobById(token, id) {
  return fetchJsonSuccess(`/jobs/${id}`, { token });
}

export async function createJob(token, body) {
  return fetchJsonSuccess('/jobs', {
    method: 'POST',
    token,
    body: JSON.stringify(body),
  });
}

export async function updateJob(token, id, body) {
  return fetchJsonSuccess(`/jobs/${id}`, {
    method: 'PUT',
    token,
    body: JSON.stringify(body),
  });
}

export async function toggleJobStatus(token, jobId) {
  return fetchJsonSuccess(`/jobs/${jobId}/toggle-status`, {
    method: 'PATCH',
    token,
  });
}
