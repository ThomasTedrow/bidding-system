const express = require('express');
const path = require('path');
require('dotenv').config();

const { configureApp } = require('./config/app');
const { connectDB } = require('./config/database');
const authRoutes = require('./routes/authRoutes');
const resumeRoutes = require('./routes/resumeRoutes');
const jobRoutes = require('./routes/jobRoutes');
const templateRoutes = require('./routes/templateRoutes');
const userRoutes = require('./routes/userRoutes');
const bidRoutes = require('./routes/bidRoutes');
const excludedCompanyRoutes = require('./routes/excludedCompanyRoutes');
const { errorHandler } = require('./middleware/errorHandler');
const { healthCheck } = require('./controllers/resumeController');
const { webhookJobs } = require('./controllers/webhookController');

const app = express();
const PORT = process.env.PORT || 3001;

// Render/Proxy: trust X-Forwarded-* headers (fixes req.protocol behind HTTPS proxy)
app.set('trust proxy', 1);

// Connect to database
connectDB();

// Configure middleware
configureApp(app);

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api', resumeRoutes);
app.use('/api', jobRoutes);
app.use('/api', templateRoutes);
app.use('/api', userRoutes);
app.use('/api', bidRoutes);
app.use('/api', excludedCompanyRoutes);

// Webhooks (public)
app.post('/webhook/jobs', webhookJobs);
// Health check at root level
app.get('/health', healthCheck);

// Serve static files from the frontend build directory
const frontendBuildPath = path.join(__dirname, 'public');
app.use(express.static(frontendBuildPath));

// Serve React app for all non-API routes (SPA routing)
app.get('*', (req, res, next) => {
  // Skip API routes and health check
  if (
    req.path.startsWith('/api') ||
    req.path === '/health' ||
    // Never serve SPA HTML for uploaded files
    req.path.startsWith('/uploads')
  ) {
    return res.status(404).json({ error: 'Not found' });
  }
  // Serve index.html for SPA routing
  const indexPath = path.join(frontendBuildPath, 'index.html');
  res.sendFile(indexPath, (err) => {
    if (err) {
      // If index.html doesn't exist, pass to error handler
      next(err);
    }
  });
});

// Error handling middleware (must be last)
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  console.log(`✅ Resume Generator API running on http://localhost:${PORT}`);
  console.log(`✅ Health check: http://localhost:${PORT}/health`);
  console.log(`✅ Generate resume: http://localhost:${PORT}/api/generate-resume`);
});
