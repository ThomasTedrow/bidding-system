import { fetchJsonSuccess } from './api';

export async function getDashboardStats(token, { startDate, endDate } = {}) {
  const params = new URLSearchParams();
  if (startDate) params.append('startDate', startDate);
  if (endDate) params.append('endDate', endDate);
  const q = params.toString();
  return fetchJsonSuccess(`/bids/dashboard${q ? `?${q}` : ''}`, { token });
}
