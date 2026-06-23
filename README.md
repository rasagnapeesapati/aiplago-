# AIPlago

An AI-powered suite for checking text for AI-generated patterns, assessing plagiarism/originality risk, rewriting AI text so it reads naturally human, and generating fresh content — with file upload, authentication, a free-trial gate, a usage dashboard, and an admin dashboard.

```
aiplago/
├── backend/      Node.js + Express API, PostgreSQL database, AI provider integration
└── frontend/     Static HTML/CSS/JS site (landing page, tools, dashboard, admin)
```

## 1. Requirements

- **Node.js 18 or later.**
- **A PostgreSQL database.** This is required — see step 2 for free options. (Earlier versions of this project used SQLite, but most free hosting platforms wipe their local filesystem on every restart/sleep cycle, which would silently delete every signup. A separate Postgres database persists independently of the web service, so it survives restarts, deploys, and free-tier sleep — necessary if real strangers are going to sign up and you want their accounts to still exist tomorrow.)
- **A free GitHub account** for AI features — costs nothing (see step 3).

## 2. Get a free PostgreSQL database

Pick one — all have a genuinely free tier with no time limit (as of this writing):

- **Supabase** — supabase.com → New project → Settings → Database → copy the **Connection string** (URI format, "Connection pooling" tab works well for this app)
- **Neon** — neon.tech → New project → copy the connection string shown on the dashboard
- **Render Postgres** — render.com → New → PostgreSQL → copy the **External Database URL**

Whichever you pick, you'll end up with a string that looks like:
```
postgresql://username:password@some-host.com:5432/some-dbname
```
Keep this — it goes into `DATABASE_URL` in step 4.

## 3. Get a free AI key (GitHub Models)

No payment needed. This uses GitHub's own free AI inference API.

