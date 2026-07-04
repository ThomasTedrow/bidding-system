const cors = require('cors');
const express = require('express');
const {
    ensureDirSync,
    SCREENSHOT_UPLOAD_DIR
} = require('./storage');

/**
 * Configure Express app middleware
 */
const configureApp = (app) => {
    // CORS configuration
    app.use(cors({
        exposedHeaders: ['Content-Disposition']
    }));

    // Body parsing middleware
    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Static file serving for screenshots
    ensureDirSync(SCREENSHOT_UPLOAD_DIR);
    const screenshotsStatic = express.static(SCREENSHOT_UPLOAD_DIR, {
        fallthrough: false,
        maxAge: '365d',
        immutable: true
    });
    app.use(SCREENSHOT_UPLOAD_DIR, screenshotsStatic);
};

module.exports = {
    configureApp
};

