'use strict';

const session = require('express-session');
const connectMongo = require('connect-mongo');

const MongoStore = connectMongo.MongoStore || connectMongo.default || connectMongo;
const mongoose = require('mongoose');
const env = require('./env');

function createSessionMiddleware() {
  const options = {
    name: env.SESSION_NAME,
    secret: env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: env.IS_PRODUCTION,
      sameSite: 'lax',
      maxAge: 86400000,
      path: '/'
    }
  };

  if (!env.IS_TEST) {
    options.store = MongoStore.create({
      client: mongoose.connection.getClient(),
      collectionName: 'sessions',
      ttl: 86400
    });
  }

  return session(options);
}

module.exports = { createSessionMiddleware };
