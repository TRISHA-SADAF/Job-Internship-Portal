'use strict';

const express = require('express');
const router = express.Router();

const User = require('../models/User');
const env = require('../config/env');
const { authLimiter } = require('../config/security');
const { requireAuth } = require('../middleware/auth');
const {
  safeUser,
  hashPassword,
  verifyPassword,
  createToken,
  hashToken
} = require('../utils/helpers');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function bad(res, message, status = 400) {
  return res.status(status).json({ success: false, message });
}

router.post('/auth/register', authLimiter, async (req, res) => {
  const {
    name, email, password, role, phone, college, companyName
  } = req.body || {};

  const chosenRole = role || 'student';

  if (!['student', 'recruiter'].includes(chosenRole)) {
    return bad(res, 'Public registration is only available for student or recruiter roles.');
  }

  if (!name || String(name).trim().length < 2) {
    return bad(res, 'Please enter your full name (at least 2 characters).');
  }

  if (!email || !EMAIL_RE.test(String(email).trim())) {
    return bad(res, 'Please enter a valid email address.');
  }

  if (typeof password !== 'string' || password.length < 8) {
    return bad(res, 'Password must be at least 8 characters long.');
  }

  if (chosenRole === 'recruiter' && !String(companyName || '').trim()) {
    return bad(res, 'Company name is required for recruiter registration.');
  }

  const user = await User.create({
    name,
    email,
    passwordHash: hashPassword(password),
    role: chosenRole,
    phone,
    college: chosenRole === 'student' ? college : undefined,
    companyName: chosenRole === 'recruiter' ? companyName : undefined
  });

  res.status(201).json({
    success: true,
    message: user.role === 'recruiter'
      ? 'Account created successfully. Your recruiter verification is pending.'
      : 'Student registered successfully.',
    data: { user: safeUser(user) }
  });
});

router.post('/auth/login', authLimiter, async (req, res) => {
  const { email, password } = req.body || {};

  const user = await User.findOne({
    email: String(email || '').toLowerCase().trim()
  }).select('+passwordHash');

  if (!user || !verifyPassword(String(password || ''), user.passwordHash)) {
    return bad(res, 'Invalid email or password.', 401);
  }

  if (user.accountStatus !== 'active') {
    return bad(res, 'Your account has been suspended. Please contact the administrator.', 403);
  }

  await new Promise((resolve, reject) =>
    req.session.regenerate(err => (err ? reject(err) : resolve()))
  );

  req.session.userId = String(user._id);

  await new Promise((resolve, reject) =>
    req.session.save(err => (err ? reject(err) : resolve()))
  );

  res.json({
    success: true,
    message: 'Login successful.',
    data: { user: safeUser(user) }
  });
});

router.post('/auth/logout', (req, res) => {
  if (!req.session) {
    return res.json({ success: true, message: 'Logged out.' });
  }

  req.session.destroy(err => {
    if (err) {
      return bad(res, 'Could not log out.', 500);
    }

    res.clearCookie(env.SESSION_NAME);

    return res.json({ success: true, message: 'Logged out.' });
  });
});

router.get('/auth/me', requireAuth, (req, res) =>
  res.json({
    success: true,
    data: { user: safeUser(req.user) }
  })
);

router.put('/auth/password', requireAuth, authLimiter, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};

  if (typeof newPassword !== 'string' || newPassword.length < 8) {
    return bad(res, 'New password must be at least 8 characters long.');
  }

  const user = await User.findById(req.user._id).select('+passwordHash');

  if (!verifyPassword(String(currentPassword || ''), user.passwordHash)) {
    return bad(res, 'Current password is incorrect.');
  }

  user.passwordHash = hashPassword(newPassword);
  await user.save();

  res.json({ success: true, message: 'Password changed successfully.' });
});

router.post('/auth/forgot-password', authLimiter, async (req, res) => {
  const email = String(req.body.email || '').toLowerCase().trim();

  if (!EMAIL_RE.test(email)) {
    return bad(res, 'Please enter a valid email address.');
  }

  const user = await User.findOne({ email, accountStatus: 'active' });
  const out = {
    success: true,
    message: 'If an account exists for this email, a password reset link has been generated.'
  };

  if (user) {
    const { token, hash } = createToken();

    await User.updateOne(
      { _id: user._id },
      {
        resetTokenHash: hash,
        resetTokenExpires: new Date(Date.now() + env.RESET_TOKEN_TTL_MS)
      }
    );

    const link = `${env.FRONTEND_ORIGIN}/reset-password/${token}`;

    if (!env.IS_TEST) {
      console.log(`[Password reset] ${email} -> ${link}`);
    }

    if (!env.IS_PRODUCTION) {
      out.data = { devResetToken: token };
    }
  }

  res.json(out);
});

router.post('/auth/reset-password', authLimiter, async (req, res) => {
  const { token, password } = req.body || {};

  if (typeof password !== 'string' || password.length < 8) {
    return bad(res, 'Password must be at least 8 characters long.');
  }

  if (!token) {
    return bad(res, 'Reset token is missing.');
  }

  const user = await User.findOne({
    resetTokenHash: hashToken(token),
    resetTokenExpires: { $gt: new Date() }
  }).select('+resetTokenHash +resetTokenExpires');

  if (!user) {
    return bad(res, 'This reset link is invalid or has expired. Please request a new one.');
  }

  user.passwordHash = hashPassword(password);
  user.resetTokenHash = undefined;
  user.resetTokenExpires = undefined;
  await user.save();

  res.json({
    success: true,
    message: 'Password reset successful. You can log in now.'
  });
});

module.exports = router;
