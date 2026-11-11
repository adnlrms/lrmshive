/*
  LRMS-HIVE flipbook — turns a storybook PDF into a page-turning book.
  Uses pdf.js (Apache-2.0) to draw the pages and StPageFlip (MIT) for the page curl.
  Both libraries live in assets/vendor and load only when a flipbook is opened.
  Google Drive PDFs (and Google Slides/Docs) are fetched through the Apps Script
  backend, because browsers are not allowed to download Drive files directly.
*/
window.HiveFlipbook = (function () {
  "use strict";
  var VENDOR = (window.HIVE_CONFIG && window.HIVE_CONFIG.VENDOR_PATH) || "assets/vendor/";
  var loading = {}, cache = {};

  function vendorUrl(name) {
    var inl = window.HIVE_INLINE_VENDOR && window.HIVE_INLINE_VENDOR[name];
    return inl ? URL.createObjectURL(new Blob([inl], { type: "text/javascript" })) : VENDOR + name;
  }
  function loadScript(name) {
    if (loading[name]) return loading[name];
    loading[name] = new Promise(function (res, rej) {
      var s = document.createElement("script");
      s.src = vendorUrl(name); s.async = true;
      s.onload = res;
      s.onerror = function () { loading[name] = null; rej(new Error("The flipbook could not load. Please check your internet connection.")); };
      document.head.appendChild(s);
    });
    return loading[name];
  }
  function b64ToBytes(b64) {
    var bin = atob(b64), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function getBytes(r) {
    var L = window.Hive.Links, url = r.url || "";
    var inl = window.HIVE_INLINE_FILES && window.HIVE_INLINE_FILES[url];
    if (inl) return Promise.resolve(b64ToBytes(inl));
    if (/^data:application\/pdf;base64,/.test(url)) return Promise.resolve(b64ToBytes(url.split(",")[1]));
    if (window.Hive.MS && window.Hive.MS.is(url)) {
      if (window.HiveAPI.demo) return Promise.reject(new Error("OneDrive/SharePoint storybooks open as flipbooks once the Apps Script backend is connected."));
      return window.HiveAPI.fileData(r.id).then(function (j) { return b64ToBytes(j.data); });
    }
    if (L.isDrive(url) && L.id(url)) {
      if (window.HiveAPI.demo) return Promise.reject(new Error("Google Drive storybooks open as flipbooks once the Apps Script backend is connected."));
      return window.HiveAPI.fileData(L.id(url)).then(function (j) { return b64ToBytes(j.data); });
    }
    return fetch(url).then(function (res) {
      if (!res.ok) throw new Error("The storybook file could not be downloaded.");
      return res.arrayBuffer();
    }).then(function (buf) { return new Uint8Array(buf); });
  }

  function renderPages(bytes, targetH, onProgress) {
    var lib = window.pdfjsLib;
    lib.GlobalWorkerOptions.workerSrc = vendorUrl("pdf.worker.min.js");
    return lib.getDocument({ data: bytes, isEvalSupported: false }).promise.then(function (pdf) {
      var n = pdf.numPages, images = [], ratio = 0.75;
      function one(i) {
        if (i > n) return Promise.resolve();
        return pdf.getPage(i).then(function (page) {
          var vp1 = page.getViewport({ scale: 1 });
          if (i === 1) ratio = vp1.width / vp1.height;
          var scale = Math.min(3, targetH / vp1.height);
          var vp = page.getViewport({ scale: scale });
          var c = document.createElement("canvas");
          c.width = Math.round(vp.width); c.height = Math.round(vp.height);
          var ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
          return page.render({ canvasContext: ctx, viewport: vp }).promise.then(function () {
            images.push(c.toDataURL("image/jpeg", 0.86));
            c.width = c.height = 0;
            onProgress(i, n);
            return one(i + 1);
          });
        });
      }
      return one(1).then(function () { return { images: images, ratio: ratio, pages: n }; });
    });
  }

  /** opens a flipbook inside `stage`; `bar` receives the page controls. Returns { destroy } */
  function open(r, stage, bar) {
    var destroyed = false, pf = null, onKey = null;
    stage.innerHTML = '<div class="flip-loading"><span class="loadbar"><i style="animation:none;transform:scaleX(0)"></i></span><span data-msg>Opening the storybook…</span></div>';
    var msg = stage.querySelector("[data-msg]"), barFill = stage.querySelector(".loadbar i");
    bar.innerHTML = "";
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var targetH = Math.min(1700, Math.max(700, stage.clientHeight * dpr));

    var job = cache[r.id] ? Promise.resolve(cache[r.id]) :
      Promise.all([loadScript("pdf.min.js"), getBytes(r)]).then(function (x) {
        msg.textContent = "Preparing pages…";
        return renderPages(x[1], targetH, function (i, n) {
          if (destroyed) return;
          msg.textContent = "Preparing page " + i + " of " + n + "…";
          barFill.style.transform = "scaleX(" + (i / n) + ")";
        });
      }).then(function (book) { cache[r.id] = book; return book; });

    job.then(function (book) {
      if (destroyed) return;
      return loadScript("page-flip.min.js").then(function () { if (!destroyed) build(book); }, function () { if (!destroyed) simple(book); });
    }).catch(function (err) {
      if (destroyed) return;
      stage.innerHTML = '<div class="viewer-empty"><p>' + window.Hive.esc(err.message) + '</p>' +
        (r.url ? '<a class="btn btn-honey" href="' + window.Hive.esc(r.url) + '" target="_blank" rel="noopener">Open the PDF instead</a>' : "") + "</div>";
    });

    function controls(total, go, getPage) {
      bar.innerHTML =
        '<button type="button" class="btn" data-fp="prev" aria-label="Previous page">' + window.hiveIcon("up", "rot-left") + '<span>Back</span></button>' +
        '<span class="flip-count" aria-live="polite"><b data-cur>1</b> / ' + total + "</span>" +
        '<button type="button" class="btn btn-honey" data-fp="next" aria-label="Next page"><span>Next</span>' + window.hiveIcon("up", "rot-right") + "</button>" +
        '<button type="button" class="btn btn-ghost" data-fp="full" aria-label="Full screen">' + window.hiveIcon("external") + '<span>Full screen</span></button>';
      bar.onclick = function (e) {
        var b = e.target.closest("[data-fp]"); if (!b) return;
        if (b.dataset.fp === "full") window.Hive.fullscreen(stage.parentNode);
        else go(b.dataset.fp);
      };
      onKey = function (e) { if (e.key === "ArrowRight") go("next"); if (e.key === "ArrowLeft") go("prev"); };
      document.addEventListener("keydown", onKey);
      return function (i) { var c = bar.querySelector("[data-cur]"); if (c) c.textContent = i; };
    }

    function build(book) {
      stage.innerHTML = "";
      var host = document.createElement("div"); host.className = "flip-book"; stage.appendChild(host);
      var W = stage.clientWidth - 24, H = stage.clientHeight - 44;
      var pageH = Math.max(240, H), pageW = Math.round(pageH * book.ratio);
      var spread = W >= pageW * 2 && W > 640;
      if (!spread && pageW > W) { pageW = W - 8; pageH = Math.round(pageW / book.ratio); }
      try {
        pf = new window.St.PageFlip(host, {
          width: pageW, height: pageH, size: "fixed", showCover: true, usePortrait: !spread,
          maxShadowOpacity: 0.45, mobileScrollSupport: false, flippingTime: 750, drawShadow: true, swipeDistance: 25
        });
        // HTML mode: each page is a real <img>, sharp on high-density screens and with a clear background
        var pages = book.images.map(function (src, i) {
          var d = document.createElement("div"); d.className = "flip-page";
          if (i === 0 || i === book.images.length - 1) d.setAttribute("data-density", "hard");
          var im = document.createElement("img"); im.src = src; im.alt = "Page " + (i + 1); im.draggable = false;
          d.appendChild(im); host.appendChild(d); return d;
        });
        pf.loadFromHTML(pages);
      } catch (e) { pf = null; simple(book); return; }
      var set = controls(book.pages, function (d) { if (d === "next") pf.flipNext(); else pf.flipPrev(); });
      pf.on("flip", function (e) { set(e.data + 1); });
    }

    function simple(book) { // fallback without page curl
      var i = 0;
      stage.innerHTML = '<img class="flip-simple" alt="">';
      var img = stage.querySelector("img");
      var set = controls(book.pages, function (d) { i = Math.max(0, Math.min(book.pages - 1, i + (d === "next" ? 1 : -1))); img.src = book.images[i]; set(i + 1); });
      img.src = book.images[0];
      var x0 = null;
      img.addEventListener("touchstart", function (e) { x0 = e.touches[0].clientX; }, { passive: true });
      img.addEventListener("touchend", function (e) { if (x0 == null) return; var dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 40) bar.querySelector('[data-fp="' + (dx < 0 ? "next" : "prev") + '"]').click(); x0 = null; });
    }

    return {
      destroy: function () {
        destroyed = true;
        if (onKey) document.removeEventListener("keydown", onKey);
        try { if (pf) pf.destroy(); } catch (e) {}
        stage.innerHTML = ""; bar.innerHTML = "";
      }
    };
  }

  return { open: open };
})();
