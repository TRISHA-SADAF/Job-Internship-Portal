
'use strict';

const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const env = require('../config/env');
const execFileAsync = promisify(execFile);

const projectRoot = path.resolve(__dirname, '../../');

async function runPython(scriptPath, args = []) {
  const { stdout } = await execFileAsync(
    process.env.PYTHON_EXECUTABLE || 'python',
    [scriptPath, ...args],
    {
      cwd: projectRoot,
      timeout: 30000,
      maxBuffer: 1024 * 1024,
      windowsHide: true
    }
  );

  const output = JSON.parse(stdout.trim());

  if (output && output.error) {
    throw new Error(output.error);
  }

  return output;
}

async function analyzeResume(filePath) {
  return runPython(
    path.join(projectRoot, 'python', 'resume_analyzer.py'),
    [filePath]
  );
}

async function matchJobs(studentSkills, jobs) {
  return runPython(
    path.join(
      projectRoot,
      'python',
      'recommendation',
      'job_match_score.py'
    ),
    [JSON.stringify({ studentSkills, jobs })]
  );
}

module.exports = { analyzeResume, matchJobs };
