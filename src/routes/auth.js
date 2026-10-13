
'use strict';

const express = require('express');
const router = express.Router();

const User = require('../models/User');
const env = require('../config/env');
const { requireAuth } = require('../middleware/auth');
const {
  safeUser,
  hashPassword,
  verifyPassword
} = require('../utils/helpers');

router.post('/auth/register', async (req, res) => {
  const {
    name, email, password, role, phone, college, companyName
  } = req.body || {};

  if (!name || !email ||
      typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({
      success: false,
      message: 'Name, valid email, and password of at least 8 characters are required.'
    });
  }

  if (role && !['student', 'recruiter'].includes(role)) {
    return res.status(400).json({
      success: false,
      message: 'Public registration is only available for student or recruiter roles.'
    });
  }

  const user = await User.create({
    name,
    email,
    passwordHash: hashPassword(password),
    role: role || 'student',
    phone,
    college,
    companyName,
    recruiterVerification:
      (role || 'student') === 'recruiter' ? 'pending' : undefined
  });

  res.status(201).json({
    success: true,
    message: user.role === 'recruiter'
      ? 'Account created successfully. Recruiter verification is pending.'
      : 'Student registered successfully.',
    data: { user: safeUser(user) }
  });
});

router.post('/auth/login', async (req, res) => {
  const { email, password } = req.body || {};

  const user = await User.findOne({
    email: String(email || '').toLowerCase().trim()
  }).select('+passwordHash');

  if (
    !user ||
    !verifyPassword(String(password || ''), user.passwordHash) ||
    user.accountStatus !== 'active'
  ) {
    return res.status(401).json({
      success: false,
      message: 'Invalid email or password, or account is inactive.'
    });
  }

  req.session.userId = String(user._id);

  res.json({
    success: true,
    message: 'Login successful.',
    data: { user: safeUser(user) }
  });
});

router.post('/auth/logout', (req, res) =>
  req.session.destroy(err => {
    if (err) {
      return res.status(500).json({
        success: false,
        message: 'Could not log out.'
      });
    }

    res.clearCookie(env.SESSION_NAME);

    return res.json({
      success: true,
      message: 'Logged out.'
    });
  })
);

router.get('/auth/me', requireAuth, (req, res) =>
  res.json({
    success: true,
    data: { user: safeUser(req.user) }
  })
);

module.exports = router;
