import fs from 'fs';
import path from 'path';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import type { Express } from 'express';

let tmpDir: string;
let dbPath: string;
let app: Express;

async function getPageCsrfToken(
  port: number,
  cookie?: string | null,
  pagePath = '/servers'
): Promise<string | null> {
  const res = await fetch(`http://127.0.0.1:${port}${pagePath}`, {
    headers: cookie ? { cookie } : {},
  });
  const text = await res.text();
  const m = text.match(/name="csrf-token"\s+content="([^"]+)"/);
  return m?.[1] || null;
}

async function getLoginPageCsrfAndCookie(
  port: number
): Promise<{ cookie: string; csrfToken: string }> {
  const res = await fetch(`http://127.0.0.1:${port}/`);
  const setCookie = res.headers.get('set-cookie');
  assert.ok(setCookie, 'Login page should set a cookie');
  const cookie = setCookie.split(';')[0]!;
  const text = await res.text();
  const m = text.match(/name="csrf-token"\s+content="([^"]+)"/);
  assert.ok(m, 'CSRF token not found in login page');
  return { cookie, csrfToken: m[1]! };
}

async function loginAndGetSession(
  port: number
): Promise<{ sessionCookie: string; csrfToken: string }> {
  const { cookie, csrfToken: initialCsrfToken } = await getLoginPageCsrfAndCookie(port);
  const loginRes = await fetch(`http://127.0.0.1:${port}/auth/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie,
      'x-csrf-token': initialCsrfToken,
    },
    body: JSON.stringify({ username: 'testuser', password: 'testpass12345' }),
  });
  assert.equal(loginRes.status, 200);
  const sessionCookie = loginRes.headers.get('set-cookie')?.split(';')[0] ?? '';
  const csrfToken = await getPageCsrfToken(port, sessionCookie);
  assert.ok(csrfToken, 'CSRF token should exist after login');
  return { sessionCookie, csrfToken };
}

before(async () => {
  tmpDir = fs.mkdtempSync(path.join(process.cwd(), 'tmp-cs2-panel-'));
  dbPath = path.join(tmpDir, 'cspanel.db');

  process.env.NODE_ENV = 'test';
  process.env.DB_PATH = dbPath;
  process.env.DEFAULT_USERNAME = 'testuser';
  process.env.DEFAULT_PASSWORD = 'testpass12345';
  process.env.ALLOW_DEFAULT_CREDENTIALS = 'true';
  process.env.SESSION_SECRET = 'test-session-secret';

  const mod = await import('../app');
  app = mod.default;
});

after(() => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // ignore cleanup errors
  }
});

test('GET / returns login page (not authenticated)', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(res.status, 200);

    const text = await res.text();
    assert.ok(text.toLowerCase().includes('login'));
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('POST /auth/login returns 403 when CSRF is missing', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'testuser', password: 'testpass12345' }),
    });

    assert.equal(res.status, 403);
    const body = (await res.json()) as Record<string, unknown>;
    assert.equal(body.message, 'Invalid CSRF token');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('POST /auth/login sets hardened session cookie when CSRF is valid', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const { cookie, csrfToken } = await getLoginPageCsrfAndCookie(port);

    const res = await fetch(`http://127.0.0.1:${port}/auth/login`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({ username: 'testuser', password: 'testpass12345' }),
    });

    assert.equal(res.status, 200);

    const loginSetCookie = res.headers.get('set-cookie');
    assert.ok(loginSetCookie);
    assert.ok(/HttpOnly/i.test(loginSetCookie));
    assert.ok(/SameSite=Lax/i.test(loginSetCookie));
    assert.notEqual(loginSetCookie.split(';')[0], cookie, 'session id should rotate on login');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('POST /auth/logout requires CSRF when authenticated', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const { sessionCookie, csrfToken: postLoginCsrfToken } = await loginAndGetSession(port);

    const logoutRes = await fetch(`http://127.0.0.1:${port}/auth/logout`, {
      method: 'POST',
      headers: {
        cookie: sessionCookie,
        accept: 'application/json',
        'x-csrf-token': postLoginCsrfToken,
      },
    });

    assert.equal(logoutRes.status, 200);
    const clearedCookie = logoutRes.headers.get('set-cookie') || '';
    assert.ok(
      clearedCookie.includes('Max-Age=0') || clearedCookie.includes('Expires=Thu, 01 Jan 1970')
    );
    const body = (await logoutRes.json()) as Record<string, unknown>;
    assert.equal(body.status, 200);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('POST /auth/login returns 401 on invalid password', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const { cookie, csrfToken } = await getLoginPageCsrfAndCookie(port);

    const res = await fetch(`http://127.0.0.1:${port}/auth/login`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({ username: 'testuser', password: 'wrongpassword1' }),
    });

    assert.equal(res.status, 401);
    const body = (await res.json()) as Record<string, unknown>;
    assert.equal(body.status, 401);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('POST /api/restart returns unauthorized without session', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/api/restart`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ server_id: 1 }),
    });

    assert.equal(res.status, 401);
    const body = (await res.json()) as Record<string, unknown>;
    assert.equal(body.status, 401);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('POST /api/restart returns 400 when server_id is missing (authenticated)', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const { sessionCookie, csrfToken } = await loginAndGetSession(port);

    const res = await fetch(`http://127.0.0.1:${port}/api/restart`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        cookie: sessionCookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({}),
    });

    assert.equal(res.status, 400);
    const body = (await res.json()) as Record<string, unknown>;
    assert.equal(body.error, 'Missing or invalid server_id');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('POST /api/restart rejects malformed server_id (authenticated)', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const { sessionCookie, csrfToken } = await loginAndGetSession(port);

    const res = await fetch(`http://127.0.0.1:${port}/api/restart`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        cookie: sessionCookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({ server_id: '1abc' }),
    });

    assert.equal(res.status, 400);
    const body = (await res.json()) as Record<string, unknown>;
    assert.equal(body.error, 'Missing or invalid server_id');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('POST /api/rcon blocks command separators (authenticated)', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const { sessionCookie, csrfToken } = await loginAndGetSession(port);

    const res = await fetch(`http://127.0.0.1:${port}/api/rcon`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        cookie: sessionCookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({ server_id: 1, command: 'quit; status' }),
    });

    assert.equal(res.status, 400);
    const body = (await res.json()) as Record<string, unknown>;
    assert.match(body.error as string, /Command not allowed/);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('GET /api/health returns minimal payload when unauthenticated', async () => {
  const server: Server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/api/health`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as Record<string, unknown>;
    assert.deepEqual(Object.keys(body).sort(), ['ok']);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
