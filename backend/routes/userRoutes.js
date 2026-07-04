const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware');
const {
    getUsers,
    getBidders,
    createUser,
    updateUser,
    toggleActive,
    deleteUser
} = require('../controllers/userController');

router.use(authenticate);

// Get all users
router.get('/users', getUsers);

// Get all bidders
router.get('/bidders', getBidders);

// Create a new user
router.post('/users', createUser);

// Update a user
router.put('/users/:id', updateUser);

// Toggle user active status
router.put('/users/:id/toggle-active', toggleActive);

// Delete a user
router.delete('/users/:id', deleteUser);

module.exports = router;

