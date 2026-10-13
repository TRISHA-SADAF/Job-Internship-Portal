
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
    match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
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
    qualification: String,
    institute: String,
    year: Number,
    percentage: Number
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
  resumeAnalysis: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  companyName: {
    type: String,
    trim: true,
    maxlength: 150
  },
  recruiterVerification: {
    type: String,
    enum: ['pending', 'verified', 'rejected'],
    default: 'pending'
  },
  accountStatus: {
    type: String,
    enum: ['active', 'suspended'],
    default: 'active'
  }
}, {
  timestamps: true,
  versionKey: false
});

userSchema.index({ role: 1, accountStatus: 1 });

module.exports = mongoose.model('User', userSchema);
