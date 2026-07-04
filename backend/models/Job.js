const mongoose = require('mongoose');
const { LEGION_VALUES } = require('../constants');

const jobSchema = new mongoose.Schema({
    JobId: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    JobTitle: {
        type: String,
        required: true,
        trim: true
    },
    JobDescription: {
        type: String,
        required: true
    },
    CompanyName: {
        type: String,
        required: true,
        trim: true
    },
    ApplyLink: {
        type: String,
        required: true,
        trim: true
    },
    Date: {
        type: Date,
        required: true,
        default: Date.now
    },
    Source: {
        type: String,
        trim: true,
        default: null
    },
    Legion: {
        type: String,
        enum: LEGION_VALUES,
        trim: true,
        default: null
    },
    UserId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: false // Will be required when authentication is implemented
    },
    isActive: {
        type: Boolean,
        default: true
    },
    isClearance: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true // Adds createdAt and updatedAt automatically
});

// Index for better query performance
jobSchema.index({ UserId: 1, Date: -1 });
jobSchema.index({ JobId: 1 });

const Job = mongoose.model('Job', jobSchema);

module.exports = Job;

