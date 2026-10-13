
'use strict';

const readline = require('node:readline/promises');
const { stdin: input, stdout: output } = require('node:process');

const {
  connectDatabase,
  disconnectDatabase
} = require('../config/database');

const User = require('../models/User');
const { hashPassword } = require('../utils/helpers');

(async () => {
  const rl = readline.createInterface({ input, output });

  try {
    const email = (await rl.question('Existing admin email: '))
      .trim()
      .toLowerCase();

    const password = await rl.question('New admin password (8+ chars): ');

    if (!email || password.length < 8) {
      throw new Error('Enter an email and a password of at least 8 characters.');
    }

    await connectDatabase();

    const admin = await User.findOne({
      email,
      role: 'admin'
    });

    if (!admin) {
      throw new Error('No admin account found with that email.');
    }

    admin.passwordHash = hashPassword(password);
    await admin.save();

    console.log('Admin password reset successfully.');
  } catch (err) {
    console.error('Password reset failed:', err.message);
    process.exitCode = 1;
  } finally {
    rl.close();
    await disconnectDatabase().catch(() => {});
  }
})();
