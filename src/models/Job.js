
'use strict';

const mongoose = require('mongoose');

const jobSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    minlength: 2,
    maxlength: 150
  },
  description: {
    type: String,
    required: true,
    trim: true,
    minlength: 20,
    maxlength: 10000
  },
  companyName: {
    type: String,
    required: true,
    trim: true,
    maxlength: 150
  },
  recruiter: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  type: {
    type: String,
    enum: ['job', 'internship'],
    required: true
  },
  location: {
    type: String,
    required: true,
    trim: true,
    maxlength: 150
  },
  workMode: {
    type: String,
    enum: ['onsite', 'remote', 'hybrid'],
    default: 'onsite'
  },
  skillsRequired: [{
    type: String,
    trim: true,
    maxlength: 60
  }],
  experienceMin: {
    type: Number,
    min: 0,
    default: 0
  },
  fresherFriendly: {
    type: Boolean,
    default: true
  },
  salaryMin: {
    type: Number,
    min: 0
  },
  salaryMax: {
    type: Number,
    min: 0
  },
  stipend: {
    type: Number,
    min: 0
  },
  openings: {
    type: Number,
    min: 1,
    default: 1
  },
  deadline: {
    type: Date,
    required: [true, 'Application deadline is required.']
  },
  status: {
    type: String,
    enum: ['draft', 'published', 'closed'],
    default: 'published'
  },
  feedbackOptions: [{
    type: String,
    trim: true,
    maxlength: 250
  }]
}, {
  timestamps: true,
  versionKey: false
});

jobSchema.index({ status: 1, type: 1, createdAt: -1 });

jobSchema.index({ status: 1, deadline: 1 });

jobSchema.pre('validate', function () {
  if (
    this.salaryMin != null &&
    this.salaryMax != null &&
    this.salaryMax < this.salaryMin
  ) {
    this.invalidate(
      'salaryMax',
      'Maximum salary cannot be less than minimum salary.'
    );
  }
});

module.exports = mongoose.model('Job', jobSchema);
