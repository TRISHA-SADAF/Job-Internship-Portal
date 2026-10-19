'use strict';

const path = require('node:path');
const dotenv = require('dotenv');

const fs = require('node:fs');
const crypto = require('node:crypto');

const ENV_FILE = path.resolve(__dirname, '../../.env');

dotenv.config({ path: ENV_FILE, quiet: true });
function envFileHelp() {
  const folder = path.dirname(ENV_FILE);
  const lines = [`Looked for: ${ENV_FILE}`];

  if (fs.existsSync(ENV_FILE)) {
    lines.push('The .env file exists, but it does not contain this value. Open it and check the line.');
  } else {
    const similar = fs.readdirSync(folder).filter(f => /env/i.test(f) && f !== '.env.example');

    lines.push('That file does NOT exist.');
    if (similar.length) {
      lines.push(`Found similar file(s): ${similar.join(', ')}. Rename the right one to exactly ".env".`);
    } else {
      lines.push('Copy .env.example to .env (same folder as package.json) and fill it in.');
    }
  }

  return lines.join(' ');
}

const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_DEV = NODE_ENV !== 'production';

function required(name, min = 1) {
  const value = process.env[name];

  if (!value || value.trim().length < min) {
    throw new Error(
      `Missing/invalid environment variable: ${name}` +
      (min > 1 ? ` (needs at least ${min} characters)` : '') +
      `. ${envFileHelp()}`
    );
  }

  return value.trim();
}
function secret(name) {
  const value = (process.env[name] || '').trim();

  if (value.length >= 32) return value;

  if (!IS_DEV) return required(name, 32);

  console.warn(
    `[env] ${name} is missing or shorter than 32 characters. Using a temporary random value for development. ` +
    'Set it in backend/.env to stay logged in after restarts.'
  );

  return crypto.randomBytes(32).toString('hex');
}

const SESSION_SECRET = secret('SESSION_SECRET');
const ADMIN_BOOTSTRAP_SECRET = secret('ADMIN_BOOTSTRAP_SECRET');

if (SESSION_SECRET === ADMIN_BOOTSTRAP_SECRET) {
  throw new Error('Session and admin secrets must be different.');
}

const MONGODB_URI = required('MONGODB_URI');

if (/ASLI_PASSWORD|<password>|your-password/i.test(MONGODB_URI)) {
  throw new Error('MONGODB_URI still contains a placeholder password. Put your real Atlas database-user password in backend/.env.');
}

if (!/^mongodb(?:\+srv)?:\/\//i.test(MONGODB_URI)) {
  throw new Error('Invalid MONGODB_URI. It must start with mongodb:// or mongodb+srv://');
}

const FRONTEND_ORIGINS = (process.env.FRONTEND_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map(x => x.trim())
  .filter(Boolean)
  .map(x => new URL(x).origin);

const backendRoot = path.resolve(__dirname, '../../');

module.exports = Object.freeze({
  NODE_ENV,
  IS_PRODUCTION: NODE_ENV === 'production',
  IS_TEST: NODE_ENV === 'test',
  PORT: Number(process.env.PORT || 5000),
  MONGODB_URI,
  SESSION_SECRET,
  SESSION_NAME: process.env.SESSION_NAME || 'jobportal.sid',
  FRONTEND_ORIGIN: FRONTEND_ORIGINS[0],
  FRONTEND_ORIGINS,
  ADMIN_BOOTSTRAP_SECRET,
  BACKEND_ROOT: backendRoot,
  RESUME_STORAGE_DIR: path.resolve(
    backendRoot,
    process.env.RESUME_STORAGE_DIR || 'storage/resumes'
  ),
  VERIFICATION_STORAGE_DIR: path.resolve(
    backendRoot,
    process.env.VERIFICATION_STORAGE_DIR || 'storage/verification'
  ),
  MAX_RESUME_SIZE_BYTES:
    Number(process.env.MAX_RESUME_SIZE_MB || 5) * 1024 * 1024,
  RESET_TOKEN_TTL_MS: 30 * 60 * 1000
});
