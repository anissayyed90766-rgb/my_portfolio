/* Admin panel. Password check happens on the server when /api is available (Vercel);
   otherwise a hashed local check is used and changes are saved in this browser only. */
(function () {
  'use strict';
  var S = window.Site;
  var LOCAL_HASH = '51526f3cd3dd795def1f892d9544205d63df0125f60e2ed98a5619d825aeb4e8';
  var SS_KEY = 'portfolio_admin_session';
  var root, body, tabsBar, chip, dirtyChip, toastEl;
  var st = { tab: 'visitors', live: false, pw: '', dirty: false, weak: false, envSeen: [] };
  var statTimer = null, stats = null, statsErr = '';
  var draft = null, baseline = null;
  var visual = false, vbar = null, vDirty = null, vFile = null;   // "edit on page" mode

  function h(tag, props, kids) {
    var e = document.createElement(tag); props = props || {};
    Object.keys(props).forEach(function (k) {
      var v = props[k];
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k === 'value') e.value = v;
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) e.setAttribute(k, v);
    });
    (kids || []).forEach(function (c) { if (c != null) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function toast(msg) {
    if (toastEl) toastEl.remove();
    toastEl = h('div', { class: 'adm-toast', text: msg }); document.body.appendChild(toastEl);
    setTimeout(function () { if (toastEl) toastEl.remove(); }, 3200);
  }
  function markDirty() { st.dirty = true; if (dirtyChip) dirtyChip.style.display = ''; if (vDirty) vDirty.style.display = ''; }
  function getPath(o, p) { return p.split('.').reduce(function (a, k) { return a == null ? a : a[k]; }, o); }
  function setPath(o, p, v) { var ks = p.split('.'), last = ks.pop(), t = ks.reduce(function (a, k) { return a == null ? a : a[k]; }, o); if (t != null) t[last] = v; }
  /* make sure every part of the content object exists (older saved content may not have the newer parts) */
  function ensure(c) {
    ['hero', 'quote', 'contact', 'socials', 'footer', 'site', 'theme', 'sections', 'texts'].forEach(function (k) { if (!c[k] || typeof c[k] !== 'object' || Array.isArray(c[k])) c[k] = {}; });
    ['stats', 'projects', 'education', 'skills', 'process', 'blocks'].forEach(function (k) { if (!Array.isArray(c[k])) c[k] = []; });
    if (!Array.isArray(c.sections.order)) c.sections.order = [];
    if (!Array.isArray(c.sections.hidden)) c.sections.hidden = [];
    if (typeof c.customCss !== 'string') c.customCss = '';
    return c;
  }
  function sha(pw) {
    if (!(window.crypto && crypto.subtle)) return Promise.resolve('');
    var data = new TextEncoder().encode('anis-portfolio:' + pw);
    return crypto.subtle.digest('SHA-256', data).then(function (b) {
      return Array.prototype.map.call(new Uint8Array(b), function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
    });
  }
  function api(k, method, payload) {
    return fetch('/api/data?k=' + k, {
      method: method, headers: { 'Content-Type': 'application/json', 'x-admin-password': st.pw },
      body: payload ? JSON.stringify(payload) : '{}'
    });
  }

  /* ---------- login ---------- */
  function authenticate(pw) {
    return fetch('/api/data?k=auth', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-password': pw }, body: '{}' })
      .then(function (r) {
        if (r.status === 401) return { ok: false };
        if (r.ok) return r.json().then(function (j) { try { localStorage.setItem('portfolio_owner', '1'); } catch (e) { } return { ok: true, live: !!j.storage, weak: !!j.weak, envSeen: j.envSeen || [] }; });
        throw 0;
      })
      .catch(function () {
        return sha(pw).then(function (hh) { if (hh && hh === LOCAL_HASH) { try { localStorage.setItem('portfolio_owner', '1'); } catch (e) { } } return { ok: !!hh && hh === LOCAL_HASH, live: false }; });
      });
  }
  function showLogin() {
    root.textContent = '';
    var err = h('div', { class: 'adm-err' });
    var pw = h('input', { type: 'password', placeholder: 'Password', autocomplete: 'current-password' });
    var go = function () {
      if (!pw.value) return;
      err.textContent = 'Checking…';
      authenticate(pw.value).then(function (r) {
        if (!r.ok) { err.textContent = 'Wrong password.'; return; }
        st.pw = pw.value; st.live = r.live; st.weak = !!r.weak; st.envSeen = r.envSeen || []; sessionStorage.setItem(SS_KEY, pw.value);
        startPanel();
      });
    };
    pw.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
    root.appendChild(h('div', { class: 'adm-login' }, [
      h('h2', {}, ['ADMIN ', h('span', { text: 'LOGIN' })]),
      h('p', { text: 'Enter the admin password to edit your portfolio.' }),
      pw,
      h('button', { class: 'adm-btn primary', type: 'button', text: 'LOGIN →', onclick: go }),
      h('button', { class: 'adm-btn', type: 'button', text: 'CLOSE', onclick: close, style: 'margin-top:.6rem' }),
      err
    ]));
    setTimeout(function () { pw.focus(); }, 50);
  }

  /* ---------- panel shell ---------- */
  function startPanel() {
    var base = S.current ? Promise.resolve(S.current) :
      fetch('content.json', { cache: 'no-store' }).then(function (r) { return r.json(); });
    base.then(function (c) { baseline = clone(c); draft = ensure(clone(c)); buildShell(); })
      .catch(function () { toast('Could not load content.json'); });
  }
  var TABS = [['visitors', '📊 VISITORS'], ['projects', 'PROJECTS'], ['hero', 'HERO / INTRO'], ['stats', 'STATS'], ['edu', 'EDUCATION & SKILLS'],
    ['process', 'WORK PROCESS'], ['quote', 'QUOTE & CONTACT'], ['social', 'SOCIAL & FOOTER'],
    ['layout', 'LAYOUT & SECTIONS'], ['theme', 'THEME & FONTS'], ['labels', 'LABELS & TEXTS'], ['data', 'BACKUP / DATA']];

  function buildShell() {
    root.textContent = '';
    chip = h('span', { class: 'adm-chip ' + (st.live ? 'live' : 'local'), text: st.live ? '● LIVE SYNC ON' : '● LOCAL MODE (this browser only)' });
    dirtyChip = h('span', { class: 'adm-chip dirty', text: 'UNSAVED CHANGES', style: 'display:none' });
    var head = h('div', { class: 'adm-head' }, [
      h('h2', {}, ['ADMIN ', h('span', { text: 'PANEL' })]),
      h('div', { class: 'adm-actions' }, [chip, dirtyChip,
        h('button', { class: 'adm-btn primary', type: 'button', text: 'SAVE & PUBLISH', onclick: save }),
        h('button', { class: 'adm-btn', type: 'button', text: '✎ EDIT ON PAGE', onclick: startVisual }),
        h('button', { class: 'adm-btn', type: 'button', text: 'VIEW SITE', onclick: close }),
        h('button', { class: 'adm-btn', type: 'button', text: 'LOGOUT', onclick: logout })])
    ]);
    tabsBar = h('div', { class: 'adm-tabs' });
    TABS.forEach(function (t) {
      tabsBar.appendChild(h('button', { class: 'adm-tab' + (st.tab === t[0] ? ' on' : ''), type: 'button', text: t[1], 'data-t': t[0],
        onclick: function () { st.tab = t[0]; Array.prototype.forEach.call(tabsBar.children, function (b) { b.classList.toggle('on', b.getAttribute('data-t') === st.tab); }); renderTab(); } }));
    });
    body = h('div', { class: 'adm-body' });
    root.appendChild(head);
    if (st.weak) root.appendChild(h('div', { class: 'adm-warn', text: '⚠ The default admin password is still in use. Anyone who has seen your code could change your site. Set an ADMIN_PASSWORD environment variable in Vercel/Netlify (see README) and redeploy.' }));
    if (!st.live) root.appendChild(h('div', { class: 'adm-warn soft', text: 'LOCAL MODE: changes are saved only in this browser and visitors are NOT counted. The server cannot see a database yet. In Vercel: Storage → Marketplace → Upstash Redis → connect to this project → then REDEPLOY (a new deployment is required for the variables to apply). ' + (st.envSeen && st.envSeen.length ? 'Variables found: ' + st.envSeen.join(', ') + ' (token or URL may be missing).' : 'No database variables found.') }));
    root.appendChild(tabsBar); root.appendChild(body);
    renderTab();
  }
  function renderTab() {
    stopStats(); body.textContent = '';
    var fn = { visitors: tabVisitors, projects: tabProjects, hero: tabHero, stats: tabStats, edu: tabEdu, process: tabProcess, quote: tabQuote, social: tabSocial, layout: tabLayout, theme: tabTheme, labels: tabLabels, data: tabData }[st.tab];
    body.appendChild(fn());
    body.scrollTop = 0;
  }

  /* ---------- helpers ---------- */
  function fld(label, obj, key, o) {
    o = o || {};
    var inp = o.area ? h('textarea', { rows: o.rows || 3 }) : h('input', { type: 'text' });
    if (o.mono) inp.className = 'adm-mono';
    inp.value = obj[key] == null ? '' : obj[key];
    if (o.ph) inp.placeholder = o.ph;
    inp.addEventListener('input', function () { obj[key] = inp.value; markDirty(); });
    return h('label', { class: 'adm-f' + (o.full ? ' full' : '') }, [h('span', { text: label }), inp, o.hint ? h('small', { text: o.hint }) : null]);
  }
  function move(a, i, d) { var j = i + d; if (j < 0 || j >= a.length) return; var t = a[i]; a[i] = a[j]; a[j] = t; markDirty(); renderTab(); }
  function del(a, i, what) { if (confirm('Delete this ' + what + '?')) { a.splice(i, 1); markDirty(); renderTab(); } }
  function ctrls(a, i, what) {
    return h('div', { class: 'adm-row' }, [
      h('button', { class: 'adm-btn sm', type: 'button', text: '↑', title: 'Move up', onclick: function () { move(a, i, -1); } }),
      h('button', { class: 'adm-btn sm', type: 'button', text: '↓', title: 'Move down', onclick: function () { move(a, i, 1); } }),
      h('button', { class: 'adm-btn sm danger', type: 'button', text: 'DELETE', onclick: function () { del(a, i, what); } })
    ]);
  }
  function addBtn(text, fn) { return h('button', { class: 'adm-btn primary', type: 'button', text: text, onclick: function () { fn(); markDirty(); renderTab(); } }); }
  function num2(i) { return ('0' + (i + 1)).slice(-2); }

  /* ---------- image upload ---------- */
  function compress(file, maxW, q) {
    return new Promise(function (res, rej) {
      var fr = new FileReader();
      fr.onload = function () {
        var img = new Image();
        img.onload = function () {
          var s = Math.min(1, maxW / img.width), c = document.createElement('canvas');
          c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
          var x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
          res(c.toDataURL('image/jpeg', q));
        };
        img.onerror = rej; img.src = fr.result;
      };
      fr.onerror = rej; fr.readAsDataURL(file);
    });
  }
  function uploadImage(file) {
    var tries = [[1280, 0.8], [1100, 0.7], [900, 0.6]], i = 0;
    function attempt() {
      return compress(file, tries[i][0], tries[i][1]).then(function (data) {
        if (data.length > 900000 && i < tries.length - 1) { i++; return attempt(); }
        if (!st.live) {
          if (data.length > 500000) throw new Error('Image too large for local mode');
          return data;
        }
        var id = 'img_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
        return api('img', 'POST', { id: id, dataUrl: data }).then(function (r) {
          if (!r.ok) throw new Error('Upload failed (' + r.status + ')');
          return '/api/data?k=img&id=' + id;
        });
      });
    }
    return attempt();
  }

  /* ---------- visitors (analytics) ---------- */
  function stopStats() { if (statTimer) { clearInterval(statTimer); statTimer = null; } }
  function plural(n) { return fmt(n) + (n === 1 ? ' view' : ' views'); }
  function fmt(n) { return Number(n || 0).toLocaleString('en-IN'); }
  var CN = { IN: 'India', US: 'United States', GB: 'United Kingdom', AE: 'UAE', CA: 'Canada', AU: 'Australia', DE: 'Germany', FR: 'France', SG: 'Singapore', SA: 'Saudi Arabia', PK: 'Pakistan', BD: 'Bangladesh', NP: 'Nepal', LK: 'Sri Lanka', NL: 'Netherlands', BR: 'Brazil', CN: 'China', JP: 'Japan', XX: 'Unknown' };
  function statCard(label, value, sub, accent) {
    return h('div', { class: 'adm-stat' + (accent ? ' accent' : '') }, [h('div', { class: 'adm-stat-n', text: value }), h('div', { class: 'adm-stat-l', text: label }), sub ? h('div', { class: 'adm-stat-s', text: sub }) : null]);
  }
  function barList(title, rows, total, nameFn) {
    var box = h('div', { class: 'adm-card' }, [h('div', { class: 'adm-h', style: 'margin-top:0', text: title })]);
    if (!rows.length) { box.appendChild(h('div', { class: 'adm-empty', text: 'No data yet' })); return box; }
    rows.forEach(function (r) {
      var pct = total ? Math.round(r.count * 100 / total) : 0;
      box.appendChild(h('div', { class: 'adm-bar' }, [
        h('div', { class: 'adm-bar-top' }, [h('span', { text: nameFn ? nameFn(r.name) : r.name }), h('span', { text: fmt(r.count) + ' · ' + pct + '%' })]),
        h('div', { class: 'adm-bar-track' }, [h('div', { class: 'adm-bar-fill', style: 'width:' + Math.max(2, pct) + '%' })])
      ]));
    });
    return box;
  }
  function chart(days) {
    var W = 720, H = 190, pl = 30, pb = 22, pt = 10, n = days.length, max = 4;
    days.forEach(function (d) { if (d.views > max) max = d.views; });
    var bw = (W - pl) / n, ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H); svg.setAttribute('class', 'adm-chart'); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', 'Views per day, last 30 days');
    function mk(tag, attrs, text) { var e = document.createElementNS(ns, tag); Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); }); if (text != null) e.textContent = text; return e; }
    [0, 0.5, 1].forEach(function (f) {
      var y = pt + (H - pb - pt) * (1 - f);
      svg.appendChild(mk('line', { x1: pl, x2: W, y1: y, y2: y, stroke: '#2a2a2a', 'stroke-width': 1 }));
      svg.appendChild(mk('text', { x: pl - 6, y: y + 3, 'text-anchor': 'end', fill: '#777', 'font-size': 10 }, String(Math.round(max * f))));
    });
    days.forEach(function (d, i) {
      var bh = (H - pb - pt) * (d.views / max), x = pl + i * bw + 2, y = H - pb - bh;
      var r = mk('rect', { x: x, y: y, width: Math.max(2, bw - 4), height: Math.max(d.views ? 2 : 0, bh), rx: 2, fill: i === n - 1 ? '#e52e2d' : '#7a2020' });
      r.appendChild(mk('title', {}, d.date + ' — ' + plural(d.views) + ', ' + d.visitors + (d.visitors === 1 ? ' visitor' : ' visitors')));
      svg.appendChild(r);
      if (i % 5 === 0 || i === n - 1) svg.appendChild(mk('text', { x: x + bw / 2 - 2, y: H - 6, 'text-anchor': 'middle', fill: '#777', 'font-size': 10 }, d.date.slice(5)));
    });
    return svg;
  }
  function drawStats(box) {
    box.textContent = '';
    if (statsErr) { box.appendChild(h('div', { class: 'adm-warn', text: statsErr })); return; }
    if (!stats) { box.appendChild(h('div', { class: 'adm-empty', text: 'Loading visitor statistics…' })); return; }
    var s = stats, dev = s.devices || [], devTotal = dev.reduce(function (a, b) { return a + b.count; }, 0);
    box.appendChild(h('div', { class: 'adm-stats' }, [
      statCard('ONLINE NOW', fmt(s.online), 'active in the last 5 min', true),
      statCard('TOTAL VISITORS', fmt(s.totalVisitors), 'unique people, all time'),
      statCard('TOTAL VIEWS', fmt(s.totalViews), 'page opens, all time'),
      statCard('TODAY', fmt(s.today.visitors), plural(s.today.views)),
      statCard('LAST 7 DAYS', fmt(s.week.visitors), plural(s.week.views)),
      statCard('LAST 30 DAYS', fmt(s.month.visitors), plural(s.month.views))
    ]));
    box.appendChild(h('div', { class: 'adm-card' }, [h('div', { class: 'adm-h', style: 'margin-top:0', text: 'Views per day — last 30 days' }), chart(s.days)]));
    var cTotal = (s.countries || []).reduce(function (a, b) { return a + b.count; }, 0), rTotal = (s.referrers || []).reduce(function (a, b) { return a + b.count; }, 0);
    box.appendChild(h('div', { class: 'adm-two' }, [
      barList('Top countries', s.countries || [], cTotal, function (c) { return CN[c] ? CN[c] + ' (' + c + ')' : c; }),
      barList('Where visitors come from', s.referrers || [], rTotal),
      barList('Devices', dev, devTotal, function (d) { return d.charAt(0).toUpperCase() + d.slice(1); })
    ]));
    var lv = s.last ? 'Latest new visitor: ' + new Date(s.last.t).toLocaleString() + ' · ' + (CN[s.last.cc] || s.last.cc) + ' · ' + s.last.dev + ' · from ' + s.last.ref : '';
    box.appendChild(h('div', { class: 'adm-note', text: 'Visitors are counted anonymously (random id stored in the visitor\u2019s browser — no IP address or personal data is saved). Your own browser and search-engine bots are not counted. ' + (s.since ? 'Counting restarted on ' + new Date(s.since).toLocaleDateString() + '. ' : '') + lv }));
  }
  function loadStats(box, quiet) {
    if (!quiet) { stats = null; statsErr = ''; drawStats(box); }
    return api('stats', 'POST').then(function (r) {
      if (r.status === 401) throw new Error('Session expired — login again.');
      if (!r.ok) throw new Error('Could not load statistics (' + r.status + ').');
      return r.json();
    }).then(function (j) { stats = j; statsErr = ''; }).catch(function (e) { if (!stats) statsErr = e.message || 'Could not load statistics.'; })
      .then(function () { if (box.isConnected) drawStats(box); });
  }
  function tabVisitors() {
    var w = h('div');
    if (!st.live) {
      w.appendChild(h('div', { class: 'adm-card' }, [
        h('div', { class: 'adm-h', style: 'margin-top:0', text: 'Visitor counter is waiting for the database' }),
        h('div', { class: 'adm-note', text: 'The counter and live sync both use the same free Upstash Redis database. Right now the server cannot see one, so nothing is being counted and your admin edits stay in this browser only.' }),
        h('ol', { class: 'adm-steps' }, [
          h('li', { text: 'Vercel dashboard → your project → Storage → Create / Connect → Marketplace → Upstash Redis (free plan).' }),
          h('li', { text: 'Connect it to this project for all environments (Production included).' }),
          h('li', { text: 'Deployments → latest deployment → ⋯ → Redeploy. Variables only apply to a NEW deployment.' }),
          h('li', { text: 'Reload the site, log in here again — the badge turns green (LIVE SYNC ON) and counting starts.' })
        ]),
        h('div', { class: 'adm-note', text: st.envSeen && st.envSeen.length ? 'Database-like variables the server can see: ' + st.envSeen.join(', ') : 'Database variables the server can see: none yet.' })
      ]));
      return w;
    }
    var box = h('div');
    var bar = h('div', { class: 'adm-row', style: 'justify-content:space-between;flex-wrap:wrap;margin-bottom:1rem' }, [
      h('span', { class: 'adm-note', style: 'margin:0;padding:.5rem .8rem', text: 'Auto-refreshes every 20 seconds while this tab is open.' }),
      h('div', { class: 'adm-row' }, [
        h('button', { class: 'adm-btn', type: 'button', text: '↻ REFRESH', onclick: function () { loadStats(box, false); } }),
        h('button', { class: 'adm-btn danger', type: 'button', text: 'RESET COUNTER', onclick: function () {
          if (!confirm('Reset ALL visitor statistics to zero? This cannot be undone.')) return;
          api('resetstats', 'POST').then(function (r) { if (!r.ok) throw 0; toast('Visitor counter reset'); loadStats(box, false); }).catch(function () { toast('Reset failed'); });
        } })
      ])
    ]);
    w.appendChild(bar); w.appendChild(box);
    drawStats(box); loadStats(box, !!stats);
    statTimer = setInterval(function () { if (!box.isConnected) { stopStats(); return; } loadStats(box, true); }, 20000);
    return w;
  }

  /* ---------- tabs ---------- */
  function tabProjects() {
    var w = h('div');
    w.appendChild(h('div', { class: 'adm-note', text: 'Each project card: edit name, category, live link and banner image. Click a card on the site opens its link in a new tab. Order here = order on the website (01, 02, 03…).' }));
    draft.projects.forEach(function (p, i) {
      var thumb = h('img', { class: 'adm-thumb', alt: '' }); thumb.src = S.safeImg(p.image);
      var imgIn = h('input', { type: 'text', placeholder: 'Image URL or upload →' });
      imgIn.value = (p.image || '').indexOf('data:') === 0 ? '(uploaded image)' : (p.image || '');
      imgIn.addEventListener('input', function () { p.image = imgIn.value; thumb.src = S.safeImg(p.image); markDirty(); });
      var file = h('input', { type: 'file', accept: 'image/*', style: 'display:none' });
      file.addEventListener('change', function () {
        if (!file.files[0]) return; toast('Uploading image…');
        uploadImage(file.files[0]).then(function (url) {
          p.image = url; thumb.src = S.safeImg(url); imgIn.value = url.indexOf('data:') === 0 ? '(uploaded image)' : url; markDirty(); toast('Image ready — press SAVE & PUBLISH');
        }).catch(function (e) { toast(e.message || 'Image failed'); });
      });
      w.appendChild(h('div', { class: 'adm-card' }, [
        h('div', { class: 'adm-card-top' }, [h('strong', { text: num2(i) }), ctrls(draft.projects, i, 'project')]),
        h('div', { class: 'adm-grid' }, [
          fld('Project name', p, 'title'), fld('Category', p, 'category'),
          fld('Live URL (opens in new tab)', p, 'url', { full: true, ph: 'https://…' }),
          h('div', { class: 'adm-f full' }, [h('span', { text: 'Banner image' }),
            h('div', { class: 'adm-imgrow' }, [thumb, imgIn, h('button', { class: 'adm-btn sm', type: 'button', text: 'UPLOAD', onclick: function () { file.click(); } }), file])])
        ])
      ]));
    });
    w.appendChild(addBtn('+ ADD PROJECT', function () { draft.projects.push({ id: 'p' + Date.now(), title: 'NEW PROJECT', category: 'CATEGORY', url: 'https://', image: '' }); }));
    return w;
  }
  function tabHero() {
    var h0 = draft.hero;
    return h('div', { class: 'adm-grid' }, [
      fld('Top bar (left)', h0, 'navLeft', { full: true }), fld('Top bar (right)', h0, 'navRight'), fld('Greeting', h0, 'greeting'),
      fld('Name', h0, 'name', { area: true, rows: 2, full: true, hint: 'Press Enter for a new line' }),
      fld('Title', h0, 'title', { area: true, rows: 2, full: true }),
      fld('Description', h0, 'desc', { area: true, rows: 5, full: true }),
      fld('Availability badge', h0, 'badge'), fld('Tagline', h0, 'tagline', { full: true })
    ]);
  }
  function tabStats() {
    var w = h('div');
    draft.stats.forEach(function (s, i) {
      w.appendChild(h('div', { class: 'adm-card' }, [h('div', { class: 'adm-card-top' }, [h('strong', { text: num2(i) }), ctrls(draft.stats, i, 'stat')]),
        h('div', { class: 'adm-grid' }, [fld('Number', s, 'num', { ph: '5+' }), fld('Label', s, 'label', { area: true, rows: 2 })])]));
    });
    w.appendChild(addBtn('+ ADD STAT', function () { draft.stats.push({ num: '0+', label: 'LABEL' }); }));
    return w;
  }
  function tabEdu() {
    var w = h('div'); w.appendChild(h('div', { class: 'adm-h', text: 'Education' }));
    draft.education.forEach(function (e, i) {
      w.appendChild(h('div', { class: 'adm-card' }, [h('div', { class: 'adm-card-top' }, [h('strong', { text: num2(i) }), ctrls(draft.education, i, 'education entry')]),
        h('div', { class: 'adm-grid' }, [fld('Degree / course', e, 'title'), fld('Institute', e, 'place'), fld('Years', e, 'year')])]));
    });
    w.appendChild(addBtn('+ ADD EDUCATION', function () { draft.education.push({ title: 'Course', place: 'Institute', year: '2026' }); }));
    w.appendChild(h('div', { class: 'adm-h', text: 'Skills' }));
    var tags = h('div', { class: 'adm-tags' });
    draft.skills.forEach(function (s, i) {
      tags.appendChild(h('span', { class: 'adm-tag' }, [s, h('button', { type: 'button', text: '×', title: 'Remove', onclick: function () { draft.skills.splice(i, 1); markDirty(); renderTab(); } })]));
    });
    w.appendChild(tags);
    var ni = h('input', { type: 'text', placeholder: 'New skill' });
    var add = function () { var v = ni.value.trim(); if (v) { draft.skills.push(v); markDirty(); renderTab(); } };
    ni.addEventListener('keydown', function (e) { if (e.key === 'Enter') add(); });
    w.appendChild(h('div', { class: 'adm-row' }, [ni, h('button', { class: 'adm-btn primary', type: 'button', text: 'ADD', onclick: add })]));
    return w;
  }
  function tabProcess() {
    var w = h('div');
    draft.process.forEach(function (p, i) {
      w.appendChild(h('div', { class: 'adm-card' }, [h('div', { class: 'adm-card-top' }, [h('strong', { text: num2(i) }), ctrls(draft.process, i, 'step')]),
        h('div', { class: 'adm-grid' }, [fld('Title', p, 'title'), fld('Icon (emoji / symbol)', p, 'icon'), fld('Text', p, 'text', { area: true, rows: 2, full: true })])]));
    });
    w.appendChild(addBtn('+ ADD STEP', function () { draft.process.push({ icon: '★', title: 'NEW STEP', text: 'Description' }); }));
    return w;
  }
  function tabQuote() {
    return h('div', {}, [
      h('div', { class: 'adm-h', text: 'Quote box' }),
      h('div', { class: 'adm-grid' }, [fld('Quote', draft.quote, 'text', { area: true, full: true }), fld('Signature', draft.quote, 'signature'), fld('Footer text', draft.quote, 'footer', { area: true, rows: 3 })]),
      h('div', { class: 'adm-h', text: 'Contact section' }),
      h('div', { class: 'adm-grid' }, [
        fld('Heading', draft.contact, 'heading', { area: true, rows: 2 }), fld('Text', draft.contact, 'text', { area: true, rows: 2 }),
        fld('Email', draft.contact, 'email'), fld('Phone (shown)', draft.contact, 'phone'), fld('Address', draft.contact, 'address', { full: true }),
        fld('WhatsApp number for messages', draft.contact, 'whatsapp', { full: true, hint: 'Country code + number, digits only. Example: 917057477861. The "Send message" form opens WhatsApp on this number.' })
      ])
    ]);
  }
  function tabSocial() {
    return h('div', { class: 'adm-grid' }, [
      fld('Instagram link', draft.socials, 'instagram', { full: true }), fld('LinkedIn link', draft.socials, 'linkedin', { full: true }),
      fld('Footer copyright text', draft.footer, 'copyright', { full: true })
    ]);
  }

  /* ---------- layout: show / hide / reorder sections, add custom sections ---------- */
  var SEC_NAMES = { hero: 'Hero / Intro (top of page)', projects: 'Selected Projects', details: 'Education, Skills & Work Process', contact: 'Contact' };
  function seq() {
    var ids = S.DEFAULT_ORDER.slice(); draft.blocks.forEach(function (b) { ids.push(b.id); });
    var seen = {}, out = [];
    draft.sections.order.concat(ids).forEach(function (id) { if (ids.indexOf(id) > -1 && !seen[id]) { seen[id] = 1; out.push(id); } });
    return out;
  }
  function blockOf(id) { var r = null; draft.blocks.forEach(function (b) { if (b.id === id) r = b; }); return r; }
  function tabLayout() {
    var w = h('div');
    w.appendChild(h('div', { class: 'adm-note', text: 'Choose which sections are visible and in what order they appear on the website (the footer always stays last). You can also add your own sections with any text, links or images.' }));
    var order = seq();
    order.forEach(function (id, i) {
      var b = blockOf(id), hidden = draft.sections.hidden.indexOf(id) > -1;
      var cb = h('input', { type: 'checkbox' }); cb.checked = !hidden;
      cb.addEventListener('change', function () {
        var hs = draft.sections.hidden, k = hs.indexOf(id);
        if (cb.checked && k > -1) hs.splice(k, 1); if (!cb.checked && k === -1) hs.push(id); markDirty();
      });
      var top = h('div', { class: 'adm-card-top' }, [
        h('strong', { text: num2(i) }),
        h('span', { class: 'adm-secname', text: b ? 'Custom: ' + (b.title || 'untitled') : SEC_NAMES[id] }),
        h('label', { class: 'adm-chk' }, [cb, ' Visible']),
        h('div', { class: 'adm-row' }, [
          h('button', { class: 'adm-btn sm', type: 'button', text: '↑', title: 'Move up', onclick: function () { moveSec(order, i, -1); } }),
          h('button', { class: 'adm-btn sm', type: 'button', text: '↓', title: 'Move down', onclick: function () { moveSec(order, i, 1); } })
        ])
      ]);
      var kids = [top];
      if (b) {
        kids.push(h('div', { class: 'adm-grid' }, [
          fld('Section title', b, 'title', { full: true }),
          fld('Content', b, 'html', { area: true, rows: 7, full: true, hint: 'Plain text (blank line = new paragraph) or simple HTML: <b> <a href> <img src> <ul> <h3>… Scripts, iframes and forms are removed automatically.' })
        ]));
        kids.push(h('div', { class: 'adm-row', style: 'margin-top:.8rem' }, [h('button', { class: 'adm-btn sm danger', type: 'button', text: 'DELETE SECTION', onclick: function () {
          if (!confirm('Delete this custom section?')) return;
          draft.blocks = draft.blocks.filter(function (x) { return x.id !== id; }); draft.sections.order = draft.sections.order.filter(function (x) { return x !== id; }); markDirty(); renderTab();
        } })]));
      }
      w.appendChild(h('div', { class: 'adm-card' }, kids));
    });
    w.appendChild(addBtn('+ ADD CUSTOM SECTION', function () {
      var id = 'b_' + Date.now().toString(36);
      draft.blocks.push({ id: id, title: 'NEW SECTION', html: 'Write something here…' }); draft.sections.order = seq().concat([]);
    }));
    return w;
  }
  function moveSec(order, i, d) { var j = i + d; if (j < 0 || j >= order.length) return; var t = order[i]; order[i] = order[j]; order[j] = t; draft.sections.order = order; markDirty(); renderTab(); }

  /* ---------- theme: colours, fonts, browser title, custom css ---------- */
  var DEF = { accent: '#e52e2d', text: '#ffffff', muted: '#999999', border: '#333333', bg: '#0a0a0a', overlay: 0.4, fontHeading: 'Oswald', fontBody: 'Inter', fontScript: 'Caveat' };
  function colorFld(label, key, hint) {
    var inp = h('input', { type: 'color', class: 'adm-color' }); inp.value = (draft.theme[key] || DEF[key]).toLowerCase();
    inp.addEventListener('input', function () { draft.theme[key] = inp.value; markDirty(); });
    return h('label', { class: 'adm-f' }, [h('span', { text: label }), inp, hint ? h('small', { text: hint }) : null]);
  }
  function fontFld(label, key, group) {
    var sel = h('select', { class: 'adm-select' });
    S.FONTS[group].forEach(function (f) { sel.appendChild(h('option', { value: f[0], text: f[0] })); });
    sel.value = draft.theme[key] || DEF[key];
    sel.addEventListener('change', function () { draft.theme[key] = sel.value; markDirty(); });
    return h('label', { class: 'adm-f' }, [h('span', { text: label }), sel]);
  }
  function tabTheme() {
    var ov = h('input', { type: 'range', min: '0', max: '0.9', step: '0.05' }); ov.value = draft.theme.overlay != null ? draft.theme.overlay : DEF.overlay;
    var ovl = h('small', { text: 'Darkness of the panels over the background animation: ' + ov.value });
    ov.addEventListener('input', function () { draft.theme.overlay = parseFloat(ov.value); ovl.textContent = 'Darkness of the panels over the background animation: ' + ov.value; markDirty(); });
    return h('div', {}, [
      h('div', { class: 'adm-note', text: 'Tip: press ✎ EDIT ON PAGE after changing colours or fonts to see them live on the page before you publish.' }),
      h('div', { class: 'adm-h', text: 'Colours' }),
      h('div', { class: 'adm-grid' }, [
        colorFld('Accent colour (red)', 'accent', 'Titles, numbers, buttons, highlights'), colorFld('Main text', 'text'),
        colorFld('Muted text', 'muted'), colorFld('Lines / borders', 'border'),
        colorFld('Panel tint', 'bg'), h('label', { class: 'adm-f' }, [h('span', { text: 'Panel darkness' }), ov, ovl])
      ]),
      h('div', { class: 'adm-h', text: 'Fonts' }),
      h('div', { class: 'adm-grid' }, [fontFld('Headings', 'fontHeading', 'heading'), fontFld('Body text', 'fontBody', 'body'), fontFld('Handwriting ("Hello, I\'m")', 'fontScript', 'script')]),
      h('div', { class: 'adm-h', text: 'Browser tab' }),
      h('div', { class: 'adm-grid' }, [fld('Page title', draft.site, 'title', { full: true, ph: 'Portfolio | ANIS SAYYAD' })]),
      h('div', { class: 'adm-h', text: 'Advanced: custom CSS' }),
      h('div', { class: 'adm-grid' }, [fld('CSS applied to the whole site', draft, 'customCss', { area: true, rows: 9, full: true, mono: true, hint: 'Example:  .name { font-size: 4rem; }   .project-card img { border-radius: 16px; }' })]),
      h('div', { class: 'adm-row', style: 'margin-top:1rem' }, [h('button', { class: 'adm-btn danger', type: 'button', text: 'RESET COLOURS & FONTS', onclick: function () { draft.theme = {}; markDirty(); renderTab(); toast('Reset — press SAVE & PUBLISH'); } })])
    ]);
  }

  /* ---------- labels: static headings / button text / placeholders ---------- */
  function tabLabels() {
    var w = h('div'); w.appendChild(h('div', { class: 'adm-note', text: 'Section headings, button text and form placeholders. Leave as is to keep the original text.' }));
    var g = h('div', { class: 'adm-grid' });
    S.LABELS.forEach(function (l) {
      var k = l[0], inp = h('input', { type: 'text' });
      inp.value = Object.prototype.hasOwnProperty.call(draft.texts, k) ? draft.texts[k] : (S.labelDefaults[k] || '');
      inp.addEventListener('input', function () { draft.texts[k] = inp.value; markDirty(); });
      g.appendChild(h('label', { class: 'adm-f' }, [h('span', { text: l[1] }), inp]));
    });
    w.appendChild(g); return w;
  }

  /* ---------- "edit on page": click any text on the real website and type ---------- */
  var MULTI = /^(hero\.(name|title|desc)|stats\.\d+\.label|quote\.(text|footer)|contact\.(heading|text)|process\.\d+\.text)$/;
  function plainOK() { var d = document.createElement('div'); try { d.contentEditable = 'plaintext-only'; } catch (e) { return false; } return d.contentEditable === 'plaintext-only'; }
  function getText(el) {
    var out = '';
    (function walk(n) {
      Array.prototype.forEach.call(n.childNodes, function (c) {
        if (c.nodeType === 3) out += c.nodeValue;
        else if (c.nodeName === 'BR') out += '\n';
        else if (c.nodeType === 1) { if ((c.nodeName === 'DIV' || c.nodeName === 'P') && out && out.slice(-1) !== '\n') out += '\n'; walk(c); }
      });
    })(el);
    return out.replace(/\r/g, '').replace(/\u00a0/g, ' ');
  }
  function vTarget(e) { return e.target && e.target.closest ? e.target.closest('#content [data-bind], #content [data-edit]') : null; }
  function vInput(e) {
    var el = vTarget(e); if (!el) return;
    var v = getText(el).replace(/\n+$/, ''), path = el.getAttribute('data-bind');
    if (path) setPath(draft, path, v); else draft.texts[el.getAttribute('data-edit')] = v;
    markDirty();
  }
  function vKey(e) {
    if (e.key !== 'Enter') return;
    var el = vTarget(e); if (!el) return;
    var path = el.getAttribute('data-bind');
    if (!path || !MULTI.test(path)) { e.preventDefault(); }
  }
  function vClick(e) {
    var img = e.target.closest && e.target.closest('img[data-img-path]');
    if (img) { e.preventDefault(); vPickImage(img); return; }
    if (e.target.closest && e.target.closest('#content a')) e.preventDefault();   // links must not navigate while editing
  }
  function vPickImage(img) {
    if (!vFile) {
      vFile = h('input', { type: 'file', accept: 'image/*', style: 'display:none' }); document.body.appendChild(vFile);
    }
    vFile.value = '';
    vFile.onchange = function () {
      if (!vFile.files[0]) return; toast('Uploading image…');
      uploadImage(vFile.files[0]).then(function (url) {
        setPath(draft, img.getAttribute('data-img-path'), url); img.src = S.safeImg(url); markDirty(); toast('Image ready — press SAVE & PUBLISH');
      }).catch(function (er) { toast(er.message || 'Image failed'); });
    };
    vFile.click();
  }
  function startVisual() {
    if (visual || !draft) return; visual = true;
    root.style.display = 'none'; document.body.classList.remove('adm-open'); document.body.classList.add('adm-editing');
    S.apply(clone(draft));
    var mode = plainOK() ? 'plaintext-only' : 'true';
    Array.prototype.forEach.call(document.querySelectorAll('#content [data-bind], #content [data-edit]:not([data-edit-panel])'), function (el) {
      var path = el.getAttribute('data-bind'), key = el.getAttribute('data-edit');
      var val = path ? getPath(draft, path) : (Object.prototype.hasOwnProperty.call(draft.texts, key) ? draft.texts[key] : S.labelDefaults[key]);
      el.textContent = val == null ? '' : String(val);       // raw text (line breaks kept as \n)
      el.classList.add('adm-ed'); el.setAttribute('contenteditable', mode); el.setAttribute('spellcheck', 'false');
    });
    Array.prototype.forEach.call(document.querySelectorAll('#content img[data-img-path]'), function (im) { im.classList.add('adm-img-edit'); im.title = 'Click to change this image'; });
    Array.prototype.forEach.call(document.querySelectorAll('#content a.project-card'), function (a) { a.removeAttribute('href'); a.removeAttribute('target'); });
    var m = document.getElementById('content');
    m.addEventListener('input', vInput); m.addEventListener('keydown', vKey); document.addEventListener('click', vClick, true);
    vDirty = h('span', { class: 'adm-chip dirty', text: 'UNSAVED', style: st.dirty ? '' : 'display:none' });
    vbar = h('div', { class: 'adm-vbar' }, [
      h('span', { class: 'adm-vtitle', text: '✎ EDITING — click any text to type. Click a project image to replace it.' }), vDirty,
      h('button', { class: 'adm-btn primary sm', type: 'button', text: 'SAVE & PUBLISH', onclick: save }),
      h('button', { class: 'adm-btn sm', type: 'button', text: '← BACK TO PANEL', onclick: stopVisual })
    ]);
    document.body.appendChild(vbar);
  }
  function stopVisual() {
    if (!visual) return; visual = false;
    var m = document.getElementById('content');
    m.removeEventListener('input', vInput); m.removeEventListener('keydown', vKey); document.removeEventListener('click', vClick, true);
    Array.prototype.forEach.call(document.querySelectorAll('.adm-ed'), function (el) { el.removeAttribute('contenteditable'); el.removeAttribute('spellcheck'); el.classList.remove('adm-ed'); });
    if (vbar) vbar.remove(); vbar = null; vDirty = null;
    document.body.classList.remove('adm-editing');
    S.apply(clone(draft));                                   // re-render everything from the draft (links work again)
    if (root) { root.style.display = ''; document.body.classList.add('adm-open'); renderTab(); }
  }
  function tabData() {
    var imp = h('input', { type: 'file', accept: 'application/json,.json', style: 'display:none' });
    imp.addEventListener('change', function () {
      var f = imp.files[0]; if (!f) return; var fr = new FileReader();
      fr.onload = function () { try { var j = JSON.parse(fr.result); if (!j.projects) throw 0; draft = ensure(j); markDirty(); renderTab(); toast('Imported — press SAVE & PUBLISH'); } catch (e) { toast('Invalid content file'); } };
      fr.readAsText(f);
    });
    return h('div', {}, [
      h('div', { class: 'adm-note' }, [st.live
        ? h('span', {}, [h('b', { text: 'Live sync is ON. ' }), 'Press SAVE & PUBLISH and the change appears for every visitor immediately.'])
        : h('span', {}, [h('b', { text: 'Local mode. ' }), 'Changes are saved only in this browser. To make them public for everyone: connect the free Upstash Redis storage (see README), or download content.json below and replace the file in your project, then redeploy.'])]),
      h('div', { class: 'adm-row', style: 'flex-wrap:wrap' }, [
        h('button', { class: 'adm-btn primary', type: 'button', text: 'DOWNLOAD content.json', onclick: function () {
          var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(draft, null, 2)], { type: 'application/json' })); a.download = 'content.json'; a.click(); } }),
        h('button', { class: 'adm-btn', type: 'button', text: 'IMPORT content.json', onclick: function () { imp.click(); } }), imp,
        h('button', { class: 'adm-btn danger', type: 'button', text: 'RESET TO ORIGINAL', onclick: function () {
          if (!confirm('Reset everything to the original portfolio content?')) return;
          fetch('content.json', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (c) { draft = ensure(c); markDirty(); renderTab(); toast('Reset — press SAVE & PUBLISH'); }); } })
      ])
    ]);
  }

  /* ---------- save ---------- */
  function normUrl(u) { u = String(u || '').trim(); if (u && !/^[a-z][a-z0-9+.-]*:/i.test(u)) u = 'https://' + u; return u; }
  function save() {
    draft.projects.forEach(function (p) { p.url = normUrl(p.url); if (!p.id) p.id = 'p' + Date.now(); });
    if (draft.socials) { draft.socials.instagram = normUrl(draft.socials.instagram); draft.socials.linkedin = normUrl(draft.socials.linkedin); }
    if (draft.contact) draft.contact.whatsapp = String(draft.contact.whatsapp || '').replace(/\D/g, '');
    draft.blocks = draft.blocks.filter(function (b) { return b && /^[A-Za-z0-9_-]{1,40}$/.test(String(b.id || '')); });
    draft.sections.order = seq(); draft.version = 2;
    var done = function (msg) {
      if (visual) S.current = clone(draft); else S.apply(clone(draft));   // while editing on the page the DOM already shows the draft
      st.dirty = false; if (dirtyChip) dirtyChip.style.display = 'none'; if (vDirty) vDirty.style.display = 'none'; toast(msg);
    };
    if (st.live) {
      toast('Saving…');
      api('content', 'POST', { value: draft }).then(function (r) {
        if (r.ok) { S.cacheLive(clone(draft)); done('Saved & published ✓'); }
        else if (r.status === 413) toast('Too large — remove big images or use image URLs');
        else if (r.status === 401) toast('Session expired — login again');
        else toast('Save failed (' + r.status + ')');
      }).catch(function () { toast('Network error'); });
    } else {
      try { localStorage.setItem(S.LS_KEY, JSON.stringify(draft)); done('Saved in this browser ✓'); }
      catch (e) { toast('Browser storage full — use smaller images or image URLs'); }
    }
  }

  /* ---------- open / close ---------- */
  function close() {
    if (st.dirty && !confirm('You have unsaved changes. Close anyway?')) return;
    if (visual) stopVisual();
    stopStats(); st.dirty = false; if (root) root.remove(); root = null; document.body.classList.remove('adm-open');
    if (location.hash === '#admin') history.replaceState(null, '', location.pathname + location.search);
  }
  function logout() { sessionStorage.removeItem(SS_KEY); st.pw = ''; st.dirty = false; showLogin(); }
  function open() {
    if (root) return;
    root = h('div', { class: 'adm-overlay' }); document.body.appendChild(root); document.body.classList.add('adm-open');
    var saved = sessionStorage.getItem(SS_KEY);
    if (saved) {
      authenticate(saved).then(function (r) { if (r.ok) { st.pw = saved; st.live = r.live; st.weak = !!r.weak; st.envSeen = r.envSeen || []; startPanel(); } else showLogin(); });
    } else showLogin();
  }
  window.AdminPanel = { open: open, busy: function () { return !!root; } };
})();
