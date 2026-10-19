'use strict';

const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

const User = require('../models/User');
const Job = require('../models/Job');
const Application = require('../models/Application');
const env = require('../config/env');

const { requireAuth, allowRoles } = require('../middleware/auth');
const {
  safeUser,
  hashPassword,
  escapeRegex,
  parsePagination,
  paginationMeta
} = require('../utils/helpers');
const { notify } = require('../services/notificationService');
const { sendStoredFile } = require('../utils/files');
const { deleteUserCascade } = require('../services/accountService');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const adminOnly = [requireAuth, allowRoles('admin')];

function bad(res, message, status = 400) {
  return res.status(status).json({ success: false, message });
}

router.post('/admin/bootstrap', async (req, res) => {
  if (
    !req.get('X-Admin-Bootstrap-Secret') ||
    req.get('X-Admin-Bootstrap-Secret') !== env.ADMIN_BOOTSTRAP_SECRET
  ) {
    return bad(res, 'Valid X-Admin-Bootstrap-Secret header required.', 403);
  }

  const { name, email, password } = req.body || {};

  if (!name || !email || typeof password !== 'string' || password.length < 8) {
    return bad(res, 'Name, email and password (8+ characters) are required.');
  }

  if (await User.exists({ role: 'admin' })) {
    return bad(res, 'An admin already exists. Remove/rotate bootstrap secret after setup.', 409);
  }

  const user = await User.create({
    name,
    email,
    passwordHash: hashPassword(password),
    role: 'admin'
  });

  res.status(201).json({
    success: true,
    message: 'Admin account created. Remove bootstrap secret from future public deployments.',
    data: { user: safeUser(user) }
  });
});

router.get('/admin/dashboard', ...adminOnly, async (_req, res) => {
  const now = new Date();

  const [
    users,
    students,
    recruiters,
    jobs,
    activeJobs,
    applications,
    pendingRecruiters,
    recentUsers,
    recentApplications
  ] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ role: 'student' }),
    User.countDocuments({ role: 'recruiter' }),
    Job.countDocuments(),
    Job.countDocuments({ status: 'published', deadline: { $gte: now } }),
    Application.countDocuments(),
    User.countDocuments({ role: 'recruiter', recruiterVerification: 'pending' }),
    User.find().sort({ createdAt: -1 }).limit(5),
    Application.find()
      .populate('student', 'name')
      .populate('job', 'title companyName')
      .sort({ appliedAt: -1 })
      .limit(5)
  ]);

  res.json({
    success: true,
    data: {
      users,
      students,
      recruiters,
      jobs,
      activeJobs,
      applications,
      pendingRecruiters,
      recentUsers: recentUsers.map(u => safeUser(u)),
      recentApplications
    }
  });
});

router.get('/admin/users', ...adminOnly, async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 20, maxLimit: 100 });
  const filter = {};

  if (['student', 'recruiter', 'admin'].includes(req.query.role)) {
    filter.role = req.query.role;
  }

  if (['active', 'suspended'].includes(req.query.status)) {
    filter.accountStatus = req.query.status;
  }

  if (['pending', 'verified', 'rejected'].includes(req.query.verification)) {
    filter.recruiterVerification = req.query.verification;
    filter.role = 'recruiter';
  }

  if (req.query.q && String(req.query.q).trim()) {
    const rx = new RegExp(escapeRegex(String(req.query.q).trim()), 'i');
    filter.$or = [{ name: rx }, { email: rx }, { companyName: rx }];
  }

  const [users, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    User.countDocuments(filter)
  ]);

  res.json({
    success: true,
    data: {
      users: users.map(u => safeUser(u)),
      pagination: paginationMeta(page, limit, total)
    }
  });
});

router.put('/admin/recruiters/:id/verification', ...adminOnly, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return bad(res, 'Invalid id.');

  const { status } = req.body || {};

  if (!['verified', 'rejected', 'pending'].includes(status)) {
    return bad(res, 'status must be verified, rejected, or pending.');
  }

  const remark = String((req.body && req.body.remark) || '').trim().slice(0, 500);

  if (status === 'rejected' && !remark) {
    return bad(res, 'Please give a short reason for rejecting this recruiter.');
  }

  const user = await User.findOne({ _id: req.params.id, role: 'recruiter' });

  if (!user) return bad(res, 'Recruiter not found.', 404);

  user.recruiterVerification = status;
  user.verificationReviewedAt = new Date();
  user.verificationRemark = status === 'verified' ? undefined : (remark || undefined);
  await user.save();

  let closedJobs = 0;

  if (status !== 'verified') {
    const result = await Job.updateMany(
      { recruiter: user._id, status: 'published' },
      { status: 'closed' }
    );
    closedJobs = result.modifiedCount || 0;
  }

  await notify(
    user._id,
    status === 'verified'
      ? 'Congratulations! Your recruiter account has been verified. You can now post jobs and internships.'
      : status === 'rejected'
        ? `Your recruiter verification was rejected. Reason: ${remark}`
        : 'Your recruiter verification status was set back to pending.'
  );

  res.json({
    success: true,
    message: `Recruiter ${status}.` + (closedJobs ? ` ${closedJobs} live posting(s) were closed.` : ''),
    data: { user: safeUser(user) }
  });
});

