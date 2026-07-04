import { fetchJsonSuccess } from './api';

export async function getBidders(token) {
  return fetchJsonSuccess('/bidders', { token });
}

export async function getTemplatesPage(token, { page, limit }) {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });
  return fetchJsonSuccess(`/templates?${params}`, { token });
}

export async function createTemplate(token, formData) {
  return fetchJsonSuccess('/templates', {
    method: 'POST',
    token,
    body: formData,
  });
}

export async function updateTemplateBidder(token, templateId, bidderId) {
  return fetchJsonSuccess(`/templates/${templateId}`, {
    method: 'PUT',
    token,
    body: JSON.stringify({ bidderId: bidderId || null }),
  });
}

export async function updateTemplate(token, templateId, formData) {
  return fetchJsonSuccess(`/templates/${templateId}`, {
    method: 'PUT',
    token,
    body: formData,
  });
}

export async function deleteTemplate(token, templateId) {
  return fetchJsonSuccess(`/templates/${templateId}`, {
    method: 'DELETE',
    token,
  });
}
