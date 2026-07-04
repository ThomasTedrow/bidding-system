const dns = require('dns');
const mongoose = require('mongoose');

/**
 * Node on Windows may fail SRV lookups (querySrv ECONNREFUSED) with some ISP DNS.
 * Override with MONGODB_DNS_SERVERS=8.8.8.8,1.1.1.1 or use a standard mongodb:// URI.
 */
function configureMongoDns() {
    const raw = process.env.MONGODB_DNS_SERVERS?.trim();
    const servers = raw
        ? raw.split(',').map((s) => s.trim()).filter(Boolean)
        : ['8.8.8.8', '1.1.1.1'];
    if (servers.length > 0) {
        dns.setServers(servers);
    }
}

/**
 * Connect to MongoDB database
 */
const connectDB = async () => {
    try {
        const mongoURI = process.env.MONGODB_URI;
        if (!mongoURI?.trim()) {
            throw new Error('MONGODB_URI is not set');
        }

        configureMongoDns();
        const conn = await mongoose.connect(mongoURI);

        console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
        console.log(`✅ Database: ${conn.connection.name}`);
        
        return conn;
    } catch (error) {
        console.error('❌ MongoDB connection error:', error.message);
        process.exit(1);
    }
};

/**
 * Disconnect from MongoDB
 */
const disconnectDB = async () => {
    try {
        await mongoose.disconnect();
        console.log('✅ MongoDB Disconnected');
    } catch (error) {
        console.error('❌ MongoDB disconnection error:', error.message);
    }
};

module.exports = {
    connectDB,
    disconnectDB
};

