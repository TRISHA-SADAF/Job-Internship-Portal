
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
    const name = (await rl.question('Admin name: ')).trim();
    const email = (await rl.question('Admin email: '))
      .trim()
      .toLowerCase();
    const password = await rl.question('Admin password (8+ chars): ');

    if (!name || !email || password.length < 8) {
      throw new Error(
        'Name, email and password (8+ characters) are required.'
      );
    }

    await connectDatabase();

    if (await User.exists({ role: 'admin' })) {
      throw new Error('An admin account already exists.');
    }

    await User.create({
      name,
      email,
      passwordHash: hashPassword(password),
      role: 'admin',
      recruiterVerification: 'verified'
    });

    console.log('Admin created successfully.');
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
  } finally {
    rl.close();
    await disconnectDatabase().catch(() => {});
  }
})();
