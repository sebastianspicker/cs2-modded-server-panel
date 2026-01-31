const fs = require('fs');
const os = require('os');
const path = require('path');
const { after, before, test } = require('node:test');
const assert = require('node:assert/strict');

let tmpDir;
let dbPath;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cs2-panel-'));
  dbPath = path.join(tmpDir, 'cspanel.db');

  process.env.NODE_ENV = 'test';
  process.env.DB_PATH = dbPath;
  process.env.DEFAULT_USERNAME = 'testuser';
  process.env.DEFAULT_PASSWORD = 'testpass';
});

after(() => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // ignore cleanup errors
  }
});

test('GET / returns login page (not authenticated)', async () => {
  const app = require('../app');

  const server = app.listen(0);
  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(res.status, 200);

    const text = await res.text();
    assert.ok(text.toLowerCase().includes('login'));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
