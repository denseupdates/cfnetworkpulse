/*
 * Site-wide ticker loader.
 * Reads ticker.json from the repo root and fills every <div class="ticker__track">
 * on the page. Items are duplicated so the marquee animation loops seamlessly.
 *
 * To update the ticker daily, edit ticker.json on GitHub. No HTML changes needed.
 */
(function () {
  function buildItems(items) {
    // Render each headline once, then duplicate the whole set so the CSS
    // marquee can scroll continuously without a visible gap.
    var parts = [];
    var loops = 2;
    for (var loop = 0; loop < loops; loop++) {
      for (var i = 0; i < items.length; i++) {
        var span = document.createElement("span");
        span.className = "ticker__item";
        span.textContent = String(items[i] || "").trim();
        parts.push(span);
      }
    }
    return parts;
  }

  function fillTracks(items) {
    var tracks = document.querySelectorAll(".ticker__track");
    if (!tracks.length) return;
    var nodes = buildItems(items);
    tracks.forEach(function (track) {
      track.innerHTML = "";
      // Clone nodes into each track so multiple tickers on a page work.
      nodes.forEach(function (n) {
        track.appendChild(n.cloneNode(true));
      });
    });
  }

  function load() {
    // Cache-bust so editors see updates immediately. The CDN can still serve
    // a slightly stale copy briefly but most edits propagate within ~30s.
    var url = "/ticker.json?v=" + Date.now();
    fetch(url, { cache: "no-store" })
      .then(function (r) {
        if (!r.ok) throw new Error("ticker fetch failed: " + r.status);
        return r.json();
      })
      .then(function (data) {
        var items =
          data && Array.isArray(data.items) && data.items.length
            ? data.items
            : ["CF NETWORK NEWS"];
        fillTracks(items);
      })
      .catch(function (err) {
        console.error("[ticker] load failed:", err);
        // Leave whatever HTML fallback the page had in place.
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", load);
  } else {
    load();
  }
})();
