# Anis Sayyad – Animated Portfolio

## Deploy on Vercel
1. Push this folder to GitHub (or drag-drop the folder in Vercel → "Add New Project").
2. Framework preset: **Other**. No build command, no output directory. Deploy.

## Deploy on Netlify
1. Push to GitHub. Netlify → Add new site → Import from Git → pick the repo. Build command: empty. Publish directory: `.`  (netlify.toml already sets this). Deploy.
2. Live admin sync: create a free database at upstash.com (Redis) → copy `REST URL` and `REST Token`.
   Netlify → Site configuration → Environment variables → add `KV_REST_API_URL` and `KV_REST_API_TOKEN` → Deploys → Trigger deploy.

## Admin panel
- Footer → **ADMIN** (or open `your-site.vercel.app/#admin`).
- Default password: `forever2302` — **change it** (see "Set your own password" below).

### What the admin can edit (everything on the page)
- **✎ EDIT ON PAGE** – opens the real website; click any text and type. Click a project image to replace it. Then **SAVE & PUBLISH**.
- **Projects** – add / delete / reorder, name, category, link, banner image (upload or URL).
- **Hero, Stats, Education & Skills, Work Process, Quote & Contact, Social & Footer** – all text, numbers, links, WhatsApp number.
- **Layout & Sections** – show / hide / reorder whole sections, and add your own custom sections (text, links, images).
- **Theme & Fonts** – accent colour, text colours, panel darkness, 3 fonts, browser-tab title, and free **custom CSS** for anything else.
- **Labels & Texts** – section headings, button text, form placeholders.
- **Backup / Data** – download / import `content.json`, reset to original.

### Make admin changes visible to EVERYONE + turn on the visitor counter (one-time, 2 minutes, free)
Without a database a static site can only save changes inside the admin's own browser ("LOCAL MODE"), and visitors cannot be counted.

**Vercel (step by step)**
1. Vercel dashboard → your project → **Storage** tab → **Create Database** → **Marketplace → Upstash Redis** → pick the **Free** plan → Create.
2. When asked, **Connect to Project** → choose this project, environments **Production + Preview + Development**.
3. **Deployments → latest deployment → ⋯ → Redeploy.** (Important: environment variables only apply to a *new* deployment — this is the usual reason the badge stays on LOCAL MODE.)
4. Open `your-site.vercel.app/api/data?k=ping` — it should show `{"ok":true,"storage":true}`.
5. Open the admin (`#admin`): the badge now says **● LIVE SYNC ON**.

**Netlify:** create a free database at upstash.com → copy `REST URL` and `REST Token` → Site configuration → Environment variables → add `KV_REST_API_URL` and `KV_REST_API_TOKEN` → Deploys → Trigger deploy.

The variable names are auto-detected (`KV_REST_API_*`, `UPSTASH_REDIS_REST_*`, or any `<PREFIX>_REST_API_URL/_TOKEN` pair).

### 📊 Visitor counter (Admin → VISITORS tab)
Shows: people online right now, total unique visitors, total page views, today / last 7 days / last 30 days, a 30-day chart, top countries, where visitors come from (Google, LinkedIn, direct…), and device split (mobile / desktop / tablet). Auto-refreshes every 20 seconds.
- **Privacy:** each browser gets a random anonymous id. No IP address, name or e-mail is stored.
- **Not counted:** your own browser (after you log in once), search-engine bots and link-preview bots.
- **"Today"** uses India time (IST). Change with the env var `ANALYTICS_TZ_OFFSET_MIN` (minutes from UTC, e.g. `0` for UTC).
- *RESET COUNTER* sets everything back to zero.
- Counting needs the database from the step above.

Without it the admin works in **LOCAL MODE** (changes only in that browser). You can still publish them by hand: Admin → BACKUP / DATA → *Download content.json* → replace `content.json` in the project → redeploy.

### Set your own password (important)
Add the environment variable `ADMIN_PASSWORD` (Vercel: Settings → Environment Variables, Netlify: Site configuration → Environment variables) with a long, private password and redeploy. If it is not set, the admin panel shows a red warning, because the default password is written in this README.

### Safety notes
- Custom sections accept plain text or simple HTML. `<script>`, iframes, forms, `on…=` attributes and `javascript:` links are removed before anything is shown to visitors.
- Custom CSS strips `@import` and `javascript:`.

## Contact form
"SEND MESSAGE" opens WhatsApp chat with +91 7057477861 with the visitor's name, email, subject and message prefilled
(number can be changed from Admin → Quote & Contact).

## Files
index.html · style.css · admin.css · script.js (scroll animation) · site.js (content, WhatsApp, visitor ping) · admin.js · content.json · api/data.js (content, images, visitor stats) · vercel.json · images/ · video_frames/
