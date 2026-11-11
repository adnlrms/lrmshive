/* Data layer: talks to the Apps Script backend, or to a local demo store. */
(function () {
  var C = window.HIVE_CONFIG || {};
  var DEMO = !C.API_URL;

  function store(s) {
    return {
      get: function (k, d) { try { var v = s.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
      set: function (k, v) { try { s.setItem(k, JSON.stringify(v)); } catch (e) { /* quota / private mode */ } },
      del: function (k) { try { s.removeItem(k); } catch (e) {} }
    };
  }
  var LS = store(window.localStorage);
  var SS = store(window.sessionStorage);

  function uid(p) { return (p || "x") + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  function withTimeout(promise, ms) {
    return new Promise(function (res, rej) {
      var t = setTimeout(function () { var e = new Error("The server took too long to answer. Please try again."); e.code = "TIMEOUT"; rej(e); }, ms);
      promise.then(function (v) { clearTimeout(t); res(v); }, function (e) { clearTimeout(t); rej(e); });
    });
  }

  function fail(j) { var e = new Error(j.error || "Request failed"); e.code = j.code || ""; return e; }
  function parse(r) {
    return r.text().then(function (t) {
      try { return JSON.parse(t); } catch (e) {
        // Apps Script answers with an HTML page when the deployment is not "Anyone" or the URL is wrong
        var er = new Error(/<html|<!doctype/i.test(t) ? "The server address answered with a web page, not data. Check that API_URL is the /exec link and the deployment's access is \u201cAnyone\u201d." : "The server sent an unreadable answer.");
        er.code = "BADREPLY"; throw er;
      }
    });
  }
  /** retry a few times when the network blips or the server says it is busy (safe: nothing was saved) */
  function retrying(fn, tries) {
    return new Promise(function (res, rej) {
      (function attempt(n) {
        fn().then(res, function (e) {
          var transient = e && (e.code === "BUSY" || e.name === "TypeError" || e.code === "TIMEOUT");
          if (!transient || n >= tries || navigator.onLine === false) return rej(e);
          setTimeout(function () { attempt(n + 1); }, 700 * Math.pow(2, n - 1) + Math.random() * 400);
        });
      })(1);
    });
  }
  function remoteGet(action, params, ms) {
    var q = ""; for (var k in (params || {})) q += "&" + encodeURIComponent(k) + "=" + encodeURIComponent(params[k]);
    return retrying(function () {
      return withTimeout(fetch(C.API_URL + "?action=" + encodeURIComponent(action) + q + "&t=" + Date.now(), { redirect: "follow" })
        .then(parse)
        .then(function (j) { if (!j.ok) throw fail(j); return j; }), ms || 20000);
    }, action === "file" ? 2 : 3);
  }

  function remotePost(action, payload, ms) {
    var body = JSON.stringify(Object.assign({ action: action, token: SS.get("hive.token", "") }, payload || {}));
    function once() {
      return withTimeout(fetch(C.API_URL, {
        method: "POST", redirect: "follow",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: body
      }).then(parse)
        .then(function (j) {
          if (!j.ok) {
            if (j.code === "AUTH") { SS.del("hive.token"); SS.del("hive.user"); }
            throw fail(j);
          }
          if (j.token && action === "admin.changePassword") SS.set("hive.token", j.token); // other sessions are signed out; keep this one
          return j;
        }), ms || 30000);
    }
    // writes are retried only on "busy": the server refused before doing anything
    return new Promise(function (res, rej) {
      (function attempt(n) {
        once().then(res, function (e) {
          if (e.code !== "BUSY" || n >= 3) return rej(e);
          setTimeout(function () { attempt(n + 1); }, 1500 * n);
        });
      })(1);
    });
  }

  /* ---------------- demo backend (localStorage) ---------------- */
  function demoDb() {
    var db = LS.get("hive.demo.db", null);
    if (db && db.seedVersion !== window.HIVE_SEED_VERSION) { db = null; LS.del("hive.data"); }
    if (!db) {
      var seed = JSON.parse(JSON.stringify(window.HIVE_SEED));
      db = { settings: {}, sections: seed.sections, resources: seed.resources, announcements: seed.announcements, news: seed.news || [], events: seed.events || [], schools: seed.schools || [], districts: seed.districts || [], activity: [], feedback: [], visitors: [], version: 1, seedVersion: window.HIVE_SEED_VERSION };
      LS.set("hive.demo.db", db);
    }
    return db;
  }
  function demoSave(db) { db.version = (db.version || 0) + 1; LS.set("hive.demo.db", db); }
  function upsert(list, item, prefix) {
    if (!item.id) { item.id = uid(prefix); item.createdAt = new Date().toISOString(); list.push(item); }
    else {
      var i = list.findIndex(function (x) { return x.id === item.id; });
      if (i < 0) list.push(item); else list[i] = Object.assign({}, list[i], item);
    }
    item.updatedAt = new Date().toISOString();
    return list.find(function (x) { return x.id === item.id; });
  }
  function manilaDate(ts) { var d = new Date(new Date(ts).getTime() + 8 * 3600000); return isNaN(d) ? "" : d.toISOString().slice(0, 10); }
  function logAct(db, type, id, query, v) {
    v = v || {};
    (db.activity = db.activity || []).push({ timestamp: new Date().toISOString(), type: type, resourceId: id || "", query: query || "", visitorId: v.visitorId || "", school: v.school || "", district: v.district || "", division: v.division || "" });
    if (db.activity.length > 4000) db.activity = db.activity.slice(-4000);
  }
  /* demo only: fills six months of made-up activity so the reports dashboard can be previewed */
  function sampleActivity(db) {
    var districts = ["BUENAVISTA I", "BUENAVISTA II", "CARMEN", "JABONGA", "KITCHARAO", "LAS NIEVES", "MAGALLANES", "NASIPIT", "REMEDIOS T. ROMUALDEZ", "SANTIAGO", "TUBAY"];
    var schools = {}; districts.forEach(function (d, i) { schools[d] = [d + " CENTRAL ES", d + " NATIONAL HS", "SAMPLE SCHOOL " + (i + 1)]; });
    var words = ["grade 3 mathematics q2 worksheet", "mother tongue big book", "dll grade 9 science", "araling panlipunan grade 6 ppt", "reading assessment phil-iri", "tle cookery module", "kindergarten activity sheets", "grade 10 english q3"];
    var rnd = function (n) { return Math.floor(Math.random() * n); }, now = Date.now(), res = db.resources.filter(function (r) { return r.url; }).concat(db.resources.slice(0, 10));
    var reacts = ["useful", "useful", "used", "used", "used", "needs"], comments = ["Very helpful for my class.", "Please add more items for Q3.", "My learners enjoyed this.", "Some pages are blurry.", "Used during Catch-Up Friday."];
    for (var i = 0; i < 900; i++) {
      var t = new Date(now - rnd(180) * 86400000 - rnd(36000000)).toISOString(), d = districts[rnd(districts.length)], sc = schools[d][rnd(3)];
      var v = { visitorId: "vs" + rnd(400), name: "SAMPLE TEACHER " + rnd(400), school: sc, district: d, division: "AGUSAN DEL NORTE" };
      if (i % 3 === 0) db.visitors.push({ timestamp: t, name: v.name, school: sc, district: d, division: v.division, device: ["Android phone", "Windows", "iOS/iPadOS phone"][rnd(3)], visitorId: v.visitorId });
      var r = res[rnd(res.length)];
      db.activity.push({ timestamp: t, type: ["view", "view", "view", "download", "open"][rnd(5)], resourceId: r.id, query: "", visitorId: v.visitorId, school: sc, district: d, division: v.division });
      if (i % 9 === 0) db.activity.push({ timestamp: t, type: "miss", resourceId: "", query: words[rnd(words.length)], visitorId: v.visitorId, school: sc, district: d, division: v.division });
      if (i % 7 === 0) { var re = reacts[rnd(reacts.length)]; db.feedback.push({ timestamp: t, resourceId: r.id, resourceTitle: r.title, reaction: re, comment: i % 14 === 0 ? comments[rnd(comments.length)] : "", name: v.name, school: sc, district: d, division: v.division, visitorId: v.visitorId }); var c = { useful: "rUseful", used: "rUsed", needs: "rNeeds" }[re]; r[c] = (+r[c] || 0) + 1; }
    }
    db.visitors.sort(function (a, b) { return a.timestamp < b.timestamp ? 1 : -1; });
    db.version++;
  }
  function needAdmin() { if (!SS.get("hive.token", "")) { var e = new Error("Please log in again."); throw e; } }

  function demoCall(action, p) {
    var db = demoDb();
    return new Promise(function (resolve) { setTimeout(resolve, 120); }).then(function () {
      switch (action) {
        case "bootstrap":
          return { ok: true, data: { settings: db.settings, sections: db.sections, resources: db.resources, announcements: db.announcements, news: (db.news || []).filter(function (n) { return n.visible !== false; }), events: (db.events || []).filter(function (e) { return e.visible !== false; }), schools: db.schools || [], districts: db.districts || [], version: db.version } };
        case "visit":
          db.visitors.unshift(Object.assign({ timestamp: new Date().toISOString() }, p.visitor)); db.visitors = db.visitors.slice(0, 500);
          LS.set("hive.demo.db", db); return { ok: true };
        case "view":
          var r = db.resources.find(function (x) { return x.id === p.id; }); if (r) { r.views = (+r.views || 0) + 1; }
          logAct(db, "view", p.id, "", p.visitor); LS.set("hive.demo.db", db);
          return { ok: true };
        case "track":
          if (["download", "open", "miss"].indexOf(p.type) >= 0) { logAct(db, p.type, p.id, p.query, p.visitor); LS.set("hive.demo.db", db); }
          return { ok: true };
        case "react":
          var col = { useful: "rUseful", used: "rUsed", needs: "rNeeds" }[p.reaction];
          var rr = db.resources.find(function (x) { return x.id === p.id; });
          if (rr && col) rr[col] = (+rr[col] || 0) + 1;
          var vv = p.visitor || {};
          (db.feedback = db.feedback || []).push({ timestamp: new Date().toISOString(), resourceId: p.id, resourceTitle: rr ? rr.title : "", reaction: p.reaction, comment: p.comment || "", name: vv.name, school: vv.school, district: vv.district, division: vv.division, visitorId: vv.visitorId });
          LS.set("hive.demo.db", db); return { ok: true };
        case "ask":
          return { ok: true, answer: "", demo: true };
        case "stats":
          var today = new Date().toISOString().slice(0, 10);
          return { ok: true, stats: { total: db.visitors.length + (+db.settings.visitorOffset || 0), today: db.visitors.filter(function (v) { return String(v.timestamp).slice(0, 10) === today; }).length } };
        case "login":
          if (p.password === "demo") { return { ok: true, token: "demo-" + uid(), user: { username: p.username || "admin", displayName: "Demo Admin", role: "owner" } }; }
          throw new Error("Wrong username or password. In demo mode the password is: demo");
        case "logout": return { ok: true };
      }
      needAdmin();
      switch (action) {
        case "admin.saveSection": var s = upsert(db.sections, p.section, "s"); demoSave(db); return { ok: true, section: s };
        case "admin.deleteSection":
          var kill = [p.id], changed = true;
          while (changed) { changed = false; db.sections.forEach(function (x) { if (kill.indexOf(x.parentId) >= 0 && kill.indexOf(x.id) < 0) { kill.push(x.id); changed = true; } }); }
          db.sections = db.sections.filter(function (x) { return kill.indexOf(x.id) < 0; });
          db.resources = db.resources.filter(function (x) { return kill.indexOf(x.sectionId) < 0; });
          demoSave(db); return { ok: true };
        case "admin.saveResource": var rr = upsert(db.resources, p.resource, "r"); demoSave(db); return { ok: true, resource: rr };
        case "admin.saveResources": (p.resources || []).forEach(function (x) { upsert(db.resources, x, "r"); }); demoSave(db); return { ok: true, count: (p.resources || []).length };
        case "admin.deleteResource": db.resources = db.resources.filter(function (x) { return x.id !== p.id; }); demoSave(db); return { ok: true };
        case "admin.saveAnnouncement": var a = upsert(db.announcements, p.announcement, "a"); demoSave(db); return { ok: true, announcement: a };
        case "admin.report":
          return { ok: true, report: window.HiveReport.build({ visitors: db.visitors, activity: db.activity || [], feedback: db.feedback || [], resources: db.resources, sections: db.sections, from: p.from, to: p.to, dateOf: manilaDate }) };
        case "admin.exportReport": throw new Error("Export to Google Sheets works once the Apps Script backend is connected. In demo mode, use the CSV buttons.");
        case "admin.feedback": return { ok: true, rows: (db.feedback || []).slice().reverse().slice(0, p.limit || 300) };
        case "admin.saveSchool": db.schools = db.schools || []; var sc = upsert(db.schools, p.school, "sc"); demoSave(db); return { ok: true, school: sc };
        case "admin.deleteSchool": db.schools = (db.schools || []).filter(function (x) { return x.id !== p.id; }); demoSave(db); return { ok: true };
        case "admin.saveDistrict": db.districts = db.districts || []; var di = upsert(db.districts, p.district, "d"); demoSave(db); return { ok: true, district: di };
        case "admin.deleteDistrict": db.districts = (db.districts || []).filter(function (x) { return x.id !== p.id; }); demoSave(db); return { ok: true };
        case "admin.importPlaces":
          var list = p.kind === "districts" ? (db.districts = db.districts || []) : (db.schools = db.schools || []), add = 0, upd = 0;
          (p.rows || []).forEach(function (o) {
            var hit = list.find(function (x) { return (o.schoolId && String(x.schoolId).trim() === String(o.schoolId).trim()) || (String(x.name).trim().toUpperCase() === String(o.name).trim().toUpperCase() && String(x.district || "").toUpperCase() === String(o.district || "").toUpperCase()); });
            if (hit) { Object.keys(o).forEach(function (k) { if (o[k] !== "" && o[k] != null && k !== "id") hit[k] = o[k]; }); upd++; }
            else { o.id = uid(p.kind === "districts" ? "d" : "sc"); if (o.visible === undefined) o.visible = true; list.push(o); add++; }
          });
          demoSave(db); return { ok: true, added: add, updated: upd };
        case "admin.saveEvent": db.events = db.events || []; var ev = upsert(db.events, p.event, "e"); demoSave(db); return { ok: true, event: ev };
        case "admin.deleteEvent": db.events = (db.events || []).filter(function (x) { return x.id !== p.id; }); demoSave(db); return { ok: true };
        case "admin.listEvents": return { ok: true, events: db.events || [] };
        case "admin.sampleActivity": sampleActivity(db); LS.set("hive.demo.db", db); return { ok: true };
        case "admin.saveNews": db.news = db.news || []; var nw = upsert(db.news, p.news, "n"); demoSave(db); return { ok: true, news: nw };
        case "admin.deleteNews": db.news = (db.news || []).filter(function (x) { return x.id !== p.id; }); demoSave(db); return { ok: true };
        case "admin.listNews": return { ok: true, news: db.news || [] };
        case "admin.resolveLink": throw new Error("Short OneDrive links (1drv.ms) are expanded by the Apps Script backend. In demo mode, paste the long link or the Embed code from OneDrive (Share › Embed).");
        case "admin.deleteAnnouncement": db.announcements = db.announcements.filter(function (x) { return x.id !== p.id; }); demoSave(db); return { ok: true };
        case "admin.reorder":
          var list = p.kind === "sections" ? db.sections : db.resources;
          p.ids.forEach(function (id, i) { var it = list.find(function (x) { return x.id === id; }); if (it) it.order = i + 1; });
          demoSave(db); return { ok: true };
        case "admin.saveSettings": Object.assign(db.settings, p.settings); demoSave(db); return { ok: true, settings: db.settings };
        case "admin.stats":
          return { ok: true, stats: { visitors: db.visitors.length, visitsActual: db.visitors.length, visitsShown: db.visitors.length + (+db.settings.visitorOffset || 0), visitsToday: db.visitors.filter(function (v) { return String(v.timestamp).slice(0, 10) === new Date().toISOString().slice(0, 10); }).length, resources: db.resources.length, sections: db.sections.length, recent: db.visitors.slice(0, 10),
            top: db.resources.slice().sort(function (a, b) { return (b.views || 0) - (a.views || 0); }).slice(0, 8).map(function (x) { return { id: x.id, title: x.title, views: x.views || 0 }; }) } };
        case "admin.visitors": return { ok: true, rows: db.visitors.slice(0, p.limit || 200) };
        case "admin.listDrive": throw new Error("Drive folder import works once the Apps Script backend is connected.");
        case "admin.upload": throw new Error("File upload works once the Apps Script backend is connected. In demo mode, paste a link instead.");
        case "admin.changePassword": return { ok: true };
        case "admin.listAdmins": return { ok: true, admins: [{ username: "admin", displayName: "Demo Admin", role: "owner", lastLogin: "" }] };
        case "admin.saveAdmin": case "admin.deleteAdmin": return { ok: true };
        case "admin.aiStatus": return { ok: true, hasKey: false };
        case "admin.setAiKey": return { ok: true };
        case "admin.testAi": throw new Error("The AI assistant needs the Apps Script backend and a Gemini API key.");
        case "admin.clearCache": return { ok: true };
        case "admin.resetDemo": LS.del("hive.demo.db"); return { ok: true };
      }
      throw new Error("Unknown action: " + action);
    });
  }

  /* ---------------- public API ---------------- */
  window.HiveAPI = {
    demo: DEMO,
    uid: uid,
    LS: LS,
    SS: SS,
    token: function () { return SS.get("hive.token", ""); },
    user: function () { return SS.get("hive.user", null); },
    cached: function () { return LS.get("hive.data", null); },
    cacheFresh: function () {
      var c = LS.get("hive.data", null);
      return !!(c && c.savedAt && (Date.now() - c.savedAt) < (C.CACHE_MINUTES || 10) * 60000);
    },
    bootstrap: function () {
      var p = DEMO ? demoCall("bootstrap", {}) : remoteGet("bootstrap");
      return p.then(function (j) {
        var data = j.data; data.savedAt = Date.now();
        LS.set("hive.data", data);
        return data;
      });
    },
    ping: function () { var t0 = Date.now(); return (DEMO ? Promise.resolve({ ok: true, version: "demo" }) : remoteGet("ping", {}, 15000)).then(function (j) { j.ms = Date.now() - t0; return j; }); },
    stats: function () { return DEMO ? demoCall("stats", {}) : remoteGet("stats"); },
    /** PDF bytes for the flipbook (Drive files go through the backend because browsers block direct Drive downloads) */
    fileData: function (id) { return remoteGet("file", { id: id }, 90000); },
    call: function (action, payload, ms) {
      return DEMO ? demoCall(action, payload || {}) : remotePost(action, payload, ms);
    },
    login: function (username, password) {
      return this.call("login", { username: username, password: password }).then(function (j) {
        SS.set("hive.token", j.token); SS.set("hive.user", j.user); return j.user;
      });
    },
    logout: function () {
      var self = this;
      return this.call("logout", {}).catch(function () {}).then(function () { SS.del("hive.token"); SS.del("hive.user"); });
    },
    // fire-and-forget logging that survives page close
    beacon: function (action, payload) {
      if (DEMO) { demoCall(action, payload).catch(function () {}); return; }
      try {
        fetch(C.API_URL, { method: "POST", mode: "no-cors", keepalive: true,
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify(Object.assign({ action: action }, payload)) });
      } catch (e) {}
    }
  };
})();
