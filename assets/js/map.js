/*
  LRMS-HIVE Library Map
  - coverage engine: which schools have a library, which are reached by a Library Hub
    or a nearby school library, and which still need library access / learning resources
  - interactive Leaflet map (BSD-2, vendored in assets/vendor/leaflet, loaded only here)
    with live ripple rings on every hub's coverage area
*/
window.HiveMap = (function () {
  "use strict";
  var VENDOR = (window.HIVE_CONFIG && window.HIVE_CONFIG.VENDOR_PATH) || "assets/vendor/";
  var loading = null;
  function esc(s) { return window.Hive.esc(s); }
  function icon(n, c) { return window.hiveIcon(n, c); }
  function truthy(v) { return v === true || v === "TRUE" || v === "true" || v === 1 || v === "1"; }
  function notFalse(v) { return !(v === false || v === "FALSE" || v === "false" || v === 0 || v === "0"); }
  function num(v) { var n = parseFloat(v); return isNaN(n) ? null : n; }
  function fmtN(n) { return Number(n || 0).toLocaleString("en-US"); }

  /* ---------------- coverage engine ---------------- */
  function km(aLat, aLng, bLat, bLng) {
    var R = 6371, dLat = (bLat - aLat) * Math.PI / 180, dLng = (bLng - aLng) * Math.PI / 180;
    var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(aLat * Math.PI / 180) * Math.cos(bLat * Math.PI / 180) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
  }
  function settingsOf(st) {
    var c = st.mapColors && typeof st.mapColors === "object" ? st.mapColors : {};
    try { if (typeof st.mapColors === "string") c = JSON.parse(st.mapColors); } catch (e) {}
    var d = (window.HIVE_DEFAULT_SETTINGS || {}).mapColors || {};
    return { hubKm: num(st.hubRadiusKm) || 10, libKm: num(st.libRadiusKm) || 1,
      colors: { hub: c.hub || d.hub, library: c.library || d.library, covered: c.covered || d.covered, need: c.need || d.need, lrLacking: c.lrLacking || d.lrLacking } };
  }
  function compute(data, st) {
    var cfg = settingsOf(st);
    var schools = (data.schools || []).filter(function (s) { return notFalse(s.visible) && num(s.lat) != null && num(s.lng) != null; });
    var districts = (data.districts || []).filter(function (d) { return notFalse(d.visible); });
    var hubs = [], libs = [];
    schools.forEach(function (s) {
      if (s.library === "hub") hubs.push({ id: s.id, kind: "school", name: s.name, district: s.district, lat: +s.lat, lng: +s.lng, r: num(s.radiusKm) || cfg.hubKm });
      else if (s.library === "school") libs.push({ id: s.id, name: s.name, lat: +s.lat, lng: +s.lng, r: num(s.radiusKm) || cfg.libKm });
    });
    districts.forEach(function (d) {
      if (d.library === "hub" && num(d.lat) != null && num(d.lng) != null) hubs.push({ id: d.id, kind: "district", name: d.name + " District Library Hub", district: d.name, lat: +d.lat, lng: +d.lng, r: num(d.radiusKm) || cfg.hubKm });
    });
    var rows = schools.map(function (s) {
      var lat = +s.lat, lng = +s.lng, near = null, by = null;
      hubs.forEach(function (h) { if (h.kind === "school" && h.id === s.id) return; var d = km(lat, lng, h.lat, h.lng); if (!near || d < near.km) near = { name: h.name, km: d, r: h.r }; if (d <= h.r && (!by || d < by.km)) by = { name: h.name, km: d, type: "hub" }; });
      if (!by) libs.forEach(function (l) { if (l.id === s.id) return; var d = km(lat, lng, l.lat, l.lng); if (d <= l.r && (!by || d < by.km)) by = { name: l.name, km: d, type: "library" }; });
      var status = s.library === "hub" ? "hub" : s.library === "school" ? "library" : by ? "covered" : "need";
      var lr = s.lrStatus === "severe" || s.lrStatus === "lacking" ? s.lrStatus : "sufficient";
      return { s: s, lat: lat, lng: lng, status: status, by: by, nearestHub: near, lr: lr, learners: +s.learners || 0 };
    });
    var dmap = {};
    districts.forEach(function (d) { dmap[String(d.name).toUpperCase()] = { name: d.name, id: d.id, lat: num(d.lat), lng: num(d.lng), total: 0, library: 0, hub: 0, covered: 0, need: 0, lrNeed: 0, learnersNeed: 0, districtHub: d.library === "hub" }; });
    rows.forEach(function (r) {
      var key = String(r.s.district || "(No district)").toUpperCase();
      var d = dmap[key] || (dmap[key] = { name: r.s.district || "(No district)", id: "", lat: null, lng: null, total: 0, library: 0, hub: 0, covered: 0, need: 0, lrNeed: 0, learnersNeed: 0, districtHub: false });
      d.total++; d[r.status === "hub" ? "hub" : r.status]++;
      if (r.lr !== "sufficient") d.lrNeed++;
      if (r.status === "need") d.learnersNeed += r.learners;
    });
    var dlist = Object.keys(dmap).map(function (k) {
      var d = dmap[k];
      d.hasHub = d.hub > 0 || d.districtHub;
      d.needPct = d.total ? Math.round(d.need / d.total * 100) : 0;
      d.level = !d.total ? "none" : (!d.hasHub && d.need > 0) || d.needPct >= 50 ? "high" : d.need > 0 || d.lrNeed > 0 ? "some" : "ok";
      if ((d.lat == null || d.lng == null) && d.total) { var la = 0, ln = 0, c = 0; rows.forEach(function (r) { if (String(r.s.district).toUpperCase() === k) { la += r.lat; ln += r.lng; c++; } }); d.lat = la / c; d.lng = ln / c; }
      return d;
    }).sort(function (a, b) { return b.need - a.need || b.needPct - a.needPct || String(a.name).localeCompare(String(b.name)); });
    var t = { schools: rows.length, withLibrary: 0, hubs: hubs.length, covered: 0, need: 0, lrNeed: 0, lrSevere: 0, learners: 0, learnersNeed: 0 };
    rows.forEach(function (r) {
      if (r.status === "hub" || r.status === "library") t.withLibrary++;
      if (r.status === "covered") t.covered++;
      if (r.status === "need") { t.need++; t.learnersNeed += r.learners; }
      if (r.lr !== "sufficient") t.lrNeed++;
      if (r.lr === "severe") t.lrSevere++;
      t.learners += r.learners;
    });
    t.districts = dlist.filter(function (d) { return d.total; }).length;
    t.districtsNoHub = dlist.filter(function (d) { return d.total && !d.hasHub; }).length;
    t.districtsHigh = dlist.filter(function (d) { return d.level === "high"; }).length;
    t.reachPct = t.schools ? Math.round((t.withLibrary + t.covered) / t.schools * 100) : 0;
    return { rows: rows, hubs: hubs, libs: libs, districts: dlist, totals: t, cfg: cfg };
  }

  /* ---------------- loading Leaflet ---------------- */
  function vendorUrl(name) {
    var inl = window.HIVE_INLINE_VENDOR && window.HIVE_INLINE_VENDOR[name];
    return inl ? URL.createObjectURL(new Blob([inl], { type: name.slice(-4) === ".css" ? "text/css" : "text/javascript" })) : VENDOR + name;
  }
  function loadLeaflet() {
    if (window.L) return Promise.resolve();
    if (loading) return loading;
    loading = new Promise(function (res, rej) {
      var css = document.createElement("link"); css.rel = "stylesheet"; css.href = vendorUrl("leaflet/leaflet.css"); document.head.appendChild(css);
      var s = document.createElement("script"); s.src = vendorUrl("leaflet/leaflet.js");
      s.onload = function () { res(); }; s.onerror = function () { loading = null; rej(new Error("The map could not load. Please check your internet connection.")); };
      document.head.appendChild(s);
    });
    return loading;
  }

  var TILES = {
    osm: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png", '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors', 19],
    light: ["https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>', 20],
    satellite: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", "Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics", 19]
  };
  var STATUS = {
    hub: ["Library Hub", "hub"], library: ["Has a school library", "library"], covered: ["Reached by a nearby hub or library", "covered"], need: ["Needs library access", "need"]
  };
  var LR = { sufficient: "Enough learning resources", lacking: "Lacking learning resources", severe: "Severely lacking learning resources" };

  /* ---------------- page ---------------- */
  var view = null; // current mounted map state
  function statCards(t) {
    var C = [
      [t.schools, "schools on the map", "school", ""], [t.withLibrary, "have their own library", "library", "library"], [t.hubs, "Library Hubs", "hex", "hub"],
      [t.covered, "reached by a hub or nearby library", "check", "covered"], [t.need, "schools need library access", "pin", "need"],
      [t.lrNeed, "schools lack learning resources", "book", "lrLacking"], [t.districtsNoHub + " / " + t.districts, "districts without a Library Hub", "people", "need"],
      [fmtN(t.learnersNeed), "learners without library access", "people", "need"]
    ];
    return '<div class="map-stats">' + C.map(function (c) { return '<div class="mstat' + (c[3] ? " k-" + c[3] : "") + '"><span class="mstat-ic">' + icon(c[2]) + "</span><b>" + (typeof c[0] === "number" ? fmtN(c[0]) : c[0]) + "</b><span>" + c[1] + "</span></div>"; }).join("") +
      '</div><div class="reach"><div class="reach-bar"><i style="width:' + t.reachPct + '%"></i></div><span><b>' + t.reachPct + "%</b> of mapped schools have a library or are reached by one</span></div>";
  }
  function districtTable(c) {
    if (!c.districts.length) return '<p class="muted">No districts yet.</p>';
    return '<div class="tbl-wrap"><table class="tbl dtable"><thead><tr><th>District</th><th>Schools</th><th>With library</th><th>Reached</th><th>Need access</th><th>Lack resources</th><th>Hub</th></tr></thead><tbody>' +
      c.districts.map(function (d) {
        return '<tr class="lvl-' + d.level + '" data-district="' + esc(d.name) + '" tabindex="0"><td><b>' + esc(d.name) + '</b></td><td class="mono">' + d.total + '</td><td class="mono">' + (d.library + d.hub) + '</td><td class="mono">' + d.covered +
          '</td><td><span class="needbar"><i style="width:' + d.needPct + '%"></i></span><span class="mono">' + d.need + (d.total ? " (" + d.needPct + "%)" : "") + '</span></td><td class="mono">' + d.lrNeed + "</td><td>" + (d.hasHub ? '<span class="badge ok">Yes</span>' : '<span class="badge no">None</span>') + "</td></tr>";
      }).join("") + "</tbody></table></div>";
  }
  function needList(c) {
    var list = c.rows.filter(function (r) { return r.status === "need" || r.lr !== "sufficient"; })
      .sort(function (a, b) { return (a.status === "need" ? 0 : 1) - (b.status === "need" ? 0 : 1) || (a.lr === "severe" ? 0 : 1) - (b.lr === "severe" ? 0 : 1) || String(a.s.district).localeCompare(String(b.s.district)); });
    if (!list.length) return '<p class="muted">Every mapped school has library access and enough learning resources.</p>';
    return '<ul class="need-list">' + list.map(function (r) {
      return '<li><button type="button" data-school="' + esc(r.s.id) + '"><span class="ndot k-' + (r.status === "need" ? "need" : "lrLacking") + '"></span><span><b>' + esc(r.s.name) + "</b><small>" + esc(r.s.district || "") +
        (r.status === "need" ? " · needs library access" + (r.nearestHub ? " · nearest hub " + r.nearestHub.km.toFixed(1) + " km" : "") : "") + (r.lr !== "sufficient" ? " · " + LR[r.lr].toLowerCase() : "") + "</small></span></button></li>";
    }).join("") + "</ul>";
  }
  function pageHTML(data, st, editing) {
    var c = compute(data, st), col = c.cfg.colors;
    var vars = "--k-hub:" + col.hub + ";--k-library:" + col.library + ";--k-covered:" + col.covered + ";--k-need:" + col.need + ";--k-lrLacking:" + col.lrLacking;
    var out = '<div class="mappage" style="' + vars + '">';
    out += '<nav class="crumbs"><a class="btn btn-back" href="#/">' + icon("down", "rot-back") + ' Back</a><ol><li><a href="#/">Home</a></li><li aria-current="page">' + esc(st.mapTitle || "Library Map") + "</li></ol></nav>";
    out += '<header class="page-hero"><span class="tile-badge big tone-leaf">' + icon("pin") + "</span><div><h1>" + esc(st.mapTitle || "Library Map") + "</h1><p>" + esc(st.mapIntro || "") + "</p></div>" +
      (editing ? '<div class="add-row" style="margin:0"><button type="button" class="btn btn-honey" data-add="school">' + icon("plus") + ' Add a school</button><button type="button" class="btn" data-admin-tab="map">' + icon("sheet") + " Bulk input</button></div>" : "") + "</header>";
    out += statCards(c.totals);
    out += '<div class="map-tools">' +
      '<div class="seg" role="group" aria-label="Color schools by"><span>Color schools by</span><button type="button" class="on" data-colorby="access">Library access</button><button type="button" data-colorby="lr">Learning resources</button></div>' +
      '<div class="chips map-layers">' + [["hubs", "Hubs and coverage", "hub"], ["libs", "School libraries", "library"], ["covered", "Reached schools", "covered"], ["need", "Need access", "need"], ["labels", "District labels", ""], ["ripple", "Ripple animation", "hub"]]
        .map(function (l) { return '<button type="button" class="chip on" data-layer="' + l[0] + '" aria-pressed="true">' + (l[2] ? '<i class="ndot k-' + l[2] + '"></i>' : "") + l[1] + "</button>"; }).join("") + "</div>" +
      '<div class="map-find"><label class="filter" style="margin:0">' + icon("search") + '<input id="map-find" list="map-places" placeholder="Find a school or district"></label><datalist id="map-places">' +
        c.rows.map(function (r) { return '<option value="' + esc(r.s.name) + '">'; }).join("") + c.districts.map(function (d) { return '<option value="' + esc(d.name) + ' (district)">'; }).join("") + "</datalist>" +
        '<select id="map-tiles" aria-label="Map style">' + [["osm", "Street map"], ["light", "Light map"], ["satellite", "Satellite"]].map(function (t) { return '<option value="' + t[0] + '"' + ((st.mapTiles || "osm") === t[0] ? " selected" : "") + ">" + t[1] + "</option>"; }).join("") + "</select>" +
        '<button type="button" class="btn" id="map-plan" aria-pressed="false">' + icon("hex") + ' Plan a new hub</button><button type="button" class="btn" id="map-full">' + icon("external") + " Full screen</button>" + "</div></div>";
    out += '<div class="map-wrap" id="map-wrap"><div id="hive-map" class="hive-map" role="application" aria-label="Library map"><div class="map-loading">' + icon("hex", "spin") + " Loading the map…</div></div>" +
      '<div class="map-legend" id="map-legend"></div><div class="plan-box" id="plan-box" hidden></div></div>';
    out += '<div class="twocol map-lists"><section><div class="sec-head"><h2>Districts</h2><span class="mono muted">tap a row to zoom in</span></div>' + districtTable(c) + "</section>" +
      '<section><div class="sec-head"><h2>Schools that need help</h2><button type="button" class="btn btn-sm btn-ghost" id="map-csv">' + icon("download") + " CSV</button></div>" + needList(c) + "</section></div>";
    out += '<p class="map-note">Coverage: a Library Hub reaches schools within <b>' + c.cfg.hubKm + " km</b>; a school library also reaches schools within <b>" + c.cfg.libKm + " km</b> (individual places can have their own distance). Distances are straight-line.</p></div>";
    return { html: out, calc: c };
  }

  function legendHTML(colorBy, col) {
    var items = colorBy === "lr"
      ? [[col.library, LR.sufficient], [col.lrLacking, LR.lacking], [col.need, LR.severe], [col.hub, "Library Hub coverage", "ring"]]
      : [[col.hub, "Library Hub (and its coverage)", "hex"], [col.library, STATUS.library[0]], [col.covered, STATUS.covered[0]], [col.need, STATUS.need[0]]];
    return "<b>Legend</b>" + items.map(function (i) { return '<span><i class="lg ' + (i[2] || "") + '" style="--c:' + i[0] + '"></i>' + esc(i[1]) + "</span>"; }).join("");
  }

  function mount(root, data, st, opts) {
    opts = opts || {};
    if (view) { try { view.destroy(); } catch (e) {} view = null; }
    var built = pageHTML(data, st, opts.editing);
    root.innerHTML = built.html;
    var c = built.calc, col = c.cfg.colors, state = { colorBy: "access", layers: { hubs: 1, libs: 1, covered: 1, need: 1, labels: 1, ripple: notFalse(st.mapRipple) ? 1 : 0 }, plan: false };
    if (!state.layers.ripple) { var rb = root.querySelector('[data-layer="ripple"]'); rb.classList.remove("on"); rb.setAttribute("aria-pressed", "false"); }
    var legend = root.querySelector("#map-legend"); legend.innerHTML = legendHTML("access", col);
    var map, groups = {}, markers = {}, ripples = [], tileLayer, planLayer, destroyed = false;

    function schoolColor(r) {
      if (state.colorBy === "lr") return r.lr === "severe" ? col.need : r.lr === "lacking" ? col.lrLacking : col.library;
      return r.status === "hub" ? col.hub : r.status === "library" ? col.library : r.status === "covered" ? col.covered : col.need;
    }
    function popupHTML(r) {
      var s = r.s;
      return '<div class="mpop"><b>' + esc(s.name) + "</b>" + (s.schoolId ? '<small>School ID ' + esc(s.schoolId) + "</small>" : "") +
        '<span class="mpop-row">' + esc([s.level, s.district ? s.district + " District" : ""].filter(Boolean).join(" · ")) + "</span>" +
        '<span class="mpop-tag" style="--c:' + (r.status === "need" ? col.need : r.status === "covered" ? col.covered : r.status === "hub" ? col.hub : col.library) + '">' + STATUS[r.status][0] + "</span>" +
        (r.by ? '<span class="mpop-row">Reached by ' + esc(r.by.name) + " (" + r.by.km.toFixed(1) + " km)</span>" : "") +
        (r.status === "need" && r.nearestHub ? '<span class="mpop-row">Nearest hub: ' + esc(r.nearestHub.name) + " — " + r.nearestHub.km.toFixed(1) + " km away</span>" : "") +
        '<span class="mpop-tag" style="--c:' + (r.lr === "severe" ? col.need : r.lr === "lacking" ? col.lrLacking : col.library) + '">' + LR[r.lr] + "</span>" +
        (r.learners ? '<span class="mpop-row">' + fmtN(r.learners) + " learners</span>" : "") + (s.notes ? '<span class="mpop-row muted">' + esc(s.notes) + "</span>" : "") +
        '<span class="mpop-acts"><a href="https://www.google.com/maps/dir/?api=1&destination=' + r.lat + "," + r.lng + '" target="_blank" rel="noopener">Directions</a>' +
        (opts.editing ? '<button type="button" class="btn btn-sm" data-edit="school" data-id="' + esc(s.id) + '">Edit</button>' : "") + "</span></div>";
    }
    function metersPerPixel(lat) { return 40075016.686 * Math.cos(lat * Math.PI / 180) / Math.pow(2, map.getZoom() + 8); }
    function sizeRipples() {
      ripples.forEach(function (rp) {
        var d = Math.round(2 * rp.h.r * 1000 / metersPerPixel(rp.h.lat));
        var el = rp.m.getElement(); if (!el) return;
        var tooBig = d > 3000;
        el.style.display = tooBig || !state.layers.ripple || !state.layers.hubs ? "none" : "";
        if (tooBig) return;
        el.style.width = el.style.height = d + "px"; el.style.marginLeft = el.style.marginTop = (-d / 2) + "px";
      });
    }
    function draw() {
      var L = window.L;
      Object.keys(groups).forEach(function (k) { groups[k].clearLayers(); });
      ripples = []; markers = {};
      // coverage circles + ripples
      c.hubs.forEach(function (h) {
        L.circle([h.lat, h.lng], { radius: h.r * 1000, color: col.hub, weight: 2, opacity: .85, fillColor: col.hub, fillOpacity: .1, dashArray: "6 6", interactive: false }).addTo(groups.cover);
        var rp = L.marker([h.lat, h.lng], { interactive: false, keyboard: false, icon: L.divIcon({ className: "ripple", html: '<span style="--c:' + col.hub + '"><i></i><i></i><i></i></span>', iconSize: null }) }).addTo(groups.ripple);
        ripples.push({ m: rp, h: h });
        var m = L.marker([h.lat, h.lng], { title: h.name, riseOnHover: true, icon: L.divIcon({ className: "hub-pin", html: '<span style="--c:' + col.hub + '">' + icon("library") + "</span>", iconSize: [40, 40], iconAnchor: [20, 20] }) }).addTo(groups.hubs);
        m.bindTooltip(esc(h.name) + " · reaches " + h.r + " km", { direction: "top", offset: [0, -18] });
        if (h.kind === "district") m.bindPopup('<div class="mpop"><b>' + esc(h.name) + '</b><span class="mpop-tag" style="--c:' + col.hub + '">District Library Hub</span><span class="mpop-row">Reaches schools within ' + h.r + " km</span></div>");
      });
      c.libs.forEach(function (l) { L.circle([l.lat, l.lng], { radius: l.r * 1000, color: col.library, weight: 1, opacity: .7, fillColor: col.library, fillOpacity: .08, interactive: false }).addTo(groups.libcover); });
      c.rows.forEach(function (r) {
        var grp = r.status === "hub" ? null : r.status === "library" ? groups.libs : r.status === "covered" ? groups.covered : groups.need;
        var color = schoolColor(r), m;
        if (r.status === "hub") { m = L.circleMarker([r.lat, r.lng], { radius: 0, opacity: 0, fillOpacity: 0 }).addTo(groups.hubs); }
        else m = L.circleMarker([r.lat, r.lng], { radius: r.status === "need" ? 8 : 7, color: "#fff", weight: 2, fillColor: color, fillOpacity: 1, className: r.status === "need" && state.colorBy === "access" ? "mk-need" : "" }).addTo(grp);
        m.bindPopup(popupHTML(r), { maxWidth: 280 });
        if (r.status !== "hub") m.bindTooltip(esc(r.s.name), { direction: "top", offset: [0, -6] });
        markers[r.s.id] = m;
      });
      c.districts.forEach(function (d) {
        if (d.lat == null || !d.total && !opts.editing) return;
        var lm = L.marker([d.lat, d.lng], { keyboard: false, icon: L.divIcon({ className: "dlabel-wrap", html: '<span class="dlabel lvl-' + d.level + '">' + esc(d.name) + (d.need ? " · <b>" + d.need + " need</b>" : "") + "</span>", iconSize: null }) }).addTo(groups.labels);
        lm.on("click", function () { focusDistrict(d.name); });
      });
      applyLayers(); setTimeout(sizeRipples, 0);
    }
    function applyLayers() {
      var on = state.layers;
      [["cover", on.hubs], ["ripple", on.hubs && on.ripple], ["hubs", on.hubs], ["libcover", on.libs], ["libs", on.libs], ["covered", on.covered], ["need", on.need], ["labels", on.labels]].forEach(function (x) {
        if (x[1]) { if (!map.hasLayer(groups[x[0]])) groups[x[0]].addTo(map); } else if (map.hasLayer(groups[x[0]])) map.removeLayer(groups[x[0]]);
      });
      sizeRipples();
    }
    function boundsOf(list) { var L = window.L; return L.latLngBounds(list.map(function (p) { return [p.lat, p.lng]; })); }
    function focusDistrict(name) {
      var key = String(name).toUpperCase().replace(/ \(DISTRICT\)$/, "");
      var pts = c.rows.filter(function (r) { return String(r.s.district).toUpperCase() === key; });
      var d = c.districts.filter(function (x) { return String(x.name).toUpperCase() === key; })[0];
      if (!pts.length && d && d.lat != null) pts = [{ lat: d.lat, lng: d.lng }];
      if (!pts.length) return;
      root.querySelector("#map-wrap").scrollIntoView({ behavior: "smooth", block: "center" });
      if (pts.length === 1) map.flyTo([pts[0].lat, pts[0].lng], 14); else map.flyToBounds(boundsOf(pts).pad(0.35), { maxZoom: 14 });
      Array.prototype.forEach.call(root.querySelectorAll(".dtable tr"), function (tr) { tr.classList.toggle("sel", String(tr.dataset.district).toUpperCase() === key); });
    }
    function focusSchool(id) {
      var r = c.rows.filter(function (x) { return x.s.id === id; })[0]; if (!r) return;
      root.querySelector("#map-wrap").scrollIntoView({ behavior: "smooth", block: "center" });
      map.flyTo([r.lat, r.lng], 15);
      setTimeout(function () { if (markers[id]) markers[id].openPopup(); }, 900);
    }
    function setPlan(on) {
      state.plan = on;
      var b = root.querySelector("#map-plan"); b.classList.toggle("btn-honey", on); b.setAttribute("aria-pressed", on);
      root.querySelector("#hive-map").classList.toggle("planning", on);
      var box = root.querySelector("#plan-box");
      if (!on) { box.hidden = true; if (planLayer) { planLayer.clearLayers(); } return; }
      box.hidden = false; box.innerHTML = "<b>Plan a new Library Hub</b><p>Tap anywhere on the map to see which schools a new hub there would reach. You can drag the pin.</p>";
    }
    function planAt(latlng) {
      var L = window.L; planLayer.clearLayers();
      var r = c.cfg.hubKm, reach = c.rows.filter(function (x) { return km(latlng.lat, latlng.lng, x.lat, x.lng) <= r; });
      var newly = reach.filter(function (x) { return x.status === "need"; }), lr = reach.filter(function (x) { return x.lr !== "sufficient"; });
      L.circle(latlng, { radius: r * 1000, color: "#13283F", weight: 2, dashArray: "4 6", fillColor: col.hub, fillOpacity: .14 }).addTo(planLayer);
      var pin = L.marker(latlng, { draggable: true, icon: L.divIcon({ className: "hub-pin plan", html: '<span style="--c:#13283F">' + icon("plus") + "</span>", iconSize: [40, 40], iconAnchor: [20, 20] }) }).addTo(planLayer);
      pin.on("dragend", function () { planAt(pin.getLatLng()); });
      var learners = newly.reduce(function (s, x) { return s + x.learners; }, 0);
      var box = root.querySelector("#plan-box");
      box.innerHTML = "<b>A new hub here would reach</b>" + '<div class="plan-nums"><span><b>' + newly.length + "</b> schools that now need access</span><span><b>" + fmtN(learners) + "</b> more learners</span><span><b>" + reach.length + "</b> schools in all within " + r + " km</span><span><b>" + lr.length + "</b> lacking learning resources</span></div>" +
        (newly.length ? '<ul class="plan-list">' + newly.slice(0, 8).map(function (x) { return "<li>" + esc(x.s.name) + " <small>" + km(latlng.lat, latlng.lng, x.lat, x.lng).toFixed(1) + " km</small></li>"; }).join("") + (newly.length > 8 ? "<li>…and " + (newly.length - 8) + " more</li>" : "") + "</ul>" : "") +
        '<small class="muted">' + latlng.lat.toFixed(5) + ", " + latlng.lng.toFixed(5) + "</small>" +
        '<div class="add-row" style="margin:.4rem 0 0"><button type="button" class="btn btn-sm" data-plan-clear>Clear</button>' + (opts.editing ? '<button type="button" class="btn btn-sm btn-honey" data-plan-add="' + latlng.lat.toFixed(6) + "," + latlng.lng.toFixed(6) + '">Save as a hub location</button>' : "") + "</div>";
    }

    loadLeaflet().then(function () {
      if (destroyed) return;
      var L = window.L, el = root.querySelector("#hive-map");
      el.innerHTML = "";
      var center = String(st.mapCenter || "9.08,125.48").split(",").map(parseFloat);
      map = L.map(el, { zoomControl: true, scrollWheelZoom: false, tap: true, worldCopyJump: false, preferCanvas: false });
      map.setView([center[0] || 9.08, center[1] || 125.48], +st.mapZoom || 10);
      function setTiles(k) { var t = TILES[k] || TILES.osm; if (tileLayer) map.removeLayer(tileLayer); tileLayer = L.tileLayer(t[0], { attribution: t[1], maxZoom: t[2], crossOrigin: true }).addTo(map); }
      setTiles(st.mapTiles || "osm");
      ["cover", "libcover", "ripple", "libs", "covered", "need", "hubs", "labels"].forEach(function (k) { groups[k] = L.layerGroup(); });
      planLayer = L.layerGroup().addTo(map);
      draw();
      var pts = c.rows.length ? c.rows : c.districts.filter(function (d) { return d.lat != null; });
      if (pts.length > 1) map.fitBounds(boundsOf(pts).pad(0.06), { maxZoom: 13, padding: [20, 20] });
      function zoomClass() { el.classList.toggle("z-low", map.getZoom() < 10); el.classList.toggle("z-mid", map.getZoom() < 12); }
      zoomClass();
      map.on("zoomend", function () { sizeRipples(); zoomClass(); });
      map.on("click", function (e) {
        if (state.plan) { planAt(e.latlng); return; }
        if (opts.editing && opts.onPick && root.querySelector("#hive-map").classList.contains("picking")) opts.onPick(e.latlng);
      });
      map.on("focus", function () { map.scrollWheelZoom.enable(); });
      map.on("blur", function () { map.scrollWheelZoom.disable(); });
      root.querySelector("#map-tiles").onchange = function (e) { setTiles(e.target.value); };
      setTimeout(function () { map.invalidateSize(); sizeRipples(); }, 200);
    }).catch(function (err) { var el = root.querySelector("#hive-map"); if (el) el.innerHTML = '<div class="map-loading">' + esc(err.message) + "</div>"; });

    root.addEventListener("click", onClick);
    function onClick(e) {
      var b;
      if ((b = e.target.closest("[data-layer]"))) {
        var k = b.dataset.layer; state.layers[k] = state.layers[k] ? 0 : 1; b.classList.toggle("on", !!state.layers[k]); b.setAttribute("aria-pressed", !!state.layers[k]);
        if (map) applyLayers(); return;
      }
      if ((b = e.target.closest("[data-colorby]"))) {
        state.colorBy = b.dataset.colorby;
        Array.prototype.forEach.call(root.querySelectorAll("[data-colorby]"), function (x) { x.classList.toggle("on", x === b); });
        legend.innerHTML = legendHTML(state.colorBy, col); if (map) draw(); return;
      }
      if ((b = e.target.closest("[data-district]"))) { focusDistrict(b.dataset.district); return; }
      if ((b = e.target.closest("[data-school]"))) { focusSchool(b.dataset.school); return; }
      if (e.target.closest("#map-plan")) { setPlan(!state.plan); return; }
      if (e.target.closest("[data-plan-clear]")) { planLayer.clearLayers(); setPlan(true); return; }
      if ((b = e.target.closest("[data-plan-add]")) && window.HiveAdmin) { var ll = b.dataset.planAdd.split(","); window.HiveAdmin.add("school", { lat: ll[0], lng: ll[1], library: "hub" }); return; }
      if (e.target.closest("#map-full")) { window.Hive.fullscreen(root.querySelector("#map-wrap")); setTimeout(function () { if (map) { map.invalidateSize(); sizeRipples(); } }, 400); return; }
      if (e.target.closest("#map-csv")) {
        var rows = c.rows.filter(function (r) { return r.status === "need" || r.lr !== "sufficient"; }).map(function (r) {
          return [r.s.name, r.s.schoolId, r.s.district, r.s.level, STATUS[r.status][0], LR[r.lr], r.learners, r.nearestHub ? r.nearestHub.name : "", r.nearestHub ? r.nearestHub.km.toFixed(1) : "", r.lat, r.lng];
        });
        var head = ["School", "School ID", "District", "Level", "Library access", "Learning resources", "Learners", "Nearest hub", "Km to nearest hub", "Latitude", "Longitude"];
        var csv = [head].concat(rows).map(function (r) { return r.map(function (x) { return window.Hive.csvCell(x); }).join(","); }).join("\r\n");
        var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv" })); a.download = "LRMS-HIVE schools that need help.csv"; document.body.appendChild(a); a.click(); setTimeout(function () { a.remove(); }, 100);
      }
    }
    root.querySelector("#map-find").addEventListener("change", function (e) {
      var v = e.target.value.trim(); if (!v) return;
      if (/\(district\)$/i.test(v)) { focusDistrict(v); return; }
      var r = c.rows.filter(function (x) { return String(x.s.name).toUpperCase() === v.toUpperCase(); })[0] || c.rows.filter(function (x) { return String(x.s.name).toUpperCase().indexOf(v.toUpperCase()) >= 0; })[0];
      if (r) focusSchool(r.s.id); else focusDistrict(v);
    });
    root.addEventListener("keydown", function (e) { var tr = e.target.closest && e.target.closest("tr[data-district]"); if (tr && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); focusDistrict(tr.dataset.district); } });
    view = { destroy: function () { destroyed = true; root.removeEventListener("click", onClick); if (map) map.remove(); }, map: function () { return map; } };
    return view;
  }
  function unmount() { if (view) { try { view.destroy(); } catch (e) {} view = null; } }

  /* small picker map for the admin forms */
  function picker(el, lat, lng, onPick) {
    return loadLeaflet().then(function () {
      var L = window.L, st = window.Hive.state.settings, center = String(st.mapCenter || "9.08,125.48").split(",").map(parseFloat);
      var m = L.map(el, { scrollWheelZoom: true }); var has = num(lat) != null && num(lng) != null;
      m.setView(has ? [+lat, +lng] : center, has ? 15 : (+st.mapZoom || 10));
      var t = TILES[st.mapTiles] || TILES.osm; L.tileLayer(t[0], { attribution: t[1], maxZoom: t[2] }).addTo(m);
      var pinIcon = L.divIcon({ className: "pick-pin", html: "<span></span>", iconSize: [26, 36], iconAnchor: [13, 34] });
      var pin = has ? L.marker([+lat, +lng], { draggable: true, icon: pinIcon }).addTo(m) : null;
      function set(ll) { if (!pin) pin = L.marker(ll, { draggable: true, icon: pinIcon }).addTo(m); pin.setLatLng(ll); pin.off("dragend"); pin.on("dragend", function () { onPick(pin.getLatLng()); }); onPick(ll); }
      if (pin) pin.on("dragend", function () { onPick(pin.getLatLng()); });
      m.on("click", function (e) { set(e.latlng); });
      setTimeout(function () { m.invalidateSize(); }, 250);
      return { map: m, set: function (a, b) { var ll = L.latLng(+a, +b); set(ll); m.setView(ll, Math.max(m.getZoom(), 14)); }, destroy: function () { m.remove(); } };
    });
  }

  function current() { return view && view.map ? view.map() : null; }
  return { compute: compute, mount: mount, unmount: unmount, picker: picker, current: current, km: km, LR: LR, STATUS: STATUS, settingsOf: settingsOf };
})();
