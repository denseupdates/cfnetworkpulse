/* CF Network News — Advertise Page (form + Stripe redirect) */
(function () {
  "use strict";

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

  function storeSet(key, val) {
    if (canUseLS) { _ls.setItem(key, val); return; }
    memStore[key] = val;
  }

  var AD_PENDING_KEY = "cfnn_ad_pending";
  var STRIPE_LINKS = {
    weekly: "https://buy.stripe.com/fZueVe9J6bfqeNufuJ2Ry02",
    monthly: "https://buy.stripe.com/fZubJ2aNa4R27l2gyN2Ry03"
  };

  var adForm = document.getElementById("adForm");

  /* --- Image upload handling --- */
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

  /* Tier durations (must match admin.js / message-board.js) */
  var TIER_DURATION = {
    weekly: 7 * 24 * 60 * 60 * 1000,
    monthly: 30 * 24 * 60 * 60 * 1000
  };

  if (adForm) {
    adForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var submitBtn = adForm.querySelector(".ad-form__submit");
      var adName = document.getElementById("adName").value.trim();
      var adEmail = document.getElementById("adEmail").value.trim();
      var adTier = document.getElementById("adTier").value;
      var adMessage = document.getElementById("adMessage").value.trim();
      var adLink = document.getElementById("adLink").value.trim();

      if (!adName || !adEmail || !adMessage) return;

      var now = Date.now();
      var stripeUrl = STRIPE_LINKS[adTier] || STRIPE_LINKS.weekly;

      /* Build the ad record */
      var pendingAd = {
        name: adName,
        email: adEmail,
        tier: adTier,
        text: adMessage,
        link: adLink || "",
        image: adImageData || "",
        ts: now,
        paidAt: now,
        expiresAt: now + (TIER_DURATION[adTier] || TIER_DURATION.weekly),
        status: "pending"
      };

      /* Clear the local-storage handoff so message-board.js does NOT
         create a duplicate Firestore record on Stripe return. */
      storeSet(AD_PENDING_KEY, "");

      function goToStripe() {
        window.location.href = stripeUrl;
      }

      /* Write the ad to Firestore as 'pending' BEFORE redirecting to Stripe.
         This guarantees it shows up in the admin panel for approval, even if
         the user abandons checkout. */
      try {
        if (window.cfnnDb && typeof window.cfnnDb.collection === "function") {
          if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = "Submitting...";
          }
          window.cfnnDb.collection("ads").add(pendingAd)
            .then(goToStripe)
            .catch(function (err) {
              console.error("CFNN: Firestore write failed, falling back to local-storage handoff.", err);
              /* Fallback: keep the old behaviour so the ad isn't lost */
              storeSet(AD_PENDING_KEY, JSON.stringify(pendingAd));
              goToStripe();
            });
        } else {
          console.warn("CFNN: Firestore not available on advertise page — using local-storage handoff.");
          storeSet(AD_PENDING_KEY, JSON.stringify(pendingAd));
          goToStripe();
        }
      } catch (err) {
        console.error("CFNN: Unexpected error submitting ad:", err);
        storeSet(AD_PENDING_KEY, JSON.stringify(pendingAd));
        goToStripe();
      }
    });
  }
})();
