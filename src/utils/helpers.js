
'use strict';

const crypto = require('node:crypto');


function safeUser(user) {
  const result = {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    phone: user.phone,
    accountStatus: user.accountStatus
  };

  if (user.role === 'student') {
    result.college = user.college;
    result.education = user.education;
    result.skills = user.skills;
    result.resumePath = user.resumePath;
    result.resumeAnalysis = user.resumeAnalysis;
  }

  if (user.role === 'recruiter') {
    result.companyName = user.companyName;
    result.recruiterVerification = user.recruiterVerification;
  }

  return result;
}

function normalizeSkills(value) {
  return Array.isArray(value)
    ? value.map(x => String(x).trim()).filter(Boolean)
    : [];
}

function scoreJob(studentSkills, requiredSkills) {
  const have = new Set(
    (studentSkills || []).map(s => String(s).toLowerCase().trim())
  );

  const required = (requiredSkills || [])
    .map(s => String(s).toLowerCase().trim())
    .filter(Boolean);

  if (!required.length) return 0;

  return Math.round(
    required.filter(s => have.has(s)).length / required.length * 100
  );
}

function hashPassword(
  password,
  salt = crypto.randomBytes(16).toString('hex')
) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hex] = String(stored || '').split(':');

  if (!salt || !hex) return false;

  const expected = Buffer.from(hex, 'hex');
  const actual = crypto.scryptSync(password, salt, 64);

  return expected.length === actual.length &&
    crypto.timingSafeEqual(expected, actual);
}

module.exports = {
  safeUser,
  normalizeSkills,
  scoreJob,
  hashPassword,
  verifyPassword
};
