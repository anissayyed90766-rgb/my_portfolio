/* Renders editable content (from admin) into the existing markup + WhatsApp contact form.
   The static HTML is the default; this swaps text/links/cards/theme/layout using the SAME classes.
   Everything the admin can change lives in ONE content object (content.json shape). */
(function () {
  'use strict';
  var LS_KEY = 'portfolio_content_v1';          // admin's own browser copy (local mode)
  var CACHE_KEY = 'portfolio_live_cache_v1';    // last live copy, so returning visitors see it instantly
  var DEFAULT_ORDER = ['hero', 'projects', 'details', 'contact'];
  var PLACEHOLDER = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><rect width="100%" height="100%" fill="#111"/><text x="50%" y="50%" fill="#555" font-family="Arial" font-size="48" text-anchor="middle">NO IMAGE</text></svg>');

  /* Fonts the admin can choose (whitelist = nothing else is ever loaded) */
  var FONTS = {
    heading: [['Oswald', 'sans-serif'], ['Bebas Neue', 'sans-serif'], ['Anton', 'sans-serif'], ['Poppins', 'sans-serif'], ['Montserrat', 'sans-serif'], ['Space Grotesk', 'sans-serif'], ['Raleway', 'sans-serif'], ['Playfair Display', 'serif']],
    body: [['Inter', 'sans-serif'], ['Poppins', 'sans-serif'], ['Roboto', 'sans-serif'], ['Open Sans', 'sans-serif'], ['DM Sans', 'sans-serif'], ['Lato', 'sans-serif'], ['Nunito', 'sans-serif']],
    script: [['Caveat', 'cursive'], ['Pacifico', 'cursive'], ['Dancing Script', 'cursive'], ['Satisfy', 'cursive'], ['Kalam', 'cursive']]
  };
  var PRELOADED = { 'Oswald': 1, 'Inter': 1, 'Caveat': 1 };

  /* Static labels that are not part of the structured content (key -> human name) */
  var LABELS = [
    ['projectsHeading', 'Projects section heading'], ['viewAll', '"View all projects" link'],
    ['detailsHeading', 'Education & Skills heading'], ['educationHeading', '"Education" sub-heading'],
    ['skillsHeading', '"Skills" sub-heading'], ['processHeading', 'Work Process heading'],
    ['contactBadge', 'Contact availability badge'], ['contactInfoHeading', '"Contact Details" heading'],
    ['sendButton', 'Send button text'], ['namePh', 'Form: name placeholder'], ['emailPh', 'Form: email placeholder'],
    ['subjectPh', 'Form: subject placeholder'], ['messagePh', 'Form: message placeholder']
  ];

  function $(id) { return document.getElementById(id); }
  function T(t) { return document.createTextNode(t); }
  function E(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function B(el, path) { el.setAttribute('data-bind', path); return el; }   // marks an element the visual editor can edit
  function lines(el, text) {
    el.textContent = '';
    String(text == null ? '' : text).split('\n').forEach(function (t, i) {
      if (i) el.appendChild(document.createElement('br'));
      el.appendChild(T(t));
    });
  }
  function safeUrl(u) {
    u = String(u || '').trim();
    if (/^https?:\/\//i.test(u)) return u;
    return '#';
  }
  function safeImg(u) {
    u = String(u || '').trim();
    if (!u) return PLACEHOLDER;
    if (/^(https?:\/\/|data:image\/(jpeg|png|webp|gif);base64,)/i.test(u)) return u;
    if (/^[a-z][a-z0-9+.-]*:/i.test(u)) return PLACEHOLDER;   // block javascript: etc.
    return u;                                                  // relative path / same-site url
  }
  function arr(a) { return Array.isArray(a) ? a : null; }

  /* ---------- label defaults (captured once, before anything is changed) ---------- */
  var labelDefaults = {};
  LABELS.forEach(function (l) {
    var el = document.querySelector('[data-edit="' + l[0] + '"]');
    if (el) { labelDefaults[l[0]] = el.textContent.trim(); return; }
    var ph = document.querySelector('[data-edit-ph="' + l[0] + '"]');
    if (ph) labelDefaults[l[0]] = ph.getAttribute('placeholder') || '';
  });
  var defaultTitle = document.title;

  function applyLabels(texts) {
    texts = texts || {};
    LABELS.forEach(function (l) {
      var k = l[0], has = Object.prototype.hasOwnProperty.call(texts, k) && typeof texts[k] === 'string';
      var v = has ? texts[k] : labelDefaults[k];
      var el = document.querySelector('[data-edit="' + k + '"]');
      if (el) el.textContent = v == null ? '' : v;
      var ph = document.querySelector('[data-edit-ph="' + k + '"]');
      if (ph) ph.setAttribute('placeholder', v == null ? '' : v);
    });
  }

  /* ---------- theme / fonts / custom css ---------- */
  var HEX = /^#[0-9a-f]{6}$/i;
  function applyTheme(t) {
    t = t || {};
    var st = document.documentElement.style;
    function setVar(name, val) { if (typeof val === 'string' && HEX.test(val)) st.setProperty(name, val); else st.removeProperty(name); }
    setVar('--red', t.accent); setVar('--text-main', t.text); setVar('--text-muted', t.muted); setVar('--border', t.border);
    var hasBg = typeof t.bg === 'string' && HEX.test(t.bg), a = parseFloat(t.overlay), hasA = isFinite(a) && a >= 0 && a <= 1;
    if (hasBg || hasA) {
      var hx = hasBg ? t.bg : '#0a0a0a';
      st.setProperty('--bg-color', 'rgba(' + parseInt(hx.substr(1, 2), 16) + ',' + parseInt(hx.substr(3, 2), 16) + ',' + parseInt(hx.substr(5, 2), 16) + ',' + (hasA ? a : 0.4) + ')');
    } else st.removeProperty('--bg-color');
    [['heading', 'fontHeading', '--font-heading'], ['body', 'fontBody', '--font-body'], ['script', 'fontScript', '--font-script']].forEach(function (f) {
      var want = t[f[1]], found = null;
      FONTS[f[0]].forEach(function (x) { if (x[0] === want) found = x; });
      if (!found) { st.removeProperty(f[2]); return; }
      if (!PRELOADED[found[0]] && !document.getElementById('gf-' + found[0].replace(/\s/g, '-'))) {
        var l = document.createElement('link'); l.rel = 'stylesheet'; l.id = 'gf-' + found[0].replace(/\s/g, '-');
        l.href = 'https://fonts.googleapis.com/css2?family=' + found[0].replace(/ /g, '+') + ':wght@300;400;600;700&display=swap';
        document.head.appendChild(l);
      }
      st.setProperty(f[2], "'" + found[0] + "', " + found[1]);
    });
  }
  function cleanCss(css) {
    return String(css || '').replace(/@import[^;]*;?/gi, '').replace(/javascript:/gi, '').replace(/expression\s*\(/gi, '').replace(/<\/?style/gi, '').slice(0, 50000);
  }
  function applyCustomCss(css) {
    var s = $('site-custom-css');
    if (!css || !String(css).trim()) { if (s) s.remove(); return; }
    if (!s) { s = document.createElement('style'); s.id = 'site-custom-css'; document.head.appendChild(s); }
    s.textContent = cleanCss(css);
  }

  /* ---------- safe HTML for custom sections (whitelist; scripts/iframes/forms never get through) ---------- */
  var ALLOWED = {}; ('A B STRONG I EM U S BR P DIV SPAN H1 H2 H3 H4 H5 H6 UL OL LI IMG HR BLOCKQUOTE CODE PRE SMALL MARK ' +
    'TABLE THEAD TBODY TR TH TD FIGURE FIGCAPTION SECTION ARTICLE').split(' ').forEach(function (t) { ALLOWED[t] = 1; });
  var DROP = {}; 'SCRIPT STYLE IFRAME OBJECT EMBED LINK META BASE FORM INPUT TEXTAREA BUTTON SELECT NOSCRIPT TEMPLATE TITLE SVG MATH'.split(' ').forEach(function (t) { DROP[t] = 1; });
  var ATTRS = { href: 1, src: 1, alt: 1, title: 1, class: 1, style: 1, target: 1, width: 1, height: 1, colspan: 1, rowspan: 1 };
  function safeLink(u) {
    u = String(u || '').trim();
    if (/^(https?:\/\/|mailto:|tel:|#)/i.test(u)) return u;
    if (/^[a-z][a-z0-9+.-]*:/i.test(u)) return null;
    return u;
  }
  function sanitizeHtml(html) {
    var doc = new DOMParser().parseFromString(String(html || ''), 'text/html');   // inert document: nothing executes
    var frag = document.createDocumentFragment();
    (function walk(node, out) {
      Array.prototype.forEach.call(node.childNodes, function (ch) {
        if (ch.nodeType === 3) { out.appendChild(T(ch.nodeValue)); return; }
        if (ch.nodeType !== 1) return;
        var tag = ch.tagName.toUpperCase();
        if (DROP[tag]) return;
        if (!ALLOWED[tag]) { walk(ch, out); return; }
        var el = document.createElement(tag.toLowerCase());
        Array.prototype.forEach.call(ch.attributes, function (a) {
          var n = a.name.toLowerCase(), v = a.value;
          if (!ATTRS[n]) return;
          if (n === 'href') { v = safeLink(v); if (v == null) return; }
          else if (n === 'src') { if (tag !== 'IMG') return; v = safeImg(v); }
          else if (n === 'style') { if (/url\s*\(|expression|javascript:|@import/i.test(v)) return; }
          else if (n === 'target') { v = '_blank'; }
          el.setAttribute(n, v);
        });
        if (el.getAttribute('target')) el.setAttribute('rel', 'noopener noreferrer');
        walk(ch, el); out.appendChild(el);
      });
    })(doc.body, frag);
    return frag;
  }
  function renderBody(into, text) {
    text = String(text || '');
    if (/<[a-z!\/]/i.test(text)) { into.appendChild(sanitizeHtml(text)); return; }
    text.split(/\n{2,}/).forEach(function (para) {
      if (!para.trim()) return; var p = E('p'); lines(p, para.trim()); into.appendChild(p);
    });
  }

  /* ---------- sections: custom blocks, order, visibility ---------- */
  function renderBlocks(list) {
    Array.prototype.forEach.call(document.querySelectorAll('#content .custom-block'), function (n) { n.remove(); });
    var main = $('content'), footer = main && main.querySelector('footer');
    if (!main) return;
    (list || []).forEach(function (b, i) {
      if (!b || !/^[A-Za-z0-9_-]{1,40}$/.test(String(b.id || ''))) return;
      var s = E('section', 'custom-block'); s.setAttribute('data-sec', b.id);
      if (b.title) { var hd = E('div', 'section-header'); hd.appendChild(B(E('h2', null, b.title), 'blocks.' + i + '.title')); s.appendChild(hd); }
      var body = E('div', 'custom-body'); renderBody(body, b.html); s.appendChild(body);
      main.insertBefore(s, footer);
    });
  }
  function applySections(sec, blocks) {
    var main = $('content'), footer = main && main.querySelector('footer');
    if (!main) return;
    sec = sec || {};
    var ids = DEFAULT_ORDER.slice();
    (blocks || []).forEach(function (b) { if (b && b.id) ids.push(String(b.id)); });
    var els = {};
    Array.prototype.forEach.call(main.querySelectorAll('[data-sec]'), function (n) { els[n.getAttribute('data-sec')] = n; });
    var seen = {}, seq = [];
    (arr(sec.order) || []).concat(ids).forEach(function (id) { if (els[id] && !seen[id]) { seen[id] = 1; seq.push(id); } });
    var hidden = {}; (arr(sec.hidden) || []).forEach(function (id) { hidden[id] = 1; });
    seq.forEach(function (id) { main.insertBefore(els[id], footer); els[id].hidden = !!hidden[id]; });
  }

  /* ---------- structured content ---------- */
  function renderProjects(list) {
    var grid = $('project-grid'); if (!grid) return;
    grid.textContent = '';
    list.forEach(function (p, i) {
      var a = E('a', 'project-card');
      a.href = safeUrl(p.url);
      a.setAttribute('style', 'text-decoration: none; color: inherit; display: block;');
      a.target = '_blank'; a.rel = 'noopener noreferrer';
      var img = document.createElement('img');
      img.src = safeImg(p.image); img.alt = p.title || 'Project'; img.loading = 'lazy';
      img.setAttribute('data-img-path', 'projects.' + i + '.image');
      a.appendChild(img);
      var info = E('div', 'project-info');
      info.appendChild(E('div', 'project-num', ('0' + (i + 1)).slice(-2)));
      var txt = E('div', 'project-text');
      txt.appendChild(B(E('h3', null, p.title || ''), 'projects.' + i + '.title'));
      txt.appendChild(B(E('p', null, p.category || ''), 'projects.' + i + '.category'));
      info.appendChild(txt);
      var ar = E('div', 'arrow'); ar.innerHTML = '&rarr;'; info.appendChild(ar);
      a.appendChild(info);
      grid.appendChild(a);
    });
  }

  function apply(c) {
    if (!c || typeof c !== 'object') return;
    try {
      var h = c.hero;
      if (h) {
        if ($('hero-nav-left')) B($('hero-nav-left'), 'hero.navLeft').textContent = h.navLeft || '';
        var nr = $('hero-nav-right');
        if (nr) { nr.textContent = ''; nr.appendChild(B(E('span', null, h.navRight || ''), 'hero.navRight')); nr.appendChild(T(' ')); nr.appendChild(E('span', 'plus', '+')); }
        if ($('hero-greeting')) B($('hero-greeting'), 'hero.greeting').textContent = h.greeting || '';
        if ($('hero-name')) lines(B($('hero-name'), 'hero.name'), h.name);
        if ($('hero-title')) lines(B($('hero-title'), 'hero.title'), h.title);
        if ($('hero-desc')) B($('hero-desc'), 'hero.desc').textContent = h.desc || '';
        var b = $('hero-badge');
        if (b) { b.textContent = ''; b.appendChild(E('span', 'icon', '🌐')); b.appendChild(T(' ')); b.appendChild(B(E('span', null, h.badge || ''), 'hero.badge')); }
        if ($('hero-tagline')) B($('hero-tagline'), 'hero.tagline').textContent = h.tagline || '';
      }
      if (arr(c.stats) && $('stats-list')) {
        var st = $('stats-list'); st.textContent = '';
        c.stats.forEach(function (s, i) {
          var d = E('div', 'stat'); d.appendChild(B(E('span', 'stat-num', s.num || ''), 'stats.' + i + '.num'));
          var l = B(E('span', 'stat-label'), 'stats.' + i + '.label'); lines(l, s.label); d.appendChild(l); st.appendChild(d);
        });
      }
      if (arr(c.projects)) renderProjects(c.projects);
      if (arr(c.education) && $('edu-list')) {
        var ed = $('edu-list'); ed.textContent = '';
        c.education.forEach(function (e, i) {
          var it = E('div', 'edu-item'); var l = E('div');
          l.appendChild(B(E('strong', null, e.title || ''), 'education.' + i + '.title')); l.appendChild(B(E('p', null, e.place || ''), 'education.' + i + '.place'));
          it.appendChild(l); it.appendChild(B(E('span', 'year', e.year || ''), 'education.' + i + '.year')); ed.appendChild(it);
        });
      }
      if (arr(c.skills) && $('skills-list')) {
        var sk = $('skills-list'); sk.textContent = '';
        c.skills.forEach(function (s, i) { sk.appendChild(B(E('span', 'skill-tag', s), 'skills.' + i)); });
      }
      if (arr(c.process) && $('process-list')) {
        var pl = $('process-list'); pl.textContent = '';
        c.process.forEach(function (p, i) {
          var it = E('div', 'process-item');
          it.appendChild(E('div', 'process-num', ('0' + (i + 1)).slice(-2)));
          it.appendChild(B(E('div', 'process-icon', p.icon || ''), 'process.' + i + '.icon'));
          var tx = E('div', 'process-text'); tx.appendChild(B(E('h4', null, p.title || ''), 'process.' + i + '.title')); tx.appendChild(B(E('p', null, p.text || ''), 'process.' + i + '.text'));
          it.appendChild(tx); pl.appendChild(it);
        });
      }
      var q = c.quote;
      if (q) {
        if ($('quote-text')) B($('quote-text'), 'quote.text').textContent = q.text || '';
        if ($('quote-signature')) B($('quote-signature'), 'quote.signature').textContent = q.signature || '';
        if ($('quote-footer')) lines(B($('quote-footer'), 'quote.footer'), q.footer);
      }
      var ct = c.contact;
      if (ct) {
        var ch = $('contact-heading');
        if (ch) { ch.textContent = ''; var hs = B(E('span'), 'contact.heading'); lines(hs, ct.heading); ch.appendChild(hs); ch.appendChild(T(' ')); ch.appendChild(E('span', 'star', '✦')); }
        if ($('contact-text')) B($('contact-text'), 'contact.text').textContent = ct.text || '';
        var ul = $('contact-list');
        if (ul) {
          ul.textContent = '';
          [['&#9993;', 'email'], ['&#128222;', 'phone'], ['&#128205;', 'address']].forEach(function (r) {
            var li = document.createElement('li'); var ic = E('span', 'icon'); ic.innerHTML = r[0];
            li.appendChild(ic); li.appendChild(B(E('span', null, ct[r[1]] || ''), 'contact.' + r[1])); ul.appendChild(li);
          });
        }
      }
      var so = c.socials;
      if (so) {
        if ($('soc-instagram') && so.instagram) $('soc-instagram').href = safeUrl(so.instagram);
        if ($('soc-linkedin') && so.linkedin) $('soc-linkedin').href = safeUrl(so.linkedin);
      }
      if (c.footer && $('footer-copy')) B($('footer-copy'), 'footer.copyright').textContent = c.footer.copyright || '';

      /* page-wide: labels, theme, fonts, css, custom sections, order */
      applyLabels(c.texts);
      applyTheme(c.theme);
      applyCustomCss(c.customCss);
      renderBlocks(arr(c.blocks));
      applySections(c.sections, arr(c.blocks));
      document.title = (c.site && typeof c.site.title === 'string' && c.site.title.trim()) ? c.site.title.trim() : defaultTitle;
    } catch (err) { if (window.console) console.error('Content render error', err); }
    Site.current = c;
  }

  var Site = window.Site = {
    apply: apply, current: null, LS_KEY: LS_KEY, safeUrl: safeUrl, safeImg: safeImg, PLACEHOLDER: PLACEHOLDER,
    FONTS: FONTS, LABELS: LABELS, labelDefaults: labelDefaults, DEFAULT_ORDER: DEFAULT_ORDER,
    cacheLive: function (c) { try { localStorage.setItem(CACHE_KEY, JSON.stringify(c)); } catch (e) { } }
  };

  /* Load order: last live copy (instant) -> live data from /api -> this browser's admin copy -> static HTML as shipped */
  var applied = false, lastLive = '', lastFetch = 0;
  function useLocal() {
    try { var raw = localStorage.getItem(LS_KEY); if (raw) { apply(JSON.parse(raw)); applied = true; } } catch (e) { }
  }
  function fetchLive() {
    lastFetch = Date.now();
    return fetch('/api/data?k=content', { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw 0; return r.json(); })
      .then(function (j) {
        if (!(j && j.projects)) throw 0;
        if (window.AdminPanel && window.AdminPanel.busy && window.AdminPanel.busy()) return;   // never overwrite what the admin is editing
        var s = JSON.stringify(j); Site.cacheLive(j);
        if (s !== lastLive) { lastLive = s; apply(j); applied = true; }
      })
      .catch(function () { if (!applied) useLocal(); });
  }
  (function load() {
    try { var cached = localStorage.getItem(CACHE_KEY); if (cached) { var cj = JSON.parse(cached); lastLive = JSON.stringify(cj); apply(cj); applied = true; } } catch (e) { }
    if (!window.fetch) { if (!applied) useLocal(); return; }
    fetchLive();
    /* open tab becomes visible again -> pick up the admin's newest changes (cheap, at most every 30s) */
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible' && Date.now() - lastFetch > 30000) fetchLive();
    });
  })();

  /* Contact form -> WhatsApp */
  var form = $('contact-form');
  if (form) {
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var f = form.elements;
      var num = String((Site.current && Site.current.contact && Site.current.contact.whatsapp) || '917057477861').replace(/\D/g, '');
      var msg = 'Hello Anis, new message from your portfolio website:\n\n' +
        'Name: ' + f.name.value.trim() + '\n' +
        'Email: ' + f.email.value.trim() + '\n' +
        'Subject: ' + f.subject.value.trim() + '\n' +
        'Message: ' + f.message.value.trim();
      var url = 'https://wa.me/' + num + '?text=' + encodeURIComponent(msg);
      var a = document.createElement('a');
      a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer';
      document.body.appendChild(a); a.click(); a.remove();
      form.reset();
    });
  }

  /* Visitor counter: one anonymous random id per browser (no IP, no personal data).
     Counts one view per browser session; the admin's own browser is never counted. */
  (function track() {
    try {
      if (!window.fetch) return;
      if (localStorage.getItem('portfolio_owner') === '1' || sessionStorage.getItem('portfolio_admin_session')) return;
      var vid = localStorage.getItem('portfolio_vid'), isNew = false;
      if (!vid) {
        var a = new Uint8Array(12); (window.crypto || {}).getRandomValues ? crypto.getRandomValues(a) : a.forEach(function (_, i) { a[i] = Math.random() * 256; });
        vid = Array.prototype.map.call(a, function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
        localStorage.setItem('portfolio_vid', vid); isNew = true;
      }
      function send(kind, extra) {
        var body = JSON.stringify(Object.assign({ vid: vid, kind: kind }, extra || {}));
        if (navigator.sendBeacon && kind === 'ping') { try { if (navigator.sendBeacon('/api/data?k=ping', new Blob([body], { type: 'application/json' }))) return; } catch (e) { } }
        fetch('/api/data?k=' + (kind === 'ping' ? 'ping' : 'hit'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body, keepalive: true }).catch(function () { });
      }
      if (!sessionStorage.getItem('portfolio_counted')) {
        sessionStorage.setItem('portfolio_counted', '1');
        send(isNew ? 'new' : 'return', { ref: document.referrer || '' });
      }
      /* "online now": tell the server this tab is still open (only while visible, every 2 minutes) */
      setInterval(function () { if (document.visibilityState === 'visible') send('ping'); }, 120000);
    } catch (e) { }
  })();

  /* Admin (loaded only when needed) */
  var opener = $('admin-open'), loading = false;
  function openAdmin(ev) {
    if (ev) ev.preventDefault();
    if (window.AdminPanel) return window.AdminPanel.open();
    if (loading) return; loading = true;
    var s = document.createElement('script'); s.src = 'admin.js';
    s.onload = function () { loading = false; window.AdminPanel.open(); };
    s.onerror = function () { loading = false; alert('Could not load admin panel.'); };
    document.body.appendChild(s);
  }
  if (opener) opener.addEventListener('click', openAdmin);
  if (location.hash === '#admin') openAdmin();
})();
