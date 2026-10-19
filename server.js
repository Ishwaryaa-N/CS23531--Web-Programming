'use strict';

const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const DB_FILE = process.env.DB_FILE || path.join(__dirname, 'data', 'db.json');

if (!process.env.JWT_SECRET) {
  console.warn('[warn] JWT_SECRET is not set. Using a development secret.');
}

const PLACES = ['Library', 'Canteen', 'Block A', 'Hostel', 'Admin Office', 'Block B', 'Sports Ground', 'Parking', 'Main Gate'];
const CAT_COUNT = 9;
const STATUSES = ['open', 'claimed', 'returned'];

/* ---------- tiny JSON-file database ---------- */
const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

function seed() {
  const h = (p) => bcrypt.hashSync(p, 10);
  return {
    users: [
      { id: 1, name: 'Campus Admin', email: 'admin@campus.edu', pass: h('admin123'), role: 'admin', phone: '', joined: daysAgo(30) },
      { id: 2, name: 'Asha', email: 'asha@campus.edu', pass: h('asha123'), role: 'student', phone: '98765 11111', joined: daysAgo(10) },
      { id: 3, name: 'Ravi', email: 'ravi@campus.edu', pass: h('ravi123'), role: 'student', phone: '98765 22222', joined: daysAgo(9) },
    ],
    items: [
      { id: 1, userId: 2, type: 'lost', title: 'Black leather wallet', cat: 2, place: 'Library', date: daysAgo(2), desc: 'Black wallet with student ID inside', stored: '', photo: '', status: 'open' },
      { id: 2, userId: 3, type: 'found', title: 'Wallet near canteen', cat: 2, place: 'Canteen', date: daysAgo(1), desc: 'Black leather wallet found on a bench', stored: 'Security office', photo: '', status: 'open' },
      { id: 3, userId: 3, type: 'found', title: 'Blue water bottle', cat: 7, place: 'Block A', date: daysAgo(3), desc: 'Blue steel bottle with a sticker', stored: 'Block A reception', photo: '', status: 'open' },
      { id: 4, userId: 2, type: 'lost', title: 'House keys with red tag', cat: 4, place: 'Parking', date: daysAgo(4), desc: 'Three keys on a red keychain', stored: '', photo: '', status: 'open' },
      { id: 5, userId: 3, type: 'lost', title: 'Physics notebook', cat: 3, place: 'Block B', date: daysAgo(2), desc: 'Blue notebook with name on cover', stored: '', photo: '', status: 'open' },
    ],
    claims: [],
    notes: [],
    pairs: [],
  };
}

let db;
try {
  db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
} catch (e) {
  db = seed();
}

let timer = null;
function flush() {
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, DB_FILE);
}
function persist() {
  clearTimeout(timer);
  timer = setTimeout(flush, 100);
}
flush();
['SIGINT', 'SIGTERM'].forEach((s) => process.on(s, () => { flush(); process.exit(0); }));

/* ---------- helpers ---------- */
const clean = (v, max) => String(v == null ? '' : v).trim().slice(0, max);
const same = (a, b) => String(a) === String(b);
const indexOf = (arr, id) => arr.findIndex((x) => same(x.id, id));

function fail(status, message) {
  const e = new Error(message);
  e.status = status;
  throw e;
}

function ownRecord(u) {
  return { id: u.id, name: u.name, email: u.email, role: u.role, phone: u.phone, joined: u.joined };
}

function newId(arr) {
  let id = Date.now();
  while (arr.some((x) => same(x.id, id))) id++;
  return id;
}

/* ---------- app ---------- */
const app = express();
app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json({ limit: '6mb' }));

const hits = new Map();
function limit(req, res, next) {
  const now = Date.now();
  const h = hits.get(req.ip) || { n: 0, reset: now + 60000 };
  if (now > h.reset) { h.n = 0; h.reset = now + 60000; }
  h.n++;
  hits.set(req.ip, h);
  if (h.n > 20) return res.status(429).json({ error: 'Too many attempts. Try again in a minute.' });
  next();
}

function auth(req, res, next) {
  const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
  if (!m) return res.status(401).json({ error: 'Please log in' });
  try {
    const payload = jwt.verify(m[1], JWT_SECRET);
    const user = db.users.find((u) => same(u.id, payload.id));
    if (!user) return res.status(401).json({ error: 'Account no longer exists' });
    req.user = user;
    next();
  } catch (e) {
    res.status(401).json({ error: 'Session expired. Please log in again.' });
  }
}
const token = (u) => jwt.sign({ id: u.id }, JWT_SECRET, { expiresIn: '7d' });

app.get('/api/health', (req, res) => res.json({ ok: true }));