router.get('/admin/recruiters/:id/document', ...adminOnly, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return bad(res, 'Invalid id.');

  const user = await User.findOne({ _id: req.params.id, role: 'recruiter' });

  if (!user) return bad(res, 'Recruiter not found.', 404);

  return sendStoredFile(res, user.verificationDocumentPath, user.verificationDocumentName);
});

router.put('/admin/users/:id/status', ...adminOnly, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return bad(res, 'Invalid id.');

  if (!['active', 'suspended'].includes((req.body || {}).status)) {
    return bad(res, 'status must be active or suspended.');
  }

  const user = await User.findById(req.params.id);

  if (!user) return bad(res, 'User not found.', 404);

  if (String(user._id) === String(req.user._id)) {
    return bad(res, 'You cannot suspend your own admin account.');
  }

  user.accountStatus = req.body.status;
  await user.save();

  res.json({
    success: true,
    message: user.accountStatus === 'active'
      ? 'User account activated.'
      : 'User account suspended.',
    data: { user: safeUser(user) }
  });
});

router.post('/admin/users', ...adminOnly, async (req, res) => {
  const b = req.body || {};
  const role = b.role || 'student';

  if (!['student', 'recruiter', 'admin'].includes(role)) {
    return bad(res, 'Role must be student, recruiter or admin.');
  }

  if (!b.name || String(b.name).trim().length < 2) {
    return bad(res, 'Please enter the full name (at least 2 characters).');
  }

  if (!b.email || !EMAIL_RE.test(String(b.email).trim())) {
    return bad(res, 'Please enter a valid email address.');
  }

  if (typeof b.password !== 'string' || b.password.length < 8) {
    return bad(res, 'Password must be at least 8 characters long.');
  }

  if (role === 'recruiter' && !String(b.companyName || '').trim()) {
    return bad(res, 'Company name is required for a recruiter.');
  }

  const user = await User.create({
    name: b.name,
    email: b.email,
    passwordHash: hashPassword(b.password),
    role,
    phone: b.phone,
    college: role === 'student' ? b.college : undefined,
    companyName: role === 'recruiter' ? b.companyName : undefined,
    recruiterVerification: role === 'recruiter'
      ? (['pending', 'verified', 'rejected'].includes(b.recruiterVerification)
        ? b.recruiterVerification
        : 'verified')
      : undefined
  });

  res.status(201).json({
    success: true,
    message: `${role[0].toUpperCase()}${role.slice(1)} account created.`,
    data: { user: safeUser(user) }
  });
});

router.get('/admin/users/:id', ...adminOnly, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return bad(res, 'Invalid id.');

  const user = await User.findById(req.params.id);

  if (!user) return bad(res, 'User not found.', 404);

  const [applications, jobs] = await Promise.all([
    Application.countDocuments(user.role === 'student' ? { student: user._id } : { _id: null }),
    Job.countDocuments(user.role === 'recruiter' ? { recruiter: user._id } : { _id: null })
  ]);

  res.json({ success: true, data: { user: safeUser(user), applications, jobs } });
});

router.put('/admin/users/:id', ...adminOnly, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return bad(res, 'Invalid id.');

  const user = await User.findById(req.params.id);

  if (!user) return bad(res, 'User not found.', 404);

  const b = req.body || {};

  if (b.name !== undefined) {
    if (String(b.name).trim().length < 2) return bad(res, 'Name must have at least 2 characters.');
    user.name = b.name;
  }

  if (b.email !== undefined) {
    if (!EMAIL_RE.test(String(b.email).trim())) return bad(res, 'Please enter a valid email address.');
    user.email = b.email;
  }

  if (b.phone !== undefined) user.phone = b.phone;

  if (user.role === 'student' && b.college !== undefined) user.college = b.college;

  if (user.role === 'recruiter') {
    if (b.companyName !== undefined) {
      if (!String(b.companyName).trim()) return bad(res, 'Company name cannot be empty.');
      user.companyName = b.companyName;
    }

    ['companyWebsite', 'companyDescription', 'industry', 'companySize', 'companyLocation']
      .forEach(key => {
        if (b[key] !== undefined) user[key] = b[key];
      });
  }
  if (b.password !== undefined && b.password !== '') {
    if (typeof b.password !== 'string' || b.password.length < 8) {
      return bad(res, 'New password must be at least 8 characters long.');
    }

    user.passwordHash = hashPassword(b.password);
  }

  await user.save();

  if (user.role === 'recruiter' && b.companyName !== undefined) {
    await Job.updateMany({ recruiter: user._id }, { companyName: user.companyName });
  }

  res.json({
    success: true,
    message: 'User updated.',
    data: { user: safeUser(user) }
  });
});

