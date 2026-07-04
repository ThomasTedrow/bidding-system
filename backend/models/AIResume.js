const mongoose = require('mongoose');

const aiResumeSchema = new mongoose.Schema({
    jobId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Job',
        required: true
    },
    bidderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    profileId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Template',
        required: true
    },
    GeneratedResume: {
        type: String,
        default: null,
        trim: true
    }
}, {
    timestamps: true // Adds createdAt and updatedAt automatically
});

// Index for better query performance and uniqueness
aiResumeSchema.index({ jobId: 1, bidderId: 1, profileId: 1 }, { unique: true });
aiResumeSchema.index({ bidderId: 1, profileId: 1 });
aiResumeSchema.index({ jobId: 1 });

const AIResume = mongoose.model('AIResume', aiResumeSchema);

module.exports = AIResume;

