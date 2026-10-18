/* ==========================================================
   FINDR - SMART CAMPUS LOST AND FOUND
   Modules: 1 User, 2 Lost/Found items, 3 Campus map,
            4 My activity, 5 Admin
   Data is saved in the browser (localStorage).
   ========================================================== */

/* ---------- settings and data ---------- */
var CATS = [
  { name: "ID / Cards", icon: "🪪" },
  { name: "Phone / Gadgets", icon: "📱" },
  { name: "Wallet / Money", icon: "👛" },
  { name: "Books / Notes", icon: "📚" },
  { name: "Keys", icon: "🔑" },
  { name: "Bags", icon: "🎒" },
  { name: "Clothing", icon: "🧥" },
  { name: "Bottle / Lunch box", icon: "🧴" },
  { name: "Other", icon: "📦" }
];

// Map buildings: x, y, width, height inside the SVG map
var PLACES = [
  { name: "Library",       x: 30,  y: 30,  w: 150, h: 90 },
  { name: "Canteen",       x: 210, y: 30,  w: 130, h: 90 },
  { name: "Block A",       x: 370, y: 30,  w: 190, h: 90 },
  { name: "Hostel",        x: 30,  y: 150, w: 150, h: 80 },
  { name: "Admin Office",  x: 210, y: 150, w: 130, h: 80 },
  { name: "Block B",       x: 370, y: 150, w: 190, h: 80 },
  { name: "Sports Ground", x: 30,  y: 260, w: 240, h: 70 },
  { name: "Parking",       x: 300, y: 260, w: 130, h: 70 },
  { name: "Main Gate",     x: 460, y: 260, w: 100, h: 70 }
];

function $(id) { return document.getElementById(id); }
function load(key) { return JSON.parse(localStorage.getItem(key) || "[]"); }

var users = load("fx_users");
var items = load("fx_items");
var claims = load("fx_claims");
var notes = load("fx_notes");
var pairs = load("fx_pairs");

var me = null;
var page = "home";
var adminTab = "overview";
var filter = { type: "all", q: "", cat: "", place: "" };
var photo = "";

function save() {
  try {
    localStorage.setItem("fx_users", JSON.stringify(users));
    localStorage.setItem("fx_items", JSON.stringify(items));
    localStorage.setItem("fx_claims", JSON.stringify(claims));
    localStorage.setItem("fx_notes", JSON.stringify(notes));
    localStorage.setItem("fx_pairs", JSON.stringify(pairs));
    return true;
  } catch (e) {
    return false;
  }
}

