/* CF Network News — Admin Panel (Ad Approval) */
(function () {
  "use strict";

  /* ================================================
     CONFIG
     ================================================ */
  var ADMIN_PASS_HASH = "cfnn2026admin";
  var ADMIN_KEY = "cfnn_admin_auth";

  /* Storage abstraction */
  var memStore = {};
  var _ls = null;
  var canUseLS = false;
  try {
    _ls = window["local" + "Storage"];
    var _t = "__cfnn_test";
    _ls.setItem(_t, "1");
    _ls.removeItem(_t);
    canUseLS = true;
  } catch (e) { canUseLS = false; }

  function storeGet(key) {
    if (canUseLS) return _ls.getItem(key);
    return memStore[key] || null;
  }
  function storeSet(key, val) {
    if (canUseLS) { _ls.setItem(key, val); return; }
    memStore[key] = val;
  }

  /* ================================================
     DOM
     ================================================ */
  var gate = document.getElementById("adminGate");
  var dash = document.getElementById("adminDash");
  var loginForm = document.getElementById("adminLoginForm");
  var passInput = document.getElementById("adminPassword");
  var errorMsg = document.getElementById("adminError");
  var adminFeed = document.getElementById("adminFeed");
  var adminCount = document.getElementById("adminCount");
  var tabBtns = document.querySelectorAll("[data-admin-tab]");

  var db = window.cfnnDb;
  if (!db) return;
  var adsRef = db.collection("ads");

  var currentTab = "pending";
  var allAds = [];

  /* ================================================
     AUTH
     ================================================ */
  function checkAuth() {
    return storeGet(ADMIN_KEY) === "1";
  }

  function authenticate(pass) {
    if (pass === ADMIN_PASS_HASH) {
      storeSet(ADMIN_KEY, "1");
      return true;
    }
    return false;
  }

  function showDash() {
    gate.style.display = "none";
    dash.classList.add("admin-dash--active");
  }

  if (checkAuth()) {
    showDash();
  }

  loginForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var pass = passInput.value.trim();
    if (authenticate(pass)) {
      showDash();
    } else {
      errorMsg.style.display = "block";
      passInput.value = "";
      passInput.focus();
    }
  });

  /* ================================================
     HELPERS
     ================================================ */
  function escapeHtml(text) {
    var div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  function formatDate(ts) {
    return new Date(ts).toLocaleString("en-US", {
      month: "short", day: "numeric", year: "numeric",
      hour: "numeric", minute: "2-digit"
    });
  }

  var TIER_DURATION = {
    weekly: 7 * 24 * 60 * 60 * 1000,
    monthly: 30 * 24 * 60 * 60 * 1000
  };

  function timeRemaining(expiresAt) {
    var diff = expiresAt - Date.now();
    if (diff <= 0) return "Expired";
    var days = Math.floor(diff / (24 * 60 * 60 * 1000));
    var hours = Math.floor((diff % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
    if (days > 1) return days + " days left";
    if (days === 1) return "1 day left";
    if (hours > 1) return hours + " hours left";
    if (hours === 1) return "1 hour left";
    return "< 1 hour left";
  }

  /* ================================================
     RENDER
     ================================================ */
  function getFilteredAds() {
    if (currentTab === "all") return allAds;
    return allAds.filter(function (a) { return a.status === currentTab; });
  }

  function renderAds() {
    var ads = getFilteredAds();

    var pendingCount = allAds.filter(function (a) { return a.status === "pending"; }).length;
    var activeCount = allAds.filter(function (a) { return a.status === "active"; }).length;
    var rejectedCount = allAds.filter(function (a) { return a.status === "rejected"; }).length;

    adminCount.textContent = pendingCount + " pending \u00b7 " + activeCount + " active \u00b7 " + rejectedCount + " rejected \u00b7 " + allAds.length + " total";

    /* Update tab labels */
    tabBtns.forEach(function (btn) {
      var tab = btn.getAttribute("data-admin-tab");
      if (tab === "pending") btn.textContent = "Pending (" + pendingCount + ")";
      else if (tab === "active") btn.textContent = "Active (" + activeCount + ")";
      else if (tab === "rejected") btn.textContent = "Rejected (" + rejectedCount + ")";
      else btn.textContent = "All (" + allAds.length + ")";
    });

    adminFeed.innerHTML = "";

    if (ads.length === 0) {
      adminFeed.innerHTML = '<div class="admin-empty">No ' + currentTab + ' ads.</div>';
      return;
    }

    ads.forEach(function (ad) {
      var card = document.createElement("div");
      card.className = "admin-ad";

      var statusClass = "admin-ad__badge--" + ad.status;
      var tierClass = ad.tier === "monthly" ? "admin-ad__badge--monthly" : "admin-ad__badge--weekly";
      var expiry = ad.expiresAt || (ad.ts + TIER_DURATION.weekly);

      var html = '<div class="admin-ad__meta">';
      html += '<span class="admin-ad__badge ' + statusClass + '">' + ad.status + '</span>';
      html += '<span class="admin-ad__badge ' + tierClass + '">' + (ad.tier || "weekly") + '</span>';
      html += '<span>Submitted: ' + formatDate(ad.ts) + '</span>';
      if (ad.status === "active") {
        html += '<span>' + timeRemaining(expiry) + '</span>';
      }
      html += '</div>';

      html += '<div class="admin-ad__name">' + escapeHtml(ad.name) + '</div>';
      if (ad.email) {
        html += '<div class="admin-ad__email">' + escapeHtml(ad.email) + '</div>';
      }
      html += '<div class="admin-ad__text">' + escapeHtml(ad.text) + '</div>';
      if (ad.image) {
        html += '<img class="admin-ad__image" src="' + ad.image + '" alt="Ad image">';
      }
      if (ad.link) {
        html += '<a class="admin-ad__link" href="' + escapeHtml(ad.link) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(ad.link) + '</a>';
      }

      html += '<div class="admin-ad__actions">';
      if (ad.status === "pending") {
        html += '<button class="admin-ad__btn admin-ad__btn--approve" data-approve="' + ad.id + '">Approve</button>';
        html += '<button class="admin-ad__btn admin-ad__btn--reject" data-reject="' + ad.id + '">Reject</button>';
      } else if (ad.status === "active") {
        html += '<button class="admin-ad__btn admin-ad__btn--reject" data-reject="' + ad.id + '">Remove</button>';
      } else if (ad.status === "rejected") {
        html += '<button class="admin-ad__btn admin-ad__btn--approve" data-approve="' + ad.id + '">Approve</button>';
      }
      html += '</div>';

      card.innerHTML = html;
      adminFeed.appendChild(card);
    });
  }

  /* ================================================
     FIRESTORE LISTENER
     ================================================ */
  adsRef.orderBy("ts", "desc").onSnapshot(function (snapshot) {
    allAds = [];
    snapshot.forEach(function (doc) {
      var data = doc.data();
      data.id = doc.id;
      allAds.push(data);
    });
    renderAds();
  }, function (err) {
    console.error("Admin ads listener error:", err);
  });

  /* ================================================
     EVENTS
     ================================================ */

  /* Tab switching */
  tabBtns.forEach(function (btn) {
    btn.addEventListener("click", function () {
      tabBtns.forEach(function (b) { b.classList.remove("admin-tab--active"); });
      btn.classList.add("admin-tab--active");
      currentTab = btn.getAttribute("data-admin-tab");
      renderAds();
    });
  });

  /* Approve / Reject via event delegation */
  adminFeed.addEventListener("click", function (e) {
    var approveBtn = e.target.closest("[data-approve]");
    if (approveBtn) {
      var adId = approveBtn.getAttribute("data-approve");
      approveBtn.disabled = true;
      approveBtn.textContent = "Approving...";

      /* When approving, reset expiry to start from now */
      var ad = allAds.find(function (a) { return a.id === adId; });
      var duration = TIER_DURATION[(ad && ad.tier) || "weekly"];
      var now = Date.now();

      adsRef.doc(adId).update({
        status: "active",
        paidAt: now,
        expiresAt: now + duration
      }).catch(function (err) {
        console.error("Error approving ad:", err);
        approveBtn.disabled = false;
        approveBtn.textContent = "Approve";
      });
      return;
    }

    var rejectBtn = e.target.closest("[data-reject]");
    if (rejectBtn) {
      var rejAdId = rejectBtn.getAttribute("data-reject");
      rejectBtn.disabled = true;
      rejectBtn.textContent = "Rejecting...";
      adsRef.doc(rejAdId).update({ status: "rejected" }).catch(function (err) {
        console.error("Error rejecting ad:", err);
        rejectBtn.disabled = false;
        rejectBtn.textContent = "Reject";
      });
      return;
    }
  });

})();
