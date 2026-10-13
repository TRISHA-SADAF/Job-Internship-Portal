
'use strict';

const express = require('express');
const router = express.Router();

const Job = require('../models/Job');
const { requireAuth, allowRoles } = require('../middleware/auth');
const { normalizeSkills, scoreJob } = require('../utils/helpers');
const { matchJobs } = require('../services/pythonService');

// Search and filter jobs
router.get('/jobs', async (req, res) => {
  const q = {};

  if (!req.query.includeDrafts) q.status = 'published';

  if (['job', 'internship'].includes(req.query.type)) {
    q.type = req.query.type;
  }

  if (req.query.location) {
    q.location = {
      $regex: String(req.query.location).replace(
        /[.*+?^${}()|[\]\\]/g, '\\$&'
      ),
      $options: 'i'
    };
  }

  if (req.query.fresherFriendly === 'true') {
    q.$or = [{ fresherFriendly: true }, { experienceMin: 0 }];
  }

  if (req.query.workMode &&
      ['onsite', 'remote', 'hybrid'].includes(req.query.workMode)) {
    q.workMode = req.query.workMode;
  }

  if (req.query.q) q.$text = { $search: String(req.query.q) };

  if (req.query.skill) {
    q.skillsRequired = {
      $in: [
        new RegExp(
          String(req.query.skill).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
          'i'
        )
      ]
    };
  }

  q.deadline = { $gte: new Date() };

  const jobs = await Job.find(q)
    .populate('recruiter', 'name companyName recruiterVerification')
    .sort({ createdAt: -1 })
    .limit(100);

  res.json({ success: true, data: { jobs } });
});

// Recommended jobs for the logged-in student
router.get(
  '/recommendations/me',
  requireAuth,
  allowRoles('student'),
  async (req, res) => {
    const skills = req.user.skills || [];

    const jobs = await Job.find({
      status: 'published',
      deadline: { $gte: new Date() }
    }).limit(100).lean();

    let ranked = [];

    try {
      ranked = await matchJobs(skills, jobs);
    } catch (_error) {
      ranked = jobs.map(job => ({
        jobId: String(job._id),
        matchScore: scoreJob(skills, job.skillsRequired),
        matchedSkills: (job.skillsRequired || []).filter(s =>
          skills.some(x => x.toLowerCase() === s.toLowerCase())
        )
      }));
    }

    const byId = new Map(jobs.map(job => [String(job._id), job]));

    const recommendations = ranked
      .map(item => ({
        job: byId.get(String(item.jobId)),
        matchScore: item.matchScore,
        matchedSkills: item.matchedSkills || []
      }))
      .filter(x => x.job)
      .slice(0, 20);

    res.json({ success: true, data: { recommendations } });
  }
);

// View a particular published job
router.get('/jobs/:id', async (req, res) => {
  const job = await Job.findById(req.params.id)
    .populate('recruiter', 'name companyName recruiterVerification');

  if (!job || job.status !== 'published') {
    return res.status(404).json({
      success: false,
      message: 'Published job not found.'
    });
  }

  res.json({ success: true, data: { job } });
});

// Create a job or internship
router.post('/jobs', requireAuth, allowRoles('recruiter'), async (req, res) => {
  if (req.user.recruiterVerification !== 'verified') {
    return res.status(403).json({
      success: false,
      message: 'Recruiter verification is required before posting jobs.'
    });
  }

  const body = req.body || {};

  const job = await Job.create({
    title: body.title,
    description: body.description,
    companyName: req.user.companyName || body.companyName,
    recruiter: req.user._id,
    type: body.type,
    location: body.location,
    workMode: body.workMode,
    skillsRequired: normalizeSkills(body.skillsRequired),
    experienceMin: Number(body.experienceMin || 0),
    fresherFriendly: body.fresherFriendly === undefined
      ? Number(body.experienceMin || 0) === 0
      : Boolean(body.fresherFriendly),
    salaryMin: body.salaryMin,
    salaryMax: body.salaryMax,
    stipend: body.stipend,
    openings: body.openings,
    deadline: body.deadline,
    status: body.status === 'draft' ? 'draft' : 'published'
  });

  res.status(201).json({
    success: true,
    message: 'Job/internship created.',
    data: { job }
  });
});

// Update a job
router.put('/jobs/:id', requireAuth, allowRoles('recruiter', 'admin'), async (req, res) => {
  const job = await Job.findById(req.params.id);

  if (!job) {
    return res.status(404).json({
      success: false,
      message: 'Job not found.'
    });
  }

  if (req.user.role !== 'admin' &&
      String(job.recruiter) !== String(req.user._id)) {
    return res.status(403).json({
      success: false,
      message: 'You can edit only your own postings.'
    });
  }

  const allowed = [
    'title', 'description', 'companyName', 'type', 'location',
    'workMode', 'skillsRequired', 'experienceMin', 'fresherFriendly',
    'salaryMin', 'salaryMax', 'stipend', 'openings', 'deadline', 'status'
  ];

  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      job[key] = key === 'skillsRequired'
        ? normalizeSkills(req.body[key])
        : req.body[key];
    }
  }

  await job.save();

  res.json({
    success: true,
    message: 'Job updated.',
    data: { job }
  });
});

// Delete a job
router.delete(
  '/jobs/:id',
  requireAuth,
  allowRoles('recruiter', 'admin'),
  async (req, res) => {
    const job = await Job.findById(req.params.id);

    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Job not found.'
      });
    }

    if (req.user.role !== 'admin' &&
        String(job.recruiter) !== String(req.user._id)) {
      return res.status(403).json({
        success: false,
        message: 'You can delete only your own postings.'
      });
    }

    await job.deleteOne();

    res.json({ success: true, message: 'Job deleted.' });
  }
);

module.exports = router;