/* ---------- signup / login ---------- */
app.post('/api/signup', limit, (req, res) => {
  const b = req.body || {};
  const name = clean(b.name, 60);
  const email = clean(b.email, 120).toLowerCase();
  const password = String(b.password || '');
  const role = b.role === 'staff' ? 'staff' : 'student'; // nobody can sign up as admin
  const phone = clean(b.phone, 20);

  if (!name) return res.status(400).json({ error: 'Name is required' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be 6+ characters' });
  if (db.users.some((u) => u.email === email)) return res.status(409).json({ error: 'This email is already registered' });

  const user = { id: newId(db.users), name, email, pass: bcrypt.hashSync(password, 10), role, phone, joined: today() };
  db.users.push(user);
  persist();
  res.status(201).json({ token: token(user), user: ownRecord(user) });
});

app.post('/api/login', limit, (req, res) => {
  const email = clean((req.body || {}).email, 120).toLowerCase();
  const password = String((req.body || {}).password || '');
  const user = db.users.find((u) => u.email === email);
  if (!user || !bcrypt.compareSync(password, user.pass)) {
    return res.status(401).json({ error: 'Email or password is incorrect' });
  }
  res.json({ token: token(user), user: ownRecord(user) });
});

/* ---------- read everything this user may see ---------- */
app.get('/api/data', auth, (req, res) => {
  const me = req.user;
  const admin = me.role === 'admin';

  let users, claims, notes, pairs;
  if (admin) {
    users = db.users.map(ownRecord);
    claims = db.claims;
    notes = db.notes.filter((n) => same(n.userId, me.id));
    pairs = db.pairs;
  } else {
    const shareWith = new Set(); // owners whose phone may be shown (claim approved)
    db.claims.forEach((c) => {
      if (same(c.userId, me.id) && c.status === 'approved') {
        const it = db.items.find((i) => same(i.id, c.itemId));
        if (it) shareWith.add(String(it.userId));
      }
    });
    users = db.users.map((u) => {
      if (same(u.id, me.id)) return ownRecord(u);
      const o = { id: u.id, name: u.name, role: u.role };
      if (shareWith.has(String(u.id))) o.phone = u.phone;
      return o;
    });
    claims = db.claims.filter((c) => {
      if (same(c.userId, me.id)) return true;
      const it = db.items.find((i) => same(i.id, c.itemId));
      return it && same(it.userId, me.id);
    });
    notes = db.notes.filter((n) => same(n.userId, me.id));
    pairs = [];
  }
  res.json({ users, items: db.items, claims, notes, pairs });
});

/* ---------- save changes ---------- */
function removeItem(w, id) {
  w.items = w.items.filter((i) => !same(i.id, id));
  w.claims = w.claims.filter((c) => !same(c.itemId, id));
}

function apply(w, b, me) {
  const admin = me.role === 'admin';
  const list = (x, k) => (x && Array.isArray(x[k]) ? x[k] : []);

  // removals
  list(b.users, 'remove').forEach((id) => {
    if (!admin) fail(403, 'Only admin can remove users');
    if (same(id, me.id)) fail(400, 'You cannot remove yourself');
    w.items.filter((i) => same(i.userId, id)).forEach((i) => removeItem(w, i.id));
    w.claims = w.claims.filter((c) => !same(c.userId, id));
    w.notes = w.notes.filter((n) => !same(n.userId, id));
    w.users = w.users.filter((u) => !same(u.id, id));
  });

  list(b.items, 'remove').forEach((id) => {
    const it = w.items.find((i) => same(i.id, id));
    if (!it) return;
    if (!admin && !same(it.userId, me.id)) fail(403, 'You can delete only your own reports');
    removeItem(w, id);
  });

  list(b.claims, 'remove').forEach((id) => {
    if (!w.claims.find((x) => same(x.id, id))) return;
    if (!admin) fail(403, 'Only admin can delete claims');
    w.claims = w.claims.filter((x) => !same(x.id, id));
  });

  list(b.notes, 'remove').forEach((id) => {
    const n = w.notes.find((x) => same(x.id, id));
    if (!n) return;
    if (!admin && !same(n.userId, me.id)) fail(403, 'You can clear only your own notifications');
    w.notes = w.notes.filter((x) => !same(x.id, id));
  });

  // items
  list(b.items, 'upsert').forEach((raw) => {
    const i = indexOf(w.items, raw.id);
    if (i >= 0) {
      const cur = w.items[i];
      if (!admin && !same(cur.userId, me.id)) fail(403, 'You can change only your own reports');
      if (!STATUSES.includes(raw.status)) fail(400, 'Invalid status');
      if (raw.status === 'claimed' && !admin) fail(403, 'Only security can approve a claim');
      cur.status = raw.status;
      return;
    }
    const type = raw.type === 'found' ? 'found' : raw.type === 'lost' ? 'lost' : null;
    const cat = Number(raw.cat);
    const photo = String(raw.photo || '');
    if (!same(raw.userId, me.id)) fail(403, 'A report must be posted in your own name');
    if (!type) fail(400, 'Type must be lost or found');
    if (!clean(raw.title, 120)) fail(400, 'Item name is required');
    if (!Number.isInteger(cat) || cat < 0 || cat >= CAT_COUNT) fail(400, 'Invalid category');
    if (!PLACES.includes(raw.place)) fail(400, 'Invalid place');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(raw.date))) fail(400, 'Invalid date');
    if (photo && (!photo.startsWith('data:image/') || photo.length > 400000)) fail(400, 'Photo is too large');
    w.items.push({
      id: Number(raw.id) || newId(w.items), userId: me.id, type,
      title: clean(raw.title, 120), cat, place: raw.place, date: raw.date,
      desc: clean(raw.desc, 1000), stored: type === 'found' ? clean(raw.stored, 200) : '',
      photo, status: 'open',
    });
  });

  // claims
  list(b.claims, 'upsert').forEach((raw) => {
    const i = indexOf(w.claims, raw.id);
    if (i >= 0) {
      if (!admin) fail(403, 'Only security can decide a claim');
      if (!['pending', 'approved', 'rejected'].includes(raw.status)) fail(400, 'Invalid status');
      w.claims[i].status = raw.status;
      return;
    }
    const it = w.items.find((x) => same(x.id, raw.itemId));
    const proof = clean(raw.proof, 1000);
    if (!same(raw.userId, me.id)) fail(403, 'A claim must be sent in your own name');
    if (!it) fail(404, 'That item no longer exists');
    if (same(it.userId, me.id)) fail(400, 'You cannot claim your own item');
    if (w.claims.some((c) => same(c.itemId, it.id) && same(c.userId, me.id))) fail(409, 'You already sent a claim for this item');
    if (!proof) fail(400, 'Please describe the proof');
    w.claims.push({ id: Number(raw.id) || newId(w.claims), itemId: it.id, userId: me.id, proof, status: 'pending', date: today() });
  });

  // notifications
  list(b.notes, 'upsert').forEach((raw) => {
    if (indexOf(w.notes, raw.id) >= 0) return;
    if (!w.users.some((u) => same(u.id, raw.userId))) return;
    const text = clean(raw.text, 300);
    if (!text) fail(400, 'Empty notification');
    w.notes.push({ id: raw.id, userId: Number(raw.userId), text, date: today() });
  });

  // notified match pairs (admin only)
  const pa = list(b.pairs, 'add'), pr = list(b.pairs, 'remove');
  if ((pa.length || pr.length) && !admin) fail(403, 'Only admin can notify matches');
  pa.forEach((p) => { if (/^\d+-\d+$/.test(String(p)) && !w.pairs.includes(String(p))) w.pairs.push(String(p)); });
  w.pairs = w.pairs.filter((p) => !pr.includes(p));
}

