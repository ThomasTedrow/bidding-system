const fs = require('fs');
const path = require('path');

function ensureDirSync(dirPath) {
  if (!dirPath) return;
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

// Default local data dir (keeps dev working on Windows/macOS/Linux)
// In Render, set DATA_DIR=/var/data
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'uploads');

// In Render, set these explicitly:
// TEMPLATE_UPLOAD_DIR=/var/data/template
// SCREENSHOT_UPLOAD_DIR=/var/data/screenshot
const TEMPLATE_DIR = process.env.TEMPLATE_UPLOAD_DIR || path.join(DATA_DIR, 'template');

// Optional: where to store transient uploaded templates for /generate-resume
const TEMP_UPLOAD_DIR = process.env.TEMP_UPLOAD_DIR || path.join(DATA_DIR, 'tmp');

// Where to store generated resume outputs (downloaded later)
const OUTPUTS_DIR = process.env.OUTPUTS_DIR || path.join(DATA_DIR, 'outputs');

// Screenshot public route (fixed). Files are served from SCREENSHOT_DIR only.
const SCREENSHOT_UPLOAD_DIR = process.env.SCREENSHOT_UPLOAD_DIR;

module.exports = {
  ensureDirSync,
  DATA_DIR,
  TEMPLATE_DIR,
  TEMP_UPLOAD_DIR,
  OUTPUTS_DIR,
  SCREENSHOT_UPLOAD_DIR
};

