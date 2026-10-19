'use strict';

const User = require('../models/User');

async function loadSessionUser(req) {
  if (!req.session || !req.session.userId) return null;

  const user = await User.findById(req.session.userId);

  if (!user || user.accountStatus !== 'active') {
    await new Promise(resolve => req.session.destroy(() => resolve()));
    return null;
  }

  return user;
}

async function requireAuth(req, res, next) {
  try {
    if (!req.session || !req.session.userId) {
      return res.status(401).json({
        success: false,
        message: 'Please log in first.'
      });
    }

    const user = await loadSessionUser(req);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Session is invalid or your account is suspended. Please log in again.'
      });
    }

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

async function optionalAuth(req, _res, next) {
  try {
    req.user = await loadSessionUser(req);
    next();
  } catch (err) {
    next(err);
  }
}

function allowRoles(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission for this action.'
      });
    }

    next();
  };
}

module.exports = { requireAuth, optionalAuth, allowRoles };
