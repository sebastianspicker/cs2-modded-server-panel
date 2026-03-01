const fs = require('fs');
const path = require('path');
const { after, before, test } = require('node:test');
const assert = require('node:assert/strict');

let tmpDir;
let dbPath;

async function getPageCsrfToken(port, cookie, pagePath = '/servers') {
  const res = await fetch(`http://127.0.0.1:${port}${pagePath}`, {
    headers: cookie ? { cookie } : {},
  });
  const text = await res.text();
  const m = text.match(/name="csrf-token"\s+content="([^"]+)"/);
  return m?.[1] || null;
}

before(() => {
  tmpDir = fs.mkdtempSync(path.join(process.cwd(), 'tmp-cs2-panel-'));
  dbPath = path.join(tmpDir, 'cspanel.db');

  process.env.NODE_ENV = 'test';
  process.env.DB_PATH = dbPath;
  process.env.DEFAULT_USERNAME = 'testuser';
  process.env.DEFAULT_PASSWORD = 'testpass';
  process.env.ALLOW_DEFAULT_CREDENTIALS = 'true';
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

test('POST /auth/login returns 403 when CSRF is missing', async () => {
  const app = require('../app');

  const server = app.listen(0);
  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'testuser', password: 'testpass' }),
    });

    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.message, 'Invalid CSRF token');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('POST /auth/login sets hardened session cookie when CSRF is valid', async () => {
  const app = require('../app');

  const server = app.listen(0);
  try {
    const { port } = server.address();

    // 1) Get CSRF token from login page
    const getRes = await fetch(`http://127.0.0.1:${port}/`);
    const setCookie = getRes.headers.get('set-cookie');
    assert.ok(setCookie);
    const cookie = setCookie.split(';')[0];

    const text = await getRes.text();
    const m = text.match(/name="csrf-token"\s+content="([^"]+)"/);
    assert.ok(m, 'CSRF token not found in login page (meta tag)');
    const csrfToken = m[1];

    // 2) Login with CSRF
    const res = await fetch(`http://127.0.0.1:${port}/auth/login`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'cookie': cookie,
        'x-csrf-token': csrfToken
      },
      body: JSON.stringify({ username: 'testuser', password: 'testpass' }),
    });

    assert.equal(res.status, 200);

    const loginSetCookie = res.headers.get('set-cookie');
    assert.ok(loginSetCookie);
    assert.ok(/HttpOnly/i.test(loginSetCookie));
    assert.ok(/SameSite=Lax/i.test(loginSetCookie));
    assert.notEqual(loginSetCookie.split(';')[0], cookie, 'session id should rotate on login');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});


test('POST /auth/logout requires CSRF when authenticated', async () => {
  const app = require('../app');

  const server = app.listen(0);
  try {
    const { port } = server.address();
    // 1) Get CSRF token
    const getRes = await fetch(`http://127.0.0.1:${port}/`);
    const getSetCookie = getRes.headers.get('set-cookie');
    const getCookie = getSetCookie.split(';')[0];
    const text = await getRes.text();
    const m = text.match(/name="csrf-token"\s+content="([^"]+)"/);
    assert.ok(m, 'CSRF token not found in login page');
    const csrfToken = m[1];

    const loginRes = await fetch(`http://127.0.0.1:${port}/auth/login`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'cookie': getCookie,
        'x-csrf-token': csrfToken
      },
      body: JSON.stringify({ username: 'testuser', password: 'testpass' }),
    });

    assert.equal(loginRes.status, 200);
    const setCookie = loginRes.headers.get('set-cookie');
    assert.ok(setCookie);
    const cookie = setCookie.split(';')[0];
    const postLoginCsrfToken = await getPageCsrfToken(port, cookie);
    assert.ok(postLoginCsrfToken, 'CSRF token should exist after login');

    const logoutRes = await fetch(`http://127.0.0.1:${port}/auth/logout`, {
      method: 'POST',
      headers: {
        cookie,
        accept: 'application/json',
        'x-csrf-token': postLoginCsrfToken
      },
    });


    assert.equal(logoutRes.status, 200);
    const clearedCookie = logoutRes.headers.get('set-cookie') || '';
    assert.ok(clearedCookie.includes('Max-Age=0') || clearedCookie.includes('Expires=Thu, 01 Jan 1970'));
    const body = await logoutRes.json();
    assert.equal(body.status, 200);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});


