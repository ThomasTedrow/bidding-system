const User = require('../models/User');

/**
 * Get all users
 */
const getUsers = async (req, res) => {
    try {
        const users = await User.find()
            .select('Name email role isActive')
            .sort({ createdAt: -1 })
            .lean();

        // Format response
        const formattedUsers = users.map(user => ({
            id: user._id,
            name: user.Name,
            email: user.email,
            role: user.role,
            isActive: user.isActive !== undefined ? user.isActive : true
        }));

        res.json({
            success: true,
            users: formattedUsers
        });

    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({
            error: 'Failed to fetch users',
            message: error.message
        });
    }
};

/**
 * Get all bidders (users with role 'bider' and active)
 */
const getBidders = async (req, res) => {
    try {
        const bidders = await User.find({
            role: 'bider',
            isActive: true
        })
            .select('Name email')
            .sort({ Name: 1 })
            .lean();

        // Format response
        const formattedBidders = bidders.map(bidder => ({
            id: bidder._id,
            name: bidder.Name,
            email: bidder.email
        }));

        res.json({
            success: true,
            bidders: formattedBidders
        });

    } catch (error) {
        console.error('Error fetching bidders:', error);
        res.status(500).json({
            error: 'Failed to fetch bidders',
            message: error.message
        });
    }
};

/**
 * Create a new user
 */
const createUser = async (req, res) => {
    try {
        const { Name, email, password, role } = req.body;

        // Validation
        if (!Name || !Name.trim()) {
            return res.status(400).json({
                error: 'Name is required'
            });
        }

        if (!email || !email.trim()) {
            return res.status(400).json({
                error: 'Email is required'
            });
        }

        if (!password || password.length < 6) {
            return res.status(400).json({
                error: 'Password is required and must be at least 6 characters'
            });
        }

        // Check if email already exists
        const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
        if (existingUser) {
            return res.status(400).json({
                error: 'Email already exists'
            });
        }

        // Validate role
        if (role && !['admin', 'bider'].includes(role)) {
            return res.status(400).json({
                error: 'Invalid role. Must be admin or bider'
            });
        }

        // Create user
        const user = new User({
            Name: Name.trim(),
            email: email.toLowerCase().trim(),
            password: password,
            role: role || 'bider',
            isActive: true
        });

        await user.save();

        res.status(201).json({
            success: true,
            message: 'User created successfully',
            user: {
                id: user._id,
                name: user.Name,
                email: user.email,
                role: user.role
            }
        });

    } catch (error) {
        console.error('Error creating user:', error);
        
        if (error.name === 'ValidationError') {
            return res.status(400).json({
                error: 'Validation error',
                message: error.message
            });
        }

        res.status(500).json({
            error: 'Failed to create user',
            message: error.message
        });
    }
};

/**
 * Update a user
 */
const updateUser = async (req, res) => {
    try {
        const { id } = req.params;
        const { Name, email, role } = req.body;

        const updateData = {};

        if (Name !== undefined) {
            if (!Name.trim()) {
                return res.status(400).json({
                    error: 'Name cannot be empty'
                });
            }
            updateData.Name = Name.trim();
        }

        if (email !== undefined) {
            if (!email.trim()) {
                return res.status(400).json({
                    error: 'Email cannot be empty'
                });
            }
            
            // Check if email is already taken by another user
            const existingUser = await User.findOne({ 
                email: email.toLowerCase().trim(),
                _id: { $ne: id }
            });
            
            if (existingUser) {
                return res.status(400).json({
                    error: 'Email already exists'
                });
            }
            
            updateData.email = email.toLowerCase().trim();
        }

        if (role !== undefined) {
            if (!['admin', 'bider'].includes(role)) {
                return res.status(400).json({
                    error: 'Invalid role. Must be admin or bider'
                });
            }
            updateData.role = role;
        }

        const user = await User.findByIdAndUpdate(
            id,
            { $set: updateData },
            { new: true, runValidators: true }
        );

        if (!user) {
            return res.status(404).json({
                error: 'User not found'
            });
        }

        res.json({
            success: true,
            message: 'User updated successfully',
            user: {
                id: user._id,
                name: user.Name,
                email: user.email,
                role: user.role
            }
        });

    } catch (error) {
        console.error('Error updating user:', error);
        
        if (error.name === 'ValidationError') {
            return res.status(400).json({
                error: 'Validation error',
                message: error.message
            });
        }

        res.status(500).json({
            error: 'Failed to update user',
            message: error.message
        });
    }
};

/**
 * Toggle user active status
 */
const toggleActive = async (req, res) => {
    try {
        const { id } = req.params;
        const { isActive } = req.body;

        if (typeof isActive !== 'boolean') {
            return res.status(400).json({
                error: 'isActive must be a boolean value'
            });
        }

        const user = await User.findByIdAndUpdate(
            id,
            { $set: { isActive } },
            { new: true }
        );

        if (!user) {
            return res.status(404).json({
                error: 'User not found'
            });
        }

        res.json({
            success: true,
            message: `User ${isActive ? 'activated' : 'deactivated'} successfully`,
            user: {
                id: user._id,
                name: user.Name,
                email: user.email,
                isActive: user.isActive
            }
        });

    } catch (error) {
        console.error('Error toggling user status:', error);
        res.status(500).json({
            error: 'Failed to update user status',
            message: error.message
        });
    }
};

/**
 * Delete a user
 */
const deleteUser = async (req, res) => {
    try {
        const { id } = req.params;

        const user = await User.findByIdAndDelete(id);

        if (!user) {
            return res.status(404).json({
                error: 'User not found'
            });
        }

        res.json({
            success: true,
            message: 'User deleted successfully'
        });

    } catch (error) {
        console.error('Error deleting user:', error);
        res.status(500).json({
            error: 'Failed to delete user',
            message: error.message
        });
    }
};

module.exports = {
    getUsers,
    getBidders,
    createUser,
    updateUser,
    toggleActive,
    deleteUser
};

