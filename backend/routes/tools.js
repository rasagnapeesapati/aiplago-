// routes/tools.js
const express = require('express');
const { callClaudeJSON } = require('../utils/claude');
const usersDb = require('../db/users');
const { gateToolUsage } = require('../middleware/auth');

const router = express.Router();

function wordCount(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

// After a successful tool call, record usage and (for anonymous users)
// consume one of their free trials. Returns trial info for the response.
async function recordUsage(req, tool, text, resultSummary) {
  const words = wordCount(text);
  if (req.user) {
    await usersDb.logUsage({ userId: req.user.id, tool, inputWords: words, resultSummary });
    return { loggedIn: true };
  } else {
    await usersDb.logUsage({ anonId: req.anonId, tool, inputWords: words, resultSummary });
    const updated = await usersDb.incrementAnonTrial(req.anonId);
    const remaining = Math.max(0, usersDb.FREE_TRIAL_LIMIT - updated.trial_count);
    return { loggedIn: false, trialsRemaining: remaining };
  }
}

function validateText(text, res, minLen = 20) {
  if (!text || typeof text !== 'string' || text.trim().length < minLen) {
    res.status(400).json({ error: `Please provide at least ${minLen} characters of text.` });
    return false;
  }
  if (text.length > 60000) {
    res.status(400).json({ error: 'Text is too long. Please limit submissions to ~10,000 words.' });
    return false;
  }
  return true;
}

// ═══════════════════════════════════════════
//  AI DETECTOR
// ═══════════════════════════════════════════
router.post('/detect', gateToolUsage, async (req, res) => {
  const { text } = req.body;
  if (!validateText(text, res)) return;

  const sys = `You are an expert AI content detection system, similar in purpose to GPTZero, Turnitin's AI indicator, Originality.ai, and Copyleaks. Analyze the given text for linguistic signals of AI generation: low perplexity, low burstiness (uniform sentence length/rhythm), generic transitions, repetitive sentence structure, lack of personal voice, overly balanced/listy structure, and absence of natural human imperfection.

Respond ONLY with a valid JSON object (no markdown, no extra text):
{
  "ai_probability": <number 0-100>,
  "human_probability": <number 0-100>,
  "perplexity_score": <number 0-100, higher = more human-like unpredictability>,
  "burstiness_score": <number 0-100, higher = more natural variation in sentence length>,
  "verdict": "<'Likely AI-Generated' | 'Possibly AI-Generated' | 'Likely Human-Written' | 'Human-Written'>",
  "summary": "<2-sentence explanation of the verdict>",
  "sentence_labels": [<"ai"|"human"|"uncertain"> for each sentence, in order, matching the input text's sentence split>],
  "top_signals": ["<signal1>","<signal2>","<signal3>"]
}`;

  try {
    const d = await callClaudeJSON(sys, text);
    const usage = await recordUsage(req, 'detect', text, { ai_probability: d.ai_probability, verdict: d.verdict });
    res.json({ ...d, usage });
  } catch (err) {
    console.error('Detect error:', err);
    res.status(502).json({ error: 'AI detection failed. Please try again in a moment.' });
  }
});

// ═══════════════════════════════════════════
//  PLAGIARISM CHECKER
// ═══════════════════════════════════════════
router.post('/plagiarism', gateToolUsage, async (req, res) => {
  const { text } = req.body;
  if (!validateText(text, res)) return;

  const sys = `You are an AI-powered originality assessment expert. You do not have live access to a web index, so you assess plagiarism risk based on writing patterns: generic/templated phrasing commonly found in textbooks and common web content, overly common definitions, well-known quotations or passages, encyclopedic phrasing, and structural patterns typical of copied academic or web content. Be clear this is a similarity-risk estimate, not a verified web match.

Respond ONLY with valid JSON (no markdown, no extra text):
{
  "plagiarism_percentage": <number 0-100, your estimated originality risk>,
  "original_percentage": <number 0-100, 100 minus plagiarism_percentage unless they should differ>,
  "verdict": "<string>",
  "summary": "<2-sentence summary explaining the basis for the estimate, noting this is an AI-based pattern assessment>",
  "flagged_phrases": ["<phrase1>","<phrase2>","<phrase3>"],
  "suspected_sources": [
    {"title":"<plausible type of source, e.g. 'Common textbook phrasing' or 'Widely circulated web content'>","similarity":"<percentage as string e.g. 34%>","url":"<omit or leave empty if you cannot verify a real URL>"}
  ],
  "sentence_labels": [<"plagiarized"|"original"> for each sentence, in order, matching the input text's sentence split]
}`;

  try {
    const d = await callClaudeJSON(sys, text);
    const usage = await recordUsage(req, 'plagiarism', text, { plagiarism_percentage: d.plagiarism_percentage });
    res.json({ ...d, usage });
  } catch (err) {
    console.error('Plagiarism error:', err);
    res.status(502).json({ error: 'Plagiarism check failed. Please try again in a moment.' });
  }
});

// ═══════════════════════════════════════════
//  HUMANIZER
// ═══════════════════════════════════════════
router.post('/humanize', gateToolUsage, async (req, res) => {
  const { text, mode = 'general', strength = '2', keepMeaning = true, addVariety = true, naturalFlow = true } = req.body;
  if (!validateText(text, res)) return;

  const strengthMap = { '1': 'lightly', '2': 'moderately', '3': 'aggressively' };

  const sys = `You are an elite human ghostwriter whose job is to completely rewrite AI-generated text so that it reads as authentically human-written, dramatically reducing detectability by AI-content detectors (GPTZero, Turnitin, Copyleaks, Originality.ai, Winston AI, and similar tools).

Apply ALL of these techniques:
1. Vary sentence length deliberately — mix short, punchy sentences with longer, winding ones (burstiness). Avoid uniform sentence rhythm.
2. Use contractions naturally (it's, don't, can't, we're, I've, that's).
3. Replace generic AI phrasing ("furthermore", "it is important to note", "in conclusion", "delve into", "in today's world") with natural, varied transitions or none at all.
4. Introduce subtle human imperfections: occasional em-dashes, parenthetical asides, rhetorical questions, mild redundancy, or a sentence that trails into a new thought.
5. Vary paragraph length and structure — avoid uniform paragraph blocks.
6. Use first or second person where it fits naturally.
7. Avoid overly balanced, listy, or symmetric structures typical of LLM output.
8. Keep word choice natural and varied — avoid repeating the same transition or descriptor twice.
9. Writing mode: ${mode}. Rewrite the text ${strengthMap[strength] || 'moderately'}.
${keepMeaning ? '10. Preserve the original meaning, facts, and key information faithfully.' : ''}
${addVariety ? '11. Add genuine sentence and rhythm variety throughout, not just at the start.' : ''}
${naturalFlow ? '12. Make sure the result reads conversationally and flows the way a real person talks or writes about this topic.' : ''}

Important honesty note for your own output: estimate the resulting human-likeness realistically. Do not claim a perfect, guaranteed score — AI detectors vary and update over time, so describe the result as a strong estimate, not a certainty.

Respond ONLY with valid JSON (no markdown, no backticks):
{
  "humanized_text": "<the fully rewritten text>",
  "human_score": <your honest estimated human-likeness score, 0-100>,
  "ai_detected_estimate": <true|false, your best estimate of whether a typical detector would still flag this>,
  "changes_made": ["<change1>","<change2>","<change3>"]
}`;

  try {
    const d = await callClaudeJSON(sys, `Humanize this text:\n\n${text}`, { maxTokens: 4096 });
    const usage = await recordUsage(req, 'humanize', text, { human_score: d.human_score });
    res.json({ ...d, usage });
  } catch (err) {
    console.error('Humanize error:', err);
    res.status(502).json({ error: 'Humanization failed. Please try again in a moment.' });
  }
});

// ═══════════════════════════════════════════
//  PLAGIARISM-FREE CONTENT GENERATOR
// ═══════════════════════════════════════════
router.post('/generate', gateToolUsage, async (req, res) => {
  const { prompt, type = 'article', tone = 'professional', length = 'medium' } = req.body;
  if (!validateText(prompt, res, 5)) return;

  const lenMap = { short: '120-180 words', medium: '280-350 words', long: '500-650 words' };

  const sys = `You are an expert human content writer. Generate completely original content on the given topic that sounds naturally human-written and avoids common AI writing patterns and clichés.

STRICT RULES:
1. Vary sentence length naturally — mix short and long sentences (burstiness).
2. Use natural transitions, contractions, and conversational phrasing where appropriate.
3. Avoid AI clichés: "delve", "furthermore", "it is worth noting", "in today's world", "it is important to note", "unlock the power of", "in conclusion".
4. Write like a real, knowledgeable person sharing their own perspective.
5. Include specific, concrete details or examples rather than vague generalities.
6. Use first/second person where natural for the content type.
7. Do not copy or closely paraphrase any specific known source — write original analysis and phrasing.
8. Content type: ${type}. Tone: ${tone}. Target length: ${lenMap[length] || lenMap.medium}.

Respond ONLY with a valid JSON object (no markdown):
{
  "content": "<the fully written content>",
  "word_count": <actual word count>
}`;

  try {
    const d = await callClaudeJSON(sys, `Write about: ${prompt}`, { maxTokens: 4096 });
    const usage = await recordUsage(req, 'generate', prompt, { word_count: d.word_count });
    res.json({ ...d, usage });
  } catch (err) {
    console.error('Generate error:', err);
    res.status(502).json({ error: 'Content generation failed. Please try again in a moment.' });
  }
});

// ═══════════════════════════════════════════
//  TRIAL STATUS (for anonymous users, checked on page load)
// ═══════════════════════════════════════════
router.get('/trial-status', async (req, res) => {
  const anonId = req.headers['x-anon-id'];
  if (!anonId) return res.json({ trialsRemaining: 3, limit: usersDb.FREE_TRIAL_LIMIT });
  try {
    const trialsRemaining = await usersDb.anonTrialsRemaining(anonId);
    res.json({ trialsRemaining, limit: usersDb.FREE_TRIAL_LIMIT });
  } catch (err) {
    console.error('Trial status error:', err);
    res.json({ trialsRemaining: 3, limit: usersDb.FREE_TRIAL_LIMIT });
  }
});

module.exports = router;
