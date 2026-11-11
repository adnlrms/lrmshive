/*
  LRMS-HIVE report engine (shared).
  The same code runs in the browser (demo mode) and inside Apps Script
  (backend/Report.gs is generated from this file), so numbers always match.
  input: { visitors, activity, feedback, resources, sections, from, to, dateOf }
    dateOf(isoTimestamp) -> "yyyy-MM-dd" in Philippine time
*/
var HiveReport = (function () {
  function inc(map, key, n) { if (key === "" || key == null) key = "(not given)"; map[key] = (map[key] || 0) + (n || 1); }
  function top(map, limit) {
    return Object.keys(map).map(function (k) { return { label: k, value: map[k] }; })
      .sort(function (a, b) { return b.value - a.value || String(a.label).localeCompare(String(b.label)); }).slice(0, limit || 50);
  }
  function months(from, to) {
    var out = [], y = +from.slice(0, 4), m = +from.slice(5, 7), ey = +to.slice(0, 4), em = +to.slice(5, 7), guard = 0;
    while ((y < ey || (y === ey && m <= em)) && guard++ < 120) { out.push(y + "-" + (m < 10 ? "0" : "") + m); m++; if (m > 12) { m = 1; y++; } }
    return out;
  }
  function norm(s) { return String(s || "").toLowerCase().replace(/\s+/g, " ").trim(); }
  function title(s) { return String(s || "").replace(/\s+/g, " ").trim().toUpperCase(); }

  function build(inp) {
    var from = inp.from, to = inp.to, dateOf = inp.dateOf;
    function inRange(ts) { var d = dateOf(ts); return d >= from && d <= to ? d : null; }
    var resById = {}, secById = {};
    (inp.resources || []).forEach(function (r) { resById[r.id] = r; });
    (inp.sections || []).forEach(function (s) { secById[s.id] = s; });

    var ms = months(from, to), visitsByMonth = {}, viewsByMonth = {}, dlByMonth = {};
    ms.forEach(function (m) { visitsByMonth[m] = 0; viewsByMonth[m] = 0; dlByMonth[m] = 0; });
    var byDistrict = {}, byDivision = {}, bySchool = {}, byDevice = {}, uniq = {}, visits = 0;
    (inp.visitors || []).forEach(function (v) {
      var d = inRange(v.timestamp); if (!d) return;
      visits++;
      uniq[v.visitorId || (norm(v.name) + "|" + norm(v.school))] = 1;
      inc(visitsByMonth, d.slice(0, 7));
      inc(byDistrict, title(v.district)); inc(byDivision, title(v.division)); inc(bySchool, title(v.school));
      inc(byDevice, String(v.device || "").split(" ·")[0] || "(not given)");
    });

    var views = 0, downloads = 0, opens = 0, useByDistrict = {}, perRes = {}, bySubject = {}, byGrade = {}, misses = {}, missLast = {};
    (inp.activity || []).forEach(function (a) {
      var d = inRange(a.timestamp); if (!d) return;
      if (a.type === "miss") {
        var q = norm(a.query); if (!q) return;
        inc(misses, q); if (!missLast[q] || missLast[q] < d) missLast[q] = d;
        return;
      }
      if (a.type !== "view" && a.type !== "download" && a.type !== "open") return;
      var r = resById[a.resourceId];
      if (a.type === "view") { views++; inc(viewsByMonth, d.slice(0, 7)); }
      else if (a.type === "download") { downloads++; inc(dlByMonth, d.slice(0, 7)); }
      else opens++;
      inc(useByDistrict, title(a.district));
      var pr = perRes[a.resourceId] || (perRes[a.resourceId] = { id: a.resourceId, views: 0, downloads: 0, opens: 0 });
      pr[a.type === "view" ? "views" : a.type === "download" ? "downloads" : "opens"]++;
      if (r) { inc(bySubject, r.subject || "(no subject)"); inc(byGrade, r.grade || "(no grade)"); }
    });

    var fb = { useful: 0, used: 0, needs: 0, comments: 0 }, fbRes = {}, latest = [];
    (inp.feedback || []).forEach(function (f) {
      var d = inRange(f.timestamp); if (!d) return;
      if (fb[f.reaction] != null) fb[f.reaction]++;
      var x = fbRes[f.resourceId] || (fbRes[f.resourceId] = { id: f.resourceId, useful: 0, used: 0, needs: 0, comments: 0 });
      if (x[f.reaction] != null) x[f.reaction]++;
      if (f.comment) { fb.comments++; x.comments++; latest.push({ date: d, resourceId: f.resourceId, title: (resById[f.resourceId] || {}).title || f.resourceTitle || f.resourceId, reaction: f.reaction, comment: f.comment, name: f.name, school: f.school, district: f.district }); }
    });
    latest.sort(function (a, b) { return a.date < b.date ? 1 : -1; });

    function resRow(id) {
      var r = resById[id] || {}, u = perRes[id] || {}, f = fbRes[id] || {};
      return { id: id, title: r.title || "(deleted resource)", section: r.sectionId && secById[r.sectionId] ? secById[r.sectionId].title : "", subject: r.subject || "", grade: r.grade || "",
        views: u.views || 0, downloads: u.downloads || 0, opens: u.opens || 0, useful: f.useful || 0, used: f.used || 0, needs: f.needs || 0, comments: f.comments || 0,
        score: (f.useful || 0) + 2 * (f.used || 0) - (f.needs || 0) };
    }
    var used = Object.keys(perRes).map(resRow).sort(function (a, b) { return (b.views + b.downloads + b.opens) - (a.views + a.downloads + a.opens); }).slice(0, 50);
    var rated = Object.keys(fbRes).map(resRow).sort(function (a, b) { return b.score - a.score || b.used - a.used; }).slice(0, 50);

    return {
      from: from, to: to,
      totals: { visits: visits, uniqueVisitors: Object.keys(uniq).length, views: views, downloads: downloads, opens: opens,
        useful: fb.useful, usedInClass: fb.used, needsImprovement: fb.needs, comments: fb.comments, misses: top(misses, 100000).reduce(function (s, x) { return s + x.value; }, 0) },
      visitsByMonth: ms.map(function (m) { return { label: m, value: visitsByMonth[m] || 0 }; }),
      useByMonth: ms.map(function (m) { return { label: m, views: viewsByMonth[m] || 0, downloads: dlByMonth[m] || 0 }; }),
      byDistrict: top(byDistrict, 40), byDivision: top(byDivision, 20), bySchool: top(bySchool, 30), byDevice: top(byDevice, 10),
      useByDistrict: top(useByDistrict, 40), bySubject: top(bySubject, 25), byGrade: top(byGrade, 20),
      topResources: used, topRated: rated, latestComments: latest.slice(0, 60),
      misses: top(misses, 40).map(function (x) { x.last = missLast[x.label]; return x; })
    };
  }
  return { build: build, months: months };
})();
if (typeof window !== "undefined") window.HiveReport = HiveReport;
