
'use strict';

const express = require('express');
const router = express.Router();

const Job = require('../models/Job');
const Application = require('../models/Application');
const { requireAuth, allowRoles } = require('../middleware/auth');
const { scoreJob } = require('../utils/helpers');

router.post(
  '/applications',
  requireAuth,
  allowRoles('student'),
  async (req, res) => {
    const job = await Job.findById(req.body.jobId);

    if (
      !job ||
      job.status !== 'published' ||
      job.deadline < new Date()
    ) {
      return res.status(400).json({
        success: false,
        message: 'Job is unavailable or its deadline has passed.'
      });
    }

    const skills = req.user.skills || [];

    const matched = (job.skillsRequired || []).filter(s =>
      skills.some(x => x.toLowerCase() === s.toLowerCase())
    );

    const app = await Application.create({
      student: req.user._id,
      job: job._id,
      coverLetter: req.body.coverLetter,
      resumePath: req.user.resumePath,
      extractedSkills: skills,
      matchedSkills: matched,
      matchScore: scoreJob(skills, job.skillsRequired)
    });

    res.status(201).json({
      success: true,
      message: 'Application submitted.',
      data: { application: app }
    });
  }
);

router.get(
  '/applications/me',
  requireAuth,
  allowRoles('student'),
  async (req, res) => {
    const applications = await Application.find({
      student: req.user._id
    })
      .populate('job')
      .sort({ appliedAt: -1 });

    res.json({ success: true, data: { applications } });
  }
);

router.get('/applications/:id', requireAuth, async (req, res) => {
  const app = await Application.findById(req.params.id)
    .populate('job')
    .populate('student', 'name email college skills');

  if (!app) {
    return res.status(404).json({
      success: false,
      message: 'Application not found.'
    });
  }

  const owns =
    req.user.role === 'admin' ||
    String(app.student._id || app.student) === String(req.user._id) ||
    (
      req.user.role === 'recruiter' &&
      String(app.job.recruiter) === String(req.user._id)
    );

  if (!owns) {
    return res.status(403).json({
      success: false,
      message: 'Not allowed to view this application.'
    });
  }

  res.json({ success: true, data: { application: app } });
});

router.get(
  '/jobs/:jobId/applications',
  requireAuth,
  allowRoles('recruiter', 'admin'),
  async (req, res) => {
    const job = await Job.findById(req.params.jobId);

    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Job not found.'
      });
    }

    if (
      req.user.role !== 'admin' &&
      String(job.recruiter) !== String(req.user._id)
    ) {
      return res.status(403).json({
        success: false,
        message: 'Not allowed.'
      });
    }

    const applications = await Application.find({ job: job._id })
      .populate('student', 'name email college skills')
      .sort({ appliedAt: -1 });

    res.json({ success: true, data: { applications } });
  }
);

router.put(
  '/applications/:id/status',
  requireAuth,
  allowRoles('recruiter', 'admin'),
  async (req, res) => {
    const app = await Application.findById(req.params.id)
      .populate('job');

    if (!app) {
      return res.status(404).json({
        success: false,
        message: 'Application not found.'
      });
    }

    if (
      req.user.role !== 'admin' &&
      String(app.job.recruiter) !== String(req.user._id)
    ) {
      return res.status(403).json({
        success: false,
        message: 'Not allowed to update this application.'
      });
    }

    const allowed = [
      'under_review',
      'shortlisted',
      'interview',
      'selected',
      'rejected'
    ];

    if (!allowed.includes(req.body.status)) {
      return res.status(400).json({
        success: false,
        message: `Status must be one of: ${allowed.join(', ')}.`
      });
    }

    app.status = req.body.status;

    if (req.body.feedback !== undefined) {
      app.feedback = String(req.body.feedback).slice(0, 500);
    }

    await app.save();

    res.json({
      success: true,
      message: 'Application status updated.',
      data: { application: app }
    });
  }
);

router.get(
  '/reminders/deadlines',
  requireAuth,
  allowRoles('student'),
  async (req, res) => {
    const jobs = await Job.find({
      status: 'published',
      deadline: {
        $gte: new Date(),
        $lte: new Date(Date.now() + 14 * 86400000)
      }
    }).sort({ deadline: 1 });

    res.json({
      success: true,
      message: 'Upcoming deadlines within 14 days.',
      data: { jobs }
    });
  }
);

module.exports = router;
