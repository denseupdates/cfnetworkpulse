/* CF Network News — Workout of the Week scores/comments (Firebase Firestore real-time)
   - Comments stored in the "wotw_comments" collection (separate from the message board)
   - Posting and replying REQUIRE Google sign-in
   - Anyone (signed in or not) can like / dislike; reactions stored per-browser
   - Separate like and dislike counts per comment / reply */
(function () {
  "use strict";

  /* ================================================
     STORAGE ABSTRACTION (for local-only data: reactions)
     ================================================ */
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
     CONSTANTS & FIREBASE REFERENCE
     ================================================ */
  var REACT_KEY = "cfnn_wotw_reactions";   /* { likeKey: "like" | "dislike" } */
  var db = window.cfnnDb;
  var auth = window.cfnnAuth;
  if (!db) {
    console.error("CFNN: Firestore not initialized — window.cfnnDb is", db);
    return;
  }
  /* Dedicated collection so WOTW scores stay separate from the Message Board */
  var commentsRef = db.collection("wotw_comments");

  /* ================================================
     WORKOUT CONTENT (admin-editable, from content/wotw)
     The HTML ships with a hard-coded default; if an admin has saved a
     workout in Firestore, we replace the on-page content with it.
     ================================================ */
  (function loadWorkoutContent() {
    function esc(text) {
      var div = document.createElement("div");
      div.textContent = text == null ? "" : String(text);
      return div.innerHTML;
    }

    function renderWorkout(d) {
      if (!d) return;

      var dateEl = document.getElementById("wotwDate");
      var sourceEl = document.getElementById("wotwSource");
      var imgEl = document.getElementById("wotwImage");
      var notesEl = document.getElementById("wotwNotesList");
      var warmupEl = document.getElementById("wotwWarmup");
      var cooldownEl = document.getElementById("wotwCooldown");

      if (dateEl && d.date) dateEl.textContent = d.date;
      /* Source/attribution line: only override when provided (empty collapses via CSS :empty). */
      if (sourceEl && typeof d.source === "string") sourceEl.textContent = d.source;
      /* Warm-up & cool-down are plain text; line breaks preserved by CSS white-space: pre-line.
         textContent is XSS-safe. Empty string collapses the block via CSS :empty. */
      if (warmupEl && typeof d.warmup === "string") warmupEl.textContent = d.warmup;
      if (cooldownEl && typeof d.cooldown === "string") cooldownEl.textContent = d.cooldown;

      /* Image: only override if a non-empty URL was provided; otherwise keep repo image.
         The image contains the full workout (title, format, weight, movements). */
      if (imgEl && d.image && String(d.image).trim()) {
        imgEl.src = String(d.image).trim();
      }

      /* Scaling notes */
      if (notesEl && Array.isArray(d.notes) && d.notes.length) {
        var nhtml = "";
        d.notes.forEach(function (n) {
          var label = (n && n.label) ? esc(n.label) : "";
          var text = (n && n.text != null) ? esc(n.text) : esc(n);
          nhtml += "<li>";
          if (label) nhtml += "<strong>" + label + ":</strong> ";
          nhtml += text + "</li>";
        });
        notesEl.innerHTML = nhtml;
      }
    }

    db.collection("content").doc("wotw").get().then(function (doc) {
      if (doc.exists) renderWorkout(doc.data());
    }).catch(function (err) {
      /* On any error, the hard-coded default stays visible */
      console.error("WOTW content load error:", err);
    });
  })();

  /* Current authenticated user (null = signed out) */
  var currentAuthUser = null;

  function getCurrentName() {
    if (currentAuthUser && currentAuthUser.displayName) {
      var dn = String(currentAuthUser.displayName).trim();
      if (dn) return dn;
    }
    if (currentAuthUser && currentAuthUser.email) return currentAuthUser.email;
    return "Guest";
  }
  function getCurrentUserId() {
    return currentAuthUser ? currentAuthUser.uid : null;
  }
  function isSignedIn() { return !!(auth && auth.currentUser); }

  /* ================================================
     DOM REFERENCES
     ================================================ */
  var feed = document.getElementById("mbFeed");
  var emptyState = document.getElementById("mbEmpty");
  var form = document.getElementById("mbForm");
  var msgInput = document.getElementById("mbMessage");
  var charCount = document.getElementById("charCount");
  var totalComments = document.getElementById("totalComments");
  var searchInput = document.getElementById("mbSearch");
  var searchClear = document.getElementById("mbSearchClear");
  var searchResults = document.getElementById("mbSearchResults");
  var sortBtns = document.querySelectorAll("[data-sort]");
  var composeAvatar = document.getElementById("composeAvatar");

  /* Auth DOM references */
  var signedOutEl = document.getElementById("mbSignedOut");
  var signedInEl = document.getElementById("mbSignedIn");
  var googleSignInBtn = document.getElementById("mbGoogleSignIn");
  var signOutBtn = document.getElementById("mbSignOut");
  var userPhotoEl = document.getElementById("mbUserPhoto");
  var userNameEl = document.getElementById("mbUserName");

  var currentSort = "newest";
  var currentSearch = "";

  /* Live cache of comments from Firestore */
  var liveComments = [];

  /* ================================================
     HELPERS
     ================================================ */
  function getReactions() {
    try { return JSON.parse(storeGet(REACT_KEY)) || {}; }
    catch (e) { return {}; }
  }
  function saveReactions(r) { storeSet(REACT_KEY, JSON.stringify(r)); }

  function getInitial(name) {
    return name ? name.trim().charAt(0).toUpperCase() : "?";
  }

  var AVATAR_COLORS = [
    "#3b82f6", "#9333ea", "#059669", "#d97706", "#e11d48",
    "#0891b2", "#7c3aed", "#ca8a04", "#dc2626", "#2563eb"
  ];
  function getAvatarColor(name) {
    var safe = (typeof name === "string" && name.length > 0) ? name : "?";
    var hash = 0;
    for (var i = 0; i < safe.length; i++) {
      hash = safe.charCodeAt(i) + ((hash << 5) - hash);
    }
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
  }

  function timeAgo(ts) {
    var diff = Date.now() - ts;
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

  /* ================================================
     NESTED REPLY HELPERS
     ================================================ */
  function deepCloneReplies(replies) {
    if (!replies) return [];
    return replies.map(function (r) {
      var clone = Object.assign({}, r);
      if (clone.replies) clone.replies = deepCloneReplies(clone.replies);
      return clone;
    });
  }

  function findReplyInTree(replies, targetId) {
    for (var i = 0; i < replies.length; i++) {
      if (replies[i].id === targetId) {
        return { node: replies[i], parent: replies, index: i };
      }
      if (replies[i].replies && replies[i].replies.length > 0) {
        var found = findReplyInTree(replies[i].replies, targetId);
        if (found) return found;
      }
    }
    return null;
  }

  function searchNested(replies, q) {
    for (var i = 0; i < replies.length; i++) {
      if (replies[i].name.toLowerCase().indexOf(q) !== -1) return true;
      if (replies[i].text.toLowerCase().indexOf(q) !== -1) return true;
      if (replies[i].replies && searchNested(replies[i].replies, q)) return true;
    }
    return false;
  }

  /* ================================================
     COUNT, SORT, FILTER
     ================================================ */
  function countNested(msg) {
    var total = 1;
    if (msg.replies && msg.replies.length > 0) {
      for (var i = 0; i < msg.replies.length; i++) {
        total += countNested(msg.replies[i]);
      }
    }
    return total;
  }
  function countAll(msgs) {
    var total = 0;
    msgs.forEach(function (m) { total += countNested(m); });
    return total;
  }

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

  function filterMessages(msgs, query) {
    if (!query) return msgs;
    var q = query.toLowerCase();
    return msgs.filter(function (m) {
      if (m.name.toLowerCase().indexOf(q) !== -1) return true;
      if (m.text.toLowerCase().indexOf(q) !== -1) return true;
      if (m.replies && searchNested(m.replies, q)) return true;
      return false;
    });
  }

  /* ================================================
     RENDER (recursive nested replies)
     ================================================ */
  function replyFormId(msgId) { return "reply-form-" + msgId; }

  function renderComment(msg, depth, docId) {
    var isReply = depth > 0;
    var reactions = getReactions();
    var reactKey = isReply ? (docId + ":" + msg.id) : msg.id;
    var myReaction = reactions[reactKey] || null; /* "like" | "dislike" | null */

    var html = '<div class="mb-comment' + (isReply ? " mb-comment--reply" : "") + '" data-id="' + msg.id + '" data-depth="' + depth + '">';
    html += '<div class="mb-comment__avatar" style="background:' + getAvatarColor(msg.name) + '">' + getInitial(msg.name) + '</div>';
    html += '<div class="mb-comment__body">';
    html += '<div class="mb-comment__header">';
    html += '<span class="mb-comment__name">' + escapeHtml(msg.name) + '</span>';
    html += '<span class="mb-comment__time">' + timeAgo(msg.ts) + '</span>';
    html += '</div>';
    html += '<div class="mb-comment__text">' + highlightText(msg.text, currentSearch) + '</div>';
    html += '<div class="mb-comment__actions">';

    /* Like button */
    html += '<button class="mb-action mb-action--like' + (myReaction === "like" ? " mb-action--liked" : "") + '" data-react="like" data-key="' + reactKey + '" data-doc="' + docId + '" data-target="' + msg.id + '" aria-label="Like">';
    html += '<svg width="14" height="14" viewBox="0 0 24 24" fill="' + (myReaction === "like" ? "currentColor" : "none") + '" stroke="currentColor" stroke-width="2"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>';
    html += '<span>' + (msg.likes || 0) + '</span>';
    html += '</button>';

    /* Dislike button */
    html += '<button class="mb-action mb-action--dislike' + (myReaction === "dislike" ? " mb-action--disliked" : "") + '" data-react="dislike" data-key="' + reactKey + '" data-doc="' + docId + '" data-target="' + msg.id + '" aria-label="Dislike">';
    html += '<svg width="14" height="14" viewBox="0 0 24 24" fill="' + (myReaction === "dislike" ? "currentColor" : "none") + '" stroke="currentColor" stroke-width="2"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"/></svg>';
    html += '<span>' + (msg.dislikes || 0) + '</span>';
    html += '</button>';

    /* Reply button */
    html += '<button class="mb-action mb-action--reply" data-reply-to="' + msg.id + '" data-doc="' + docId + '">';
    html += '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 10 20 15 15 20"/><path d="M4 4v7a4 4 0 0 0 4 4h12"/></svg>';
    html += '<span>Reply</span>';
    html += '</button>';

    html += '</div>'; /* end actions */

    /* Reply form (hidden by default) */
    html += '<div class="mb-reply-form" id="' + replyFormId(msg.id) + '" style="display:none">';
    html += '<div class="mb-reply-form__row">';
    html += '<textarea class="mb-reply-form__textarea" placeholder="Write a reply..." rows="2" maxlength="280"></textarea>';
    html += '<button class="mb-reply-form__submit" data-submit-reply="' + msg.id + '" data-doc="' + docId + '">Reply</button>';
    html += '</div>';
    html += '<div class="mb-reply-form__hint" style="display:none">Sign in with Google to reply.</div>';
    html += '</div>';

    html += '</div></div>'; /* end body, end comment */

    /* Render nested replies recursively */
    if (msg.replies && msg.replies.length > 0) {
      var totalReplies = 0;
      var countRepliesDeep = function (arr) {
        for (var ci = 0; ci < arr.length; ci++) {
          totalReplies++;
          if (arr[ci].replies) countRepliesDeep(arr[ci].replies);
        }
      };
      countRepliesDeep(msg.replies);

      var label = totalReplies === 1 ? "See 1 reply" : "See " + totalReplies + " replies";
      var hideLabel = totalReplies === 1 ? "Hide reply" : "Hide replies";

      if (depth === 0) {
        html += '<button class="mb-replies-toggle" data-toggle-replies="' + msg.id + '" data-label-show="' + label + '" data-label-hide="' + hideLabel + '">';
        html += '<svg class="mb-replies-toggle__icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>';
        html += '<span>' + label + '</span>';
        html += '</button>';
        html += '<div class="mb-replies" id="replies-' + msg.id + '" style="display:none">';
      } else {
        html += '<div class="mb-replies">';
      }
      msg.replies.forEach(function (r) {
        html += renderComment(r, depth + 1, docId);
      });
      html += '</div>';
    }

    return html;
  }

  function render() {
    var msgs = liveComments;
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
        emptyState.querySelector("p").textContent = "No scores yet. Be the first to post yours.";
        searchResults.style.display = "none";
      }
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

    var html = "";
    sorted.forEach(function (msg) {
      html += '<div class="mb-comment-wrapper">' + renderComment(msg, 0, msg.id) + '</div>';
    });

    var oldWrappers = feed.querySelectorAll(".mb-comment-wrapper");
    oldWrappers.forEach(function (el) { el.remove(); });

    var temp = document.createElement("div");
    temp.innerHTML = html;
    while (temp.firstChild) {
      feed.insertBefore(temp.firstChild, emptyState);
    }
  }

  /* ================================================
     FIRESTORE: REAL-TIME LISTENER
     ================================================ */
  commentsRef.orderBy("ts", "desc").onSnapshot(function (snapshot) {
    liveComments = [];
    snapshot.forEach(function (doc) {
      var data = doc.data();
      data.id = doc.id;
      if (!data.replies) data.replies = [];
      liveComments.push(data);
    });
    render();
  }, function (err) {
    console.error("Firestore listener error:", err);
  });

  /* ================================================
     EVENT: SUBMIT COMMENT (requires sign-in)
     ================================================ */
  form.addEventListener("submit", function (e) {
    e.preventDefault();

    if (!isSignedIn()) {
      alert("Please sign in with Google to post your score.");
      return;
    }

    var name = getCurrentName();
    var text = msgInput.value.trim();
    if (!text) return;

    commentsRef.add({
      name: name,
      text: text,
      ts: Date.now(),
      likes: 0,
      dislikes: 0,
      replies: [],
      uid: getCurrentUserId(),
      photoURL: (currentAuthUser && currentAuthUser.photoURL) || null
    }).then(function () {
      msgInput.value = "";
      charCount.textContent = "0";
      feed.scrollIntoView({ behavior: "smooth", block: "start" });
    }).catch(function (err) {
      console.error("Error posting score:", err);
      alert("Error posting score. Please try again.");
    });
  });

  /* CHAR COUNT */
  msgInput.addEventListener("input", function () {
    charCount.textContent = msgInput.value.length;
  });

  /* ================================================
     REACTION HELPER — update like/dislike on a target
     reactionType: "like" | "dislike"
     ================================================ */
  function applyReaction(reactKey, docId, targetId, reactionType) {
    var reactions = getReactions();
    var prev = reactions[reactKey] || null;

    /* Determine deltas for likes and dislikes */
    var likeDelta = 0, dislikeDelta = 0;

    if (prev === reactionType) {
      /* Toggle off the same reaction */
      if (reactionType === "like") likeDelta = -1; else dislikeDelta = -1;
      delete reactions[reactKey];
    } else {
      /* New or switched reaction */
      if (prev === "like") likeDelta -= 1;
      if (prev === "dislike") dislikeDelta -= 1;
      if (reactionType === "like") likeDelta += 1; else dislikeDelta += 1;
      reactions[reactKey] = reactionType;
    }
    saveReactions(reactions);

    var docMsg = liveComments.find(function (m) { return m.id === docId; });
    if (!docMsg) return;

    if (targetId === docId) {
      var newLikes = Math.max(0, (docMsg.likes || 0) + likeDelta);
      var newDislikes = Math.max(0, (docMsg.dislikes || 0) + dislikeDelta);
      commentsRef.doc(docId).update({ likes: newLikes, dislikes: newDislikes });
    } else {
      var clonedReplies = deepCloneReplies(docMsg.replies);
      var found = findReplyInTree(clonedReplies, targetId);
      if (!found) return;
      found.node.likes = Math.max(0, (found.node.likes || 0) + likeDelta);
      found.node.dislikes = Math.max(0, (found.node.dislikes || 0) + dislikeDelta);
      commentsRef.doc(docId).update({ replies: clonedReplies });
    }
  }

  /* ================================================
     EVENT DELEGATION: REACTIONS, REPLIES (nested)
     ================================================ */
  feed.addEventListener("click", function (e) {

    /* --- Toggle replies visibility --- */
    var toggleBtn = e.target.closest("[data-toggle-replies]");
    if (toggleBtn) {
      var toggleId = toggleBtn.getAttribute("data-toggle-replies");
      var repliesDiv = document.getElementById("replies-" + toggleId);
      if (repliesDiv) {
        var isHidden = repliesDiv.style.display === "none";
        repliesDiv.style.display = isHidden ? "block" : "none";
        var labelSpan = toggleBtn.querySelector("span");
        if (labelSpan) {
          labelSpan.textContent = isHidden ? toggleBtn.getAttribute("data-label-hide") : toggleBtn.getAttribute("data-label-show");
        }
        toggleBtn.classList.toggle("mb-replies-toggle--open", isHidden);
      }
      return;
    }

    /* --- Like / Dislike (anyone can react) --- */
    var reactBtn = e.target.closest("[data-react]");
    if (reactBtn) {
      var reactionType = reactBtn.getAttribute("data-react");
      var reactKey = reactBtn.getAttribute("data-key");
      var docId = reactBtn.getAttribute("data-doc");
      var targetId = reactBtn.getAttribute("data-target");
      applyReaction(reactKey, docId, targetId, reactionType);
      return;
    }

    /* --- Reply toggle (requires sign-in) --- */
    var replyBtn = e.target.closest("[data-reply-to]");
    if (replyBtn) {
      var msgId = replyBtn.getAttribute("data-reply-to");
      var replyForm = document.getElementById(replyFormId(msgId));
      if (!replyForm) return;

      var ta = replyForm.querySelector(".mb-reply-form__textarea");
      var submitBtnEl = replyForm.querySelector(".mb-reply-form__submit");
      var hintEl = replyForm.querySelector(".mb-reply-form__hint");

      var isVisible = replyForm.style.display !== "none";
      replyForm.style.display = isVisible ? "none" : "block";

      if (!isVisible) {
        if (isSignedIn()) {
          if (ta) { ta.disabled = false; ta.focus(); }
          if (submitBtnEl) submitBtnEl.disabled = false;
          if (hintEl) hintEl.style.display = "none";
        } else {
          if (ta) ta.disabled = true;
          if (submitBtnEl) submitBtnEl.disabled = true;
          if (hintEl) hintEl.style.display = "block";
        }
      }
      return;
    }

    /* --- Submit reply (requires sign-in, works at any depth) --- */
    var submitBtn = e.target.closest("[data-submit-reply]");
    if (submitBtn) {
      if (!isSignedIn()) {
        alert("Please sign in with Google to reply.");
        return;
      }

      var replyToId = submitBtn.getAttribute("data-submit-reply");
      var docIdForReply = submitBtn.getAttribute("data-doc");
      var replyFormEl = document.getElementById(replyFormId(replyToId));
      var replyName = getCurrentName();
      var replyText = replyFormEl.querySelector(".mb-reply-form__textarea").value.trim();
      if (!replyText) return;

      var parentDoc = liveComments.find(function (m) { return m.id === docIdForReply; });
      if (!parentDoc) return;

      var newReply = {
        id: Date.now().toString(36) + Math.random().toString(36).substr(2, 6),
        name: replyName,
        text: replyText,
        ts: Date.now(),
        likes: 0,
        dislikes: 0,
        replies: [],
        uid: getCurrentUserId()
      };

      if (replyToId === docIdForReply) {
        var topReplies = deepCloneReplies(parentDoc.replies).concat([newReply]);
        commentsRef.doc(docIdForReply).update({ replies: topReplies }).catch(function (err) {
          console.error("Error posting reply:", err);
        });
      } else {
        var cloned = deepCloneReplies(parentDoc.replies);
        var target = findReplyInTree(cloned, replyToId);
        if (!target) return;
        if (!target.node.replies) target.node.replies = [];
        target.node.replies.push(newReply);
        commentsRef.doc(docIdForReply).update({ replies: cloned }).catch(function (err) {
          console.error("Error posting nested reply:", err);
        });
      }
      return;
    }
  });

  /* ================================================
     SEARCH
     ================================================ */
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

  /* ================================================
     SORT
     ================================================ */
  sortBtns.forEach(function (btn) {
    btn.addEventListener("click", function () {
      sortBtns.forEach(function (b) { b.classList.remove("mb-sort__btn--active"); });
      btn.classList.add("mb-sort__btn--active");
      currentSort = btn.getAttribute("data-sort");
      render();
    });
  });

  /* ================================================
     AUTH: GOOGLE SIGN-IN / SIGN-OUT + STATE LISTENER
     ================================================ */
  function setComposeEnabled(enabled) {
    if (msgInput) msgInput.disabled = !enabled;
    if (form) form.classList.toggle("mb-compose__form--disabled", !enabled);
  }

  function updateAuthUI(user) {
    currentAuthUser = user;
    var name = getCurrentName();

    if (user) {
      signedOutEl.style.display = "none";
      signedInEl.style.display = "flex";
      userNameEl.textContent = user.displayName || user.email || "User";
      if (user.photoURL) {
        userPhotoEl.src = user.photoURL;
        userPhotoEl.alt = user.displayName || "User";
        userPhotoEl.style.display = "block";
        composeAvatar.textContent = "";
        composeAvatar.style.backgroundImage = 'url("' + user.photoURL + '")';
        composeAvatar.style.backgroundSize = "cover";
        composeAvatar.style.backgroundPosition = "center";
      } else {
        userPhotoEl.style.display = "none";
        composeAvatar.style.backgroundImage = "none";
        composeAvatar.textContent = getInitial(name);
        composeAvatar.style.background = getAvatarColor(name);
      }
      setComposeEnabled(true);
    } else {
      signedOutEl.style.display = "flex";
      signedInEl.style.display = "none";
      userNameEl.textContent = "";
      userPhotoEl.src = "";
      composeAvatar.style.backgroundImage = "none";
      composeAvatar.textContent = "?";
      composeAvatar.style.background = "var(--color-surface-offset)";
      setComposeEnabled(false);
    }
  }

  if (auth) {
    auth.onAuthStateChanged(function (user) { updateAuthUI(user); });
    auth.getRedirectResult().catch(function (err) {
      if (err && err.code && err.code !== "auth/popup-closed-by-user") {
        console.error("Google redirect sign-in error:", err);
      }
    });
  }

  if (googleSignInBtn) {
    googleSignInBtn.addEventListener("click", function () {
      var provider = new firebase.auth.GoogleAuthProvider();
      auth.signInWithPopup(provider).catch(function (err) {
        if (!err || !err.code) return;
        if (err.code === "auth/popup-closed-by-user") return;
        if (
          err.code === "auth/popup-blocked" ||
          err.code === "auth/cancelled-popup-request" ||
          err.code === "auth/operation-not-supported-in-this-environment" ||
          err.code === "auth/internal-error" ||
          err.code === "auth/web-storage-unsupported"
        ) {
          auth.signInWithRedirect(provider).catch(function (e2) {
            console.error("Google redirect sign-in error:", e2);
          });
          return;
        }
        console.error("Google sign-in error:", err);
      });
    });
  }

  if (signOutBtn) {
    signOutBtn.addEventListener("click", function () {
      auth.signOut().catch(function (err) {
        console.error("Sign-out error:", err);
      });
    });
  }

  /* Start with composing disabled until auth state resolves */
  setComposeEnabled(false);

})();
