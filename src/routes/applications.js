'use strict';

const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

const Job = require('../models/Job');
const User = require('../models/User');
const Application = require('../models/Application');
const { requireAuth, allowRoles } = require('../middleware/auth');
const { matchDetails } = require('../utils/helpers');
const { notify } = require('../services/notificationService');
const { sendStoredFile } = require('../utils/files');
const Notification = require('../models/Notification');
const {
  REJECTION_REASONS,
  FEEDBACK_MESSAGES,
  REVIEW_STATUSES
} = require('../utils/constants');

const STATUS_LABEL = {
  submitted: 'Applied',
  under_review: 'Under Review',
  shortlisted: 'Shortlisted',
  interview: 'Interview',
  selected: 'Selected',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn'
};

function bad(res, message, status = 400) {
  return res.status(status).json({ success: false, message });
}

function checkId(req, res, name = 'id') {
  if (!mongoose.isValidObjectId(req.params[name])) {
    bad(res, 'Invalid id.');
    return false;
  }
  return true;
}
function canAccess(user, application) {
  if (user.role === 'admin') return true;

  const studentId = String(
    (application.student && application.student._id) || application.student
  );

  if (user.role === 'student') return studentId === String(user._id);

  const recruiterId = String(
    application.job && (application.job.recruiter._id || application.job.recruiter)
  );

  return user.role === 'recruiter' && recruiterId === String(user._id);
}

router.post('/applications', requireAuth, allowRoles('student'), async (req, res) => {
  const { jobId, coverLetter } = req.body || {};

  if (!mongoose.isValidObjectId(jobId)) {
    return bad(res, 'A valid jobId is required.');
  }

  const job = await Job.findById(jobId);

  if (!job || job.status !== 'published' || job.deadline < new Date()) {
    return bad(res, 'This job is unavailable or its deadline has passed.');
  }

  if (await Application.exists({ student: req.user._id, job: job._id })) {
    return bad(res, 'You have already applied to this job.', 409);
  }

  const skills = req.user.skills || [];
  const details = matchDetails(skills, job.skillsRequired);

  const app = await Application.create({
    student: req.user._id,
    job: job._id,
    coverLetter,
    resumePath: req.user.resumePath,
    extractedSkills: skills,
    matchedSkills: details.matchedSkills,
    matchScore: details.matchScore,
    statusHistory: [{ status: 'submitted' }]
  });

  await Promise.all([
    notify(
      job.recruiter,
      `${req.user.name} applied for "${job.title}".`,
      { relatedJob: job._id, relatedApplication: app._id }
    ),
    notify(
      req.user._id,
      `Your application for "${job.title}" was submitted successfully.`,
      { type: 'application_update', relatedJob: job._id, relatedApplication: app._id }
    )
  ]);

  res.status(201).json({
    success: true,
    message: 'Application submitted successfully.',
    data: { application: app }
  });
});

router.get('/applications/feedback-options', requireAuth, (_req, res) =>
  res.json({
    success: true,
    data: {
      rejectionReasons: REJECTION_REASONS,
      feedbackMessages: FEEDBACK_MESSAGES,
      statuses: REVIEW_STATUSES
    }
  })
);
router.get('/applications/me', requireAuth, allowRoles('student'), async (req, res) => {
  const applications = await Application.find({ student: req.user._id })
    .populate({
      path: 'job',
      populate: { path: 'recruiter', select: 'name companyName recruiterVerification' }
    })
    .sort({ appliedAt: -1 });

  res.json({ success: true, data: { applications } });
});
router.get('/applications/:id', requireAuth, async (req, res) => {
  if (!checkId(req, res)) return;

  const app = await Application.findById(req.params.id)
    .populate('job')
    .populate('student', 'name email phone college skills education resumePath resumeOriginalName');

  if (!app) return bad(res, 'Application not found.', 404);

  if (!app.job) return bad(res, 'The job for this application no longer exists.', 404);

  if (!canAccess(req.user, app)) {
    return bad(res, 'Not allowed to view this application.', 403);
  }

  res.json({ success: true, data: { application: app } });
});

router.get('/applications/:id/resume', requireAuth, async (req, res) => {
  if (!checkId(req, res)) return;

  const app = await Application.findById(req.params.id)
    .populate('job', 'recruiter')
    .populate('student', 'name');

  if (!app) return bad(res, 'Application not found.', 404);

  if (!canAccess(req.user, app)) {
    return bad(res, 'Not allowed to view this resume.', 403);
  }

  const ext = (app.resumePath || '').split('.').pop();
  const student = (app.student && app.student.name) || 'applicant';

  return sendStoredFile(
    res,
    app.resumePath,
    `${student.replace(/[^\w-]+/g, '_')}_resume.${ext}`
  );
});

router.get(
  '/jobs/:jobId/applications',
  requireAuth,
  allowRoles('recruiter', 'admin'),
  async (req, res) => {
    if (!checkId(req, res, 'jobId')) return;

    const job = await Job.findById(req.params.jobId);

    if (!job) return bad(res, 'Job not found.', 404);

    if (req.user.role !== 'admin' &&
        String(job.recruiter) !== String(req.user._id)) {
      return bad(res, 'Not allowed.', 403);
    }

    const filter = { job: job._id };
    if (req.query.status) filter.status = String(req.query.status);

    const applications = await Application.find(filter)
      .populate('student', 'name email phone college skills')
      .sort({ matchScore: -1, appliedAt: -1 });

    res.json({ success: true, data: { applications, job } });
  }
);

