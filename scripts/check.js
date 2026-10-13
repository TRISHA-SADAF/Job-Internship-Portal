
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const files = [];

function walk(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, item.name);

    if (item.isDirectory()) {
      walk(p);
    } else if (p.endsWith('.js')) {
      files.push(p);
    }
  }
}

walk(path.join(root, 'src'));

for (const file of files) {
  const result = spawnSync(
    process.execPath,
    ['--check', file],
    { encoding: 'utf8' }
  );

  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout);
    process.exit(result.status || 1);
  }
}

console.log(`Syntax check passed for ${files.length} JavaScript files.`);
