import fs from 'fs';
import path from 'path';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

let tmpDir: string;
let dbPath: string;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(process.cwd(), 'tmp-entry-cs2-panel-'));
  dbPath = path.join(tmpDir, 'cspanel.db');
});

after(() => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // ignore cleanup errors
  }
});

test('`tsx app.ts` starts and logs listening port', async () => {
  const child = spawn('npx', ['tsx', 'app.ts'], {
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: '0',
      DB_PATH: dbPath,
      DEFAULT_USERNAME: 'testuser',
      DEFAULT_PASSWORD: 'testpass12345',
      ALLOW_DEFAULT_CREDENTIALS: 'true',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';

  child.stdout!.on('data', (chunk: Buffer) => {
    stdout += chunk.toString();
  });
  child.stderr!.on('data', (chunk: Buffer) => {
    stderr += chunk.toString();
  });

  const port = await new Promise<number>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`timeout waiting for startup log.\nstdout:\n${stdout}\nstderr:\n${stderr}`));
    }, 10_000);

    const onOutput = () => {
      const m = stdout.match(/Server is running on (\d+)\./);
      if (m) {
        clearTimeout(timeout);
        resolve(Number(m[1]));
      }
    };

    child.stdout!.on('data', onOutput);
    child.stderr!.on('data', onOutput);
  });

  assert.ok(Number.isInteger(port) && port > 0);

  child.kill('SIGINT');
  await new Promise<void>((resolve) => child.once('exit', () => resolve()));
});

test('`tsx app.ts` fails fast in production without Redis config', async () => {
  const child = spawn('npx', ['tsx', 'app.ts'], {
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: '0',
      DB_PATH: dbPath,
      SESSION_SECRET: 'prod-session-secret',
      RCON_SECRET_KEY: Buffer.alloc(32, 1).toString('base64'),
      ALLOW_DEFAULT_CREDENTIALS: 'false',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stderr = '';
  child.stderr!.on('data', (chunk: Buffer) => {
    stderr += chunk.toString();
  });

  const code = await new Promise<number | null>((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`timeout waiting for process exit.\nstderr:\n${stderr}`));
    }, 10_000);
    child.once('exit', (exitCode) => {
      clearTimeout(timeout);
      resolve(exitCode);
    });
  });

  assert.notEqual(code, 0);
  assert.match(stderr, /REDIS_URL .* required in production/);
});

test('`tsx app.ts` fails fast in production with weak default password', async () => {
  const weakDbPath = path.join(tmpDir, `weak-default-${Date.now()}.db`);
  const child = spawn('npx', ['tsx', 'app.ts'], {
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: '0',
      DB_PATH: weakDbPath,
      SESSION_SECRET: 'prod-session-secret',
      RCON_SECRET_KEY: Buffer.alloc(32, 1).toString('base64'),
      REDIS_URL: 'redis://127.0.0.1:6380',
      ALLOW_DEFAULT_CREDENTIALS: 'true',
      DEFAULT_USERNAME: 'admin',
      DEFAULT_PASSWORD: 'change-me',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stderr = '';
  child.stderr!.on('data', (chunk: Buffer) => {
    stderr += chunk.toString();
  });

  const code = await new Promise<number | null>((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`timeout waiting for process exit.\nstderr:\n${stderr}`));
    }, 10_000);
    child.once('exit', (exitCode) => {
      clearTimeout(timeout);
      resolve(exitCode);
    });
  });

  assert.notEqual(code, 0);
  assert.match(stderr, /DEFAULT_PASSWORD uses a weak placeholder value in production/);
});

test('`tsx app.ts` fails fast in production when explicit DB_PATH is invalid', async () => {
  const child = spawn('npx', ['tsx', 'app.ts'], {
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: '0',
      DB_PATH: '/dev/null/cspanel.db',
      SESSION_SECRET: 'prod-session-secret',
      RCON_SECRET_KEY: Buffer.alloc(32, 1).toString('base64'),
      REDIS_URL: 'redis://127.0.0.1:6380',
      ALLOW_DEFAULT_CREDENTIALS: 'false',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stderr = '';
  child.stderr!.on('data', (chunk: Buffer) => {
    stderr += chunk.toString();
  });

  const code = await new Promise<number | null>((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`timeout waiting for process exit.\nstderr:\n${stderr}`));
    }, 10_000);
    child.once('exit', (exitCode) => {
      clearTimeout(timeout);
      resolve(exitCode);
    });
  });

  assert.notEqual(code, 0);
  assert.match(stderr, /Failed to open DB at .*\/dev\/null\/cspanel\.db/);
});
