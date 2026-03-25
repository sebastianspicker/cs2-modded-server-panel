import express from 'express';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { better_sqlite_client } from '../db';

const router = express.Router();

interface UserRow {
  id: number;
  username: string;
  password: string;
}

const DUMMY_PASSWORD_HASH = '$2b$10$G6s7QvNxy4/Fq7l6f5Yx8eSE0qVYCSvJzpuG1HsfrN7kYMva9nQxW';

router.post('/auth/login', async (req, res) => {
  const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  if (!username || !password) {
    return res.status(400).json({ status: 400, message: 'Username and password are required' });
  }
  if (username.length > 255) {
    return res.status(400).json({ status: 400, message: 'Username too long' });
  }
  if (password.length < 12) {
    return res
      .status(400)
      .json({ status: 400, message: 'Password must be at least 12 characters' });
  }
  if (password.length > 1024) {
    return res.status(400).json({ status: 400, message: 'Password too long' });
  }

  const query = better_sqlite_client.prepare('SELECT * FROM users WHERE username = ?');
  const user = query.get(username) as UserRow | undefined;
  const passwordHash = user?.password || DUMMY_PASSWORD_HASH;

  let passwordMatches = false;
  try {
    passwordMatches = await bcrypt.compare(password, passwordHash);
  } catch (err) {
    console.error('[auth] bcrypt compare failed', err);
    return res.status(500).json({ status: 500, message: 'Internal server error' });
  }

  if (!user || !passwordMatches) {
    console.warn(`[auth] failed login for username="${username}" ip=${req.ip}`);
    return res.status(401).json({ status: 401, message: 'Invalid credentials' });
  }

  return req.session.regenerate((regenErr) => {
    if (regenErr) {
      console.error('[auth] session regenerate failed', regenErr);
      return res.status(500).json({ status: 500, message: 'Internal server error' });
    }
    console.log(`[auth] login username="${user.username}" ip=${req.ip}`);
    req.session.user = { id: user.id, username: user.username };
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
    return req.session.save((saveErr) => {
      if (saveErr) {
        console.error('[auth] session save failed', saveErr);
        return res.status(500).json({ status: 500, message: 'Internal server error' });
      }
      return res.status(200).json({ status: 200, message: 'Login successful' });
    });
  });
});

router.post('/auth/logout', (req, res) => {
  const sessionCookieName = req.app.get('sessionCookieName') || 'cspanel.sid';
  const sessionCookieConfig = req.app.get('sessionCookieConfig') || { path: '/' };
  req.session.destroy((err) => {
    if (err) {
      console.error('[auth] session destroy failed', err);
      return res.status(500).json({ status: 500, message: 'Logout failed' });
    }
    res.clearCookie(sessionCookieName, {
      httpOnly: sessionCookieConfig.httpOnly,
      sameSite: sessionCookieConfig.sameSite,
      secure: sessionCookieConfig.secure,
      path: sessionCookieConfig.path || '/',
    });
    const wantsJson = (req.headers.accept || '').includes('application/json') || req.xhr === true;
    if (wantsJson) {
      return res.status(200).json({ status: 200, message: 'Logged out' });
    }
    res.redirect('/');
  });
});

export default router;
