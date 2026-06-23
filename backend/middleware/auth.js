// middleware/auth.js
// Handles JWT verification for logged-in users, and the "3 free trials then
// sign up" gate for anonymous visitors.
//
// NOTE: all DB calls are async (Postgres), so attachUser and gateToolUsage
// are async middleware — make sure Express handles their rejected promises
// (we wrap each in try/catch and call next(err) on failure).

const jwt = require('jsonwebtoken');
const usersDb = require('../db/users');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-this-in-production';

// Attaches req.user if a valid token is present. Does NOT block the request
// if there's no token — that's left to the tool-gating middleware below,
// since anonymous users are allowed limited free trials.
async function attachUser(req, res, next) {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    const token = header.slice(7);
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      const user = await usersDb.getUserById(payload.sub);
      if (user) req.user = user;
    } catch (e) {
      // invalid/expired token, or a DB error — treat as anonymous rather than
      // erroring, so an expired session degrades to the free-trial flow.
    }
  }
  next();
}

// Requires a logged-in user. Use on routes like /dashboard, /auth/me.
function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Please log in to continue.' });
  }
  if (req.user.is_banned === true) {
    return res.status(403).json({ error: 'This account has been suspended. Contact support if you think this is a mistake.' });
  }
  next();
}

// Requires a logged-in admin user. Use on all /api/admin routes.
function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Please log in to continue.' });
  }
  if (req.user.is_admin !== true) {
    return res.status(403).json({ error: 'Admin access required.' });
  }
  next();
}

// Gates access to the AI tools: logged-in users always pass (their plan
// limits, if any, are enforced separately); anonymous users get
// FREE_TRIAL_LIMIT uses tracked by an anon_id the frontend sends.
async function gateToolUsage(req, res, next) {
  if (req.user) {
    if (req.user.is_banned === true) {
      return res.status(403).json({ error: 'This account has been suspended. Contact support if you think this is a mistake.' });
    }
    return next(); // logged-in users are not trial-limited here
  }

  const anonId = req.headers['x-anon-id'] || req.body.anonId;
  if (!anonId) {
    return res.status(400).json({
      error: 'Missing client id. Please refresh the page and try again.',
    });
  }

  try {
    const remaining = await usersDb.anonTrialsRemaining(anonId);
    if (remaining <= 0) {
      return res.status(403).json({
        error: 'trial_exhausted',
        message: 'You have used all 3 free trials. Please sign up to continue using AIPlago.',
      });
    }
    req.anonId = anonId;
    req.trialsRemainingBefore = remaining;
    next();
  } catch (err) {
    next(err);
  }
}

function signToken(user) {
  return jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' });
}

module.exports = { attachUser, requireAuth, requireAdmin, gateToolUsage, signToken, JWT_SECRET };
