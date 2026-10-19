'use strict';

const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

const Job = require('../models/Job');
const User = require('../models/User');
const Application = require('../models/Application');
const { requireAuth, optionalAuth, allowRoles } = require('../middleware/auth');
const {
  normalizeSkills,
  matchDetails,
  escapeRegex,
  parsePagination,
  paginationMeta
} = require('../utils/helpers');
const { matchJobs } = require('../services/pythonService');
const { deleteJobCascade } = require('../services/accountService');

function bad(res, message, status = 400) {
  return res.status(status).json({ success: false, message });
}

function toNumberOrUndefined(value) {
  if (value === undefined || value === null || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
}

router.get('/jobs', async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 9, maxLimit: 50 });

  const q = {
    status: 'published',
    deadline: { $gte: new Date() }
  };
  const and = [];

  if (['job', 'internship'].includes(req.query.type)) {
    q.type = req.query.type;
  }

  if (req.query.location) {
    q.location = { $regex: escapeRegex(req.query.location), $options: 'i' };
  }

  if (['onsite', 'remote', 'hybrid'].includes(req.query.workMode)) {
    q.workMode = req.query.workMode;
  }

  if (req.query.fresherFriendly === 'true') {
    and.push({ $or: [{ fresherFriendly: true }, { experienceMin: 0 }] });
  }

  if (req.query.q && String(req.query.q).trim()) {
    const rx = new RegExp(escapeRegex(String(req.query.q).trim()), 'i');
    and.push({
      $or: [
        { title: rx },
        { companyName: rx },
        { description: rx },
        { location: rx },
        { skillsRequired: rx }
      ]
    });
  }

  if (req.query.skill && String(req.query.skill).trim()) {
    q.skillsRequired = {
      $in: [new RegExp(escapeRegex(String(req.query.skill).trim()), 'i')]
    };
  }

  if (and.length) q.$and = and;

  const sorts = {
    latest: { createdAt: -1 },
    deadline: { deadline: 1 },
    stipend: { stipend: -1, salaryMax: -1 }
  };

  const [jobs, total] = await Promise.all([
    Job.find(q)
      .populate('recruiter', 'name companyName recruiterVerification')
      .sort(sorts[req.query.sort] || sorts.latest)
      .skip(skip)
      .limit(limit),
    Job.countDocuments(q)
  ]);

  res.json({
    success: true,
    data: { jobs, pagination: paginationMeta(page, limit, total) }
  });
});

router.get(
  '/recommendations/me',
  requireAuth,
  allowRoles('student'),
  async (req, res) => {
    const skills = req.user.skills || [];

    const jobs = await Job.find({
      status: 'published',
      deadline: { $gte: new Date() }
    })
      .populate('recruiter', 'name companyName recruiterVerification')
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    let ranked;
    let engine = 'python';

    try {
      ranked = await matchJobs(skills, jobs);
    } catch (_error) {
      engine = 'node';
      ranked = jobs
        .map(job => ({
          jobId: String(job._id),
          ...matchDetails(skills, job.skillsRequired)
        }))
        .sort((a, b) => b.matchScore - a.matchScore);
    }

    const applied = await Application.find({
      student: req.user._id,
      job: { $in: jobs.map(j => j._id) }
    }).select('job');

    const appliedIds = new Set(applied.map(a => String(a.job)));
    const byId = new Map(jobs.map(job => [String(job._id), job]));

    const recommendations = ranked
      .map(item => ({
        job: byId.get(String(item.jobId)),
        matchScore: item.matchScore,
        matchedSkills: item.matchedSkills || [],
        missingSkills: item.missingSkills || [],
        alreadyApplied: appliedIds.has(String(item.jobId))
      }))
      .filter(x => x.job)
      .slice(0, 20);

    res.json({
      success: true,
      data: { recommendations, engine, skills }
    });
  }
);

router.get(
  '/jobs/:id/match',
  requireAuth,
  allowRoles('student'),
  async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return bad(res, 'Invalid job id.');
    }

    const job = await Job.findById(req.params.id);

    if (!job) return bad(res, 'Job not found.', 404);

    res.json({
      success: true,
      data: matchDetails(req.user.skills || [], job.skillsRequired)
    });
  }
);

router.get('/jobs/:id', optionalAuth, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return bad(res, 'Invalid job id.');
  }

  const job = await Job.findById(req.params.id)
    .populate('recruiter', 'name companyName recruiterVerification companyWebsite companyDescription industry companyLocation');

  const isOwner = job && req.user &&
    String((job.recruiter && job.recruiter._id) || job.recruiter) === String(req.user._id);
  const isAdmin = req.user && req.user.role === 'admin';

  if (!job || (job.status !== 'published' && !isOwner && !isAdmin)) {
    return bad(res, 'Published job not found.', 404);
  }

  let alreadyApplied = false;
  let saved = false;

  if (req.user && req.user.role === 'student') {
    alreadyApplied = Boolean(await Application.exists({
      student: req.user._id,
      job: job._id
    }));
    saved = (req.user.savedJobs || []).some(id => String(id) === String(job._id));
  }

  res.json({
    success: true,
    data: { job, alreadyApplied, saved }
  });
});

