const crypto = require('crypto');
const path = require('path');
const express = require('express');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const RedisStore = require('connect-redis').default;
const { createClient: createRedisClient } = require('redis');

const app = express();
app.disable('x-powered-by');

const bodyLimit = '512kb';
app.use(express.json({ limit: bodyLimit }));
app.use(express.urlencoded({ extended: false, limit: bodyLimit, parameterLimit: 100 }));
app.set('query parser', 'simple');

const nodeEnv = process.env.NODE_ENV || 'development';
const trustProxyRaw = process.env.TRUST_PROXY;
if (trustProxyRaw) {
  if (trustProxyRaw === 'true') {
    app.set('trust proxy', 1);
  } else if (trustProxyRaw === 'false') {
    app.set('trust proxy', false);
  } else {
    const trustProxyNum = parseInt(trustProxyRaw, 10);
    app.set(
      'trust proxy',
      Number.isInteger(trustProxyNum) && trustProxyNum >= 1 ? trustProxyNum : trustProxyRaw
    );
  }
}

let sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  if (nodeEnv === 'test') {
    sessionSecret = 'test-session-secret';
  } else if (nodeEnv === 'production') {
    throw new Error('SESSION_SECRET must be set in production');
  } else {
    sessionSecret = crypto.randomBytes(32).toString('hex');
    console.warn(
      '[security] SESSION_SECRET not set; generated a temporary secret for this process.'
    );
  }
}

const sameSiteRaw = (process.env.SESSION_COOKIE_SAMESITE || 'lax').toLowerCase();
let cookieSameSite = ['strict', 'lax', 'none'].includes(sameSiteRaw) ? sameSiteRaw : 'lax';
const cookieSecure =
  process.env.SESSION_COOKIE_SECURE === 'true' ||
  (nodeEnv === 'production' && process.env.SESSION_COOKIE_SECURE !== 'false');
if (cookieSameSite === 'none' && !cookieSecure) {
  cookieSameSite = 'lax';
  console.warn(
    '[security] SESSION_COOKIE_SAMESITE=none requires secure cookies; using "lax" instead.'
  );
}
if (cookieSecure && nodeEnv === 'production' && app.get('trust proxy') !== 1) {
  console.warn(
    '[session] Secure cookies are enabled. Set TRUST_PROXY=1 when running behind a reverse proxy.'
  );
}

let sessionStore;
let redisClient = null;
const redisPortRaw = process.env.REDIS_PORT || 6379;
const redisPort = (() => {
  const n = Number(redisPortRaw);
  return Number.isInteger(n) && n >= 1 && n <= 65535 ? n : 6379;
})();
const redisUrl =
  process.env.REDIS_URL ||
  (process.env.REDIS_HOST ? `redis://${process.env.REDIS_HOST}:${redisPort}` : null);

if (redisUrl) {
  redisClient = createRedisClient({ url: redisUrl });
  redisClient.on('error', (err) => {
    console.error('[redis] client error', err);
  });
  sessionStore = new RedisStore({ client: redisClient });
  console.log('[session] Using Redis session store.');
} else {
  if (nodeEnv === 'production') {
    throw new Error('REDIS_URL (or REDIS_HOST/REDIS_PORT) is required in production');
  }
  console.warn('[session] Using in-memory session store. Set REDIS_URL for production use.');
}
const sessionMaxAgeMs = (() => {
  const raw = process.env.SESSION_MAX_AGE_MS;
  if (raw == null || raw === '') return 24 * 60 * 60 * 1000;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 24 * 60 * 60 * 1000;
})();
const sessionCookieNameRaw = process.env.SESSION_COOKIE_NAME || 'cspanel.sid';
const sessionCookieName = /^[A-Za-z0-9_.-]{1,128}$/.test(sessionCookieNameRaw)
  ? sessionCookieNameRaw
  : 'cspanel.sid';
const sessionCookieConfig = {
  httpOnly: true,
  sameSite: cookieSameSite,
  secure: cookieSecure,
  maxAge: sessionMaxAgeMs,
  path: '/',
};

