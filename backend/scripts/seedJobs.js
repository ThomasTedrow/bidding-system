require('dotenv').config();
const { connectDB, disconnectDB } = require('../config/database');
const Job = require('../models/Job');
const { LEGION_VALUES } = require('../constants');

// Sample job data templates
const jobTitles = [
    'Senior JavaScript Engineer',
    'Full Stack Developer',
    'React Developer',
    'Node.js Backend Developer',
    'Frontend Engineer',
    'DevOps Engineer',
    'Python Developer',
    'Java Developer',
    'Software Architect',
    'Mobile App Developer',
    'UI/UX Designer',
    'Data Engineer',
    'Machine Learning Engineer',
    'Cloud Solutions Architect',
    'Security Engineer'
];

const companies = [
    'Ciklum',
    'Google',
    'Microsoft',
    'Amazon',
    'Meta',
    'Netflix',
    'Apple',
    'Uber',
    'Airbnb',
    'Spotify',
    'Twitter',
    'LinkedIn',
    'GitHub',
    'Salesforce',
    'Adobe'
];

const sources = [
    'LinkedIn',
    'Indeed',
    'Glassdoor',
    'Monster',
    'Company Website',
    'Referral',
    'Recruiter'
];

const legions = LEGION_VALUES;

const jobDescriptions = [
    'We are looking for an experienced developer to join our team. You will work on cutting-edge projects and collaborate with talented engineers.',
    'Join our dynamic team and help build innovative solutions. We offer competitive compensation and excellent benefits.',
    'We are seeking a skilled professional to contribute to our growing technology stack. Remote work options available.',
    'Looking for a passionate developer to help shape the future of our platform. Great opportunity for career growth.',
    'We need a talented engineer to work on exciting projects. You will have the opportunity to make a significant impact.'
];

/**
 * Generate a random job description
 */
function generateJobDescription() {
    return jobDescriptions[Math.floor(Math.random() * jobDescriptions.length)];
}

/**
 * Get today's date
 */
function getTodayDate() {
    return new Date();
}

/**
 * Generate a single job object
 */
function generateJob(index) {
    const title = jobTitles[Math.floor(Math.random() * jobTitles.length)];
    const company = companies[Math.floor(Math.random() * companies.length)];
    const source = sources[Math.floor(Math.random() * sources.length)];
    const legion = legions[Math.floor(Math.random() * legions.length)];
    
    return {
        JobId: `Job-${index}`,
        JobTitle: title,
        JobDescription: generateJobDescription(),
        CompanyName: company,
        ApplyLink: `https://example.com/jobs/${company.toLowerCase().replace(/\s+/g, '-')}-${index}`,
        Date: getTodayDate(),
        Source: source,
        Legion: legion
    };
}

/**
 * Get the next available JobId index
 */
async function getNextJobIdIndex() {
    try {
        const lastJob = await Job.findOne().sort({ JobId: -1 }).exec();
        if (!lastJob) {
            return 0;
        }
        // Extract number from JobId (e.g., "Job-42" -> 42)
        const match = lastJob.JobId.match(/Job-(\d+)/);
        if (match) {
            return parseInt(match[1], 10) + 1;
        }
        return 0;
    } catch (error) {
        console.warn('⚠️  Could not determine next JobId, starting from 0');
        return 0;
    }
}

/**
 * Clear all existing jobs from the database
 */
async function clearExistingJobs() {
    try {
        const result = await Job.deleteMany({});
        console.log(`🗑️  Cleared ${result.deletedCount} existing jobs from database.`);
        return result.deletedCount;
    } catch (error) {
        console.error('❌ Error clearing existing jobs:', error.message);
        throw error;
    }
}

/**
 * Seed the database with n jobs
 */
async function seedJobs(count = 10, clearFirst = false) {
    try {
        console.log('🔄 Connecting to database...');
        await connectDB();
        
        // Clear existing jobs if requested
        if (clearFirst) {
            await clearExistingJobs();
        }
        
        // Get starting index for JobId
        const startIndex = await getNextJobIdIndex();
        
        console.log(`🔄 Generating ${count} jobs (starting from Job-${startIndex})...`);
        const jobs = [];
        
        for (let i = 0; i < count; i++) {
            jobs.push(generateJob(startIndex + i));
        }
        
        console.log('🔄 Inserting jobs into database...');
        const result = await Job.insertMany(jobs, { ordered: false });
        
        console.log(`✅ Successfully inserted ${result.length} jobs!`);
        console.log('\n📋 Sample of inserted jobs:');
        result.slice(0, 5).forEach((job, index) => {
            console.log(`\n${index + 1}. ${job.JobTitle} at ${job.CompanyName}`);
            console.log(`   JobId: ${job.JobId}`);
            console.log(`   Source: ${job.Source}`);
            console.log(`   Legion: ${job.Legion}`);
            console.log(`   Date: ${job.Date.toISOString().split('T')[0]}`);
        });
        
        if (result.length > 5) {
            console.log(`\n... and ${result.length - 5} more jobs`);
        }
        
    } catch (error) {
        if (error.code === 11000) {
            console.error('❌ Error: Some jobs already exist (duplicate JobId).');
            console.error('   Use --clear flag to clear existing jobs first:');
            console.error('   Example: npm run seed:jobs -- --clear 20');
        } else {
            console.error('❌ Error seeding jobs:', error.message);
        }
        throw error;
    } finally {
        await disconnectDB();
    }
}

// Parse command line arguments
const args = process.argv.slice(2);
let jobCount = 10;
let clearFirst = false;

// Parse arguments
for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--clear' || arg === '-c') {
        clearFirst = true;
    } else if (!isNaN(parseInt(arg, 10))) {
        jobCount = parseInt(arg, 10);
    }
}

if (isNaN(jobCount) || jobCount <= 0) {
    console.error('❌ Error: Please provide a valid number of jobs to create.');
    console.error('\nUsage:');
    console.error('  node scripts/seedJobs.js [count] [--clear]');
    console.error('  npm run seed:jobs -- [count] [--clear]');
    console.error('\nOptions:');
    console.error('  count     Number of jobs to create (default: 10)');
    console.error('  --clear   Clear all existing jobs before seeding');
    console.error('\nExamples:');
    console.error('  node scripts/seedJobs.js 20');
    console.error('  node scripts/seedJobs.js 20 --clear');
    console.error('  npm run seed:jobs -- 50 --clear');
    process.exit(1);
}

if (clearFirst) {
    console.log('⚠️  WARNING: This will delete all existing jobs before seeding!\n');
}

console.log(`🚀 Starting seed script to create ${jobCount} jobs...`);
if (clearFirst) {
    console.log('🗑️  Existing jobs will be cleared first.\n');
} else {
    console.log('📝 New jobs will be appended to existing ones.\n');
}

seedJobs(jobCount, clearFirst)
    .then(() => {
        console.log('\n✅ Seed script completed successfully!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ Seed script failed:', error.message);
        process.exit(1);
    });
