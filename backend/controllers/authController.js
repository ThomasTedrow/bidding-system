const User = require('../../backend/models/User.js');
const jwt = require('jsonwebtoken');

/**
 * Login user
 */
const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        // Validation
        if (!email || !password) {
            return res.status(400).json({
                error: 'Email and password are required'
            });
        }

        // Find user by email
        const user = await User.findOne({ email: email.toLowerCase().trim() });

        if (!user) {
            return res.status(401).json({
                error: 'Invalid email or password'
            });
        }

        // Check if user is active
        if (user.isActive === false) {
            return res.status(401).json({
                error: 'Account is deactivated. Please contact administrator.'
            });
        }

        // Compare password
        const isPasswordValid = await user.comparePassword(password);

        if (!isPasswordValid) {
            return res.status(401).json({
                error: 'Invalid email or password'
            });
        }

        // Generate JWT token
        const token = jwt.sign(
            {
                userId: user._id,
                email: user.email,
                role: user.role
            },
            process.env.JWT_SECRET || 'your-secret-key-change-in-production',
            {
                expiresIn: '1d'
            }
        );

        res.json({
            success: true,
            message: 'Login successful',
            token,
            user: {
                id: user._id,
                name: user.Name,
                email: user.email,
                role: user.role
            }
        });

    } catch (error) {
        console.error('Error during login:', error);
        res.status(500).json({
            error: 'Failed to login',
            message: error.message
        });
    }
};

/**
 * Verify token and get current user
 */
const getCurrentUser = async (req, res) => {
    try {
        const user = await User.findById(req.user.userId)
            .select('Name email role isActive');

        if (!user) {
            return res.status(404).json({
                error: 'User not found'
            });
        }

        if (!user.isActive) {
            return res.status(401).json({
                error: 'Account is deactivated'
            });
        }

        res.json({
            success: true,
            user: {
                id: user._id,
                name: user.Name,
                email: user.email,
                role: user.role,
                isActive: user.isActive
            }
        });

    } catch (error) {
        console.error('Error getting current user:', error);
        res.status(500).json({
            error: 'Failed to get user',
            message: error.message
        });
    }
};

module.exports = {
    login,
    getCurrentUser
};

