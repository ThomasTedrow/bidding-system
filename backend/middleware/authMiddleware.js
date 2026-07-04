const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * Authentication middleware - verifies JWT token
 */
const authenticate = async (req, res, next) => {
    try {
        // Get token from header
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                error: 'No token provided',
                message: 'Authentication required'
            });
        }

        const token = authHeader.substring(7); // Remove 'Bearer ' prefix

        // Verify token
        const decoded = jwt.verify(
            token,
            process.env.JWT_SECRET || 'your-secret-key-change-in-production'
        );

        // Check if user still exists and is active
        const user = await User.findById(decoded.userId);

        if (!user) {
            return res.status(401).json({
                error: 'User not found',
                message: 'Token is invalid'
            });
        }

        if (!user.isActive) {
            return res.status(401).json({
                error: 'Account is deactivated',
                message: 'Your account has been deactivated'
            });
        }

        // Attach user info to request
        req.user = {
            userId: user._id,
            email: user.email,
            role: user.role
        };

        next();

    } catch (error) {
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                error: 'Invalid token',
                message: 'Token is invalid or expired'
            });
        }

        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                error: 'Token expired',
                message: 'Please login again'
            });
        }

        console.error('Auth middleware error:', error);
        res.status(500).json({
            error: 'Authentication failed',
            message: error.message
        });
    }
};

/**
 * Authorization middleware - checks if user has required role
 */
const authorize = (...roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                error: 'Authentication required'
            });
        }

        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
                error: 'Access denied',
                message: 'You do not have permission to access this resource'
            });
        }

        next();
    };
};

module.exports = {
    authenticate,
    authorize
};

