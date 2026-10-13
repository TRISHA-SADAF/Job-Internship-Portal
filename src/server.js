
'use strict';

const http = require('node:http');
const { createApp } = require('./app');
const env = require('./config/env');

const {
  connectDatabase,
  disconnectDatabase
} = require('./config/database');

async function startServer() {
  await connectDatabase();

  const server = http.createServer(createApp());

  await new Promise((resolve, reject) => {
    server.once('error', reject);

    server.listen(env.PORT, () => {
      server.removeListener('error', reject);
      resolve();
    });
  });

  console.log(`API listening: http://localhost:${env.PORT}`);

  return server;
}

if (require.main === module) {
  let server;

  startServer()
    .then(s => {
      server = s;
    })
    .catch(async err => {
      console.error('Server startup failed:', err.message);
      await disconnectDatabase().catch(() => {});
      process.exitCode = 1;
    });

  const stop = async () => {
    if (server) {
      await new Promise(resolve => server.close(resolve));
    }

    await disconnectDatabase();
    process.exit(0);
  };

  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

module.exports = { startServer };
