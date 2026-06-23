// utils/claude.js
// AI provider wrapper. Supports two providers, switchable via .env:
//
//   AI_PROVIDER=github     -> GitHub Models (FREE, uses your GitHub PAT, OpenAI-compatible API)
//   AI_PROVIDER=anthropic  -> Anthropic Claude API (paid, uses ANTHROPIC_API_KEY)
//
// Default is "github" so the app works without any payment.

const PROVIDER = (process.env.AI_PROVIDER || 'github').toLowerCase();

// ───────────────────────── GitHub Models (free) ─────────────────────────
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_MODEL = process.env.GITHUB_MODEL || 'openai/gpt-4o-mini';
const GITHUB_URL = 'https://models.github.ai/inference/chat/completions';

async function callGitHubModels(system, userMessage, opts = {}) {
  if (!GITHUB_TOKEN) {
    throw new Error(
      'GITHUB_TOKEN is not set. Create a free GitHub personal access token with the "models" scope at https://github.com/settings/tokens and add it to your .env file.'
    );
  }

  const res = await fetch(GITHUB_URL, {
    method: 'POST',
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${GITHUB_TOKEN}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: GITHUB_MODEL,
      max_tokens: opts.maxTokens || 4096,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userMessage },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`GitHub Models API error (${res.status}): ${errText || res.statusText}`);
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error('GitHub Models API returned no content.');
  return text;
}

// ───────────────────────── Anthropic Claude (paid) ─────────────────────────
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

async function callAnthropic(system, userMessage, opts = {}) {
  if (!ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not set. Add it to your .env file before using AI_PROVIDER=anthropic.');
  }

  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: opts.maxTokens || 4096,
      system,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Claude API error (${res.status}): ${errText || res.statusText}`);
  }

  const data = await res.json();
  const textBlock = (data.content || []).find((b) => b.type === 'text');
  if (!textBlock) throw new Error('Claude API returned no text content.');
  return textBlock.text;
}

// ───────────────────────── Unified interface ─────────────────────────

async function callClaude(system, userMessage, opts = {}) {
  if (PROVIDER === 'anthropic') return callAnthropic(system, userMessage, opts);
  return callGitHubModels(system, userMessage, opts);
}

async function callClaudeJSON(system, userMessage, opts = {}) {
  // Reinforce JSON-only output, since some free models follow format instructions less strictly.
  const reinforcedSystem = system + '\n\nIMPORTANT: Reply with ONLY the raw JSON object. No markdown, no code fences, no explanation before or after.';
  const raw = await callClaude(reinforcedSystem, userMessage, opts);
  const cleaned = raw.replace(/```json|```/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch (_) {
        /* fall through */
      }
    }
    throw new Error('Failed to parse AI response as JSON: ' + e.message);
  }
}

module.exports = { callClaude, callClaudeJSON, PROVIDER };