/* ---------- small helpers ---------- */
function esc(text) {
  return String(text == null ? "" : text)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function today() { return new Date().toISOString().slice(0, 10); }
function daysAgo(n) { return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10); }
function fmt(d) {
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
function hashPass(p) { return btoa("fx-" + p); }   // demo only. Use a server in real life.

function toast(text) {
  var t = $("toast");
  t.textContent = text;
  t.classList.add("show");
  setTimeout(function () { t.classList.remove("show"); }, 2500);
}
function userById(id) {
  return users.filter(function (u) { return u.id === id; })[0] || { name: "Unknown", email: "", phone: "" };
}
function itemById(id) {
  return items.filter(function (i) { return i.id === id; })[0] || null;
}
function notify(userId, text) {
  notes.push({ id: Date.now() + Math.random(), userId: userId, text: text, date: today() });
}
function myNoteCount() {
  return notes.filter(function (n) { return n.userId === me.id; }).length;
}

/* ---------- demo data ---------- */
function seed() {
  if (users.length) return;

  users = [
    { id: 1, name: "Campus Admin", email: "admin@campus.edu", pass: hashPass("admin123"), role: "admin",   phone: "",            joined: daysAgo(30) },
    { id: 2, name: "Asha",         email: "asha@campus.edu",  pass: hashPass("asha123"),  role: "student", phone: "98765 11111", joined: daysAgo(10) },
    { id: 3, name: "Ravi",         email: "ravi@campus.edu",  pass: hashPass("ravi123"),  role: "student", phone: "98765 22222", joined: daysAgo(9) }
  ];

  items = [
    { id: 1, userId: 2, type: "lost",  title: "Black leather wallet",    cat: 2, place: "Library",  date: daysAgo(2), desc: "Black wallet with student ID inside", stored: "", photo: "", status: "open" },
    { id: 2, userId: 3, type: "found", title: "Wallet near canteen",     cat: 2, place: "Canteen",  date: daysAgo(1), desc: "Black leather wallet found on a bench", stored: "Security office", photo: "", status: "open" },
    { id: 3, userId: 3, type: "found", title: "Blue water bottle",       cat: 7, place: "Block A",  date: daysAgo(3), desc: "Blue steel bottle with a sticker", stored: "Block A reception", photo: "", status: "open" },
    { id: 4, userId: 2, type: "lost",  title: "House keys with red tag", cat: 4, place: "Parking",  date: daysAgo(4), desc: "Three keys on a red keychain", stored: "", photo: "", status: "open" },
    { id: 5, userId: 3, type: "lost",  title: "Physics notebook",        cat: 3, place: "Block B",  date: daysAgo(2), desc: "Blue notebook with name on cover", stored: "", photo: "", status: "open" }
  ];

  save();
}

/* ==========================================================
   MODULE 1: USER (login, sign up, logout)
   ========================================================== */
function authTab(which) {
  $("loginForm").classList.toggle("hidden", which !== "login");
  $("signupForm").classList.toggle("hidden", which !== "signup");
  $("tabLogin").classList.toggle("on", which === "login");
  $("tabSignup").classList.toggle("on", which === "signup");
}

function doLogin(e) {
  e.preventDefault();
  var email = $("lEmail").value.trim().toLowerCase();
  var pass = hashPass($("lPass").value);

  var user = users.filter(function (u) { return u.email === email && u.pass === pass; })[0];
  if (!user) return toast("Email or password is incorrect");

  me = user;
  sessionStorage.setItem("fx_me", user.id);
  $("loginForm").reset();
  start();
}

function doSignup(e) {
  e.preventDefault();
  var email = $("sEmail").value.trim().toLowerCase();

  if (users.some(function (u) { return u.email === email; })) {
    return toast("This email is already registered");
  }

  var user = {
    id: Date.now(),
    name: $("sName").value.trim(),
    email: email,
    pass: hashPass($("sPass").value),
    role: $("sRole").value,
    phone: $("sPhone").value.trim(),
    joined: today()
  };

  users.push(user);
  save();
  me = user;
  sessionStorage.setItem("fx_me", user.id);
  $("signupForm").reset();
  start();
  toast("Welcome to Findr, " + user.name.split(" ")[0]);
}

function logout() {
  sessionStorage.removeItem("fx_me");
  me = null;
  closeModal();
  start();
}

function start() {
  $("auth").classList.toggle("hidden", !!me);
  $("app").classList.toggle("hidden", !me);
  if (!me) return;

  $("avatar").textContent = me.name.charAt(0).toUpperCase();
  $("meName").textContent = me.name;
  $("meRole").textContent = me.role;
  go("home");
}

/* ---------- navigation ---------- */
function go(p) {
  page = p;
  var menu = [["home", "Home"], ["browse", "Browse"], ["map", "Campus map"], ["activity", "My activity"]];
  if (me.role === "admin") menu.push(["admin", "Admin"]);

  var html = "";
  menu.forEach(function (m) {
    var badge = (m[0] === "activity" && myNoteCount() > 0) ? "<em>" + myNoteCount() + "</em>" : "";
    html += '<button class="' + (m[0] === p ? "on" : "") + '" onclick="go(\'' + m[0] + '\')">' + m[1] + badge + "</button>";
  });
  $("nav").innerHTML = html;

  draw();
  window.scrollTo(0, 0);
}

function draw() {
  var views = { home: pageHome, browse: pageBrowse, map: pageMap, activity: pageActivity, admin: pageAdmin };
  $("page").innerHTML = views[page]();
}

function openModal(html) {
  $("sheet").innerHTML = html;
  $("modal").classList.remove("hidden");
}
function closeModal() {
  $("modal").classList.add("hidden");
  $("sheet").innerHTML = "";
}

/* ==========================================================
   SHARED: cards and smart matching
   ========================================================== */
function card(i) {
  var pic = i.photo ? '<img src="' + i.photo + '" alt="">' : CATS[i.cat].icon;
  var status = i.status !== "open" ? '<span class="pill ' + i.status + '">' + i.status + "</span>" : "";

  return '<div class="card" onclick="showItem(' + i.id + ')">' +
    '<div class="thumb">' + pic + '<span class="tag ' + i.type + '">' + i.type + "</span></div>" +
    '<div class="cbody"><h3>' + esc(i.title) + "</h3>" +
    '<p class="meta">📍 ' + esc(i.place) + "</p>" +
    '<p class="meta">🗓 ' + fmt(i.date) + "</p>" + status + "</div></div>";
}

// Smart matching: opposite type, same category, still open.
// Score: 40 base + 20 same place + up to 24 for shared words + up to 16 for close dates.
function getMatches(item, minScore) {
  var words = (item.title + " " + item.desc).toLowerCase().split(/\W+/).filter(function (w) { return w.length > 3; });
  var results = [];

  items.forEach(function (o) {
    if (o.type === item.type || o.cat !== item.cat || o.status !== "open" || o.id === item.id) return;

    var text = (o.title + " " + o.desc).toLowerCase();
    var shared = words.filter(function (w) { return text.indexOf(w) !== -1; }).length;
    var gap = Math.abs(new Date(item.date) - new Date(o.date)) / 86400000;

    var score = 40 + Math.min(shared * 8, 24);
    if (o.place === item.place) score += 20;
    if (gap <= 3) score += 16; else if (gap <= 10) score += 8;
    if (score > 100) score = 100;

    if (score >= minScore) results.push({ item: o, score: score });
  });

  results.sort(function (a, b) { return b.score - a.score; });
  return results;
}

/* ==========================================================
   MODULE 2: LOST AND FOUND ITEMS (browse, report, claim)
   ========================================================== */
function pageBrowse() {
  var catOptions = '<option value="">All categories</option>' + CATS.map(function (c, i) {
    return '<option value="' + i + '"' + (String(filter.cat) === String(i) ? " selected" : "") + ">" + c.icon + " " + c.name + "</option>";
  }).join("");

  var placeOptions = '<option value="">All places</option>' + PLACES.map(function (p) {
    return "<option" + (filter.place === p.name ? " selected" : "") + ">" + p.name + "</option>";
  }).join("");

  var seg = ["all", "lost", "found"].map(function (t) {
    return '<button class="' + (filter.type === t ? "on" : "") + '" onclick="filter.type=\'' + t + '\';draw()">' + t.charAt(0).toUpperCase() + t.slice(1) + "</button>";
  }).join("");

  return '<div class="head"><div><h1>Browse items</h1><p>Search everything reported on campus.</p></div>' +
    '<div class="row"><button class="btn lost" onclick="reportForm(\'lost\')">I lost something</button>' +
    '<button class="btn found" onclick="reportForm(\'found\')">I found something</button></div></div>' +
    '<div class="toolbar"><div class="seg filter">' + seg + "</div>" +
    '<input placeholder="Search name, details..." value="' + esc(filter.q) + '" oninput="filter.q=this.value;paintGrid()">' +
    '<select onchange="filter.cat=this.value;paintGrid()">' + catOptions + "</select>" +
    '<select onchange="filter.place=this.value;paintGrid()">' + placeOptions + "</select></div>" +
    '<div class="grid" id="grid">' + gridHtml() + "</div>";
}

function gridHtml() {
  var q = filter.q.toLowerCase();

  var list = items.filter(function (i) {
    if (filter.type !== "all" && i.type !== filter.type) return false;
    if (filter.cat !== "" && String(i.cat) !== String(filter.cat)) return false;
    if (filter.place && i.place !== filter.place) return false;
    if (q && (i.title + " " + i.desc + " " + i.place).toLowerCase().indexOf(q) === -1) return false;
    return true;
  }).sort(function (a, b) { return b.id - a.id; });

  if (!list.length) return '<p class="empty">No items match. Try different filters.</p>';
  return list.map(card).join("");
}

function paintGrid() { $("grid").innerHTML = gridHtml(); }

/* ----- item details popup ----- */
function showItem(id) {
  var i = itemById(id);
  var cat = CATS[i.cat];
  var owner = userById(i.userId);
  var mine = i.userId === me.id;
  var admin = me.role === "admin";
  var already = claims.some(function (c) { return c.itemId === id && c.userId === me.id; });

  var html = '<div class="detail"><div class="photo">' + (i.photo ? '<img src="' + i.photo + '" alt="">' : cat.icon) + "</div><div>" +
    '<span class="tag inline ' + i.type + '">' + i.type + '</span> <span class="pill ' + i.status + '">' + i.status + "</span>" +
    "<h2>" + esc(i.title) + "</h2>" +
    '<ul class="facts"><li><b>Category</b> ' + cat.icon + " " + cat.name + "</li>" +
    "<li><b>Where</b> " + esc(i.place) + "</li><li><b>When</b> " + fmt(i.date) + "</li>" +
    (i.stored ? "<li><b>Kept at</b> " + esc(i.stored) + "</li>" : "") +
    "<li><b>Reported by</b> " + esc(owner.name) + "</li></ul><p>" + esc(i.desc) + "</p>";

  if (i.status === "open" && !mine) {
    if (already) {
      html += '<p class="hint">You already sent a claim for this item.</p>';
    } else {
      var isFound = i.type === "found";
      html += '<form class="claimbox" onsubmit="sendClaim(event,' + i.id + ')"><h3>' + (isFound ? "This is mine" : "I found this") + "</h3>" +
        '<textarea id="proof" rows="3" required placeholder="' + (isFound ? "Something only the owner would know (contents, marks, lock screen)..." : "Where you found it and where it is now...") + '"></textarea>' +
        '<button class="btn wide">Send claim</button></form>';
    }
  }

  if (mine || admin) {
    html += '<div style="margin-top:14px">' +
      (i.status !== "returned" ? '<button class="chip ok" onclick="markReturned(' + i.id + ')">Mark returned</button>' : "") +
      '<button class="chip no" onclick="deleteItem(' + i.id + ')">Delete</button></div>';
  }

  html += "</div></div>";

  var matches = getMatches(i, 0).slice(0, 3);
  if (matches.length) {
    html += '<div class="matches"><h3>Possible matches</h3>' + matches.map(function (m) {
      return '<div class="matchrow" onclick="showItem(' + m.item.id + ')"><span>' + CATS[m.item.cat].icon + "</span><b>" + esc(m.item.title) + '</b><span class="score">' + m.score + "% match</span></div>";
    }).join("") + "</div>";
  }

  openModal(html);
}

function sendClaim(e, id) {
  e.preventDefault();
  var i = itemById(id);

  claims.push({ id: Date.now(), itemId: id, userId: me.id, proof: $("proof").value.trim(), status: "pending", date: today() });
  notify(i.userId, me.name + ' sent a claim on "' + i.title + '". Security will check it.');
  save();

  closeModal();
  go(page);
  toast("Claim sent. Security will review it.");
}

function markReturned(id) {
  var i = itemById(id);
  i.status = "returned";
  save();
  closeModal();
  go(page);
  toast("Marked as returned");
}

function deleteItem(id) {
  if (!confirm("Delete this report?")) return;
  items = items.filter(function (i) { return i.id !== id; });
  claims = claims.filter(function (c) { return c.itemId !== id; });
  save();
  closeModal();
  go(page);
  toast("Report deleted");
}

/* ----- report form ----- */
function reportForm(type) {
  photo = "";
  var lost = type === "lost";

  var cats = CATS.map(function (c, i) { return '<option value="' + i + '">' + c.icon + " " + c.name + "</option>"; }).join("");
  var places = PLACES.map(function (p) { return "<option>" + p.name + "</option>"; }).join("");

  openModal('<form class="form" onsubmit="saveReport(event,\'' + type + '\')">' +
    "<h2>" + (lost ? "Report a lost item" : "Report a found item") + "</h2>" +
    '<label>Item name <input id="rTitle" placeholder="e.g. Black leather wallet" required></label>' +
    '<div class="two"><label>Category <select id="rCat">' + cats + "</select></label>" +
    '<label>Where on campus <select id="rPlace">' + places + "</select></label></div>" +
    '<div class="two"><label>' + (lost ? "Date lost" : "Date found") + ' <input type="date" id="rDate" value="' + today() + '" max="' + today() + '" required></label>' +
    (lost ? "<div></div>" : '<label>Kept at <input id="rStored" placeholder="e.g. Security office"></label>') + "</div>" +
    '<label>Description <textarea id="rDesc" rows="3" placeholder="Colour, brand, marks..."></textarea></label>' +
    '<label>Photo <div class="drop"><span id="dropText">Tap to add a photo</span><input type="file" accept="image/*" onchange="pickPhoto(this)"></div><img id="preview" alt=""></label>' +
    '<button class="btn wide ' + type + '">Submit report</button></form>');
}

// Shrink the photo so localStorage does not fill up
function pickPhoto(input) {
  var file = input.files[0];
  if (!file) return;
  $("dropText").textContent = file.name;

  var reader = new FileReader();
  reader.onload = function () {
    var img = new Image();
    img.onload = function () {
      var scale = Math.min(1, 600 / img.width);
      var canvas = document.createElement("canvas");
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      photo = canvas.toDataURL("image/jpeg", 0.7);
      $("preview").src = photo;
      $("preview").style.display = "block";
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

function saveReport(e, type) {
  e.preventDefault();

  var item = {
    id: Date.now(),
    userId: me.id,
    type: type,
    title: $("rTitle").value.trim(),
    cat: Number($("rCat").value),
    place: $("rPlace").value,
    date: $("rDate").value,
    desc: $("rDesc").value.trim(),
    stored: type === "found" ? $("rStored").value.trim() : "",
    photo: photo,
    status: "open"
  };
  items.push(item);

  // Smart matching: tell both people about strong matches (60% or more)
  var strong = getMatches(item, 60);
  strong.forEach(function (m) {
    notify(m.item.userId, 'A new ' + type + ' report "' + item.title + '" may match your "' + m.item.title + '" (' + m.score + "%).");
  });
  if (strong.length) {
    notify(me.id, "We found " + strong.length + ' possible match(es) for "' + item.title + '". Open it to see.');
  }

  if (!save()) {
    items.pop();
    return toast("Storage is full. Try a smaller photo.");
  }

  closeModal();
  filter = { type: type, q: "", cat: "", place: "" };
  go("browse");
  toast("Report submitted" + (strong.length ? " - " + strong.length + " possible match(es) found!" : ""));
}

/* ==========================================================
   HOME PAGE
   ========================================================== */
function pageHome() {
  var open = function (t) { return items.filter(function (i) { return i.type === t && i.status === "open"; }).length; };
  var returned = items.filter(function (i) { return i.status === "returned"; }).length;

  // Matches for my open reports
  var mine = items.filter(function (i) { return i.userId === me.id && i.status === "open"; });
  var matchRows = "";
  mine.forEach(function (m) {
    var best = getMatches(m, 60)[0];
    if (best) {
      matchRows += '<div class="matchrow" onclick="showItem(' + best.item.id + ')"><span>' + CATS[m.cat].icon + "</span><b>" +
        esc(m.title) + " ↔ " + esc(best.item.title) + '</b><span class="score">' + best.score + "% match</span></div>";
    }
  });

  var recent = items.slice().sort(function (a, b) { return b.id - a.id; }).slice(0, 4).map(card).join("");

  return '<div class="hero"><h1>Lost something on campus? Let\'s tag it and track it down.</h1>' +
    "<p>Hi " + esc(me.name.split(" ")[0]) + ". Search the reports, or add a new one.</p>" +
    '<form onsubmit="event.preventDefault();filter={type:\'all\',q:$(\'heroQ\').value,cat:\'\',place:\'\'};go(\'browse\')">' +
    '<input id="heroQ" placeholder="Search: black wallet, keys, ID card..."><button class="btn">Search</button></form></div>' +
    '<div class="stats">' +
    '<div class="stat lost"><b>' + open("lost") + "</b><span>Open lost reports</span></div>" +
    '<div class="stat found"><b>' + open("found") + "</b><span>Open found reports</span></div>" +
    '<div class="stat amber"><b>' + returned + "</b><span>Returned to owners</span></div>" +
    '<div class="stat"><b>' + mine.length + "</b><span>Your open reports</span></div></div>" +
    '<h2 class="sec">Smart matches for you</h2>' +
    (matchRows || '<p class="empty">No strong matches yet. We will tell you when one appears.</p>') +
    '<h2 class="sec">Recently reported</h2><div class="grid">' + (recent || '<p class="empty">Nothing reported yet.</p>') + "</div>";
}

/* ==========================================================
   MODULE 3: CAMPUS MAP
   ========================================================== */
function pageMap() {
  var counts = {};
  PLACES.forEach(function (p) {
    counts[p.name] = items.filter(function (i) { return i.place === p.name && i.status === "open"; }).length;
  });

  var svg = '<svg viewBox="0 0 590 360" role="img" aria-label="Campus map">' +
    '<rect x="0" y="0" width="590" height="360" rx="18" fill="#f8f9fe"/>' +
    '<rect x="0" y="125" width="590" height="20" fill="#e5e7ef"/><rect x="0" y="235" width="590" height="20" fill="#e5e7ef"/>';

  PLACES.forEach(function (p) {
    var n = counts[p.name];
    var color = n === 0 ? "#cbd0e6" : (n === 1 ? "#f59e0b" : "#e11d48");

    svg += '<g class="bld" onclick="filter={type:\'all\',q:\'\',cat:\'\',place:\'' + p.name + '\'};go(\'browse\')">' +
      '<rect x="' + p.x + '" y="' + p.y + '" width="' + p.w + '" height="' + p.h + '" rx="14"/>' +
      '<text x="' + (p.x + 14) + '" y="' + (p.y + 30) + '">' + p.name + "</text>" +
      '<text class="small" x="' + (p.x + 14) + '" y="' + (p.y + 50) + '" style="font-size:12px;font-weight:500">' + n + " open item" + (n === 1 ? "" : "s") + "</text>" +
      '<circle cx="' + (p.x + p.w - 20) + '" cy="' + (p.y + 22) + '" r="13" fill="' + color + '"/>' +
      '<text x="' + (p.x + p.w - 20) + '" y="' + (p.y + 27) + '" text-anchor="middle" style="fill:#fff;font-size:13px">' + n + "</text></g>";
  });
  svg += "</svg>";

  // Busiest spots
  var ranked = PLACES.slice().sort(function (a, b) { return counts[b.name] - counts[a.name]; }).slice(0, 3);

  return '<div class="head"><div><h1>Campus map</h1><p>Click a building to see what is lost or found there.</p></div></div>' +
    '<div class="mapbox">' + svg +
    '<div class="legend"><span><i class="dot" style="background:#cbd0e6"></i>No items</span>' +
    '<span><i class="dot" style="background:#f59e0b"></i>1 item</span>' +
    '<span><i class="dot" style="background:#e11d48"></i>2 or more (hotspot)</span></div></div>' +
    '<h2 class="sec">Busiest spots</h2><div class="stats">' +
    ranked.map(function (p) { return '<div class="stat lost"><b>' + counts[p.name] + "</b><span>" + p.name + "</span></div>"; }).join("") + "</div>";
}

/* ==========================================================
   MODULE 4: MY ACTIVITY (notifications, reports, claim tracker)
   ========================================================== */
function pageActivity() {
  var myNotes = notes.filter(function (n) { return n.userId === me.id; }).reverse();
  var myItems = items.filter(function (i) { return i.userId === me.id; }).sort(function (a, b) { return b.id - a.id; });
  var myClaims = claims.filter(function (c) { return c.userId === me.id; }).sort(function (a, b) { return b.id - a.id; });

  var html = '<div class="head"><div><h1>My activity</h1><p>Notifications, your reports and the progress of your claims.</p></div></div>';

  // Notifications
  html += '<h2 class="sec" style="margin-top:0">Notifications</h2>';
  if (!myNotes.length) {
    html += '<p class="empty">No notifications yet.</p>';
  } else {
    html += myNotes.slice(0, 6).map(function (n) {
      return '<div class="note"><span>' + esc(n.text) + "</span><small>" + fmt(n.date) + "</small></div>";
    }).join("") + '<button class="chip" onclick="clearNotes()">Clear all</button>';
  }

  // Claim tracker
  html += '<h2 class="sec">My claims</h2>';
  if (!myClaims.length) {
    html += '<p class="empty">You have not claimed anything. Open an item and send a claim.</p>';
  } else {
    html += myClaims.map(function (c) {
      var it = itemById(c.itemId);
      var title = it ? it.title : "Deleted item";
      var stage = 1;
      if (c.status === "pending") stage = 2;
      if (c.status === "approved") stage = (it && it.status === "returned") ? 4 : 3;
      var rejected = c.status === "rejected";

      var labels = ["Claim sent", "Security review", rejected ? "Not verified" : "Approved", "Item collected"];
      var steps = labels.map(function (l, idx) {
        var cls = "step";
        if (rejected && idx === 2) cls += " bad"; else if (idx < stage && !(rejected && idx > 1)) cls += " done";
        return '<div class="' + cls + '">' + l + "</div>";
      }).join("");

      var next = "";
      if (c.status === "approved" && it) next = '<p class="meta" style="margin-top:10px">Collect it from: <b>' + esc(it.stored || userById(it.userId).name + " " + userById(it.userId).phone) + "</b></p>";

      return '<div class="claimcard"><h3><span>' + esc(title) + '</span><span class="pill ' + c.status + '">' + c.status + "</span></h3>" +
        '<div class="steps">' + steps + "</div>" + next + "</div>";
    }).join("");
  }

  // My reports
  html += '<h2 class="sec">My reports</h2>';
  if (!myItems.length) {
    html += '<p class="empty">You have no reports yet.</p>';
  } else {
    html += '<div class="tablebox"><table><tr><th>Item</th><th>Type</th><th>Date</th><th>Status</th><th></th></tr>' +
      myItems.map(function (i) {
        return "<tr><td>" + CATS[i.cat].icon + " " + esc(i.title) + '</td><td><span class="tag inline ' + i.type + '">' + i.type + "</span></td><td>" +
          fmt(i.date) + '</td><td><span class="pill ' + i.status + '">' + i.status + '</span></td><td><button class="chip" onclick="showItem(' + i.id + ')">View</button></td></tr>';
      }).join("") + "</table></div>";
  }

  return html;
}

function clearNotes() {
  notes = notes.filter(function (n) { return n.userId !== me.id; });
  save();
  go("activity");
}

/* ==========================================================
   MODULE 5: ADMIN
   ========================================================== */
function pageAdmin() {
  if (me.role !== "admin") return '<p class="empty">This page is for admins only.</p>';

  var pending = claims.filter(function (c) { return c.status === "pending"; }).length;
  var tabs = [["overview", "Overview"], ["claims", "Claims" + (pending ? " (" + pending + ")" : "")], ["matches", "Matches"], ["items", "Items"], ["users", "Users"]];

  var html = '<div class="head"><div><h1>Admin dashboard</h1><p>Check claims, run matches and manage the system.</p></div></div><div class="atabs">' +
    tabs.map(function (t) {
      return '<button class="' + (adminTab === t[0] ? "on" : "") + '" onclick="adminTab=\'' + t[0] + '\';draw()">' + t[1] + "</button>";
    }).join("") + "</div>";

  var tabViews = { overview: adminOverview, claims: adminClaims, matches: adminMatches, items: adminItems, users: adminUsers };
  return html + tabViews[adminTab]();
}

function adminOverview() {
  var count = function (fn) { return items.filter(fn).length; };
  var returned = count(function (i) { return i.status === "returned"; });
  var rate = items.length ? Math.round(returned / items.length * 100) : 0;
  var pending = claims.filter(function (c) { return c.status === "pending"; }).length;

  var perCat = CATS.map(function (c, idx) { return count(function (i) { return i.cat === idx; }); });
  var biggest = Math.max.apply(null, perCat.concat([1]));

  return '<div class="stats">' +
    '<div class="stat"><b>' + users.length + "</b><span>Users</span></div>" +
    '<div class="stat lost"><b>' + count(function (i) { return i.type === "lost"; }) + "</b><span>Lost reports</span></div>" +
    '<div class="stat found"><b>' + count(function (i) { return i.type === "found"; }) + "</b><span>Found reports</span></div>" +
    '<div class="stat amber"><b>' + pending + "</b><span>Claims to check</span></div>" +
    '<div class="stat found"><b>' + rate + "%</b><span>Recovery rate</span></div></div>" +
    '<div class="panel"><h3 style="margin-bottom:14px">Reports by category</h3>' +
    CATS.map(function (c, idx) {
      return '<div class="bar"><span>' + c.icon + " " + c.name + '</span><i style="width:' + (perCat[idx] / biggest * 100) + '%"></i><b>' + perCat[idx] + "</b></div>";
    }).join("") + "</div>";
}

function adminClaims() {
  if (!claims.length) return '<p class="empty">No claims yet.</p>';

  var sorted = claims.slice().sort(function (a, b) {
    if (a.status === "pending" && b.status !== "pending") return -1;
    if (b.status === "pending" && a.status !== "pending") return 1;
    return b.id - a.id;
  });

  return '<div class="tablebox"><table><tr><th>Item</th><th>Claimant</th><th>Proof</th><th>Status</th><th></th></tr>' +
    sorted.map(function (c) {
      var it = itemById(c.itemId), u = userById(c.userId);
      var buttons = c.status === "pending"
        ? '<button class="chip ok" onclick="decide(' + c.id + ',\'approved\')">Approve</button><button class="chip no" onclick="decide(' + c.id + ',\'rejected\')">Reject</button>'
        : "";
      return "<tr><td>" + esc(it ? it.title : "Deleted item") + "</td><td>" + esc(u.name) + "<br><small>" + esc(u.email) + " " + esc(u.phone) + "</small></td>" +
        '<td style="max-width:280px">' + esc(c.proof) + '</td><td><span class="pill ' + c.status + '">' + c.status + "</span></td><td>" + buttons + "</td></tr>";
    }).join("") + "</table></div>";
}

function decide(id, result) {
  var c = claims.filter(function (x) { return x.id === id; })[0];
  var it = itemById(c.itemId);
  c.status = result;

  if (result === "approved") {
    it.status = "claimed";
    notify(c.userId, 'Your claim on "' + it.title + '" was approved. Collect it from ' + (it.stored || "the reporter") + ".");
    notify(it.userId, 'A claim on "' + it.title + '" was approved by security.');
  } else {
    notify(c.userId, 'Your claim on "' + it.title + '" could not be verified.');
  }

  save();
  draw();
  toast("Claim " + result);
}

function adminMatches() {
  var rows = "";

  items.forEach(function (l) {
    if (l.type !== "lost" || l.status !== "open") return;

    getMatches(l, 60).forEach(function (m) {
      var key = l.id + "-" + m.item.id;
      var action = pairs.indexOf(key) !== -1
        ? '<span class="pill approved">Notified</span>'
        : '<button class="chip ok" onclick="notifyPair(' + l.id + "," + m.item.id + ')">Notify both</button>';

      rows += "<tr><td>" + esc(l.title) + "<br><small>" + esc(userById(l.userId).name) + " · " + esc(l.place) + "</small></td>" +
        "<td>" + esc(m.item.title) + "<br><small>" + esc(userById(m.item.userId).name) + " · " + esc(m.item.place) + "</small></td>" +
        '<td><span class="score">' + m.score + "%</span></td><td>" + action + "</td></tr>";
    });
  });

  if (!rows) return '<p class="empty">No strong matches right now.</p>';
  return '<div class="tablebox"><table><tr><th>Lost item</th><th>Found item</th><th>Match</th><th></th></tr>' + rows + "</table></div>";
}

function notifyPair(lostId, foundId) {
  var l = itemById(lostId), f = itemById(foundId);
  notify(l.userId, 'Security thinks "' + f.title + '" could be your "' + l.title + '". Open it and send a claim.');
  notify(f.userId, 'Your found item "' + f.title + '" may belong to the owner of "' + l.title + '".');
  pairs.push(lostId + "-" + foundId);
  save();
  draw();
  toast("Both users notified");
}

function adminItems() {
  if (!items.length) return '<p class="empty">No items yet.</p>';

  return '<div class="tablebox"><table><tr><th>Item</th><th>Type</th><th>Reported by</th><th>Status</th><th></th></tr>' +
    items.slice().reverse().map(function (i) {
      return "<tr><td>" + CATS[i.cat].icon + " " + esc(i.title) + '</td><td><span class="tag inline ' + i.type + '">' + i.type + "</span></td><td>" +
        esc(userById(i.userId).name) + '</td><td><span class="pill ' + i.status + '">' + i.status + "</span></td><td>" +
        '<button class="chip" onclick="showItem(' + i.id + ')">View</button>' +
        (i.status !== "returned" ? '<button class="chip ok" onclick="markReturned(' + i.id + ')">Returned</button>' : "") +
        '<button class="chip no" onclick="deleteItem(' + i.id + ')">Delete</button></td></tr>';
    }).join("") + "</table></div>";
}

function adminUsers() {
  return '<div class="tablebox"><table><tr><th>Name</th><th>Email</th><th>Role</th><th>Joined</th><th></th></tr>' +
    users.map(function (u) {
      var action = u.id === me.id ? "<small>You</small>" : '<button class="chip no" onclick="removeUser(' + u.id + ')">Remove</button>';
      return "<tr><td>" + esc(u.name) + "</td><td>" + esc(u.email) + '</td><td><span class="pill">' + u.role + "</span></td><td>" + fmt(u.joined) + "</td><td>" + action + "</td></tr>";
    }).join("") + "</table></div>";
}

function removeUser(id) {
  if (!confirm("Remove this user and all their reports?")) return;

  var gone = items.filter(function (i) { return i.userId === id; }).map(function (i) { return i.id; });
  items = items.filter(function (i) { return i.userId !== id; });
  claims = claims.filter(function (c) { return c.userId !== id && gone.indexOf(c.itemId) === -1; });
  users = users.filter(function (u) { return u.id !== id; });

  save();
  draw();
  toast("User removed");
}

/* ==========================================================
   START
   ========================================================== */
seed();

var savedId = sessionStorage.getItem("fx_me");
if (savedId) {
  me = users.filter(function (u) { return String(u.id) === savedId; })[0] || null;
}
start();