app.set('sessionCookieName', sessionCookieName);
app.set('sessionCookieConfig', sessionCookieConfig);

app.use(
  session({
    name: sessionCookieName,
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    store: sessionStore,
    cookie: sessionCookieConfig,
  })
);

const cspOverride = process.env.CONTENT_SECURITY_POLICY;

app.use((req, res, next) => {
  const nonce = crypto.randomBytes(16).toString('base64');
  res.locals.cspNonce = nonce;
  const cspHeader =
    cspOverride ||
    [
      "default-src 'self'",
      `script-src 'self' 'nonce-${nonce}' https://code.jquery.com https://cdn.jsdelivr.net`,
      "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com",
      "font-src 'self' https://cdnjs.cloudflare.com data:",
      "img-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; ');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', cspHeader);
  if (nodeEnv === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
  }
  next();
});

function csrfTokensEqual(expected, supplied) {
  if (typeof expected !== 'string' || typeof supplied !== 'string') return false;
  const expectedBuf = Buffer.from(expected, 'utf8');
  const suppliedBuf = Buffer.from(supplied, 'utf8');
  if (expectedBuf.length !== suppliedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, suppliedBuf);
}

function shouldEnforceCsrf(req) {
  if (req.path === '/auth/login') return true;
  return Boolean(req.session?.user);
}

app.use((req, res, next) => {
  if (!req.session) return next();
  const isPageRequest =
    req.method === 'GET' && !req.path.startsWith('/api/') && path.extname(req.path) === '';
  if (!req.session.csrfToken && (isPageRequest || req.session.user)) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  res.locals.csrfToken = req.session.csrfToken || '';
  next();
});

app.use((req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    return next();
  }
  if (!shouldEnforceCsrf(req)) return next();
  const token = req.get('x-csrf-token') || req.body?._csrf;
  if (!csrfTokensEqual(req.session?.csrfToken, token)) {
    const acceptHeader = req.headers['accept'] || '';
    if (acceptHeader.includes('text/html')) {
      return res.status(403).send('Invalid CSRF token');
    }
    return res.status(403).json({ status: 403, message: 'Invalid CSRF token' });
  }
  return next();
});

const gameRoutes = require('./routes/game');
const serverRoutes = require('./routes/server');
const authRoutes = require('./routes/auth');
const statusRoutes = require('./routes/status');

const portRaw = process.env.PORT || process.env.DEFAULT_PORT || 3000;
const port = (() => {
  const n = Number(portRaw);
  if (Number.isInteger(n) && n >= 0 && n <= 65535) return n;
  const parsed = parseInt(portRaw, 10);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 65535 ? parsed : 3000;
})();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { status: 429, message: 'Too many login attempts; try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/auth/login', loginLimiter);

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Avoid caching authenticated/dynamic content in browser and intermediary caches.
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

// Set the view engine to EJS
app.set('view engine', 'ejs');

// Routen mounten
app.use('/', authRoutes);
app.use('/', serverRoutes);
app.use('/', gameRoutes);
app.use('/', statusRoutes);

// Health check for load balancers / k8s
app.get('/api/health', (req, res) => {
  const health = { ok: true, db: false, redis: false };
  try {
    const { better_sqlite_client } = require('./db');
    better_sqlite_client.prepare('SELECT 1').get();
    health.db = true;
  } catch {
    // db may not be ready or not used
  }
  if (redisClient) {
    health.redis = redisClient.isReady === true;
  } else {
    health.redis = null;
  }
  health.ok = health.db && (health.redis === null || health.redis === true);
  const statusCode = health.ok ? 200 : 503;
  const verboseHealth = process.env.HEALTHCHECK_VERBOSE === 'true' || Boolean(req.session?.user);
  if (!verboseHealth) {
    return res.status(statusCode).json({ ok: health.ok });
  }
  return res.status(statusCode).json(health);
});

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
