
'use strict';

const session = require('express-session');
const MongoStore = require('connect-mongo');
const env = require('./env');

function createSessionMiddleware() {
  return session({
    name: env.SESSION_NAME,
    secret: env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: env.MONGODB_URI,
      collectionName: 'sessions',
      ttl: 86400
    }),
    cookie: {
      httpOnly: true,
      secure: env.IS_PRODUCTION,
      sameSite: 'lax',
      maxAge: 86400000,
      path: '/'
    }
  });
}

module.exports = { createSessionMiddleware };
