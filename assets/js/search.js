/*
  HiveSearch — instant, in-browser search.
  The whole catalog is indexed once after loading (a few milliseconds for
  thousands of items), so every keystroke searches locally with no server trip.
  Ranking: exact word > word start > one-typo match, weighted by field
  (title > tags > grade/subject > section > description). All query words must
  match; if none do, it falls back to "closest matches".
*/
window.HiveSearch = (function () {
  var SYN = {
    math: ["mathematics"], mathematics: ["math"], sci: ["science"], eng: ["english"], fil: ["filipino"],
    ap: ["araling", "panlipunan"], esp: ["values", "pagpapakatao"], gmrc: ["values"], tle: ["technology", "livelihood"],
    mapeh: ["music", "arts", "health"], ppt: ["slides", "powerpoint"], powerpoint: ["ppt", "slides"], slides: ["ppt"],
    dll: ["daily", "lesson", "log"], dlp: ["daily", "lesson", "plan"], le: ["exemplar"], cg: ["curriculum", "guide"],
    memo: ["memorandum", "memoranda"], memorandum: ["memo"], memoranda: ["memo"], kinder: ["kindergarten"], kindergarten: ["kinder"],
    als: ["alternative", "learning"], video: ["youtube", "multimedia"], ebook: ["book"], book: ["ebook", "storybook"],
    storybook: ["book"], modules: ["module"], module: ["modules"], worksheets: ["worksheet"], worksheet: ["worksheets"],
    shs: ["senior"], jhs: ["junior"], catchup: ["catch"], game: ["games", "app"], app: ["apps", "tool"], form: ["template"],
    template: ["templates", "form"], guidelines: ["guide", "guideline"], guide: ["guidelines"], reading: ["read", "literacy"],
    pagbasa: ["reading", "filipino"], aralin: ["lesson"], lesson: ["aralin", "lessons"], lessons: ["lesson"]
  };
  var TYPE_WORDS = { pdf: "pdf", doc: "doc document", slides: "slides ppt presentation", sheet: "sheet spreadsheet excel",
    video: "video", folder: "folder", link: "link website", app: "app game tool", book: "book ebook", image: "image picture", audio: "audio", note: "page" };

  function norm(s) { s = String(s == null ? "" : s).toLowerCase(); return s.normalize ? s.normalize("NFD").replace(/[\u0300-\u036f]/g, "") : s; }
  function canon(s) {
    return norm(s)
      .replace(/\bgrades?\s*(\d{1,2})\b/g, " g$1 ")
      .replace(/\bquarter\s*(\d)\b/g, " q$1 ")
      .replace(/\bcatch[\s-]*up\b/g, " catchup ")
      .replace(/\bk\s*(?:to|-)\s*12\b/g, " k12 ");
  }
  function tokens(s) { return canon(s).split(/[^a-z0-9]+/).filter(Boolean); }

  function lev1(a, b, max) { // bounded Levenshtein
    if (Math.abs(a.length - b.length) > max) return max + 1;
    var prev = [], cur, i, j;
    for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) {
      cur = [i]; var rowMin = i;
      for (j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (cur[j] < rowMin) rowMin = cur[j];
      }
      if (rowMin > max) return max + 1;
      prev = cur;
    }
    return prev[b.length];
  }

  var docs = [], post = {}, terms = [];

  function add(i, text, w) {
    tokens(text).forEach(function (t) {
      var p = post[t] || (post[t] = {});
      p[i] = Math.max(p[i] || 0, w);
    });
  }

  function build(data, pathOf) {
    docs = []; post = {};
    (data.sections || []).forEach(function (s) {
      if (s.visible === false || s.visible === "FALSE") return;
      docs.push({ kind: "section", item: s });
    });
    (data.resources || []).forEach(function (r) {
      if (r.visible === false || r.visible === "FALSE") return;
      docs.push({ kind: "resource", item: r });
    });
    docs.forEach(function (d, i) {
      var x = d.item, path = pathOf ? pathOf(d.kind === "section" ? x.parentId : x.sectionId) : "";
      d.path = path;
      add(i, x.title, 10);
      add(i, x.tags, 6);
      add(i, (x.grade || "") + " " + (x.subject || "") + " " + (x.quarter || ""), 5);
      add(i, x.author, 3);
      add(i, path, 3);
      add(i, x.subtitle || "", 3);
      add(i, TYPE_WORDS[x.type] || "", 2);
      add(i, x.description, 2);
      add(i, x.body ? String(x.body).slice(0, 2000) : "", 1);
    });
    terms = Object.keys(post);
    return docs.length;
  }

  function matchToken(qt) {
    var hits = {};
    function take(term, f) {
      var p = post[term]; if (!p) return;
      for (var k in p) { var v = p[k] * f; if (!hits[k] || hits[k] < v) hits[k] = v; }
    }
    take(qt, 1);
    if (qt.length >= 2) terms.forEach(function (t) { if (t !== qt && t.indexOf(qt) === 0) take(t, 0.72); });
    if (qt.length >= 4) {
      var max = qt.length >= 7 ? 2 : 1;
      terms.forEach(function (t) { if (t !== qt && t[0] === qt[0] && lev1(qt, t, max) <= max) take(t, 0.45); });
    }
    (SYN[qt] || []).forEach(function (s) { take(s, 0.6); });
    return hits;
  }

  function query(q, filters) {
    filters = filters || {};
    var qts = tokens(q);
    var out = [], loose = false;
    if (!qts.length) {
      if (!filters.type && !filters.subject && !filters.grade) return { results: [], loose: false, tokens: [] };
      docs.forEach(function (d, i) { if (d.kind === "resource") out.push({ i: i, score: (+d.item.views || 0) / 1000 }); });
    } else {
      var per = qts.map(matchToken);
      var scores = {}, count = {};
      per.forEach(function (h) { for (var k in h) { scores[k] = (scores[k] || 0) + h[k]; count[k] = (count[k] || 0) + 1; } });
      var keys = Object.keys(scores);
      var strict = keys.filter(function (k) { return count[k] === qts.length; });
      if (!strict.length) { loose = true; strict = keys; }
      var phrase = canon(q).trim();
      strict.forEach(function (k) {
        var d = docs[k], t = canon(d.item.title);
        var s = scores[k] + (count[k] - 1) * 2;
        if (t.indexOf(phrase) >= 0) s += 6;
        if (t.indexOf(phrase) === 0) s += 3;
        if (d.item.featured === true || d.item.featured === "TRUE") s += 0.5;
        s += Math.log10(1 + (+d.item.views || 0)) * 0.6 + Math.log10(1 + (+d.item.rUseful || 0) + 2 * (+d.item.rUsed || 0)) * 0.8;
        if (d.kind === "section") s += 1;
        out.push({ i: +k, score: s });
      });
    }
    out = out.filter(function (o) {
      var x = docs[o.i].item;
      if (filters.type && (docs[o.i].kind !== "resource" || x.type !== filters.type)) return false;
      if (filters.subject && norm(x.subject) !== norm(filters.subject)) return false;
      if (filters.grade && norm(x.grade) !== norm(filters.grade)) return false;
      return true;
    });
    out.sort(function (a, b) { return b.score - a.score; });
    return {
      results: out.slice(0, 60).map(function (o) { return { kind: docs[o.i].kind, item: docs[o.i].item, path: docs[o.i].path, score: o.score }; }),
      total: out.length, loose: loose, tokens: qts
    };
  }

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function highlight(text, qts) {
    var safe = esc(text);
    if (!qts || !qts.length) return safe;
    var parts = qts.filter(function (t) { return t.length > 1 && !/^[gq]\d/.test(t); })
      .map(function (t) { return t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); });
    if (!parts.length) return safe;
    return safe.replace(new RegExp("\\b(" + parts.join("|") + ")", "gi"), "<mark>$1</mark>");
  }

  function facets() {
    var subj = {}, grade = {}, type = {};
    docs.forEach(function (d) {
      if (d.kind !== "resource") return;
      var x = d.item;
      if (x.subject) subj[x.subject] = (subj[x.subject] || 0) + 1;
      if (x.grade) grade[x.grade] = (grade[x.grade] || 0) + 1;
      if (x.type) type[x.type] = (type[x.type] || 0) + 1;
    });
    return { subject: subj, grade: grade, type: type };
  }

  return { build: build, query: query, highlight: highlight, facets: facets, tokens: tokens, esc: esc };
})();
