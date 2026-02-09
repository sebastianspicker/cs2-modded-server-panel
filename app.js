const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const RedisStore = require('connect-redis').default;
const { createClient: createRedisClient } = require('redis');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const nodeEnv = process.env.NODE_ENV || 'development';
let sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  if (nodeEnv === 'test') {
    sessionSecret = 'test-session-secret';
  } else {
    sessionSecret = crypto.randomBytes(32).toString('hex');
    console.warn(
      '[security] SESSION_SECRET not set; generated a temporary secret for this process.'
    );
  }
}

const cookieSameSite = (process.env.SESSION_COOKIE_SAMESITE || 'lax').toLowerCase();
const cookieSecure = process.env.SESSION_COOKIE_SECURE === 'true';

let sessionStore;
let redisClient = null;
const redisUrl =
  process.env.REDIS_URL ||
  (process.env.REDIS_HOST
    ? `redis://${process.env.REDIS_HOST}:${process.env.REDIS_PORT || 6379}`
    : null);

if (redisUrl) {
  redisClient = createRedisClient({ url: redisUrl });
  redisClient.on('error', (err) => {
    console.error('[redis] client error', err);
  });
  sessionStore = new RedisStore({ client: redisClient });
  console.log('[session] Using Redis session store.');
} else {
  console.warn('[session] Using in-memory session store. Set REDIS_URL for production use.');
}
app.use(
  session({
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    store: sessionStore,
    cookie: {
      httpOnly: true,
      sameSite: cookieSameSite,
      secure: cookieSecure,
    },
  })
);

app.use((req, res, next) => {
  if (!req.session) return next();
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  res.locals.csrfToken = req.session.csrfToken;
  next();
});

app.use((req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    return next();
  }
  if (!req.session?.user) {
    return next();
  }
  const token = req.get('x-csrf-token') || req.body?._csrf;
  if (!token || token !== req.session.csrfToken) {
    const acceptHeader = req.headers['accept'] || '';
    if (acceptHeader.includes('text/html')) {
      return res.status(403).send('Invalid CSRF token');
    }
    return res.status(403).json({ status: 403, message: 'Invalid CSRF token' });
  }
  return next();
});

// Router direkt importieren (jede Datei endet mit: module.exports = router)
const gameRoutes = require('./routes/game');
const serverRoutes = require('./routes/server');
const authRoutes = require('./routes/auth');
// Neu: Status-Routen importieren
const statusRoutes = require('./routes/status');

const port = process.env.PORT || process.env.DEFAULT_PORT || 3000;

// Serve static files from the 'public' directory
app.use(express.static('public'));

// Set the view engine to EJS
app.set('view engine', 'ejs');

// Routen mounten
app.use('/', authRoutes);
app.use('/', serverRoutes);
app.use('/', gameRoutes);
// Neu: Status-Routen mounten
app.use('/', statusRoutes);

// Root-Route
app.get('/', (req, res) => {
  if (req.session.user) {
    res.redirect('/servers');
  } else {
    res.render('login');
  }
});

if (require.main === module) {
  (async function start() {
    if (redisClient) {
      try {
        await redisClient.connect();
      } catch (err) {
        console.error('[redis] connect failed', err);
        process.exit(1);
      }
    }
    const server = app.listen(port, () => {
      const actualPort = server.address() && server.address().port ? server.address().port : port;
      console.log(`Server is running on ${actualPort}.`);
    });
  })().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = app;
