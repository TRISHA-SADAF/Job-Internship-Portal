'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const { rateLimit } = require('express-rate-limit');
const env = require('./env');
const DEV_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

function isAllowedOrigin(origin) {
  if (!origin) return true; 
  if (env.FRONTEND_ORIGINS.includes(origin)) return true;
  return !env.IS_PRODUCTION && DEV_ORIGIN.test(origin);
}

function configureSecurity(app) {
  app.disable('x-powered-by');

  if (env.IS_PRODUCTION) {
    app.set('trust proxy', 1);
  }

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

  app.use(cors({
    origin(origin, cb) {
      if (isAllowedOrigin(origin)) return cb(null, true);
      return cb(new Error('Origin is not allowed by CORS.'));
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-Admin-Bootstrap-Secret'],
    exposedHeaders: ['Content-Disposition'],
    maxAge: 600
  }));

  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: false, limit: '20kb' }));

  app.use((req, _res, next) => {
    if (req.body === undefined) req.body = {};
    next();
  });

  if (!env.IS_TEST) {
    app.use(rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: env.IS_PRODUCTION ? 600 : 5000,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: { success: false, message: 'Too many requests. Please try again later.' }
    }));
  }
}

const authLimiter = env.IS_TEST
  ? (_req, _res, next) => next()
  : rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: env.IS_PRODUCTION ? 30 : 300,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: {
      success: false,
      message: 'Too many attempts. Please wait a few minutes and try again.'
    }
  });

module.exports = { configureSecurity, authLimiter };