1. Go to github.com/settings/tokens
2. Click **Generate new token → Generate new token (classic)**
3. Name it anything (e.g. "AIPlago")
4. Check the **`models`** scope (that's the only one needed)
5. Click **Generate token** and copy it (starts with `github_pat_...`)

(Optional: if you'd rather use Anthropic's Claude API directly later — better quality, but paid — see the `.env.example` file for the alternate config; just flip `AI_PROVIDER` to `anthropic`.)

## 4. Backend setup (local)

```bash
cd backend
npm install
```

Copy the example environment file:
- **Windows (Command Prompt):** `copy .env.example .env`
- **Windows (PowerShell):** `Copy-Item .env.example .env`
- **Mac/Linux:** `cp .env.example .env`

Open `.env` and fill in:
```
DATABASE_URL=postgresql://username:password@some-host.com:5432/some-dbname
AI_PROVIDER=github
GITHUB_TOKEN=github_pat_your_real_token_here
JWT_SECRET=type-any-long-random-string-here
PORT=4000
```

`JWT_SECRET` isn't an account or external key — it's just a random string your own server uses to sign login sessions. Make up anything long and random, or generate one with:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Start the server
```bash
npm start
```

You should see:
```
🗄️  Database schema ready.
✅ AIPlago backend running on http://localhost:4000
ℹ️  AI provider: github
```

The first run automatically creates all the database tables in your Postgres instance — nothing to set up by hand.

The backend also serves the `frontend/` folder, so once it's running, open **http://localhost:4000** — the whole site works from that one URL: landing page, tools, login/signup, dashboard, admin.

**Note on GitHub Models:** it's genuinely free but rate-limited (requests per minute/day) since it's meant for prototyping — fine for development and light real-world traffic. If you outgrow it, flip `AI_PROVIDER` to `anthropic` in `.env` — no code changes needed.

## 5. How the free-trial system works

- Anyone visiting the site gets **3 free tool uses** without signing up, tracked by an anonymous browser ID (stored in their browser's localStorage).
- After 3 uses, every tool call is blocked with a clear prompt to sign up.
- Once someone creates an account and logs in, the trial limit no longer applies — their usage is tracked on their account instead, and shown on their dashboard.

This logic lives in `backend/middleware/auth.js` (`gateToolUsage`) and `backend/db/users.js` if you want to change the free-trial count or add paid-plan limits later.

## 6. Admin dashboard

AIPlago includes a full admin dashboard for managing your site once it's live — platform-wide stats, signup/scan trends, and user management (search, ban/unban, change plan, grant admin, delete).

### Creating your first admin account

1. Sign up normally on the site (the regular signup form) with the account you want to be the admin.
2. In your terminal, from inside `backend/`, run:
   ```bash
   node scripts/make-admin.js you@example.com
   ```
3. Log out and log back in on the site (this refreshes your session to include admin status).
4. You'll now see an **Admin** link in the navigation bar, leading to `/pages/admin.html`.

This script is the only way to create the *first* admin — after that, admins can promote other users to admin directly from the admin dashboard's user management panel.

### What the admin dashboard shows
- Total users, new signups today/this week, total scans, words processed, banned accounts, revenue (once payments are wired up), and the most-used tool.
- Signup and scan trend charts for the last 14 days.
- Usage-by-tool and plan breakdown.
- A searchable, paginated table of every user, with a detail panel to: change their plan, ban/unban them, grant or remove admin access, or permanently delete their account.

### Notes
- Banned users are blocked from logging in and from using any tool (even mid-session, their next request will be rejected).
- An admin cannot ban, demote, or delete their own account through the dashboard — this prevents accidentally locking yourself out.
- All admin API routes (`/api/admin/*`) require a valid login token belonging to a user with `is_admin = true` in the database — enforced server-side, not just hidden in the UI.

## 7. Project structure

### Backend (`/backend`)
```
server.js                 Express app entry point — waits for DB schema before listening
db/database.js            PostgreSQL connection pool + schema setup (auto-runs on boot)
db/users.js                Data access — users, usage logging, trial tracking, admin functions (all async)
middleware/auth.js         JWT auth + free-trial gate + admin guard
routes/auth.js             POST /api/auth/signup, /login, GET /me
routes/tools.js             POST /api/tools/detect, /plagiarism, /humanize, /generate
routes/upload.js            POST /api/upload — extracts text from txt/docx/pdf
routes/dashboard.js         GET /api/dashboard/stats
routes/admin.js              All /api/admin/* routes (stats, user management)
scripts/make-admin.js         CLI script to promote a user to admin
utils/claude.js                AI provider wrapper (GitHub Models free / Anthropic paid)
utils/textExtract.js             File-to-text extraction logic
```

### Frontend (`/frontend`)
```
index.html                 Landing page + all 4 tools (tabs)
pages/dashboard.html         Usage dashboard (requires login)
pages/admin.html              Admin dashboard (requires admin account)
css/base.css                   Design tokens, nav, buttons, forms, modal, footer
css/app.css                     Hero, tool panels, results, features, pricing
css/dashboard.css                Dashboard-specific layout
css/admin.css                     Admin-specific layout (tables, trend charts)
js/api.js                          API client, auth state, anonymous trial ID
js/auth-modal.js                    Login/signup modal component
js/app.js                            Tool logic (calls the backend, not the AI API directly)
js/dashboard.js                       Dashboard data loading and rendering
js/admin.js                            Admin dashboard logic and user management actions
```

## 8. API reference

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/signup` | — | Create an account. Body: `{ name, email, password }` |
| POST | `/api/auth/login` | — | Log in. Body: `{ email, password }` |
| GET | `/api/auth/me` | Bearer token | Get the current user |
| POST | `/api/tools/detect` | Token or `x-anon-id` header | AI-content detection. Body: `{ text }` |
| POST | `/api/tools/plagiarism` | Token or `x-anon-id` header | Originality/plagiarism risk. Body: `{ text }` |
| POST | `/api/tools/humanize` | Token or `x-anon-id` header | Rewrite AI text to sound human. Body: `{ text, mode, strength, keepMeaning, addVariety, naturalFlow }` |
| POST | `/api/tools/generate` | Token or `x-anon-id` header | Generate original content. Body: `{ prompt, type, tone, length }` |
| GET | `/api/tools/trial-status` | `x-anon-id` header | Check remaining free trials |
| POST | `/api/upload` | — | Upload a file, get back extracted text. multipart/form-data, field name `file` |
| GET | `/api/dashboard/stats` | Bearer token | Usage stats for the logged-in user |
| GET | `/api/admin/stats` | Bearer token (admin) | Platform-wide stats, trends, breakdowns |
| GET | `/api/admin/users` | Bearer token (admin) | List/search users. Query: `?search=&page=&pageSize=` |
| GET | `/api/admin/users/:id` | Bearer token (admin) | One user's detail + usage stats |
| POST | `/api/admin/users/:id/ban` | Bearer token (admin) | Ban a user |
| POST | `/api/admin/users/:id/unban` | Bearer token (admin) | Unban a user |
| POST | `/api/admin/users/:id/plan` | Bearer token (admin) | Change a user's plan. Body: `{ plan }` |
| POST | `/api/admin/users/:id/admin` | Bearer token (admin) | Grant/revoke admin. Body: `{ isAdmin }` |
| DELETE | `/api/admin/users/:id` | Bearer token (admin) | Permanently delete a user |
| GET | `/api/health` | — | Health check |

All authenticated requests send `Authorization: Bearer <token>`. The frontend's `js/api.js` handles this automatically once a user logs in.

## 9. Putting it live on the internet (so strangers can find it on Google)

This is the part that gets your site an actual public URL instead of just `localhost`.

### Step 1 — Put your code on GitHub
1. Create a free GitHub account if you don't have one (github.com).
2. Create a new repository, then push this project to it (GitHub's "Create a new repository" page shows the exact commands — usually `git init`, `git add .`, `git commit`, `git remote add origin ...`, `git push`).
3. Make sure your real `.env` file is **not** committed (the included `.gitignore` already excludes it) — your secrets should never end up in a public repo.

### Step 2 — Deploy the backend (which also serves the frontend)
Pick a host. **Render** is the most beginner-friendly free option that needs no credit card:
1. Go to render.com → sign up with GitHub.
2. **New → Web Service** → pick your aiplago repository.
3. Settings:
   - **Root directory:** `backend`
   - **Build command:** `npm install`
   - **Start command:** `npm start`
   - **Instance type:** Free
4. Under **Environment**, add the same variables from your `.env` file: `DATABASE_URL`, `AI_PROVIDER`, `GITHUB_TOKEN`, `JWT_SECRET`, `CORS_ORIGIN` (set this to your future Render URL, e.g. `https://aiplago.onrender.com`), `PORT` (Render sets this automatically, but `4000` as a fallback is fine).
5. Click **Create Web Service**. Render builds and deploys automatically. You'll get a free URL like `https://aiplago.onrender.com`.

**Free-tier honesty note:** Render's free web services "spin down" after 15 minutes of no traffic, and the first request after that takes about a minute to wake back up. This is normal and fine for a portfolio/early-traffic site — it does not affect your database (that's separate and always-on), only means the *first* visitor after a quiet period waits a bit.

### Step 3 (optional) — Custom domain instead of the free subdomain
If you want `aiplago.com` instead of `aiplago.onrender.com`:
1. Buy a domain from any registrar (typically $10–15/year — the one cost in this whole setup that's hard to avoid if you want your own name).
2. In Render's dashboard, go to your service → Settings → Custom Domains → follow their instructions to point your domain's DNS at Render.

### Step 4 — Getting found on Google
Once your site is live at a real URL:
1. Submit it to Google Search Console (free) — add your URL, verify ownership, submit it for indexing.
2. Google will naturally crawl and index it over time regardless, but Search Console speeds this up and shows you how you're appearing in search.
3. Make sure your page `<title>` and meta description (already set in `index.html`) clearly describe what the site does — that's already done for you.

### Split hosting (optional alternative)
If you'd rather host the frontend separately on a CDN (Vercel/Netlify/Cloudflare Pages) and the backend on Render:
1. Deploy `frontend/` to the static host.
2. Deploy `backend/` to Render as above.
3. In `frontend/js/api.js`, the API client uses same-origin `/api` by default. For split hosting, add this **before** `api.js` loads on every page:
   ```html
   <script>window.__AIPLAGO_API__ = 'https://your-backend-domain.onrender.com/api';</script>
   <script src="js/api.js"></script>
   ```
4. Set `CORS_ORIGIN` in the backend's environment variables to your frontend's exact domain (not `*`) so the browser is allowed to call it.

## 10. Important honesty notes (please read before publishing)

- **The Humanizer significantly reduces AI-detection scores using strong, real rewriting techniques** (sentence-length variation, natural transitions, contractions, removing AI clichés). It does **not** guarantee a 100% bypass of every detector forever — no tool, including the major paid ones, can promise that, since detectors are updated continuously. The UI already reflects this with an "estimated score" framing rather than an absolute guarantee, to keep your marketing claims accurate and defensible.
- **The Plagiarism Checker is an AI-based originality/pattern assessment**, not a literal database match against Turnitin's or Google's indexes (building that would require licensing a proprietary web/academic index, which isn't something an API key can do). The UI is worded to reflect this honestly — "originality risk" rather than "verified plagiarism match."
- Consider adding these same caveats to your own marketing copy/terms of service when you publish, both to set correct user expectations and to reduce legal exposure from absolute claims.

## 11. Customizing

- **Free trial count**: `FREE_TRIAL_LIMIT` in `backend/db/users.js`.
- **AI provider/model**: set `AI_PROVIDER=github` (free) or `AI_PROVIDER=anthropic` (paid) in `.env`. The actual provider logic lives in `backend/utils/claude.js` if you want to add a third provider.
- **Branding/colors**: all design tokens are CSS variables at the top of `frontend/css/base.css`.
- **Rate limiting**: `backend/server.js`, the `apiLimiter` middleware.
