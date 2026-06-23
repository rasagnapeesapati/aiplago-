// routes/admin.js
// Admin-only routes: platform-wide stats, user search/list, ban/unban,
// plan changes, and user deletion. All routes require requireAdmin.

const express = require('express');
const usersDb = require('../db/users');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Strip password_hash before sending any user object back to the client.
function sanitize(user) {
  if (!user) return user;
  const { password_hash, ...rest } = user;
  return rest;
}

// All admin routes require a logged-in admin user.
router.use(requireAuth, requireAdmin);

// ── Platform-wide stats ──
router.get('/stats', async (req, res) => {
  try {
    const stats = await usersDb.getPlatformStats();
    res.json(stats);
  } catch (err) {
    console.error('Admin stats error:', err);
    res.status(500).json({ error: 'Could not load platform stats.' });
  }
});

// ── List / search users ──
router.get('/users', async (req, res) => {
  try {
    const search = req.query.search || '';
    const page = parseInt(req.query.page, 10) || 1;
    const pageSize = Math.min(parseInt(req.query.pageSize, 10) || 25, 100);
    const result = await usersDb.listUsers({ search, page, pageSize });
    res.json(result);
  } catch (err) {
    console.error('Admin list users error:', err);
    res.status(500).json({ error: 'Could not load users.' });
  }
});

// ── Get one user's detail + usage ──
router.get('/users/:id', async (req, res) => {
  try {
    const detail = await usersDb.getUserDetailWithUsage(req.params.id);
    if (!detail) return res.status(404).json({ error: 'User not found.' });
    res.json({ ...detail, user: sanitize(detail.user) });
  } catch (err) {
    console.error('Admin get user error:', err);
    res.status(500).json({ error: 'Could not load this user.' });
  }
});

// ── Ban / unban ──
router.post('/users/:id/ban', async (req, res) => {
  try {
    const target = await usersDb.getUserById(req.params.id);
    if (!target) return res.status(404).json({ error: 'User not found.' });
    if (target.id === req.user.id) {
      return res.status(400).json({ error: 'You cannot ban your own account.' });
    }
    const updated = await usersDb.setUserBanned(req.params.id, true);
    res.json({ user: sanitize(updated) });
  } catch (err) {
    console.error('Admin ban error:', err);
    res.status(500).json({ error: 'Could not ban this user.' });
  }
});

router.post('/users/:id/unban', async (req, res) => {
  try {
    const target = await usersDb.getUserById(req.params.id);
    if (!target) return res.status(404).json({ error: 'User not found.' });
    const updated = await usersDb.setUserBanned(req.params.id, false);
    res.json({ user: sanitize(updated) });
  } catch (err) {
    console.error('Admin unban error:', err);
    res.status(500).json({ error: 'Could not unban this user.' });
  }
});

// ── Change plan ──
router.post('/users/:id/plan', async (req, res) => {
  try {
    const { plan } = req.body;
    const allowed = ['free', 'pro', 'business'];
    if (!allowed.includes(plan)) {
      return res.status(400).json({ error: `Plan must be one of: ${allowed.join(', ')}` });
    }
    const target = await usersDb.getUserById(req.params.id);
    if (!target) return res.status(404).json({ error: 'User not found.' });
    const updated = await usersDb.updateUserPlan(req.params.id, plan);
    res.json({ user: sanitize(updated) });
  } catch (err) {
    console.error('Admin plan change error:', err);
    res.status(500).json({ error: 'Could not update this user\'s plan.' });
  }
});

// ── Grant / revoke admin ──
router.post('/users/:id/admin', async (req, res) => {
  try {
    const { isAdmin } = req.body;
    const target = await usersDb.getUserById(req.params.id);
    if (!target) return res.status(404).json({ error: 'User not found.' });
    if (target.id === req.user.id && !isAdmin) {
      return res.status(400).json({ error: 'You cannot remove your own admin access.' });
    }
    const updated = await usersDb.setUserAdmin(req.params.id, !!isAdmin);
    res.json({ user: sanitize(updated) });
  } catch (err) {
    console.error('Admin grant/revoke error:', err);
    res.status(500).json({ error: 'Could not update admin access for this user.' });
  }
});

// ── Delete user ──
router.delete('/users/:id', async (req, res) => {
  try {
    const target = await usersDb.getUserById(req.params.id);
    if (!target) return res.status(404).json({ error: 'User not found.' });
    if (target.id === req.user.id) {
      return res.status(400).json({ error: 'You cannot delete your own account from here.' });
    }
    await usersDb.deleteUser(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error('Admin delete error:', err);
    res.status(500).json({ error: 'Could not delete this user.' });
  }
});

module.exports = router;
