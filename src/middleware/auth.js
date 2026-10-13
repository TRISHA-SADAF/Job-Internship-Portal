
'use strict';

const User = require('../models/User');

async function requireAuth(req, res, next) {
  try {
    if (!req.session.userId) {
      return res.status(401).json({
        success: false,
        message: 'Please log in first.'
      });
    }

    const user = await User.findById(req.session.userId);

    if (!user || user.accountStatus !== 'active') {
      req.session.destroy(() => {});

      return res.status(401).json({
        success: false,
        message: 'Session is invalid. Please log in again.'
      });
    }

    req.user = user;
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

module.exports = { requireAuth, allowRoles };
