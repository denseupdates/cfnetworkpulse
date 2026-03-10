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
    weekly: "https://buy.stripe.com/4gM14odZm5V65cUfuJ2Ry00",
    monthly: "https://buy.stripe.com/eVqbJ25sQ97i7l2cix2Ry01"
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

  if (adForm) {
    adForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var adName = document.getElementById("adName").value.trim();
      var adEmail = document.getElementById("adEmail").value.trim();
      var adTier = document.getElementById("adTier").value;
      var adMessage = document.getElementById("adMessage").value.trim();
      var adLink = document.getElementById("adLink").value.trim();

      if (!adName || !adEmail || !adMessage) return;

      /* Save pending ad to local storage before Stripe redirect */
      var pendingAd = {
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

      var stripeUrl = STRIPE_LINKS[adTier] || STRIPE_LINKS.weekly;
      window.location.href = stripeUrl;
    });
  }
})();
