require('dotenv').config();

const { connectDB, disconnectDB } = require('../config/database');
const User = require('../models/User');

async function main() {
    const email = process.argv[2];
    const password = process.argv[3];
    const name = process.argv[4] || 'Admin';

    if (!email || !password) {
        console.error('Usage: node scripts/createAdmin.js <email> <password> [name]');
        process.exit(1);
    }

    if (password.length < 6) {
        console.error('Password must be at least 6 characters.');
        process.exit(1);
    }

    await connectDB();

    const normalizedEmail = email.toLowerCase().trim();
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
        console.error(`User already exists: ${normalizedEmail}`);
        process.exit(1);
    }

    await User.create({
        Name: name.trim(),
        email: normalizedEmail,
        password,
        role: 'admin',
    });

    console.log(`Admin created: ${normalizedEmail}`);
    await disconnectDB();
}

main().catch(async (err) => {
    console.error(err.message);
    await disconnectDB();
    process.exit(1);
});
