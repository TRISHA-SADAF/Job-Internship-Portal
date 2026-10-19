'use strict';

const path = require('node:path');
const express = require('express');
const mongoose = require('mongoose');

const router = express.Router();
const env = require('../config/env');

const User = require('../models/User');
const Job = require('../models/Job');
const { requireAuth, allowRoles } = require('../middleware/auth');
const { singleFileUpload } = require('../middleware/upload');
const {
  safeUser,
  normalizeSkills,
  mergeSkills
} = require('../utils/helpers');
const { analyzeResume } = require('../services/pythonService');
const { sendStoredFile, toRelative, deleteStoredFile } = require('../utils/files');
const { verifyPassword } = require('../utils/helpers');
const { deleteUserCascade } = require('../services/accountService');

const studentOnly = [requireAuth, allowRoles('student')];

function bad(res, message, status = 400) {
  return res.status(status).json({ success: false, message });
}

router.get('/students/me', ...studentOnly, (req, res) =>
  res.json({ success: true, data: { user: safeUser(req.user) } })
);

router.put('/students/me', ...studentOnly, async (req, res) => {
  const body = req.body || {};

  if (body.name !== undefined) req.user.name = body.name;
  if (body.phone !== undefined) req.user.phone = body.phone;
  if (body.college !== undefined) req.user.college = body.college;

  if (body.skills !== undefined) {
    req.user.skills = normalizeSkills(body.skills);
  }

  if (body.education !== undefined) {
    if (!Array.isArray(body.education)) {
      return bad(res, 'Education must be a list.');
    }

    req.user.education = body.education
      .filter(item => item && (item.qualification || item.institute))
      .slice(0, 10)
      .map(item => ({
        qualification: item.qualification,
        institute: item.institute,
        year: item.year === '' || item.year == null ? undefined : Number(item.year),
        percentage: item.percentage === '' || item.percentage == null
          ? undefined
          : Number(item.percentage)
      }));
  }

  await req.user.save();

  res.json({
    success: true,
    message: 'Student profile updated.',
    data: { user: safeUser(req.user) }
  });
});

const uploadResume = singleFileUpload({
  field: 'resume',
  dir: env.RESUME_STORAGE_DIR,
  extensions: ['.pdf', '.docx'],
  maxBytes: env.MAX_RESUME_SIZE_BYTES,
  label: 'Resume'
});

router.post('/students/me/resume', requireAuth, allowRoles('student'), uploadResume, async (req, res) => {
  const previous = req.user.resumePath;

  req.user.resumePath = toRelative(req.file.path);
  req.user.resumeOriginalName = req.file.originalname.slice(0, 255);

  let analysis;

  try {
    analysis = await analyzeResume(req.file.path);
    req.user.resumeAnalysis = { ...analysis, analyzedAt: new Date() };

    if (Array.isArray(analysis.skills) && analysis.skills.length) {
      req.user.skills = mergeSkills(req.user.skills, analysis.skills);
    }
  } catch (error) {
    if (!env.IS_TEST) console.error('Resume analysis failed:', error.message);

    analysis = {
      available: false,
      message: `Resume uploaded, but the analysis could not run: ${error.message}`
    };
    req.user.resumeAnalysis = { ...analysis, analyzedAt: new Date() };
  }

  await req.user.save();

  if (previous && previous !== req.user.resumePath) {
    deleteStoredFile(previous);
  }

  res.status(201).json({
    success: true,
    message: analysis.available === false
      ? 'Resume uploaded, but automatic analysis is not available.'
      : 'Resume uploaded and analysed.',
    data: {
      resumePath: req.user.resumePath,
      resumeOriginalName: req.user.resumeOriginalName,
      skills: req.user.skills || [],
      analysis: req.user.resumeAnalysis
    }
  });
});

router.get('/students/me/resume', ...studentOnly, (req, res) =>
  sendStoredFile(
    res,
    req.user.resumePath,
    req.user.resumeOriginalName
  )
);
router.delete('/students/me/resume', ...studentOnly, async (req, res) => {
  if (!req.user.resumePath) {
    return bad(res, 'You have not uploaded a resume.', 404);
  }

  const old = req.user.resumePath;

  req.user.resumePath = undefined;
  req.user.resumeOriginalName = undefined;
  req.user.resumeAnalysis = undefined;
  await req.user.save();

  deleteStoredFile(old);

  res.json({
    success: true,
    message: 'Resume deleted.',
    data: { user: safeUser(req.user) }
  });
});
router.delete('/students/me', ...studentOnly, async (req, res) => {
  const user = await User.findById(req.user._id).select('+passwordHash');

  if (!verifyPassword(String((req.body || {}).password || ''), user.passwordHash)) {
    return bad(res, 'Password is incorrect. Your account was not deleted.');
  }

  await deleteUserCascade(user);

  req.session.destroy(() => {
    res.clearCookie(env.SESSION_NAME);
    res.json({ success: true, message: 'Your account and all its data were deleted.' });
  });
});
router.post('/students/me/resume/analyze', ...studentOnly, async (req, res) => {
  if (!req.user.resumePath) {
    return bad(res, 'Upload a resume first.');
  }

  let analysis;

  try {
    analysis = await analyzeResume(path.resolve(env.BACKEND_ROOT, req.user.resumePath));
  } catch (error) {
    return bad(res, `Resume analysis failed: ${error.message}`, 422);
  }

  req.user.resumeAnalysis = { ...analysis, analyzedAt: new Date() };

  if (Array.isArray(analysis.skills) && analysis.skills.length) {
    req.user.skills = mergeSkills(req.user.skills, analysis.skills);
  }

  await req.user.save();

  res.json({
    success: true,
    message: 'Resume analysed again.',
    data: { skills: req.user.skills, analysis: req.user.resumeAnalysis }
  });
});

router.get('/students/me/saved-jobs', ...studentOnly, async (req, res) => {
  const jobs = await Job.find({ _id: { $in: req.user.savedJobs || [] } })
    .populate('recruiter', 'name companyName recruiterVerification')
    .sort({ deadline: 1 });

  res.json({ success: true, data: { jobs } });
});

router.post('/students/me/saved-jobs/:jobId', ...studentOnly, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.jobId)) {
    return bad(res, 'Invalid job id.');
  }

  const job = await Job.findById(req.params.jobId);

  if (!job || job.status !== 'published') {
    return bad(res, 'This job is not available.', 404);
  }

  await User.updateOne(
    { _id: req.user._id },
    { $addToSet: { savedJobs: job._id } }
  );

  res.status(201).json({ success: true, message: 'Job saved.' });
});

router.delete('/students/me/saved-jobs/:jobId', ...studentOnly, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.jobId)) {
    return bad(res, 'Invalid job id.');
  }

  await User.updateOne(
    { _id: req.user._id },
    { $pull: { savedJobs: req.params.jobId } }
  );

  res.json({ success: true, message: 'Job removed from saved jobs.' });
});

module.exports = router;