function validateJobBody(body, { partial = false } = {}) {
  const errors = [];

  if (!partial || body.deadline !== undefined) {
    const d = new Date(body.deadline);
    if (!body.deadline || Number.isNaN(d.getTime())) {
      errors.push('Please choose a valid application deadline.');
    }
  }

  for (const key of ['experienceMin', 'salaryMin', 'salaryMax', 'stipend', 'openings']) {
    if (body[key] !== undefined && Number.isNaN(toNumberOrUndefined(body[key]))) {
      errors.push(`${key} must be a number.`);
    }
  }

  return errors;
}

router.post('/jobs', requireAuth, allowRoles('recruiter', 'admin'), async (req, res) => {
  const body = req.body || {};
  let owner = req.user;

  if (req.user.role === 'admin') {
    if (!mongoose.isValidObjectId(body.recruiterId)) {
      return bad(res, 'Choose the recruiter this posting belongs to.');
    }

    owner = await User.findOne({ _id: body.recruiterId, role: 'recruiter' });

    if (!owner) return bad(res, 'Recruiter not found.', 404);
  }

  if (owner.recruiterVerification !== 'verified') {
    return bad(
      res,
      req.user.role === 'admin'
        ? 'This recruiter is not verified yet. Verify the recruiter first.'
        : 'Your recruiter account must be verified by the admin before you can post jobs.',
      403
    );
  }

  const errors = validateJobBody(body);

  if (errors.length) return bad(res, errors[0]);

  const status = body.status === 'draft' ? 'draft' : 'published';

  if (status === 'published' && new Date(body.deadline) < new Date()) {
    return bad(res, 'Deadline must be a future date.');
  }

  const experienceMin = toNumberOrUndefined(body.experienceMin) || 0;

  const job = await Job.create({
    title: body.title,
    description: body.description,
    companyName: owner.companyName || body.companyName,
    recruiter: owner._id,
    type: body.type,
    location: body.location,
    workMode: body.workMode || undefined,
    skillsRequired: normalizeSkills(body.skillsRequired),
    experienceMin,
    fresherFriendly: body.fresherFriendly === undefined
      ? experienceMin === 0
      : Boolean(body.fresherFriendly),
    salaryMin: toNumberOrUndefined(body.salaryMin),
    salaryMax: toNumberOrUndefined(body.salaryMax),
    stipend: toNumberOrUndefined(body.stipend),
    openings: toNumberOrUndefined(body.openings),
    deadline: body.deadline,
    status
  });

  res.status(201).json({
    success: true,
    message: status === 'draft' ? 'Draft saved.' : 'Job/internship published.',
    data: { job }
  });
});

router.put('/jobs/:id', requireAuth, allowRoles('recruiter', 'admin'), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return bad(res, 'Invalid job id.');
  }

  const job = await Job.findById(req.params.id);

  if (!job) return bad(res, 'Job not found.', 404);

  if (req.user.role !== 'admin' &&
      String(job.recruiter) !== String(req.user._id)) {
    return bad(res, 'You can edit only your own postings.', 403);
  }

  const body = req.body || {};
  const errors = validateJobBody(body, { partial: true });

  if (errors.length) return bad(res, errors[0]);

  if (
    req.user.role === 'recruiter' &&
    body.status === 'published' &&
    job.status !== 'published' &&
    req.user.recruiterVerification !== 'verified'
  ) {
    return bad(res, 'Only verified recruiters can publish postings.', 403);
  }

  const allowed = [
    'title', 'description', 'type', 'location',
    'workMode', 'skillsRequired', 'experienceMin', 'fresherFriendly',
    'salaryMin', 'salaryMax', 'stipend', 'openings', 'deadline', 'status'
  ];

  const numeric = ['experienceMin', 'salaryMin', 'salaryMax', 'stipend', 'openings'];

  for (const key of allowed) {
    if (body[key] === undefined) continue;

    if (key === 'skillsRequired') {
      job.skillsRequired = normalizeSkills(body[key]);
    } else if (numeric.includes(key)) {
      job[key] = toNumberOrUndefined(body[key]);
    } else if (key === 'fresherFriendly') {
      job[key] = Boolean(body[key]);
    } else {
      job[key] = body[key];
    }
  }

  if (body.deadline !== undefined && job.status === 'published' &&
      new Date(body.deadline) < new Date()) {
    return bad(res, 'Deadline must be a future date for a published job.');
  }

  await job.save();

  res.json({
    success: true,
    message: 'Job updated.',
    data: { job }
  });
});

router.delete(
  '/jobs/:id',
  requireAuth,
  allowRoles('recruiter', 'admin'),
  async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return bad(res, 'Invalid job id.');
    }

    const job = await Job.findById(req.params.id);

    if (!job) return bad(res, 'Job not found.', 404);

    if (req.user.role !== 'admin' &&
        String(job.recruiter) !== String(req.user._id)) {
      return bad(res, 'You can delete only your own postings.', 403);
    }

    await deleteJobCascade(job);

    res.json({ success: true, message: 'Job deleted.' });
  }
);

module.exports = router;