test('POST /auth/login returns 401 on invalid password', async () => {
  const app = require('../app');

  const server = app.listen(0);
  try {
    const { port } = server.address();
    const getRes = await fetch(`http://127.0.0.1:${port}/`);
    const cookie = getRes.headers.get('set-cookie')?.split(';')[0];
    const text = await getRes.text();
    const m = text.match(/name="csrf-token"\s+content="([^"]+)"/);
    const csrfToken = m?.[1];

    const res = await fetch(`http://127.0.0.1:${port}/auth/login`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(cookie && { cookie }),
        ...(csrfToken && { 'x-csrf-token': csrfToken }),
      },
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

test('POST /api/restart returns 400 when server_id is missing (authenticated)', async () => {
  const app = require('../app');

  const server = app.listen(0);
  try {
    const { port } = server.address();
    const getRes = await fetch(`http://127.0.0.1:${port}/`);
    const cookie = getRes.headers.get('set-cookie')?.split(';')[0];
    const text = await getRes.text();
    const m = text.match(/name="csrf-token"\s+content="([^"]+)"/);
    const csrfToken = m?.[1];

    const loginRes = await fetch(`http://127.0.0.1:${port}/auth/login`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(cookie && { cookie }),
        ...(csrfToken && { 'x-csrf-token': csrfToken }),
      },
      body: JSON.stringify({ username: 'testuser', password: 'testpass' }),
    });
    assert.equal(loginRes.status, 200);
    const sessionCookie = loginRes.headers.get('set-cookie')?.split(';')[0];
    const postLoginCsrfToken = await getPageCsrfToken(port, sessionCookie);
    assert.ok(postLoginCsrfToken, 'CSRF token should exist after login');

    const res = await fetch(`http://127.0.0.1:${port}/api/restart`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        ...(sessionCookie && { cookie: sessionCookie }),
        ...(postLoginCsrfToken && { 'x-csrf-token': postLoginCsrfToken }),
      },
      body: JSON.stringify({}),
    });

    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error, 'Missing or invalid server_id');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('POST /api/restart rejects malformed server_id (authenticated)', async () => {
  const app = require('../app');

  const server = app.listen(0);
  try {
    const { port } = server.address();
    const getRes = await fetch(`http://127.0.0.1:${port}/`);
    const cookie = getRes.headers.get('set-cookie')?.split(';')[0];
    const text = await getRes.text();
    const m = text.match(/name="csrf-token"\s+content="([^"]+)"/);
    const csrfToken = m?.[1];

    const loginRes = await fetch(`http://127.0.0.1:${port}/auth/login`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(cookie && { cookie }),
        ...(csrfToken && { 'x-csrf-token': csrfToken }),
      },
      body: JSON.stringify({ username: 'testuser', password: 'testpass' }),
    });
    assert.equal(loginRes.status, 200);
    const sessionCookie = loginRes.headers.get('set-cookie')?.split(';')[0];
    const postLoginCsrfToken = await getPageCsrfToken(port, sessionCookie);
    assert.ok(postLoginCsrfToken, 'CSRF token should exist after login');

    const res = await fetch(`http://127.0.0.1:${port}/api/restart`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        ...(sessionCookie && { cookie: sessionCookie }),
        ...(postLoginCsrfToken && { 'x-csrf-token': postLoginCsrfToken }),
      },
      body: JSON.stringify({ server_id: '1abc' }),
    });

    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error, 'Missing or invalid server_id');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('POST /api/rcon blocks command separators (authenticated)', async () => {
  const app = require('../app');

  const server = app.listen(0);
  try {
    const { port } = server.address();
    const getRes = await fetch(`http://127.0.0.1:${port}/`);
    const cookie = getRes.headers.get('set-cookie')?.split(';')[0];
    const text = await getRes.text();
    const m = text.match(/name="csrf-token"\s+content="([^"]+)"/);
    const csrfToken = m?.[1];

    const loginRes = await fetch(`http://127.0.0.1:${port}/auth/login`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(cookie && { cookie }),
        ...(csrfToken && { 'x-csrf-token': csrfToken }),
      },
      body: JSON.stringify({ username: 'testuser', password: 'testpass' }),
    });
    assert.equal(loginRes.status, 200);
    const sessionCookie = loginRes.headers.get('set-cookie')?.split(';')[0];
    const postLoginCsrfToken = await getPageCsrfToken(port, sessionCookie);
    assert.ok(postLoginCsrfToken, 'CSRF token should exist after login');

    const res = await fetch(`http://127.0.0.1:${port}/api/rcon`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        ...(sessionCookie && { cookie: sessionCookie }),
        ...(postLoginCsrfToken && { 'x-csrf-token': postLoginCsrfToken }),
      },
      body: JSON.stringify({ server_id: 1, command: 'quit; status' }),
    });

    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /Command not allowed/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('GET /api/health returns minimal payload when unauthenticated', async () => {
  const app = require('../app');

  const server = app.listen(0);
  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/api/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(Object.keys(body).sort(), ['ok']);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
