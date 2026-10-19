'use strict';

const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  type: {
    type: String,
    enum: [
      'application_update',
      'deadline_reminder',
      'system'
    ],
    default: 'system'
  },
  message: {
    type: String,
    required: true,
    trim: true,
    maxlength: 500
  },
  relatedJob: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Job'
  },
  relatedApplication: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Application'
  },
  read: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true,
  versionKey: false
});

schema.index({ user: 1, read: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', schema);
