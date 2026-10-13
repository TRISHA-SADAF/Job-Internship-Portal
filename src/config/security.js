
'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const { rateLimit } = require('express-rate-limit');
const env = require('./env');

function configureSecurity(app) {
  app.disable('x-powered-by');

  if (env.IS_PRODUCTION) {
    app.set('trust proxy', 1);
  }

  app.use(helmet());

  app.use(cors({
    origin(origin, cb) {
      if (!origin || origin === env.FRONTEND_ORIGIN) {
        return cb(null, true);
      }

      return cb(new Error('Origin is not allowed by CORS.'));
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-Admin-Bootstrap-Secret'],
    maxAge: 600
  }));

  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: false, limit: '20kb' }));

  app.use(rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: 'draft-8',
    legacyHeaders: false
  }));
}

module.exports = { configureSecurity };