app.post('/api/sync', auth, (req, res) => {
  const w = {
    users: db.users.slice(),
    items: db.items.map((x) => ({ ...x })),
    claims: db.claims.map((x) => ({ ...x })),
    notes: db.notes.slice(),
    pairs: db.pairs.slice(),
  };
  try {
    apply(w, req.body || {}, req.user);
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    throw e;
  }
  db = w;
  persist();
  res.json({ ok: true });
});

/* ---------- frontend + errors ---------- */
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
/* ---------- your frontend files, served exactly as they are ---------- */
const ROOT = fs.existsSync(path.join(__dirname, 'index.html')) ? __dirname : path.join(__dirname, 'public');

const API_JS = String.raw`
(function () {
  var BASE = (window.FINDR_API_URL || "").replace(/\/$/, "");
  var token = sessionStorage.getItem("fx_token") || "";
  var snap = null;
  var queue = Promise.resolve();
  var busy = 0;
  var lastHash = "";

  function api(method, path, body) {
    var headers = { "Content-Type": "application/json" };
    if (token) headers.Authorization = "Bearer " + token;
    return fetch(BASE + path, { method: method, headers: headers, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          if (!r.ok) {
            var e = new Error(j.error || "Server error (" + r.status + ")");
            e.status = r.status;
            throw e;
          }
          return j;
        });
      });
  }
  function fail(err) {
    toast(err.status ? err.message : "Cannot reach the server. Is it running?");
  }

  function take() {
    snap = { users: {}, items: {}, claims: {}, notes: {}, pairs: pairs.slice() };
    [["users", users], ["items", items], ["claims", claims], ["notes", notes]].forEach(function (p) {
      p[1].forEach(function (r) { snap[p[0]][String(r.id)] = JSON.stringify(r); });
    });
  }

  function diff() {
    var out = {}, any = false;
    [["users", users], ["items", items], ["claims", claims], ["notes", notes]].forEach(function (p) {
      var key = p[0], now = {}, up = [], rm = [];
      p[1].forEach(function (r) {
        var k = String(r.id);
        now[k] = true;
        if (snap[key][k] !== JSON.stringify(r)) up.push(r);
      });
      Object.keys(snap[key]).forEach(function (k) {
        if (!now[k]) rm.push(JSON.parse(snap[key][k]).id);
      });
      if (up.length || rm.length) { out[key] = { upsert: up, remove: rm }; any = true; }
    });
    var add = pairs.filter(function (x) { return snap.pairs.indexOf(x) === -1; });
    var gone = snap.pairs.filter(function (x) { return pairs.indexOf(x) === -1; });
    if (add.length || gone.length) { out.pairs = { add: add, remove: gone }; any = true; }
    return any ? out : null;
  }

  function pull() {
    return api("GET", "/api/data").then(function (d) {
      var hash = JSON.stringify(d);
      var changed = hash !== lastHash;
      lastHash = hash;
      users = d.users; items = d.items; claims = d.claims; notes = d.notes; pairs = d.pairs || [];
      take();
      if (me) me = users.filter(function (u) { return u.id === me.id; })[0] || me;
      return changed;
    });
  }

  function redraw() {
    if (!me) return;
    var y = window.scrollY;
    go(page);
    window.scrollTo(0, y);
  }

  function dropSession() {
    token = "";
    sessionStorage.removeItem("fx_token");
    sessionStorage.removeItem("fx_me");
    me = null;
    start();
  }

  window.save = function () {
    if (!token || !snap) return true;
    var changes = diff();
    if (!changes) return true;
    take();
    busy++;
    queue = queue
      .then(function () { return api("POST", "/api/sync", changes); })
      .catch(function (err) {
        if (err.status === 401) { toast(err.message); return dropSession(); }
        fail(err);
        return pull().then(redraw).catch(function () {});
      })
      .then(function () { busy--; });
    return true;
  };

  function enter(r) {
    token = r.token;
    sessionStorage.setItem("fx_token", token);
    return pull().then(function () {
      me = users.filter(function (u) { return u.id === r.user.id; })[0] || r.user;
      sessionStorage.setItem("fx_me", me.id);
      start();
    });
  }

  window.doLogin = function (e) {
    e.preventDefault();
    api("POST", "/api/login", { email: $("lEmail").value, password: $("lPass").value })
      .then(enter)
      .then(function () { $("loginForm").reset(); })
      .catch(fail);
  };

  window.doSignup = function (e) {
    e.preventDefault();
    api("POST", "/api/signup", {
      name: $("sName").value, email: $("sEmail").value, password: $("sPass").value,
      role: $("sRole").value, phone: $("sPhone").value
    })
      .then(enter)
      .then(function () {
        $("signupForm").reset();
        toast("Welcome to Findr, " + me.name.split(" ")[0]);
      })
      .catch(fail);
  };

  var originalLogout = window.logout;
  window.logout = function () {
    token = "";
    sessionStorage.removeItem("fx_token");
    originalLogout();
  };

  setInterval(function () {
    if (!token || !me || busy || !$("modal").classList.contains("hidden")) return;
    var a = document.activeElement;
    if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return;
    pull().then(function (changed) { if (changed) redraw(); }).catch(function (e) {
      if (e.status === 401) dropSession();
    });
  }, 15000);

  ["fx_users", "fx_items", "fx_claims", "fx_notes", "fx_pairs"].forEach(function (k) { localStorage.removeItem(k); });

  if (token) {
    pull().then(function () {
      var id = sessionStorage.getItem("fx_me");
      me = users.filter(function (u) { return String(u.id) === id; })[0] || null;
      if (!me) return dropSession();
      start();
    }).catch(dropSession);
  } else {
    me = null;
    sessionStorage.removeItem("fx_me");
    start();
  }
})();
`;

app.get('/api.js', (req, res) => res.type('application/javascript').send(API_JS));

app.get(['/', '/index.html'], (req, res) => {
  let html;
  try {
    html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  } catch (e) {
    return res.status(404).send('index.html was not found next to server.js');
  }
  if (!html.includes('api.js')) {
    const tag = '<script>window.FINDR_API_URL = "";</script>\n<script src="api.js"></script>';
    html = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, tag + '\n</body>') : html + tag;
  }
  res.type('html').send(html);
});

[['/style.css', 'text/css; charset=utf-8'], ['/script.js', 'application/javascript; charset=utf-8']].forEach(([url, type]) => {
  app.get(url, (req, res) => res.type(type).sendFile(path.join(ROOT, url.slice(1))));
});

app.use((err, req, res, next) => {
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Photo is too large. Try a smaller one.' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Bad request' });
  console.error(err);
  res.status(500).json({ error: 'Server error' });
});

app.listen(PORT, () => console.log('Findr running on http://localhost:' + PORT));
