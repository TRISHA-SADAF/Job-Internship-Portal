'use strict';

const env = require('../config/env');

module.exports = (err, req, res, next) => {
  if (res.headersSent) return next(err);

  let status = err.status || err.statusCode || 500;
  let message = status >= 500
    ? 'Unexpected server error.'
    : (err.message || 'Request failed.');

  let errors;

  if (err.type === 'entity.parse.failed') {
    status = 400;
    message = 'Malformed JSON in the request body.';
  } else if (err.type === 'entity.too.large') {
    status = 413;
    message = 'Request body is too large.';
  } else if (err.name === 'ValidationError' && err.errors) {
    status = 422;
    errors = Object.values(err.errors).map(x => ({
      field: x.path,
      message: x.message
    }));
    message = errors[0] ? errors[0].message : 'Validation failed.';
  } else if (err.name === 'CastError') {
    status = 400;
    message = 'Invalid identifier or value.';
  } else if (err.code === 11000) {
    status = 409;
    message = err.keyPattern && err.keyPattern.email
      ? 'An account with this email already exists.'
      : 'A record with this unique value already exists.';
  } else if (err.name === 'MulterError') {
    status = 400;
    message = err.message;
  } else if (err.message === 'Origin is not allowed by CORS.') {
    status = 403;
    message = 'Request origin is not allowed.';
  }

  if (!env.IS_TEST) {
    console.error(
      `${req.method} ${req.originalUrl} -> ${status}`,
      status >= 500 ? err : message
    );
  }

  const out = { success: false, message };

  if (errors) out.errors = errors;

  res.status(status).json(out);
};
