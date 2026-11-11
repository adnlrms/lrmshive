/* LRMS-HIVE admin facility: login, in-place editing, tabbed settings. */
(function () {
  "use strict";
  var H = window.Hive, API = window.HiveAPI, esc = H.esc, icon = window.hiveIcon, st = H.state;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var truthy = function (v) { return v === true || v === "TRUE" || v === "true" || v === 1 || v === "1"; };
  var notFalse = function (v) { return !(v === false || v === "FALSE" || v === "false" || v === 0 || v === "0"); };
  var GRADES = ["Kindergarten", "Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6", "Grade 7", "Grade 8", "Grade 9", "Grade 10", "Grade 11", "Grade 12", "ALS", "All grades"];
  var SUBJECTS = ["English", "Filipino", "Mathematics", "Science", "Araling Panlipunan", "Values Education", "GMRC", "MAPEH", "Music and Arts", "PE and Health", "EPP / TLE", "Reading", "Makabansa", "Language", "Mother Tongue", "ALS", "Research", "Core Subjects (SHS)", "Applied Subjects (SHS)", "Specialized (SHS)"];

  /* ---------------- small helpers ---------------- */
  function busy(btn, on, label) {
    if (!btn) return;
    if (on) { btn.dataset.label = btn.innerHTML; btn.disabled = true; btn.innerHTML = icon("hex", "spin") + " " + (label || "Saving…"); }
    else { btn.disabled = false; if (btn.dataset.label) btn.innerHTML = btn.dataset.label; }
  }
  function fail(err) { H.toast(err && err.message ? err.message : String(err), "err"); }
  function formVals(form) {
    var o = {};
    $$("input[name], select[name], textarea[name]", form).forEach(function (el) {
      if (el.type === "checkbox") o[el.name] = el.checked;
      else if (el.type === "file") return;
      else o[el.name] = el.value.trim();
    });
    return o;
  }
  function opt(v, label, sel) { return '<option value="' + esc(v) + '"' + (String(sel) === String(v) ? " selected" : "") + ">" + esc(label) + "</option>"; }
  function dl(id, arr) { return '<datalist id="' + id + '">' + arr.map(function (x) { return '<option value="' + esc(x) + '">'; }).join("") + "</datalist>"; }
  function field(label, inner, help) { return '<label class="field"><span>' + label + "</span>" + inner + (help ? "<small>" + help + "</small>" : "") + "</label>"; }
  function input(name, val, attrs) { return '<input name="' + name + '" value="' + esc(val == null ? "" : val) + '" ' + (attrs || "") + ">"; }
  function area(name, val, attrs) { return '<textarea name="' + name + '" ' + (attrs || "") + ">" + esc(val == null ? "" : val) + "</textarea>"; }
  function toggle(name, on, label) { return '<label class="toggle"><input type="checkbox" name="' + name + '"' + (on ? " checked" : "") + "> " + label + "</label>"; }
  function sortedKids(pid) { return (st.data.sections || []).filter(function (s) { return (s.parentId || "") === (pid || ""); }).sort(function (a, b) { return (+a.order || 0) - (+b.order || 0); }); }
  /** admin-made tabs can hold their own tiles: parentId "tab:<id>" */
  function tabPlaceOptions(sel, excludeId) {
    var out = [];
    H.navItems().filter(function (t) { return !t.builtin && t.type === "page"; }).forEach(function (t) {
      out.push(opt("tab:" + t.id, "Tab: " + t.label, sel));
      (function walk(pid, depth) { sortedKids(pid).forEach(function (s) { if (s.id === excludeId) return; out.push(opt(s.id, new Array(depth + 1).join("— ") + s.title, sel)); walk(s.id, depth + 1); }); })("tab:" + t.id, 1);
    });
    return out.length ? '<optgroup label="Tabs">' + out.join("") + '</optgroup><optgroup label="Home page folders">' : "";
  }
  function sectionOptions(sel, excludeId) {
    var out = [];
    (function walk(pid, depth) {
      sortedKids(pid).forEach(function (s) {
        if (s.id === excludeId) return;
        out.push(opt(s.id, new Array(depth + 1).join("— ") + s.title, sel));
        walk(s.id, depth + 1);
      });
    })("", 0);
    return out.join("");
  }

  /* ---------------- modal ---------------- */
  function modal(o) {
    var wrap = document.createElement("div");
    wrap.className = "modal-backdrop";
    wrap.innerHTML = '<form class="modal" role="dialog" aria-modal="true" novalidate><div class="modal-head"><h2>' + esc(o.title) + '</h2><button type="button" class="btn btn-ghost btn-sm" data-close>Close</button></div>' +
      '<div class="modal-body">' + o.body + '</div><div class="modal-foot">' + (o.foot || "") + "</div></form>";
    document.body.appendChild(wrap);
    document.body.classList.add("locked");
    var form = $("form", wrap);
    function close() {
      document.removeEventListener("keydown", onKey);
      if (wrap._closing) return; wrap._closing = true;
      H.leave(wrap, 170, function () { wrap.remove(); if (!document.querySelector(".modal-backdrop") && !$(".admin") && $("#viewer").hidden && $("#search").hidden) document.body.classList.remove("locked"); });
    }
    function onKey(e) { if (e.key === "Escape") close(); }
    document.addEventListener("keydown", onKey);
    wrap.addEventListener("click", function (e) { if (e.target === wrap || e.target.closest("[data-close]")) close(); });
    form.addEventListener("submit", function (e) { e.preventDefault(); if (o.onSubmit) o.onSubmit(form, close, e.submitter); });
    if (o.onMount) o.onMount(form, close);
    var first = $("input:not([type=hidden]):not([type=checkbox]), textarea", form); if (first) setTimeout(function () { if (!form.contains(document.activeElement)) first.focus(); }, 30);
    return { el: wrap, form: form, close: close };
  }
  function confirmBox(title, text, okLabel) {
    return new Promise(function (resolve) {
      var m = modal({ title: title, body: "<p>" + text + "</p>", foot: '<button type="button" class="btn grow" data-close>Cancel</button><button class="btn btn-danger" type="submit">' + esc(okLabel || "Delete") + "</button>",
        onSubmit: function (f, close) { close(); resolve(true); } });
      m.el.addEventListener("click", function (e) { if (e.target.closest("[data-close]") || e.target === m.el) resolve(false); });
    });
  }

  /* ---------------- login ---------------- */
  function loginModal() {
    if (window.top !== window.self) { H.toast("For safety, admin login only works when LRMS-HIVE is opened directly — not inside another page.", "err"); try { window.open(location.href, "_blank", "noopener"); } catch (e) {} return; }
    modal({
      title: "Admin login",
      body: (API.demo ? '<p class="link-check warn">Demo mode: no backend connected. Use any username and the password <b>demo</b>.</p>' : "") +
        field("Username", input("username", "", 'autocomplete="username" required')) +
        field("Password", input("password", "", 'type="password" autocomplete="current-password" required')) +
        '<p class="form-error" data-err></p>',
      foot: '<button class="btn btn-honey btn-xl" type="submit">Log in</button>',
      onSubmit: function (f, close, btn) {
        var v = formVals(f);
        if (!v.username || !v.password) { $("[data-err]", f).textContent = "Enter your username and password."; return; }
        busy(btn, true, "Checking…");
        API.login(v.username, v.password).then(function (u) {
          close(); H.setEditing(true); H.toast("Welcome, " + (u.displayName || u.username) + ". Tap the honey pencil on any tile to edit it.");
        }).catch(function (err) { busy(btn, false); $("[data-err]", f).textContent = err.message; });
      }
    });
  }
  $("#btn-admin").addEventListener("click", function () { if (API.token()) openPanel("dashboard"); else loginModal(); });
  $("#adminbar-open").addEventListener("click", function () { openPanel("dashboard"); });
  $("#adminbar-exit").addEventListener("click", function () { API.logout().then(function () { H.setEditing(false); H.toast("Logged out."); }); });

  /* ---------------- link helper ---------------- */
  function describeLink(url) {
    var L = H.Links;
    if (!url) return { cls: "warn", text: "No link yet. Paste a Google Drive link, or upload a file below." };
    if (/<iframe/i.test(url)) return /src=/i.test(url) ? { cls: "ok", text: "Embed code — it will be shown and played inside the site." } : { cls: "warn", text: "This embed code has no src link in it." };
    if (/^(assets\/|\.\/|\/)/.test(url)) return { cls: "ok", text: "File stored with the website — works without the backend." };
    if (!/^https?:\/\//i.test(url)) return { cls: "warn", text: "This does not look like a web link. It should start with https://" };
    var MS = H.MS;
    if (MS.is(url)) {
      if (MS.isFolder(url)) return { cls: "ok", text: "OneDrive/SharePoint folder — folders cannot be shown inside the site, so teachers get an Open button. Link single files to preview them here." };
      if (/1drv\.ms/.test(url)) return { cls: "ok", text: "OneDrive short link — it is expanded when you save so the file can be previewed here. Tip: OneDrive › Share › Embed gives a code that always works." };
      return { cls: "ok", text: "Microsoft OneDrive/SharePoint file — previews inside the site (Word, PowerPoint, Excel, PDF). Share it as “Anyone with the link”; SharePoint files limited to DepEd accounts show a sign-in box instead." };
    }
    if (MS.officeFile(url)) return { cls: "ok", text: "Office file — shown inside the site with the Microsoft Office viewer." };
    if (L.isDrive(url)) {
      if (!L.id(url)) return { cls: "warn", text: "This Google link has no file ID. Use Share › Copy link in Google Drive." };
      return { cls: "ok", text: (L.isFolder(url) ? "Google Drive folder — teachers will see the files inside as a grid." : "Google file — it previews and plays inside the site (videos play too); download and copy-link buttons work.") + " Set sharing to “Anyone with the link” so every teacher can open it." };
    }
    if (L.youtube(url)) return { cls: "ok", text: "YouTube video — plays inside the site." };
    if (/vimeo\.com|loom\.com|facebook\.com\/.+\/videos|fb\.watch/.test(url)) return { cls: "ok", text: "Video — plays inside the site." };
    if (/\.(mp4|webm|mov|m4v|mp3|m4a|wav)(\?|$)/i.test(url)) return { cls: "ok", text: "Video/audio file — plays inside the site." };
    if (/scratch\.mit\.edu\/projects/.test(url)) return { cls: "ok", text: "Scratch project — can be played inside the site." };
    if (/canva\.com\/design\//.test(url)) return { cls: "ok", text: "Canva design — shown inside the site if the design is shared publicly." };
    return { cls: "ok", text: "Website — set “How teachers see it” to “Show on the page” to embed it (games, quizzes, simulations). If the site blocks embedding, teachers still get an Open button." };
  }
  function guessType(url, mime) {
    url = url || ""; mime = mime || "";
    var sp = url.match(/sharepoint\.com\/:([a-z]):\//i);
    if (sp) return { w: "doc", p: "slides", x: "sheet", b: "pdf", v: "video", f: "folder", i: "image" }[sp[1].toLowerCase()] || "link";
    if (/\.docx?(\?|$)/i.test(url)) return "doc";
    if (/\.pptx?(\?|$)/i.test(url)) return "slides";
    if (/\.xlsx?(\?|$)/i.test(url)) return "sheet";
    if (/folder/.test(mime) || /\/folders\//.test(url)) return "folder";
    if (/document/.test(mime) || /docs\.google\.com\/document/.test(url) || /word/.test(mime)) return "doc";
    if (/presentation/.test(mime) || /docs\.google\.com\/presentation/.test(url) || /powerpoint/.test(mime)) return "slides";
    if (/spreadsheet|excel/.test(mime) || /docs\.google\.com\/spreadsheets/.test(url)) return "sheet";
    if (/forms/.test(mime) || /docs\.google\.com\/forms/.test(url)) return "form";
    if (/pdf/.test(mime) || /\.pdf($|\?)/i.test(url)) return "pdf";
    if (/video/.test(mime) || H.Links.youtube(url) || /vimeo\.com|loom\.com|\.(mp4|webm|mov)(\?|$)/i.test(url)) return "video";
    if (/scratch\.mit\.edu|wordwall\.net|itch\.io|learningapps\.org|kahoot|quizizz|blooket/i.test(url)) return "game";
    if (/<iframe|genial|h5p|phet\.colorado\.edu\/sims/i.test(url)) return "embed";
    if (/image/.test(mime)) return "image";
    if (/audio/.test(mime) || /\.(mp3|m4a|wav)(\?|$)/i.test(url)) return "audio";
    return "";
  }
  function fileToBase64(file) {
    return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(String(r.result).split(",")[1]); }; r.onerror = rej; r.readAsDataURL(file); });
  }
  /* shrink big images in the browser before saving (keeps the site fast on slow connections) */
  function shrinkImage(file, max, outType) {
    return new Promise(function (resolve, reject) {
      if (!/^image\//.test(file.type) || /svg/.test(file.type)) { var r0 = new FileReader(); r0.onload = function () { resolve({ file: file, dataUrl: r0.result }); }; r0.onerror = reject; r0.readAsDataURL(file); return; }
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () {
        var k = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement("canvas");
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        var type = outType || "image/png", ext = type === "image/jpeg" ? ".jpg" : ".png";
        var dataUrl = c.toDataURL(type, 0.85);
        var bin = atob(dataUrl.split(",")[1]), arr = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        var out; try { out = new File([arr], file.name.replace(/\.[^.]+$/, "") + ext, { type: type }); } catch (e) { out = new Blob([arr], { type: type }); out.name = file.name.replace(/\.[^.]+$/, "") + ext; }
        resolve({ file: out, dataUrl: dataUrl });
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("This image could not be read. Try a PNG or JPG file.")); };
      img.src = url;
    });
  }
  function uploadFile(file, btn) {
    if (file.size > 25 * 1024 * 1024) return Promise.reject(new Error("This file is bigger than 25 MB. Upload it to Google Drive directly and paste its link instead."));
    busy(btn, true, "Uploading " + Math.round(file.size / 1024) + " KB…");
    return fileToBase64(file).then(function (b64) {
      return API.call("admin.upload", { name: file.name, mimeType: file.type || "application/octet-stream", data: b64 }, 180000);
    }).then(function (j) { busy(btn, false); return j; }, function (e) { busy(btn, false); throw e; });
  }

  /* ---------------- image picker (upload or link) ---------------- */
  // returns HTML; wire with bindImagePick(form, name)
  function imagePick(name, val, label, help) {
    return '<div class="field"><span>' + label + '</span><div class="color-row"><input name="' + name + '" value="' + esc(/^data:/.test(val || "") ? "" : val || "") + '" placeholder="Paste a Drive image link, or upload" style="flex:1;min-width:200px">' +
      '<input type="hidden" name="' + name + '__data" value="' + esc(/^data:/.test(val || "") ? val : "") + '">' +
      '<input type="file" accept="image/*" data-imgfile="' + name + '" hidden><button type="button" class="btn btn-sm" data-imgpick="' + name + '">' + icon("image") + ' Upload</button>' +
      '<button type="button" class="btn btn-sm btn-ghost" data-imgclear="' + name + '">Remove</button></div>' + (help ? "<small>" + help + "</small>" : "") + "</div>";
  }
  function bindImagePick(f, onChange, max) {
    f.addEventListener("click", function (e) {
      var b = e.target.closest("[data-imgpick]"); if (b) $('[data-imgfile="' + b.dataset.imgpick + '"]', f).click();
      var c = e.target.closest("[data-imgclear]"); if (c) { f[c.dataset.imgclear].value = ""; f[c.dataset.imgclear + "__data"].value = ""; if (onChange) onChange(); }
    });
    f.addEventListener("change", function (e) {
      var inp = e.target; if (!inp.dataset || !inp.dataset.imgfile) return;
      var name = inp.dataset.imgfile, file = inp.files[0]; if (!file) return;
      var btn = $('[data-imgpick="' + name + '"]', f);
      shrinkImage(file, max || 1200, (max || 1200) > 1500 ? "image/jpeg" : undefined).then(function (small) {
        if (API.demo) { f[name + "__data"].value = small.dataUrl; f[name].value = ""; H.toast("Demo mode: image kept in this browser only."); if (onChange) onChange(); return; }
        return uploadFile(small.file, btn).then(function (j) { f[name].value = j.url; f[name + "__data"].value = ""; H.toast("Image uploaded."); if (onChange) onChange(); });
      }).catch(fail);
      inp.value = "";
    });
  }
  function imgVal(v, name) { var d = v[name + "__data"]; delete v[name + "__data"]; return d || v[name] || ""; }

  /* ---------------- drag to arrange (mouse, touch and pen) ---------------- */
  function sortable(list, itemSel, grid, onDone) {
    list.addEventListener("pointerdown", function (e) {
      var h = e.target.closest("[data-drag]"); if (!h || !list.contains(h)) return;
      var item = h.closest(itemSel); while (item && item.parentNode !== list) item = item.parentNode.closest(itemSel);
      if (!item) return;
      e.preventDefault();
      var rect = item.getBoundingClientRect(), dx = e.clientX - rect.left, dy = e.clientY - rect.top;
      var ghost = item.cloneNode(true); ghost.classList.add("dragging-ghost");
      ghost.style.width = rect.width + "px"; ghost.style.left = rect.left + "px"; ghost.style.top = rect.top + "px";
      document.body.appendChild(ghost); item.classList.add("drop-placeholder");
      var scroller = list.closest(".admin-body") || window;
      function move(ev) {
        ghost.style.left = (ev.clientX - dx) + "px"; ghost.style.top = (ev.clientY - dy) + "px";
        var el = document.elementFromPoint(ev.clientX, ev.clientY), over = el && el.closest(itemSel);
        while (over && over.parentNode !== list) over = over.parentNode.closest(itemSel);
        if (over && over !== item) {
          var r = over.getBoundingClientRect();
          var after = grid && ev.clientY > r.top && ev.clientY < r.bottom ? ev.clientX > r.left + r.width / 2 : ev.clientY > r.top + r.height / 2;
          list.insertBefore(item, after ? over.nextSibling : over);
        }
        var edge = 70, H0 = window.innerHeight;
        if (ev.clientY < edge) (scroller.scrollBy ? scroller : window).scrollBy(0, -14);
        else if (ev.clientY > H0 - edge) (scroller.scrollBy ? scroller : window).scrollBy(0, 14);
      }
      function up() {
        document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", up); document.removeEventListener("pointercancel", up);
        ghost.remove(); item.classList.remove("drop-placeholder");
        onDone(Array.prototype.filter.call(list.children, function (c) { return c.matches(itemSel) && c.dataset.id; }).map(function (c) { return c.dataset.id; }));
      }
      document.addEventListener("pointermove", move); document.addEventListener("pointerup", up); document.addEventListener("pointercancel", up);
    });
  }
  function saveOrder(kind, ids) {
    var list = kind === "sections" ? "sections" : "resources";
    H.patch(function (d) { ids.forEach(function (id, k) { var x = d[list].find(function (y) { return y.id === id; }); if (x) x.order = k + 1; }); });
    return API.call("admin.reorder", { kind: kind, ids: ids }).then(function () { H.toast("New order saved."); }).catch(fail);
  }
  function sortIds(list, how) {
    var a = list.slice(), tone = H.TONES;
    var cmp = {
      az: function (x, y) { return String(x.title).localeCompare(String(y.title), undefined, { numeric: true }); },
      za: function (x, y) { return String(y.title).localeCompare(String(x.title), undefined, { numeric: true }); },
      items: function (x, y) { return (st.count[y.id] || +y.views || 0) - (st.count[x.id] || +x.views || 0); },
      newest: function (x, y) { return String(y.createdAt || y.updatedAt || "").localeCompare(String(x.createdAt || x.updatedAt || "")); },
      color: function (x, y) { return tone.indexOf(x.color) - tone.indexOf(y.color) || String(x.title).localeCompare(String(y.title)); },
      group: function (x, y) { var g = (st.settings.groups || []).map(function (q) { return q.id; }); return (g.indexOf(x.group) + 1 || 99) - (g.indexOf(y.group) + 1 || 99); },
      grade: function (x, y) { var n = function (r) { var m = String(r.grade || "").match(/\d+/); return m ? +m[0] : /kinder/i.test(r.grade) ? 0 : 99; }; return n(x) - n(y) || String(x.title).localeCompare(String(y.title)); }
    }[how];
    if (cmp) a.sort(cmp);
    return a.map(function (x) { return x.id; });
  }
  // drag tiles directly on the page while in editing mode
  H.onRender = function () {
    if (!st.editing) return;
    var lists = $$("#view .tiles");
    lists.forEach(function (ul) {
      if (ul._sortable) return; ul._sortable = true;
      sortable(ul, ".tile-cell", true, function () {
        var ids = $$("#view .tiles > .tile-cell[data-id]").map(function (li) { return li.dataset.id; });
        saveOrder("sections", ids);
      });
    });
    var rows = $("#sec-items"); if (rows && !rows._sortable) { rows._sortable = true; sortable(rows, "li", rows.classList.contains("shelf"), function (ids) { saveOrder("resources", ids); }); }
    var inl = $("#sec-inline"); if (inl && !inl._sortable) { inl._sortable = true; sortable(inl, "li", false, function (ids) { saveOrder("resources", ids); }); }
  };

  /* ---------------- tile designer ---------------- */
  var KINDS = [
    ["section", "Folder", "Holds tiles and resources", "folder"], ["link", "Link", "Opens a page, website or resource", "link"],
    ["embed", "Interactive", "A game, quiz or website played on the tile", "game"], ["video", "Video", "Plays a video on the tile", "video"],
    ["text", "Text note", "A message or reminder", "note"], ["image", "Picture", "A banner or poster", "image"],
    ["widget", "Widget", "Clock, visitor count, search…", "spark"]
  ];
  var ASPECTS = [["16:9", "Wide (16:9)"], ["16:10", "Laptop (16:10)"], ["4:3", "Classic (4:3)"], ["1:1", "Square"], ["3:4", "Tall (3:4)"], ["9:16", "Phone (9:16)"]];
  function groupOptions(sel) {
    return opt("", "No group", sel) + (st.settings.groups || []).map(function (g) { return opt(g.id, g.name, sel); }).join("") + opt("__new", "+ New group…", "");
  }
  function pageOptions() {
    var o = ['<option value="">Quick pick a page…</option>', '<option value="#/">Home</option>', '<option value="#/news">News page</option>', '<option value="#/events">Events calendar</option>', '<option value="#/map">Library map</option>', '<option value="#/about">About page</option>', '<option value="#/about/team">About › Our Team</option>'];
    (function walk(pid, depth) { sortedKids(pid).forEach(function (s) { if ((s.kind || "section") === "section") o.push('<option value="#/s/' + esc(s.id) + '">' + new Array(depth + 1).join("— ") + esc(s.title) + "</option>"); walk(s.id, depth + 1); }); })("", 0);
    return o.join("");
  }
  /* ---------------- menu tabs ---------------- */
  function navToSave(list) {
    return list.map(function (t) {
      return t.builtin ? { id: t.id, builtin: true, label: t.label, icon: t.icon, visible: t.id === "home" ? true : t.visible !== false }
        : { id: t.id, label: t.label, icon: t.icon || "file", type: t.type || "page", title: t.title || "", subtitle: t.subtitle || "", body: t.body || "", url: t.url || "", aspect: t.aspect || "16:9", sectionId: t.sectionId || "", visible: t.visible !== false };
    });
  }
  function saveNav(list, btn, msg) { return saveSettings({ navItems: navToSave(list) }, btn, msg || "Menu saved."); }
  function tabForm(t, isNew) {
    t = Object.assign({ type: "page", icon: "file", visible: true }, t || {});
    var BI = { home: "#/", events: "#/events", news: "#/news", map: "#/map", about: "#/about" };
    var icons = Object.keys(window.HIVE_ICONS).filter(function (k) { return ["edit", "plus", "trash", "up", "down", "copy", "share", "download", "search"].indexOf(k) < 0; })
      .map(function (k) { return '<button type="button" class="icon-pick' + ((t.icon || "file") === k ? " on" : "") + '" data-icon="' + k + '" title="' + k + '">' + icon(k) + "</button>"; }).join("");
    var body = field("Tab name (shown in the menu)", input("label", t.label, 'required maxlength="24" placeholder="e.g. ALS, Guidelines, Library Hub"'), "Keep it short — one or two words fit best on phones.") +
      '<div class="field"><span>Icon</span><div class="icon-grid">' + icons + '</div><input type="hidden" name="icon" value="' + esc(t.icon || "file") + '"></div>';
    if (t.builtin) body += '<p class="help">This is a built-in tab (' + esc(BI[t.id]) + "). You can rename it, change its icon" + (t.id === "home" ? "" : " or hide it") + ".</p>" + (t.id === "home" ? "" : toggle("visible", t.visible !== false, "Show this tab in the menu"));
    else body +=
      field("What the tab opens", '<select name="type">' + opt("page", "A new page (its own text, tiles and resources)", t.type) + opt("section", "An existing folder of tiles", t.type) + opt("link", "A website (opens in a new tab)", t.type) + "</select>") +
      '<div data-t="page">' + field("Page heading", input("title", t.title, 'maxlength="80" placeholder="Same as the tab name if empty"')) + field("Short line under the heading", input("subtitle", t.subtitle, 'maxlength="140"')) +
        field("Page text (optional)", area("body", t.body, 'rows="4" placeholder="Introduce the page. Leave a blank line between paragraphs."')) +
        field("Show something on the page (optional)", area("url_page", t.type === "page" ? t.url : "", 'rows="2" placeholder="A link or embed code — a Google Site, Slides, video, form, or one of your systems"'), "After saving, open the tab and use <b>Add a tile here</b> (editing mode) to give the page its own tiles, folders and resources.") + "</div>" +
      '<div data-t="section">' + field("Folder", '<select name="sectionId">' + sectionOptions(t.sectionId || "") + "</select>", "The tab opens this folder. Tip: hide the folder's tile on Home if it should only appear as a tab.") + "</div>" +
      '<div data-t="link">' + field("Website link", input("url_link", t.type === "link" ? t.url : "", 'placeholder="https://…"')) + "</div>" +
      toggle("visible", t.visible !== false, "Show this tab in the menu");
    modal({
      title: isNew ? "Add a menu tab" : "Edit tab: " + (t.label || ""), body: body,
      foot: (!isNew && !t.builtin ? '<button type="button" class="btn btn-danger" data-del>' + icon("trash") + " Delete tab</button>" : "") + '<span class="grow"></span><button type="button" class="btn" data-close>Cancel</button><button class="btn btn-honey" type="submit">' + (isNew ? "Add tab" : "Save tab") + "</button>",
      onMount: function (f, close) {
        function show() { if (!f.type) return; $$("[data-t]", f).forEach(function (d) { d.hidden = d.getAttribute("data-t") !== f.type.value; }); }
        if (f.type) { f.type.onchange = show; show(); }
        f.addEventListener("click", function (e) { var i = e.target.closest("[data-icon]"); if (i) { f.icon.value = i.dataset.icon; $$(".icon-pick", f).forEach(function (b) { b.classList.toggle("on", b === i); }); } });
        var del = $("[data-del]", f);
        if (del) del.onclick = function () {
          var kids = (st.data.sections || []).filter(function (x) { return x.parentId === "tab:" + t.id; });
          confirmBox("Delete this tab?", "“" + esc(t.label) + "” will be removed from the menu." + (kids.length ? " Its " + kids.length + " tile" + (kids.length > 1 ? "s move" : " moves") + " to the Home page so nothing is lost." : ""), "Delete tab").then(function (ok) {
            if (!ok) return;
            var list = H.navItems().filter(function (x) { return x.id !== t.id; });
            Promise.all(kids.map(function (k) { return API.call("admin.saveSection", { section: Object.assign({}, k, { parentId: "" }) }); })).then(function () {
              H.patch(function (d) { kids.forEach(function (k) { var x = d.sections.find(function (y) { return y.id === k.id; }); if (x) x.parentId = ""; }); });
              return saveNav(list, null, "Tab deleted.");
            }).then(function () { close(); if (location.hash.indexOf("#/t/" + t.id) === 0) location.hash = "#/"; refreshPane(); }).catch(fail);
          });
        };
      },
      onSubmit: function (f, close, btn) {
        var v = formVals(f); if (!String(v.label || "").trim()) return H.toast("Give the tab a name.", "err");
        var tab = Object.assign({}, t, { label: v.label.trim(), icon: v.icon, visible: t.id === "home" ? true : !!v.visible });
        if (!t.builtin) {
          tab.type = v.type; tab.title = v.title || ""; tab.subtitle = v.subtitle || ""; tab.body = v.type === "page" ? v.body || "" : ""; tab.sectionId = v.type === "section" ? v.sectionId || "" : "";
          if (v.type !== "page") { tab.title = ""; tab.subtitle = ""; }
          tab.url = v.type === "link" ? (v.url_link || "").trim() : v.type === "page" ? (v.url_page || "").trim() : "";
          if (tab.type === "link" && !/^https?:\/\//i.test(tab.url)) return H.toast("Paste a website link that starts with https://", "err");
          if (tab.type === "section" && !tab.sectionId) return H.toast("Choose a folder for this tab.", "err");
          if (tab.url && !H.safeUrl(H.Media.srcFromCode(tab.url))) return H.toast("That link is not allowed.", "err");
        }
        if (isNew) tab.id = "tab" + Date.now().toString(36);
        var list = H.navItems(), at = list.map(function (x) { return x.id; }).indexOf(tab.id);
        if (at >= 0) list[at] = tab; else list.push(tab);
        saveNav(list, btn, isNew ? "Tab added to the menu." : "Tab saved.").then(function () {
          close();
          if (isNew && tab.type === "page") { closePanel(); location.hash = "#/t/" + tab.id; H.toast("Tab added. Turn on editing mode and use “Add a tile here” to fill it."); }
          else refreshPane();
        }).catch(function () {});
      }
    });
  }
  function refreshPane() { if (panel && current === "menu") openPanel("menu"); }
  function sectionForm(s, isNew) {
    s = Object.assign({ kind: "section", span: "1", sort: "manual", layout: "auto" }, s);
    var tones = H.TONES.map(function (t) { return '<span class="swatch-wrap' + (s.color === t && !s.customColor ? " on" : "") + '"><button type="button" class="swatch tone-' + t + '" data-tone="' + t + '" aria-label="' + t + '"></button></span>'; }).join("");
    var icons = Object.keys(window.HIVE_ICONS).filter(function (k) { return ["edit", "plus", "trash", "up", "down", "copy", "share", "download", "external", "search"].indexOf(k) < 0; })
      .map(function (k) { return '<button type="button" class="icon-pick' + (s.icon === k ? " on" : "") + '" data-icon="' + k + '" title="' + k + '">' + icon(k) + "</button>"; }).join("");
    var m = modal({
      title: isNew ? "Add a tile" : "Edit tile",
      body: '<div class="field"><span>Kind of tile</span><div class="kind-picker">' + KINDS.map(function (k) { return '<button type="button" class="kind-opt' + (s.kind === k[0] ? " on" : "") + '" data-kind="' + k[0] + '">' + icon(k[3]) + "<b>" + k[1] + "</b><small>" + k[2] + "</small></button>"; }).join("") + '</div><input type="hidden" name="kind" value="' + esc(s.kind) + '"></div>' +
        '<div class="preview-tile" data-preview></div>' +
        field("Tile name", input("title", s.title, 'required maxlength="60" placeholder="e.g. MATATAG Resources"')) +
        field("Short description", input("subtitle", s.subtitle, 'maxlength="120" placeholder="One line that tells teachers what is inside"')) +
        '<div data-k="link">' + field("Where it goes", input("url_link", s.kind === "link" ? s.url : "", 'placeholder="https://… or pick a page below"') + '<select data-quick style="margin-top:.4rem">' + pageOptions() + "</select>", "A website opens in a new tab; a page of this site opens here.") + "</div>" +
        '<div data-k="embed video">' + field("Link or embed code", area("url_embed", (s.kind === "embed" || s.kind === "video") ? s.url : "", 'rows="3" placeholder="Paste a link (YouTube, Vimeo, Scratch, Wordwall, Genially, PhET, Canva, Google Slides…) or the &lt;iframe&gt; embed code the site gives you"'), "Teachers tap Play to start it right on the tile.") +
          field("Shape of the player", '<select name="aspect">' + ASPECTS.map(function (a) { return opt(a[0], a[1], s.body || "16:9"); }).join("") + "</select>") + '<div class="link-check" data-check></div></div>' +
        '<div data-k="text">' + field("Message", area("body_text", s.kind === "text" ? s.body : "", 'rows="4" placeholder="Write the note here. Leave a blank line between paragraphs."')) + field("Button link (optional)", input("url_text", s.kind === "text" ? s.url : "", 'placeholder="https://…"')) + "</div>" +
        '<div data-k="image">' + field("Link when tapped (optional)", input("url_image", s.kind === "image" ? s.url : "", 'placeholder="https://… or #/about"')) + "</div>" +
        '<div data-k="widget">' + field("Widget", '<select name="widget">' + [["clock", "Clock and date"], ["visitors", "Visitor count"], ["news", "Latest news headlines (not shown on Home)"], ["events", "Upcoming events (not shown on Home)"], ["map", "Library map summary"], ["facebook", "Facebook page feed"], ["search", "Search button"], ["assistant", "Ask the assistant"], ["about", "Meet the team"]].map(function (w) { return opt(w[0], w[1], s.kind === "widget" ? s.url : "clock"); }).join("") + "</select>") + "</div>" +
        '<div class="grid2">' + field("Place this tile in", '<select name="parentId">' + opt("", "Home page", s.parentId || "") + tabPlaceOptions(s.parentId || "", s.id) + sectionOptions(s.parentId || "", s.id) + "</select>") +
          field("Group (heading it appears under)", '<select name="group">' + groupOptions(s.group || "") + "</select>") + "</div>" +
        field("Tile size", '<select name="span">' + opt("1", "Normal", s.span) + opt("2", "Wide (2 columns)", s.span) + opt("3", "Full width", s.span) + opt("tall", "Tall", s.span) + opt("big", "Big (2×2)", s.span) + "</select>") +
        '<div class="field"><span>Color</span><div class="swatches">' + tones + '</div><div class="color-row"><label class="toggle" style="min-height:0"><input type="checkbox" data-usecustom' + (s.customColor ? " checked" : "") + '> Use my own color</label><input type="color" name="customColor" value="' + esc(s.customColor || "#13857F") + '"></div><input type="hidden" name="color" value="' + esc(s.color || "honey") + '"></div>' +
        '<div class="field"><span>Icon</span><div class="icon-grid">' + icons + '</div><input type="hidden" name="icon" value="' + esc(s.icon || "folder") + '"></div>' +
        imagePick("bgImage", s.bgImage, "Background picture (optional)", "For Picture tiles this is the picture. For others it sits behind the text.") +
        '<div data-k="section"><div class="grid2">' + field("How items are shown", '<select name="layout">' + opt("auto", "Automatic", s.layout) + opt("list", "List (big rows)", s.layout) + opt("compact", "Compact list (small rows)", s.layout) + opt("shelf", "Bookshelf (covers)", s.layout) + opt("apps", "App launcher (systems & tools)", s.layout) + "</select>") +
          field("Sort the resources inside", '<select name="sort">' + opt("manual", "My own order (drag to arrange)", s.sort) + opt("az", "A to Z", s.sort) + opt("za", "Z to A", s.sort) + opt("newest", "Newest first", s.sort) + opt("views", "Most opened first", s.sort) + opt("grade", "By grade and quarter", s.sort) + "</select>") + "</div></div>" +
        '<div class="grid2">' + field("Position", input("order", s.order || "", 'type="number" min="1"'), "Or drag tiles on the page to arrange.") + '<div class="field"><span>&nbsp;</span>' + toggle("visible", notFalse(s.visible), "Show this tile to teachers") + "</div></div>",
      foot: (isNew ? "" : '<button type="button" class="btn btn-danger" data-del>' + icon("trash") + " Delete</button>") + '<span class="grow"></span><button type="button" class="btn" data-close>Cancel</button><button class="btn btn-honey" type="submit">' + (isNew ? "Add tile" : "Save tile") + "</button>",
      onMount: function (f) {
        function vals() {
          var v = formVals(f), useC = $("[data-usecustom]", f).checked;
          return { kind: v.kind, title: v.title, subtitle: v.subtitle, icon: v.icon, color: v.color, customColor: useC ? v.customColor : "", span: v.span,
            bgImage: v.bgImage__data || v.bgImage, url: v.kind === "link" ? v.url_link : v.kind === "embed" || v.kind === "video" ? v.url_embed : v.kind === "text" ? v.url_text : v.kind === "image" ? v.url_image : v.kind === "widget" ? v.widget : "",
            body: v.kind === "text" ? v.body_text : v.kind === "embed" || v.kind === "video" ? v.aspect : "" };
        }
        function show() {
          var k = f.kind.value;
          $$("[data-k]", f).forEach(function (el) { el.hidden = el.dataset.k.split(" ").indexOf(k) < 0; });
          var v = vals(), c = $("[data-check]", f);
          if (c) { var d = describeLink(v.url); c.className = "link-check " + d.cls; c.textContent = (k === "embed" || k === "video") ? d.text : ""; }
          var t = Object.assign({}, s, v, { id: s.id || "preview", visible: true });
          var html = window.Hive.tilePreview ? window.Hive.tilePreview(t) : "";
          $("[data-preview]", f).innerHTML = '<ul class="tiles">' + html + "</ul>";
        }
        f.addEventListener("input", show); f.addEventListener("change", show);
        f.addEventListener("click", function (e) {
          var kd = e.target.closest("[data-kind]"); if (kd) {
            var kIcon = { section: "folder", link: "link", embed: "game", video: "video", text: "note", image: "image", widget: "spark" };
            if (!f.icon.value || f.icon.value === kIcon[f.kind.value] || f.icon.value === "folder") { f.icon.value = kIcon[kd.dataset.kind]; $$(".icon-pick", f).forEach(function (b) { b.classList.toggle("on", b.dataset.icon === f.icon.value); }); }
            f.kind.value = kd.dataset.kind; $$(".kind-opt", f).forEach(function (b) { b.classList.toggle("on", b === kd); }); if (kd.dataset.kind === "embed" && f.span.value === "1") f.span.value = "2"; show(); }
          var t = e.target.closest("[data-tone]"); if (t) { f.color.value = t.dataset.tone; $("[data-usecustom]", f).checked = false; $$(".swatch-wrap", f).forEach(function (w) { w.classList.toggle("on", w.contains(t)); }); show(); }
          var i = e.target.closest("[data-icon]"); if (i) { f.icon.value = i.dataset.icon; $$(".icon-pick", f).forEach(function (b) { b.classList.toggle("on", b === i); }); show(); }
        });
        f.customColor.addEventListener("input", function () { $("[data-usecustom]", f).checked = true; $$(".swatch-wrap", f).forEach(function (w) { w.classList.remove("on"); }); show(); });
        $("[data-quick]", f).addEventListener("change", function (e) { if (e.target.value) { f.url_link.value = e.target.value; show(); } });
        f.group.addEventListener("change", function () {
          if (f.group.value !== "__new") return;
          var name = (window.prompt ? prompt("Name of the new group (a heading on the page):", "") : "") || "";
          if (!name.trim()) { f.group.value = s.group || ""; return; }
          var g = { id: "g" + Date.now().toString(36), name: name.trim() };
          var groups = (st.settings.groups || []).concat([g]);
          saveSettings({ groups: groups }, null, "Group “" + g.name + "” added.").then(function () { f.group.innerHTML = groupOptions(g.id); });
        });
        bindImagePick(f, show, 1400);
        var del = $("[data-del]", f);
        if (del) del.onclick = function () {
          var n = st.count[s.id] || 0;
          confirmBox("Delete “" + s.title + "”?", "This also deletes every tile and resource inside it (" + n + " items). This cannot be undone.").then(function (ok) {
            if (!ok) return;
            API.call("admin.deleteSection", { id: s.id }).then(function () {
              m.close(); H.toast("Tile deleted.");
              H.patch(function (d) {
                var kill = [s.id], ch = true;
                while (ch) { ch = false; d.sections.forEach(function (x) { if (kill.indexOf(x.parentId) >= 0 && kill.indexOf(x.id) < 0) { kill.push(x.id); ch = true; } }); }
                d.sections = d.sections.filter(function (x) { return kill.indexOf(x.id) < 0; });
                d.resources = d.resources.filter(function (x) { return kill.indexOf(x.sectionId) < 0; });
              });
              if (location.hash.indexOf(s.id) >= 0) location.hash = s.parentId ? "#/s/" + s.parentId : "#/";
              refreshPanel();
            }).catch(fail);
          });
        };
        show();
      },
      onSubmit: function (f, close, btn) {
        var v = formVals(f);
        if (!v.title) { H.toast("Please give the tile a name.", "err"); f.title.focus(); return; }
        if (v.group === "__new") v.group = "";
        var useC = $("[data-usecustom]", f).checked;
        var sec = Object.assign({}, isNew ? {} : s, {
          kind: v.kind, title: v.title, subtitle: v.subtitle, parentId: v.parentId, group: v.group, span: v.span, icon: v.icon, color: v.color,
          customColor: useC ? v.customColor : "", bgImage: imgVal(v, "bgImage"), layout: v.layout, sort: v.sort, visible: v.visible, order: v.order,
          url: v.kind === "link" ? v.url_link : v.kind === "embed" || v.kind === "video" ? H.Media.srcFromCode(v.url_embed) : v.kind === "text" ? v.url_text : v.kind === "image" ? v.url_image : v.kind === "widget" ? v.widget : "",
          body: v.kind === "text" ? v.body_text : v.kind === "embed" || v.kind === "video" ? v.aspect : ""
        });
        if (!sec.order) sec.order = sortedKids(sec.parentId).length + 1;
        sec.order = +sec.order;
        busy(btn, true);
        API.call("admin.saveSection", { section: sec }).then(function (j) {
          close(); H.toast(isNew ? "Tile added." : "Tile saved.");
          H.patch(function (d) { var i = d.sections.findIndex(function (x) { return x.id === j.section.id; }); if (i < 0) d.sections.push(j.section); else d.sections[i] = j.section; });
          refreshPanel();
        }).catch(function (e) { busy(btn, false); fail(e); });
      }
    });
  }

  /* ---------------- resource editor ---------------- */
  /** plain words for a link check result */
  function linkWord(status, embed) {
    var w = { ok: "Opens for everyone", private: "Not shared — teachers cannot open it. In Drive set Share › Anyone with the link", "domain-only": "Shared only inside the DepEd domain — teachers must be signed in to their DepEd account", "not-found": "Not found, or the script owner cannot open it", "login-needed": "Asks for a sign-in", error: "The site did not answer" }[status] || (status ? "Problem (" + status + ")" : "Not checked yet");
    if (status === "ok" && embed === "no") w += ", but it cannot be shown inside LRMS-HIVE — it will open in a new tab";
    else if (status === "ok" && embed === "yes") w += " and can be shown inside LRMS-HIVE";
    return w;
  }
  function checkLinks(list) {
    var items = list.map(function (it) { var d = H.Links.isDrive(it.url) ? H.Links.id(it.url) : ""; return { id: it.id, url: it.url, drive: d, checkEmbed: !d }; });
    return API.call("admin.checkLinks", { items: items, origin: location.origin }).then(function (j) { return j.results || []; });
  }
  function resourceForm(r, isNew) {
    var types = Object.keys(H.TYPES).map(function (k) { return opt(k, H.TYPES[k].label, r.type || "link"); }).join("");
    var m = modal({
      title: isNew ? "Add a resource" : "Edit resource",
      body: field("Title", input("title", r.title, 'required maxlength="140" placeholder="e.g. Grade 5 Science Q1 Lesson Exemplar"')) +
        '<div class="grid2">' + field("Put it in", '<select name="sectionId" required>' + sectionOptions(r.sectionId) + "</select>") +
        field("Kind of resource", '<select name="type">' + types + "</select>") + "</div>" +
        field("Link or embed code", area("url", r.url, 'rows="2" placeholder="https://drive.google.com/file/d/… — or a YouTube/Vimeo/Scratch/Wordwall link — or paste an &lt;iframe&gt; embed code"')) +
        '<div class="link-check" data-check></div>' +
        '<div class="add-row" style="margin:.2rem 0 0;align-items:center"><button type="button" class="btn btn-sm" data-testlink>' + icon("check") + ' Test this link</button><span class="help" data-testout>' + (r.linkStatus ? "Last check: " + esc(linkWord(r.linkStatus, r.embedOk)) : "Checks that the link opens for teachers and whether it can be shown inside LRMS-HIVE.") + "</span></div>" +
        '<p class="help" data-gashint hidden>This is an Apps Script web app. To show it inside LRMS-HIVE, its <code>doGet</code> must return <code>HtmlService…setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)</code> and be deployed with access “Anyone”. Otherwise choose “Open directly in a new tab”.</p>' +
        '<div class="drop"><p class="help">…or upload a file to the LRMS Drive storage folder (up to 25 MB)</p><input type="file" data-file hidden><button type="button" class="btn btn-sm" data-pick>' + icon("download", "rot180") + " Choose a file to upload</button></div>" +
        '<div class="grid2">' + field("How teachers see it", '<select name="display">' + opt("auto", "Automatic (recommended)", r.display || "auto") + opt("viewer", "Open in the viewer", r.display) + opt("inline", "Show on the page — play/use it right there", r.display) + opt("flipbook", "Flipbook (for storybook PDFs)", r.display) + opt("newtab", "Open directly in a new tab (systems with logins)", r.display) + "</select>", "<b>Show on the page</b> places the game, video or website inside the section. <b>Open directly</b> is best for your own systems that need sign-in, camera or downloads.") +
          field("Shape of the player", '<select name="aspect">' + ASPECTS.map(function (a) { return opt(a[0], a[1], r.aspect || "16:9"); }).join("") + "</select>") + "</div>" +
        field("Short description", area("description", r.description, 'rows="2" maxlength="400" placeholder="What is it and who is it for?"')) +
        '<div class="field" data-bodyfield' + (r.type === "note" ? "" : " hidden") + '><span>Page text (for “Page” type)</span>' + area("body", r.body, 'rows="8" placeholder="Write the text here. Leave a blank line between paragraphs. A short first line becomes a heading."') + "</div>" +
        '<div class="grid2">' + field("Grade level", input("grade", r.grade, 'list="dl-grades" placeholder="e.g. Grade 7"')) + field("Subject / learning area", input("subject", r.subject, 'list="dl-subjects" placeholder="e.g. Science"')) + "</div>" +
        '<div class="grid2">' + field("Quarter", '<select name="quarter">' + opt("", "—", r.quarter) + opt("Q1", "Quarter 1", r.quarter) + opt("Q2", "Quarter 2", r.quarter) + opt("Q3", "Quarter 3", r.quarter) + opt("Q4", "Quarter 4", r.quarter) + "</select>") +
        field("Author / developer", input("author", r.author, 'placeholder="Optional"')) + "</div>" +
        field("Search words (tags)", input("tags", r.tags, 'placeholder="e.g. lesson exemplar, plants, photosynthesis"'), "Words teachers might type when searching. Separate with commas.") +
        imagePick("thumbnail", r.thumbnail, "Cover or thumbnail picture (optional)", "Used for book covers and the Play screen of games and videos.") +
        '<div class="grid2">' + toggle("featured", truthy(r.featured), "Feature on the home page") + toggle("visible", notFalse(r.visible), "Show to teachers") + "</div>" +
        dl("dl-grades", GRADES) + dl("dl-subjects", SUBJECTS),
      foot: (isNew ? "" : '<button type="button" class="btn btn-danger" data-del>' + icon("trash") + " Delete</button>") + '<span class="grow"></span><button type="button" class="btn" data-close>Cancel</button><button class="btn btn-honey" type="submit">' + (isNew ? "Add resource" : "Save resource") + "</button>",
      onMount: function (f) {
        var typed = !isNew;
        function check() {
          var url = f.url.value.trim(), d = describeLink(url), c = $("[data-check]", f);
          if (f.type.value === "book" && (/\.pdf/i.test(url) || (H.Links.isDrive(url) && !H.Links.isFolder(url))) && f.display.value === "auto") d = { cls: "ok", text: "Storybook — it will open as a flipbook (pages turn like a real book). " + d.text };
          c.className = "link-check " + d.cls; c.textContent = d.text;
          if (!typed) { var g = guessType(url); if (g) f.type.value = g; }
          $("[data-bodyfield]", f).hidden = f.type.value !== "note";
          $("[data-gashint]", f).hidden = !/script\.google(usercontent)?\.com\/(a\/[^/]+\/)?macros\//.test(url);
        }
        $("[data-testlink]", f).onclick = function (e) {
          var url = H.Media.srcFromCode(f.url.value.trim()), out = $("[data-testout]", f);
          if (!/^https?:\/\//i.test(url)) { out.textContent = "Paste a full link that starts with https:// first."; return; }
          if (API.demo) { out.textContent = "Demo mode: link tests run once the site is connected to your Apps Script backend."; return; }
          busy(e.currentTarget, true); out.textContent = "Checking…";
          var btn = e.currentTarget;
          checkLinks([{ id: r.id || "", url: url }]).then(function (res) {
            busy(btn, false); var x = res[0] || {};
            out.textContent = linkWord(x.status, x.embed);
            if (x.embed === "no" && f.display.value !== "newtab") out.textContent += " — tip: choose “Open directly in a new tab”.";
          }).catch(function (er) { busy(btn, false); out.textContent = "Could not check: " + (er && er.message || er); });
        };
        f.url.addEventListener("input", check); f.display.addEventListener("change", check);
        f.type.addEventListener("change", function () { typed = true; check(); });
        $("[data-pick]", f).onclick = function () { $("[data-file]", f).click(); };
        $("[data-file]", f).onchange = function (e) {
          var file = e.target.files[0]; if (!file) return;
          uploadFile(file, $("[data-pick]", f)).then(function (j) {
            f.url.value = j.url; if (!f.title.value) f.title.value = file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ");
            var g = guessType(j.url, file.type); if (g) f.type.value = g;
            check(); H.toast("Uploaded to Drive and linked.");
          }).catch(fail);
        };
        bindImagePick(f, null, 900);
        var del = $("[data-del]", f);
        if (del) del.onclick = function () {
          confirmBox("Delete “" + r.title + "”?", "Teachers will no longer see it. The file in Google Drive is not deleted.").then(function (ok) {
            if (!ok) return;
            API.call("admin.deleteResource", { id: r.id }).then(function () {
              m.close(); H.toast("Resource deleted.");
              if (!$("#viewer").hidden) location.hash = "#/s/" + r.sectionId;
              H.patch(function (d) { d.resources = d.resources.filter(function (x) { return x.id !== r.id; }); });
              refreshPanel();
            }).catch(fail);
          });
        };
        check();
      },
      onSubmit: function (f, close, btn) {
        var v = formVals(f);
        if (!v.title) { H.toast("Please give the resource a title.", "err"); f.title.focus(); return; }
        if (!v.sectionId) { H.toast("Choose where to put it.", "err"); return; }
        v.url = H.Media.srcFromCode(v.url);
        v.thumbnail = imgVal(v, "thumbnail");
        var res = Object.assign({}, isNew ? {} : r, v, { sample: false, embed: "" });
        if (isNew || v.url !== r.url) { res.embedOk = ""; res.linkStatus = ""; res.linkChecked = ""; }
        if (isNew) res.order = ((st.res[v.sectionId] || []).length + 1);
        busy(btn, true);
        var prep = /1drv\.ms\//i.test(res.url) && !API.demo
          ? API.call("admin.resolveLink", { url: res.url }).then(function (j) { res.embed = H.MS.embed(j.url) || ""; if (!res.embed) H.toast("Saved. This OneDrive link could not be previewed inside the site — teachers will get an Open button."); }, function () { return null; })
          : Promise.resolve();
        prep.then(function () { return API.call("admin.saveResource", { resource: res }); }).then(function (j) {
          close(); H.toast(isNew ? "Resource added." : "Resource saved.");
          H.patch(function (d) { var i = d.resources.findIndex(function (x) { return x.id === j.resource.id; }); if (i < 0) d.resources.push(j.resource); else d.resources[i] = j.resource; });
          refreshPanel();
        }).catch(function (e) { busy(btn, false); fail(e); });
      }
    });
  }

  /* ---------------- import from Drive folder ---------------- */
  function importForm(sectionId) {
    var files = [];
    var m = modal({
      title: "Import from a Google Drive folder",
      body: '<p class="help">Paste a folder link. Every file inside becomes a resource in one step. Files keep living in Drive — only links are saved.</p>' +
        field("Folder link", input("folder", "", 'type="url" placeholder="https://drive.google.com/drive/folders/…"')) +
        field("Put them in", '<select name="sectionId">' + sectionOptions(sectionId) + "</select>") +
        '<div class="grid2">' + field("Grade level for all (optional)", input("grade", "", 'list="dl-grades2"')) + field("Subject for all (optional)", input("subject", "", 'list="dl-subjects2"')) + "</div>" +
        dl("dl-grades2", GRADES) + dl("dl-subjects2", SUBJECTS) +
        '<button type="button" class="btn" data-list>' + icon("drive") + " List files in this folder</button><div class=import-list data-files></div>",
      foot: '<span class="grow"></span><button type="button" class="btn" data-close>Cancel</button><button class="btn btn-honey" type="submit" disabled data-go>Import selected</button>',
      onMount: function (f) {
        $("[data-list]", f).onclick = function (e) {
          var b = e.currentTarget; busy(b, true, "Reading folder…");
          API.call("admin.listDrive", { folderUrl: f.folder.value.trim() }, 60000).then(function (j) {
            busy(b, false); files = j.files || [];
            $("[data-files]", f).innerHTML = files.length ? files.map(function (x, i) { return '<label><input type="checkbox" data-i="' + i + '" checked> ' + icon((H.TYPES[guessType(x.url, x.mimeType)] || H.TYPES.link).icon) + " " + esc(x.name) + "</label>"; }).join("") : "<p class=help>This folder is empty.</p>";
            $("[data-go]", f).disabled = !files.length;
          }).catch(function (err) { busy(b, false); fail(err); });
        };
      },
      onSubmit: function (f, close, btn) {
        var v = formVals(f), base = (st.res[v.sectionId] || []).length;
        var pick = $$("[data-i]", f).filter(function (c) { return c.checked; }).map(function (c) { return files[+c.dataset.i]; });
        var list = pick.map(function (x, i) {
          return { title: x.name.replace(/\.[^.]+$/, "").replace(/[_]+/g, " "), sectionId: v.sectionId, url: x.url, type: guessType(x.url, x.mimeType) || "link", grade: v.grade, subject: v.subject, visible: true, featured: false, order: base + i + 1, description: "", tags: "" };
        });
        busy(btn, true, "Importing " + list.length + "…");
        API.call("admin.saveResources", { resources: list }, 90000).then(function () {
          close(); H.toast(list.length + " resources imported."); H.refresh(true).catch(function () {}); refreshPanel();
        }).catch(function (e) { busy(btn, false); fail(e); });
      }
    });
  }

  /* ---------------- news editor ---------------- */
  var NEWS_TAGS = ["Activity", "Training", "Announcement", "Award", "Memo", "Partnership", "Feature"];
  function today() { var d = new Date(Date.now() + 8 * 3600000); return d.toISOString().slice(0, 10); }
  function newsForm(n, isNew) {
    var imgs = (Array.isArray(n.images) ? n.images : []).slice();
    var m = modal({
      title: isNew ? "Add news" : "Edit news",
      body: field("Headline", input("title", n.title, 'required maxlength="160" placeholder="e.g. LRMS conducts storybook writing workshop"')) +
        '<div class="grid2">' + field("Date", input("date", String(n.date || today()).slice(0, 10), 'type="date"')) + field("Category", input("tag", n.tag || "Activity", 'list="dl-ntags"')) + "</div>" + dl("dl-ntags", NEWS_TAGS) +
        field("Story", area("body", n.body, 'rows="6" placeholder="What happened, when, where and who took part. Leave a blank line between paragraphs."')) +
        '<div class="field"><span>Photos</span><div class="thumbs" data-thumbs></div>' +
        '<div class="add-row" style="margin:.4rem 0 0"><input type="file" accept="image/*" multiple data-nfiles hidden><button type="button" class="btn btn-honey btn-sm" data-npick>' + icon("image") + ' Upload photos</button></div>' +
        '<small>You can pick many photos at once. They are resized automatically. Drag to reorder; the first photo is the cover.</small>' +
        field("…or paste photo links (one per line)", area("imgLinks", "", 'rows="2" placeholder="https://drive.google.com/file/d/… (shared to Anyone with the link)"')) + "</div>" +
        field("Facebook post link (optional)", input("fbUrl", n.fbUrl, 'placeholder="https://www.facebook.com/…/posts/… or a Facebook video link"'), "The post appears inside the news item. The post must be Public on Facebook.") +
        '<div class="grid2">' + field("Button link (optional)", input("linkUrl", n.linkUrl, 'placeholder="https://… or #/s/… for a page of this site"')) + field("Button text", input("linkText", n.linkText || "", 'placeholder="e.g. Read the memo"')) + "</div>" +
        '<div class="grid2">' + toggle("pinned", truthy(n.pinned), "Pin to the top") + toggle("visible", notFalse(n.visible), "Show on the site") + "</div>",
      foot: (isNew ? "" : '<button type="button" class="btn btn-danger" data-del>' + icon("trash") + " Delete</button>") + '<span class="grow"></span><button type="button" class="btn" data-close>Cancel</button><button class="btn btn-honey" type="submit">' + (isNew ? "Publish news" : "Save news") + "</button>",
      onMount: function (f) {
        function draw() {
          $("[data-thumbs]", f).innerHTML = imgs.map(function (u, i) {
            return '<span class="thumb" data-id="' + i + '"><img src="' + esc(/^data:/.test(u) ? u : H.Links.image(u, 300)) + '" alt=""><button type="button" class="drag-handle" data-drag aria-label="Drag">' + icon("apps") + '</button><button type="button" class="thumb-x" data-rmi="' + i + '" aria-label="Remove photo">×</button>' + (i === 0 ? '<b class="thumb-cover">Cover</b>' : "") + "</span>";
          }).join("") || '<p class="help">No photos yet.</p>';
        }
        sortable($("[data-thumbs]", f), ".thumb", true, function (ids) { imgs = ids.map(function (i) { return imgs[+i]; }); draw(); });
        draw();
        f.addEventListener("click", function (e) {
          var b = e.target.closest("[data-rmi]"); if (b) { imgs.splice(+b.dataset.rmi, 1); draw(); }
          if (e.target.closest("[data-npick]")) $("[data-nfiles]", f).click();
        });
        $("[data-nfiles]", f).onchange = function (e) {
          var files = Array.prototype.slice.call(e.target.files || []); e.target.value = "";
          var btn = $("[data-npick]", f), done = 0;
          busy(btn, true, "Adding photos…");
          files.reduce(function (p, file) {
            return p.then(function () {
              return shrinkImage(file, API.demo ? 1000 : 1600, "image/jpeg").then(function (small) {
                if (API.demo) { imgs.push(small.dataUrl); return; }
                return fileToBase64(small.file).then(function (b64) { return API.call("admin.upload", { name: small.file.name, mimeType: "image/jpeg", data: b64 }, 120000); }).then(function (j) { imgs.push(j.url); });
              }).then(function () { done++; btn.innerHTML = icon("hex", "spin") + " " + done + " of " + files.length + "…"; draw(); });
            });
          }, Promise.resolve()).then(function () { busy(btn, false); H.toast(done + " photo" + (done === 1 ? "" : "s") + " added."); }, function (err) { busy(btn, false); fail(err); });
        };
        var del = $("[data-del]", f);
        if (del) del.onclick = function () {
          confirmBox("Delete this news item?", esc(n.title)).then(function (ok) {
            if (!ok) return;
            API.call("admin.deleteNews", { id: n.id }).then(function () {
              m.close(); H.toast("News deleted.");
              H.patch(function (d) { d.news = (d.news || []).filter(function (x) { return x.id !== n.id; }); });
              if (/^#\/news\//.test(location.hash)) location.hash = "#/news";
              refreshPanel();
            }).catch(fail);
          });
        };
      },
      onSubmit: function (f, close, btn) {
        var v = formVals(f);
        if (!v.title) { H.toast("Write a headline.", "err"); f.title.focus(); return; }
        String(v.imgLinks || "").split(/\s+/).filter(function (u) { return /^https?:\/\//.test(u); }).forEach(function (u) { imgs.push(u); });
        delete v.imgLinks;
        var item = Object.assign({}, isNew ? {} : n, v, { images: imgs });
        busy(btn, true, "Publishing…");
        API.call("admin.saveNews", { news: item }, 60000).then(function (j) {
          close(); H.toast(isNew ? "News published." : "News saved.");
          var saved = j.news; if (!Array.isArray(saved.images)) saved.images = imgs;
          H.patch(function (d) { d.news = d.news || []; var i = d.news.findIndex(function (x) { return x.id === saved.id; }); if (i < 0) d.news.push(saved); else d.news[i] = saved; });
          refreshPanel();
        }).catch(function (e) { busy(btn, false); fail(e); });
      }
    });
  }

  /* ---------------- event editor ---------------- */
  var EV_CATS = ["Training", "Writeshop", "Deadline", "Catch-Up Friday", "Meeting", "Activity", "Holiday"];
  function eventForm(e, isNew) {
    var m = modal({
      title: isNew ? "Add an event" : "Edit event",
      body: field("Event name", input("title", e.title, 'required maxlength="160" placeholder="e.g. Division Storybook Writeshop"')) +
        '<div class="grid2">' + field("Kind of event", input("category", e.category || "Training", 'list="dl-evcat"'), "Deadlines are highlighted in red and appear in the reminder bar.") + field("Place", input("location", e.location, 'placeholder="e.g. SDO Conference Hall, or Online"')) + "</div>" + dl("dl-evcat", EV_CATS) +
        '<div class="grid2">' + field("Starts on", input("startDate", String(e.startDate || today()).slice(0, 10), 'type="date" required')) + field("Ends on (for events of several days)", input("endDate", String(e.endDate || "").slice(0, 10), 'type="date"')) + "</div>" +
        toggle("allDay", truthy(e.allDay) || (!e.startTime && isNew), "Whole day (no specific time)") +
        '<div class="grid2" data-times>' + field("Start time", input("startTime", e.startTime, 'type="time"')) + field("End time", input("endTime", e.endTime, 'type="time"')) + "</div>" +
        '<div class="grid2">' + field("Repeats", '<select name="repeat">' + opt("", "Does not repeat", e.repeat || "") + opt("weekly", "Every week (e.g. Catch-Up Fridays)", e.repeat || "") + "</select>") + '<div data-until>' + field("Repeat until", input("repeatUntil", String(e.repeatUntil || "").slice(0, 10), 'type="date"')) + "</div></div>" +
        field("Details", area("description", e.description, 'rows="4" placeholder="Who should attend, what to bring, reminders…"')) +
        '<div class="panel-sub"><h4>Attached memo</h4>' +
        field("Memo link (Google Drive, OneDrive or any PDF link)", input("memoUrl", e.memoUrl, 'placeholder="https://drive.google.com/file/d/…"')) +
        '<div class="add-row" style="margin:0"><input type="file" accept=".pdf,.doc,.docx,image/*" data-memofile hidden><button type="button" class="btn btn-sm" data-memopick>' + icon("memo") + " Upload the memo file</button></div>" +
        field("Memo title", input("memoTitle", e.memoTitle, 'placeholder="e.g. Division Memorandum No. 123, s. 2026"')) + "</div>" +
        '<div class="grid2">' + field("Extra button link (optional)", input("linkUrl", e.linkUrl, 'placeholder="Registration form, meeting link, or #/s/…"')) + field("Button text", input("linkText", e.linkText, 'placeholder="e.g. Register here"')) + "</div>" +
        toggle("visible", notFalse(e.visible), "Show on the calendar"),
      foot: (isNew ? "" : '<button type="button" class="btn btn-danger" data-del>' + icon("trash") + " Delete</button>") + '<span class="grow"></span><button type="button" class="btn" data-close>Cancel</button><button class="btn btn-honey" type="submit">' + (isNew ? "Add event" : "Save event") + "</button>",
      onMount: function (f) {
        function sync() { $("[data-times]", f).hidden = f.allDay.checked; $("[data-until]", f).hidden = f.repeat.value !== "weekly"; }
        f.addEventListener("change", sync); sync();
        $("[data-memopick]", f).onclick = function () { $("[data-memofile]", f).click(); };
        $("[data-memofile]", f).onchange = function (ev) {
          var file = ev.target.files[0]; if (!file) return;
          uploadFile(file, $("[data-memopick]", f)).then(function (j) { f.memoUrl.value = j.url; if (!f.memoTitle.value) f.memoTitle.value = file.name.replace(/\.[^.]+$/, "").replace(/[_]+/g, " "); H.toast("Memo uploaded and attached."); }).catch(fail);
        };
        var del = $("[data-del]", f);
        if (del) del.onclick = function () {
          confirmBox("Delete this event?", esc(e.title)).then(function (ok) {
            if (!ok) return;
            API.call("admin.deleteEvent", { id: e.id }).then(function () { m.close(); H.toast("Event deleted."); $$(".modal-backdrop").forEach(function (x) { x.remove(); }); H.patch(function (d) { d.events = (d.events || []).filter(function (x) { return x.id !== e.id; }); }); refreshPanel(); }).catch(fail);
          });
        };
      },
      onSubmit: function (f, close, btn) {
        var v = formVals(f);
        if (!v.title || !v.startDate) { H.toast("Give the event a name and a start date.", "err"); return; }
        if (v.endDate && v.endDate < v.startDate) { H.toast("The end date is before the start date.", "err"); return; }
        if (v.allDay) { v.startTime = ""; v.endTime = ""; }
        if (v.repeat !== "weekly") v.repeatUntil = "";
        var item = Object.assign({}, isNew ? {} : e, v);
        busy(btn, true);
        API.call("admin.saveEvent", { event: item }).then(function (j) {
          close(); $$(".modal-backdrop").forEach(function (x) { x.remove(); }); H.toast(isNew ? "Event added." : "Event saved.");
          H.patch(function (d) { d.events = d.events || []; var i = d.events.findIndex(function (x) { return x.id === j.event.id; }); if (i < 0) d.events.push(j.event); else d.events[i] = j.event; });
          refreshPanel();
        }).catch(function (er) { busy(btn, false); fail(er); });
      }
    });
  }

  /* ---------------- Library map: schools, districts, bulk input ---------------- */
  var LEVELS = ["Elementary", "Secondary", "Integrated", "Senior High", "ALS Community Learning Center", "Other"];
  /** reads "9.04, 125.54", a Google Maps link, or degrees-minutes-seconds */
  function parseCoords(t) {
    t = String(t || "").trim(); if (!t) return null;
    var m = t.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) || t.match(/[?&](?:q|query|ll|destination)=(-?\d+\.\d+),\s*(-?\d+\.\d+)/) || t.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
    if (m) return { lat: +m[1], lng: +m[2] };
    var dms = t.match(/(\d+)[°\s]+(\d+)['′\s]+([\d.]+)["″]?\s*([NS])[,\s]+(\d+)[°\s]+(\d+)['′\s]+([\d.]+)["″]?\s*([EW])/i);
    if (dms) {
      var la = +dms[1] + dms[2] / 60 + dms[3] / 3600, ln = +dms[5] + dms[6] / 60 + dms[7] / 3600;
      return { lat: /S/i.test(dms[4]) ? -la : la, lng: /W/i.test(dms[8]) ? -ln : ln };
    }
    m = t.match(/(-?\d{1,2}\.\d+)\s*[,;\s]\s*(-?\d{1,3}\.\d+)/);
    return m ? { lat: +m[1], lng: +m[2] } : null;
  }
  function coordWarn(lat, lng) {
    if (lat == null || lng == null || isNaN(lat) || isNaN(lng)) return "No location yet — it will not appear on the map.";
    if (lat < 4 || lat > 22 || lng < 115 || lng > 128) return "This point is outside the Philippines. Check that latitude and longitude are not swapped.";
    return "";
  }
  function districtNames() { return (st.data.districts || []).map(function (d) { return d.name; }); }
  function locBlock(lat, lng) {
    return '<div class="panel-sub"><h4>Location</h4>' +
      field("Paste coordinates or a Google Maps link", input("coords", lat != null && lat !== "" ? lat + ", " + lng : "", 'placeholder="e.g. 9.0453, 125.5432  — or paste a Google Maps link"'), "Tip: in Google Maps, long-press (phone) or right-click (computer) on the school, then tap the numbers to copy them.") +
      '<div class="grid2">' + field("Latitude", input("lat", lat, 'inputmode="decimal" placeholder="9.0453"')) + field("Longitude", input("lng", lng, 'inputmode="decimal" placeholder="125.5432"')) + "</div>" +
      '<p class="link-check" data-cwarn hidden></p>' +
      '<div class="add-row" style="margin:0"><button type="button" class="btn btn-sm" data-here>' + icon("pin") + ' Use my current location</button><span class="help">…or tap the map below to drop a pin. Drag the pin to adjust.</span></div>' +
      '<div class="picker-map" data-picker></div></div>';
  }
  function bindLoc(f) {
    var pk = null;
    function warn() { var w = coordWarn(parseFloat(f.lat.value), parseFloat(f.lng.value)), el = $("[data-cwarn]", f); el.hidden = !w; el.className = "link-check warn"; el.textContent = w; }
    function setLL(lat, lng, fromPicker) {
      f.lat.value = (+lat).toFixed(6); f.lng.value = (+lng).toFixed(6); f.coords.value = f.lat.value + ", " + f.lng.value; warn();
      if (pk && !fromPicker) pk.set(lat, lng);
    }
    f.coords.addEventListener("input", function () { var c = parseCoords(f.coords.value); if (c) setLL(c.lat, c.lng); });
    f.lat.addEventListener("change", function () { if (f.lat.value && f.lng.value) setLL(f.lat.value, f.lng.value); });
    f.lng.addEventListener("change", function () { if (f.lat.value && f.lng.value) setLL(f.lat.value, f.lng.value); });
    $("[data-here]", f).onclick = function (e) {
      if (!navigator.geolocation) { H.toast("This device cannot share its location.", "err"); return; }
      var b = e.currentTarget; busy(b, true, "Finding you…");
      navigator.geolocation.getCurrentPosition(function (p) { busy(b, false); setLL(p.coords.latitude, p.coords.longitude); H.toast("Location set (accuracy about " + Math.round(p.coords.accuracy) + " m)."); },
        function (er) { busy(b, false); H.toast("Could not get your location: " + er.message, "err"); }, { enableHighAccuracy: true, timeout: 15000 });
    };
    if (window.HiveMap) window.HiveMap.picker($("[data-picker]", f), f.lat.value, f.lng.value, function (ll) { setLL(ll.lat, ll.lng, true); }).then(function (p) { pk = p; }).catch(function (er) { $("[data-picker]", f).innerHTML = '<p class="help" style="padding:1rem">' + esc(er.message) + "</p>"; });
    warn();
    return function () { if (pk) pk.destroy(); };
  }
  function schoolForm(s, isNew) {
    var cleanup = null;
    var m = modal({
      title: isNew ? "Add a school" : "Edit school",
      body: field("School name", input("name", s.name, 'required maxlength="160" placeholder="e.g. Buenavista Central Elementary School" class="caps"')) +
        '<div class="grid2">' + field("School ID", input("schoolId", s.schoolId, 'inputmode="numeric" maxlength="12" placeholder="e.g. 131234"')) + field("Level", '<select name="level">' + LEVELS.map(function (l) { return opt(l, l, s.level || "Elementary"); }).join("") + "</select>") + "</div>" +
        field("District", input("district", s.district, 'list="dl-districts" placeholder="Type or choose"')) + dl("dl-districts", districtNames()) +
        locBlock(s.lat, s.lng) +
        '<div class="panel-sub"><h4>Library and learning resources</h4>' +
        field("Library", '<select name="library">' + opt("none", "No library yet", s.library || "none") + opt("school", "Has a school library", s.library) + opt("hub", "Is a Library Hub", s.library) + "</select>") +
        field("Coverage distance in km (optional)", input("radiusKm", s.radiusKm, 'inputmode="decimal" placeholder="Leave empty to use the default"'), "How far this library or hub reaches. Default: " + (st.settings.hubRadiusKm || 10) + " km for hubs, " + (st.settings.libRadiusKm || 1) + " km for school libraries.") +
        '<div class="grid2">' + field("Number of learners", input("learners", s.learners, 'type="number" min="0" inputmode="numeric"')) +
        field("Learning resources", '<select name="lrStatus">' + opt("sufficient", "Enough", s.lrStatus || "sufficient") + opt("lacking", "Lacking", s.lrStatus) + opt("severe", "Severely lacking", s.lrStatus) + "</select>") + "</div>" +
        field("Notes", area("notes", s.notes, 'rows="2" placeholder="e.g. needs books for Grades 1–3; island school; library room under construction"')) + "</div>" +
        toggle("visible", notFalse(s.visible), "Show on the map"),
      foot: (isNew ? "" : '<button type="button" class="btn btn-danger" data-del>' + icon("trash") + " Delete</button>") + '<span class="grow"></span><button type="button" class="btn" data-close>Cancel</button><button class="btn btn-honey" type="submit">' + (isNew ? "Add school" : "Save school") + "</button>",
      onMount: function (f) {
        cleanup = bindLoc(f);
        f.name.addEventListener("input", function () { var p = f.name.selectionStart; f.name.value = f.name.value.toUpperCase(); try { f.name.setSelectionRange(p, p); } catch (e) {} });
        var del = $("[data-del]", f);
        if (del) del.onclick = function () {
          confirmBox("Delete “" + s.name + "”?", "It will be removed from the map.").then(function (ok) {
            if (!ok) return;
            API.call("admin.deleteSchool", { id: s.id }).then(function () { if (cleanup) cleanup(); m.close(); H.toast("School deleted."); H.patch(function (d) { d.schools = (d.schools || []).filter(function (x) { return x.id !== s.id; }); }); refreshPanel(); }).catch(fail);
          });
        };
        var bd = f.closest(".modal-backdrop"); bd.addEventListener("click", function (e) { if (e.target === bd || e.target.closest("[data-close]")) { if (cleanup) cleanup(); } });
      },
      onSubmit: function (f, close, btn) {
        var v = formVals(f); delete v.coords;
        if (!v.name) { H.toast("Type the school name.", "err"); return; }
        v.lat = v.lat === "" ? "" : +v.lat; v.lng = v.lng === "" ? "" : +v.lng;
        if (v.learners !== "") v.learners = +v.learners;
        var item = Object.assign({}, isNew ? {} : s, v);
        busy(btn, true);
        API.call("admin.saveSchool", { school: item }).then(function (j) {
          if (cleanup) cleanup(); close(); H.toast(isNew ? "School added." : "School saved.");
          H.patch(function (d) { d.schools = d.schools || []; var i = d.schools.findIndex(function (x) { return x.id === j.school.id; }); if (i < 0) d.schools.push(j.school); else d.schools[i] = j.school; });
          refreshPanel();
        }).catch(function (er) { busy(btn, false); fail(er); });
      }
    });
  }
  function districtForm(d, isNew) {
    var cleanup = null;
    var m = modal({
      title: isNew ? "Add a district" : "Edit district",
      body: field("District name", input("name", d.name, 'required maxlength="80" placeholder="e.g. Buenavista I"')) + locBlock(d.lat, d.lng) +
        '<div class="grid2">' + field("District Library Hub", '<select name="library">' + opt("none", "No district hub", d.library || "none") + opt("hub", "Has a district Library Hub here", d.library) + "</select>", "Use this when the hub is at the district office. If the hub is in a school, mark it on that school instead.") +
        field("Hub coverage in km (optional)", input("radiusKm", d.radiusKm, 'inputmode="decimal" placeholder="Default ' + (st.settings.hubRadiusKm || 10) + ' km"')) + "</div>" +
        field("Notes", area("notes", d.notes, 'rows="2"')) + toggle("visible", notFalse(d.visible), "Show on the map"),
      foot: (isNew ? "" : '<button type="button" class="btn btn-danger" data-del>' + icon("trash") + " Delete</button>") + '<span class="grow"></span><button type="button" class="btn" data-close>Cancel</button><button class="btn btn-honey" type="submit">' + (isNew ? "Add district" : "Save district") + "</button>",
      onMount: function (f) {
        cleanup = bindLoc(f);
        var del = $("[data-del]", f);
        if (del) del.onclick = function () {
          confirmBox("Delete district “" + d.name + "”?", "Its schools stay on the map.").then(function (ok) {
            if (!ok) return;
            API.call("admin.deleteDistrict", { id: d.id }).then(function () { if (cleanup) cleanup(); m.close(); H.patch(function (x) { x.districts = (x.districts || []).filter(function (y) { return y.id !== d.id; }); }); refreshPanel(); }).catch(fail);
          });
        };
        var bd = f.closest(".modal-backdrop"); bd.addEventListener("click", function (e) { if (e.target === bd || e.target.closest("[data-close]")) { if (cleanup) cleanup(); } });
      },
      onSubmit: function (f, close, btn) {
        var v = formVals(f); delete v.coords;
        if (!v.name) { H.toast("Type the district name.", "err"); return; }
        v.lat = v.lat === "" ? "" : +v.lat; v.lng = v.lng === "" ? "" : +v.lng;
        busy(btn, true);
        API.call("admin.saveDistrict", { district: Object.assign({}, isNew ? {} : d, v) }).then(function (j) {
          if (cleanup) cleanup(); close(); H.toast(isNew ? "District added." : "District saved.");
          H.patch(function (x) { x.districts = x.districts || []; var i = x.districts.findIndex(function (y) { return y.id === j.district.id; }); if (i < 0) x.districts.push(j.district); else x.districts[i] = j.district; });
          refreshPanel();
        }).catch(function (er) { busy(btn, false); fail(er); });
      }
    });
  }

  /* bulk paste: rows copied from Excel / Google Sheets (tabs) or CSV, first row = headers */
  var ALIASES = {
    name: ["school", "schoolname", "nameofschool", "name", "district", "districtname"],
    schoolId: ["schoolid", "id", "depedid", "beisid", "schoolcode", "lisid"],
    level: ["level", "type", "category", "schooltype", "curricularoffering"],
    district: ["district", "schooldistrict"],
    lat: ["latitude", "lat", "y"], lng: ["longitude", "long", "lng", "lon", "x"],
    coords: ["coordinates", "coordinate", "location", "gps", "googlemaps", "googlemapslink", "map", "latlong", "latlng"],
    library: ["library", "haslibrary", "librarystatus", "libraryhub", "withlibrary"],
    radiusKm: ["radius", "radiuskm", "coverage", "coveragekm", "reachkm"],
    learners: ["learners", "enrollment", "enrolment", "pupils", "students", "totalenrollment"],
    lrStatus: ["resources", "learningresources", "lrstatus", "lr", "lrsituation", "resourcestatus"],
    notes: ["notes", "remarks", "note", "comment"]
  };
  function splitRows(text) {
    var rows = [], row = [], cell = "", q = false, sep = text.indexOf("\t") >= 0 ? "\t" : ",";
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (q) { if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch; }
      else if (ch === '"' && !cell) q = true;
      else if (ch === sep) { row.push(cell); cell = ""; }
      else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
      else cell += ch;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (c) { return String(c).trim(); }); });
  }
  function mapLibrary(v) {
    v = String(v || "").toLowerCase();
    if (/hub/.test(v)) return "hub";
    if (/^(yes|y|true|1|with|has|school|existing|available)/.test(v) || /school library|with library|has library/.test(v)) return "school";
    return "none";
  }
  function mapLr(v) {
    v = String(v || "").toLowerCase();
    if (/sever|none|no |^no$|critical|very/.test(v)) return "severe";
    if (/lack|insuff|need|low|few|partial/.test(v)) return "lacking";
    return "sufficient";
  }
  function parseBulk(text, kind) {
    var rows = splitRows(text); if (rows.length < 2) return { rows: [], errors: ["Paste at least a header row and one data row."], cols: [] };
    var head = rows[0].map(function (h) { return String(h).toLowerCase().replace(/[^a-z]/g, ""); }), map = {};
    head.forEach(function (h, i) {
      Object.keys(ALIASES).forEach(function (k) {
        if (map[k] != null) return;
        if (kind === "districts" && k === "district") return;
        if (kind === "schools" && k === "name" && (h === "district" || h === "districtname")) return;
        if (ALIASES[k].indexOf(h) >= 0) map[k] = i;
      });
    });
    var out = [], errors = [];
    if (map.name == null) errors.push("No name column found. Use a header like “School name”" + (kind === "districts" ? " or “District”." : "."));
    rows.slice(1).forEach(function (r, n) {
      function g(k) { return map[k] != null ? String(r[map[k]] == null ? "" : r[map[k]]).trim() : ""; }
      var o = { name: kind === "schools" ? g("name").toUpperCase() : g("name") }, problem = "";
      if (!o.name) return;
      var lat = parseFloat(g("lat")), lng = parseFloat(g("lng"));
      if ((isNaN(lat) || isNaN(lng)) && g("coords")) { var c = parseCoords(g("coords")); if (c) { lat = c.lat; lng = c.lng; } }
      if (!isNaN(lat) && !isNaN(lng)) { o.lat = lat; o.lng = lng; }
      problem = coordWarn(o.lat, o.lng);
      if (kind === "schools") {
        o.schoolId = g("schoolId"); o.level = g("level"); o.district = g("district");
        if (map.library != null) o.library = mapLibrary(g("library"));
        if (map.lrStatus != null) o.lrStatus = mapLr(g("lrStatus"));
        if (map.learners != null && g("learners")) o.learners = +String(g("learners")).replace(/[^\d]/g, "") || 0;
      } else if (map.library != null) o.library = /hub|yes|true|1/i.test(g("library")) ? "hub" : "none";
      if (map.radiusKm != null && g("radiusKm")) o.radiusKm = parseFloat(g("radiusKm")) || "";
      if (map.notes != null) o.notes = g("notes");
      Object.keys(o).forEach(function (k) { if (o[k] === "" || o[k] == null) delete o[k]; });
      o._row = n + 2; o._problem = problem;
      out.push(o);
    });
    return { rows: out, errors: errors, cols: Object.keys(map) };
  }
  function bulkTemplate(kind) {
    var rows = kind === "districts"
      ? [["District", "Latitude", "Longitude", "Library hub", "Coverage km", "Notes"], ["Buenavista I", "8.977", "125.409", "no", "", ""], ["Tubay", "9.165", "125.523", "yes", "12", "District office hub"]]
      : [["School name", "School ID", "Level", "District", "Latitude", "Longitude", "Library", "Coverage km", "Learners", "Learning resources", "Notes"],
        ["BUENAVISTA CENTRAL ES", "131234", "Elementary", "Buenavista I", "8.9771", "125.4093", "Library hub", "10", "850", "Enough", ""],
        ["SAMPLE NATIONAL HS", "304567", "Secondary", "Tubay", "9.1652", "125.5231", "School library", "", "620", "Lacking", "needs Grade 7 books"],
        ["SAMPLE PRIMARY SCHOOL", "131999", "Elementary", "Tubay", "9.1801, 125.5402", "", "None", "", "140", "Severely lacking", "coordinates can also be in one column"]];
    var csv = rows.map(function (r) { return r.map(H.csvCell).join(","); }).join("\r\n");
    var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv" })); a.download = "LRMS-HIVE " + kind + " template.csv"; document.body.appendChild(a); a.click(); setTimeout(function () { a.remove(); }, 100);
  }

  /* ---------------- announcements ---------------- */
  function announcementForm(a, isNew) {
    var m = modal({
      title: isNew ? "Add announcement" : "Edit announcement",
      body: field("Headline", input("title", a.title, 'required maxlength="140"')) + field("Message", area("body", a.body, 'rows="3"')) +
        '<div class="grid2">' + field("Button text", input("linkText", a.linkText || "Open", "")) + field("Button link", input("url", a.url, 'type="url" placeholder="https://"')) + "</div>" +
        '<div class="grid2">' + field("Show from (optional)", input("startDate", String(a.startDate || "").slice(0, 10), 'type="date"')) + field("Show until (optional)", input("endDate", String(a.endDate || "").slice(0, 10), 'type="date"'), "It hides itself after this date.") + "</div>" +
        toggle("pinned", truthy(a.pinned), "Pin to the top") + toggle("visible", notFalse(a.visible), "Show on the home page"),
      foot: (isNew ? "" : '<button type="button" class="btn btn-danger" data-del>' + icon("trash") + " Delete</button>") + '<span class="grow"></span><button type="button" class="btn" data-close>Cancel</button><button class="btn btn-honey" type="submit">Save</button>',
      onMount: function (f) {
        var del = $("[data-del]", f);
        if (del) del.onclick = function () {
          confirmBox("Delete this announcement?", esc(a.title)).then(function (ok) {
            if (!ok) return;
            API.call("admin.deleteAnnouncement", { id: a.id }).then(function () { m.close(); H.patch(function (d) { d.announcements = d.announcements.filter(function (x) { return x.id !== a.id; }); }); refreshPanel(); }).catch(fail);
          });
        };
      },
      onSubmit: function (f, close, btn) {
        var v = formVals(f); if (!v.title) { H.toast("Write a headline.", "err"); return; }
        busy(btn, true);
        API.call("admin.saveAnnouncement", { announcement: Object.assign({}, isNew ? {} : a, v) }).then(function (j) {
          close(); H.toast("Announcement saved.");
          H.patch(function (d) { var i = d.announcements.findIndex(function (x) { return x.id === j.announcement.id; }); if (i < 0) d.announcements.push(j.announcement); else d.announcements[i] = j.announcement; });
          refreshPanel();
        }).catch(function (e) { busy(btn, false); fail(e); });
      }
    });
  }

  /* ---------------- settings save ---------------- */
  function saveSettings(obj, btn, msg) {
    busy(btn, true);
    return API.call("admin.saveSettings", { settings: obj }).then(function () {
      busy(btn, false); H.toast(msg || "Settings saved.");
      H.patch(function (d) { d.settings = Object.assign({}, d.settings || {}, obj); });
    }).catch(function (e) { busy(btn, false); fail(e); throw e; });
  }

  /* ---------------- admin panel ---------------- */
  var TABS = [
    ["dashboard", "Dashboard & reports", "home"], ["menu", "Menu tabs", "template"], ["tiles", "Tiles & layout", "apps"], ["resources", "Resources", "folder"],
    ["news", "News", "megaphone"], ["events", "Events", "calendar"], ["map", "Library map", "pin"], ["announce", "Announcements", "memo"], ["about", "About page", "info"], ["branding", "Logo & name", "hex"], ["backgrounds", "Backgrounds", "image"], ["footer", "Footer", "template"],
    ["entry", "Entry screen", "form"], ["ai", "AI assistant", "spark"], ["visitors", "Visitors", "people"], ["system", "Accounts & system", "check"]
  ];
  var panel = null, current = "dashboard";
  function openPanel(tab) {
    if (!API.token()) return loginModal();
    current = tab || current;
    if (!panel) {
      panel = document.createElement("div"); panel.className = "admin"; panel.setAttribute("role", "dialog"); panel.setAttribute("aria-label", "Admin settings");
      panel.innerHTML = '<div class="admin-top"><h2>Admin settings</h2><span class="badge">' + (API.demo ? "DEMO MODE" : "Connected to Google Sheets") + '</span><button class="btn btn-sm" type="button" data-x>Back to site</button></div>' +
        '<div class="admin-tabs" role="tablist">' + TABS.map(function (t) { return '<button class="admin-tab" role="tab" type="button" data-tab="' + t[0] + '">' + icon(t[2]) + t[1] + "</button>"; }).join("") + "</div>" +
        '<div class="admin-body"><div data-pane></div></div>';
      $("#admin-root").appendChild(panel);
      panel.addEventListener("click", function (e) {
        var t = e.target.closest("[data-tab]"); if (t) { current = t.dataset.tab; renderPane(); }
        if (e.target.closest("[data-x]")) closePanel();
      });
    }
    H.stay(panel); panel.hidden = false; document.body.classList.add("locked");
    renderPane();
  }
  function closePanel() { if (panel && !panel.hidden) H.leave(panel, 220, function () { panel.hidden = true; }); document.body.classList.remove("locked"); }
  function refreshPanel() { if (panel && !panel.hidden) renderPane(); }

  function renderPane() {
    $$(".admin-tab", panel).forEach(function (b) { b.classList.toggle("on", b.dataset.tab === current); b.setAttribute("aria-selected", b.dataset.tab === current); });
    var pane = $("[data-pane]", panel), s = st.settings;
    var fn = PANES[current]; pane.innerHTML = ""; pane.onclick = pane.onchange = pane.oninput = null; fn(pane, s);
    pane.classList.remove("pane-in"); void pane.offsetWidth; pane.classList.add("pane-in");
  }

  var PANES = {
    dashboard: function (p, s) {
      var rep = null;
      function d8(n) { return new Date(Date.now() + 8 * 3600000 - n * 86400000).toISOString().slice(0, 10); }
      function range(k) {
        var t = d8(0), y = t.slice(0, 4), mth = t.slice(0, 7);
        if (k === "month") return [mth + "-01", t];
        if (k === "last") { var d = new Date(+y, +t.slice(5, 7) - 2, 1), e = new Date(+y, +t.slice(5, 7) - 1, 0); var f = function (x) { return x.getFullYear() + "-" + ("0" + (x.getMonth() + 1)).slice(-2) + "-" + ("0" + x.getDate()).slice(-2); }; return [f(d), f(e)]; }
        if (k === "3m") { var a = new Date(+y, +t.slice(5, 7) - 3, 1); return [a.getFullYear() + "-" + ("0" + (a.getMonth() + 1)).slice(-2) + "-01", t]; }
        if (k === "sy") { var sy = +t.slice(5, 7) >= 6 ? +y : +y - 1; return [sy + "-06-01", t]; }
        if (k === "year") return [y + "-01-01", t];
        return [d8(29), t];
      }
      var r0 = range("month");
      p.innerHTML = '<div class="panel"><div class="panel-head"><h3>Reports</h3>' + (API.demo ? '<button type="button" class="btn btn-sm" data-sample>Fill with sample activity (demo only)</button>' : "") + "</div>" +
        '<form class="rep-bar" data-period>' + field("Period", '<select name="preset">' + opt("month", "This month", "month") + opt("last", "Last month", "") + opt("3m", "Last 3 months", "") + opt("sy", "This school year (from June)", "") + opt("year", "This calendar year", "") + opt("30", "Last 30 days", "") + opt("custom", "Choose dates…", "") + "</select>") +
        field("From", input("from", r0[0], 'type="date"')) + field("To", input("to", r0[1], 'type="date"')) +
        '<button class="btn btn-honey" type="submit">Show report</button><button class="btn" type="button" data-export>' + icon("sheet") + ' Export to Google Sheets</button><button class="btn" type="button" data-csvall>' + icon("download") + " Download CSV</button></form>" +
        '<p class="help">Counts come from visits (the welcome form), resources opened in the site, Download and “Open in new tab” clicks, reactions, and searches that found nothing. Numbers start from the day this version went live.</p></div>' +
        '<div data-report><p class="help">Loading report…</p></div>' +
        '<div class="panel"><h3>Quick actions</h3><div class="add-row" style="margin:0"><button class="btn btn-honey" type="button" data-q="res">' + icon("plus") + ' Add a resource</button><button class="btn" type="button" data-q="tile">' + icon("apps") + ' Add a home tile</button><button class="btn" type="button" data-q="news">' + icon("megaphone") + ' Post news</button><button class="btn" type="button" data-q="event">' + icon("calendar") + " Add an event</button></div></div>";
      var f = $("[data-period]", p);
      f.preset.onchange = function () { if (f.preset.value !== "custom") { var r = range(f.preset.value); f.from.value = r[0]; f.to.value = r[1]; load(); } };
      f.from.onchange = f.to.onchange = function () { f.preset.value = "custom"; };
      f.onsubmit = function (e) { e.preventDefault(); load(); };
      function load() {
        $("[data-report]", p).innerHTML = '<p class="help">' + icon("hex", "spin") + " Counting…</p>";
        API.call("admin.report", { from: f.from.value, to: f.to.value }, 90000).then(function (j) { rep = j.report; draw(); }).catch(function (e) { $("[data-report]", p).innerHTML = '<p class="link-check warn">' + esc(e.message) + "</p>"; });
      }
      function n(x) { return Number(x || 0).toLocaleString("en-US"); }
      function monthName(m) { var d = new Date(+m.slice(0, 4), +m.slice(5, 7) - 1, 1); return d.toLocaleString("en-US", { month: "short" }) + (m.slice(5, 7) === "01" || rep.visitsByMonth.length <= 12 ? "" : "") ; }
      function tableHTML(head, rows) { return '<div class="tbl-wrap"><table class="tbl"><thead><tr>' + head.map(function (h) { return "<th>" + esc(h) + "</th>"; }).join("") + "</tr></thead><tbody>" + (rows.length ? rows.map(function (r) { return "<tr>" + r.map(function (c) { return "<td>" + esc(c) + "</td>"; }).join("") + "</tr>"; }).join("") : '<tr><td colspan="' + head.length + '">No data yet.</td></tr>') + "</tbody></table></div>"; }
      var CSV = {};
      function chart(key, title, sub, body, head, rows) {
        CSV[key] = { name: title, head: head, rows: rows };
        return '<section class="chart"><h3>' + esc(title) + "</h3>" + (sub ? '<p class="chart-sub">' + sub + "</p>" : "") + body +
          '<div class="chart-tools"><details><summary>Show as table</summary>' + tableHTML(head, rows) + '</details><button type="button" class="btn btn-sm btn-ghost" data-csv="' + key + '">' + icon("download") + " CSV</button></div></section>";
      }
      function hbars(list, unit, limit) {
        list = list.slice(0, limit || 12);
        if (!list.length) return '<p class="empty-chart">No data for this period yet.</p>';
        var max = Math.max.apply(null, list.map(function (x) { return x.value; })) || 1;
        return '<ul class="hbars">' + list.map(function (x) { return '<li class="hbar" tabindex="0" data-tip="' + esc(x.label) + ": " + n(x.value) + " " + unit + '"><span class="hbar-label" title="' + esc(x.label) + '">' + esc(x.label) + '</span><span class="hbar-track"><span class="hbar-fill" style="width:' + (x.value / max * 100).toFixed(1) + '%"></span></span><span class="hbar-val">' + n(x.value) + "</span></li>"; }).join("") + "</ul>";
      }
      function vbars(list, unit) {
        if (!list.some(function (x) { return x.value; })) return '<p class="empty-chart">No data for this period yet.</p>';
        var max = Math.max.apply(null, list.map(function (x) { return x.value; })) || 1, many = list.length > 12;
        return '<span class="vmax">' + n(max) + " " + unit + " (highest)</span>" + '<div class="vbars" role="img" aria-label="' + esc(unit) + ' per month">' + list.map(function (x) {
          return '<span class="vbar" tabindex="0" data-tip="' + esc(x.label) + ": " + n(x.value) + '"><i style="height:' + (x.value / max * 100).toFixed(1) + '%"></i></span>';
        }).join("") + '</div><div class="vlabels">' + list.map(function (x, i) { var lab = new Date(+x.label.slice(0, 4), +x.label.slice(5, 7) - 1, 1).toLocaleString("en-US", { month: "short" }); return "<span>" + (many && i % 2 ? "" : lab + (x.label.slice(5) === "01" || i === 0 ? " " + x.label.slice(2, 4) : "")) + "</span>"; }).join("") + "</div>";
      }
      function draw() {
        var t = rep.totals, R = rep;
        var react = { useful: "Useful", used: "Used in class", needs: "Needs improvement" };
        var html = '<div class="kpis">' + [[t.visits, "visits"], [t.uniqueVisitors, "different visitors"], [t.views, "resources opened"], [t.downloads, "downloads"], [t.opens, "opened outside the site"], [t.useful + t.usedInClass, "said useful / used in class"], [t.needsImprovement, "said needs improvement"], [t.misses, "searches with no result"]]
          .map(function (k) { return '<div class="kpi"><b>' + n(k[0]) + "</b><span>" + k[1] + "</span></div>"; }).join("") + "</div>";
        html += '<div class="charts">' +
          chart("vm", "Visits per month", "One visit = one person entering the site (after the welcome form).", vbars(R.visitsByMonth, "visits"), ["Month", "Visits"], R.visitsByMonth.map(function (x) { return [x.label, x.value]; })) +
          chart("vd", "Visits by district", "", hbars(R.byDistrict, "visits", 15), ["District", "Visits"], R.byDistrict.map(function (x) { return [x.label, x.value]; })) +
          chart("vs", "Top schools", "Schools with the most visits.", hbars(R.bySchool, "visits", 12), ["School", "Visits"], R.bySchool.map(function (x) { return [x.label, x.value]; })) +
          chart("ud", "Resource use by district", "Resources opened, downloaded or opened outside, by the visitor’s district.", hbars(R.useByDistrict, "uses", 15), ["District", "Uses"], R.useByDistrict.map(function (x) { return [x.label, x.value]; })) +
          chart("us", "Most-used subjects", "", hbars(R.bySubject, "uses", 12), ["Subject", "Uses"], R.bySubject.map(function (x) { return [x.label, x.value]; })) +
          chart("ug", "Most-used grade levels", "", hbars(R.byGrade, "uses", 14), ["Grade", "Uses"], R.byGrade.map(function (x) { return [x.label, x.value]; })) +
          chart("um", "Resources opened per month", "", vbars(R.useByMonth.map(function (x) { return { label: x.label, value: x.views }; }), "opened"), ["Month", "Opened in the site", "Downloads"], R.useByMonth.map(function (x) { return [x.label, x.views, x.downloads]; })) +
          chart("dv", "Visits by device", "", hbars(R.byDevice, "visits", 8), ["Device", "Visits"], R.byDevice.map(function (x) { return [x.label, x.value]; })) +
          "</div>";
        CSV.tr = { name: "Most used resources", head: ["Title", "Section", "Subject", "Grade", "Opened", "Downloads", "Opened outside", "Useful", "Used in class", "Needs improvement"], rows: R.topResources.map(function (r) { return [r.title, r.section, r.subject, r.grade, r.views, r.downloads, r.opens, r.useful, r.used, r.needs]; }) };
        html += '<section class="panel"><div class="panel-head"><h3>Most used resources</h3><button type="button" class="btn btn-sm btn-ghost" data-csv="tr">' + icon("download") + " CSV</button></div>" +
          tableHTML(["Resource", "Section", "Opened", "Downloads", "Outside", "Useful", "Used in class"], R.topResources.slice(0, 20).map(function (r) { return [r.title, r.section, n(r.views), n(r.downloads), n(r.opens), n(r.useful), n(r.used)]; })) + "</section>";
        CSV.fr = { name: "Feedback ranking", head: ["Title", "Useful", "Used in class", "Needs improvement", "Comments", "Score"], rows: R.topRated.map(function (r) { return [r.title, r.useful, r.used, r.needs, r.comments, r.score]; }) };
        html += '<div class="twocol"><section class="panel"><div class="panel-head"><h3>Feedback ranking</h3><button type="button" class="btn btn-sm btn-ghost" data-csv="fr">' + icon("download") + ' CSV</button></div><p class="help">Score = useful + 2 × used in class − needs improvement.</p>' +
          tableHTML(["Resource", "Useful", "Used in class", "Needs impr.", "Score"], R.topRated.slice(0, 15).map(function (r) { return [r.title, n(r.useful), n(r.used), n(r.needs), r.score]; })) + "</section>" +
          '<section class="panel"><div class="panel-head"><h3>Latest comments</h3><button type="button" class="btn btn-sm btn-ghost" data-allfb>' + icon("download") + " All feedback (CSV)</button></div>" +
          (R.latestComments.length ? '<ul class="comment-list">' + R.latestComments.map(function (c) { return "<li><b>" + esc(c.title) + "</b> · " + esc(react[c.reaction] || c.reaction) + "<p>" + esc(c.comment) + "</p><small>" + esc([c.name, c.school, c.district, c.date].filter(Boolean).join(" · ")) + "</small></li>"; }).join("") + "</ul>" : '<p class="help">No comments in this period.</p>') + "</section></div>";
        CSV.ms = { name: "Searched but not found", head: ["Search words", "Times", "Last searched"], rows: R.misses.map(function (x) { return [x.label, x.value, x.last]; }) };
        html += '<section class="panel"><div class="panel-head"><h3>Searched but not found</h3><button type="button" class="btn btn-sm btn-ghost" data-csv="ms">' + icon("download") + ' CSV</button></div><p class="help">What teachers looked for and did not find — ideas for the next materials to develop or upload.</p>' +
          (R.misses.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Search words</th><th>Times</th><th>Last searched</th><th></th></tr></thead><tbody>' + R.misses.map(function (x) {
            return "<tr><td><b>" + esc(x.label) + '</b></td><td class="mono">' + n(x.value) + '</td><td class="mono">' + esc(x.last || "") + '</td><td class="actions"><button type="button" class="btn btn-sm" data-addmiss="' + esc(x.label) + '">' + icon("plus") + " Add a resource for this</button></td></tr>";
          }).join("") + "</tbody></table></div>" : '<p class="help">No failed searches in this period.</p>') + "</section>";
        $("[data-report]", p).innerHTML = html;
      }
      function csvDownload(name, head, rows) {
        var body = [head].concat(rows).map(function (r) { return r.map(function (c) { return H.csvCell(c); }).join(","); }).join("\r\n");
        var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["﻿" + body], { type: "text/csv" }));
        a.download = "LRMS-HIVE " + name + " " + f.from.value + " to " + f.to.value + ".csv"; document.body.appendChild(a); a.click(); setTimeout(function () { a.remove(); }, 100);
      }
      p.onclick = function (e) {
        var b;
        if ((b = e.target.closest("[data-csv]")) && CSV[b.dataset.csv]) { var c = CSV[b.dataset.csv]; csvDownload(c.name, c.head, c.rows); }
        else if (e.target.closest("[data-csvall]")) {
          if (!rep) return; var rows = [];
          var tt = rep.totals; rows.push(["SUMMARY", rep.from + " to " + rep.to]); [["Visits", tt.visits], ["Different visitors", tt.uniqueVisitors], ["Resources opened", tt.views], ["Downloads", tt.downloads], ["Opened outside", tt.opens], ["Useful", tt.useful], ["Used in class", tt.usedInClass], ["Needs improvement", tt.needsImprovement], ["Comments", tt.comments], ["Searches with no result", tt.misses]].forEach(function (x) { rows.push(x); });
          Object.keys(CSV).forEach(function (k) { rows.push([]); rows.push([CSV[k].name.toUpperCase()]); rows.push(CSV[k].head); CSV[k].rows.forEach(function (r) { rows.push(r); }); });
          csvDownload("Report", ["LRMS-HIVE report"], rows);
        }
        else if ((b = e.target.closest("[data-export]"))) {
          busy(b, true, "Creating Google Sheet…");
          API.call("admin.exportReport", { from: f.from.value, to: f.to.value }, 180000).then(function (j) {
            busy(b, false);
            modal({ title: "Report ready", body: '<p>Your report was saved as a Google Sheet' + (st.settings.storageFolderId ? " in the LRMS storage folder" : "") + '.</p><p><a class="btn btn-honey btn-xl" href="' + esc(j.url) + '" target="_blank" rel="noopener">' + icon("sheet") + " Open the Google Sheet</a></p>", foot: '<span class="grow"></span><button type="button" class="btn" data-close>Close</button>' });
          }).catch(function (er) { busy(b, false); fail(er); });
        }
        else if (e.target.closest("[data-allfb]")) {
          API.call("admin.feedback", { limit: 2000 }).then(function (j) {
            csvDownload("All feedback", ["Date", "Resource", "Reaction", "Comment", "Name", "School", "District", "Division"], (j.rows || []).map(function (r) { return [String(r.timestamp).slice(0, 16).replace("T", " "), r.resourceTitle || r.resourceId, r.reaction, r.comment, r.name, r.school, r.district, r.division]; }));
          }).catch(fail);
        }
        else if ((b = e.target.closest("[data-addmiss]"))) resourceForm({ title: b.dataset.addmiss.replace(/\b\w/g, function (c) { return c.toUpperCase(); }), tags: b.dataset.addmiss, type: "link", visible: true, sectionId: "" }, true);
        else if (e.target.closest("[data-sample]")) API.call("admin.sampleActivity", {}).then(function () { H.refresh(true); H.toast("Sample activity added (demo only)."); load(); });
        else if ((b = e.target.closest("[data-q]"))) {
          var q = b.dataset.q;
          if (q === "res") HiveAdmin.add("resource", { section: (st.kids[""] || [])[0] ? st.kids[""][0].id : "" });
          if (q === "tile") HiveAdmin.add("section", { parent: "" });
          if (q === "news") HiveAdmin.add("news", {});
          if (q === "event") HiveAdmin.add("event", {});
        }
      };
      load();
    },

    events: function (p, s) {
      p.innerHTML = '<div class="panel"><div class="panel-head"><h3>Events</h3><a class="btn btn-sm" href="#/events" data-x>View the calendar</a><button type="button" class="btn btn-honey" data-new>' + icon("plus") + ' Add an event</button></div><div data-list class="help">Loading…</div></div>' +
        '<form class="panel" data-f><h3>Events page</h3><div class="grid2">' +
        field("Deadline reminder bar (top of the Events page)", '<select name="reminderDays">' + [[0, "Off"], [1, "Today and tomorrow"], [3, "Deadlines within 3 days"], [7, "Deadlines within a week"]].map(function (k) { return opt(k[0], k[1], String(s.reminderDays)); }).join("") + "</select>", "Events happening today or tomorrow, and deadlines coming soon, appear at the top of the home page.") +
        '</div><div><button class="btn btn-honey" type="submit">Save</button></div></form>';
      $("[data-f]", p).onsubmit = function (e) { e.preventDefault(); var v = formVals(e.target); v.reminderDays = +v.reminderDays; saveSettings(v, e.submitter, "Saved."); };
      var all = [];
      API.call("admin.listEvents", {}).then(function (j) {
        var t = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
        all = (j.events || []).sort(function (a, b) { return String(a.startDate).localeCompare(String(b.startDate)); });
        var up = all.filter(function (e) { return (e.repeat === "weekly" ? (e.repeatUntil || "9999") : (e.endDate || e.startDate)) >= t; }), past = all.filter(function (e) { return up.indexOf(e) < 0; }).reverse();
        function li(e) { return '<li class="tree-item"><b>' + esc(e.title) + "</b>" + (notFalse(e.visible) ? "" : '<span class="badge no">hidden</span>') + '<span class="badge">' + esc(e.category || "Event") + '</span><span class="mono muted">' + esc(String(e.startDate).slice(0, 10)) + (e.repeat === "weekly" ? " · weekly" : "") + "</span>" + (e.memoUrl ? '<span class="badge ok">memo</span>' : "") + '<button class="btn" type="button" data-ed="' + esc(e.id) + '">' + icon("edit") + " Edit</button></li>"; }
        $("[data-list]", p).innerHTML = (up.length ? "<h4>Upcoming</h4><ul class=\"tree\">" + up.map(li).join("") + "</ul>" : "<p>No upcoming events.</p>") + (past.length ? "<details><summary>Past events (" + past.length + ")</summary><ul class=\"tree\">" + past.map(li).join("") + "</ul></details>" : "");
      }).catch(function (e) { $("[data-list]", p).textContent = e.message; });
      p.onclick = function (e) {
        var b;
        if (e.target.closest("[data-new]")) eventForm({ visible: true, allDay: true, category: "Training" }, true);
        else if ((b = e.target.closest("[data-ed]"))) eventForm(all.find(function (x) { return x.id === b.dataset.ed; }), false);
      };
    },

    tiles: function (p, s) {
      var groups = JSON.parse(JSON.stringify(s.groups || []));
      function tree(pid) {
        var kids = sortedKids(pid); if (!kids.length) return "";
        return '<ul class="tree" data-level="' + esc(pid) + '">' + kids.map(function (k) {
          var kindLbl = (KINDS.filter(function (x) { return x[0] === (k.kind || "section"); })[0] || KINDS[0])[1];
          return '<li data-id="' + esc(k.id) + '"><div class="tree-item' + (notFalse(k.visible) ? "" : " is-hidden") + '">' +
            '<button type="button" class="drag-handle" data-drag aria-label="Drag to move" title="Drag to move">' + icon("apps") + "</button>" +
            '<span class="tile-badge tone-' + esc(k.color) + '"' + (k.customColor ? ' style="--tone:' + esc(k.customColor) + '"' : "") + ">" + icon(k.icon) + "</span><b>" + esc(k.title) + (notFalse(k.visible) ? "" : ' <span class="badge no">hidden</span>') + ' <span class="badge">' + kindLbl + "</span></b>" +
            '<select data-setgroup="' + esc(k.id) + '" aria-label="Group">' + opt("", "No group", k.group || "") + groups.map(function (g) { return opt(g.id, g.name, k.group || ""); }).join("") + "</select>" +
            ((k.kind || "section") === "section" ? '<button type="button" class="btn" data-sub="' + k.id + '" aria-label="Add a tile inside" title="Add a tile inside">' + icon("plus") + "</button>" : "") +
            '<button type="button" class="btn" data-ed="' + k.id + '">' + icon("edit") + " Edit</button></div>" + tree(k.id) + "</li>";
        }).join("") + "</ul>";
      }
      var levelOpts = opt("", "Home page tiles", "") + sectionOptions("");
      p.innerHTML = '<div class="panel"><div class="panel-head"><h3>Home page layout</h3></div><form data-layout class="grid2">' +
        field("Tile size", '<select name="tileSize">' + opt("mini", "Mini — icon and name only (most per row)", s.tileSize) + opt("small", "Small", s.tileSize) + opt("compact", "Compact", s.tileSize) + opt("large", "Large (recommended)", s.tileSize) + opt("xl", "Extra large (easiest to tap)", s.tileSize) + "</select>") +
        '<div class="field"><span>Home page parts</span>' + toggle("showClock", s.showClock, "Date and time") + toggle("showVisitorCount", s.showVisitorCount, "Visitor count") + toggle("homeShowAnnouncements", s.homeShowAnnouncements, "Announcements") + toggle("homeShowFeatured", s.homeShowFeatured, "Featured resources") + toggle("homeShowRecent", s.homeShowRecent, "“You opened recently” list") + "</div>" +
        field("Welcome headline", input("welcomeTitle", s.welcomeTitle)) + field("Welcome text", area("welcomeText", s.welcomeText, 'rows="3"')) +
        '<div><button class="btn btn-honey" type="submit">Save layout</button></div></form></div>' +
        '<div class="panel"><div class="panel-head"><h3>Groups</h3><button type="button" class="btn" data-addgroup>' + icon("plus") + ' Add group</button></div><p class="help">Groups put tiles under headings, e.g. “Learning Resources”, “Learners’ Corner”. Drag to change their order. Tiles without a group show under “Browse”.</p>' +
        '<ul class="tree" data-groups>' + groups.map(function (g) {
          var n = (st.data.sections || []).filter(function (x) { return x.group === g.id; }).length;
          return '<li data-id="' + esc(g.id) + '"><div class="group-row"><button type="button" class="drag-handle" data-drag aria-label="Drag">' + icon("apps") + '</button><input data-gname="' + esc(g.id) + '" value="' + esc(g.name) + '" aria-label="Group name"><span class="mono muted">' + n + ' tiles</span><button type="button" class="btn" data-delgroup="' + esc(g.id) + '" aria-label="Delete group">' + icon("trash") + "</button></div></li>";
        }).join("") + '</ul><div><button type="button" class="btn btn-honey" data-savegroups>Save groups</button></div></div>' +
        '<div class="panel"><div class="panel-head"><h3>Tiles</h3><button type="button" class="btn btn-honey" data-sub="">' + icon("plus") + ' Add a home tile</button></div>' +
        '<p class="help">Drag the <b>handle</b> to arrange. Choose a group from each tile’s list to move it under another heading. Folder tiles can hold other tiles.</p>' +
        '<div class="add-row" style="margin:0;align-items:center"><b>Sort automatically:</b><select data-level class="sortsel">' + levelOpts + '</select>' +
        [["az", "A–Z"], ["za", "Z–A"], ["items", "Most items"], ["newest", "Newest"], ["color", "By color"], ["group", "By group"]].map(function (x) { return '<button type="button" class="btn btn-sm" data-sortlvl="' + x[0] + '">' + x[1] + "</button>"; }).join("") + "</div>" +
        (tree("") || "<p class=help>No tiles yet.</p>") + "</div>";
      $("[data-layout]", p).onsubmit = function (e) { e.preventDefault(); saveSettings(formVals(e.target), e.submitter); };
      $$("ul.tree[data-level]", p).forEach(function (ul) { sortable(ul, "li", false, function (ids) { saveOrder("sections", ids); }); });
      var gl = $("[data-groups]", p);
      sortable(gl, "li", false, function (ids) { groups.sort(function (a, b) { return ids.indexOf(a.id) - ids.indexOf(b.id); }); });
      function saveGroups(btn) { $$("[data-gname]", p).forEach(function (i) { var g = groups.find(function (x) { return x.id === i.dataset.gname; }); if (g) g.name = i.value.trim() || g.name; }); return saveSettings({ groups: groups }, btn, "Groups saved."); }
      p.onclick = function (e) {
        var b;
        if ((b = e.target.closest("[data-ed]"))) sectionForm(st.sec[b.dataset.ed], false);
        else if ((b = e.target.closest("[data-sub]"))) HiveAdmin.add("section", { parent: b.dataset.sub });
        else if (e.target.closest("[data-addgroup]")) { groups.push({ id: "g" + Date.now().toString(36), name: "New group" }); saveGroups(null).then(renderPane); }
        else if (e.target.closest("[data-savegroups]")) saveGroups(e.target.closest("[data-savegroups]")).then(renderPane);
        else if ((b = e.target.closest("[data-delgroup]"))) {
          var id = b.dataset.delgroup;
          confirmBox("Delete this group?", "Its tiles are kept and move to “Browse”.", "Delete group").then(function (ok) {
            if (!ok) return;
            groups = groups.filter(function (g) { return g.id !== id; });
            saveGroups(null).then(renderPane);
          });
        } else if ((b = e.target.closest("[data-sortlvl]"))) {
          var lvl = $("[data-level]", p).value, ids = sortIds(sortedKids(lvl), b.dataset.sortlvl);
          saveOrder("sections", ids).then(renderPane);
        }
      };
      p.onchange = function (e) {
        var sg = e.target.closest("[data-setgroup]"); if (!sg) return;
        var sec = Object.assign({}, st.sec[sg.dataset.setgroup], { group: sg.value });
        API.call("admin.saveSection", { section: sec }).then(function (j) {
          H.patch(function (d) { var i = d.sections.findIndex(function (x) { return x.id === j.section.id; }); d.sections[i] = j.section; });
          H.toast("Moved to " + (sg.value ? sg.options[sg.selectedIndex].text : "Browse") + ".");
        }).catch(fail);
      };
    },

    resources: function (p) {
      var q = "", sec = "";
      p.innerHTML = '<div class="panel"><div class="panel-head"><h3>All resources</h3><button type="button" class="btn" data-checkall>' + icon("check") + ' Check all links</button><button type="button" class="btn" data-imp>' + icon("drive") + ' Import from Drive folder</button><button type="button" class="btn btn-honey" data-new>' + icon("plus") + " Add resource</button></div>" +
        '<div class="grid2"><label class="filter" style="margin:0">' + icon("search") + '<input data-q placeholder="Find by title, tag, subject…"></label><select data-sec style="min-height:52px;border:2px solid var(--line);border-radius:12px;padding:0 .7rem;font:inherit;background:var(--surface);color:var(--ink)"><option value="">All sections</option>' + sectionOptions("") + "</select></div>" +
        '<div class="add-row" data-sorter style="margin:0;align-items:center" hidden><b>Arrange this section:</b> drag the handles, or sort ' +
        [["az", "A–Z"], ["za", "Z–A"], ["newest", "Newest"], ["items", "Most opened"], ["grade", "By grade"]].map(function (x) { return '<button type="button" class="btn btn-sm" data-sortres="' + x[0] + '">' + x[1] + "</button>"; }).join("") + "</div>" +
        '<div data-checkout></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th></th><th>Title</th><th>Section</th><th>Kind · shown as</th><th>Grade · Subject</th><th>Views</th><th></th></tr></thead><tbody data-rows></tbody></table></div></div>';
      var DISP = { auto: "", viewer: "viewer", inline: "on the page", flipbook: "flipbook", newtab: "opens directly" };
      function list() {
        var toks = window.HiveSearch.tokens(q);
        return (st.data.resources || []).filter(function (r) {
          if (sec && r.sectionId !== sec) return false;
          if (!toks.length) return true;
          var t = window.HiveSearch.tokens([r.title, r.tags, r.subject, r.grade, r.description].join(" ")).join(" ");
          return toks.every(function (w) { return t.indexOf(w) >= 0; });
        }).sort(function (a, b) { return sec ? (+a.order || 0) - (+b.order || 0) : 0; }).slice(0, 400);
      }
      function draw() {
        var rows = list(), canDrag = !!sec && !q;
        $("[data-sorter]", p).hidden = !sec;
        $("[data-rows]", p).innerHTML = rows.map(function (r) {
          return '<tr data-id="' + esc(r.id) + '"><td>' + (canDrag ? '<button type="button" class="drag-handle" data-drag aria-label="Drag">' + icon("apps") + "</button>" : "") + "</td><td><b>" + esc(r.title) + "</b>" + (r.url ? "" : ' <span class="badge no">no link</span>') + (notFalse(r.visible) ? "" : ' <span class="badge">hidden</span>') + (truthy(r.featured) ? ' <span class="badge ok">featured</span>' : "") + (r.linkStatus && r.linkStatus !== "ok" ? ' <span class="badge no" title="' + esc(r.linkChecked || "") + '">' + esc(linkWord(r.linkStatus)) + "</span>" : "") + (r.embedOk === "no" && r.display !== "newtab" ? ' <span class="badge">opens in new tab</span>' : "") + "</td><td>" + esc(H.pathOf(r.sectionId)) + "</td><td>" + esc((H.TYPES[r.type] || {}).label || r.type) + (H.isFlipbook(r) ? " · flipbook" : DISP[r.display] ? " · " + DISP[r.display] : "") + "</td><td>" + esc([r.grade, r.subject].filter(Boolean).join(" · ")) + '</td><td class="mono">' + (+r.views || 0) + '</td><td class="actions"><button class="btn" type="button" data-open="' + r.id + '">View</button> <button class="btn" type="button" data-ed="' + r.id + '">' + icon("edit") + " Edit</button></td></tr>";
        }).join("") || '<tr><td colspan="7">No resources match.</td></tr>';
      }
      function checkAll(btn) {
        var out = $("[data-checkout]", p);
        if (API.demo) { out.innerHTML = '<p class="link-check warn">Demo mode: link checks run once the site is connected to your Apps Script backend.</p>'; return; }
        var all = (st.data.resources || []).filter(function (r) { return r.url && /^https?:/i.test(H.Media.srcFromCode(r.url)); });
        var drive = all.filter(function (r) { return H.Links.isDrive(r.url) && H.Links.id(r.url); }), web = all.filter(function (r) { return drive.indexOf(r) < 0; });
        var batches = [], i; for (i = 0; i < drive.length; i += 60) batches.push(drive.slice(i, i + 60)); for (i = 0; i < web.length; i += 30) batches.push(web.slice(i, i + 30));
        if (!batches.length) { out.innerHTML = '<p class="help">No links to check yet.</p>'; return; }
        busy(btn, true); var found = [], done = 0;
        out.innerHTML = '<p class="help" data-prog>Checking ' + all.length + " links…</p>";
        batches.reduce(function (pr, b) {
          return pr.then(function () { return checkLinks(b.map(function (r) { return { id: r.id, url: H.Media.srcFromCode(r.url) }; })); }).then(function (res) {
            done += b.length; var pg = $("[data-prog]", out); if (pg) pg.textContent = "Checked " + done + " of " + all.length + "…";
            res.forEach(function (x) { var r = H.findRes(x.id); if (!r) return; r.linkStatus = x.status; if (x.embed) r.embedOk = x.embed; r.linkChecked = new Date().toISOString(); if (x.status !== "ok" || x.embed === "no") found.push({ r: r, x: x }); });
          });
        }, Promise.resolve()).then(function () {
          busy(btn, false);
          out.innerHTML = '<div class="panel" style="margin:.6rem 0"><h3>' + (found.length ? found.length + " link" + (found.length > 1 ? "s" : "") + " need attention" : "All " + all.length + " links work") + "</h3>" +
            (found.length ? '<ul class="check-list">' + found.map(function (f) { var bad = f.x.status !== "ok"; return '<li><span class="ck ' + (bad ? "bad" : "warn") + '">' + (bad ? "!" : "↗") + "</span><span><b>" + esc(f.r.title) + "</b> " + esc(linkWord(f.x.status, f.x.embed)) + '<small>' + esc(H.pathOf(f.r.sectionId)) + ' · <a href="#" data-ed="' + esc(f.r.id) + '">Edit</a></small></span></li>'; }).join("") + "</ul>" : "") + "</div>";
          H.patch(function () {}); draw();
        }).catch(function (er) { busy(btn, false); out.innerHTML = '<p class="link-check err">Link check stopped: ' + esc(er && er.message || er) + "</p>"; });
      }
      sortable($("[data-rows]", p), "tr", false, function (ids) { saveOrder("resources", ids); });
      $("[data-q]", p).oninput = function (e) { q = e.target.value; draw(); };
      $("[data-sec]", p).onchange = function (e) { sec = e.target.value; draw(); };
      p.onclick = function (e) {
        var b;
        if ((b = e.target.closest("[data-ed]"))) { e.preventDefault(); resourceForm(H.findRes(b.dataset.ed), false); }
        else if ((b = e.target.closest("[data-open]"))) { closePanel(); location.hash = "#/r/" + b.dataset.open; }
        else if (e.target.closest("[data-new]")) HiveAdmin.add("resource", { section: sec });
        else if (e.target.closest("[data-imp]")) importForm(sec);
        else if ((b = e.target.closest("[data-checkall]"))) checkAll(b);
        else if ((b = e.target.closest("[data-sortres]"))) { saveOrder("resources", sortIds(list(), b.dataset.sortres)).then(draw); }
      };
      draw();
    },

    about: function (p, s) {
      var team = JSON.parse(JSON.stringify(s.team || []));
      function teamRows() {
        return team.map(function (m, i) {
          return '<li data-id="' + i + '" class="panel" style="padding:.8rem"><div class="panel-head"><button type="button" class="drag-handle" data-drag aria-label="Drag">' + icon("apps") + '</button><h3 style="font-size:1rem">' + esc(m.name || m.position || "New member") + '</h3><button type="button" class="btn btn-sm" data-rmm="' + i + '">' + icon("trash") + " Remove</button></div>" +
            '<div class="grid2">' + field("Full name", '<input data-m="' + i + '" data-k="name" value="' + esc(m.name) + '" placeholder="e.g. Juan D. Dela Cruz">') + field("Position", '<input data-m="' + i + '" data-k="position" value="' + esc(m.position) + '" placeholder="e.g. Librarian II">') +
            field("Group", '<input data-m="' + i + '" data-k="group" value="' + esc(m.group) + '" placeholder="e.g. LRMS Team" list="dl-tgroups">') + field("Email (optional)", '<input data-m="' + i + '" data-k="email" value="' + esc(m.email) + '" type="email">') + "</div>" +
            field("Short bio (optional)", '<textarea data-m="' + i + '" data-k="bio" rows="2">' + esc(m.bio) + "</textarea>") +
            '<div class="field"><span>Photo</span><div class="color-row"><span class="avatar" style="width:56px;height:56px;font-size:1rem">' + (m.photo ? '<img src="' + esc(H.Links.image(m.photo, 200)) + '" alt="">' : "") + '</span><input type="file" accept="image/*" data-mphoto="' + i + '" hidden><button type="button" class="btn btn-sm" data-mpick="' + i + '">' + icon("image") + ' Upload photo</button><input data-m="' + i + '" data-k="photo" value="' + esc(/^data:/.test(m.photo || "") ? "" : m.photo) + '" placeholder="…or paste a Drive photo link" style="flex:1;min-width:180px"></div></div></li>';
        }).join("");
      }
      p.innerHTML = '<form class="panel" data-f><div class="panel-head"><h3>About page</h3><a class="btn btn-sm" href="#/about" data-x>View the About page</a></div><p class="help">Visitors open it from the <b>About</b> button at the top, the About tile, or the footer. Each part is a clickable tab.</p>' +
        field("Introduction", area("aboutIntro", s.aboutIntro, 'rows="3"')) +
        '<div class="grid2">' + field("Vision", area("aboutVision", s.aboutVision, 'rows="4"')) + field("Mission", area("aboutMission", s.aboutMission, 'rows="4"')) + "</div>" +
        field("Core values (one per line)", area("aboutValues", s.aboutValues, 'rows="4"')) +
        field("What the LRMS does", area("aboutMandate", s.aboutMandate, 'rows="4"')) +
        field("History (optional — the tab appears when filled in)", area("aboutHistory", s.aboutHistory, 'rows="4"')) +
        imagePick("orgChartUrl", s.orgChartUrl, "Organizational chart picture (optional)", "Without a picture, the Organization tab shows the team as a simple chart.") +
        '<div class="panel-sub"><div class="panel-head"><h4>Our Team</h4><button type="button" class="btn btn-sm" data-addm>' + icon("plus") + ' Add member</button></div><p class="help">Drag to change the order. The first person appears at the top of the organization chart.</p><ul class="tree" data-team>' + teamRows() + "</ul>" +
        dl("dl-tgroups", ["LRMS Team", "Learning Resource Evaluators", "Writers and Illustrators", "Library Hub", "Partners"]) + "</div>" +
        '<div><button class="btn btn-honey" type="submit">Save About page</button></div></form>';
      var f = $("[data-f]", p);
      bindImagePick(f, null, 2000);
      function redraw() { $("[data-team]", p).innerHTML = teamRows(); }
      sortable($("[data-team]", p), "li", false, function (ids) { team = ids.map(function (i) { return team[+i]; }); redraw(); });
      f.addEventListener("input", function (e) { var t = e.target; if (t.dataset.m != null) team[+t.dataset.m][t.dataset.k] = t.value; });
      f.addEventListener("click", function (e) {
        var b;
        if (e.target.closest("[data-addm]")) { team.push({ name: "", position: "", group: "LRMS Team", photo: "", email: "", bio: "" }); redraw(); }
        else if ((b = e.target.closest("[data-rmm]"))) { team.splice(+b.dataset.rmm, 1); redraw(); }
        else if ((b = e.target.closest("[data-mpick]"))) $('[data-mphoto="' + b.dataset.mpick + '"]', f).click();
      });
      f.addEventListener("change", function (e) {
        var inp = e.target; if (!inp.dataset || inp.dataset.mphoto == null) return;
        var i = +inp.dataset.mphoto, file = inp.files[0]; if (!file) return;
        shrinkImage(file, 500).then(function (small) {
          if (API.demo) { team[i].photo = small.dataUrl; redraw(); return; }
          return uploadFile(small.file, $('[data-mpick="' + i + '"]', f)).then(function (j) { team[i].photo = j.url; redraw(); });
        }).catch(fail);
      });
      f.onsubmit = function (e) {
        e.preventDefault();
        var v = formVals(f), out = {};
        ["aboutIntro", "aboutVision", "aboutMission", "aboutValues", "aboutMandate", "aboutHistory"].forEach(function (k) { out[k] = v[k]; });
        out.orgChartUrl = imgVal(v, "orgChartUrl");
        out.team = team.map(function (m) { return { name: (m.name || "").trim(), position: (m.position || "").trim(), group: (m.group || "").trim(), photo: m.photo || "", email: (m.email || "").trim(), bio: (m.bio || "").trim() }; });
        saveSettings(out, e.submitter, "About page saved.");
      };
    },

    news: function (p, s) {
      p.innerHTML = '<div class="panel"><div class="panel-head"><h3>News</h3><a class="btn btn-sm" href="#/news" data-x>View the News page</a><button type="button" class="btn btn-honey" data-new>' + icon("plus") + ' Add news</button></div><div data-list class="help">Loading…</div></div>' +
        '<form class="panel" data-f><h3>News page and Facebook</h3>' +
        '<div class="grid2">' + field("Page title", input("newsTitle", s.newsTitle)) + "</div>" +
        field("Introduction", input("newsIntro", s.newsIntro)) +
        field("Facebook page link", input("facebookPageUrl", s.facebookPageUrl, 'placeholder="https://www.facebook.com/YourLRMSPage"'), "Shows the page's latest posts beside the news (the page must be public). You can also add a Facebook widget tile in Tiles & layout.") +
        toggle("showFbFeed", s.showFbFeed, "Show the Facebook feed on the News page") +
        '<div><button class="btn btn-honey" type="submit">Save</button></div></form>';
      $("[data-f]", p).onsubmit = function (e) { e.preventDefault(); var v = formVals(e.target); saveSettings(v, e.submitter, "News settings saved."); };
      var all = [];
      API.call("admin.listNews", {}).then(function (j) {
        all = (j.news || []).sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
        $("[data-list]", p).innerHTML = all.length ? '<ul class="tree">' + all.map(function (n) {
          return '<li class="tree-item"><b>' + esc(n.title) + "</b>" + (notFalse(n.visible) ? "" : '<span class="badge no">hidden</span>') + (truthy(n.pinned) ? '<span class="badge ok">pinned</span>' : "") +
            '<span class="mono muted">' + esc(String(n.date).slice(0, 10)) + " · " + ((n.images || []).length) + ' photos</span><button class="btn" type="button" data-ed="' + esc(n.id) + '">' + icon("edit") + " Edit</button></li>";
        }).join("") + "</ul>" : "No news yet.";
      }).catch(function (e) { $("[data-list]", p).textContent = e.message; });
      p.onclick = function (e) {
        var b;
        if (e.target.closest("[data-new]")) newsForm({ visible: true, tag: "Activity" }, true);
        else if ((b = e.target.closest("[data-ed]"))) newsForm(all.find(function (x) { return x.id === b.dataset.ed; }), false);
      };
    },

    backgrounds: function (p, s) {
      var AREAS = [["Home", "Main page", "The home page."], ["Gate", "Loading and welcome screen", "Shown behind the honeycomb intro and the welcome form."], ["Pages", "Other pages", "Sections, News, About and search results."]];
      var STYLES = [["top", "Fade down from the top (banner)"], ["vignette", "Soft edges all around"], ["sides", "Frame the sides, clear middle"], ["corner", "Two corners"], ["bottom", "Rise from the bottom"], ["wash", "Whole page, very light"]];
      p.innerHTML = '<div class="panel"><h3>Background pictures</h3><p class="help">Pictures fade softly into the site’s own colors, so text stays easy to read. “Blend with the theme colors” turns the picture into the site’s honey-and-navy tones — recommended for busy photos. Phones and computers both show it.</p></div>' +
        AREAS.map(function (a) {
          var k = a[0];
          return '<form class="panel" data-bg="' + k + '"><div class="panel-head"><h3>' + a[1] + '</h3></div><p class="help">' + a[2] + "</p>" +
            '<div class="bg-preview' + (k === "Gate" ? " dark" : "") + '" data-pv><div data-layer></div><div class="pv-text"><b>' + (k === "Gate" ? "LRMS-HIVE" : "Your learning resources") + '</b><span>' + (k === "Gate" ? "Hub for Innovation and Versatile materials for Education" : "Text stays readable over the picture.") + "</span></div>" + (k === "Gate" ? "" : '<div class="pv-card"><span></span><span></span><span></span></div>') + "</div>" +
            imagePick("bg" + k, s["bg" + k], "Picture", "A wide photo or design, at least 1600 pixels across. It is resized automatically.") +
            '<div class="grid2">' + field("How it blends", '<select name="style">' + STYLES.map(function (x) { return opt(x[0], x[1], s["bg" + k + "Style"]); }).join("") + "</select>") +
            field("Strength", '<select name="strength">' + opt("subtle", "Subtle", s["bg" + k + "Strength"]) + opt("medium", "Medium", s["bg" + k + "Strength"]) + opt("strong", "Strong", s["bg" + k + "Strength"]) + "</select>") + "</div>" +
            toggle("tint", s["bg" + k + "Tint"] !== false && s["bg" + k + "Tint"] !== "FALSE", "Blend with the theme colors") +
            '<div class="add-row" style="margin:0"><button class="btn btn-honey" type="submit">Save ' + a[1].toLowerCase() + " background</button></div></form>";
        }).join("");
      $$("form[data-bg]", p).forEach(function (f) {
        var k = f.dataset.bg;
        function preview() {
          var v = formVals(f), src = v["bg" + k + "__data"] || v["bg" + k], layer = $("[data-layer]", f);
          var tmp = {}; tmp["bg" + k] = src; tmp["bg" + k + "Style"] = v.style; tmp["bg" + k + "Strength"] = v.strength; tmp["bg" + k + "Tint"] = v.tint;
          var keep = {}; Object.keys(tmp).forEach(function (x) { keep[x] = st.settings[x]; st.settings[x] = tmp[x]; });
          H.applyBg(layer, k);
          Object.keys(keep).forEach(function (x) { st.settings[x] = keep[x]; });
          if (k !== "Gate") layer.className = layer.className.replace("bg-layer", "bg-layer");
        }
        f.addEventListener("input", preview); f.addEventListener("change", preview);
        bindImagePick(f, preview, 2000);
        preview();
        f.onsubmit = function (e) {
          e.preventDefault(); var v = formVals(f), out = {};
          out["bg" + k] = imgVal(v, "bg" + k); out["bg" + k + "Style"] = v.style; out["bg" + k + "Strength"] = v.strength; out["bg" + k + "Tint"] = v.tint;
          saveSettings(out, e.submitter, "Background saved.").then(function () { H.applyBg(document.getElementById("gate-bg"), "Gate"); });
        };
      });
    },

    map: function (p, s) {
      var col = (window.HiveMap ? window.HiveMap.settingsOf(s).colors : {});
      var calc = window.HiveMap ? window.HiveMap.compute(st.data, s) : null, t = calc ? calc.totals : {};
      p.innerHTML = '<div class="panel"><div class="panel-head"><h3>Library map</h3><a class="btn btn-sm" href="#/map" data-x>View the map</a></div>' +
        '<p class="help">' + (t.schools || 0) + " schools and " + (st.data.districts || []).length + " districts on the map · " + (t.hubs || 0) + " Library Hubs · " + (t.need || 0) + " schools need library access · " + (t.lrNeed || 0) + " lack learning resources.</p></div>" +
        '<div class="panel"><div class="panel-head"><h3>Bulk input</h3><select data-bkind style="min-height:44px;border:2px solid var(--line);border-radius:10px;padding:0 .6rem;font:inherit;background:var(--surface);color:var(--ink)"><option value="schools">Schools</option><option value="districts">Districts</option></select>' +
        '<button type="button" class="btn btn-sm" data-tpl>' + icon("download") + ' Download template</button></div>' +
        '<p class="help">Copy rows from Excel or Google Sheets — <b>including the header row</b> — and paste them below, or choose a CSV file. Columns can be in any order. Coordinates can be two columns (Latitude, Longitude) or one column with “9.04, 125.54” or a Google Maps link. Rows with the same School ID (or the same name and district) are updated instead of added twice.</p>' +
        area("bulk", "", 'rows="7" data-bulk placeholder="School name&#9;School ID&#9;District&#9;Latitude&#9;Longitude&#9;Library&#9;Learners&#9;Learning resources" style="width:100%;font:inherit;border:2px solid var(--line);border-radius:12px;padding:.6rem;background:var(--paper);color:var(--ink)"') +
        '<div class="add-row" style="margin:0"><input type="file" accept=".csv,.tsv,.txt" data-bfile hidden><button type="button" class="btn btn-sm" data-bpick>' + icon("file") + ' Choose a CSV file</button><button type="button" class="btn btn-honey" data-bcheck>Check rows</button></div>' +
        '<div data-bout></div></div>' +
        '<div class="panel"><div class="panel-head"><h3>Districts</h3><button type="button" class="btn btn-honey" data-newd>' + icon("plus") + ' Add a district</button></div><div data-dlist></div></div>' +
        '<div class="panel"><div class="panel-head"><h3>Schools</h3><button type="button" class="btn btn-honey" data-news>' + icon("plus") + ' Add a school</button></div>' +
        '<div class="grid2"><label class="filter" style="margin:0">' + icon("search") + '<input data-sq placeholder="Find a school"></label><select data-sd style="min-height:52px;border:2px solid var(--line);border-radius:12px;padding:0 .7rem;font:inherit;background:var(--surface);color:var(--ink)"><option value="">All districts</option>' + districtNames().map(function (d) { return "<option>" + esc(d) + "</option>"; }).join("") + "</select></div>" +
        '<div data-slist></div><div class="add-row" style="margin:0"><button type="button" class="btn btn-sm btn-ghost" data-sexport>' + icon("download") + " Download all schools (CSV)</button></div></div>" +
        '<form class="panel" data-f><h3>Map settings</h3>' +
        '<div class="grid2">' + field("Page title", input("mapTitle", s.mapTitle)) + field("Map style", '<select name="mapTiles">' + opt("osm", "Street map", s.mapTiles) + opt("light", "Light map", s.mapTiles) + opt("satellite", "Satellite", s.mapTiles) + "</select>") + "</div>" +
        field("Introduction", input("mapIntro", s.mapIntro)) +
        '<div class="grid2">' + field("Library Hub coverage (km)", input("hubRadiusKm", s.hubRadiusKm, 'type="number" min="0.1" step="0.1"'), "A Library Hub reaches schools within this distance.") + field("School library coverage (km)", input("libRadiusKm", s.libRadiusKm, 'type="number" min="0" step="0.1"'), "A school library also serves schools this close (e.g. an elementary school beside a high school).") + "</div>" +
        '<div class="grid2">' + field("Map center when it opens", input("mapCenter", s.mapCenter, 'placeholder="9.08, 125.48"'), "Used when there are no schools yet; otherwise the map fits all schools.") + field("Zoom when it opens", input("mapZoom", s.mapZoom, 'type="number" min="5" max="18"')) + "</div>" +
        '<div class="field"><span>Colors</span><div class="color-row">' + [["hub", "Library Hub"], ["library", "School library"], ["covered", "Reached"], ["need", "Needs access"], ["lrLacking", "Lacking resources"]].map(function (k) {
          return '<label class="toggle" style="min-height:0;gap:.4rem"><input type="color" data-col="' + k[0] + '" value="' + esc(col[k[0]] || "#888888") + '" style="width:48px;height:40px;border:2px solid var(--line);border-radius:8px;padding:2px">' + k[1] + "</label>";
        }).join("") + '</div><small><button type="button" class="linkbtn" data-coldef>Reset to default colors</button></small></div>' +
        toggle("mapRipple", notFalse(s.mapRipple), "Ripple animation on hub coverage") +
        '<div><button class="btn btn-honey" type="submit">Save map settings</button></div></form>';
      function dlist() {
        var counts = {}; (st.data.schools || []).forEach(function (x) { var k = String(x.district).toUpperCase(); counts[k] = (counts[k] || 0) + 1; });
        var list = (st.data.districts || []).slice().sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
        $("[data-dlist]", p).innerHTML = list.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>District</th><th>Schools</th><th>Location</th><th>District hub</th><th></th></tr></thead><tbody>' + list.map(function (d) {
          return "<tr><td><b>" + esc(d.name) + '</b></td><td class="mono">' + (counts[String(d.name).toUpperCase()] || 0) + '</td><td class="mono">' + (d.lat !== "" && d.lat != null ? (+d.lat).toFixed(4) + ", " + (+d.lng).toFixed(4) : '<span class="badge no">none</span>') + "</td><td>" + (d.library === "hub" ? '<span class="badge ok">hub</span>' : "—") + '</td><td class="actions"><button type="button" class="btn" data-ed-d="' + esc(d.id) + '">' + icon("edit") + " Edit</button></td></tr>";
        }).join("") + "</tbody></table></div>" : '<p class="help">No districts yet.</p>';
      }
      function slist() {
        var q = window.HiveSearch.tokens($("[data-sq]", p).value), dsel = $("[data-sd]", p).value;
        var status = {}; if (calc) calc.rows.forEach(function (r) { status[r.s.id] = r.status; });
        var list = (st.data.schools || []).filter(function (x) {
          if (dsel && String(x.district).toUpperCase() !== dsel.toUpperCase()) return false;
          if (!q.length) return true; var t = window.HiveSearch.tokens([x.name, x.schoolId, x.district].join(" ")).join(" ");
          return q.every(function (w) { return t.indexOf(w) >= 0; });
        }).sort(function (a, b) { return String(a.district).localeCompare(String(b.district)) || String(a.name).localeCompare(String(b.name)); });
        var LBL = { hub: "Library Hub", library: "School library", covered: "Reached", need: "Needs access" }, LRL = { sufficient: "Enough", lacking: "Lacking", severe: "Severely lacking" };
        $("[data-slist]", p).innerHTML = list.length ? '<div class="tbl-wrap" style="max-height:480px"><table class="tbl"><thead><tr><th>School</th><th>District</th><th>Library access</th><th>Resources</th><th>Location</th><th></th></tr></thead><tbody>' + list.slice(0, 600).map(function (x) {
          var stt = status[x.id] || (x.lat === "" || x.lat == null ? "" : "need");
          return "<tr><td><b>" + esc(x.name) + "</b>" + (x.schoolId ? ' <span class="mono muted">' + esc(x.schoolId) + "</span>" : "") + "</td><td>" + esc(x.district) + "</td><td>" + (stt ? '<span class="badge' + (stt === "need" ? " no" : " ok") + '">' + LBL[stt] + "</span>" : "") + "</td><td>" + esc(LRL[x.lrStatus] || "Enough") + '</td><td class="mono">' + (x.lat !== "" && x.lat != null ? (+x.lat).toFixed(4) + ", " + (+x.lng).toFixed(4) : '<span class="badge no">missing</span>') + '</td><td class="actions"><button type="button" class="btn" data-ed-s="' + esc(x.id) + '">' + icon("edit") + " Edit</button></td></tr>";
        }).join("") + "</tbody></table></div>" + (list.length > 600 ? '<p class="help">Showing 600 of ' + list.length + ". Use the search box.</p>" : "") : '<p class="help">No schools match.</p>';
      }
      dlist(); slist();
      $("[data-sq]", p).oninput = slist; $("[data-sd]", p).onchange = slist;
      var parsed = null;
      function check() {
        var kind = $("[data-bkind]", p).value, txt = $("[data-bulk]", p).value;
        parsed = parseBulk(txt, kind);
        var bad = parsed.rows.filter(function (r) { return r._problem; }).length;
        var cols = kind === "districts" ? ["name", "lat", "lng", "library", "radiusKm"] : ["name", "schoolId", "district", "lat", "lng", "library", "learners", "lrStatus"];
        var L = { name: "Name", schoolId: "School ID", district: "District", lat: "Latitude", lng: "Longitude", library: "Library", learners: "Learners", lrStatus: "Resources", radiusKm: "Km" };
        $("[data-bout]", p).innerHTML = (parsed.errors.length ? '<p class="link-check warn">' + parsed.errors.map(esc).join("<br>") + "</p>" : "") +
          (parsed.rows.length ? '<p class="link-check ' + (bad ? "warn" : "ok") + '">' + parsed.rows.length + " rows found · columns recognised: " + esc(parsed.cols.join(", ")) + (bad ? " · " + bad + " rows have a location problem (they are still saved, but will not show on the map until fixed)" : "") + "</p>" +
            '<div class="tbl-wrap bulk-preview"><table class="tbl"><thead><tr><th>Row</th>' + cols.map(function (c) { return "<th>" + L[c] + "</th>"; }).join("") + "<th>Check</th></tr></thead><tbody>" +
            parsed.rows.slice(0, 300).map(function (r) { return '<tr class="' + (r._problem ? "bad" : "") + '"><td class="mono">' + r._row + "</td>" + cols.map(function (c) { return "<td>" + esc(r[c] == null ? "" : r[c]) + "</td>"; }).join("") + "<td>" + (r._problem ? esc(r._problem) : "OK") + "</td></tr>"; }).join("") + "</tbody></table></div>" +
            '<div class="add-row" style="margin:0"><button type="button" class="btn btn-honey" data-bimport>Save ' + parsed.rows.length + " " + kind + "</button></div>" : "");
      }
      p.onclick = function (e) {
        var b;
        if (e.target.closest("[data-news]")) HiveAdmin.add("school", {});
        else if (e.target.closest("[data-newd]")) HiveAdmin.add("district", {});
        else if ((b = e.target.closest("[data-ed-s]"))) HiveAdmin.edit("school", b.dataset.edS);
        else if ((b = e.target.closest("[data-ed-d]"))) HiveAdmin.edit("district", b.dataset.edD);
        else if (e.target.closest("[data-tpl]")) bulkTemplate($("[data-bkind]", p).value);
        else if (e.target.closest("[data-bpick]")) $("[data-bfile]", p).click();
        else if (e.target.closest("[data-bcheck]")) check();
        else if ((b = e.target.closest("[data-bimport]"))) {
          var kind = $("[data-bkind]", p).value, rows = parsed.rows.map(function (r) { var o = Object.assign({}, r); delete o._row; delete o._problem; return o; });
          busy(b, true, "Saving " + rows.length + "…");
          API.call("admin.importPlaces", { kind: kind, rows: rows }, 180000).then(function (j) {
            H.toast(j.added + " added, " + j.updated + " updated."); $("[data-bulk]", p).value = ""; $("[data-bout]", p).innerHTML = "";
            H.refresh(true).then(function () { renderPane(); });
          }).catch(function (er) { busy(b, false); fail(er); });
        }
        else if (e.target.closest("[data-coldef]")) { var dc = (window.HIVE_DEFAULT_SETTINGS || {}).mapColors || {}; $$("[data-col]", p).forEach(function (i) { i.value = dc[i.dataset.col]; }); }
        else if (e.target.closest("[data-sexport]")) {
          var head = ["School name", "School ID", "Level", "District", "Latitude", "Longitude", "Library", "Coverage km", "Learners", "Learning resources", "Notes"];
          var LIB = { hub: "Library hub", school: "School library", none: "None" }, LRL = { sufficient: "Enough", lacking: "Lacking", severe: "Severely lacking" };
          var rows = (st.data.schools || []).map(function (x) { return [x.name, x.schoolId, x.level, x.district, x.lat, x.lng, LIB[x.library] || "None", x.radiusKm, x.learners, LRL[x.lrStatus] || "Enough", x.notes]; });
          var csv = [head].concat(rows).map(function (r) { return r.map(function (c) { return H.csvCell(c); }).join(","); }).join("\r\n");
          var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv" })); a.download = "LRMS-HIVE schools.csv"; document.body.appendChild(a); a.click(); setTimeout(function () { a.remove(); }, 100);
        }
      };
      $("[data-bfile]", p).onchange = function (e) { var file = e.target.files[0]; if (!file) return; var r = new FileReader(); r.onload = function () { $("[data-bulk]", p).value = String(r.result).replace(/^﻿/, ""); check(); }; r.readAsText(file); e.target.value = ""; };
      $("[data-f]", p).onsubmit = function (e) {
        e.preventDefault(); var v = formVals(e.target), cols = {};
        $$("[data-col]", p).forEach(function (i) { cols[i.dataset.col] = i.value; });
        v.mapColors = cols; v.hubRadiusKm = +v.hubRadiusKm || 10; v.libRadiusKm = +v.libRadiusKm || 0; v.mapZoom = +v.mapZoom || 10;
        saveSettings(v, e.submitter, "Map settings saved.");
      };
    },

    menu: function (p) {
      var list = H.navItems();
      p.innerHTML = '<div class="panel"><div class="panel-head"><h3>Menu tabs</h3><button type="button" class="btn btn-honey" data-newtab>' + icon("plus") + ' Add a tab</button></div>' +
        '<p class="help">These are the tabs under the site name. Drag to change their order. A new tab can be its own page (with text, tiles and resources), open an existing folder, or open a website. Hidden tabs are kept but not shown to visitors.</p>' +
        '<ul class="nav-tabs-list" data-tabs>' + list.map(function (t) {
          var kind = t.builtin ? "Built-in page" : t.type === "link" ? "Website · " + esc(String(t.url || "").replace(/^https?:\/\//, "").slice(0, 40)) : t.type === "section" ? "Folder · " + esc((st.sec[t.sectionId] || {}).title || "missing folder") : "Page" + (function () { var n = (st.data.sections || []).filter(function (x) { return x.parentId === "tab:" + t.id; }).length; return n ? " · " + n + " tile" + (n > 1 ? "s" : "") : ""; })();
          return '<li data-id="' + esc(t.id) + '"' + (t.visible === false ? ' class="off"' : "") + '><button type="button" class="drag-handle" data-drag aria-label="Drag to move" title="Drag to move">' + icon("apps") + '</button><span class="nt-ic">' + icon(t.icon || "file") + "</span>" +
            "<span><b>" + esc(t.label) + "</b><small class=\"help\" style=\"display:block\">" + kind + (t.visible === false ? " · hidden" : "") + "</small></span>" +
            '<span class="nt-actions">' + (t.id !== "home" ? '<label class="toggle"><input type="checkbox" data-vis="' + esc(t.id) + '"' + (t.visible !== false ? " checked" : "") + "> Show</label>" : "") +
            (!t.builtin && t.type !== "link" ? '<a class="btn btn-sm" href="' + (t.type === "section" ? "#/s/" + esc(t.sectionId) : "#/t/" + esc(t.id)) + '" data-x>Open</a>' : "") +
            '<button type="button" class="btn btn-sm" data-edtab="' + esc(t.id) + '">' + icon("edit") + " Edit</button></span></li>";
        }).join("") + "</ul></div>";
      var ul = $("[data-tabs]", p);
      sortable(ul, "li", false, function (ids) { var by = {}; list.forEach(function (t) { by[t.id] = t; }); list = ids.map(function (id) { return by[id]; }).filter(Boolean); saveNav(list, null, "New order saved."); });
      p.onclick = function (e) {
        var b;
        if (e.target.closest("[data-newtab]")) tabForm({}, true);
        else if ((b = e.target.closest("[data-edtab]"))) tabForm(list.filter(function (t) { return t.id === b.getAttribute("data-edtab"); })[0], false);
        else if (e.target.closest("[data-x]")) closePanel();
      };
      p.onchange = function (e) {
        var c = e.target.closest("[data-vis]"); if (!c) return;
        list.forEach(function (t) { if (t.id === c.getAttribute("data-vis")) t.visible = c.checked; });
        c.closest("li").classList.toggle("off", !c.checked);
        saveNav(list, null, c.checked ? "Tab shown." : "Tab hidden from visitors.");
      };
    },
    announce: function (p) {
      var list = (st.data.announcements || []);
      p.innerHTML = '<div class="panel"><div class="panel-head"><h3>Announcements</h3><button type="button" class="btn btn-honey" data-new>' + icon("plus") + " Add announcement</button></div><p class=help>Shown as pinned notices at the top of the home page.</p>" +
        (list.length ? '<ul class="tree">' + list.map(function (a) { return '<li class="tree-item"><b>' + esc(a.title) + "</b>" + (notFalse(a.visible) ? "" : '<span class="badge">hidden</span>') + (a.endDate ? '<span class="mono muted">until ' + esc(String(a.endDate).slice(0, 10)) + "</span>" : "") + '<button class="btn" type="button" data-ed="' + a.id + '">' + icon("edit") + " Edit</button></li>"; }).join("") + "</ul>" : "<p class=help>No announcements.</p>") + "</div>";
      p.onclick = function (e) {
        var b;
        if ((b = e.target.closest("[data-ed]"))) announcementForm(list.find(function (x) { return x.id === b.dataset.ed; }), false);
        else if (e.target.closest("[data-new]")) announcementForm({ visible: true, linkText: "Open" }, true);
      };
    },

    branding: function (p, s) {
      p.innerHTML = '<form class="panel" data-f><h3>Logo and name</h3>' +
        '<p class="help">Live preview of the top bar — changes show here as you edit.</p>' +
        '<div class="bar-preview topbar" data-bar><span class="brand"><span class="brand-logo" data-logo></span><span class="brand-text"><strong data-pn></strong><span class="brand-tagline" data-pt></span><small data-po></small></span><span class="brand-logo brand-logo2" data-logo2 hidden></span></span></div>' +
        '<div class="panel-sub"><h4>Main logo</h4>' +
        '<div class="add-row" style="margin:0"><input type="file" accept="image/*" data-file hidden><button type="button" class="btn btn-honey btn-sm" data-pick>' + icon("image") + ' Upload a logo</button><button type="button" class="btn btn-sm" data-clear>Use the default hive logo</button></div>' +
        field("…or paste the logo image link", input("logoUrl", /^data:/.test(s.logoUrl) ? "" : s.logoUrl, 'type="url" placeholder="Google Drive image link (shared to Anyone with the link)"'), "PNG with a transparent background looks best. Big images are shrunk automatically so the site stays fast.") +
        '<input type="hidden" name="logoData" value="">' +
        '<div class="grid3">' +
          field("Size", '<select name="logoSize">' + opt("sm", "Small", s.logoSize) + opt("md", "Medium", s.logoSize) + opt("lg", "Large", s.logoSize) + opt("xl", "Extra large", s.logoSize) + "</select>") +
          field("Shape", '<select name="logoFrame">' + opt("none", "As uploaded", s.logoFrame) + opt("rounded", "Rounded square", s.logoFrame) + opt("circle", "Circle", s.logoFrame) + opt("hex", "Hexagon", s.logoFrame) + "</select>") +
          field("Background", '<select name="logoBg">' + opt("none", "None (transparent)", s.logoBg) + opt("white", "White", s.logoBg) + opt("honey", "Honey", s.logoBg) + opt("navy", "Navy", s.logoBg) + "</select>") +
        "</div>" + toggle("logoAsIcon", s.logoAsIcon, "Also use this logo as the browser tab icon") + "</div>" +
        '<div class="panel-sub"><h4>Second logo (optional)</h4><p class="help">For example the SDO or DepEd seal, shown at the right of the name.</p>' +
        '<div class="add-row" style="margin:0"><input type="file" accept="image/*" data-file2 hidden><button type="button" class="btn btn-sm" data-pick2>' + icon("image") + ' Upload second logo</button><button type="button" class="btn btn-sm btn-ghost" data-clear2>Remove</button></div>' +
        field("…or paste its image link", input("logo2Url", /^data:/.test(s.logo2Url) ? "" : s.logo2Url, 'type="url" placeholder="https://drive.google.com/file/d/…"')) + '<input type="hidden" name="logo2Data" value=""></div>' +
        '<div class="panel-sub"><h4>Name</h4>' +
        field("System name", input("siteName", s.siteName, 'maxlength="40"')) +
        field("Meaning of the name (shown on one line)", input("siteTagline", s.siteTagline), "The letters H, I, V, E are highlighted automatically.") +
        field("Office line (smaller, under the meaning)", input("orgName", s.orgName), "Example: SDO Agusan del Norte | Learning Resource Management Section") + "</div>" +
        '<div><button class="btn btn-honey" type="submit">Save logo and name</button></div></form>';
      var f = $("[data-f]", p);
      var cur = { logo: s.logoUrl || "", logo2: s.logo2Url || "" };
      function prev() {
        var v = formVals(f);
        var L = v.logoData || v.logoUrl || (/^data:/.test(cur.logo) ? cur.logo : "");
        var L2 = v.logo2Data || v.logo2Url || (/^data:/.test(cur.logo2) ? cur.logo2 : "");
        var el = $("[data-logo]", p);
        el.innerHTML = L ? '<img src="' + esc(H.Links.image(L, 256)) + '" alt="">' : H.defaultLogo;
        el.setAttribute("data-size", v.logoSize); el.setAttribute("data-frame", L ? v.logoFrame : "none"); el.setAttribute("data-bg", L ? v.logoBg : "none");
        var e2 = $("[data-logo2]", p); e2.hidden = !L2; e2.setAttribute("data-size", v.logoSize); e2.innerHTML = L2 ? '<img src="' + esc(H.Links.image(L2, 256)) + '" alt="">' : "";
        $("[data-pn]", p).textContent = v.siteName; $("[data-pt]", p).textContent = v.siteTagline; $("[data-po]", p).textContent = v.orgName;
      }
      f.addEventListener("input", prev); f.addEventListener("change", prev);
      function pick(fileInput, dataField, urlField, btn, label) {
        fileInput.onchange = function (e) {
          var file = e.target.files[0]; if (!file) return;
          shrinkImage(file, 512).then(function (small) {
            if (API.demo) { f[dataField].value = small.dataUrl; f[urlField].value = ""; prev(); H.toast("Demo mode: " + label + " kept in this browser only. Press Save."); return; }
            return uploadFile(small.file, btn).then(function (j) { f[urlField].value = j.url; f[dataField].value = ""; prev(); H.toast(label.charAt(0).toUpperCase() + label.slice(1) + " uploaded. Press Save to apply."); });
          }).catch(fail);
          e.target.value = "";
        };
      }
      pick($("[data-file]", p), "logoData", "logoUrl", $("[data-pick]", p), "logo");
      pick($("[data-file2]", p), "logo2Data", "logo2Url", $("[data-pick2]", p), "second logo");
      $("[data-pick]", p).onclick = function () { $("[data-file]", p).click(); };
      $("[data-pick2]", p).onclick = function () { $("[data-file2]", p).click(); };
      $("[data-clear]", p).onclick = function () { f.logoUrl.value = ""; f.logoData.value = ""; cur.logo = ""; prev(); };
      $("[data-clear2]", p).onclick = function () { f.logo2Url.value = ""; f.logo2Data.value = ""; cur.logo2 = ""; prev(); };
      f.onsubmit = function (e) {
        e.preventDefault();
        var v = formVals(f);
        v.logoUrl = v.logoData || v.logoUrl || (/^data:/.test(cur.logo) ? cur.logo : "");
        v.logo2Url = v.logo2Data || v.logo2Url || (/^data:/.test(cur.logo2) ? cur.logo2 : "");
        delete v.logoData; delete v.logo2Data;
        saveSettings(v, e.submitter, "Logo and name saved.");
      };
      prev();
    },

    footer: function (p, s) {
      var ft = JSON.parse(JSON.stringify(s.footer || {}));
      ft.contacts = ft.contacts || []; ft.links = ft.links || []; ft.orgLines = ft.orgLines || [];
      var ICONS = ["mail", "phone", "web", "facebook", "youtube", "pin", "link", "form"];
      function draw() {
        p.innerHTML = '<form class="panel" data-f><h3>Footer</h3><p class="help">The footer is the dark band at the bottom of every page.</p>' +
          field("Office lines (one per line — the first line is bold)", area("orgLines", ft.orgLines.join("\n"), 'rows="4"')) +
          '<div class="field"><span>Contact details</span><div class="repeat">' + ft.contacts.map(function (c, i) {
            return '<div class="repeat-row"><select data-c="' + i + '" data-k="icon">' + ICONS.map(function (k) { return opt(k, k, c.icon); }).join("") + '</select><input data-c="' + i + '" data-k="label" value="' + esc(c.label) + '" placeholder="Shown text (e.g. email address)"><input data-c="' + i + '" data-k="url" value="' + esc(c.url) + '" placeholder="Link (mailto:…, https://…, tel:…)"><button type="button" class="btn" data-rmc="' + i + '" aria-label="Remove">' + icon("trash") + "</button></div>";
          }).join("") + '</div><div><button type="button" class="btn btn-sm" data-addc>' + icon("plus") + " Add contact</button></div></div>" +
          '<div class="field"><span>Footer links</span><div class="repeat">' + ft.links.map(function (l, i) {
            return '<div class="repeat-row two"><input data-l="' + i + '" data-k="label" value="' + esc(l.label) + '" placeholder="Link text (e.g. Send feedback)"><input data-l="' + i + '" data-k="url" value="' + esc(l.url) + '" placeholder="https://forms.gle/…"><button type="button" class="btn" data-rml="' + i + '" aria-label="Remove">' + icon("trash") + "</button></div>";
          }).join("") + '</div><div><button type="button" class="btn btn-sm" data-addl>' + icon("plus") + " Add link</button></div></div>" +
          field("Small note at the very bottom", input("note", ft.note)) +
          '<div><button class="btn btn-honey" type="submit">Save footer</button></div></form>';
        var f = $("[data-f]", p);
        f.oninput = function (e) {
          var t = e.target;
          if (t.dataset.c != null) ft.contacts[+t.dataset.c][t.dataset.k] = t.value;
          if (t.dataset.l != null) ft.links[+t.dataset.l][t.dataset.k] = t.value;
          if (t.name === "orgLines") ft.orgLines = t.value.split("\n").map(function (x) { return x.trim(); }).filter(Boolean);
          if (t.name === "note") ft.note = t.value;
        };
        f.onchange = f.oninput;
        f.onclick = function (e) {
          var b;
          if (e.target.closest("[data-addc]")) { ft.contacts.push({ icon: "link", label: "", url: "" }); draw(); }
          else if (e.target.closest("[data-addl]")) { ft.links.push({ label: "", url: "" }); draw(); }
          else if ((b = e.target.closest("[data-rmc]"))) { ft.contacts.splice(+b.dataset.rmc, 1); draw(); }
          else if ((b = e.target.closest("[data-rml]"))) { ft.links.splice(+b.dataset.rml, 1); draw(); }
        };
        f.onsubmit = function (e) {
          e.preventDefault();
          ft.orgLines = f.orgLines.value.split("\n").map(function (x) { return x.trim(); }).filter(Boolean);
          ft.note = f.note.value.trim();
          saveSettings({ footer: ft }, e.submitter, "Footer saved — scroll down on the site to see it.");
        };
      }
      draw();
    },

    entry: function (p, s) {
      p.innerHTML = '<form class="panel" data-f><h3>Entry screen</h3><p class="help">After the intro animation, first-time visitors see a welcome form for their name, school, district and division, with the privacy statement. It is asked once per device. District and division are typed by the visitor.</p>' +
        toggle("entryEnabled", s.entryEnabled, "Ask visitors for their details before entering") +
        toggle("entryUppercase", s.entryUppercase, "Write all entries in CAPITAL LETTERS (recommended — keeps the visitor list uniform)") +
        field("Welcome heading", input("entryTitle", s.entryTitle, 'maxlength="80"')) +
        field("Welcome message", area("entryText", s.entryText, 'rows="3" maxlength="300"')) +
        field("Button text", input("entryButton", s.entryButton, 'maxlength="40"')) +
        field("Privacy statement", area("privacyText", s.privacyText, 'rows="9"'), "Leave a blank line between paragraphs.") +
        '<div class="add-row" style="margin:0"><button class="btn btn-honey" type="submit">Save entry screen</button><button class="btn" type="button" data-prev>Save and preview</button></div></form>';
      var f = $("[data-f]", p);
      f.onsubmit = function (e) { e.preventDefault(); saveSettings(formVals(f), e.submitter, "Entry screen saved."); };
      $("[data-prev]", p).onclick = function () {
        saveSettings(formVals(f), null, "Saved. Showing the entry screen…").then(function () { closePanel(); API.LS.del("hive.visitor"); setTimeout(function () { location.reload(); }, 600); });
      };
    },

    ai: function (p, s) {
      p.innerHTML = '<form class="panel" data-f><h3>AI assistant</h3>' +
        '<p class="help">The assistant button helps teachers who are not sure what to type. <b>Without AI</b> it answers with the best search matches (free, always works). <b>With AI</b> it uses Google Gemini to understand questions in English or Filipino and recommends only items from your catalog.</p>' +
        toggle("assistantVisible", s.assistantVisible, "Show the assistant button") +
        toggle("aiEnabled", s.aiEnabled, "Use Google Gemini AI for answers") +
        '<div class="grid2">' + field("Assistant name", input("aiName", s.aiName)) + field("Gemini model", input("aiModel", s.aiModel), "Default: gemini-3.5-flash-lite. Leave it — if Google retires a model, the assistant moves to the next working one by itself.") + "</div>" +
        field("Instructions for the AI", area("aiInstructions", s.aiInstructions, 'rows="6"')) +
        '<div><button class="btn btn-honey" type="submit">Save assistant settings</button></div></form>' +
        '<form class="panel" data-k><h3>Gemini API key</h3><p class="help">Get a free key at aistudio.google.com › Get API key. The key is kept in the Apps Script’s private Script Properties — never in the Sheet and never sent to visitors.</p>' +
        '<p>Status: <span class="badge" data-status>checking…</span></p>' +
        field("New API key", input("key", "", 'type="password" autocomplete="off" placeholder="Paste key to replace the current one"')) +
        '<div class="add-row" style="margin:0"><button class="btn btn-honey" type="submit">Save key</button><button class="btn" type="button" data-test>Test the AI</button></div><div data-out></div></form>';
      $("[data-f]", p).onsubmit = function (e) { e.preventDefault(); saveSettings(formVals(e.target), e.submitter, "Assistant settings saved."); };
      function status() { API.call("admin.aiStatus", {}).then(function (j) { var b = $("[data-status]", p); b.textContent = j.hasKey ? "key saved" : "no key yet"; b.className = "badge " + (j.hasKey ? "ok" : "no"); }).catch(function (e) { $("[data-status]", p).textContent = e.message; }); }
      status();
      $("[data-k]", p).onsubmit = function (e) {
        e.preventDefault(); var k = e.target.key.value.trim(); if (!k) return;
        busy(e.submitter, true);
        API.call("admin.setAiKey", { key: k }).then(function () { busy(e.submitter, false); e.target.key.value = ""; H.toast("Key saved."); status(); }).catch(function (er) { busy(e.submitter, false); fail(er); });
      };
      $("[data-test]", p).onclick = function (e) {
        var b = e.currentTarget; busy(b, true, "Asking Gemini…");
        API.call("admin.testAi", {}, 45000).then(function (j) { busy(b, false); $("[data-out]", p).innerHTML = '<p class="link-check ok">' + esc(j.answer) + "</p>"; }).catch(function (er) { busy(b, false); $("[data-out]", p).innerHTML = '<p class="link-check warn">' + esc(er.message) + "</p>"; });
      };
    },

    visitors: function (p, s) {
      p.innerHTML = '<form class="panel" data-count><h3>Visitor counter</h3><p class="help">The site counts each visit. To carry over the count of the old Google Site, type the number the counter should show now — new visits keep adding to it.</p>' +
        '<div class="stat-row"><div class="stat"><b data-shown>…</b><span>shown to the public</span></div><div class="stat"><b data-actual>…</b><span>real visits on LRMS-HIVE</span></div><div class="stat"><b data-today>…</b><span>visits today</span></div></div>' +
        '<div class="grid2">' + field("Set the counter to show", input("target", "", 'type="number" min="0" step="1" inputmode="numeric" placeholder="e.g. 25340"'), "Leave empty to keep the current number.") +
        field("Label", input("visitorLabel", s.visitorLabel || "Visitors", 'maxlength="30"')) + "</div>" +
        toggle("showVisitorCount", s.showVisitorCount, "Show the visitor count on the site") +
        '<div class="add-row" style="margin:0"><button class="btn btn-honey" type="submit">Save counter</button><button class="btn" type="button" data-resetc>Remove the carry-over (show real visits only)</button></div></form>' +
        '<div class="panel"><div class="panel-head"><h3>Visitors</h3><button class="btn" type="button" data-csv>' + icon("download") + " Download as CSV</button></div><p class=help>Newest first. The full list is also in the “Visitors” tab of your Google Sheet.</p>" +
        '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Date</th><th>Name</th><th>School</th><th>District</th><th>Division</th><th>Device</th></tr></thead><tbody data-rows><tr><td colspan=6>Loading…</td></tr></tbody></table></div></div>';
      var actual = 0, cf = $("[data-count]", p);
      function loadCount() {
        API.call("admin.stats", {}).then(function (j) {
          actual = +j.stats.visitsActual || 0;
          $("[data-shown]", p).textContent = Number(j.stats.visitsShown || 0).toLocaleString("en-US");
          $("[data-actual]", p).textContent = actual.toLocaleString("en-US");
          $("[data-today]", p).textContent = Number(j.stats.visitsToday || 0).toLocaleString("en-US");
        }).catch(fail);
      }
      loadCount();
      cf.onsubmit = function (e) {
        e.preventDefault(); var v = formVals(cf), out = { visitorLabel: v.visitorLabel || "Visitors", showVisitorCount: v.showVisitorCount };
        if (v.target !== "") { var t = Math.max(0, Math.round(+v.target)); if (isNaN(t)) { H.toast("Type a whole number.", "err"); return; } out.visitorOffset = Math.max(0, t - actual); }
        saveSettings(out, e.submitter, "Counter saved.").then(function () { cf.target.value = ""; loadCount(); H.loadVisits(); });
      };
      $("[data-resetc]", p).onclick = function () { saveSettings({ visitorOffset: 0 }, null, "Carry-over removed.").then(function () { loadCount(); H.loadVisits(); }); };
      var rows = [];
      API.call("admin.visitors", { limit: 500 }).then(function (j) {
        rows = j.rows || [];
        $("[data-rows]", p).innerHTML = rows.map(function (v) { return '<tr><td class="mono">' + esc(String(v.timestamp).replace("T", " ").slice(0, 16)) + "</td><td>" + esc(v.name) + "</td><td>" + esc(v.school) + "</td><td>" + esc(v.district) + "</td><td>" + esc(v.division) + '</td><td class="help">' + esc(v.device || "") + "</td></tr>"; }).join("") || "<tr><td colspan=6>No visitors yet.</td></tr>";
      }).catch(function (e) { $("[data-rows]", p).innerHTML = "<tr><td colspan=6>" + esc(e.message) + "</td></tr>"; });
      $("[data-csv]", p).onclick = function () {
        var cols = ["timestamp", "name", "school", "district", "division", "device"];
        var csv = [cols.join(",")].concat(rows.map(function (r) { return cols.map(function (c) { return H.csvCell(r[c]); }).join(","); })).join("\r\n");
        var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv" })); a.download = "lrms-hive-visitors.csv"; a.click();
      };
    },

    system: function (p, s) {
      var u = API.user() || {};
      p.innerHTML = '<div class="panel" data-deploy><div class="panel-head"><h3>Deployment check</h3><button type="button" class="btn btn-sm" data-rerun>' + icon("check") + ' Run again</button></div><p class="help">Checks the website and the Apps Script backend. Fix anything red before sharing the link with teachers.</p><div data-checks class="help">Checking…</div></div>' +
        '<form class="panel" data-pw><h3>Change my password</h3><p class="help">Logged in as <b>' + esc(u.username || "") + "</b>.</p>" +
        '<div class="grid2">' + field("Current password", input("current", "", 'type="password" autocomplete="current-password"')) + field("New password (at least 8 characters)", input("next", "", 'type="password" autocomplete="new-password" minlength="8"')) + "</div>" +
        '<div><button class="btn btn-honey" type="submit">Change password</button></div></form>' +
        '<div class="panel"><div class="panel-head"><h3>Admin accounts</h3></div><div data-admins class="help">Loading…</div>' +
        '<form data-add class="grid2">' + field("New admin username", input("username", "", 'autocomplete="off"')) + field("Display name", input("displayName", "")) + field("Password", input("password", "", 'type="password" autocomplete="new-password"')) +
        '<div class="field"><span>&nbsp;</span><button class="btn" type="submit">' + icon("plus") + " Add admin</button></div></form></div>" +
        '<form class="panel" data-sys><h3>Storage</h3>' + field("Google Drive storage folder ID or link", input("storageFolderId", s.storageFolderId, 'placeholder="https://drive.google.com/drive/folders/…"'), "Uploads from this admin panel go here. Use the folder the admin prepared.") +
        '<div class="add-row" style="margin:0"><button class="btn btn-honey" type="submit">Save storage folder</button><button class="btn" type="button" data-cache>Refresh server cache</button>' + (API.demo ? '<button class="btn btn-danger" type="button" data-reset>Reset demo data</button>' : "") + "</div></form>";
      p.innerHTML += '<div class="panel"><h3>Start fresh</h3><p class="help">Removes <b>all</b> tiles, folders, resources, news, events, announcements, schools and districts — for example the starter samples from an earlier version. Settings, logos, admins, visitor counts, feedback and reports are kept. Only the owner account can do this, and it cannot be undone (the Sheet\'s <i>File › Version history</i> can still restore it).</p>' +
        '<div class="add-row" style="margin:0;align-items:end"><label class="field" style="margin:0"><span>Type DELETE to confirm</span><input data-confirm autocomplete="off" placeholder="DELETE"></label><button class="btn btn-danger" type="button" data-fresh>' + icon("trash") + " Remove all content</button></div></div>";
      $("[data-pw]", p).onsubmit = function (e) {
        e.preventDefault(); var v = formVals(e.target);
        if (v.next.length < 8) { H.toast("The new password needs at least 8 characters.", "err"); return; }
        busy(e.submitter, true);
        API.call("admin.changePassword", { current: v.current, next: v.next }).then(function () { busy(e.submitter, false); e.target.reset(); H.toast("Password changed. Other devices signed in as you were logged out."); }).catch(function (er) { busy(e.submitter, false); fail(er); });
      };
      function runChecks() {
        var box = $("[data-checks]", p), C = window.HIVE_CONFIG || {}, list = [];
        box.textContent = "Checking…";
        function add(level, label, detail) { list.push({ level: level, label: label, detail: detail || "" }); }
        add(API.demo ? "bad" : "ok", API.demo ? "Backend not connected (demo mode)" : "Backend address is set", API.demo ? "Paste your Apps Script /exec link into API_URL in assets/js/config.js, then upload the file again." : C.API_URL.replace(/^(https:\/\/script\.google\.com\/macros\/s\/.{6}).*(\/exec)$/, "$1…$2"));
        if (!API.demo && !/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(C.API_URL)) add("warn", "API_URL does not look like a web-app link", "It should look like https://script.google.com/macros/s/…/exec (not /dev, not the editor link).");
        add(location.protocol === "https:" ? "ok" : "warn", "Site is served over https", location.protocol === "https:" ? location.host : "Open the site from its GitHub Pages https address so it can be installed and work offline.");
        add(navigator.serviceWorker && navigator.serviceWorker.controller ? "ok" : "warn", "Offline app files are active", navigator.serviceWorker && navigator.serviceWorker.controller ? "Installed as an app; works with weak signal." : "Becomes active after the first visit over https (reload once).");
        add(document.querySelector('meta[http-equiv="Content-Security-Policy"]') ? "ok" : "warn", "Security policy is on", "Only the site's own scripts can run; links like javascript: are blocked.");
        if (window.top !== window.self) add("bad", "This page is inside a frame", "Admin pages should be opened directly, not inside another site.");
        function paint() {
          var order = { bad: 0, warn: 1, info: 2, ok: 3 }, mark = { ok: "✓", warn: "!", bad: "✕", info: "i" };
          list.sort(function (a, b) { return order[a.level] - order[b.level]; });
          var bad = list.filter(function (x) { return x.level === "bad"; }).length, warn = list.filter(function (x) { return x.level === "warn"; }).length;
          box.innerHTML = '<p><b>' + (bad ? bad + " problem" + (bad > 1 ? "s" : "") + " to fix" : warn ? "Ready, with " + warn + " thing" + (warn > 1 ? "s" : "") + " to look at" : "Ready to deploy") + "</b> · site v" + esc(C.APP_VERSION || "?") + "</p>" +
            '<ul class="check-list">' + list.map(function (x) { return '<li><span class="ck ' + (x.level === "info" ? "ok" : x.level) + '">' + mark[x.level] + "</span><span>" + esc(x.label) + (x.detail ? "<small>" + esc(x.detail) + "</small>" : "") + "</span></li>"; }).join("") + "</ul>";
        }
        if (API.demo) { paint(); return; }
        API.ping().then(function (j) {
          add(j.ms < 4000 ? "ok" : "warn", "Backend answers", "Version " + (j.version || "?") + " · " + j.ms + " ms" + (j.ms >= 4000 ? " (slow — the first call after a quiet period is often slow)" : ""));
          if (j.version && C.APP_VERSION && String(j.version).split(".").slice(0, 2).join(".") !== String(C.APP_VERSION).split(".").slice(0, 2).join(".")) add("bad", "Website and backend versions differ", "Website " + C.APP_VERSION + ", backend " + j.version + ". Paste the new backend files into Apps Script and Deploy › Manage deployments › Edit › New version.");
          return API.call("admin.health", {});
        }).then(function (j) {
          (j.health.checks || []).forEach(function (c) { add(c.ok ? "ok" : c.level || "warn", c.label, c.detail); });
          paint();
        }).catch(function (e) { add("bad", "Backend check failed", e.message + (e.code === "BADREPLY" ? "" : " — if this keeps happening, open the /exec link in a browser to see the error.")); paint(); });
      }
      runChecks();
      $("[data-rerun]", p).onclick = runChecks;
      function loadAdmins() {
        API.call("admin.listAdmins", {}).then(function (j) {
          $("[data-admins]", p).innerHTML = '<ul class="tree">' + j.admins.map(function (a) { return '<li class="tree-item"><b>' + esc(a.displayName || a.username) + '</b><span class="mono muted">' + esc(a.username) + " · " + esc(a.role) + "</span>" + (a.username !== u.username ? '<button class="btn" type="button" data-rm="' + esc(a.username) + '">' + icon("trash") + "</button>" : "") + "</li>"; }).join("") + "</ul>";
        }).catch(function (e) { $("[data-admins]", p).textContent = e.message; });
      }
      loadAdmins();
      $("[data-add]", p).onsubmit = function (e) {
        e.preventDefault(); var v = formVals(e.target);
        if (!v.username || (v.password || "").length < 8) { H.toast("Enter a username and a password of at least 8 characters.", "err"); return; }
        API.call("admin.saveAdmin", v).then(function () { e.target.reset(); H.toast("Admin added."); loadAdmins(); }).catch(fail);
      };
      p.onclick = function (e) {
        var b = e.target.closest("[data-rm]"); if (b) confirmBox("Remove admin “" + b.dataset.rm + "”?", "They will no longer be able to log in.", "Remove").then(function (ok) { if (ok) API.call("admin.deleteAdmin", { username: b.dataset.rm }).then(loadAdmins).catch(fail); });
        var fr = e.target.closest("[data-fresh]");
        if (fr) {
          var cf = $("[data-confirm]", p).value.trim();
          if (cf !== "DELETE") { H.toast("Type DELETE in the box to confirm.", "err"); return; }
          busy(fr, true);
          API.call("admin.clearContent", { confirm: cf }).then(function () { return H.refresh(true); }).then(function () { busy(fr, false); $("[data-confirm]", p).value = ""; H.toast("All content removed. The site is ready for your own resources."); })
            .catch(function (er) { busy(fr, false); fail(er); });
          return;
        }
        if (e.target.closest("[data-cache]")) API.call("admin.clearCache", {}).then(function () { return H.refresh(true); }).then(function () { H.toast("Server cache refreshed."); }).catch(fail);
        if (e.target.closest("[data-reset]")) confirmBox("Reset demo data?", "All demo edits in this browser will be erased.", "Reset").then(function (ok) { if (ok) API.call("admin.resetDemo", {}).then(function () { API.LS.del("hive.data"); location.reload(); }); });
      };
      $("[data-sys]", p).onsubmit = function (e) {
        e.preventDefault(); var v = formVals(e.target); var id = H.Links.id(v.storageFolderId) || v.storageFolderId;
        saveSettings({ storageFolderId: id }, e.submitter, "Storage folder saved.");
      };
    }
  };

  /* ---------------- public ---------------- */
  var HiveAdmin = window.HiveAdmin = {
    open: openPanel,
    editTab: function (id) { var t = H.navItems().filter(function (x) { return x.id === id; })[0]; if (t) tabForm(t, false); },
    edit: function (kind, id) {
      if (kind === "section") sectionForm(st.sec[id], false);
      else if (kind === "resource") resourceForm(H.findRes(id), false);
      else if (kind === "announcement") announcementForm((st.data.announcements || []).find(function (a) { return a.id === id; }), false);
      else if (kind === "school") { var sc = (st.data.schools || []).find(function (a) { return a.id === id; }); if (sc) { var lm = window.HiveMap && window.HiveMap.current && window.HiveMap.current(); if (lm) lm.closePopup(); schoolForm(sc, false); } }
      else if (kind === "district") { var dd = (st.data.districts || []).find(function (a) { return a.id === id; }); if (dd) districtForm(dd, false); }
      else if (kind === "event") { var ee = (st.data.events || []).find(function (a) { return a.id === id; }); if (ee) eventForm(ee, false); }
      else if (kind === "news") { var nn = (st.data.news || []).find(function (a) { return a.id === id; }); if (nn) newsForm(nn, false); }
    },
    add: function (kind, d) {
      d = d || {};
      if (kind === "section") sectionForm({ parentId: d.parent || "", group: d.group || "", color: "honey", icon: "folder", visible: true, layout: "auto" }, true);
      else if (kind === "resource") resourceForm({ sectionId: d.section || "", type: "link", visible: true }, true);
      else if (kind === "announcement") announcementForm({ visible: true, linkText: "Open" }, true);
      else if (kind === "import") importForm(d.section || "");
      else if (kind === "news") newsForm({ visible: true, tag: "Activity" }, true);
      else if (kind === "event") eventForm({ visible: true, allDay: true, category: "Training" }, true);
      else if (kind === "school") schoolForm({ visible: true, library: d.library || "none", lrStatus: "sufficient", lat: d.lat || "", lng: d.lng || "", level: "Elementary" }, true);
      else if (kind === "district") districtForm({ visible: true, library: "none", lat: "", lng: "" }, true);
    }
  };

  // resume an admin session after reload
  if (API.token()) { var t = setInterval(function () { if (H.ready) { clearInterval(t); H.setEditing(true); } }, 100); }
})();
