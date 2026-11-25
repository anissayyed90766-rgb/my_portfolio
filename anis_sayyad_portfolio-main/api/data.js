/* Vercel serverless function: stores portfolio content, uploaded images and visitor statistics.
   Storage = Upstash Redis / Vercel KV (REST). No npm packages needed.
   The database variables are auto-detected. Any of these pairs works:
     KV_REST_API_URL + KV_REST_API_TOKEN
     UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
     <ANYPREFIX>_REST_API_URL + <ANYPREFIX>_REST_API_TOKEN   (e.g. STORAGE_REST_API_URL)
   Optional env vars:
     ADMIN_PASSWORD          your private admin password (strongly recommended)
     ANALYTICS_TZ_OFFSET_MIN minutes from UTC used for "today" (default 330 = India, IST) */
const crypto = require('crypto');

/* ---------- find the Redis REST credentials ---------- */
function findRedis() {
  const e = process.env;
  let url = e.KV_REST_API_URL || e.UPSTASH_REDIS_REST_URL;
  let token = e.KV_REST_API_TOKEN || e.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) return { url, token };
  const names = Object.keys(e);
  for (const n of names) {
    const m = /^(.*)_REST_(?:API_)?URL$/.exec(n);
    if (!m || !/^https?:\/\//i.test(e[n] || '')) continue;
    const t = e[m[1] + '_REST_API_TOKEN'] || e[m[1] + '_REST_TOKEN'];
    if (t) return { url: e[n], token: t };
  }
  return { url: '', token: '' };
}
const R = findRedis();
const URL_ = R.url, TOKEN = R.token;
const PASS = process.env.ADMIN_PASSWORD || 'forever2302';
const configured = !!(URL_ && TOKEN);
const TZ = isFinite(parseInt(process.env.ANALYTICS_TZ_OFFSET_MIN, 10)) ? parseInt(process.env.ANALYTICS_TZ_OFFSET_MIN, 10) : 330;

async function redis(cmd) {
  const r = await fetch(URL_, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd)
  });
  const j = await r.json();
  if (!r.ok || j.error) throw new Error(j.error || 'storage error');
  return j.result;
}
/* several commands in ONE round trip */
async function pipe(cmds) {
  const r = await fetch(URL_.replace(/\/+$/, '') + '/pipeline', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmds)
  });
  const j = await r.json();
  if (!r.ok || !Array.isArray(j)) throw new Error('storage error');
  return j.map(x => { if (x && x.error) throw new Error(x.error); return x ? x.result : null; });
}

function same(a, b) {
  const x = crypto.createHash('sha256').update(String(a)).digest();
  const y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
}

/* ---------- visitor statistics helpers ---------- */
function dayKey(offsetDays) {
  const d = new Date(Date.now() + TZ * 60000 - (offsetDays || 0) * 86400000);
  return d.toISOString().slice(0, 10);
}
const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|headless|lighthouse|pingdom|uptime|monitor|curl|wget|python-requests|node-fetch|axios|go-http/i;
function deviceOf(ua) {
  ua = String(ua || '');
  if (/ipad|tablet|kindle|silk/i.test(ua) || (/android/i.test(ua) && !/mobile/i.test(ua))) return 'tablet';
  if (/mobi|iphone|ipod|android/i.test(ua)) return 'mobile';
  return 'desktop';
}
function hostOf(ref, self) {
  try {
    const h = new URL(String(ref)).hostname.replace(/^www\./, '');
    if (!h || h === String(self || '').replace(/^www\./, '').split(':')[0]) return 'Direct';
    return h.slice(0, 60);
  } catch (e) { return 'Direct'; }
}
const clean = (s, n) => String(s || '').replace(/[^\w.\-: ]/g, '').slice(0, n || 40);

