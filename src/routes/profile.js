
'use strict';

const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const multer = require('multer');

const router = express.Router();
const env = require('../config/env');

const { requireAuth, allowRoles } = require('../middleware/auth');
const { safeUser, normalizeSkills } = require('../utils/helpers');
const { analyzeResume } = require('../services/pythonService');

// Get student profile
router.get(
  '/students/me',
  requireAuth,
  allowRoles('student'),
  (req, res) => res.json({
    success: true,
    data: { user: safeUser(req.user) }
  })
);

// Update student profile
router.put(
  '/students/me',
  requireAuth,
  allowRoles('student'),
  async (req, res) => {
    const allowed = ['name', 'phone', 'college', 'education', 'skills'];

    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        req.user[key] = key === 'skills'
          ? normalizeSkills(req.body[key])
          : req.body[key];
      }
    }

    await req.user.save();

    res.json({
      success: true,
      message: 'Student profile updated.',
      data: { user: safeUser(req.user) }
    });
  }
);

// Resume storage folder
fs.mkdirSync(env.RESUME_STORAGE_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) =>
    cb(null, env.RESUME_STORAGE_DIR),

  filename: (req, file, cb) =>
    cb(
      null,
      `${req.session.userId}-${Date.now()}${path.extname(file.originalname).toLowerCase()}`
    )
});

const upload = multer({
  storage,
  limits: {
    fileSize: env.MAX_RESUME_SIZE_BYTES,
    files: 1
  },

  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();

    if (ext !== '.pdf' && ext !== '.docx') {
      return cb(new Error('Resume must be PDF or DOCX.'));
    }

    cb(null, true);
  }
});

// Upload resume
router.post(
  '/students/me/resume',
  requireAuth,
  allowRoles('student'),
  upload.single('resume'),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Attach a file using the form-data key "resume".'
      });
    }

    req.user.resumePath = path.relative(
      path.resolve(__dirname, '../..'),
      req.file.path
    ).replaceAll(path.sep, '/');

    let analysis = null;

    try {
      analysis = await analyzeResume(req.file.path);
      req.user.resumeAnalysis = analysis;

      if (Array.isArray(analysis.skills) && analysis.skills.length) {
        req.user.skills = [
          ...new Set([...(req.user.skills || []), ...analysis.skills])
        ];
      }
    } catch (_error) {
      analysis = {
        available: false,
        message: 'Resume uploaded, but Python analysis could not run. Install python requirements and check PYTHON_EXECUTABLE.'
      };
    }

    await req.user.save();

    res.status(201).json({
      success: true,
      message: 'Resume uploaded.',
      data: {
        resumePath: req.user.resumePath,
        skills: req.user.skills || [],
        analysis
      }
    });
  }
);

module.exports = router;
