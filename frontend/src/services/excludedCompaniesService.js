import { fetchJsonSuccess } from './api';

export function getDefaultReportMonths() {
  const now = new Date();
  const currentMonth = formatMonth(now);
  const previousDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const previousMonth = formatMonth(previousDate);
  return { startMonth: previousMonth, endMonth: currentMonth };
}

function formatMonth(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function normalizePattern(name) {
  return (name || '').toString().trim().toLowerCase();
}

export function isCompanyExcluded(companyName, excludedCompanies) {
  const company = normalizePattern(companyName);
  if (!company) return false;

  const patterns = (excludedCompanies || [])
    .map((item) => normalizePattern(item.name))
    .filter(Boolean);

  return patterns.some(
    (pattern) => company.startsWith(pattern) || company.includes(pattern)
  );
}

export async function getCompanyJobReport(token, { startMonth, endMonth }) {
  const params = new URLSearchParams();
  if (startMonth) params.set('startMonth', startMonth);
  if (endMonth) params.set('endMonth', endMonth);
  const query = params.toString();
  return fetchJsonSuccess(`/companies/job-report${query ? `?${query}` : ''}`, {
    token,
    cache: 'no-store',
  });
}

export async function getExcludedCompanies(token) {
  return fetchJsonSuccess('/excluded-companies', { token });
}

export async function addExcludedCompany(token, name) {
  return fetchJsonSuccess('/excluded-companies', {
    method: 'POST',
    token,
    body: JSON.stringify({ name }),
  });
}

export async function deleteExcludedCompany(token, companyId) {
  return fetchJsonSuccess(`/excluded-companies/${companyId}`, {
    method: 'DELETE',
    token,
  });
}
