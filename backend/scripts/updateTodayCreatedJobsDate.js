require('dotenv').config();
const { connectDB, disconnectDB } = require('../config/database');
const Job = require('../models/Job');

function getDayBounds(date = new Date()) {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);

    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    return { start, end };
}

function isSameDay(dateA, dateB) {
    if (!dateA || !dateB) return false;

    return (
        dateA.getFullYear() === dateB.getFullYear() &&
        dateA.getMonth() === dateB.getMonth() &&
        dateA.getDate() === dateB.getDate()
    );
}

async function updateTodayCreatedJobsDate() {
    const now = new Date();
    const { start, end } = getDayBounds(now);

    try {
        console.log('🔄 Connecting to database...');
        await connectDB();

        console.log(
            `🔎 Looking for jobs created today (${start.toISOString()} to ${end.toISOString()})...`
        );

        const jobsCreatedToday = await Job.find({
            createdAt: { $gte: start, $lt: end }
        }).select('_id JobId JobTitle CompanyName Date createdAt');

        if (jobsCreatedToday.length === 0) {
            console.log('ℹ️ No jobs found with createdAt set to today.');
            return;
        }

        let updatedCount = 0;
        let skippedCount = 0;

        for (const job of jobsCreatedToday) {
            if (isSameDay(job.Date, now)) {
                skippedCount += 1;
                continue;
            }

            job.Date = now;
            await job.save();
            updatedCount += 1;
        }

        console.log(`✅ Jobs created today: ${jobsCreatedToday.length}`);
        console.log(`✏️ Updated Date field: ${updatedCount}`);
        console.log(`⏭️ Already on today (skipped): ${skippedCount}`);
    } catch (error) {
        console.error('❌ Script failed:', error.message);
        throw error;
    } finally {
        await disconnectDB();
    }
}

console.log('🚀 Starting update script for jobs created today...\n');
updateTodayCreatedJobsDate()
    .then(() => {
        console.log('\n✅ Update script completed successfully!');
        process.exit(0);
    })
    .catch(() => {
        process.exit(1);
    });
