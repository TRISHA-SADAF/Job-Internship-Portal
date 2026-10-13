
'use strict';

module.exports = (req, res, next) => {
  const e = new Error(
    `Route not found: ${req.method} ${req.originalUrl}`
  );

  e.status = 404;
  next(e);
};
