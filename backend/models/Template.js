const mongoose = require('mongoose');
const { LEGION_VALUES } = require('../constants');

const templateSchema = new mongoose.Schema({
    profileName: {
        type: String,
        required: true,
        trim: true
    },
    templateUrl: {
        type: String,
        required: true,
        trim: true
    },
    fileName: {
        type: String,
        required: true,
        trim: true
    },
    fileType: {
        type: String,
        enum: ['pdf', 'docx', 'doc'],
        required: true
    },
    fileSize: {
        type: Number,
        required: true
    },
    bidderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    Legion: {
        type: String,
        enum: LEGION_VALUES,
        default: null,
        trim: true
    },
    companies: {
        type: [{
            name: String,
            period: String
        }],
        default: null
    }
}, {
    timestamps: true // Adds createdAt and updatedAt automatically
});

// Index for better query performance
templateSchema.index({ profileName: 1 });
templateSchema.index({ bidderId: 1 });

const Template = mongoose.model('Template', templateSchema);

module.exports = Template;

