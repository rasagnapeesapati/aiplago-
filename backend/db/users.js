// db/users.js
// Data-access helpers for users, usage logging, free-trial tracking, and
// admin functions. All functions are async (Postgres queries over the
// network can't be synchronous) — every caller must `await` these.

const { pool } = require('./database');
const { randomUUID } = require('crypto');

const FREE_TRIAL_LIMIT = 3;

// ── Users ──

async function createUser({ name, email, passwordHash }) {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO users (id, name, email, password_hash, plan) VALUES ($1, $2, $3, $4, 'free')`,
    [id, name, email.toLowerCase().trim(), passwordHash]
  );
  return getUserById(id);
}

async function getUserByEmail(email) {
  const { rows } = await pool.query(`SELECT * FROM users WHERE email = $1`, [email.toLowerCase().trim()]);
  return rows[0] || null;
}

async function getUserById(id) {
  const { rows } = await pool.query(`SELECT * FROM users WHERE id = $1`, [id]);
  return rows[0] || null;
}

async function updateUserPlan(id, plan) {
  await pool.query(`UPDATE users SET plan = $1 WHERE id = $2`, [plan, id]);
  return getUserById(id);
}

// ── Anonymous (pre-signup) free trial tracking ──

async function getAnonTrial(anonId) {
  const { rows } = await pool.query(`SELECT * FROM anon_trials WHERE anon_id = $1`, [anonId]);
  return rows[0] || null;
}

async function incrementAnonTrial(anonId) {
  await pool.query(
    `INSERT INTO anon_trials (anon_id, trial_count) VALUES ($1, 1)
     ON CONFLICT (anon_id) DO UPDATE SET trial_count = anon_trials.trial_count + 1`,
    [anonId]
  );
  return getAnonTrial(anonId);
}

async function anonTrialsRemaining(anonId) {
  const row = await getAnonTrial(anonId);
  const used = row ? row.trial_count : 0;
  return Math.max(0, FREE_TRIAL_LIMIT - used);
}

// ── Usage logging ──

async function logUsage({ userId = null, anonId = null, tool, inputWords = 0, resultSummary = null }) {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO usage_logs (id, user_id, anon_id, tool, input_words, result_json)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, userId, anonId, tool, inputWords, resultSummary ? JSON.stringify(resultSummary) : null]
  );
  return id;
}

async function getUserUsageStats(userId) {
  const totalRes = await pool.query(`SELECT COUNT(*) as c FROM usage_logs WHERE user_id = $1`, [userId]);
  const total = parseInt(totalRes.rows[0].c, 10);

  const byToolRes = await pool.query(
    `SELECT tool, COUNT(*) as count FROM usage_logs WHERE user_id = $1 GROUP BY tool`,
    [userId]
  );
  const byTool = byToolRes.rows.map((r) => ({ tool: r.tool, count: parseInt(r.count, 10) }));

  const wordsRes = await pool.query(
    `SELECT COALESCE(SUM(input_words),0) as words FROM usage_logs WHERE user_id = $1`,
    [userId]
  );
  const wordsProcessed = parseInt(wordsRes.rows[0].words, 10);

  const recentRes = await pool.query(
    `SELECT id, tool, input_words, result_json, created_at FROM usage_logs
     WHERE user_id = $1 ORDER BY created_at DESC LIMIT 25`,
    [userId]
  );

  return { total, byTool, wordsProcessed, recent: recentRes.rows };
}

async function countUserUsageToday(userId) {
  const { rows } = await pool.query(
    `SELECT COUNT(*) as c FROM usage_logs WHERE user_id = $1 AND created_at::date = CURRENT_DATE`,
    [userId]
  );
  return parseInt(rows[0].c, 10);
}

// ── Admin: user management ──

function isAdminUser(user) {
  return !!user && user.is_admin === true;
}

async function listUsers({ search = '', page = 1, pageSize = 25 } = {}) {
  const offset = (page - 1) * pageSize;
  const trimmed = search.trim();

  let totalRes, rowsRes;
  if (trimmed) {
    const like = `%${trimmed}%`;
    totalRes = await pool.query(
      `SELECT COUNT(*) as c FROM users WHERE email ILIKE $1 OR name ILIKE $1`,
      [like]
    );
    rowsRes = await pool.query(
      `SELECT id, name, email, plan, is_admin, is_banned, created_at
       FROM users WHERE email ILIKE $1 OR name ILIKE $1
       ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [like, pageSize, offset]
    );
  } else {
    totalRes = await pool.query(`SELECT COUNT(*) as c FROM users`);
    rowsRes = await pool.query(
      `SELECT id, name, email, plan, is_admin, is_banned, created_at
       FROM users ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
      [pageSize, offset]
    );
  }

  return { users: rowsRes.rows, total: parseInt(totalRes.rows[0].c, 10), page, pageSize };
}

async function setUserBanned(id, banned) {
  await pool.query(`UPDATE users SET is_banned = $1 WHERE id = $2`, [banned, id]);
  return getUserById(id);
}

async function setUserAdmin(id, isAdmin) {
  await pool.query(`UPDATE users SET is_admin = $1 WHERE id = $2`, [isAdmin, id]);
  return getUserById(id);
}

async function deleteUser(id) {
  // usage_logs and payments cascade automatically via ON DELETE CASCADE.
  await pool.query(`DELETE FROM users WHERE id = $1`, [id]);
}

async function getUserDetailWithUsage(id) {
  const user = await getUserById(id);
  if (!user) return null;
  const stats = await getUserUsageStats(id);
  return { user, stats };
}

// ── Admin: platform-wide stats ──

async function getPlatformStats() {
  const totalUsers = parseInt((await pool.query(`SELECT COUNT(*) as c FROM users`)).rows[0].c, 10);
  const totalBanned = parseInt((await pool.query(`SELECT COUNT(*) as c FROM users WHERE is_banned = TRUE`)).rows[0].c, 10);
  const newUsersToday = parseInt((await pool.query(
    `SELECT COUNT(*) as c FROM users WHERE created_at::date = CURRENT_DATE`
  )).rows[0].c, 10);
  const newUsersThisWeek = parseInt((await pool.query(
    `SELECT COUNT(*) as c FROM users WHERE created_at >= now() - interval '7 days'`
  )).rows[0].c, 10);

  const totalScans = parseInt((await pool.query(`SELECT COUNT(*) as c FROM usage_logs`)).rows[0].c, 10);
  const scansToday = parseInt((await pool.query(
    `SELECT COUNT(*) as c FROM usage_logs WHERE created_at::date = CURRENT_DATE`
  )).rows[0].c, 10);
  const totalWords = parseInt((await pool.query(
    `SELECT COALESCE(SUM(input_words),0) as w FROM usage_logs`
  )).rows[0].w, 10);

  const usageByToolRes = await pool.query(
    `SELECT tool, COUNT(*) as count FROM usage_logs GROUP BY tool ORDER BY count DESC`
  );
  const usageByTool = usageByToolRes.rows.map((r) => ({ tool: r.tool, count: parseInt(r.count, 10) }));

  const planBreakdownRes = await pool.query(`SELECT plan, COUNT(*) as count FROM users GROUP BY plan`);
  const planBreakdown = planBreakdownRes.rows.map((r) => ({ plan: r.plan, count: parseInt(r.count, 10) }));

  const signupTrendRes = await pool.query(
    `SELECT created_at::date as day, COUNT(*) as count
     FROM users WHERE created_at >= now() - interval '14 days'
     GROUP BY day ORDER BY day ASC`
  );
  const signupTrend = signupTrendRes.rows.map((r) => ({ day: r.day.toISOString().slice(0, 10), count: parseInt(r.count, 10) }));

  const scanTrendRes = await pool.query(
    `SELECT created_at::date as day, COUNT(*) as count
     FROM usage_logs WHERE created_at >= now() - interval '14 days'
     GROUP BY day ORDER BY day ASC`
  );
  const scanTrend = scanTrendRes.rows.map((r) => ({ day: r.day.toISOString().slice(0, 10), count: parseInt(r.count, 10) }));

  const revenueRes = await pool.query(
    `SELECT COALESCE(SUM(amount_cents),0) as cents FROM payments WHERE status = 'paid'`
  );
  const revenueCents = parseInt(revenueRes.rows[0].cents, 10);

  const revenueByPlanRes = await pool.query(
    `SELECT plan, COALESCE(SUM(amount_cents),0) as cents, COUNT(*) as count
     FROM payments WHERE status = 'paid' GROUP BY plan`
  );
  const revenueByPlan = revenueByPlanRes.rows.map((r) => ({
    plan: r.plan, cents: parseInt(r.cents, 10), count: parseInt(r.count, 10),
  }));

  return {
    totalUsers, totalBanned, newUsersToday, newUsersThisWeek,
    totalScans, scansToday, totalWords,
    usageByTool, planBreakdown, signupTrend, scanTrend,
    revenueCents, revenueByPlan,
  };
}

module.exports = {
  FREE_TRIAL_LIMIT,
  createUser,
  getUserByEmail,
  getUserById,
  updateUserPlan,
  getAnonTrial,
  incrementAnonTrial,
  anonTrialsRemaining,
  logUsage,
  getUserUsageStats,
  countUserUsageToday,
  // admin
  isAdminUser,
  listUsers,
  setUserBanned,
  setUserAdmin,
  deleteUser,
  getUserDetailWithUsage,
  getPlatformStats,
};
