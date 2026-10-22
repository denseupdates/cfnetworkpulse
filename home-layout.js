/* CF Network News: compact home layout (preview)
   Reads the story cards you paste into #home-page-stories (newest first)
   and arranges them as: 1 lead story, 4 headlines, 6 grid cards,
   and the rest in the More Stories list. Nothing to edit here when
   you add a story. If this script fails, the original stack still shows. */
(function () {
  "use strict";

  var LEAD = 1, HEADLINES = 4, GRID = 6;

  function esc(s) {
    return String(s || "").replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function txt(root, sel) {
    var el = root.querySelector(sel);
    return el ? el.textContent.replace(/\s+/g, " ").trim() : "";
  }

  function readStory(a) {
    var img = a.querySelector("img");
    var kicker = txt(a, ".card__kicker") || txt(a, ".card__tag") || "Top Story";
    return {
      href: a.getAttribute("href") || "./news.html",
      img: img ? img.getAttribute("src") : "",
      alt: img ? (img.getAttribute("alt") || "") : "",
      kicker: kicker,
      date: txt(a, ".card__date"),
      title: txt(a, ".card__title"),
      excerpt: txt(a, ".card__excerpt")
    };
  }

  function meta(s) {
    return '<div class="hs-meta"><span class="hs-meta__kicker">' + esc(s.kicker) +
      '</span><span class="hs-meta__date">' + esc(s.date) + "</span></div>";
  }
  function pic(cls, s, eager) {
    if (!s.img) return '<div class="' + cls + '"></div>';
    return '<div class="' + cls + '"><img src="' + esc(s.img) + '" alt="' + esc(s.alt) +
      '"' + (eager ? "" : ' loading="lazy"') + "></div>";
  }

  function lead(s) {
    return '<a class="hs-lead" href="' + esc(s.href) + '">' + pic("hs-lead__img", s, true) +
      '<div class="hs-lead__body">' + meta(s) +
      '<h3 class="hs-lead__title">' + esc(s.title) + "</h3>" +
      '<p class="hs-lead__excerpt">' + esc(s.excerpt) + "</p>" +
      '<span class="hs-cta">Read Full Article &rarr;</span></div></a>';
  }
  function row(s) {
    return '<li><a class="hs-row" href="' + esc(s.href) + '">' + pic("hs-row__img", s, true) +
      '<div class="hs-row__body">' + meta(s) +
      '<span class="hs-row__title">' + esc(s.title) + "</span></div></a></li>";
  }
  function card(s) {
    return '<a class="hs-card" href="' + esc(s.href) + '">' + pic("hs-card__img", s) +
      '<div class="hs-card__body">' + meta(s) +
      '<h3 class="hs-card__title">' + esc(s.title) + "</h3>" +
      '<p class="hs-card__excerpt">' + esc(s.excerpt) + "</p>" +
      '<span class="hs-cta">Read Full Article &rarr;</span></div></a>';
  }
  function more(s) {
    return '<a class="hs-more__item" href="' + esc(s.href) + '">' + pic("hs-more__img", s) +
      '<div class="hs-row__body">' + meta(s) +
      '<span class="hs-more__title">' + esc(s.title) + "</span></div></a>";
  }

  function buildStories() {
    var src = document.getElementById("home-page-stories");
    if (!src) return;
    var links = Array.prototype.filter.call(src.children, function (el) {
      return el.tagName === "A";
    });
    var stories = links.map(readStory).filter(function (s) { return s.title; });
    if (!stories.length) return;

    var top = stories.slice(0, LEAD);
    var heads = stories.slice(LEAD, LEAD + HEADLINES);
    var grid = stories.slice(LEAD + HEADLINES, LEAD + HEADLINES + GRID);
    var rest = stories.slice(LEAD + HEADLINES + GRID);

    var out = document.createElement("div");
    out.className = "hs-wrap";
    out.innerHTML =
      '<div class="hs-top">' + top.map(lead).join("") +
        '<ol class="hs-headlines"><li class="hs-headlines__label">Latest Headlines</li>' +
        heads.map(row).join("") + "</ol></div>" +
      (grid.length ? '<div class="hs-grid">' + grid.map(card).join("") + "</div>" : "");

    src.hidden = true;
    src.parentNode.insertBefore(out, src);

    var moreSec = document.getElementById("more-stories");
    var moreList = document.getElementById("moreStoriesList");
    if (moreSec && moreList && rest.length) {
      moreList.innerHTML = rest.map(more).join("");
      moreSec.hidden = false;
    }
  }

  function gossipLinks() {
    document.querySelectorAll("#gossip .gossip-card[id]").forEach(function (c) {
      if (c.querySelector(".gossip-card__more")) return;
      var a = document.createElement("a");
      a.className = "gossip-card__more";
      a.href = "./gossip.html#" + c.id;
      a.innerHTML = "Read more &rarr;";
      var src = c.querySelector(".gossip-card__source");
      if (src) c.insertBefore(a, src); else c.appendChild(a);
    });
  }

  /* Rogue Invitational box: live status and start times in the visitor's time zone */
  function rogueBox() {
    document.querySelectorAll(".ri-home-time[data-utc]").forEach(function (t) {
      var d = new Date(t.getAttribute("data-utc"));
      if (isNaN(d)) return;
      t.textContent = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZoneName: "short" });
    });
    var st = document.getElementById("riHomeStatus");
    if (!st) return;
    var START = Date.parse("2026-10-23T10:00:00Z"), END = Date.parse("2026-10-25T14:45:00Z");
    function tick() {
      var now = Date.now();
      st.classList.remove("is-live");
      if (now < START) {
        var ms = START - now, d = Math.floor(ms / 864e5), h = Math.floor(ms % 864e5 / 36e5), m = Math.floor(ms % 36e5 / 6e4);
        st.textContent = "Starts in " + (d ? d + "d " : "") + h + "h " + m + "m";
      } else if (now < END) {
        st.textContent = "Live now";
        st.classList.add("is-live");
      } else {
        st.textContent = "Final results on the event hub";
      }
    }
    tick();
    setInterval(tick, 60000);
  }

  function jumpOffset() {
    var h = document.getElementById("header");
    if (h) document.documentElement.style.setProperty("--hj-top", h.offsetHeight + "px");
  }

  function init() {
    try { buildStories(); } catch (e) { console.warn("home layout: stories", e); }
    try { gossipLinks(); } catch (e) { console.warn("home layout: gossip", e); }
    try { rogueBox(); } catch (e) { console.warn("home layout: rogue", e); }
    jumpOffset();
    window.addEventListener("resize", jumpOffset);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