router.put(
  '/applications/:id/status',
  requireAuth,
  allowRoles('recruiter', 'admin'),
  async (req, res) => {
    if (!checkId(req, res)) return;

    const app = await Application.findById(req.params.id).populate('job');

    if (!app) return bad(res, 'Application not found.', 404);

    if (!app.job) return bad(res, 'The job for this application no longer exists.', 404);

    if (req.user.role !== 'admin' &&
        String(app.job.recruiter) !== String(req.user._id)) {
      return bad(res, 'Not allowed to update this application.', 403);
    }

    const { status } = req.body || {};
    const feedback = req.body && req.body.feedback !== undefined
      ? String(req.body.feedback).trim().slice(0, 500)
      : undefined;

    if (!REVIEW_STATUSES.includes(status)) {
      return bad(res, `Status must be one of: ${REVIEW_STATUSES.join(', ')}.`);
    }

    if (app.status === 'withdrawn') {
      return bad(res, 'The student has withdrawn this application.');
    }

    if (status === 'rejected' && !feedback && !app.feedback) {
      return bad(res, 'Please select a rejection reason or write feedback for the applicant.');
    }

    app.status = status;
    if (feedback !== undefined) app.feedback = feedback;

    app.statusHistory.push({ status, feedback: feedback || undefined });

    await app.save();

    await notify(
      app.student,
      `Your application for "${app.job.title}" is now "${STATUS_LABEL[status]}".` +
        (feedback ? ` Feedback: ${feedback}` : ''),
      {
        type: 'application_update',
        relatedJob: app.job._id,
        relatedApplication: app._id
      }
    );

    res.json({
      success: true,
      message: `Application marked as ${STATUS_LABEL[status]}.`,
      data: { application: app }
    });
  }
);
router.put('/applications/:id', requireAuth, allowRoles('student'), async (req, res) => {
  if (!checkId(req, res)) return;

  const app = await Application.findOne({ _id: req.params.id, student: req.user._id });

  if (!app) return bad(res, 'Application not found.', 404);

  if (!['submitted', 'under_review'].includes(app.status)) {
    return bad(res, 'You can edit the cover letter only before the application is shortlisted.');
  }

  const coverLetter = String((req.body || {}).coverLetter || '').trim();

  if (coverLetter.length > 3000) {
    return bad(res, 'Cover letter can have at most 3000 characters.');
  }

  app.coverLetter = coverLetter;
  await app.save();

  res.json({
    success: true,
    message: 'Application updated.',
    data: { application: app }
  });
});

router.delete('/applications/:id', requireAuth, allowRoles('student', 'admin'), async (req, res) => {
  if (!checkId(req, res)) return;

  const filter = { _id: req.params.id };

  if (req.user.role === 'student') filter.student = req.user._id;

  const app = await Application.findOne(filter);

  if (!app) return bad(res, 'Application not found.', 404);

  if (req.user.role === 'student' && app.status !== 'withdrawn') {
    return bad(res, 'Withdraw the application first. Only withdrawn applications can be deleted.');
  }

  await Promise.all([
    Notification.deleteMany({ relatedApplication: app._id }),
    app.deleteOne()
  ]);

  res.json({ success: true, message: 'Application deleted.' });
});

router.put(
  '/applications/:id/withdraw',
  requireAuth,
  allowRoles('student'),
  async (req, res) => {
    if (!checkId(req, res)) return;

    const app = await Application.findOne({
      _id: req.params.id,
      student: req.user._id
    }).populate('job', 'title recruiter');

    if (!app) return bad(res, 'Application not found.', 404);

    if (['selected', 'rejected', 'withdrawn'].includes(app.status)) {
      return bad(res, `You cannot withdraw an application that is already ${STATUS_LABEL[app.status]}.`);
    }

    app.status = 'withdrawn';
    app.statusHistory.push({ status: 'withdrawn' });
    await app.save();

    if (app.job) {
      await notify(
        app.job.recruiter,
        `${req.user.name} withdrew the application for "${app.job.title}".`,
        { relatedJob: app.job._id, relatedApplication: app._id }
      );
    }

    res.json({
      success: true,
      message: 'Application withdrawn.',
      data: { application: app }
    });
  }
);

router.get(
  '/reminders/deadlines',
  requireAuth,
  allowRoles('student'),
  async (req, res) => {
    const now = new Date();

    const jobs = await Job.find({
      status: 'published',
      deadline: {
        $gte: now,
        $lte: new Date(Date.now() + 14 * 86400000)
      }
    })
      .populate('recruiter', 'name companyName recruiterVerification')
      .sort({ deadline: 1 })
      .lean();

    const applied = await Application.find({
      student: req.user._id,
      job: { $in: jobs.map(j => j._id) }
    }).select('job');

    const appliedIds = new Set(applied.map(a => String(a.job)));
    const saved = new Set((req.user.savedJobs || []).map(String));

    const reminders = jobs
      .filter(job => !appliedIds.has(String(job._id)))
      .map(job => ({
        ...job,
        daysLeft: Math.max(0, Math.ceil((new Date(job.deadline) - now) / 86400000)),
        saved: saved.has(String(job._id))
      }));

    res.json({
      success: true,
      message: 'Upcoming deadlines within 14 days.',
      data: { jobs: reminders }
    });
  }
);

module.exports = router;
