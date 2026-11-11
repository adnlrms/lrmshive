/* LRMS-HIVE main app: entry gate, tiles, sections, viewer, search, assistant. */
(function () {
  "use strict";
  var API = window.HiveAPI, S = window.HiveSearch, esc = S.esc, icon = window.hiveIcon;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var truthy = function (v) { return v === true || v === "TRUE" || v === "true" || v === 1 || v === "1"; };
  var notFalse = function (v) { return !(v === false || v === "FALSE" || v === "false" || v === 0 || v === "0"); };

  var state = { data: null, settings: {}, sec: {}, kids: {}, res: {}, count: {}, key: "", editing: false };
  window.Hive = { state: state };

  /* ---------------- utilities ---------------- */
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  /* ---------- motion helpers: animate out, then hide (skipped when the visitor prefers less motion) ---------- */
  var LESS_MOTION = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  function leave(el, ms, done) {
    if (!el) return done();
    if (LESS_MOTION) { el.classList.remove("is-leaving"); return done(); }
    clearTimeout(el._lt); el.classList.add("is-leaving");
    el._lt = setTimeout(function () { el._lt = null; el.classList.remove("is-leaving"); done(); }, ms);
  }
  function stay(el) { if (el && el._lt) { clearTimeout(el._lt); el._lt = null; } if (el) el.classList.remove("is-leaving"); }
  /** count a number up smoothly (visitor counter) */
  function countTo(el, to) {
    var from = +String(el.textContent).replace(/[^0-9]/g, "") || 0;
    if (LESS_MOTION || from === to || !isFinite(to) || Math.abs(to - from) < 2) { el.textContent = to.toLocaleString("en-US"); return; }
    var t0 = performance.now(), dur = Math.min(1400, 500 + Math.log10(Math.abs(to - from) + 1) * 220);
    cancelAnimationFrame(el._raf);
    (function step(now) {
      var k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      el.textContent = Math.round(from + (to - from) * e).toLocaleString("en-US");
      if (k < 1) el._raf = requestAnimationFrame(step);
    })(t0);
  }
  function toast(msg, kind) {
    var t = $("#toast"); t.textContent = msg; t.className = "toast show " + (kind || "");
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.className = "toast"; }, 3200);
  }
  function byOrder(a, b) { return (+a.order || 0) - (+b.order || 0) || String(a.title).localeCompare(String(b.title)); }
  function parseList(v) { if (Array.isArray(v)) return v; try { var j = JSON.parse(v); return Array.isArray(j) ? j : []; } catch (e) { return String(v || "").split(/\n|,/).map(function (s) { return s.trim(); }).filter(Boolean); } }
  function parseObj(v, d) { if (v && typeof v === "object") return v; try { return JSON.parse(v); } catch (e) { return d; } }

  /* Google Drive / link helpers */
  var Links = {
    id: function (url) {
      url = String(url || "");
      var m = url.match(/\/d\/([a-zA-Z0-9_-]{15,})/) || url.match(/[?&]id=([a-zA-Z0-9_-]{15,})/) || url.match(/\/folders\/([a-zA-Z0-9_-]{15,})/);
      return m ? m[1] : "";
    },
    isDrive: function (url) { return /(drive|docs)\.google\.com/.test(url || ""); },
    isFolder: function (url) { return /\/folders\/|embeddedfolderview/.test(url || ""); },
    youtube: function (url) { var m = String(url || "").match(/(?:youtu\.be\/|v=|\/embed\/|\/shorts\/)([a-zA-Z0-9_-]{11})/); return m ? m[1] : ""; },
    embed: function (url) {
      if (!url) return "";
      var yt = Links.youtube(url); if (yt) return "https://www.youtube-nocookie.com/embed/" + yt;
      if (Links.isDrive(url)) {
        var id = Links.id(url); if (!id) return "";
        if (Links.isFolder(url)) return "https://drive.google.com/embeddedfolderview?id=" + id + "#grid";
        var m = url.match(/docs\.google\.com\/(document|presentation|spreadsheets|forms)\//);
        if (m && m[1] === "forms") return url.replace(/\/(edit|viewform).*$/, "/viewform?embedded=true");
        if (m) return "https://docs.google.com/" + m[1] + "/d/" + id + "/preview";
        return "https://drive.google.com/file/d/" + id + "/preview";
      }
      if (/canva\.com\/design\//.test(url)) return url.split("?")[0].replace(/\/(edit|view)$/, "/view") + "?embed";
      if (/sites\.google\.com|script\.google\.com\/macros/.test(url)) return url;
      return "";
    },
    download: function (url) {
      if (!Links.isDrive(url) || Links.isFolder(url)) return "";
      var id = Links.id(url); if (!id) return "";
      var m = url.match(/docs\.google\.com\/(document|presentation|spreadsheets)\//);
      if (m) return "https://docs.google.com/" + m[1] + "/d/" + id + "/export?format=" + (m[1] === "spreadsheets" ? "xlsx" : m[1] === "presentation" ? "pptx" : "docx");
      return "https://drive.google.com/uc?export=download&id=" + id;
    },
    image: function (url, w) {
      if (!url) return "";
      if (Links.isDrive(url)) { var id = Links.id(url); return id ? "https://drive.google.com/thumbnail?id=" + id + "&sz=w" + (w || 800) : ""; }
      return url;
    },
    thumb: function (r) {
      if (r.thumbnail) return Links.image(r.thumbnail, 480);
      var yt = Links.youtube(r.url); if (yt) return "https://i.ytimg.com/vi/" + yt + "/hqdefault.jpg";
      if (Links.isDrive(r.url) && !Links.isFolder(r.url) && (r.type === "book" || r.type === "image" || r.type === "pdf" || r.type === "slides")) return Links.image(r.url, 480);
      return "";
    }
  };
  window.Hive.Links = Links;

  /* Only web, mail, phone and in-site links are allowed in buttons and frames (blocks javascript: and similar tricks) */
  function safeUrl(u) {
    u = String(u == null ? "" : u).trim();
    if (!u) return "";
    if (/^(https?:|mailto:|tel:)/i.test(u) || /^#\//.test(u) || /^(assets\/|\.\/)[^:]*$/.test(u)) return u;
    if (/^data:(image|application\/pdf)/i.test(u)) return u;
    return /^[a-z][a-z0-9+.-]*:/i.test(u) ? "" : u.replace(/^\/+/, "");
  }
  window.Hive.safeUrl = safeUrl;
  window.Hive.leave = leave; window.Hive.stay = stay;
  /* pictures fade in as they arrive instead of popping in */
  document.addEventListener("load", function (e) { var t = e.target; if (t && t.tagName === "IMG") t.classList.add("is-in"); }, true);
  function markLoadedImages(root) { $$("img", root).forEach(function (im) { if (im.complete && im.naturalWidth) im.classList.add("is-in"); }); setTimeout(function () { $$("img:not(.is-in)", root).forEach(function (im) { im.classList.add("is-in"); }); }, 2500); }
  /** one spreadsheet cell: quoted, and text that starts like a formula is neutralised so Excel/Sheets never runs it */
  function csvCell(c) {
    c = String(c == null ? "" : c);
    if (/^[=+\-@\t\r]/.test(c) && !/^-?\d+(\.\d+)?$/.test(c)) c = "'" + c;
    return '"' + c.replace(/"/g, '""') + '"';
  }
  window.Hive.csvCell = csvCell;
  // image fallbacks without inline handlers (lets the site use a strict Content-Security-Policy)
  document.addEventListener("error", function (e) {
    var t = e.target; if (!t || t.tagName !== "IMG" || !t.getAttribute("data-onerr")) return;
    var k = t.getAttribute("data-onerr");
    if (k === "logo") { var f = document.createElement("span"); f.innerHTML = DEFAULT_LOGO; t.replaceWith(f.firstChild); }
    else if (k === "hideparent") t.parentNode.hidden = true;
    else t.remove();
  }, true);
  document.addEventListener("click", function (e) { if (e.target.closest("[data-reload]")) location.reload(); });

  /* Microsoft OneDrive / SharePoint / Office links */
  var MS = {
    is: function (u) { return /^https?:\/\/([a-z0-9-]+\.)*(1drv\.ms|onedrive\.live\.com|sharepoint\.com|onedrive\.com)\//i.test(u || ""); },
    isFolder: function (u) { return /\/:f:\//.test(u || "") || (/onedrive\.live\.com/.test(u || "") && /[?&]id=/.test(u || "") && !/[?&]resid=/.test(u || "") && /folder/i.test(u || "")); },
    officeFile: function (u) { return /\.(docx?|pptx?|xlsx?)(\?|#|$)/i.test(u || ""); },
    embed: function (u) {
      if (!u) return "";
      if (/officeapps\.live\.com\/op\/(embed|view)\.aspx/.test(u)) return u.replace("/op/view.aspx", "/op/embed.aspx");
      if (/onedrive\.live\.com\/embed/.test(u)) return u;
      if (/onedrive\.live\.com/.test(u)) {
        var p = {}; (u.split("?")[1] || "").split("#")[0].split("&").forEach(function (kv) { var a = kv.split("="); if (a[0]) p[a[0]] = a[1] || ""; });
        var resid = decodeURIComponent(p.resid || p.id || ""), cid = p.cid || resid.split("!")[0];
        return resid ? "https://onedrive.live.com/embed?cid=" + cid + "&resid=" + encodeURIComponent(resid) + (p.authkey ? "&authkey=" + p.authkey : "") + "&em=2" : "";
      }
      if (/sharepoint\.com/.test(u)) { if (/\/:f:\//.test(u)) return ""; return /action=embedview/.test(u) ? u : u + (u.indexOf("?") >= 0 ? "&" : "?") + "action=embedview"; }
      if (/1drv\.ms/.test(u)) return "";
      if (/^https?:\/\//.test(u) && MS.officeFile(u)) return "https://view.officeapps.live.com/op/embed.aspx?src=" + encodeURIComponent(u);
      return "";
    },
    download: function (u) {
      if (/sharepoint\.com/.test(u || "") && !/\/:f:\//.test(u)) return u + (u.indexOf("?") >= 0 ? "&" : "?") + "download=1";
      if (/onedrive\.live\.com\/(redir|embed)/.test(u || "")) return u.replace(/\/(redir|embed)\?/, "/download?");
      return "";
    }
  };
  window.Hive.MS = MS;

  var TYPES = {
    pdf: { label: "PDF", icon: "pdf" }, doc: { label: "Document", icon: "file" }, slides: { label: "Slides", icon: "slides" },
    sheet: { label: "Spreadsheet", icon: "sheet" }, video: { label: "Video", icon: "video" }, folder: { label: "Folder", icon: "folder" },
    link: { label: "Website", icon: "link" }, app: { label: "App / Game", icon: "apps" }, book: { label: "Book", icon: "book" },
    image: { label: "Image", icon: "image" }, audio: { label: "Audio", icon: "audio" }, note: { label: "Page", icon: "note" },
    form: { label: "Form", icon: "form" }, game: { label: "Game", icon: "game" }, embed: { label: "Interactive", icon: "spark" }
  };
  window.Hive.TYPES = TYPES;
  var TONES = ["honey", "leaf", "river", "brick", "plum", "teal", "slate"];
  window.Hive.TONES = TONES;

  /* ---------------- data ---------------- */
  function ingest(data) {
    state.data = data;
    var d = window.HIVE_DEFAULT_SETTINGS, st = Object.assign({}, d, data.settings || {});
    ["entryEnabled", "entryUppercase", "logoAsIcon", "showClock", "showVisitorCount", "homeShowAnnouncements", "homeShowFeatured", "homeShowRecent", "aiEnabled", "assistantVisible"].forEach(function (k) { st[k] = truthy(st[k]); });
    st.footer = parseObj(st.footer, d.footer);
    st.groups = parseObj(st.groups, d.groups) || [];
    st.team = parseObj(st.team, d.team) || [];
    state.settings = st;
    state.sec = {}; state.kids = {}; state.res = {}; state.count = {};
    (data.sections || []).forEach(function (s) { state.sec[s.id] = s; (state.kids[s.parentId || ""] = state.kids[s.parentId || ""] || []).push(s); });
    Object.keys(state.kids).forEach(function (k) { state.kids[k].sort(byOrder); });
    (data.resources || []).forEach(function (r) { (state.res[r.sectionId] = state.res[r.sectionId] || []).push(r); });
    Object.keys(state.res).forEach(function (k) { state.res[k].sort(byOrder); });
    function count(id) {
      if (state.count[id] != null) return state.count[id];
      var n = visibleRes(id).length;
      visibleKids(id).forEach(function (k) { n += count(k.id); });
      return (state.count[id] = n);
    }
    (data.sections || []).forEach(function (s) { count(s.id); });
    S.build(data, pathOf);
    window.Hive.ready = true;
  }
  function visibleKids(id) { return (state.kids[id || ""] || []).filter(function (s) { return state.editing || notFalse(s.visible); }); }
  function visibleRes(id) { return (state.res[id] || []).filter(function (r) { return state.editing || notFalse(r.visible); }); }
  function trail(id) { var t = [], s = state.sec[id], guard = 0; while (s && guard++ < 20) { t.unshift(s); s = state.sec[s.parentId]; } return t; }
  function pathOf(id) { return trail(id).map(function (s) { return s.title; }).join(" › "); }
  function findRes(id) { return (state.data.resources || []).find(function (r) { return r.id === id; }); }

  function refresh(force) {
    return API.bootstrap().then(function (data) {
      var changed = force || !state.data || data.version !== state.data.version;
      ingest(data);
      if (changed) { applyBranding(); state.key = ""; route(); }
      return data;
    });
  }
  window.Hive.refresh = refresh;

  /* ---------------- branding / chrome ---------------- */
  var DEFAULT_LOGO = '<svg viewBox="0 0 64 64" class="logo-svg" aria-hidden="true"><path class="lg-hex" d="M32 3 57 17.5v29L32 61 7 46.5v-29z"/><path class="lg-cell" d="M32 15 45 22.5v15L32 45 19 37.5v-15z"/><path class="lg-page" d="M23.5 26.5c3-.9 6-.6 8.5 1 2.5-1.6 5.5-1.9 8.5-1v10.8c-3-.9-6-.6-8.5 1-2.5-1.6-5.5-1.9-8.5-1z"/><path class="lg-line" d="M32 27.5v10.8"/></svg>';
  function logoHTML(cls) {
    var u = state.settings.logoUrl;
    return u ? '<img class="' + (cls || "") + '" src="' + esc(Links.image(u, 256)) + '" alt="" data-onerr="logo">' : DEFAULT_LOGO;
  }
  window.Hive.defaultLogo = DEFAULT_LOGO;
  window.Hive.logoHTML = logoHTML;

  function decorateLogo(el, cls) {
    var st = state.settings;
    if (!el) return;
    el.innerHTML = logoHTML(cls);
    el.setAttribute("data-size", st.logoSize || "md");
    el.setAttribute("data-frame", st.logoUrl ? (st.logoFrame || "none") : "none");
    el.setAttribute("data-bg", st.logoUrl ? (st.logoBg || "none") : "none");
  }
  window.Hive.decorateLogo = decorateLogo;

  function applyBranding() {
    var st = state.settings;
    renderNav();
    decorateLogo($("#brand-logo"), "brand-img");
    var l2 = $("#brand-logo2");
    if (st.logo2Url) { l2.hidden = false; l2.innerHTML = '<img src="' + esc(Links.image(st.logo2Url, 256)) + '" alt="" data-onerr="hideparent">'; l2.setAttribute("data-size", st.logoSize || "md"); }
    else { l2.hidden = true; l2.innerHTML = ""; }
    $("#brand-name").textContent = st.siteName;
    $("#brand-tagline").innerHTML = acronymHTML(st.siteTagline);
    $("#brand-tag").textContent = st.orgName;
    document.title = st.siteName + " · " + st.siteTagline;
    $("#gate-org").textContent = st.orgName;
    $("#gate-acronym").innerHTML = acronymHTML(st.siteTagline);
    $("#gate-title").setAttribute("aria-label", st.siteName);
    if (!$("#gate-title").children.length || $("#gate-title").dataset.name !== st.siteName) {
      $("#gate-title").dataset.name = st.siteName;
      $("#gate-title").innerHTML = st.siteName.split("").map(function (c, i) {
        return '<span style="--i:' + i + '"' + (c === "-" ? ' class="dash"' : "") + ">" + (c === " " ? "&nbsp;" : esc(c)) + "</span>";
      }).join("");
    }
    $("#gate-form-title").textContent = st.entryTitle;
    $("#gate-form-text").textContent = st.entryText;
    $("#gate-submit").textContent = st.entryButton;
    $("#gate-form").classList.toggle("upper", !!st.entryUppercase);
    applyBg($("#gate-bg"), "Gate");
    var fav = $("#favicon");
    if (fav) fav.href = st.logoUrl && st.logoAsIcon ? Links.image(st.logoUrl, 128) : "assets/img/icon-192.png";
    $("#fab").hidden = !st.assistantVisible;
    $("#fab-label").textContent = "Ask " + st.aiName;
    $("#assistant-name").textContent = st.aiName;
    renderFooter();
    fitLines();
  }

  /* shrink a line's font until it fits on one line (works on every screen size) */
  function fitLines() {
    $$(".fitline").forEach(function (el) {
      if (!el.offsetParent) return;
      el.style.fontSize = "";
      var size = parseFloat(getComputedStyle(el).fontSize), min = 9, guard = 0;
      while (el.scrollWidth > el.clientWidth + 1 && size > min && guard++ < 40) { size -= 0.5; el.style.fontSize = size + "px"; }
    });
  }
  window.Hive.fitLines = fitLines;
  function topbarH() { var t = $(".topbar"); if (t) document.documentElement.style.setProperty("--topbar-h", t.offsetHeight + "px"); }
  var fitT; window.addEventListener("resize", function () { clearTimeout(fitT); fitT = setTimeout(function () { fitLines(); topbarH(); }, 120); });
  setTimeout(topbarH, 300);
  window.addEventListener("orientationchange", function () { setTimeout(fitLines, 300); });
  function acronymHTML(t) {
    // bolds the first letters that spell H-I-V-E (or the site's own initials)
    var target = "HIVE", k = 0;
    return esc(t).replace(/\b([A-Za-z])/g, function (m, c) {
      if (k < target.length && c.toUpperCase() === target[k]) { k++; return "<b>" + c + "</b>"; }
      return c;
    });
  }

  function renderFooter() {
    var f = state.settings.footer || {}, st = state.settings;
    var contacts = (f.contacts || []).filter(function (c) { return c.label; }).map(function (c) {
      var inner = icon(c.icon || "link") + "<span>" + esc(c.label) + "</span>";
      return c.url ? '<li><a href="' + esc(safeUrl(c.url)) + '" target="_blank" rel="noopener">' + inner + "</a></li>" : "<li>" + inner + "</li>";
    }).join("");
    var links = (f.links || []).filter(function (l) { return l.label; }).map(function (l) {
      return l.url ? '<li><a href="' + esc(safeUrl(l.url)) + '" target="_blank" rel="noopener">' + esc(l.label) + "</a></li>" : '<li class="muted">' + esc(l.label) + "</li>";
    }).join("");
    $("#footer").innerHTML =
      '<div class="footer-grid">' +
        '<div class="footer-org"><span class="footer-logo brand-logo" id="footer-logo"></span><div>' +
          (f.orgLines || []).map(function (l, i) { return i === 0 ? "<strong>" + esc(l) + "</strong>" : "<span>" + esc(l) + "</span>"; }).join("") +
        "</div></div>" +
        (contacts ? '<div><h3>Contact us</h3><ul class="footer-list">' + contacts + "</ul></div>" : "") +
        '<div><h3>Links</h3><ul class="footer-list"><li><a href="#/about">About the LRMS</a></li>' + links + "</ul>" +
          (st.showVisitorCount ? '<p class="footer-visits">' + icon("people") + '<span><b data-visits="total">' + (state.visits ? Number(state.visits.total).toLocaleString("en-US") : "—") + "</b> " + esc(st.visitorLabel || "Visitors") + "</span></p>" : "") + "</div>" +
      "</div>" +
      '<div class="footer-base"><span>' + esc(f.note || "") + "</span>" +
      '<span class="mono">' + esc(st.siteName) + " v" + esc(window.HIVE_CONFIG.APP_VERSION) + " · " + new Date().getFullYear() +
      (visitor() ? ' · <button type="button" class="linkbtn" id="change-me">Not ' + esc(firstName()) + "? Change details</button>" : "") + "</span></div>";
    decorateLogo($("#footer-logo"), "footer-img");
    var cm = $("#change-me"); if (cm) cm.onclick = function () { forgetDevice(); buildComb(); openGateForm(); };
  }

  /* ---------------- entry gate ---------------- */
  /** a device registers once: details are kept in local storage, with a cookie copy in case storage is cleared */
  var VCOOKIE = "hive_visitor";
  function readCookie() { var m = document.cookie.match(new RegExp("(?:^|; )" + VCOOKIE + "=([^;]*)")); if (!m) return null; try { return JSON.parse(decodeURIComponent(m[1])); } catch (e) { return null; } }
  function rememberDevice(v) {
    try {
      var keep = { name: v.name, school: v.school, district: v.district, division: v.division, visitorId: v.visitorId, at: v.at };
      document.cookie = VCOOKIE + "=" + encodeURIComponent(JSON.stringify(keep)) + "; max-age=" + 60 * 60 * 24 * 730 + "; path=/; SameSite=Lax" + (location.protocol === "https:" ? "; Secure" : "");
    } catch (e) {}
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}
  }
  function forgetDevice() { API.LS.del("hive.visitor"); try { document.cookie = VCOOKIE + "=; max-age=0; path=/"; } catch (e) {} }
  function visitor() {
    var v = API.LS.get("hive.visitor", null);
    if (v && v.name) return v;
    var c = readCookie();
    if (c && c.name) { API.LS.set("hive.visitor", c); return c; }
    return null;
  }
  function firstName() {
    var v = visitor(); if (!v || !v.name) return "";
    var n = v.name.trim().split(/\s+/)[0];
    return n.charAt(0).toUpperCase() + n.slice(1).toLowerCase();
  }
  var REDUCED = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* Intro: a bee circles while honeycomb cells draw themselves, fill with rising
     honey one by one, and the logo settles into the centre cell. Built as SVG
     with SMIL so it runs the same on phones, tablets and computers. */
  function buildComb() {
    var st = state.settings || {}, r = 30, gap = 2.2, w = Math.sqrt(3) * r, cx = 110, cy = 110;
    var order = [180, 240, 300, 0, 60, 120];
    function hex(x, y, rr) {
      var pts = []; for (var i = 0; i < 6; i++) { var a = (Math.PI / 180) * (60 * i - 90); pts.push((x + rr * Math.cos(a)).toFixed(2) + "," + (y + rr * Math.sin(a)).toFixed(2)); }
      return "M" + pts.join("L") + "Z";
    }
    var rr = r - gap, per = (6 * rr).toFixed(1), defs = "", body = "";
    var shades = ["#F2A900", "#E39A00", "#FFC233", "#D88F00", "#F7B21A", "#FFCB4D"];
    order.forEach(function (deg, i) {
      var a = deg * Math.PI / 180, x = cx + Math.cos(a) * w, y = cy + Math.sin(a) * w, d = hex(x, y, rr);
      var t0 = 0.5 + i * 0.42, t1 = t0 + 0.55;
      defs += '<clipPath id="hc' + i + '"><path d="' + d + '"/></clipPath>';
      var wave = "M" + (x - 60) + "," + (y + 4) + " q7.5,-6 15,0 t15,0 t15,0 t15,0 t15,0 t15,0 t15,0 t15,0 V" + (y + 80) + " H" + (x - 60) + "Z";
      body += '<path class="cell-ghost" d="' + d + '"/>' +
        '<g clip-path="url(#hc' + i + ')"><g><path class="honey" fill="' + shades[i] + '" d="' + wave + '">' +
        (REDUCED ? "" : '<animateTransform attributeName="transform" type="translate" values="0 0;-15 0" dur="1.1s" repeatCount="indefinite"/>') + "</path>" +
        (REDUCED ? '' : '<animateTransform attributeName="transform" type="translate" from="0 ' + (r + 6) + '" to="0 ' + (-r - 4) + '" begin="' + t1 + 's" dur="1.25s" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines=".3 .1 .3 1"/>') +
        "</g></g>" +
        '<path class="cell-line" d="' + d + '" stroke-dasharray="' + per + '" stroke-dashoffset="' + (REDUCED ? 0 : per) + '">' +
        (REDUCED ? "" : '<animate attributeName="stroke-dashoffset" from="' + per + '" to="0" begin="' + t0 + 's" dur=".75s" fill="freeze"/>') + "</path>";
    });
    var c = hex(cx, cy, rr), tc = 0.5 + 6 * 0.42 + 0.5;
    body += '<path class="cell-line center" d="' + c + '" stroke-dasharray="' + per + '" stroke-dashoffset="' + (REDUCED ? 0 : per) + '">' + (REDUCED ? "" : '<animate attributeName="stroke-dashoffset" from="' + per + '" to="0" begin="' + tc + 's" dur=".8s" fill="freeze"/>') + "</path>";
    body += '<path class="cell-core" d="' + hex(cx, cy, rr - 3) + '" opacity="' + (REDUCED ? 1 : 0) + '">' + (REDUCED ? "" : '<animate attributeName="opacity" from="0" to="1" begin="' + (tc + 0.6) + 's" dur=".5s" fill="freeze"/>') + "</path>";
    var logo = st.logoUrl
      ? '<image href="' + esc(Links.image(st.logoUrl, 256)) + '" x="' + (cx - 21) + '" y="' + (cy - 21) + '" width="42" height="42" preserveAspectRatio="xMidYMid meet"/>'
      : '<g transform="translate(' + (cx - 16) + ' ' + (cy - 13) + ') scale(1)"><path fill="#F6F3EA" d="M1 4c5-1.6 10-1 15 1.6C21 3 26 2.4 31 4v20c-5-1.6-10-1-15 1.6C11 23 6 22.4 1 24z"/><path d="M16 5.6v20" stroke="#13283F" stroke-width="1.8"/></g>';
    body += '<g class="core-logo" opacity="' + (REDUCED ? 1 : 0) + '">' + logo +
      (REDUCED ? "" : '<animate attributeName="opacity" from="0" to="1" begin="' + (tc + 0.9) + 's" dur=".6s" fill="freeze"/><animateTransform attributeName="transform" type="scale" additive="sum" values="1;1" dur="1s"/>') + "</g>";
    var bee = REDUCED ? "" :
      '<g class="bee"><animateMotion dur="5.2s" repeatCount="indefinite" rotate="auto" path="M-10,40 C40,-20 180,-20 210,60 S170,230 110,215 S0,170 20,90 S120,10 160,40 S215,140 150,190 S30,190 -10,40"/><g transform="scale(1.45)">' +
      '<ellipse class="wing" cx="-1" cy="-5" rx="5" ry="3"><animate attributeName="ry" values="3;0.6;3" dur=".12s" repeatCount="indefinite"/></ellipse>' +
      '<ellipse class="wing" cx="-1" cy="5" rx="5" ry="3"><animate attributeName="ry" values="0.6;3;0.6" dur=".12s" repeatCount="indefinite"/></ellipse>' +
      '<ellipse cx="0" cy="0" rx="7" ry="4.6" fill="#F2A900"/><path d="M-2.5,-4.3v8.6M1.5,-4.4v8.8" stroke="#13283F" stroke-width="1.7"/><circle cx="6.5" cy="0" r="2.4" fill="#13283F"/></g></g>';
    $("#comb").innerHTML = '<svg viewBox="0 0 220 220" role="presentation"><defs>' + defs + "</defs>" + body + bee + "</svg>";
  }

  function privacyHTML() {
    return String(state.settings.privacyText || "").split(/\n\s*\n/).map(function (p) { return "<p>" + esc(p).replace(/\n/g, "<br>") + "</p>"; }).join("");
  }
  function openGateForm() {
    var g = $("#gate"); g.hidden = false; g.classList.remove("gate-out"); g.classList.add("asking");
    document.body.classList.add("locked");
    $("#privacy-text").innerHTML = privacyHTML();
    $("#gate-status").hidden = true;
    $("#gate-form").hidden = false;
    fitLines();
    if (innerWidth > 700) setTimeout(function () { $("#gate-form").name.focus({ preventScroll: true }); }, 400);
  }
  function closeGate() {
    var g = $("#gate"); g.classList.add("gate-out");
    document.body.classList.remove("locked");
    setTimeout(function () { g.hidden = true; $("#comb").innerHTML = ""; }, 650);
    var v = visitor();
    if (v && !API.SS.get("hive.logged", false)) {
      API.SS.set("hive.logged", true);
      API.beacon("visit", { visitor: Object.assign({}, v, { device: deviceLabel(), page: location.hash || "#/" }) });
      setTimeout(loadVisits, 2500);
    }
    if (!$("#view").innerHTML) route();
    try { $("#main").focus({ preventScroll: true }); } catch (e) {}
    fitLines();
  }
  function deviceLabel() {
    var u = navigator.userAgent;
    var os = /Android/.test(u) ? "Android" : /iPhone|iPad|iPod/.test(u) || (/Macintosh/.test(u) && navigator.maxTouchPoints > 1) ? "iOS/iPadOS" : /Windows/.test(u) ? "Windows" : /CrOS/.test(u) ? "ChromeOS" : /Mac/.test(u) ? "Mac" : /Linux/.test(u) ? "Linux" : "Other";
    var kind = innerWidth < 600 ? " phone" : innerWidth < 1024 && "ontouchstart" in window ? " tablet" : "";
    var app = /FBAN|FBAV|Messenger/.test(u) ? " · Messenger" : matchMedia("(display-mode: standalone)").matches ? " · app" : "";
    return os + kind + app;
  }
  // caps-lock entries: uppercase as the visitor types, keeping the cursor in place
  $("#gate-form").addEventListener("input", function (e) {
    var el = e.target;
    if (!state.settings.entryUppercase || !el.classList.contains("caps")) return;
    var up = el.value.toUpperCase();
    if (up !== el.value) { var s0 = el.selectionStart, s1 = el.selectionEnd; el.value = up; try { el.setSelectionRange(s0, s1); } catch (x) {} }
  });
  $("#gate-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var f = e.target, v = {}, missing = [], labels = { name: "full name", school: "school", district: "district", division: "division" };
    ["name", "school", "district", "division"].forEach(function (k) {
      v[k] = f[k].value.trim().replace(/\s+/g, " ");
      if (state.settings.entryUppercase) v[k] = v[k].toUpperCase();
      f[k].value = v[k];
      if (!v[k]) missing.push(k);
    });
    if (missing.length) { $("#gate-error").textContent = "Please type your " + missing.map(function (k) { return labels[k]; }).join(", ") + "."; f[missing[0]].focus(); return; }
    if (!f.consent.checked) { $("#gate-error").textContent = "Please tick the box to agree to the privacy statement."; f.consent.focus(); return; }
    $("#gate-error").textContent = "";
    v.visitorId = (visitor() && visitor().visitorId) || API.uid("v");
    v.savedAt = new Date().toISOString();
    API.LS.set("hive.visitor", v); rememberDevice(v);
    API.SS.set("hive.logged", false);
    renderFooter();
    closeGate();
    state.key = ""; route();
  });

  /* ---------------- media & embeds ---------------- */
  // Works out how a link can play inside the site: an iframe, a <video>/<audio> tag, or nothing.
  var Media = {
    srcFromCode: function (u) { var m = String(u || "").match(/<iframe[^>]+src=["']([^"']+)["']/i); return m ? m[1].replace(/&amp;/g, "&") : String(u || "").trim(); },
    resolve: function (r, autoplay) {
      var url = Media.srcFromCode(r.url), type = r.type, m;
      if (!url) return null;
      if (r.embed) return { kind: "iframe", src: r.embed, video: type === "video", game: type === "game" || type === "app" };
      if (r.display === "newtab" || r.embedOk === "no") return null; // site refuses frames, or admin chose "open directly"
      if (MS.is(url) || MS.officeFile(url)) { var me = MS.embed(url); if (me) return { kind: "iframe", src: me, video: type === "video" }; if (MS.is(url)) return null; }
      if (/\.(mp4|webm|ogv|mov|m4v)(\?|#|$)/i.test(url)) return { kind: "video", src: url };
      if (/\.(mp3|m4a|wav|ogg|aac)(\?|#|$)/i.test(url)) return { kind: "audio", src: url };
      var yt = Links.youtube(url);
      if (yt) return { kind: "iframe", src: "https://www.youtube-nocookie.com/embed/" + yt + "?rel=0&playsinline=1" + (autoplay ? "&autoplay=1" : ""), video: true };
      if ((m = url.match(/vimeo\.com\/(?:video\/)?(\d+)/))) return { kind: "iframe", src: "https://player.vimeo.com/video/" + m[1] + (autoplay ? "?autoplay=1" : ""), video: true };
      if ((m = url.match(/loom\.com\/(?:share|embed)\/([a-zA-Z0-9]+)/))) return { kind: "iframe", src: "https://www.loom.com/embed/" + m[1], video: true };
      if ((m = url.match(/scratch\.mit\.edu\/projects\/(\d+)/))) return { kind: "iframe", src: "https://scratch.mit.edu/projects/" + m[1] + "/embed", game: true };
      if (/facebook\.com\/.+\/videos\/|fb\.watch\//.test(url) && !/plugins\/video/.test(url)) return { kind: "iframe", src: "https://www.facebook.com/plugins/video.php?show_text=false&href=" + encodeURIComponent(url), video: true };
      var em = Links.embed(url);
      if (em) return { kind: "iframe", src: em, video: type === "video" };
      if (["embed", "game", "app", "video", "audio", "form"].indexOf(type) >= 0 || r.display === "inline" || /<iframe/i.test(r.url)) return { kind: "iframe", src: url, game: type === "game" || type === "app" };
      return null;
    },
    allow: 'allow="autoplay; fullscreen; picture-in-picture; encrypted-media; gamepad; accelerometer; gyroscope; clipboard-write; web-share" allowfullscreen',
    /** developed systems / games may need camera, mic or location — the browser still asks the user */
    allowApp: 'allow="autoplay; fullscreen; picture-in-picture; encrypted-media; gamepad; accelerometer; gyroscope; clipboard-read; clipboard-write; web-share; camera; microphone; geolocation; display-capture" allowfullscreen',
    allowFor: function (md) { return md && md.game ? Media.allowApp : Media.allow; },
    html: function (r, opts) {
      opts = opts || {};
      var md = Media.resolve(r, opts.autoplay);
      if (!md) return "";
      var ar = String(r.aspect || (r.type === "audio" ? "" : "16:9")).split(":"), arCss = ar.length === 2 ? ar[0] + " / " + ar[1] : "16 / 9";
      if (md.kind === "video") return '<div class="embed-box is-media" style="aspect-ratio:' + arCss + '"><video controls playsinline preload="metadata" src="' + esc(safeUrl(md.src)) + '"' + (opts.autoplay ? " autoplay" : "") + "></video></div>";
      if (md.kind === "audio") return '<div class="embed-audio"><audio controls preload="metadata" src="' + esc(safeUrl(md.src)) + '"></audio></div>';
      var frame = '<iframe src="' + esc(safeUrl(md.src)) + '" title="' + esc(r.title) + '" ' + Media.allowFor(md) + ' loading="lazy" referrerpolicy="strict-origin-when-cross-origin"></iframe>';
      if (opts.cover) { // tap-to-play keeps heavy games/videos from loading until needed
        var th = Links.thumb(r);
        return '<div class="embed-box" style="aspect-ratio:' + arCss + '" data-src="' + esc(safeUrl(md.src)) + '" data-title="' + esc(r.title) + '"' + (md.game ? " data-app" : "") + '>' +
          '<button type="button" class="play-cover" data-play' + (th ? ' style="background-image:url(&quot;' + esc(th) + '&quot;)"' : "") + '><span class="play-btn">' + icon(md.video ? "video" : md.game ? "game" : "spark") + "<b>" + (md.video ? "Play video" : md.game ? "Play game" : "Start") + "</b></span></button></div>";
      }
      return '<div class="embed-box" style="aspect-ratio:' + arCss + '">' + frame + "</div>";
    }
  };
  window.Hive.Media = Media;
  function fullscreen(el) {
    var d = document;
    if (d.fullscreenElement || d.webkitFullscreenElement) { (d.exitFullscreen || d.webkitExitFullscreen).call(d); return; }
    var fn = el.requestFullscreen || el.webkitRequestFullscreen;
    if (fn) { try { var p = fn.call(el); if (p && p.catch) p.catch(function () { el.classList.toggle("pseudo-full"); }); } catch (e) { el.classList.toggle("pseudo-full"); } }
    else el.classList.toggle("pseudo-full"); // iPhone: fills the screen with CSS instead
  }
  window.Hive.fullscreen = fullscreen;
  function isFlipbook(r) {
    if (r.display === "flipbook") return true;
    if (r.display && r.display !== "auto") return false;
    return r.type === "book" && (/\.pdf(\?|#|$)/i.test(r.url || "") || (Links.isDrive(r.url) && !Links.isFolder(r.url)) || (MS.is(r.url) && !MS.isFolder(r.url) && !/\/:[wxp]:\//.test(r.url)));
  }
  window.Hive.isFlipbook = isFlipbook;

  /* ---------------- views ---------------- */
  function greet() {
    var h = new Date().getHours(), v = visitor();
    var g = h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
    return g + (v ? ", " + esc(firstName()) : "");
  }
  function toneAttr(s, fallback) {
    var tone = TONES.indexOf(s.color) >= 0 ? s.color : fallback || "honey";
    var style = /^#[0-9a-f]{3,8}$/i.test(s.customColor || "") ? ' style="--tone:' + s.customColor + '"' : "";
    return { cls: "tone-" + tone, style: style };
  }
  function spanCls(s) { return { "2": " span-2", "3": " span-3", tall: " span-tall", big: " span-big" }[s.span] || ""; }
  function isExternal(u) { return /^https?:\/\//i.test(u || ""); }

  function tileHTML(s) {
    var kind = s.kind || "section", n = state.count[s.id] || 0, hidden = !notFalse(s.visible);
    var t = toneAttr(s), cls = "tile " + t.cls + (hidden ? " is-hidden" : "") + (s.bgImage ? " has-bg" : ""), style = t.style;
    if (s.bgImage) style = (style ? style.slice(0, -1) + ";" : ' style="') + "--bg:url(&quot;" + esc(Links.image(s.bgImage, 900)) + '&quot;)"';
    var badge = '<span class="tile-badge">' + icon(s.icon || "folder") + "</span>";
    var head = badge + '<span class="tile-title">' + esc(s.title) + "</span>" + (s.subtitle ? '<span class="tile-sub">' + esc(s.subtitle) + "</span>" : "");
    var edit = state.editing ? editBtns("section", s.id) : "";
    var cell = '<li class="tile-cell' + spanCls(s) + (kind === "embed" || kind === "video" ? " is-embed" : "") + '" data-id="' + esc(s.id) + '">';
    var flag = hidden ? '<span class="mono"> · hidden</span>' : "";
    if (kind === "link") {
      var ext = isExternal(s.url);
      return cell + '<a class="' + cls + '"' + style + ' href="' + esc(safeUrl(s.url || "#/")) + '"' + (ext ? ' target="_blank" rel="noopener"' : "") + ">" + head +
        '<span class="tile-foot"><span class="mono">' + (ext ? "Website" : "Page") + flag + '</span><span class="tile-go">Open ' + icon(ext ? "external" : "down", ext ? "" : "rot") + "</span></span></a>" + edit + "</li>";
    }
    if (kind === "embed" || kind === "video") {
      var r = { title: s.title, url: s.url, type: kind === "video" ? "video" : "embed", aspect: s.body || "16:9", display: "inline", thumbnail: s.bgImage };
      return cell + '<div class="' + cls + ' tile-embed"' + t.style + '><div class="tile-embed-head">' + badge + '<span><span class="tile-title">' + esc(s.title) + "</span>" + (s.subtitle ? '<span class="tile-sub">' + esc(s.subtitle) + "</span>" : "") + "</span></div>" +
        (s.url ? Media.html(r, { cover: true }) : '<p class="muted">No link yet.</p>') +
        '<div class="tile-embed-foot">' + (s.url ? '<button type="button" class="btn btn-sm" data-full>' + icon("external") + ' Full screen</button><a class="btn btn-sm btn-ghost" href="' + esc(safeUrl(Media.srcFromCode(s.url))) + '" target="_blank" rel="noopener">Open in new tab</a>' : "") + flag + "</div></div>" + edit + "</li>";
    }
    if (kind === "text") {
      return cell + '<div class="' + cls + ' tile-text"' + style + ">" + head +
        '<div class="tile-body">' + String(s.body || "").split(/\n\s*\n/).map(function (p) { return "<p>" + esc(p).replace(/\n/g, "<br>") + "</p>"; }).join("") + "</div>" +
        (s.url ? '<a class="btn btn-sm btn-ink" href="' + esc(safeUrl(s.url)) + '"' + (isExternal(s.url) ? ' target="_blank" rel="noopener"' : "") + ">Open " + icon("external") + "</a>" : "") + flag + "</div>" + edit + "</li>";
    }
    if (kind === "image") {
      var img = s.bgImage ? '<img loading="lazy" src="' + esc(Links.image(s.bgImage, 1200)) + '" alt="' + esc(s.title) + '">' : "";
      var inner = img + '<span class="tile-image-cap"><span class="tile-title">' + esc(s.title) + "</span>" + (s.subtitle ? '<span class="tile-sub">' + esc(s.subtitle) + "</span>" : "") + "</span>";
      return cell + (s.url ? '<a class="' + cls + ' tile-image" href="' + esc(safeUrl(s.url)) + '"' + (isExternal(s.url) ? ' target="_blank" rel="noopener"' : "") + ">" + inner + "</a>" : '<div class="' + cls + ' tile-image">' + inner + "</div>") + flag + edit + "</li>";
    }
    if (kind === "widget") {
      var w = s.url || "clock", body = "";
      if (w === "clock") body = '<span class="w-time" data-clock="time"></span><span class="w-date" data-clock="date"></span>';
      else if (w === "visitors") body = '<span class="w-big" data-visits="total">—</span><span class="w-date"><span data-visits="today">—</span> today</span>';
      else if (w === "search") body = '<button type="button" class="btn btn-honey" data-open-search>' + icon("search") + " Search resources</button>";
      else if (w === "assistant") body = '<button type="button" class="btn btn-honey" data-open-assistant>' + icon("spark") + " Ask " + esc(state.settings.aiName) + "</button>";
      else if (w === "about") body = '<a class="btn btn-honey" href="#/about">' + icon("info") + " Meet the team</a>";
      else if (w === "news") body = '<ul class="w-news">' + newsList().slice(0, 4).map(function (n) { return '<li><a href="#/news/' + esc(n.id) + '"><b>' + esc(n.title) + "</b><small>" + fmtDate(n.date) + "</small></a></li>"; }).join("") + '</ul><a class="btn btn-sm" href="#/news">All news</a>';
      else if (w === "events") body = '<ul class="w-news">' + upcoming(60, 4).map(function (o) { return '<li><a href="#/events/' + esc(o.ev.id) + '"><b>' + esc(o.ev.title) + "</b><small>" + esc(whenLabel(o) || dateRange(o)) + "</small></a></li>"; }).join("") + '</ul><a class="btn btn-sm" href="#/events">Full calendar</a>';
      else if (w === "map") { var mc = window.HiveMap ? window.HiveMap.compute(state.data, state.settings).totals : null; body = mc ? '<span class="w-big">' + mc.reachPct + '%</span><span class="w-date">of ' + mc.schools + " schools have library access · <b>" + mc.need + "</b> still need it</span>" + '<a class="btn btn-sm" href="#/map">Open the map</a>' : '<a class="btn btn-sm" href="#/map">Open the map</a>'; }
      else if (w === "facebook") body = state.settings.facebookPageUrl ? fbPlaceholder(state.settings.facebookPageUrl, "page", 520) : '<p class="muted">Admin: add the Facebook page link in Admin › News.</p>';
      return cell + '<div class="' + cls + ' tile-widget w-' + esc(w) + '"' + style + ">" + badge + '<span class="tile-title">' + esc(s.title) + "</span>" + body + flag + "</div>" + edit + "</li>";
    }
    return cell + '<a class="' + cls + '"' + style + ' href="#/s/' + esc(s.id) + '">' + head +
      '<span class="tile-foot"><span class="mono">' + n + (n === 1 ? " item" : " items") + flag + '</span><span class="tile-go">Open ' + icon("down", "rot") + "</span></span></a>" + edit + "</li>";
  }
  function editBtns(kind, id) {
    var drag = kind === "section" || kind === "resource" ? '<button type="button" class="ebtn ebtn-drag drag-handle" data-drag aria-label="Drag to move" title="Drag to move">' + icon("apps") + "</button>" : "";
    return '<span class="edit-btns">' + drag + '<button type="button" class="ebtn" data-edit="' + kind + '" data-id="' + esc(id) + '" aria-label="Edit">' + icon("edit") + "</button></span>";
  }
  window.Hive.tilePreview = function (s) { var ed = state.editing; state.editing = false; var h = tileHTML(s); state.editing = ed; return h; };
  function addTile(parentId, group) {
    return state.editing ? '<li class="tile-cell"><button type="button" class="tile tile-add" data-add="section" data-parent="' + esc(parentId || "") + '" data-group="' + esc(group || "") + '">' + icon("plus") + "<span>Add a tile here</span></button></li>" : "";
  }
  /** tiles of one level, split into the admin's groups (in the admin's group order) */
  function tilesBlock(parentId, isHome) {
    var kids = visibleKids(parentId), size = esc(state.settings.tileSize || "large");
    if (isHome) kids = kids.filter(function (k) { return !(k.kind === "widget" && (k.url === "news" || k.url === "events")); });
    var groups = (state.settings.groups || []).filter(function (g) { return g && g.id; });
    var known = {}; groups.forEach(function (g) { known[g.id] = g; });
    var ungrouped = kids.filter(function (k) { return !known[k.group]; });
    var used = groups.filter(function (g) { return kids.some(function (k) { return k.group === g.id; }); });
    if (!used.length) {
      if (!kids.length && !state.editing) return "";
      return (isHome ? '<section aria-labelledby="h-tiles"><div class="sec-head"><h2 id="h-tiles">Browse</h2><span class="mono muted">' + kids.length + " sections</span></div>" : "<section>") +
        '<ul class="tiles size-' + size + '" data-sort-level="' + esc(parentId || "") + '">' + kids.map(tileHTML).join("") + addTile(parentId) + "</ul></section>";
    }
    var out = "";
    if (ungrouped.length || (state.editing && isHome)) out += '<section class="tgroup">' + (isHome ? '<div class="sec-head"><h2>Browse</h2></div>' : "") + '<ul class="tiles size-' + size + '">' + ungrouped.map(tileHTML).join("") + addTile(parentId) + "</ul></section>";
    used.forEach(function (g) {
      var list = kids.filter(function (k) { return k.group === g.id; });
      out += '<section class="tgroup" aria-label="' + esc(g.name) + '"><div class="sec-head"><h2>' + esc(g.name) + '</h2><span class="mono muted">' + list.length + "</span></div>" +
        '<ul class="tiles size-' + size + '">' + list.map(tileHTML).join("") + addTile(parentId, g.id) + "</ul></section>";
    });
    return out;
  }

  function chipsFor(r) {
    var c = [];
    if (r.grade) c.push(r.grade.replace(/^Grade\s*/i, "G"));
    if (r.quarter) c.push(r.quarter);
    if (r.subject) c.push(r.subject);
    return c.map(function (x) { return '<span class="chip-sm">' + esc(x) + "</span>"; }).join("");
  }
  function rowHTML(r, opts) {
    opts = opts || {};
    var t = TYPES[r.type] || TYPES.link, hidden = !notFalse(r.visible);
    var title = opts.tokens ? S.highlight(r.title, opts.tokens) : esc(r.title);
    var direct = opensDirect(r);
    var verb = isFlipbook(r) ? "Read" : r.type === "video" ? "Play" : r.type === "game" ? "Play" : r.type === "app" ? "Launch" : "Open";
    return '<li class="row' + (hidden ? " is-hidden" : "") + '" data-id="' + esc(r.id) + '"><a class="row-main" ' + resHref(r) + ">" +
      '<span class="row-ic t-' + esc(r.type) + '">' + icon(t.icon) + "</span>" +
      '<span class="row-text"><span class="row-title">' + title + "</span>" +
      '<span class="row-meta"><span class="mono">' + (isFlipbook(r) ? "Flipbook" : t.label) + "</span>" + chipsFor(r) +
      (opts.path ? '<span class="row-path">' + esc(opts.path) + "</span>" : "") +
      (truthy(r.sample) && !r.url ? '<span class="flag">Link not set</span>' : "") + (hidden ? '<span class="flag">Hidden</span>' : "") +
      ((+r.rUseful || 0) + (+r.rUsed || 0) > 0 ? '<span class="rate-chip">' + icon("star") + ((+r.rUseful || 0) + (+r.rUsed || 0)) + " found it useful</span>" : "") + "</span>" +
      (r.description && !opts.compact ? '<span class="row-desc">' + esc(r.description) + "</span>" : "") + "</span>" +
      '<span class="row-open">' + verb + (direct ? " " + icon("external") : "") + "</span></a>" + (state.editing ? editBtns("resource", r.id) : "") + "</li>";
  }
  /** a resource shown as part of the page: playable game, video or interactive */
  function inlineHTML(r) {
    var hidden = !notFalse(r.visible), t = TYPES[r.type] || TYPES.link;
    var heavy = r.type === "game" || r.type === "video" || r.type === "app";
    return '<li class="inline-card' + (hidden ? " is-hidden" : "") + '" data-id="' + esc(r.id) + '"><div class="inline-head"><span class="row-ic t-' + esc(r.type) + '">' + icon(t.icon) + "</span>" +
      '<div><h3>' + esc(r.title) + '</h3><span class="row-meta"><span class="mono">' + t.label + "</span>" + chipsFor(r) + (hidden ? '<span class="flag">Hidden</span>' : "") + "</span></div></div>" +
      (r.description ? '<p class="inline-desc">' + esc(r.description) + "</p>" : "") +
      (r.url ? Media.html(r, { cover: heavy }) : '<p class="muted">No link yet.</p>') +
      '<div class="inline-foot">' + (r.url ? '<button type="button" class="btn btn-sm" data-full>' + icon("external") + ' Full screen</button><a class="btn btn-sm btn-ghost" href="' + esc(safeUrl(Media.srcFromCode(r.url))) + '" target="_blank" rel="noopener">Open in new tab</a>' : "") +
      '<span class="inline-note">Not showing? Some sites do not allow embedding — use “Open in new tab”.</span></div>' + (state.editing ? editBtns("resource", r.id) : "") + "</li>";
  }
  /** "open directly" items skip the viewer and launch the system in a new tab */
  function opensDirect(r) { return !!r.url && !!safeUrl(Media.srcFromCode(r.url)) && !state.editing && (r.display === "newtab" || (r.embedOk === "no" && (r.type === "app" || r.type === "link" || r.type === "embed" || r.type === "game"))); }
  function resHref(r) {
    return opensDirect(r) ? 'href="' + esc(safeUrl(Media.srcFromCode(r.url))) + '" target="_blank" rel="noopener" data-open-res="' + esc(r.id) + '"' : 'href="#/r/' + esc(r.id) + '"';
  }
  /** app launcher card for systems the LRMS developed */
  function appHTML(r) {
    var hidden = !notFalse(r.visible), th = Links.thumb(r), t = TYPES[r.type] || TYPES.link, host = "";
    try { host = r.url ? new URL(Media.srcFromCode(r.url)).hostname.replace(/^www\./, "") : ""; } catch (e) {}
    var st = r.linkStatus && r.linkStatus !== "ok" ? '<span class="flag">' + esc(r.linkStatus === "private" ? "Not shared publicly" : r.linkStatus === "broken" ? "Link problem" : r.linkStatus) + "</span>" : "";
    return '<li class="app-card' + (hidden ? " is-hidden" : "") + '" data-id="' + esc(r.id) + '">' +
      '<a class="app-main" ' + resHref(r) + '><span class="app-icon t-' + esc(r.type) + '">' + (th ? '<img loading="lazy" decoding="async" src="' + esc(th) + '" alt="" data-onerr="remove">' : "") + icon(t.icon) + "</span>" +
      '<span class="app-text"><span class="app-title">' + esc(r.title) + "</span>" + (r.description ? '<span class="app-desc">' + esc(r.description) + "</span>" : "") +
      '<span class="row-meta">' + (host ? '<span class="mono">' + esc(host) + "</span>" : "") + chipsFor(r) + st + (hidden ? '<span class="flag">Hidden</span>' : "") + (truthy(r.sample) && !r.url ? '<span class="flag">Link not set</span>' : "") + "</span></span>" +
      '<span class="app-launch btn btn-honey btn-sm">' + (r.type === "game" ? "Play" : "Launch") + (opensDirect(r) ? " " + icon("external") : "") + "</span></a>" +
      (state.editing ? editBtns("resource", r.id) : "") + "</li>";
  }
  function coverHTML(r) {
    var th = Links.thumb(r), sec = state.sec[r.sectionId] || {};
    var tone = TONES.indexOf(sec.color) >= 0 ? sec.color : "leaf";
    return '<li class="book" data-id="' + esc(r.id) + '"><a href="#/r/' + esc(r.id) + '" class="book-link">' +
      '<span class="cover tone-' + tone + '">' + (th ? '<img loading="lazy" decoding="async" src="' + esc(th) + '" alt="" data-onerr="remove">' : "") +
      '<span class="cover-title">' + esc(r.title) + "</span>" + (isFlipbook(r) ? '<span class="cover-flag">' + icon("bookopen") + " Flipbook</span>" : "") + "</span>" +
      '<span class="book-title">' + esc(r.title) + "</span>" +
      '<span class="row-meta">' + chipsFor(r) + "</span></a>" + (state.editing ? editBtns("resource", r.id) : "") + "</li>";
  }
  function sortItems(items, how) {
    var a = items.slice(), g = function (x) { var m = String(x.grade || "").match(/\d+/); return m ? +m[0] : /kinder/i.test(x.grade) ? 0 : 99; };
    if (how === "az") a.sort(function (x, y) { return String(x.title).localeCompare(String(y.title), undefined, { numeric: true }); });
    else if (how === "za") a.sort(function (x, y) { return String(y.title).localeCompare(String(x.title), undefined, { numeric: true }); });
    else if (how === "newest") a.sort(function (x, y) { return String(y.createdAt || "").localeCompare(String(x.createdAt || "")); });
    else if (how === "views") a.sort(function (x, y) { return (+y.views || 0) - (+x.views || 0); });
    else if (how === "grade") a.sort(function (x, y) { return g(x) - g(y) || String(x.quarter).localeCompare(String(y.quarter)) || String(x.title).localeCompare(String(y.title)); });
    return a;
  }

  function viewHome() {
    var st = state.settings, out = [];
    out.push('<section class="welcome"><div class="welcome-text"><p class="eyebrow">' + greet() + '</p><h1>' + esc(st.welcomeTitle) + "</h1><p>" + esc(st.welcomeText) + "</p></div>" +
      '<div class="welcome-side">' +
      (st.showClock ? '<div class="clock-card" aria-label="Date and time"><span class="clock-time" data-clock="time"></span><span class="clock-date" data-clock="date"></span></div>' : "") +
      (st.showVisitorCount ? '<div class="visits-chip">' + icon("people") + '<span><b data-visits="total">—</b> ' + esc(st.visitorLabel || "Visitors") + ' · <span data-visits="today">—</span> today</span></div>' : "") +
      '<button class="welcome-search" type="button" data-open-search>' + icon("search") + "<span>" + ((state.data.resources || []).length ? "Search all " + (state.data.resources || []).length + " resources" : "Search resources") + "</span></button></div></section>");

    if (st.homeShowAnnouncements) {
      var today = new Date().toISOString().slice(0, 10);
      var ann = (state.data.announcements || []).filter(function (a) {
        return (state.editing || notFalse(a.visible)) && (!a.startDate || String(a.startDate).slice(0, 10) <= today) && (!a.endDate || String(a.endDate).slice(0, 10) >= today);
      }).sort(function (a, b) { return (truthy(b.pinned) ? 1 : 0) - (truthy(a.pinned) ? 1 : 0); });
      if (ann.length || state.editing) {
        out.push('<section class="bulletin" aria-label="Announcements">' + ann.map(function (a) {
          return '<article class="notice"><span class="pin" aria-hidden="true"></span><div><h2>' + esc(a.title) + "</h2>" + (a.body ? "<p>" + esc(a.body) + "</p>" : "") +
            (a.url ? '<a class="btn btn-sm btn-ink" href="' + esc(safeUrl(a.url)) + '" target="_blank" rel="noopener">' + esc(a.linkText || "Open") + " " + icon("external") + "</a>" : "") +
            "</div>" + (state.editing ? editBtns("announcement", a.id) : "") + "</article>";
        }).join("") + (state.editing ? '<button type="button" class="notice notice-add" data-add="announcement">' + icon("plus") + " Add announcement</button>" : "") + "</section>");
      }
    }
    // events, news and updates live on their own tabs, not on Home
    var tb = tilesBlock("", true);
    out.push(tb || (state.editing ? "" : '<div class="empty empty-home">' + icon("hex", "big") + "<h2>Learning resources are on the way</h2><p>The LRMS is adding materials to LRMS-HIVE. Please check back soon.</p></div>"));

    var recentIds = API.LS.get("hive.recent", []);
    var recent = recentIds.map(findRes).filter(function (r) { return r && notFalse(r.visible); }).slice(0, 6);
    var featured = (state.data.resources || []).filter(function (r) { return truthy(r.featured) && notFalse(r.visible); }).sort(byOrder).slice(0, 8);
    var lists = "";
    if (st.homeShowRecent && recent.length) lists += '<section aria-labelledby="h-recent"><div class="sec-head"><h2 id="h-recent">You opened recently</h2></div><ul class="rows compact">' + recent.map(function (r) { return rowHTML(r, { compact: true, path: pathOf(r.sectionId) }); }).join("") + "</ul></section>";
    if (st.homeShowFeatured && featured.length) lists += '<section aria-labelledby="h-feat"><div class="sec-head"><h2 id="h-feat">Featured</h2></div><ul class="rows compact">' + featured.map(function (r) { return rowHTML(r, { compact: true, path: pathOf(r.sectionId) }); }).join("") + "</ul></section>";
    if (lists) out.push('<div class="twocol">' + lists + "</div>");
    return out.join("");
  }

  function crumbs(id) {
    var t = trail(id), up = t.length > 1 ? "#/s/" + esc(t[t.length - 2].id) : t.length && String(t[0].parentId || "").indexOf("tab:") === 0 ? "#/t/" + esc(t[0].parentId.slice(4)) : "#/";
    return '<nav class="crumbs" aria-label="You are here"><a class="btn btn-back" href="' + up + '">' + icon("down", "rot-back") + " Back</a>" +
      '<ol><li><a href="#/">Home</a></li>' + (function () { var p = t.length ? t[0].parentId || "" : "", tb = p.indexOf("tab:") === 0 && findTab(p.slice(4)); return tb ? '<li><a href="#/t/' + esc(tb.id) + '">' + esc(tb.label) + "</a></li>" : ""; })() + t.map(function (s, i) { return i === t.length - 1 ? '<li aria-current="page">' + esc(s.title) + "</li>" : '<li><a href="#/s/' + esc(s.id) + '">' + esc(s.title) + "</a></li>"; }).join("") + "</ol></nav>";
  }

  /* ---------------- menu tabs (built-in + admin-made) ---------------- */
  var BUILTIN_TABS = [["home", "Home", "home"], ["events", "Events", "calendar"], ["news", "News", "megaphone"], ["map", "Map", "pin"], ["about", "About", "info"]];
  function navItems() {
    var saved = Array.isArray(state.settings.navItems) ? state.settings.navItems : parseList(state.settings.navItems);
    saved = saved.filter(function (t) { return t && typeof t === "object" && t.id; });
    var seen = {}, out = [];
    saved.forEach(function (t) {
      var b = BUILTIN_TABS.filter(function (x) { return x[0] === t.id; })[0];
      if (seen[t.id]) return; seen[t.id] = 1;
      if (b) out.push({ id: b[0], builtin: true, label: t.label || b[1], icon: t.icon || b[2], visible: b[0] === "home" ? true : t.visible !== false });
      else if (!t.builtin) out.push(Object.assign({ icon: "file", type: "page", visible: true }, t, { builtin: false }));
    });
    BUILTIN_TABS.forEach(function (b, i) { if (!seen[b[0]]) out.splice(Math.min(i, out.length), 0, { id: b[0], builtin: true, label: b[1], icon: b[2], visible: true }); });
    return out;
  }
  function findTab(id) { return navItems().filter(function (t) { return !t.builtin && t.id === id; })[0]; }
  function tabHref(t) {
    if (t.builtin) return t.id === "home" ? "#/" : "#/" + t.id;
    if (t.type === "link") return safeUrl(t.url) || "#/";
    if (t.type === "section") return "#/s/" + encodeURIComponent(t.sectionId || "");
    return "#/t/" + encodeURIComponent(t.id);
  }
  function renderNav() {
    var nav = $(".mainnav"); if (!nav) return;
    nav.innerHTML = navItems().filter(function (t) { return t.visible !== false || state.editing; }).map(function (t) {
      var ext = !t.builtin && t.type === "link";
      return '<a href="' + esc(tabHref(t)) + '" data-nav="' + esc(t.builtin ? t.id : "t-" + t.id) + '"' + (ext ? ' target="_blank" rel="noopener"' : "") + (t.visible === false ? ' class="nav-hidden" title="Hidden from visitors"' : "") + ">" + icon(t.icon || "file") + esc(t.label) + (ext ? icon("external", "nav-ext") : "") + "</a>";
    }).join("");
    nav.classList.toggle("many", nav.children.length > 5);
  }
  window.Hive.navItems = navItems; window.Hive.BUILTIN_TABS = BUILTIN_TABS;
  /** which tab to light up for a section page: the tab that holds it, or a tab that points at it */
  function tabForSection(id) {
    var t = trail(id); if (!t.length) return "";
    var root = t[0].parentId || "";
    if (root.indexOf("tab:") === 0) return "t-" + root.slice(4);
    var hit = navItems().filter(function (x) { return !x.builtin && x.type === "section" && t.some(function (s) { return s.id === x.sectionId; }); })[0];
    return hit ? "t-" + hit.id : "home";
  }
  function viewTab(id) {
    var t = findTab(id);
    if (!t) return '<div class="empty"><h1>Page not found</h1><p>This tab may have been removed.</p><a class="btn btn-honey" href="#/">Go to Home</a></div>';
    var out = '<header class="sec-hero tab-hero"><span class="tile-badge big">' + icon(t.icon || "file") + "</span><div><h1>" + esc(t.title || t.label) + "</h1>" + (t.subtitle ? "<p>" + esc(t.subtitle) + "</p>" : "") + "</div>" +
      (state.editing ? '<div class="hero-edit"><button type="button" class="btn btn-sm" data-edit-tab="' + esc(t.id) + '">' + icon("edit") + " Edit this tab</button></div>" : "") + "</header>";
    if (t.body) out += '<article class="note-body tab-body">' + paras(t.body) + "</article>";
    if (t.url && safeUrl(Media.srcFromCode(t.url))) {
      var r = { id: "tab-" + t.id, title: t.title || t.label, url: t.url, type: "embed", aspect: t.aspect || "16:9" };
      var player = Media.html(r);
      out += player ? '<div class="tab-embed">' + player + "</div>" : '<p><a class="btn btn-honey btn-xl" href="' + esc(safeUrl(Media.srcFromCode(t.url))) + '" target="_blank" rel="noopener">Open ' + esc(t.label) + " " + icon("external") + "</a></p>";
    }
    var tiles = tilesBlock("tab:" + t.id, false);
    out += tiles;
    if (!t.body && !t.url && !tiles && !state.editing) out += '<div class="empty"><p>Nothing here yet. Please check back soon.</p></div>';
    return out;
  }
  function viewSection(id) {
    var s = state.sec[id];
    if (!s) return '<div class="empty"><h1>Section not found</h1><p>It may have been moved or removed.</p><a class="btn btn-honey" href="#/">Go to Home</a></div>';
    var items = sortItems(visibleRes(id), s.sort), t = toneAttr(s);
    var inline = items.filter(function (r) { return r.display === "inline"; });
    var rest = items.filter(function (r) { return r.display !== "inline"; });
    var shelf = s.layout === "shelf" || (s.layout === "auto" && rest.length && rest.every(function (r) { return r.type === "book"; }));
    var apps = s.layout === "apps";
    var out = crumbs(id);
    out += '<header class="sec-hero ' + t.cls + '"' + t.style + '><span class="tile-badge big">' + icon(s.icon || "folder") + "</span><div><h1>" + esc(s.title) + "</h1>" +
      (s.subtitle ? "<p>" + esc(s.subtitle) + "</p>" : "") + '<span class="mono muted">' + (state.count[id] || 0) + " items</span></div>" +
      (state.editing ? '<div class="hero-edit">' + editBtns("section", id) + "</div>" : "") + "</header>";
    out += tilesBlock(id, false);
    if (inline.length) out += '<ul class="inline-list" id="sec-inline">' + inline.map(inlineHTML).join("") + "</ul>";
    if (rest.length > 8) out += '<label class="filter">' + icon("search") + '<input id="sec-filter" placeholder="Filter ' + rest.length + ' items in this section" aria-label="Filter this section"></label>';
    if (rest.length && apps) out += '<ul class="apps-grid" id="sec-items">' + rest.map(appHTML).join("") + "</ul>";
    else if (rest.length) out += shelf ? '<ul class="shelf" id="sec-items">' + rest.map(coverHTML).join("") + "</ul>" : '<ul class="rows' + (s.layout === "compact" ? " compact-list" : "") + '" id="sec-items">' + rest.map(function (r) { return rowHTML(r, { compact: s.layout === "compact" }); }).join("") + "</ul>";
    else if (!inline.length && !visibleKids(id).length) out += '<div class="empty"><p>Nothing here yet. The LRMS is preparing materials for this section.</p></div>';
    if (state.editing) out += '<div class="add-row"><button type="button" class="btn btn-honey" data-add="resource" data-section="' + esc(id) + '">' + icon("plus") + " Add a resource here</button>" +
      '<button type="button" class="btn" data-add="import" data-section="' + esc(id) + '">' + icon("drive") + " Import from a Drive folder</button></div>";
    return out;
  }

  /* ---------------- About page ---------------- */
  var ABOUT_TABS = [["mission", "Mission & Vision"], ["values", "Core Values"], ["team", "Our Team"], ["structure", "Organization"], ["history", "History"], ["contact", "Contact"]];
  function paras(t) { return String(t || "").split(/\n\s*\n/).filter(Boolean).map(function (p) { return "<p>" + esc(p).replace(/\n/g, "<br>") + "</p>"; }).join(""); }
  function teamList() { return (Array.isArray(state.settings.team) ? state.settings.team : parseObj(state.settings.team, [])) || []; }
  function avatar(m, big) {
    var initials = String(m.name || m.position || "?").replace(/[^A-Za-z ]/g, "").split(/\s+/).filter(Boolean).slice(0, 2).map(function (w) { return w[0]; }).join("").toUpperCase();
    return '<span class="avatar' + (big ? " big" : "") + '">' + (m.photo ? '<img src="' + esc(Links.image(m.photo, 400)) + '" alt="" loading="lazy" data-onerr="remove">' : "") + "<span>" + esc(initials) + "</span></span>";
  }
  function viewAbout(tab) {
    var st = state.settings, team = teamList();
    var tabs = ABOUT_TABS.filter(function (t) {
      if (t[0] === "history") return !!String(st.aboutHistory || "").trim() || state.editing;
      if (t[0] === "structure") return !!st.orgChartUrl || team.length;
      return true;
    });
    if (!tabs.some(function (t) { return t[0] === tab; })) tab = "mission";
    var out = '<nav class="crumbs"><a class="btn btn-back" href="#/">' + icon("down", "rot-back") + ' Back</a><ol><li><a href="#/">Home</a></li><li aria-current="page">About</li></ol></nav>';
    out += '<header class="about-hero"><span class="brand-logo about-logo" id="about-logo"></span><div><p class="eyebrow">About us</p><h1>' + esc(st.orgName) + "</h1>" + paras(st.aboutIntro) + "</div>" +
      (state.editing ? '<button type="button" class="btn btn-honey" data-admin-tab="about">' + icon("edit") + " Edit About page</button>" : "") + "</header>";
    out += '<div class="about-tabs" role="tablist">' + tabs.map(function (t) { return '<a role="tab" class="about-tab' + (t[0] === tab ? " on" : "") + '" href="#/about/' + t[0] + '" aria-selected="' + (t[0] === tab) + '">' + t[1] + "</a>"; }).join("") + "</div>";
    var body = "";
    if (tab === "mission") body = '<div class="about-grid"><article class="about-card"><h2>Vision</h2>' + paras(st.aboutVision) + '</article><article class="about-card"><h2>Mission</h2>' + paras(st.aboutMission) + "</article>" +
      (st.aboutMandate ? '<article class="about-card wide"><h2>What the LRMS does</h2>' + paras(st.aboutMandate) + "</article>" : "") + "</div>";
    else if (tab === "values") body = '<ul class="values">' + String(st.aboutValues || "").split("\n").map(function (v) { return v.trim(); }).filter(Boolean).map(function (v) { return '<li><span class="tile-badge">' + icon("star") + "</span><b>" + esc(v) + "</b></li>"; }).join("") + "</ul>";
    else if (tab === "team") {
      var groups = []; team.forEach(function (m, i) { m._i = i; var g = m.group || "Our Team"; if (groups.indexOf(g) < 0) groups.push(g); });
      body = groups.map(function (g) {
        return '<h2 class="team-group">' + esc(g) + '</h2><ul class="team">' + team.filter(function (m) { return (m.group || "Our Team") === g; }).map(function (m) {
          return '<li><button type="button" class="member" data-member="' + m._i + '">' + avatar(m) + '<span class="member-name">' + esc(m.name || m.position) + "</span>" + (m.name ? '<span class="member-pos">' + esc(m.position) + "</span>" : "") + "</button></li>";
        }).join("") + "</ul>";
      }).join("") || '<p class="muted">Team members will be added soon.</p>';
    } else if (tab === "structure") {
      body = st.orgChartUrl ? '<figure class="orgchart"><a href="' + esc(Links.image(st.orgChartUrl, 2400)) + '" target="_blank" rel="noopener"><img src="' + esc(Links.image(st.orgChartUrl, 1800)) + '" alt="Organizational structure"></a><figcaption>Tap the chart to open it full size.</figcaption></figure>'
        : '<div class="orgtree">' + team.map(function (m, i) { return '<button type="button" class="org-node' + (i === 0 ? " head" : "") + '" data-member="' + i + '">' + avatar(m) + "<span><b>" + esc(m.name || m.position) + "</b>" + (m.name ? "<small>" + esc(m.position) + "</small>" : "") + "</span></button>"; }).join("") + "</div>";
    } else if (tab === "history") body = '<article class="about-card wide">' + (paras(st.aboutHistory) || '<p class="muted">Admin: add the history of the LRMS in Admin › About page.</p>') + "</article>";
    else if (tab === "contact") {
      var f = st.footer || {};
      body = '<ul class="contact-list">' + (f.contacts || []).filter(function (c) { return c.label; }).map(function (c) {
        return "<li>" + (c.url ? '<a href="' + esc(safeUrl(c.url)) + '" target="_blank" rel="noopener">' : "<span>") + icon(c.icon || "link") + "<span>" + esc(c.label) + "</span>" + (c.url ? "</a>" : "</span>") + "</li>";
      }).join("") + "</ul>" + (f.orgLines || []).map(function (l) { return "<p>" + esc(l) + "</p>"; }).join("");
    }
    return out + '<section class="about-body">' + body + "</section>";
  }
  function memberDialog(i) {
    var m = teamList()[i]; if (!m) return;
    dialog('<div class="member-detail">' + avatar(m, true) + "<h2>" + esc(m.name || m.position) + "</h2>" + (m.name ? '<p class="member-pos">' + esc(m.position) + "</p>" : "") +
      (m.group ? '<p class="mono muted">' + esc(m.group) + "</p>" : "") + paras(m.bio) +
      (m.email ? '<p><a class="btn btn-honey" href="mailto:' + esc(m.email) + '">' + icon("mail") + " " + esc(m.email) + "</a></p>" : "") + "</div>");
  }
  function dialog(html) {
    var d = document.createElement("div"); d.className = "modal-backdrop";
    d.innerHTML = '<div class="modal small" role="dialog" aria-modal="true"><div class="modal-head"><span></span><button type="button" class="btn btn-ghost btn-sm" data-close>Close</button></div><div class="modal-body">' + html + "</div></div>";
    function close() { document.removeEventListener("keydown", key); leave(d, 170, function () { d.remove(); }); }
    function key(e) { if (e.key === "Escape") close(); }
    d.addEventListener("click", function (e) { if (e.target === d || e.target.closest("[data-close]")) close(); });
    document.addEventListener("keydown", key);
    document.body.appendChild(d); $("[data-close]", d).focus();
  }

  /* ---------------- News ---------------- */
  function newsList() {
    return (state.data.news || []).filter(function (n) { return state.editing || notFalse(n.visible); }).map(function (n) {
      if (!Array.isArray(n.images)) n.images = parseObj(n.images, []) || [];
      return n;
    }).sort(function (a, b) { return (truthy(b.pinned) ? 1 : 0) - (truthy(a.pinned) ? 1 : 0) || String(b.date || "").localeCompare(String(a.date || "")); });
  }
  function fmtDate(d) {
    if (!d) return "";
    var x = new Date(String(d).slice(0, 10) + "T00:00:00+08:00");
    if (isNaN(x)) return esc(d);
    return fmt(x, { year: "numeric", month: "long", day: "numeric" });
  }
  function newsImg(u, w) { return /^data:/.test(u) ? u : Links.image(u, w || 900); }
  function newsCard(n, compact) {
    var cover = n.images && n.images[0];
    return '<li class="news-card' + (compact ? " compact" : "") + (notFalse(n.visible) ? "" : " is-hidden") + '"><a href="#/news/' + esc(n.id) + '">' +
      '<span class="news-cover">' + (cover ? '<img loading="lazy" src="' + esc(newsImg(cover, compact ? 600 : 900)) + '" alt="">' : '<span class="news-cover-art">' + icon(n.fbUrl ? "facebook" : "megaphone") + "</span>") +
      (n.images && n.images.length > 1 ? '<span class="news-count">' + icon("image") + n.images.length + "</span>" : "") + "</span>" +
      '<span class="news-text"><span class="news-meta">' + (n.tag ? '<span class="news-tag">' + esc(n.tag) + "</span>" : "") + "<span>" + fmtDate(n.date) + "</span>" + (truthy(n.pinned) ? '<span class="news-pin">Pinned</span>' : "") + "</span>" +
      '<span class="news-title">' + esc(n.title) + "</span>" +
      (!compact && n.body ? '<span class="news-excerpt">' + esc(String(n.body).replace(/\s+/g, " ").slice(0, 170)) + (String(n.body).length > 170 ? "…" : "") + "</span>" : "") + "</span></a>" +
      (state.editing ? editBtns("news", n.id) : "") + "</li>";
  }
  function fbKind(u) { return /\/videos\/|fb\.watch\/|\/reel\/|\/watch\/?\?v=/.test(u || "") ? "video" : "post"; }
  function fbPlaceholder(u, kind, h) { return '<div class="fb-embed" data-fb="' + esc(u) + '" data-fbkind="' + kind + '" data-h="' + (h || "") + '"><p class="muted">Loading Facebook…</p></div>'; }
  function fillFb() {
    $$(".fb-embed[data-fb]").forEach(function (el) {
      if (el.dataset.done) return; el.dataset.done = "1";
      var u = el.dataset.fb, k = el.dataset.fbkind, w = Math.max(180, Math.min(500, Math.floor(el.clientWidth || 500)));
      var src, h;
      if (k === "page") { h = +el.dataset.h || 760; src = "https://www.facebook.com/plugins/page.php?href=" + encodeURIComponent(u) + "&tabs=timeline&width=" + w + "&height=" + h + "&small_header=true&adapt_container_width=true&hide_cover=false&show_facepile=false"; }
      else if (k === "video") { h = Math.round(w * 9 / 16) + 4; src = "https://www.facebook.com/plugins/video.php?href=" + encodeURIComponent(u) + "&show_text=false&width=" + w; }
      else { h = +el.dataset.h || 640; src = "https://www.facebook.com/plugins/post.php?href=" + encodeURIComponent(u) + "&show_text=true&width=" + w; }
      el.innerHTML = '<iframe src="' + esc(safeUrl(src)) + '" width="' + w + '" height="' + h + '" style="border:none;overflow:hidden;max-width:100%" scrolling="' + (k === "page" ? "yes" : "no") + '" frameborder="0" allowfullscreen allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share" title="Facebook"></iframe>' +
        '<a class="fb-open" href="' + esc(safeUrl(u)) + '" target="_blank" rel="noopener">' + icon("facebook") + " Open on Facebook</a>";
    });
  }
  function viewNews(tag) {
    var st = state.settings, list = newsList(), tags = [];
    list.forEach(function (n) { if (n.tag && tags.indexOf(n.tag) < 0) tags.push(n.tag); });
    var shown = tag ? list.filter(function (n) { return n.tag === tag; }) : list;
    var out = '<nav class="crumbs"><a class="btn btn-back" href="#/">' + icon("down", "rot-back") + ' Back</a><ol><li><a href="#/">Home</a></li><li aria-current="page">News</li></ol></nav>';
    out += '<header class="page-hero"><span class="tile-badge big tone-brick">' + icon("megaphone") + '</span><div><h1>' + esc(st.newsTitle || "News") + "</h1>" + (st.newsIntro ? "<p>" + esc(st.newsIntro) + "</p>" : "") + "</div>" +
      (state.editing ? '<button type="button" class="btn btn-honey" data-add="news">' + icon("plus") + " Add news</button>" : "") + "</header>";
    if (tags.length > 1) out += '<div class="chips news-filter">' + ['<a class="chip' + (!tag ? " on" : "") + '" href="#/news">All</a>'].concat(tags.map(function (t) { return '<a class="chip' + (tag === t ? " on" : "") + '" href="#/news?tag=' + encodeURIComponent(t) + '">' + esc(t) + "</a>"; })).join("") + "</div>";
    var feed = st.facebookPageUrl && st.showFbFeed ? '<aside class="news-aside"><h2>' + icon("facebook") + " On Facebook</h2>" + fbPlaceholder(st.facebookPageUrl, "page", 820) + "</aside>" : "";
    out += '<div class="news-layout' + (feed ? " has-aside" : "") + '"><div>' + (shown.length ? '<ul class="news-grid">' + shown.map(function (n) { return newsCard(n); }).join("") + "</ul>" : '<div class="empty"><p>No news yet.</p></div>') + "</div>" + feed + "</div>";
    return out;
  }
  function viewNewsItem(id) {
    var n = newsList().filter(function (x) { return x.id === id; })[0];
    if (!n) return '<div class="empty"><h1>News not found</h1><a class="btn btn-honey" href="#/news">See all news</a></div>';
    var imgs = n.images || [];
    var out = '<nav class="crumbs"><a class="btn btn-back" href="#/news">' + icon("down", "rot-back") + ' Back</a><ol><li><a href="#/">Home</a></li><li><a href="#/news">News</a></li><li aria-current="page">' + esc(n.title) + "</li></ol></nav>";
    out += '<article class="news-article"><header><p class="news-meta">' + (n.tag ? '<span class="news-tag">' + esc(n.tag) + "</span>" : "") + "<span>" + fmtDate(n.date) + "</span></p><h1>" + esc(n.title) + "</h1>" +
      (state.editing ? '<div class="hero-edit">' + editBtns("news", n.id) + "</div>" : "") + "</header>";
    if (imgs.length) out += '<div class="gallery g' + Math.min(imgs.length, 5) + '">' + imgs.map(function (u, i) {
      return '<button type="button" class="gal-item" data-gal="' + i + '" aria-label="Open photo ' + (i + 1) + '"><img loading="lazy" src="' + esc(newsImg(u, i === 0 ? 1400 : 800)) + '" alt=""></button>';
    }).join("") + "</div>";
    out += '<div class="news-body">' + paras(n.body) + "</div>";
    if (n.fbUrl) out += '<div class="news-fb">' + fbPlaceholder(n.fbUrl, fbKind(n.fbUrl)) + "</div>";
    var acts = [];
    if (n.linkUrl) acts.push('<a class="btn btn-honey" href="' + esc(safeUrl(n.linkUrl)) + '"' + (isExternal(n.linkUrl) ? ' target="_blank" rel="noopener"' : "") + ">" + esc(n.linkText || "Open") + " " + icon("external") + "</a>");
    acts.push('<button type="button" class="btn" data-copy-news="' + esc(location.href.split("#")[0] + "#/news/" + n.id) + '">' + icon("copy") + " Copy link</button>");
    out += '<div class="add-row">' + acts.join("") + "</div></article>";
    state.gallery = imgs;
    return out;
  }
  function homeNews() {
    var k = +state.settings.newsOnHome; if (!k) return "";
    var list = newsList().slice(0, k);
    if (!list.length && !state.editing) return "";
    return '<section aria-labelledby="h-news"><div class="sec-head"><h2 id="h-news">' + esc(state.settings.newsTitle || "News") + '</h2><a class="sec-link" href="#/news">See all news ›</a></div>' +
      '<ul class="news-grid compact">' + list.map(function (n) { return newsCard(n, true); }).join("") + (state.editing ? '<li class="news-card add"><button type="button" class="tile tile-add" data-add="news">' + icon("plus") + "<span>Add news</span></button></li>" : "") + "</ul></section>";
  }

  /* ---------------- photo lightbox ---------------- */
  function lightbox(images, start) {
    if (!images || !images.length) return;
    var i = start || 0, x0 = null;
    var d = document.createElement("div"); d.className = "lightbox"; d.setAttribute("role", "dialog"); d.setAttribute("aria-label", "Photos");
    d.innerHTML = '<img alt=""><button type="button" class="lb-btn lb-prev" aria-label="Previous photo">' + icon("up", "rot-left") + '</button><button type="button" class="lb-btn lb-next" aria-label="Next photo">' + icon("up", "rot-right") + '</button>' +
      '<div class="lb-bar"><span class="lb-count"></span><button type="button" class="btn btn-sm lb-close">Close</button></div>';
    var img = $("img", d);
    function show() { img.src = newsImg(images[i], 2000); $(".lb-count", d).textContent = (i + 1) + " / " + images.length; d.classList.toggle("single", images.length < 2); }
    function go(k) { i = (i + k + images.length) % images.length; show(); }
    function close() { document.removeEventListener("keydown", key); leave(d, 200, function () { d.remove(); if ($("#viewer").hidden && $("#search").hidden) document.body.classList.remove("locked"); }); }
    function key(e) { if (e.key === "Escape") close(); if (e.key === "ArrowRight") go(1); if (e.key === "ArrowLeft") go(-1); }
    d.addEventListener("click", function (e) {
      if (e.target.closest(".lb-prev")) go(-1); else if (e.target.closest(".lb-next")) go(1);
      else if (e.target.closest(".lb-close") || e.target === d) close();
    });
    d.addEventListener("touchstart", function (e) { x0 = e.touches[0].clientX; }, { passive: true });
    d.addEventListener("touchend", function (e) { if (x0 == null) return; var dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1); x0 = null; });
    document.addEventListener("keydown", key);
    document.body.appendChild(d); document.body.classList.add("locked"); show(); $(".lb-close", d).focus();
  }
  window.Hive.lightbox = lightbox;

  /* ---------------- background pictures that blend into the page ---------------- */
  function applyBg(el, which) {
    var st = state.settings, src = st["bg" + which];
    if (!el) return;
    if (el.id === "bg-layer") document.body.classList.toggle("bg-on", !!src);
    if (!src) { el.hidden = true; el.style.backgroundImage = ""; return; }
    el.hidden = false;
    el.style.backgroundImage = 'url("' + (/^data:/.test(src) ? src : Links.image(src, 2000)) + '")';
    el.className = (which === "Gate" ? "gate-bg" : "bg-layer") + " bgs-" + (st["bg" + which + "Style"] || "vignette") + " bgo-" + (st["bg" + which + "Strength"] || "medium") + (truthy(st["bg" + which + "Tint"]) || st["bg" + which + "Tint"] === undefined ? " tint" : "");
  }
  function pageBg(key) { applyBg($("#bg-layer"), key === "home" ? "Home" : "Pages"); }
  window.Hive.applyBg = applyBg;

  /* ---------------- Events calendar ---------------- */
  var EV_TONES = { "Training": "river", "Writeshop": "plum", "Deadline": "brick", "Catch-Up Friday": "leaf", "Meeting": "slate", "Activity": "teal", "Holiday": "honey" };
  function evTone(c) { return EV_TONES[c] || "teal"; }
  function ymd(d) { return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }
  function parseYmd(s) { var p = String(s || "").slice(0, 10).split("-"); return new Date(+p[0], (+p[1] || 1) - 1, +p[2] || 1); }
  function todayYmd() { return new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10); }
  function addDays(s, n) { var d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); }
  function daysBetween(a, b) { return Math.round((parseYmd(b) - parseYmd(a)) / 86400000); }
  function eventList() { return (state.data.events || []).filter(function (e) { return (state.editing || notFalse(e.visible)) && e.startDate; }); }
  /** every occurrence between from and to (weekly events repeat) */
  function occurrences(from, to) {
    var out = [];
    eventList().forEach(function (e) {
      var start = String(e.startDate).slice(0, 10), len = e.endDate ? Math.max(0, daysBetween(start, String(e.endDate).slice(0, 10))) : 0;
      if (e.repeat === "weekly") {
        var until = String(e.repeatUntil || addDays(to, 1)).slice(0, 10), d = start, guard = 0;
        if (d < from) { var skip = Math.floor(daysBetween(d, from) / 7); d = addDays(d, skip * 7); }
        while (d <= to && d <= until && guard++ < 400) { if (addDays(d, len) >= from) out.push({ ev: e, date: d, end: addDays(d, len) }); d = addDays(d, 7); }
      } else {
        var end = addDays(start, len);
        if (end >= from && start <= to) out.push({ ev: e, date: start, end: end });
      }
    });
    return out.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : String(a.ev.startTime || "").localeCompare(String(b.ev.startTime || "")); });
  }
  function timeLabel(e) {
    if (truthy(e.allDay) || !e.startTime) return "Whole day";
    function t(x) { var p = String(x).split(":"), h = +p[0], m = p[1] || "00"; return (h % 12 || 12) + ":" + m + (h < 12 ? " AM" : " PM"); }
    return t(e.startTime) + (e.endTime ? " – " + t(e.endTime) : "");
  }
  function whenLabel(o) {
    var t = todayYmd(), n = daysBetween(t, o.date);
    if (o.date <= t && o.end >= t) return o.date === o.end ? "Today" : "Happening now";
    if (n === 1) return "Tomorrow";
    if (n > 1 && n <= 13) return "In " + n + " days";
    if (n < 0) return "Done";
    return "";
  }
  function dateRange(o) {
    var a = parseYmd(o.date), b = parseYmd(o.end);
    var f = function (d, y) { return fmt(d, { weekday: "short", month: "short", day: "numeric", year: y ? "numeric" : undefined }); };
    return o.date === o.end ? f(a, true) : f(a) + " – " + f(b, true);
  }
  function eventCard(o, compact) {
    var e = o.ev, d = parseYmd(o.date), when = whenLabel(o), tone = evTone(e.category);
    return '<li class="ev-card tone-' + tone + (notFalse(e.visible) ? "" : " is-hidden") + '"><button type="button" class="ev-main" data-event="' + esc(e.id) + '" data-date="' + o.date + '">' +
      '<span class="ev-date"><small>' + fmt(d, { month: "short" }) + "</small><b>" + d.getDate() + "</b><small>" + fmt(d, { weekday: "short" }) + "</small></span>" +
      '<span class="ev-text"><span class="ev-meta"><span class="ev-cat">' + esc(e.category || "Event") + "</span>" + (when ? '<span class="ev-when' + (e.category === "Deadline" ? " urgent" : "") + '">' + when + "</span>" : "") + "</span>" +
      '<span class="ev-title">' + esc(e.title) + "</span>" +
      '<span class="ev-sub">' + (o.date !== o.end ? esc(dateRange(o)) + " · " : "") + esc(timeLabel(e)) + (e.location ? " · " + esc(e.location) : "") + "</span>" +
      (e.memoUrl ? '<span class="ev-memo">' + icon("memo") + " " + esc(e.memoTitle || "Memo attached") + "</span>" : "") + "</span></button>" +
      (state.editing ? editBtns("event", e.id) : "") + "</li>";
  }
  /** upcoming occurrences; a weekly event is shown only at its next date */
  function upcoming(days, limit) {
    var t = todayYmd(), seen = {};
    return occurrences(t, addDays(t, days)).filter(function (o) { if (o.ev.repeat !== "weekly") return true; if (seen[o.ev.id]) return false; seen[o.ev.id] = 1; return true; }).slice(0, limit || 50);
  }
  function homeReminders() {
    var days = +state.settings.reminderDays; if (days === 0) return "";
    var t = todayYmd(), soon = occurrences(t, addDays(t, days || 3)).filter(function (o) { return o.date <= addDays(t, 1) || o.ev.category === "Deadline"; });
    if (!soon.length) return "";
    return '<section class="reminders" aria-label="Reminders">' + soon.slice(0, 3).map(function (o) {
      return '<button type="button" class="reminder tone-' + evTone(o.ev.category) + '" data-event="' + esc(o.ev.id) + '" data-date="' + o.date + '">' + icon(o.ev.category === "Deadline" ? "calendar" : "megaphone") +
        "<span><b>" + esc(whenLabel(o) || dateRange(o)) + ":</b> " + esc(o.ev.title) + (o.ev.category === "Deadline" ? "" : " · " + esc(timeLabel(o.ev))) + "</span>" + (o.ev.memoUrl ? '<span class="ev-memo">' + icon("memo") + " Memo</span>" : "") + "</button>";
    }).join("") + "</section>";
  }
  function homeEvents() {
    var k = +state.settings.eventsOnHome; if (!k) return "";
    var list = upcoming(120, k);
    if (!list.length && !state.editing) return "";
    return '<section aria-labelledby="h-events"><div class="sec-head"><h2 id="h-events">Upcoming events</h2><a class="sec-link" href="#/events">Full calendar ›</a></div>' +
      '<ul class="ev-list">' + list.map(function (o) { return eventCard(o, true); }).join("") + (state.editing ? '<li><button type="button" class="tile tile-add" data-add="event">' + icon("plus") + "<span>Add an event</span></button></li>" : "") + "</ul></section>";
  }
  var calMonth = null, calCat = "";
  function viewEvents(arg) {
    var t = todayYmd();
    if (!calMonth) calMonth = t.slice(0, 7);
    var cats = []; eventList().forEach(function (e) { if (e.category && cats.indexOf(e.category) < 0) cats.push(e.category); });
    var first = parseYmd(calMonth + "-01"), y = first.getFullYear(), m = first.getMonth();
    var gridStart = addDays(ymd(first), -first.getDay()), gridEnd = addDays(gridStart, 41);
    var occ = occurrences(gridStart, gridEnd).filter(function (o) { return !calCat || o.ev.category === calCat; });
    var byDay = {};
    occ.forEach(function (o) { var d = o.date; for (var i = 0; i <= daysBetween(o.date, o.end) && i < 31; i++) { (byDay[d] = byDay[d] || []).push(o); d = addDays(d, 1); } });
    var cells = "";
    for (var i = 0; i < 42; i++) {
      var d = addDays(gridStart, i), list = byDay[d] || [], inMonth = parseYmd(d).getMonth() === m;
      cells += '<button type="button" class="cal-day' + (inMonth ? "" : " out") + (d === t ? " today" : "") + (list.length ? " has" : "") + '" data-day="' + d + '" aria-label="' + esc(fmt(parseYmd(d), { weekday: "long", month: "long", day: "numeric" })) + (list.length ? ", " + list.length + " event" + (list.length > 1 ? "s" : "") : "") + '">' +
        '<span class="cal-n">' + parseYmd(d).getDate() + "</span>" +
        list.slice(0, 3).map(function (o) { return '<span class="cal-ev tone-' + evTone(o.ev.category) + '">' + esc(o.ev.title) + "</span>"; }).join("") + (list.length > 3 ? '<span class="cal-more">+' + (list.length - 3) + " more</span>" : "") + "</button>";
    }
    var sel = /^\d{4}-\d{2}-\d{2}$/.test(arg || "") ? arg : "";
    var side = sel ? occurrences(sel, sel).filter(function (o) { return !calCat || o.ev.category === calCat; }) : upcoming(90, 30).filter(function (o) { return !calCat || o.ev.category === calCat; });
    var out = '<nav class="crumbs"><a class="btn btn-back" href="#/">' + icon("down", "rot-back") + ' Back</a><ol><li><a href="#/">Home</a></li><li aria-current="page">Events</li></ol></nav>';
    out += '<header class="page-hero tone-river"><span class="tile-badge big tone-river">' + icon("calendar") + '</span><div><h1>Events calendar</h1><p>Trainings, writeshops, deadlines and Catch-Up Fridays of the LRMS. Tap an event for details, the memo, and “Add to my calendar”.</p></div>' +
      (state.editing ? '<button type="button" class="btn btn-honey" data-add="event">' + icon("plus") + " Add an event</button>" : "") + "</header>";
    out += homeReminders();
    if (cats.length > 1) out += '<div class="chips news-filter">' + ['<button type="button" class="chip' + (!calCat ? " on" : "") + '" data-cat="">All</button>'].concat(cats.map(function (c) { return '<button type="button" class="chip' + (calCat === c ? " on" : "") + '" data-cat="' + esc(c) + '"><i class="dot tone-' + evTone(c) + '"></i>' + esc(c) + "</button>"; })).join("") + "</div>";
    out += '<div class="ev-layout"><section class="calendar" aria-label="Month calendar"><div class="cal-head"><button type="button" class="btn btn-sm" data-cal="-1" aria-label="Previous month">' + icon("up", "rot-left") + '</button><h2>' + esc(fmt(first, { month: "long", year: "numeric" })) +
      '</h2><button type="button" class="btn btn-sm" data-cal="1" aria-label="Next month">' + icon("up", "rot-right") + '</button><button type="button" class="btn btn-sm btn-ghost" data-cal="0">Today</button></div>' +
      '<div class="cal-week">' + ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(function (w) { return "<span>" + w + "</span>"; }).join("") + "</div><div class=\"cal-grid\">" + cells + "</div></section>" +
      '<section class="ev-side"><div class="sec-head"><h2>' + (sel ? esc(fmt(parseYmd(sel), { weekday: "long", month: "long", day: "numeric" })) : "Coming up") + "</h2>" + (sel ? '<a class="sec-link" href="#/events">Show all upcoming ›</a>' : "") + "</div>" +
      (side.length ? '<ul class="ev-list">' + side.map(function (o) { return eventCard(o); }).join("") + "</ul>" : '<p class="muted">No events' + (sel ? " on this day." : " in the next 90 days.") + "</p>") + "</section></div>";
    return out;
  }
  function icsText(e, o) {
    function esc2(s) { return String(s || "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/([,;])/g, "\\$1"); }
    function dt(d, tm) { return d.replace(/-/g, "") + (tm ? "T" + tm.replace(":", "") + "00" : ""); }
    var allDay = truthy(e.allDay) || !e.startTime, start = o ? o.date : String(e.startDate).slice(0, 10), end = o ? o.end : String(e.endDate || e.startDate).slice(0, 10);
    var lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//LRMS-HIVE//Events//EN", "CALSCALE:GREGORIAN", "BEGIN:VEVENT",
      "UID:" + e.id + "@lrms-hive", "DTSTAMP:" + new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z",
      allDay ? "DTSTART;VALUE=DATE:" + dt(start) : "DTSTART;TZID=Asia/Manila:" + dt(start, e.startTime),
      allDay ? "DTEND;VALUE=DATE:" + dt(addDays(end, 1)) : "DTEND;TZID=Asia/Manila:" + dt(end, e.endTime || e.startTime),
      "SUMMARY:" + esc2(e.title), "LOCATION:" + esc2(e.location), "DESCRIPTION:" + esc2((e.description || "") + (e.memoUrl ? "\nMemo: " + e.memoUrl : "") + "\n" + location.href.split("#")[0] + "#/events/" + e.id)];
    if (e.repeat === "weekly" && !o) lines.push("RRULE:FREQ=WEEKLY" + (e.repeatUntil ? ";UNTIL=" + String(e.repeatUntil).slice(0, 10).replace(/-/g, "") : ""));
    lines.push("BEGIN:VALARM", "TRIGGER:-P1D", "ACTION:DISPLAY", "DESCRIPTION:" + esc2(e.title), "END:VALARM", "END:VEVENT", "END:VCALENDAR");
    return lines.join("\r\n");
  }
  function gcalUrl(e, o) {
    var allDay = truthy(e.allDay) || !e.startTime, start = o ? o.date : String(e.startDate).slice(0, 10), end = o ? o.end : String(e.endDate || e.startDate).slice(0, 10);
    var d = allDay ? start.replace(/-/g, "") + "/" + addDays(end, 1).replace(/-/g, "") : start.replace(/-/g, "") + "T" + e.startTime.replace(":", "") + "00/" + end.replace(/-/g, "") + "T" + (e.endTime || e.startTime).replace(":", "") + "00";
    return "https://calendar.google.com/calendar/render?action=TEMPLATE&text=" + encodeURIComponent(e.title) + "&dates=" + d + "&ctz=Asia/Manila" +
      "&details=" + encodeURIComponent((e.description || "") + (e.memoUrl ? "\n\nMemo: " + e.memoUrl : "")) + "&location=" + encodeURIComponent(e.location || "") +
      (e.repeat === "weekly" && !o ? "&recur=" + encodeURIComponent("RRULE:FREQ=WEEKLY" + (e.repeatUntil ? ";UNTIL=" + String(e.repeatUntil).slice(0, 10).replace(/-/g, "") : "")) : "");
  }
  function eventDialog(id, date) {
    var e = eventList().filter(function (x) { return x.id === id; })[0]; if (!e) return;
    var o = date ? occurrences(date, date).filter(function (x) { return x.ev.id === id; })[0] : null;
    o = o || { ev: e, date: String(e.startDate).slice(0, 10), end: String(e.endDate || e.startDate).slice(0, 10) };
    var when = whenLabel(o);
    dialog('<div class="ev-detail tone-' + evTone(e.category) + '"><p class="ev-meta"><span class="ev-cat">' + esc(e.category || "Event") + "</span>" + (when ? '<span class="ev-when">' + when + "</span>" : "") + "</p>" +
      "<h2>" + esc(e.title) + "</h2>" +
      '<ul class="ev-facts"><li>' + icon("calendar") + "<span>" + esc(dateRange(o)) + (e.repeat === "weekly" ? " · every week" : "") + "</span></li><li>" + icon("hex") + "<span>" + esc(timeLabel(e)) + "</span></li>" + (e.location ? "<li>" + icon("pin") + "<span>" + esc(e.location) + "</span></li>" : "") + "</ul>" +
      paras(e.description) +
      '<div class="ev-actions">' + (e.memoUrl ? '<button type="button" class="btn btn-honey" data-memo="' + esc(e.id) + '">' + icon("memo") + " Read the " + esc(e.memoTitle || "memo") + "</button>" : "") +
      (e.linkUrl ? '<a class="btn" href="' + esc(safeUrl(e.linkUrl)) + '"' + (isExternal(e.linkUrl) ? ' target="_blank" rel="noopener"' : "") + ">" + esc(e.linkText || "Open link") + " " + icon("external") + "</a>" : "") + "</div>" +
      '<div class="ev-cal"><b>Add to my calendar</b><a class="btn btn-sm" href="' + esc(gcalUrl(e, e.repeat === "weekly" ? null : o)) + '" target="_blank" rel="noopener">' + icon("calendar") + ' Google Calendar</a><button type="button" class="btn btn-sm" data-ics="' + esc(e.id) + '" data-date="' + o.date + '">' + icon("download") + " Phone / Outlook (.ics)</button></div>" +
      (state.editing ? '<p><button type="button" class="btn btn-ghost" data-edit="event" data-id="' + esc(e.id) + '">' + icon("edit") + " Edit event</button></p>" : "") + "</div>");
  }
  function downloadIcs(id, date) {
    var e = eventList().filter(function (x) { return x.id === id; })[0]; if (!e) return;
    var o = e.repeat === "weekly" ? null : occurrences(date, date).filter(function (x) { return x.ev.id === id; })[0];
    var blob = new Blob([icsText(e, o)], { type: "text/calendar;charset=utf-8" });
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = String(e.title).replace(/[^\w\- ]+/g, "").slice(0, 60) + ".ics";
    document.body.appendChild(a); a.click(); setTimeout(function () { a.remove(); }, 100);
    toast("Calendar file downloaded — open it to add the event.");
  }
  function openMemo(id) {
    var e = eventList().filter(function (x) { return x.id === id; })[0]; if (!e || !e.memoUrl) return;
    var t = /\.pdf/i.test(e.memoUrl) || Links.isDrive(e.memoUrl) || MS.is(e.memoUrl) ? "pdf" : "link";
    $$(".modal-backdrop").forEach(function (m) { m.remove(); });
    openViewer({ id: "memo-" + e.id, title: e.memoTitle || ("Memo: " + e.title), url: e.memoUrl, type: t, sectionId: "", display: "viewer", _temp: true });
  }

  /* ---------------- usage tracking + reactions ---------------- */
  function visitorInfo() { var v = visitor() || {}; return { visitorId: v.visitorId || "", name: v.name || "", school: v.school || "", district: v.district || "", division: v.division || "" }; }
  function track(type, id, query) { API.beacon("track", { type: type, id: id || "", query: query || "", visitor: visitorInfo() }); }
  window.Hive.track = track;
  var REACTS = [["useful", "Useful", "star"], ["used", "Used in class", "check"], ["needs", "Needs improvement", "edit"]];
  function reactBar(r) {
    var mine = API.LS.get("hive.reacted", {})[r.id];
    return '<div class="react-bar" data-rid="' + esc(r.id) + '"><span class="react-q">' + (mine ? "Thank you for your feedback!" : "Was this helpful?") + "</span>" +
      REACTS.map(function (x) {
        var n = +r[{ useful: "rUseful", used: "rUsed", needs: "rNeeds" }[x[0]]] || 0;
        return '<button type="button" class="react' + (mine === x[0] ? " on" : "") + '" data-react="' + x[0] + '"' + (mine ? " disabled" : "") + ">" + icon(x[2]) + "<span>" + x[1] + "</span>" + (n && x[0] !== "needs" ? '<b class="react-n">' + n + "</b>" : "") + "</button>";
      }).join("") + '<form class="react-comment" hidden><input name="c" maxlength="500" placeholder="Tell the LRMS more (optional) — e.g. how you used it, what to improve"><button class="btn btn-sm btn-honey" type="submit">Send</button><button class="btn btn-sm btn-ghost" type="button" data-skip>Skip</button></form></div>';
  }
  function sendReaction(bar, reaction, comment) {
    var id = bar.dataset.rid, r = findRes(id);
    var rec = API.LS.get("hive.reacted", {}); rec[id] = reaction; API.LS.set("hive.reacted", rec);
    if (r) { var col = { useful: "rUseful", used: "rUsed", needs: "rNeeds" }[reaction]; r[col] = (+r[col] || 0) + 1; }
    API.call("react", { id: id, reaction: reaction, comment: comment || "", visitor: visitorInfo() }).catch(function () {});
  }
  var missSent = {}, missT;
  function reportMiss(q) {
    clearTimeout(missT);
    missT = setTimeout(function () { var k = S.tokens(q).join(" "); if (k.length >= 3 && !missSent[k]) { missSent[k] = 1; track("miss", "", q.trim()); } }, 1800);
  }

  /* ---------------- router ---------------- */
  function route() {
    if (!state.data) return;
    var h = location.hash || "#/", m;
    var view = $("#view");
    if (/^#\/search/.test(h)) {
      var q = decodeURIComponent((h.split("q=")[1] || "").replace(/\+/g, " "));
      history.replaceState(null, "", "#/");
      if (!view.innerHTML) { state.key = "home"; view.innerHTML = viewHome(); }
      if ($("#gate").hidden) openSearch(q); else setTimeout(function () { openSearch(q); }, 900);
      return;
    }
    if ((m = h.match(/^#\/r\/([^/?]+)/))) {
      var r = findRes(decodeURIComponent(m[1]));
      if (r) {
        var key = "s:" + r.sectionId;
        if (state.key !== key) { state.key = key; view.innerHTML = viewSection(r.sectionId); bindView(); }
        openViewer(r);
        return;
      }
    }
    closeViewer(true);
    var newKey = (m = h.match(/^#\/s\/([^/?]+)/)) ? "s:" + decodeURIComponent(m[1]) : (m = h.match(/^#\/about(?:\/(\w+))?/)) ? "about:" + (m[1] || "mission") :
      (m = h.match(/^#\/events(?:\/([^/?]+))?/)) ? "events:" + decodeURIComponent(m[1] || "") :
      /^#\/map/.test(h) ? "map:" : (m = h.match(/^#\/t\/([^/?]+)/)) ? "t:" + decodeURIComponent(m[1]) :
      (m = h.match(/^#\/news\/([^/?]+)/)) ? "item:" + decodeURIComponent(m[1]) : (m = h.match(/^#\/news(?:\?tag=(.*))?$/)) ? "news:" + decodeURIComponent(m[1] || "") : "home";
    if (state.key === newKey && view.innerHTML) return;
    var scrollTop = state.key.split(":")[0] !== newKey.split(":")[0] || newKey.indexOf("s:") === 0;
    var moved = newKey !== lastShown, depth = pageDepth(newKey), dir = depth > lastDepth ? "fwd" : depth < lastDepth ? "back" : "same";
    lastShown = newKey; lastDepth = depth;
    state.key = newKey;
    var kk = newKey.split(":")[0], arg = newKey.slice(kk.length + 1);
    if (window.HiveMap) window.HiveMap.unmount();
    view.innerHTML = kk === "home" ? viewHome() : kk === "about" ? viewAbout(arg) : kk === "news" ? viewNews(arg) : kk === "item" ? viewNewsItem(arg) : kk === "events" ? viewEvents(arg) : kk === "map" ? '<div id="map-root"></div>' : kk === "t" ? viewTab(arg) : viewSection(arg);
    if (kk === "map" && window.HiveMap) window.HiveMap.mount($("#map-root"), state.data, state.settings, { editing: state.editing, onPick: window.HiveAdmin && window.HiveAdmin.pickOnMap });
    if (kk === "events" && arg && !/^\d{4}-/.test(arg)) setTimeout(function () { eventDialog(arg); }, 50);
    var navKey = kk === "item" ? "news" : kk === "t" ? "t-" + arg : kk === "s" ? tabForSection(arg) : kk;
    $$(".mainnav a").forEach(function (a) { var on = a.getAttribute("data-nav") === navKey; a.classList.toggle("on", on); a.setAttribute("aria-current", on ? "page" : "false"); });
    pageBg(kk);
    bindView();
    if (scrollTop) window.scrollTo(0, 0);
    if (moved && !LESS_MOTION) {
      view.classList.remove("view-enter", "dir-fwd", "dir-back", "dir-same");
      void view.offsetWidth; // restart the animation
      view.classList.add("view-enter", "dir-" + dir);
      clearTimeout(view._ve); view._ve = setTimeout(function () { view.classList.remove("view-enter", "dir-fwd", "dir-back", "dir-same"); }, 900);
    }
  }
  var lastShown = "", lastDepth = 0;
  /** how deep a page is, so moving deeper slides in from the right and going back slides from the left */
  function pageDepth(key) {
    var kk = key.split(":")[0], arg = key.slice(kk.length + 1);
    if (kk === "home") return 0;
    if (kk === "s") return 1 + trail(arg).length;
    if (kk === "item") return 2;
    return 1;
  }
  window.Hive.route = function () { state.key = ""; route(); };
  window.addEventListener("hashchange", route);

  function bindView() {
    var f = $("#sec-filter");
    if (f) f.addEventListener("input", function () {
      var q = S.tokens(f.value);
      $$("#sec-items > li").forEach(function (li) {
        var t = S.tokens(li.textContent).join(" ");
        li.hidden = q.length && !q.every(function (w) { return t.indexOf(w) >= 0; });
      });
    });
    var al = $("#about-logo"); if (al) decorateLogo(al, "brand-img");
    markLoadedImages($("#view"));
    tickClock(); paintVisits();
    fillFb();
    if (window.Hive.onRender) window.Hive.onRender();
  }

  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-open-search]"); if (b) { openSearch(); return; }
    if (e.target.closest("[data-open-assistant]")) { openAssistant(); return; }
    var mb = e.target.closest("[data-member]"); if (mb) { memberDialog(+mb.dataset.member); return; }
    var evb = e.target.closest("[data-event]"); if (evb) { eventDialog(evb.dataset.event, evb.dataset.date); return; }
    var ic = e.target.closest("[data-ics]"); if (ic) { downloadIcs(ic.dataset.ics, ic.dataset.date); return; }
    var mm = e.target.closest("[data-memo]"); if (mm) { openMemo(mm.dataset.memo); return; }
    var cb = e.target.closest("[data-cal]"); if (cb) { var k = +cb.dataset.cal; if (!k) calMonth = todayYmd().slice(0, 7); else { var dd = parseYmd(calMonth + "-01"); dd.setMonth(dd.getMonth() + k); calMonth = ymd(dd).slice(0, 7); } state.key = ""; route(); return; }
    var cc = e.target.closest("[data-cat]"); if (cc && cc.closest(".news-filter")) { calCat = cc.dataset.cat; state.key = ""; route(); return; }
    var dy = e.target.closest("[data-day]"); if (dy) { location.hash = "#/events/" + dy.dataset.day; return; }
    var rb = e.target.closest("[data-react]");
    if (rb) { var bar = rb.closest(".react-bar"); $$(".react", bar).forEach(function (b) { b.classList.toggle("on", b === rb); b.disabled = true; }); bar.dataset.reaction = rb.dataset.react; $(".react-q", bar).textContent = "Thank you!"; $(".react-comment", bar).hidden = false; $(".react-comment input", bar).focus(); return; }
    var sk = e.target.closest("[data-skip]"); if (sk) { var b2 = sk.closest(".react-bar"); sendReaction(b2, b2.dataset.reaction, ""); $(".react-comment", b2).hidden = true; $(".react-q", b2).textContent = "Thank you for your feedback!"; return; }
    var tr = e.target.closest("[data-track]"); if (tr && viewerOpenFor) track(tr.dataset.track, viewerOpenFor);
    var et = e.target.closest("[data-edit-tab]"); if (et && window.HiveAdmin) { window.HiveAdmin.editTab(et.getAttribute("data-edit-tab")); return; }
    var od = e.target.closest("[data-open-res]");
    if (od) { var oid = od.getAttribute("data-open-res"), rec0 = API.LS.get("hive.recent", []).filter(function (x) { return x !== oid; }); rec0.unshift(oid); API.LS.set("hive.recent", rec0.slice(0, 12)); API.beacon("view", { id: oid, visitor: visitorInfo() }); track("open", oid); return; }
    var gi = e.target.closest("[data-gal]"); if (gi) { lightbox(state.gallery, +gi.dataset.gal); return; }
    var cn = e.target.closest("[data-copy-news]"); if (cn) { copyText(cn.dataset.copyNews); return; }
    var at = e.target.closest("[data-admin-tab]"); if (at && window.HiveAdmin) { window.HiveAdmin.open(at.dataset.adminTab); return; }
    var pl = e.target.closest("[data-play]");
    if (pl) { // tap-to-play: swap the cover for the live game/video
      var box = pl.parentNode, src = box.dataset.src;
      src += (/youtube|vimeo/.test(src) ? (src.indexOf("?") >= 0 ? "&" : "?") + "autoplay=1" : "");
      box.innerHTML = '<iframe src="' + esc(safeUrl(src)) + '" title="' + esc(box.dataset.title || "") + '" ' + (box.hasAttribute("data-app") ? Media.allowApp : Media.allow) + ' referrerpolicy="strict-origin-when-cross-origin"></iframe>';
      return;
    }
    var fb = e.target.closest("[data-full]");
    if (fb) { var host = fb.closest(".inline-card, .tile-embed, .frame-wrap, .viewer-panel"); var bx = host && (host.querySelector(".embed-box") || host.querySelector(".frame-wrap")) || host; var cov = bx && bx.querySelector("[data-play]"); if (cov) cov.click(); if (bx) fullscreen(bx); return; }
    var ed = e.target.closest("[data-edit]"); if (ed && window.HiveAdmin) { e.preventDefault(); window.HiveAdmin.edit(ed.dataset.edit, ed.dataset.id); return; }
    var ad = e.target.closest("[data-add]"); if (ad && window.HiveAdmin) { e.preventDefault(); window.HiveAdmin.add(ad.dataset.add, ad.dataset); }
  });
  document.addEventListener("submit", function (e) {
    var f = e.target.closest(".react-comment"); if (!f) return;
    e.preventDefault(); var bar = f.closest(".react-bar");
    sendReaction(bar, bar.dataset.reaction, f.c.value.trim()); f.hidden = true; $(".react-q", bar).textContent = "Thank you for your feedback!";
    toast("Thank you! The LRMS reads every comment.");
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") { var pf = $(".pseudo-full"); if (pf) pf.classList.remove("pseudo-full"); } });

  /* ---------------- clock & visitor count ---------------- */
  function fmt(d, o) { try { return d.toLocaleString("en-PH", Object.assign({ timeZone: "Asia/Manila" }, o)); } catch (e) { return d.toLocaleString(undefined, o); } }
  function tickClock() {
    var els = $$("[data-clock]"); if (!els.length) return;
    var d = new Date();
    var time = fmt(d, { hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true });
    var date = fmt(d, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    var short = fmt(d, { weekday: "short", month: "short", day: "numeric" }) + " · " + fmt(d, { hour: "numeric", minute: "2-digit", hour12: true });
    els.forEach(function (el) { var k = el.getAttribute("data-clock"); var v = k === "time" ? time : k === "date" ? date : short; if (el.textContent !== v) el.textContent = v; });
  }
  setInterval(tickClock, 1000);
  state.visits = API.LS.get("hive.visits", null);
  function paintVisits() {
    var v = state.visits; if (!v) return;
    $$("[data-visits]").forEach(function (el) { countTo(el, Number(v[el.getAttribute("data-visits")] || 0)); });
  }
  function loadVisits() {
    if (!state.settings.showVisitorCount && !$("[data-visits]")) return;
    API.stats().then(function (j) { state.visits = j.stats; API.LS.set("hive.visits", j.stats); paintVisits(); }).catch(function () {});
  }
  window.Hive.loadVisits = loadVisits;
  setInterval(function () { if (!document.hidden) loadVisits(); }, 5 * 60000);

  /* ---------------- viewer ---------------- */
  var viewerOpenFor = null, flip = null, viewerTemp = false;
  function openViewer(r) {
    stay($("#viewer"));
    viewerOpenFor = r.id;
    if (flip) { flip.destroy(); flip = null; }
    var t = TYPES[r.type] || TYPES.link, body = "", url = r.url || "", playable = false, isFlip = !!url && isFlipbook(r);
    $("#viewer-title").textContent = r.title;
    var meta = '<p class="viewer-meta"><span class="mono">' + (isFlip ? "Flipbook" : t.label) + "</span>" + chipsFor(r) + '<span class="row-path">' + esc(pathOf(r.sectionId)) + "</span>" + (r.author ? "<span>By " + esc(r.author) + "</span>" : "") + "</p>";
    if (r.type === "note") {
      body = '<article class="note-body">' + String(r.body || r.description || "").split(/\n\s*\n/).map(function (p) {
        var lines = esc(p).split("\n");
        return lines.length > 1 && lines[0].length < 60 ? "<h3>" + lines[0] + "</h3><p>" + lines.slice(1).join("<br>") + "</p>" : "<p>" + lines.join("<br>") + "</p>";
      }).join("") + "</article>";
    } else if (!url) {
      body = '<div class="viewer-empty">' + icon(t.icon, "big") + "<p>This item does not have a link yet.</p>" + (r.description ? "<p class=muted>" + esc(r.description) + "</p>" : "") + "</div>";
    } else if (isFlip) {
      body = '<div class="flip-wrap"><div class="flip-stage" id="flip-stage"></div><div class="flip-bar" id="flip-bar"></div></div>';
    } else if (r.type === "image" && !Links.isFolder(url)) {
      body = '<div class="viewer-img"><img src="' + esc(Links.image(url, 1600)) + '" alt="' + esc(r.title) + '"></div>';
    } else {
      var md = Media.resolve(r, true);
      if (md && md.kind === "iframe") { playable = true; body = '<div class="frame-wrap"><div class="frame-loading">' + icon("hex", "spin") + ' Loading…</div><iframe src="' + esc(safeUrl(md.src)) + '" title="' + esc(r.title) + '" ' + Media.allowFor(md) + ' referrerpolicy="strict-origin-when-cross-origin"></iframe></div>' + (md.game || r.type === "embed" ? '<p class="inline-note">Not showing? Some sites do not allow embedding — use “Open in new tab”.</p>' : ""); }
      else if (md) { playable = true; body = Media.html(r, { autoplay: true }); }
      else body = '<div class="viewer-empty">' + icon(t.icon, "big") + "<p>" + (r.description ? esc(r.description) : "This opens on another website.") + "</p>" + (safeUrl(url) ? '<a class="btn btn-honey btn-xl" data-track="open" href="' + esc(safeUrl(Media.srcFromCode(url))) + '" target="_blank" rel="noopener">' + (r.type === "app" ? "Launch " + esc(r.title) : "Open " + esc(t.label === "Website" ? "website" : t.label)) + " " + icon("external") + "</a>" : '<p class="flag">This link is not allowed.</p>') + "</div>";
    }
    $("#viewer-body").innerHTML = meta + (r.description && r.type !== "note" && (playable || isFlip) ? '<p class="viewer-desc">' + esc(r.description) + "</p>" : "") + body;
    $("#viewer").classList.toggle("is-flip", isFlip);
    var fr = $("#viewer-body iframe"); if (fr) fr.addEventListener("load", function () { var l = $("#viewer-body .frame-loading"); if (l) l.remove(); });
    var acts = [];
    var openUrl = safeUrl(Media.srcFromCode(url));
    if (playable) acts.push('<button class="btn btn-honey" type="button" data-full>' + icon("external") + " Full screen</button>");
    if (openUrl) acts.push('<a class="btn' + (playable ? "" : " btn-honey") + '" data-track="open" href="' + esc(safeUrl(openUrl)) + '" target="_blank" rel="noopener">' + icon("external") + (isFlip ? " Open PDF" : " Open in new tab") + "</a>");
    var dl = Links.download(url) || MS.download(url); if (dl) acts.push('<a class="btn" data-track="download" href="' + esc(safeUrl(dl)) + '" target="_blank" rel="noopener">' + icon("download") + " Download</a>");
    if (openUrl) acts.push('<button class="btn" type="button" data-copy="' + esc(openUrl) + '">' + icon("copy") + " Copy link</button>");
    if (navigator.share) acts.push('<button class="btn" type="button" data-share>' + icon("share") + " Share</button>");
    if (state.editing) acts.push('<button class="btn btn-ghost" type="button" data-edit="resource" data-id="' + esc(r.id) + '">' + icon("edit") + " Edit</button>");
    $("#viewer-actions").innerHTML = acts.join("");
    $("#viewer-react").innerHTML = r._temp || r.type === "note" ? "" : reactBar(r);
    var v = $("#viewer"); v.hidden = false; document.body.classList.add("locked");
    requestAnimationFrame(function () { v.classList.add("open"); });
    if (isFlip) requestAnimationFrame(function () { if (window.HiveFlipbook) flip = window.HiveFlipbook.open(r, $("#flip-stage"), $("#flip-bar")); });
    $("#viewer-close").focus();
    viewerTemp = !!r._temp;
    if (r._temp) return;
    var rec = API.LS.get("hive.recent", []).filter(function (x) { return x !== r.id; }); rec.unshift(r.id); API.LS.set("hive.recent", rec.slice(0, 12));
    API.beacon("view", { id: r.id, visitor: visitorInfo() });
  }
  function closeViewer(silent) {
    var v = $("#viewer"); if (v.hidden) return;
    var oldFlip = flip; flip = null;
    v.classList.remove("open");
    leave(v, 220, function () {
      if (oldFlip) oldFlip.destroy();
      v.hidden = true; $("#viewer-body").innerHTML = "";
      if ($("#search").hidden && $("#gate").hidden) document.body.classList.remove("locked");
    });
    if (!silent && viewerOpenFor && !viewerTemp) { var r = findRes(viewerOpenFor); location.hash = r ? "#/s/" + r.sectionId : "#/"; }
    viewerOpenFor = null; viewerTemp = false;
  }
  $("#viewer-close").addEventListener("click", function () { closeViewer(false); });
  $("#viewer-actions").addEventListener("click", function (e) {
    var c = e.target.closest("[data-copy]");
    if (c) copyText(c.dataset.copy);
    if (e.target.closest("[data-share]")) { var r = findRes(viewerOpenFor); if (r) navigator.share({ title: r.title, text: r.title + " — " + state.settings.siteName, url: r.url || location.href }).catch(function () {}); }
  });
  window.Hive.openViewer = openViewer;
  // copy that works on new and old phones (clipboard API, then the classic fallback)
  function copyText(text) {
    function fallback() {
      var t = document.createElement("textarea"); t.value = text; t.setAttribute("readonly", "");
      t.style.cssText = "position:fixed;top:0;left:0;opacity:0;font-size:16px"; document.body.appendChild(t);
      t.select(); try { t.setSelectionRange(0, text.length); } catch (e) {}
      var ok = false; try { ok = document.execCommand("copy"); } catch (e) {}
      t.remove();
      if (ok) toast("Link copied. You can paste it in Messenger or email.");
      else toast("Press and hold the “Open in new tab” button to copy its link.");
    }
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(function () { toast("Link copied. You can paste it in Messenger or email."); }, fallback);
    else fallback();
  }

  /* ---------------- search ---------------- */
  var sf = { type: "", grade: "", subject: "" };
  function openSearch(q) {
    var o = $("#search"); stay(o); o.hidden = false; document.body.classList.add("locked");
    requestAnimationFrame(function () { o.classList.add("open"); });
    renderFilters();
    var i = $("#q"); if (q != null) i.value = q; i.focus(); i.select(); doSearch();
  }
  function closeSearch() { var o = $("#search"); if (o.hidden) return; o.classList.remove("open"); leave(o, 180, function () { o.hidden = true; if ($("#viewer").hidden) document.body.classList.remove("locked"); }); }
  function renderFilters() {
    var f = S.facets();
    var typeChips = ['<button type="button" class="chip' + (!sf.type ? " on" : "") + '" data-f="type" data-v="">All types</button>'].concat(Object.keys(f.type).sort().map(function (k) {
      return '<button type="button" class="chip' + (sf.type === k ? " on" : "") + '" data-f="type" data-v="' + esc(k) + '">' + icon((TYPES[k] || TYPES.link).icon) + esc((TYPES[k] || { label: k }).label) + "</button>";
    }));
    function sel(name, label, obj) {
      var keys = Object.keys(obj).sort(function (a, b) { return a.localeCompare(b, undefined, { numeric: true }); });
      if (!keys.length) return "";
      return '<label class="sel"><span class="sr">' + label + '</span><select data-f="' + name + '"><option value="">' + label + ": any</option>" + keys.map(function (k) { return '<option' + (sf[name] === k ? " selected" : "") + ">" + esc(k) + "</option>"; }).join("") + "</select></label>";
    }
    $("#search-filters").innerHTML = typeChips.join("") + sel("grade", "Grade", f.grade) + sel("subject", "Subject", f.subject);
  }
  function doSearch() {
    var q = $("#q").value, t0 = performance.now();
    var r = S.query(q, sf), ms = Math.max(1, Math.round(performance.now() - t0));
    var list = $("#results"), meta = $("#search-meta");
    if (!q.trim() && !sf.type && !sf.grade && !sf.subject) {
      meta.innerHTML = "Tip: you can type a grade, subject or quarter — like <b>g5 english q1</b> or <b>catch-up friday</b>.";
      var recent = API.LS.get("hive.recent", []).map(findRes).filter(Boolean).slice(0, 5);
      list.innerHTML = recent.length ? '<li class="res-label">Recently opened</li>' + recent.map(function (x) { return rowHTML(x, { compact: true, path: pathOf(x.sectionId) }); }).join("") : "";
      return;
    }
    if (r.loose && q.trim()) reportMiss(q);
    meta.innerHTML = r.total ? (r.loose ? "No exact match. Showing the <b>closest</b> " + r.total + " results" : "<b>" + r.total + "</b> result" + (r.total === 1 ? "" : "s")) + ' <span class="mono muted">' + ms + " ms</span>" : "";
    if (!r.results.length) {
      reportMiss(q);
      list.innerHTML = '<li class="empty"><p>Nothing matched <b>' + esc(q) + "</b>.</p><p>Try fewer or different words, or ask " + esc(state.settings.aiName) + '.</p><button class="btn btn-honey" type="button" id="ask-instead">Ask ' + esc(state.settings.aiName) + "</button></li>";
      $("#ask-instead").onclick = function () { closeSearch(); openAssistant(q); };
      return;
    }
    list.innerHTML = r.results.map(function (x) {
      if (x.kind === "section") return '<li class="row row-sec"><a class="row-main" href="#/s/' + esc(x.item.id) + '"><span class="row-ic tone-' + esc(x.item.color || "honey") + '">' + icon(x.item.icon || "folder") + '</span><span class="row-text"><span class="row-title">' + S.highlight(x.item.title, r.tokens) + '</span><span class="row-meta"><span class="mono">Section</span><span class="row-path">' + esc(x.path || "Home") + '</span></span></span><span class="row-open">Go</span></a></li>';
      return rowHTML(x.item, { tokens: r.tokens, path: x.path, compact: false });
    }).join("");
  }
  var sTimer;
  $("#q").addEventListener("input", function () { clearTimeout(sTimer); sTimer = setTimeout(doSearch, 60); });
  $("#q").addEventListener("keydown", function (e) { if (e.key === "Enter") { var a = $("#results a"); if (a) { a.click(); } } });
  $("#search-filters").addEventListener("click", function (e) { var c = e.target.closest("[data-f]"); if (c && c.tagName === "BUTTON") { sf[c.dataset.f] = c.dataset.v; renderFilters(); doSearch(); } });
  $("#search-filters").addEventListener("change", function (e) { if (e.target.dataset.f) { sf[e.target.dataset.f] = e.target.value; doSearch(); } });
  $("#results").addEventListener("click", function (e) { if (e.target.closest("a")) closeSearch(); });
  $("#open-search").addEventListener("click", function () { openSearch(); });
  $("#search-close").addEventListener("click", closeSearch);
  $("#search").addEventListener("click", function (e) { if (e.target.id === "search") closeSearch(); });
  window.Hive.openSearch = openSearch;

  /* ---------------- assistant ---------------- */
  function openAssistant(q) {
    var a = $("#assistant"); a.hidden = false; requestAnimationFrame(function () { a.classList.add("open"); });
    if (!$("#assistant-log").children.length) say("bot", "Hello! I can help you find learning materials. Tell me the grade, subject or topic you need.");
    var i = $("#assistant-input"); if (q) { i.value = q; $("#assistant-form").dispatchEvent(new Event("submit", { cancelable: true })); } else i.focus();
  }
  function say(who, html) {
    var d = document.createElement("div"); d.className = "msg " + who; d.innerHTML = html;
    var log = $("#assistant-log"); log.appendChild(d); log.scrollTop = log.scrollHeight; return d;
  }
  function resChip(r) { return '<a class="reschip" href="#/r/' + esc(r.id) + '">' + icon((TYPES[r.type] || TYPES.link).icon) + "<span>" + esc(r.title) + "</span></a>"; }
  $("#assistant-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var input = $("#assistant-input"), q = input.value.trim(); if (!q) return;
    input.value = ""; say("me", esc(q));
    var found = S.query(q).results.filter(function (x) { return x.kind === "resource"; }).slice(0, 8);
    var st = state.settings;
    if (st.aiEnabled && !API.demo) {
      var thinking = say("bot thinking", "Looking through the hive…");
      // send a slice of catalog: best matches + featured, so the model can only pick real items
      var pool = found.map(function (x) { return x.item; });
      if (pool.length < 8) (state.data.resources || []).filter(function (r) { return notFalse(r.visible) && pool.indexOf(r) < 0; }).slice(0, 40).forEach(function (r) { pool.push(r); });
      var candidates = pool.slice(0, 40).map(function (r) { return { id: r.id, title: r.title, type: r.type, grade: r.grade, subject: r.subject, quarter: r.quarter, section: pathOf(r.sectionId), description: String(r.description || "").slice(0, 160) }; });
      var v = visitor() || {};
      API.call("ask", { question: q, candidates: candidates, visitor: { name: v.name, school: v.school } }, 45000).then(function (j) {
        thinking.remove();
        var ids = [];
        var html = esc(j.answer || "").replace(/\[\[([^\]]+)\]\]/g, function (m, id) { ids.push(id); return ""; }).replace(/\n/g, "<br>");
        var chips = ids.map(findRes).filter(Boolean).map(resChip).join("");
        say("bot", html + (chips ? '<div class="reschips">' + chips + "</div>" : ""));
      }).catch(function (err) { thinking.remove(); localAnswer(q, found, err.message); });
    } else localAnswer(q, found);
  });
  /** answers about the site itself work even without the AI */
  function pageChip(href, ic, label) { return '<a class="reschip" href="' + href + '">' + icon(ic) + "<span>" + esc(label) + "</span></a>"; }
  function intentAnswer(q) {
    var t = q.toLowerCase();
    if (/\b(event|events|schedule|seminar|training|webinar|deadline|upcoming|calendar|activity|activities|kailan)\b/.test(t)) {
      var ev = upcoming(60, 4);
      return (ev.length ? "Coming up:<br>" + ev.map(function (o) { return "• <b>" + esc(o.ev.title) + "</b> — " + esc(whenLabel(o) || dateRange(o)); }).join("<br>") : "There are no upcoming events posted right now.") +
        '<div class="reschips">' + pageChip("#/events", "calendar", "Open the events calendar") + "</div>";
    }
    if (/\b(news|update|updates|announcement|latest|balita)\b/.test(t)) {
      var nw = (state.data.news || []).filter(function (n) { return notFalse(n.visible); }).sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); }).slice(0, 3);
      return (nw.length ? "Latest from the LRMS:<br>" + nw.map(function (n) { return "• " + esc(n.title); }).join("<br>") : "No news has been posted yet.") +
        '<div class="reschips">' + nw.map(function (n) { return pageChip("#/news/" + encodeURIComponent(n.id), "megaphone", n.title); }).join("") + pageChip("#/news", "megaphone", "All news") + "</div>";
    }
    if (/\b(map|library hub|libraries|hub|hubs|coverage)\b/.test(t)) return "The Library Map shows every school, its library or Library Hub, and the areas that still need one." + '<div class="reschips">' + pageChip("#/map", "pin", "Open the Library Map") + "</div>";
    if (/\b(contact|email|phone|office|address|where are you|mission|vision|team|who are you)\b/.test(t)) return "You can find the LRMS team, mission, vision and contact details on the About page." + '<div class="reschips">' + pageChip("#/about", "people", "About the LRMS") + pageChip("#/about/contact", "mail", "Contact") + "</div>";
    return "";
  }
  function localAnswer(q, found, err) {
    var st = state.settings, mail = ((st.footer.contacts || []).find(function (c) { return c.icon === "mail"; }) || {}).label;
    var intent = intentAnswer(q);
    if (intent && found.length < 2) { say("bot", (err ? "<span class='muted'>(The AI is unavailable right now.)</span><br>" : "") + intent); return; }
    if (found.length) say("bot", (err ? "<span class='muted'>(The AI is unavailable right now, so here are search results.)</span><br>" : "") + "Here is what I found for <b>" + esc(q) + "</b>:" + '<div class="reschips">' + found.slice(0, 6).map(function (x) { return resChip(x.item); }).join("") + "</div>");
    else { reportMiss(q); say("bot", "I could not find a match for <b>" + esc(q) + "</b>. Try other words, like the subject and grade (for example: <i>grade 6 science</i>)." + (mail ? " You can also email the LRMS at <b>" + esc(mail) + "</b>." : "")); }
  }
  $("#assistant-log").addEventListener("click", function (e) { if (e.target.closest(".reschip") && innerWidth < 700) $("#assistant").classList.remove("open"); });
  $("#fab").addEventListener("click", function () { var a = $("#assistant"); if (!a.hidden && a.classList.contains("open")) { a.classList.remove("open"); } else openAssistant(); });
  $("#assistant-close").addEventListener("click", function () { $("#assistant").classList.remove("open"); });

  /* ---------------- display tools ---------------- */
  var prefs = API.LS.get("hive.prefs", {});
  function applyPrefs() {
    var dark = prefs.theme ? prefs.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    document.documentElement.dataset.text = /^[0-3]$/.test(String(prefs.text)) ? String(prefs.text) : "1";
    $("#btn-theme span").textContent = dark ? "Light" : "Dark";
    $('meta[name="theme-color"]').content = dark ? "#0E1A27" : "#13283F";
  }
  applyPrefs();
  $("#btn-theme").addEventListener("click", function () {
    var root = document.documentElement;
    if (!LESS_MOTION) { root.classList.add("theme-fade"); clearTimeout(root._tf); root._tf = setTimeout(function () { root.classList.remove("theme-fade"); }, 520); }
    prefs.theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark"; API.LS.set("hive.prefs", prefs); applyPrefs(); });
  /* text size: a small menu with four sizes (Small, Normal, Big, Biggest) */
  var TEXT_SIZES = [["0", "Small"], ["1", "Normal"], ["2", "Big"], ["3", "Biggest"]];
  function closeTextMenu() { var m = $(".text-menu:not(.is-leaving)"); if (m) leave(m, 140, function () { m.remove(); }); $("#btn-text").setAttribute("aria-expanded", "false"); }
  $("#btn-text").setAttribute("aria-haspopup", "true");
  $("#btn-text").addEventListener("click", function (e) {
    e.stopPropagation();
    if ($(".text-menu:not(.is-leaving)")) return closeTextMenu();
    var btn = $("#btn-text"), r = btn.getBoundingClientRect(), cur = String(prefs.text || "1");
    var m = document.createElement("div"); m.className = "text-menu"; m.setAttribute("role", "menu"); m.setAttribute("aria-label", "Text size");
    m.innerHTML = TEXT_SIZES.map(function (t) { return '<button type="button" role="menuitemradio" aria-checked="' + (t[0] === cur) + '" data-size="' + t[0] + '"><span class="ts-a ts-' + t[0] + '">A</span>' + t[1] + "</button>"; }).join("");
    m.style.top = Math.round(r.bottom + 6) + "px"; m.style.right = Math.max(8, Math.round(innerWidth - r.right)) + "px";
    document.body.appendChild(m); btn.setAttribute("aria-expanded", "true");
    var on = m.querySelector('[aria-checked="true"]'); if (on) on.focus();
    m.addEventListener("click", function (ev) {
      var b = ev.target.closest("[data-size]"); if (!b) return;
      prefs.text = b.getAttribute("data-size"); API.LS.set("hive.prefs", prefs); applyPrefs(); closeTextMenu();
      toast((TEXT_SIZES.filter(function (t) { return t[0] === prefs.text; })[0] || [0, "Normal"])[1] + " text");
    });
    m.addEventListener("keydown", function (ev) {
      var list = $$("button", m), i = list.indexOf(document.activeElement);
      if (ev.key === "ArrowDown") { ev.preventDefault(); list[(i + 1) % list.length].focus(); }
      if (ev.key === "ArrowUp") { ev.preventDefault(); list[(i + list.length - 1) % list.length].focus(); }
      if (ev.key === "Escape") { closeTextMenu(); btn.focus(); }
    });
  });
  document.addEventListener("click", function (e) { if (!e.target.closest(".text-menu") && $(".text-menu:not(.is-leaving)")) closeTextMenu(); });
  window.addEventListener("resize", closeTextMenu);
  document.addEventListener("keydown", function (e) {
    if (e.key === "/" && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && $("#gate").hidden) { e.preventDefault(); openSearch(); }
    if (e.key === "Escape") {
      if (document.querySelector(".modal-backdrop")) return; // admin modal handles it
      if (!$("#viewer").hidden) closeViewer(false); else if (!$("#search").hidden) closeSearch(); else $("#assistant").classList.remove("open");
    }
  });

  // install as app
  var deferredPrompt = null;
  window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); deferredPrompt = e; $("#btn-install").hidden = false; });
  $("#btn-install").addEventListener("click", function () {
    if (!deferredPrompt) return;
    deferredPrompt.prompt(); var done = function () { deferredPrompt = null; $("#btn-install").hidden = true; }; deferredPrompt.userChoice.then(done, done);
  });
  if ((/iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1)) && !navigator.standalone) {
    $("#btn-install").hidden = false;
    $("#btn-install").onclick = function () { toast("On iPhone/iPad: tap the Share button, then “Add to Home Screen”."); };
  }
  if ("serviceWorker" in navigator && location.protocol === "https:") {
    // when a new version is published, offer a one-tap refresh instead of showing stale files
    var hadController = !!navigator.serviceWorker.controller, reloading = false;
    navigator.serviceWorker.register("sw.js").then(function (reg) {
      function offer(w) {
        if (!w || !hadController || $(".update-bar")) return;
        var bar = document.createElement("div"); bar.className = "update-bar"; bar.setAttribute("role", "status");
        bar.innerHTML = "<span>A new version of LRMS-HIVE is ready.</span>";
        var btn = document.createElement("button"); btn.type = "button"; btn.className = "btn btn-honey btn-sm"; btn.textContent = "Refresh";
        btn.onclick = function () { btn.disabled = true; w.postMessage("skipWaiting"); setTimeout(function () { location.reload(); }, 2500); };
        bar.appendChild(btn); document.body.appendChild(bar);
      }
      if (reg.waiting) offer(reg.waiting);
      reg.addEventListener("updatefound", function () { var w = reg.installing; if (w) w.addEventListener("statechange", function () { if (w.state === "installed") offer(w); }); });
      setInterval(function () { if (!document.hidden) reg.update().catch(function () {}); }, 30 * 60000);
    }).catch(function () {});
    navigator.serviceWorker.addEventListener("controllerchange", function () { if (hadController && !reloading) { reloading = true; location.reload(); } });
  }
  if (API.demo) {
    var rib = document.createElement("div"); rib.className = "demo-ribbon";
    rib.textContent = "DEMO MODE — changes stay on this device only";
    rib.title = "Set API_URL in assets/js/config.js to connect the Apps Script backend.";
    document.body.appendChild(rib);
  }
  /* quietly report script errors to the admin reports (max 5 per visit, no personal data) */
  var errCount = 0;
  function reportError(msg, where) {
    if (++errCount > 5 || API.demo) return;
    msg = String(msg || "").slice(0, 160); if (!msg || /Script error\.?$/.test(msg) || /ResizeObserver/.test(msg)) return;
    API.beacon("track", { type: "error", id: (location.hash || "#/").slice(0, 60), query: msg + (where ? " @ " + String(where).split("/").pop().slice(0, 60) : "") });
  }
  window.addEventListener("error", function (e) { if (e.target && e.target !== window) return; reportError(e.message, e.filename + ":" + e.lineno); });
  window.addEventListener("unhandledrejection", function (e) { var r = e.reason; if (r && /AbortError|took too long|Failed to fetch|NetworkError|Load failed/i.test(r.message || r)) return; reportError("Unhandled: " + (r && r.message || r), ""); });

  /* ---------------- admin hooks ---------------- */
  window.Hive.toast = toast;
  window.Hive.esc = esc;
  window.Hive.pathOf = pathOf;
  window.Hive.trail = trail;
  window.Hive.findRes = findRes;
  window.Hive.applyBranding = applyBranding;
  window.Hive.setEditing = function (on) {
    state.editing = !!on; document.body.classList.toggle("editing", state.editing); renderNav();
    $("#adminbar").hidden = !state.editing;
    if (state.data) ingest(state.data);
    state.key = ""; route();
  };
  /** apply a local change instantly, then the caller persists it */
  window.Hive.patch = function (fn) { fn(state.data); state.data.version = (state.data.version || 0) + 0.001; ingest(state.data); API.LS.set("hive.data", Object.assign({}, state.data, { savedAt: Date.now() })); applyBranding(); state.key = ""; route(); };

  /* ---------------- boot ---------------- */
  var MSGS = ["Building the hive…", "Gathering learning resources…", "Arranging the tiles…", "Preparing your workspace…", "Almost ready…"];
  function boot() {
    var cached = API.cached(), v = visitor();
    // the intro always plays (it loads the site); first visit then shows the welcome form once — registered devices go straight in
    var minShow = REDUCED ? 1200 : v ? 4200 : 5600;
    var ready;
    if (cached) { ingest(cached); applyBranding(); }
    buildComb();
    fitLines();
    var gate = $("#gate"); gate.style.setProperty("--intro", minShow + "ms");
    var mi = 0, msgT = setInterval(function () { mi = Math.min(mi + 1, MSGS.length - 1); $("#gate-msg").textContent = MSGS[mi]; }, Math.max(700, minShow / MSGS.length));
    var waiter = new Promise(function (res) { setTimeout(res, minShow); });
    if (cached) {
      ready = Promise.resolve();
      if (!API.cacheFresh() || API.demo) refresh().catch(function () {});
      else setTimeout(function () { refresh().catch(function () {}); }, 4000);
    } else {
      ready = API.bootstrap().then(function (d) { ingest(d); applyBranding(); });
    }
    ready.then(loadVisits, function () {});
    Promise.all([ready, waiter]).then(function () {
      clearInterval(msgT);
      route();
      if (state.settings.entryEnabled && !v) openGateForm();
      else closeGate();
    }).catch(function (err) {
      clearInterval(msgT);
      $("#gate-status").innerHTML = "<span>Could not reach the server. Please check your internet connection.</span><button class='btn btn-honey' type='button' data-reload>Try again</button><small>" + esc(err.message) + "</small>";
      $("#gate-status").classList.add("err");
    });
  }
  boot();
})();
