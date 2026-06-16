/* CF Network News — Admin Panel (Ad Approval) */
(function () {
  "use strict";

  /* ================================================
     CONFIG
     ================================================ */
  /* Google accounts allowed to administer the site.
     Firestore security rules MUST also restrict writes to these emails. */
  var ADMIN_EMAILS = [
    "denseupdates@gmail.com"
  ];

  /* ================================================
     DOM
     ================================================ */
  var gate = document.getElementById("adminGate");
  var dash = document.getElementById("adminDash");
  var signInBtn = document.getElementById("adminSignInBtn");
  var errorMsg = document.getElementById("adminError");
  var adminFeed = document.getElementById("adminFeed");
  var adminCount = document.getElementById("adminCount");
  var tabBtns = document.querySelectorAll("[data-admin-tab]");

  var db = window.cfnnDb;
  var auth = window.cfnnAuth;
  if (!db || !auth) {
    console.error("CFNN admin: Firebase not initialized — window.cfnnDb / window.cfnnAuth missing.");
    return;
  }
  var adsRef = db.collection("ads");

  var currentTab = "pending";
  var allAds = [];
  var listenerStarted = false;

  /* ================================================
     AUTH (Google sign-in, allow-listed emails)
     ================================================ */
  function isAdmin(user) {
    return !!(user && user.email && ADMIN_EMAILS.indexOf(user.email.toLowerCase()) !== -1);
  }

  function showDash() {
    gate.style.display = "none";
    dash.classList.add("admin-dash--active");
    if (!listenerStarted) {
      startAdsListener();
      listenerStarted = true;
    }
  }

  function showGate(showError) {
    gate.style.display = "";
    dash.classList.remove("admin-dash--active");
    if (errorMsg) errorMsg.style.display = showError ? "block" : "none";
  }

  if (signInBtn) {
    signInBtn.addEventListener("click", function () {
      var provider = new firebase.auth.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      signInBtn.disabled = true;
      signInBtn.textContent = "Signing in...";
      auth.signInWithPopup(provider).catch(function (err) {
        console.error("Admin sign-in failed:", err);
        signInBtn.disabled = false;
        signInBtn.textContent = "Sign in with Google";
        if (errorMsg) {
          errorMsg.textContent = "Sign-in failed. Try again.";
          errorMsg.style.display = "block";
        }
      });
    });
  }

  auth.onAuthStateChanged(function (user) {
    if (signInBtn) {
      signInBtn.disabled = false;
      signInBtn.textContent = "Sign in with Google";
    }
    if (isAdmin(user)) {
      showDash();
    } else {
      var hadUser = !!user;
      if (hadUser) {
        /* Signed-in but not an admin — sign them out and show error */
        auth.signOut();
        showGate(true);
      } else {
        showGate(false);
      }
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
     FIRESTORE LISTENER (started after admin auth succeeds)
     ================================================ */
  function startAdsListener() {
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
  }

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

  /* ================================================
     TOP-LEVEL PANEL SWITCH (Ads <-> Workout of the Week)
     ================================================ */
  var panelBtns = document.querySelectorAll("[data-admin-panel]");
  var panels = {
    ads: document.getElementById("panelAds"),
    wotw: document.getElementById("panelWotw")
  };
  panelBtns.forEach(function (btn) {
    btn.addEventListener("click", function () {
      var target = btn.getAttribute("data-admin-panel");
      panelBtns.forEach(function (b) { b.classList.remove("admin-nav__btn--active"); });
      btn.classList.add("admin-nav__btn--active");
      Object.keys(panels).forEach(function (key) {
        if (!panels[key]) return;
        panels[key].classList.toggle("admin-panel--active", key === target);
      });
      if (target === "wotw" && !wotwLoaded) {
        loadWotw();
      }
    });
  });

  /* ================================================
     WORKOUT OF THE WEEK EDITOR
     Stored as a single Firestore document: content/wotw
     ================================================ */
  var wotwDocRef = db.collection("content").doc("wotw");
  var wotwLoaded = false;

  var wf = {
    form:       document.getElementById("wotwForm"),
    date:       document.getElementById("wotwDate"),
    source:     document.getElementById("wotwSource"),
    image:      document.getElementById("wotwImage"),
    thumb:      document.getElementById("wotwThumb"),
    imageSecondary: document.getElementById("wotwImageSecondary"),
    thumbSecondary: document.getElementById("wotwThumbSecondary"),
    warmup:     document.getElementById("wotwWarmup"),
    cooldown:   document.getElementById("wotwCooldown"),
    notes:      document.getElementById("wotwNotes"),
    saveBtn:    document.getElementById("wotwSaveBtn"),
    status:     document.getElementById("wotwSaveStatus")
  };

  function setWotwStatus(text, kind) {
    if (!wf.status) return;
    wf.status.textContent = text;
    wf.status.className = "wotw-save-status" + (kind ? " wotw-save-status--" + kind : "");
  }

  function updateThumb() {
    if (!wf.thumb) return;
    var url = (wf.image.value || "").trim();
    if (url) {
      wf.thumb.src = url;
      wf.thumb.style.display = "block";
    } else {
      wf.thumb.style.display = "none";
    }
  }
  if (wf.image) wf.image.addEventListener("input", updateThumb);

  function updateThumbSecondary() {
    if (!wf.thumbSecondary) return;
    var url = (wf.imageSecondary && wf.imageSecondary.value || "").trim();
    if (url) {
      wf.thumbSecondary.src = url;
      wf.thumbSecondary.style.display = "block";
    } else {
      wf.thumbSecondary.style.display = "none";
    }
  }
  if (wf.imageSecondary) wf.imageSecondary.addEventListener("input", updateThumbSecondary);

  /* Convert stored arrays back into the textarea formats */
  function notesToText(arr) {
    if (!arr || !arr.length) return "";
    return arr.map(function (n) {
      if (n && typeof n === "object") {
        return (n.label ? n.label + ": " : "") + (n.text || "");
      }
      return String(n);
    }).join("\n");
  }

  /* Parse textarea into structured array for storage */
  function parseNotes(text) {
    return text.split("\n").map(function (line) { return line.trim(); })
      .filter(function (line) { return line.length > 0; })
      .map(function (line) {
        var idx = line.indexOf(":");
        if (idx === -1) return { label: "", text: line };
        return { label: line.slice(0, idx).trim(), text: line.slice(idx + 1).trim() };
      });
  }

  function loadWotw() {
    wotwLoaded = true;
    setWotwStatus("Loading current workout\u2026");
    wotwDocRef.get().then(function (doc) {
      if (doc.exists) {
        var d = doc.data();
        wf.date.value = d.date || "";
        if (wf.source) wf.source.value = d.source || "";
        wf.image.value = d.image || "";
        if (wf.imageSecondary) wf.imageSecondary.value = d.imageSecondary || "";
        wf.warmup.value = d.warmup || "";
        wf.cooldown.value = d.cooldown || "";
        wf.notes.value = notesToText(d.notes);
        updateThumb();
        updateThumbSecondary();
        setWotwStatus("Loaded. Edit and save to publish.");
      } else {
        setWotwStatus("No saved workout yet \u2014 the page is showing its built-in default. Fill this in and save to take over.");
      }
    }).catch(function (err) {
      console.error("Error loading WOTW:", err);
      setWotwStatus("Could not load. Check your connection and try again.", "err");
      wotwLoaded = false;
    });
  }

  if (wf.form) {
    wf.form.addEventListener("submit", function (e) {
      e.preventDefault();
      wf.saveBtn.disabled = true;
      var prevLabel = wf.saveBtn.textContent;
      wf.saveBtn.textContent = "Saving\u2026";
      setWotwStatus("Saving\u2026");

      var payload = {
        date: wf.date.value.trim(),
        source: wf.source ? wf.source.value.trim() : "",
        image: wf.image.value.trim(),
        imageSecondary: wf.imageSecondary ? wf.imageSecondary.value.trim() : "",
        warmup: wf.warmup.value.replace(/^\n+|\n+$/g, ""),
        cooldown: wf.cooldown.value.replace(/^\n+|\n+$/g, ""),
        notes: parseNotes(wf.notes.value),
        updatedAt: Date.now(),
        updatedBy: (auth.currentUser && auth.currentUser.email) || ""
      };

      wotwDocRef.set(payload).then(function () {
        wf.saveBtn.disabled = false;
        wf.saveBtn.textContent = prevLabel;
        setWotwStatus("Saved and published \u2713", "ok");
      }).catch(function (err) {
        console.error("Error saving WOTW:", err);
        wf.saveBtn.disabled = false;
        wf.saveBtn.textContent = prevLabel;
        setWotwStatus("Save failed: " + (err && err.message ? err.message : "unknown error"), "err");
      });
    });
  }

})();
