
'use strict';

const express = require('express');
const router = express.Router();

const User = require('../models/User');
const Job = require('../models/Job');
const Application = require('../models/Application');
const env = require('../config/env');

const { requireAuth, allowRoles } = require('../middleware/auth');
const { safeUser, hashPassword } = require('../utils/helpers');

// Create the first admin account
router.post('/admin/bootstrap', async (req, res) => {
  if (
    !req.get('X-Admin-Bootstrap-Secret') ||
    req.get('X-Admin-Bootstrap-Secret') !== env.ADMIN_BOOTSTRAP_SECRET
  ) {
    return res.status(403).json({
      success: false,
      message: 'Valid X-Admin-Bootstrap-Secret header required.'
    });
  }

  const { name, email, password } = req.body || {};

  if (!name || !email ||
      typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({
      success: false,
      message: 'Name, email and password (8+ characters) are required.'
    });
  }

  if (await User.exists({ role: 'admin' })) {
    return res.status(409).json({
      success: false,
      message: 'An admin already exists. Remove/rotate bootstrap secret after setup.'
    });
  }

  const user = await User.create({
    name,
    email,
    passwordHash: hashPassword(password),
    role: 'admin',
    recruiterVerification: 'verified'
  });

  res.status(201).json({
    success: true,
    message: 'Admin account created. Remove bootstrap secret from future public deployments.',
    data: { user: safeUser(user) }
  });
});

// Admin dashboard
router.get('/admin/dashboard', requireAuth, allowRoles('admin'), async (req, res) => {
  const [
    users,
    students,
    recruiters,
    jobs,
    applications,
    pendingRecruiters
  ] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ role: 'student' }),
    User.countDocuments({ role: 'recruiter' }),
    Job.countDocuments(),
    Application.countDocuments(),
    User.countDocuments({
      role: 'recruiter',
      recruiterVerification: 'pending'
    })
  ]);

  res.json({
    success: true,
    data: {
      users,
      students,
      recruiters,
      jobs,
      applications,
      pendingRecruiters
    }
  });
});

// List users
router.get('/admin/users', requireAuth, allowRoles('admin'), async (_req, res) => {
  const users = await User.find()
    .sort({ createdAt: -1 })
    .limit(500);

  res.json({
    success: true,
    data: { users: users.map(safeUser) }
  });
});

// Verify a recruiter
router.put(
  '/admin/recruiters/:id/verification',
  requireAuth,
  allowRoles('admin'),
  async (req, res) => {
    if (!['verified', 'rejected', 'pending'].includes(req.body.status)) {
      return res.status(400).json({
        success: false,
        message: 'status must be verified, rejected, or pending.'
      });
    }

    const user = await User.findOne({
      _id: req.params.id,
      role: 'recruiter'
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Recruiter not found.'
      });
    }

    user.recruiterVerification = req.body.status;
    await user.save();

    res.json({
      success: true,
      message: 'Recruiter verification updated.',
      data: { user: safeUser(user) }
    });
  }
);

// Activate or suspend a user
router.put(
  '/admin/users/:id/status',
  requireAuth,
  allowRoles('admin'),
  async (req, res) => {
    if (!['active', 'suspended'].includes(req.body.status)) {
      return res.status(400).json({
        success: false,
        message: 'status must be active or suspended.'
      });
    }

    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found.'
      });
    }

    if (String(user._id) === String(req.user._id)) {
      return res.status(400).json({
        success: false,
        message: 'You cannot suspend your own admin account.'
      });
    }

    user.accountStatus = req.body.status;
    await user.save();

    res.json({
      success: true,
      message: 'User status updated.',
      data: { user: safeUser(user) }
    });
  }
);

// Analytics
router.get('/admin/analytics', requireAuth, allowRoles('admin'), async (_req, res) => {
  const [usersByRole, jobsByType, applicationsByStatus] =
    await Promise.all([
      User.aggregate([
        { $group: { _id: '$role', count: { $sum: 1 } } }
      ]),
      Job.aggregate([
        { $group: { _id: '$type', count: { $sum: 1 } } }
      ]),
      Application.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ])
    ]);

  res.json({
    success: true,
    data: {
      usersByRole,
      jobsByType,
      applicationsByStatus
    }
  });
});

module.exports = router;
