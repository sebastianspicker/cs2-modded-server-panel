const express = require('express');
const router = express.Router();

const bcrypt = require('bcrypt');

const { better_sqlite_client } = require('../db');

router.post('/auth/login', (req, res) => {
  const { username, password } = req.body;
  const query = better_sqlite_client.prepare('SELECT * FROM users WHERE username = ?');
  const user = query.get(username);

  if (user) {
    bcrypt.compare(password, user.password, (err, result) => {
      if (err) {
        console.error('[auth] bcrypt compare failed', err);
        return res.status(500).json({ status: 500, message: 'Internal server error' });
      }
      if (result) {
        req.session.user = user;
        return res.status(200).json({ status: 200, message: 'Login successful' });
      }
      return res.status(401).json({ status: 401, message: 'Invalid credentials' });
    });
  } else {
    res.status(401).json({ status: 401, message: 'Invalid credentials' });
  }
});

router.post('/auth/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ status: 500, message: 'Logout failed' });
    }
    const wantsJson =
      (req.headers.accept || '').includes('application/json') || req.xhr === true;
    if (wantsJson) {
      return res.status(200).json({ status: 200, message: 'Logged out' });
    }
    res.redirect('/');
  });
});

module.exports = router;