async function recordHit(req, body) {
  const ua = req.headers['user-agent'] || '';
  if (BOT.test(ua)) return;
  const vid = String(body.vid || '');
  if (!/^[A-Za-z0-9_-]{8,40}$/.test(vid)) return;
  const day = dayKey(0), now = Date.now();
  const cc = clean(req.headers['x-vercel-ip-country'] || req.headers['cf-ipcountry'] || '', 2).toUpperCase() || 'XX';
  const dev = deviceOf(ua);
  const ref = hostOf(body.ref, req.headers.host);
  const cmds = [
    ['INCR', 'portfolio:views:total'],
    ['HINCRBY', 'portfolio:views:daily', day, 1],
    ['PFADD', 'portfolio:uv:all', vid],
    ['PFADD', 'portfolio:uv:' + day, vid],
    ['EXPIRE', 'portfolio:uv:' + day, 60 * 60 * 24 * 400],
    ['HINCRBY', 'portfolio:countries', cc, 1],
    ['HINCRBY', 'portfolio:devices', dev, 1],
    ['HINCRBY', 'portfolio:referrers', ref, 1],
    ['ZADD', 'portfolio:online', now, vid]
  ];
  if (body.kind === 'new') cmds.push(['SET', 'portfolio:lastvisit', JSON.stringify({ t: now, cc: cc, dev: dev, ref: ref })]);
  await pipe(cmds);
}
async function recordPing(body) {
  const vid = String(body.vid || '');
  if (!/^[A-Za-z0-9_-]{8,40}$/.test(vid)) return;
  await redis(['ZADD', 'portfolio:online', Date.now(), vid]);
}
function top(flat, n) {
  const out = [];
  for (let i = 0; i < (flat || []).length; i += 2) out.push({ name: flat[i], count: parseInt(flat[i + 1], 10) || 0 });
  out.sort((a, b) => b.count - a.count);
  return out.slice(0, n);
}
async function readStats() {
  const days = [];
  for (let i = 29; i >= 0; i--) days.push(dayKey(i));
  const now = Date.now();
  const cmds = [
    ['ZREMRANGEBYSCORE', 'portfolio:online', '-inf', now - 10 * 60000],
    ['ZCOUNT', 'portfolio:online', now - 5 * 60000, '+inf'],
    ['GET', 'portfolio:views:total'],
    ['PFCOUNT', 'portfolio:uv:all'],
    ['HMGET', 'portfolio:views:daily'].concat(days),
    ['HGETALL', 'portfolio:countries'],
    ['HGETALL', 'portfolio:devices'],
    ['HGETALL', 'portfolio:referrers'],
    ['GET', 'portfolio:lastvisit'],
    ['GET', 'portfolio:stats:since']
  ];
  days.forEach(d => cmds.push(['PFCOUNT', 'portfolio:uv:' + d]));
  const r = await pipe(cmds);
  const views = (r[4] || []).map(x => parseInt(x, 10) || 0);
  const uniques = days.map((d, i) => parseInt(r[10 + i], 10) || 0);
  const sum = (a, n) => a.slice(-n).reduce((x, y) => x + y, 0);
  let last = null; try { last = r[8] ? JSON.parse(r[8]) : null; } catch (e) { }
  return {
    online: parseInt(r[1], 10) || 0,
    totalViews: parseInt(r[2], 10) || 0,
    totalVisitors: parseInt(r[3], 10) || 0,
    today: { views: views[29], visitors: uniques[29] },
    week: { views: sum(views, 7), visitors: sum(uniques, 7) },
    month: { views: sum(views, 30), visitors: sum(uniques, 30) },
    days: days.map((d, i) => ({ date: d, views: views[i], visitors: uniques[i] })),
    countries: top(r[5], 8), devices: top(r[6], 3), referrers: top(r[7], 8),
    last: last, since: r[9] || null, tzOffsetMin: TZ
  };
}
async function resetStats() {
  const days = [];
  for (let i = 0; i < 400; i++) days.push('portfolio:uv:' + dayKey(i));
  const base = ['portfolio:views:total', 'portfolio:views:daily', 'portfolio:uv:all', 'portfolio:countries',
    'portfolio:devices', 'portfolio:referrers', 'portfolio:online', 'portfolio:lastvisit'];
  await redis(['DEL'].concat(base));
  for (let i = 0; i < days.length; i += 100) await redis(['DEL'].concat(days.slice(i, i + 100)));
  await redis(['SET', 'portfolio:stats:since', new Date().toISOString()]);
}

