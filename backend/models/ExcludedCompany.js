const mongoose = require('mongoose');

const excludedCompanySchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    }
}, {
    timestamps: true
});

excludedCompanySchema.index({ name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });

const ExcludedCompany = mongoose.model('ExcludedCompany', excludedCompanySchema);

module.exports = ExcludedCompany;
