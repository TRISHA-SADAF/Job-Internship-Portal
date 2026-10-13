
'use strict';

const path = require('node:path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

function required(name, min = 1) {
  const value = process.env[name];

  if (!value || value.trim().length < min) {
    throw new Error(`Missing/invalid environment variable: ${name}`);
  }

  return value.trim();
}

const NODE_ENV = process.env.NODE_ENV || 'development';
const SESSION_SECRET = required('SESSION_SECRET', 32);
const ADMIN_BOOTSTRAP_SECRET = required('ADMIN_BOOTSTRAP_SECRET', 32);

if (SESSION_SECRET === ADMIN_BOOTSTRAP_SECRET) {
  throw new Error('Session and admin secrets must be different.');
}

const MONGODB_URI = required('MONGODB_URI');

if (!/^mongodb(?:\+srv)?:\/\//i.test(MONGODB_URI)) {
  throw new Error('Invalid MONGODB_URI.');
}

const frontend = new URL(
  process.env.FRONTEND_ORIGIN || 'http://localhost:5173'
);

module.exports = Object.freeze({
  NODE_ENV,
  IS_PRODUCTION: NODE_ENV === 'production',
  IS_TEST: NODE_ENV === 'test',
  PORT: Number(process.env.PORT || 5000),
  MONGODB_URI,
  SESSION_SECRET,
  SESSION_NAME: process.env.SESSION_NAME || 'jobportal.sid',
  FRONTEND_ORIGIN: frontend.origin,
  ADMIN_BOOTSTRAP_SECRET,
  RESUME_STORAGE_DIR: path.resolve(
    __dirname,
    '../../',
    process.env.RESUME_STORAGE_DIR || 'storage/resumes'
  ),
  MAX_RESUME_SIZE_BYTES:
    Number(process.env.MAX_RESUME_SIZE_MB || 5) * 1024 * 1024
});
