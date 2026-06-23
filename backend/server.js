// server.js
// AIPlago backend — Express API server.
// Run with: node server.js  (requires Node.js 18+, and a PostgreSQL DATABASE_URL — see README)

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');

const { ready: dbReady } = require('./db/database');
const { attachUser } = require('./middleware/auth');
const authRoutes = require('./routes/auth');
const toolsRoutes = require('./routes/tools');
const uploadRoutes = require('./routes/upload');
const dashboardRoutes = require('./routes/dashboard');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 6000;

// ── Core middleware ──
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json({ limit: '2mb' }));
app.use(attachUser);

// Basic rate limiting to protect the API and AI-spend from abuse.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down and try again shortly.' },
});
app.use('/api/', apiLimiter);

// ── Routes ──
app.use('/api/auth', authRoutes);
app.use('/api/tools', toolsRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/admin', adminRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'AIPlago API', time: new Date().toISOString() });
});

// ── Serve frontend static files (single-deployment mode) ──
const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');
app.use(express.static(FRONTEND_DIR));
app.get(/^(?!\/api\/).*/, (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
});

// ── Generic error handler ──
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Something went wrong on our end. Please try again.' });
});

app.listen(PORT, async () => {
  // Schema init runs in the background as soon as db/database.js is required;
  // we wait for it here just to log readiness clearly (requests arriving
  // before this resolves will simply await the same promise on first query
  // failure paths — in practice this resolves in well under a second).
  try {
    await dbReady;
    console.log('🗄️  Database schema ready.');
  } catch (e) {
    // initSchema already logs and exits on failure; this is just a safety net.
  }

  console.log(`✅ AIPlago backend running on http://localhost:${PORT}`);
  const provider = (process.env.AI_PROVIDER || 'github').toLowerCase();
  if (provider === 'anthropic' && !process.env.ANTHROPIC_API_KEY) {
    console.warn('⚠️  AI_PROVIDER=anthropic but ANTHROPIC_API_KEY is not set — AI tool routes will fail until you add it to .env');
  } else if (provider !== 'anthropic' && !process.env.GITHUB_TOKEN) {
    console.warn('⚠️  GITHUB_TOKEN is not set — AI tool routes will fail until you add a free GitHub personal access token to .env (see README)');
  } else {
    console.log(`ℹ️  AI provider: ${provider}`);
  }
});