router.delete('/admin/users/:id', ...adminOnly, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return bad(res, 'Invalid id.');

  const user = await User.findById(req.params.id);

  if (!user) return bad(res, 'User not found.', 404);

  if (String(user._id) === String(req.user._id)) {
    return bad(res, 'You cannot delete your own admin account here.');
  }

  if (user.role === 'admin' && (await User.countDocuments({ role: 'admin' })) <= 1) {
    return bad(res, 'The last admin account cannot be deleted.');
  }

  await deleteUserCascade(user);

  res.json({ success: true, message: 'User and all related data deleted.' });
});

router.get('/admin/jobs', ...adminOnly, async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 20, maxLimit: 100 });
  const filter = {};

  if (['draft', 'published', 'closed'].includes(req.query.status)) {
    filter.status = req.query.status;
  }

  if (['job', 'internship'].includes(req.query.type)) {
    filter.type = req.query.type;
  }

  if (req.query.q && String(req.query.q).trim()) {
    const rx = new RegExp(escapeRegex(String(req.query.q).trim()), 'i');
    filter.$or = [{ title: rx }, { companyName: rx }, { location: rx }];
  }

  const [jobs, total] = await Promise.all([
    Job.find(filter)
      .populate('recruiter', 'name email companyName recruiterVerification')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Job.countDocuments(filter)
  ]);

  const counts = await Application.aggregate([
    { $match: { job: { $in: jobs.map(j => j._id) } } },
    { $group: { _id: '$job', count: { $sum: 1 } } }
  ]);

  const byJob = new Map(counts.map(c => [String(c._id), c.count]));

  res.json({
    success: true,
    data: {
      jobs: jobs.map(j => ({ ...j, applicationCount: byJob.get(String(j._id)) || 0 })),
      pagination: paginationMeta(page, limit, total)
    }
  });
});

router.get('/admin/applications', ...adminOnly, async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 20, maxLimit: 100 });
  const filter = {};

  if (req.query.status) filter.status = String(req.query.status);

  const [applications, total] = await Promise.all([
    Application.find(filter)
      .populate('student', 'name email college')
      .populate('job', 'title companyName type')
      .sort({ appliedAt: -1 })
      .skip(skip)
      .limit(limit),
    Application.countDocuments(filter)
  ]);

  res.json({
    success: true,
    data: { applications, pagination: paginationMeta(page, limit, total) }
  });
});

router.get('/admin/analytics', ...adminOnly, async (_req, res) => {
  const since = new Date(Date.now() - 6 * 86400000);
  since.setHours(0, 0, 0, 0);

  const [
    usersByRole,
    jobsByType,
    jobsByStatus,
    applicationsByStatus,
    recruitersByVerification,
    topJobs,
    applicationsPerDay
  ] = await Promise.all([
    User.aggregate([{ $group: { _id: '$role', count: { $sum: 1 } } }]),
    Job.aggregate([{ $group: { _id: '$type', count: { $sum: 1 } } }]),
    Job.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    Application.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    User.aggregate([
      { $match: { role: 'recruiter' } },
      { $group: { _id: '$recruiterVerification', count: { $sum: 1 } } }
    ]),
    Application.aggregate([
      { $group: { _id: '$job', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 }
    ]),
    Application.aggregate([
      { $match: { appliedAt: { $gte: since } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$appliedAt' } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ])
  ]);

  const jobs = await Job.find({ _id: { $in: topJobs.map(t => t._id) } })
    .select('title companyName')
    .lean();

  const titles = new Map(jobs.map(j => [String(j._id), j]));

  res.json({
    success: true,
    data: {
      usersByRole,
      jobsByType,
      jobsByStatus,
      applicationsByStatus,
      recruitersByVerification,
      applicationsPerDay,
      topJobs: topJobs.map(t => ({
        jobId: t._id,
        title: titles.get(String(t._id))?.title || 'Deleted job',
        companyName: titles.get(String(t._id))?.companyName || '',
        count: t.count
      }))
    }
  });
});

module.exports = router;
