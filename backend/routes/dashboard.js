// routes/dashboard.js
const express = require('express');
const usersDb = require('../db/users');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/stats', requireAuth, async (req, res) => {
  try {
    const stats = await usersDb.getUserUsageStats(req.user.id);
    const todayCount = await usersDb.countUserUsageToday(req.user.id);

    res.json({
      plan: req.user.plan,
      totalScans: stats.total,
      wordsProcessed: stats.wordsProcessed,
      usageByTool: stats.byTool,
      recentActivity: stats.recent.map((r) => ({
        id: r.id,
        tool: r.tool,
        words: r.input_words,
        summary: r.result_json ? JSON.parse(r.result_json) : null,
        createdAt: r.created_at,
      })),
      scansToday: todayCount,
    });
  } catch (err) {
    console.error('Dashboard stats error:', err);
    res.status(500).json({ error: 'Could not load your dashboard right now. Please try again.' });
  }
});

module.exports = router;
