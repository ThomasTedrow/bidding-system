const mongoose = require('mongoose');

const bidStatusSchema = new mongoose.Schema({
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
    Note: {
        type: String,
        default: null
    },
    Screenshots: {
        type: [String],
        default: []
    },
    AppliedDate: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true // Adds createdAt and updatedAt automatically
});

// Index for better query performance
bidStatusSchema.index({ jobId: 1, bidderId: 1, profileId: 1 }, { unique: true });
bidStatusSchema.index({ bidderId: 1, profileId: 1 });
bidStatusSchema.index({ jobId: 1 });

const BidStatus = mongoose.model('BidStatus', bidStatusSchema);

module.exports = BidStatus;

