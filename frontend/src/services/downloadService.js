import { buildAuthHeaders } from './api';

function parseContentDispositionFilename(contentDisposition) {
  if (!contentDisposition) return null;

  // Handles: filename="x.docx" and filename=x.docx
  const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/i);
  if (!filenameMatch || !filenameMatch[1]) return null;

  return filenameMatch[1].replace(/['"]/g, '').trim() || null;
}

function sanitizeFilename(filename, fallback = 'download') {
  const name = (filename || '').trim() || fallback;

  // Windows-illegal characters + control chars -> underscore
  const replaced = name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');

  // Windows also disallows trailing spaces/dots
  const trimmed = replaced.replace(/[ .]+$/g, '').trim();

  return trimmed || fallback;
}

function ensureExtension(filename, forcedExtension) {
  const ext = forcedExtension.startsWith('.') ? forcedExtension : `.${forcedExtension}`;
  const lower = filename.toLowerCase();
  const lowerExt = ext.toLowerCase();

  if (lower.endsWith(lowerExt)) return filename;

  // If there's an existing extension, replace it; otherwise append
  if (filename.includes('.') && !filename.endsWith('.')) {
    return filename.replace(/\.[^.]+$/, ext);
  }
  return `${filename}${ext}`;
}

function triggerBrowserDownload(blob, filename) {
  const urlBlob = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = urlBlob;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(urlBlob);
  document.body.removeChild(a);
}

/**
 * Download a file via fetch() and save it with a safe filename.
 *
 * - Uses Content-Disposition filename when present (backend must expose it via CORS)
 * - Supports optional Bearer auth token
 * - Supports forcing an extension (e.g. ".docx")
 */
export async function downloadFile({
  url,
  token,
  defaultFilename = 'download',
  forceExtension,
} = {}) {
  if (!url) throw new Error('Missing download URL');

  const headers = { ...buildAuthHeaders(token) };

  const response = await fetch(url, { headers });

  if (!response.ok) {
    // Prefer server message when available
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || errorData.error || 'Failed to download file');
  }

  const contentDisposition = response.headers.get('Content-Disposition');
  const headerFilename = parseContentDispositionFilename(contentDisposition);

  let filename = sanitizeFilename(headerFilename, defaultFilename);
  if (forceExtension) filename = ensureExtension(filename, forceExtension);

  const blob = await response.blob();
  triggerBrowserDownload(blob, filename);
}
