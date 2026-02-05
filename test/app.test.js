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
  process.env.SESSION_SECRET = 'test-session-secret';
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

test('POST /auth/login sets hardened session cookie', async () => {
  const app = require('../app');

  const server = app.listen(0);
  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'testuser', password: 'testpass' }),
    });

    assert.equal(res.status, 200);

    const setCookie = res.headers.get('set-cookie');
    assert.ok(setCookie);
    assert.ok(/HttpOnly/i.test(setCookie));
    assert.ok(/SameSite=Lax/i.test(setCookie));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('POST /auth/logout requires CSRF when authenticated', async () => {
  const app = require('../app');

  const server = app.listen(0);
  try {
    const { port } = server.address();
    const loginRes = await fetch(`http://127.0.0.1:${port}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'testuser', password: 'testpass' }),
    });

    assert.equal(loginRes.status, 200);
    const setCookie = loginRes.headers.get('set-cookie');
    assert.ok(setCookie);
    const cookie = setCookie.split(';')[0];

    const logoutRes = await fetch(`http://127.0.0.1:${port}/auth/logout`, {
      method: 'POST',
      headers: { cookie, accept: 'application/json' },
    });

    assert.equal(logoutRes.status, 403);
    const body = await logoutRes.json();
    assert.equal(body.status, 403);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('POST /auth/login returns 401 on invalid password', async () => {
  const app = require('../app');

  const server = app.listen(0);
  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'testuser', password: 'wrongpass' }),
    });

    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.status, 401);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('POST /api/restart returns unauthorized without session', async () => {
  const app = require('../app');

  const server = app.listen(0);
  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/api/restart`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ server_id: 1 }),
    });

    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.status, 401);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
