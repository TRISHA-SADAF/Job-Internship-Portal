'use strict';

const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    minlength: 2,
    maxlength: 100
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    maxlength: 254,
    match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please enter a valid email address.']
  },
  passwordHash: {
    type: String,
    required: true,
    select: false
  },
  role: {
    type: String,
    enum: ['student', 'recruiter', 'admin'],
    default: 'student',
    required: true
  },
  phone: {
    type: String,
    trim: true,
    maxlength: 20
  },
  college: {
    type: String,
    trim: true,
    maxlength: 150
  },
  education: [{
    _id: false,
    qualification: { type: String, trim: true, maxlength: 100 },
    institute: { type: String, trim: true, maxlength: 150 },
    year: { type: Number, min: 1950, max: 2100 },
    percentage: { type: Number, min: 0, max: 100 }
  }],
  skills: [{
    type: String,
    trim: true,
    maxlength: 60
  }],
  resumePath: {
    type: String,
    maxlength: 500
  },
  resumeOriginalName: {
    type: String,
    maxlength: 255
  },
  resumeAnalysis: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  savedJobs: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Job'
  }],

  companyName: {
    type: String,
    trim: true,
    maxlength: 150
  },
  companyWebsite: { type: String, trim: true, maxlength: 200 },
  companyDescription: { type: String, trim: true, maxlength: 2000 },
  industry: { type: String, trim: true, maxlength: 100 },
  companySize: { type: String, trim: true, maxlength: 50 },
  companyLocation: { type: String, trim: true, maxlength: 150 },

  recruiterVerification: {
    type: String,
    enum: ['pending', 'verified', 'rejected'],
    default: function () {
      return this.role === 'recruiter' ? 'pending' : undefined;
    }
  },
  verificationMessage: { type: String, trim: true, maxlength: 1000 },
  verificationDocumentPath: { type: String, maxlength: 500 },
  verificationDocumentName: { type: String, maxlength: 255 },
  verificationRequestedAt: Date,
  verificationReviewedAt: Date,
  verificationRemark: { type: String, trim: true, maxlength: 500 },

  accountStatus: {
    type: String,
    enum: ['active', 'suspended'],
    default: 'active'
  },

  resetTokenHash: { type: String, select: false },
  resetTokenExpires: { type: Date, select: false }
}, {
  timestamps: true,
  versionKey: false
});

userSchema.index({ role: 1, accountStatus: 1 });

module.exports = mongoose.model('User', userSchema);
