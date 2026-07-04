const express = require('express');
const router = express.Router();
const { login, getCurrentUser } = require('../controllers/authController');
const { authenticate } = require('../middleware/authMiddleware');

// Login route
router.post('/login', login);

// Get current user (protected route)
router.get('/me', authenticate, getCurrentUser);

module.exports = router;

