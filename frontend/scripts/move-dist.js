import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const src = path.join(__dirname, '../dist');
const dest = path.join(__dirname, '../../backend/public');

// Remove destination if it exists
if (fs.existsSync(dest)) {
  fs.rmSync(dest, { recursive: true, force: true });
}

// Create parent directory if it doesn't exist
const destParent = path.dirname(dest);
if (!fs.existsSync(destParent)) {
  fs.mkdirSync(destParent, { recursive: true });
}

// Move dist to backend/public
if (fs.existsSync(src)) {
  fs.renameSync(src, dest);
  console.log('✅ Frontend build moved to backend/public');
} else {
  console.error('❌ Error: dist folder not found. Build may have failed.');
  process.exit(1);
}
