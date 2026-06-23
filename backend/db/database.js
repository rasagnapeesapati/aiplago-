// db/database.js
// Database layer for AIPlago using PostgreSQL (via the `pg` driver).
//
// Why Postgres instead of SQLite: most free hosting platforms (e.g. Render's
// free web service tier) wipe the local filesystem on every restart/sleep,
// which would silently delete all users and usage data. A separate Postgres
// database (Render's free Postgres, Supabase, Neon, etc.) persists
// independently of the web service's filesystem, so signups/usage survive
// restarts, deploys, and free-tier sleep cycles.
//
// Set DATABASE_URL in your .env to the connection string your host gives you.

const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL is not set. Add your PostgreSQL connection string to .env (see README).');
  process.exit(1);
}

// Most free Postgres providers (Render, Supabase, Neon) require SSL but use
// a certificate chain that Node doesn't always trust automatically.
// `rejectUnauthorized: false` is the standard, accepted setting for this —
// the connection is still encrypted, this just skips strict CA verification.
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false },
});

pool.on('error', (err) => {
  console.error('Unexpected database pool error:', err);
});

// ───────────────────────── SCHEMA ─────────────────────────
// Runs on startup. All statements are idempotent (IF NOT EXISTS / safe
// migrations), so this is safe to run every time the server boots.

async function initSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      email         TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      plan          TEXT NOT NULL DEFAULT 'free',
      is_admin      BOOLEAN NOT NULL DEFAULT FALSE,
      is_banned     BOOLEAN NOT NULL DEFAULT FALSE,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  // Lightweight migration for databases created before is_admin/is_banned existed.
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_banned BOOLEAN NOT NULL DEFAULT FALSE;`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS usage_logs (
      id          TEXT PRIMARY KEY,
      user_id     TEXT REFERENCES users(id) ON DELETE CASCADE,
      anon_id     TEXT,
      tool        TEXT NOT NULL,
      input_words INTEGER NOT NULL DEFAULT 0,
      result_json TEXT,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS anon_trials (
      anon_id     TEXT PRIMARY KEY,
      trial_count INTEGER NOT NULL DEFAULT 0,
      first_seen  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_usage_user ON usage_logs(user_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_usage_anon ON usage_logs(anon_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_usage_created ON usage_logs(created_at);`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS payments (
      id           TEXT PRIMARY KEY,
      user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      plan         TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      currency     TEXT NOT NULL DEFAULT 'usd',
      status       TEXT NOT NULL DEFAULT 'paid',
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);`);
}

// Schema initialization is kicked off once and awaited by server.js before
// the server starts accepting requests (see server.js).
const ready = initSchema().catch((err) => {
  console.error('❌ Failed to initialize database schema:', err.message);
  process.exit(1);
});

module.exports = { pool, ready };
