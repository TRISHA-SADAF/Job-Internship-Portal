'use strict';

const express = require('express');
const router = express.Router();

router.get('/health', (_req, res) => res.json({
  success: true,
  data: {
    status: 'ok',
    timestamp: new Date().toISOString()
  }
}));

router.use(require('./auth'));
router.use(require('./profile'));
router.use(require('./recruiters'));
router.use(require('./jobs'));
router.use(require('./applications'));
router.use(require('./notifications'));
router.use(require('./admin'));

module.exports = router;