module.exports = async (req, res) => {
  const k = (req.query && req.query.k) || '';
  try {
    if (req.method === 'GET') {
      if (k === 'ping') { res.setHeader('Cache-Control', 'no-store'); return res.status(200).json({ ok: true, storage: configured }); }
      if (!configured) return res.status(404).json({ error: 'not_configured' });
      if (k === 'content') {
        const v = await redis(['GET', 'portfolio:content']);
        if (!v) return res.status(404).json({ error: 'empty' });
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        return res.status(200).send(v);
      }
      if (k === 'img') {
        const id = String(req.query.id || '');
        if (!/^[A-Za-z0-9_-]{4,64}$/.test(id)) return res.status(400).end();
        const v = await redis(['GET', 'portfolio:img:' + id]);
        const m = v && /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(v);
        if (!m) return res.status(404).end();
        res.setHeader('Content-Type', m[1]);
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        return res.status(200).send(Buffer.from(m[2], 'base64'));
      }
      return res.status(400).json({ error: 'bad_request' });
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? (req.body ? JSON.parse(req.body) : {}) : (req.body || {});

      /* public: a visitor opened the site (no password, never returns data) */
      if (k === 'hit' || k === 'ping') {
        res.setHeader('Cache-Control', 'no-store');
        if (configured) { try { if (k === 'hit') await recordHit(req, body); else await recordPing(body); } catch (e) { } }
        return res.status(204).end();
      }

      if (!same(req.headers['x-admin-password'] || '', PASS)) {
        await new Promise(r => setTimeout(r, 500));
        return res.status(401).json({ error: 'unauthorized' });
      }
      if (k === 'auth') {
        const hint = Object.keys(process.env).filter(n => /REST|REDIS|KV_|UPSTASH/i.test(n) && !/^(VERCEL|NEXT)/i.test(n)).slice(0, 12);
        return res.status(200).json({ ok: true, storage: configured, weak: !process.env.ADMIN_PASSWORD, envSeen: hint });
      }
      if (!configured) return res.status(503).json({ error: 'not_configured' });

      if (k === 'stats') { res.setHeader('Cache-Control', 'no-store'); return res.status(200).json(await readStats()); }
      if (k === 'resetstats') { await resetStats(); return res.status(200).json({ ok: true }); }

      if (k === 'content') {
        const v = body.value;
        if (!v || typeof v !== 'object' || !Array.isArray(v.projects)) return res.status(400).json({ error: 'invalid_content' });
        const s = JSON.stringify(v);
        if (s.length > 900000) return res.status(413).json({ error: 'too_large' });
        await redis(['SET', 'portfolio:content', s]);
        return res.status(200).json({ ok: true });
      }
      if (k === 'img') {
        const id = String(body.id || '');
        const d = String(body.dataUrl || '');
        if (!/^[A-Za-z0-9_-]{4,64}$/.test(id)) return res.status(400).json({ error: 'bad_id' });
        if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(d)) return res.status(400).json({ error: 'bad_image' });
        if (d.length > 950000) return res.status(413).json({ error: 'too_large' });
        await redis(['SET', 'portfolio:img:' + id, d]);
        return res.status(200).json({ ok: true, url: '/api/data?k=img&id=' + id });
      }
      return res.status(400).json({ error: 'bad_request' });
    }
    return res.status(405).json({ error: 'method_not_allowed' });
  } catch (e) {
    return res.status(500).json({ error: 'server_error' });
  }
};
