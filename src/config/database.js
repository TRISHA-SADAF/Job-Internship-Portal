'use strict';

const mongoose = require('mongoose');
const env = require('./env');

async function connectDatabase() {
  try {
    await mongoose.connect(env.MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000
    });
  } catch (err) {
    err.message =
      `Could not connect to MongoDB: ${err.message}\n` +
      '  -> Check MONGODB_URI in .env, your internet, and (for Atlas) that your IP is allowed in Network Access.';
    throw err;
  }

  console.log('MongoDB connected.');
}

async function disconnectDatabase() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}

module.exports = { connectDatabase, disconnectDatabase };
