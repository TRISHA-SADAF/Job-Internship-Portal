
'use strict';

const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  job: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Job',
    required: true,
    index: true
  },
  resumePath: {
    type: String,
    maxlength: 500
  },
  coverLetter: {
    type: String,
    trim: true,
    maxlength: 3000
  },
  status: {
    type: String,
    enum: [
      'submitted',
      'under_review',
      'shortlisted',
      'interview',
      'selected',
      'rejected',
      'withdrawn'
    ],
    default: 'submitted'
  },
  feedback: {
    type: String,
    trim: true,
    maxlength: 500
  },
  extractedSkills: [{
    type: String,
    trim: true,
    maxlength: 60
  }],
  matchedSkills: [{
    type: String,
    trim: true,
    maxlength: 60
  }],
  matchScore: {
    type: Number,
    min: 0,
    max: 100,
    default: null
  },
  appliedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  versionKey: false
});

schema.index({ student: 1, job: 1 }, { unique: true });
schema.index({ job: 1, status: 1 });

module.exports = mongoose.model('Application', schema);
