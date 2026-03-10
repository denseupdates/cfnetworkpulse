/* CF Network News — Message Board */
(function () {
  "use strict";

  var STORAGE_KEY = "cfnn_messages";
  var LIKES_KEY = "cfnn_likes";
  var NAME_KEY = "cfnn_username";

  // Storage abstraction: persistent store if available, in-memory fallback
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

  var feed = document.getElementById("mbFeed");
  var emptyState = document.getElementById("mbEmpty");
  var form = document.getElementById("mbForm");
  var nameInput = document.getElementById("mbName");
  var msgInput = document.getElementById("mbMessage");
  var charCount = document.getElementById("charCount");
  var totalComments = document.getElementById("totalComments");
  var searchInput = document.getElementById("mbSearch");
  var searchClear = document.getElementById("mbSearchClear");
  var searchResults = document.getElementById("mbSearchResults");
  var sortBtns = document.querySelectorAll("[data-sort]");
  var composeAvatar = document.getElementById("composeAvatar");

  var currentSort = "newest";
  var currentSearch = "";

  // --- Data helpers ---
  function getMessages() {
    try {
      return JSON.parse(storeGet(STORAGE_KEY)) || [];
    } catch (e) {
      return [];
    }
  }

  function saveMessages(msgs) {
    storeSet(STORAGE_KEY, JSON.stringify(msgs));
  }

  function getLikes() {
    try {
      return JSON.parse(storeGet(LIKES_KEY)) || {};
    } catch (e) {
      return {};
    }
  }

  function saveLikes(likes) {
    storeSet(LIKES_KEY, JSON.stringify(likes));
  }

  function getSavedName() {
    return storeGet(NAME_KEY) || "";
  }

  function saveName(name) {
    storeSet(NAME_KEY, name);
  }

  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
  }

  function getInitial(name) {
    return name ? name.trim().charAt(0).toUpperCase() : "?";
  }

  var AVATAR_COLORS = [
    "#3b82f6", "#9333ea", "#059669", "#d97706", "#e11d48",
    "#0891b2", "#7c3aed", "#ca8a04", "#dc2626", "#2563eb"
  ];

  function getAvatarColor(name) {
    var hash = 0;
    for (var i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
  }

  function timeAgo(ts) {
    var now = Date.now();
    var diff = now - ts;
    var sec = Math.floor(diff / 1000);
    if (sec < 60) return "just now";
    var min = Math.floor(sec / 60);
    if (min < 60) return min + "m ago";
    var hr = Math.floor(min / 60);
    if (hr < 24) return hr + "h ago";
    var d = Math.floor(hr / 24);
    if (d < 30) return d + "d ago";
    return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  function escapeHtml(text) {
    var div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  function highlightText(text, query) {
    if (!query) return escapeHtml(text);
    var escaped = escapeHtml(text);
    var regex = new RegExp("(" + query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "gi");
    return escaped.replace(regex, '<mark class="mb-highlight">$1</mark>');
  }

  // --- Count all comments + replies ---
  function countAll(msgs) {
    var total = 0;
    msgs.forEach(function (m) {
      total++;
      if (m.replies) total += m.replies.length;
    });
    return total;
  }

  // --- Sort ---
  function sortMessages(msgs, method) {
    var sorted = msgs.slice();
    if (method === "newest") {
      sorted.sort(function (a, b) { return b.ts - a.ts; });
    } else if (method === "oldest") {
      sorted.sort(function (a, b) { return a.ts - b.ts; });
    } else if (method === "popular") {
      sorted.sort(function (a, b) { return (b.likes || 0) - (a.likes || 0); });
    }
    return sorted;
  }

  // --- Filter by search ---
  function filterMessages(msgs, query) {
    if (!query) return msgs;
    var q = query.toLowerCase();
    return msgs.filter(function (m) {
      if (m.name.toLowerCase().indexOf(q) !== -1) return true;
      if (m.text.toLowerCase().indexOf(q) !== -1) return true;
      if (m.replies) {
        for (var i = 0; i < m.replies.length; i++) {
          if (m.replies[i].name.toLowerCase().indexOf(q) !== -1) return true;
          if (m.replies[i].text.toLowerCase().indexOf(q) !== -1) return true;
        }
      }
      return false;
    });
  }

  // --- Render ---
  function renderComment(msg, isReply, parentId) {
    var likes = getLikes();
    var likeKey = isReply ? (parentId + ":" + msg.id) : msg.id;
    var userLiked = likes[likeKey] ? true : false;

    var html = '<div class="mb-comment' + (isReply ? " mb-comment--reply" : "") + '" data-id="' + msg.id + '">';
    html += '<div class="mb-comment__avatar" style="background:' + getAvatarColor(msg.name) + '">' + getInitial(msg.name) + '</div>';
    html += '<div class="mb-comment__body">';
    html += '<div class="mb-comment__header">';
    html += '<span class="mb-comment__name">' + escapeHtml(msg.name) + '</span>';
    html += '<span class="mb-comment__time">' + timeAgo(msg.ts) + '</span>';
    html += '</div>';
    html += '<div class="mb-comment__text">' + highlightText(msg.text, currentSearch) + '</div>';
    html += '<div class="mb-comment__actions">';
    html += '<button class="mb-action mb-action--like' + (userLiked ? " mb-action--liked" : "") + '" data-like="' + likeKey + '" data-parent="' + (parentId || msg.id) + '" data-reply="' + (isReply ? msg.id : "") + '">';
    html += '<svg width="14" height="14" viewBox="0 0 24 24" fill="' + (userLiked ? "currentColor" : "none") + '" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>';
    html += '<span>' + (msg.likes || 0) + '</span>';
    html += '</button>';
    if (!isReply) {
      html += '<button class="mb-action mb-action--reply" data-reply-to="' + msg.id + '">';
      html += '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 10 20 15 15 20"/><path d="M4 4v7a4 4 0 0 0 4 4h12"/></svg>';
      html += '<span>Reply</span>';
      html += '</button>';
    }
    html += '</div>';

    // Reply form (hidden by default)
    if (!isReply) {
      html += '<div class="mb-reply-form" id="reply-form-' + msg.id + '" style="display:none">';
      html += '<input type="text" class="mb-reply-form__name" placeholder="Your name" maxlength="40" value="' + escapeHtml(getSavedName()) + '">';
      html += '<div class="mb-reply-form__row">';
      html += '<textarea class="mb-reply-form__textarea" placeholder="Write a reply..." rows="2" maxlength="500"></textarea>';
      html += '<button class="mb-reply-form__submit" data-submit-reply="' + msg.id + '">Reply</button>';
      html += '</div>';
      html += '</div>';
    }

    html += '</div></div>';

    // Replies
    if (!isReply && msg.replies && msg.replies.length > 0) {
      html += '<div class="mb-replies">';
      msg.replies.forEach(function (r) {
        html += renderComment(r, true, msg.id);
      });
      html += '</div>';
    }

    return html;
  }

  function render() {
    var msgs = getMessages();
    var filtered = filterMessages(msgs, currentSearch);
    var sorted = sortMessages(filtered, currentSort);

    totalComments.textContent = countAll(msgs);

    if (sorted.length === 0) {
      emptyState.style.display = "flex";
      if (currentSearch) {
        emptyState.querySelector("p").textContent = 'No results for "' + currentSearch + '"';
        searchResults.textContent = "0 results";
        searchResults.style.display = "block";
      } else {
        emptyState.querySelector("p").textContent = "No comments yet. Be the first to start the conversation.";
        searchResults.style.display = "none";
      }
      // Remove all comment elements
      var existing = feed.querySelectorAll(".mb-comment-wrapper");
      existing.forEach(function (el) { el.remove(); });
      return;
    }

    emptyState.style.display = "none";

    if (currentSearch) {
      searchResults.textContent = sorted.length + " result" + (sorted.length !== 1 ? "s" : "");
      searchResults.style.display = "block";
    } else {
      searchResults.style.display = "none";
    }

    // Build HTML
    var html = "";
    sorted.forEach(function (msg) {
      html += '<div class="mb-comment-wrapper">' + renderComment(msg, false, null) + '</div>';
    });

    // Remove old wrappers
    var oldWrappers = feed.querySelectorAll(".mb-comment-wrapper");
    oldWrappers.forEach(function (el) { el.remove(); });

    // Insert before empty state
    var temp = document.createElement("div");
    temp.innerHTML = html;
    while (temp.firstChild) {
      feed.insertBefore(temp.firstChild, emptyState);
    }
  }

  // --- Event: Submit comment ---
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var name = nameInput.value.trim();
    var text = msgInput.value.trim();
    if (!name || !text) return;

    saveName(name);
    composeAvatar.textContent = getInitial(name);
    composeAvatar.style.background = getAvatarColor(name);

    var msgs = getMessages();
    msgs.push({
      id: generateId(),
      name: name,
      text: text,
      ts: Date.now(),
      likes: 0,
      replies: []
    });
    saveMessages(msgs);
    msgInput.value = "";
    charCount.textContent = "0";
    render();

    // Scroll to top of feed
    feed.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  // --- Event: Char count ---
  msgInput.addEventListener("input", function () {
    charCount.textContent = msgInput.value.length;
  });

  // --- Event: Name input updates avatar ---
  nameInput.addEventListener("input", function () {
    var n = nameInput.value.trim();
    composeAvatar.textContent = getInitial(n);
    if (n) {
      composeAvatar.style.background = getAvatarColor(n);
    } else {
      composeAvatar.style.background = "var(--color-surface-offset)";
    }
  });

  // --- Event delegation for likes, replies ---
  feed.addEventListener("click", function (e) {
    // Like button
    var likeBtn = e.target.closest("[data-like]");
    if (likeBtn) {
      var likeKey = likeBtn.getAttribute("data-like");
      var parentId = likeBtn.getAttribute("data-parent");
      var replyId = likeBtn.getAttribute("data-reply");
      var likes = getLikes();
      var msgs = getMessages();

      var parentMsg = msgs.find(function (m) { return m.id === parentId; });
      if (!parentMsg) return;

      var target;
      if (replyId) {
        target = parentMsg.replies.find(function (r) { return r.id === replyId; });
      } else {
        target = parentMsg;
      }
      if (!target) return;

      if (likes[likeKey]) {
        delete likes[likeKey];
        target.likes = Math.max(0, (target.likes || 0) - 1);
      } else {
        likes[likeKey] = true;
        target.likes = (target.likes || 0) + 1;
      }

      saveLikes(likes);
      saveMessages(msgs);
      render();
      return;
    }

    // Reply toggle
    var replyBtn = e.target.closest("[data-reply-to]");
    if (replyBtn) {
      var msgId = replyBtn.getAttribute("data-reply-to");
      var replyForm = document.getElementById("reply-form-" + msgId);
      if (replyForm) {
        var isVisible = replyForm.style.display !== "none";
        replyForm.style.display = isVisible ? "none" : "block";
        if (!isVisible) {
          replyForm.querySelector("textarea").focus();
        }
      }
      return;
    }

    // Submit reply
    var submitBtn = e.target.closest("[data-submit-reply]");
    if (submitBtn) {
      var parentMsgId = submitBtn.getAttribute("data-submit-reply");
      var replyFormEl = document.getElementById("reply-form-" + parentMsgId);
      var replyName = replyFormEl.querySelector(".mb-reply-form__name").value.trim();
      var replyText = replyFormEl.querySelector(".mb-reply-form__textarea").value.trim();

      if (!replyName || !replyText) return;

      saveName(replyName);

      var allMsgs = getMessages();
      var parent = allMsgs.find(function (m) { return m.id === parentMsgId; });
      if (!parent) return;

      if (!parent.replies) parent.replies = [];
      parent.replies.push({
        id: generateId(),
        name: replyName,
        text: replyText,
        ts: Date.now(),
        likes: 0
      });

      saveMessages(allMsgs);
      render();
      return;
    }
  });

  // --- Search ---
  var searchTimer;
  searchInput.addEventListener("input", function () {
    clearTimeout(searchTimer);
    var val = searchInput.value.trim();
    searchClear.style.display = val ? "flex" : "none";
    searchTimer = setTimeout(function () {
      currentSearch = val;
      render();
    }, 250);
  });

  searchClear.addEventListener("click", function () {
    searchInput.value = "";
    searchClear.style.display = "none";
    currentSearch = "";
    render();
    searchInput.focus();
  });

  // --- Sort ---
  sortBtns.forEach(function (btn) {
    btn.addEventListener("click", function () {
      sortBtns.forEach(function (b) { b.classList.remove("mb-sort__btn--active"); });
      btn.classList.add("mb-sort__btn--active");
      currentSort = btn.getAttribute("data-sort");
      render();
    });
  });

  // --- Init ---
  var savedName = getSavedName();
  if (savedName) {
    nameInput.value = savedName;
    composeAvatar.textContent = getInitial(savedName);
    composeAvatar.style.background = getAvatarColor(savedName);
  }

  render();

  // ===== PAID ADS SECTION =====
  var AD_KEY = "cfnn_ads";
  var AD_PENDING_KEY = "cfnn_ad_pending";
  var STRIPE_LINKS = {
    weekly: "https://buy.stripe.com/4gM14odZm5V65cUfuJ2Ry00",
    monthly: "https://buy.stripe.com/eVqbJ25sQ97i7l2cix2Ry01"
  };

  /* Duration in milliseconds for each tier */
  var TIER_DURATION = {
    weekly: 7 * 24 * 60 * 60 * 1000,   /* 7 days */
    monthly: 30 * 24 * 60 * 60 * 1000  /* 30 days */
  };

  var adForm = document.getElementById("adForm");
  var adFeed = document.getElementById("adFeed");
  var adEmpty = document.getElementById("adEmpty");

  function getAds() {
    try { return JSON.parse(storeGet(AD_KEY)) || []; }
    catch (e) { return []; }
  }

  function saveAds(ads) {
    storeSet(AD_KEY, JSON.stringify(ads));
  }

  // Check if returning from Stripe payment
  function checkPaymentReturn() {
    var params = new URLSearchParams(window.location.search);
    if (params.get("ad_paid") === "true") {
      var pendingRaw = storeGet(AD_PENDING_KEY);
      if (pendingRaw) {
        try {
          var pendingAd = JSON.parse(pendingRaw);
          var now = Date.now();
          pendingAd.status = "active";
          pendingAd.paidAt = now;
          pendingAd.expiresAt = now + (TIER_DURATION[pendingAd.tier] || TIER_DURATION.weekly);
          pendingAd.ts = now;
          var ads = getAds();
          ads.unshift(pendingAd);
          saveAds(ads);
          storeSet(AD_PENDING_KEY, "");
        } catch (e) { /* ignore */ }
      }
      // Clean URL
      window.history.replaceState({}, "", window.location.pathname);
    }
  }

  checkPaymentReturn();

  /* Human-readable time remaining */
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

  /* Purge expired ads and persist cleanup */
  function purgeExpiredAds() {
    var now = Date.now();
    var ads = getAds();
    var cleaned = ads.filter(function (a) {
      if (a.status !== "active") return false;
      /* Ads without expiresAt are legacy — treat as 7-day from ts */
      var exp = a.expiresAt || (a.ts + TIER_DURATION.weekly);
      return exp > now;
    });
    if (cleaned.length !== ads.length) saveAds(cleaned);
    return cleaned;
  }

  function renderAds() {
    if (!adFeed) return;
    var ads = purgeExpiredAds();
    // Remove old ad cards
    var oldCards = adFeed.querySelectorAll(".ad-card");
    oldCards.forEach(function (el) { el.remove(); });

    if (ads.length === 0) {
      if (adEmpty) adEmpty.style.display = "flex";
      return;
    }
    if (adEmpty) adEmpty.style.display = "none";

    ads.forEach(function (ad) {
      var card = document.createElement("div");
      var tierClass = ad.tier === "monthly" ? " ad-card--featured" : "";
      card.className = "ad-card" + tierClass;

      var tierLabel = ad.tier === "monthly" ? "Monthly Sponsor" : "Weekly Sponsor";
      var expiry = ad.expiresAt || (ad.ts + TIER_DURATION.weekly);
      var remaining = timeRemaining(expiry);

      var html = '<div class="ad-card__top-row">';
      html += '<div class="ad-card__sponsor">' + tierLabel + '</div>';
      html += '<span class="ad-card__expiry">' + remaining + '</span>';
      html += '</div>';
      html += '<div class="ad-card__name">' + escapeHtml(ad.name) + '</div>';
      if (ad.image) {
        html += '<img class="ad-card__image" src="' + ad.image + '" alt="Ad image for ' + escapeHtml(ad.name) + '" loading="lazy">';
      }
      html += '<div class="ad-card__text">' + escapeHtml(ad.text) + '</div>';
      if (ad.link) {
        html += '<a href="' + escapeHtml(ad.link) + '" target="_blank" rel="noopener noreferrer" class="ad-card__link">Visit Site <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></a>';
      }
      card.innerHTML = html;
      adFeed.insertBefore(card, adEmpty);
    });
  }

  // --- Image upload handling ---
  var adImageData = "";
  var adImageInput = document.getElementById("adImage");
  var adUploadPlaceholder = document.getElementById("adUploadPlaceholder");
  var adUploadPreview = document.getElementById("adUploadPreview");
  var adPreviewImg = document.getElementById("adPreviewImg");
  var adRemoveImg = document.getElementById("adRemoveImg");
  var adUploadArea = document.getElementById("adUploadArea");

  function handleImageFile(file) {
    if (!file || !file.type.match(/^image\//)) return;
    if (file.size > 2 * 1024 * 1024) {
      alert("Image must be under 2MB.");
      return;
    }
    var reader = new FileReader();
    reader.onload = function (ev) {
      adImageData = ev.target.result;
      if (adPreviewImg) adPreviewImg.src = adImageData;
      if (adUploadPlaceholder) adUploadPlaceholder.style.display = "none";
      if (adUploadPreview) adUploadPreview.style.display = "block";
    };
    reader.readAsDataURL(file);
  }

  if (adImageInput) {
    adImageInput.addEventListener("change", function () {
      if (adImageInput.files && adImageInput.files[0]) {
        handleImageFile(adImageInput.files[0]);
      }
    });
  }

  if (adRemoveImg) {
    adRemoveImg.addEventListener("click", function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      adImageData = "";
      if (adImageInput) adImageInput.value = "";
      if (adUploadPlaceholder) adUploadPlaceholder.style.display = "flex";
      if (adUploadPreview) adUploadPreview.style.display = "none";
    });
  }

  if (adUploadArea) {
    adUploadArea.addEventListener("dragover", function (ev) {
      ev.preventDefault();
      adUploadArea.classList.add("dragging");
    });
    adUploadArea.addEventListener("dragleave", function () {
      adUploadArea.classList.remove("dragging");
    });
    adUploadArea.addEventListener("drop", function (ev) {
      ev.preventDefault();
      adUploadArea.classList.remove("dragging");
      if (ev.dataTransfer.files && ev.dataTransfer.files[0]) {
        handleImageFile(ev.dataTransfer.files[0]);
      }
    });
  }

  if (adForm) {
    adForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var adName = document.getElementById("adName").value.trim();
      var adEmail = document.getElementById("adEmail").value.trim();
      var adTier = document.getElementById("adTier").value;
      var adMessage = document.getElementById("adMessage").value.trim();
      var adLink = document.getElementById("adLink").value.trim();

      if (!adName || !adEmail || !adMessage) return;

      // Save ad as pending payment
      var pendingAd = {
        id: generateId(),
        name: adName,
        email: adEmail,
        tier: adTier,
        text: adMessage,
        link: adLink || "",
        image: adImageData || "",
        ts: Date.now(),
        status: "pending_payment"
      };
      storeSet(AD_PENDING_KEY, JSON.stringify(pendingAd));

      // Build Stripe checkout URL with return parameter
      var stripeUrl = STRIPE_LINKS[adTier] || STRIPE_LINKS.weekly;

      // Redirect to Stripe Checkout
      window.location.href = stripeUrl;
    });
  }

  renderAds();
})();
