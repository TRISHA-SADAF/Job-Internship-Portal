
'use strict';

const express = require('express');
const { configureSecurity } = require('./config/security');
const { createSessionMiddleware } = require('./config/session');
const routes = require('./routes');
const notFound = require('./middleware/notFound');
const errorHandler = require('./middleware/errorHandler');

function createApp() {
  const app = express();

  configureSecurity(app);
  app.use(createSessionMiddleware());

  app.get('/', (_req, res) => res.json({
    success: true,
    message: 'Job/Internship Portal API is running.',
    data: {
      status: 'ok',
      timestamp: new Date().toISOString(),
      api: '/api/v1'
    }
  }));

  app.use('/api/v1', routes);
  app.use(notFound);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
