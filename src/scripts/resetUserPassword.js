
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
    const email = (await rl.question('Enter student/recruiter email: '))
      .trim()
      .toLowerCase();

    const password = await rl.question('Enter new password (8+ characters): ');
    const confirmPassword = await rl.question('Confirm new password: ');

    if (!email || password.length < 8) {
      throw new Error('Enter a valid email and a password of at least 8 characters.');
    }

    if (password !== confirmPassword) {
      throw new Error('Passwords do not match.');
    }

    await connectDatabase();

    const user = await User.findOne({ email }).select('+passwordHash');

    if (!user) {
      throw new Error('No account found with this email.');
    }

    if (!['student', 'recruiter'].includes(user.role)) {
      throw new Error('This script only resets student or recruiter passwords.');
    }

    user.passwordHash = hashPassword(password);
    await user.save();

    console.log(`Password reset successfully for ${user.role}.`);
    console.log(`Account email: ${user.email}`);
  } catch (err) {
    console.error('Password reset failed:', err.message);
    process.exitCode = 1;
  } finally {
    rl.close();
    await disconnectDatabase().catch(() => {});
  }
})();
