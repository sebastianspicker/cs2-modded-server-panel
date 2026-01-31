const fs = require('fs');
const os = require('os');
const path = require('path');
const { after, before, test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');

let tmpDir;
let dbPath;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cs2-panel-'));
  dbPath = path.join(tmpDir, 'cspanel.db');
});

after(() => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // ignore cleanup errors
  }
});

test('`node app.js` starts and logs listening port', async () => {
  const child = spawn(process.execPath, ['app.js'], {
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: '0',
      DB_PATH: dbPath,
      DEFAULT_USERNAME: 'testuser',
      DEFAULT_PASSWORD: 'testpass',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';

  child.stdout.on('data', (chunk) => {
    stdout += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  const port = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`timeout waiting for startup log.\nstdout:\n${stdout}\nstderr:\n${stderr}`));
    }, 10_000);

    const onOutput = () => {
      const m = stdout.match(/Server is running on (\\d+)\\./);
      if (m) {
        clearTimeout(timeout);
        resolve(Number(m[1]));
      }
    };

    child.stdout.on('data', onOutput);
    child.stderr.on('data', onOutput);
  });

  assert.ok(Number.isInteger(port) && port > 0);

  child.kill('SIGINT');
  await new Promise((resolve) => child.once('exit', resolve));
});
