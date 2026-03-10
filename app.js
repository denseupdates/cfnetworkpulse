/* CF Network News — app.js */

(function () {
  "use strict";

  // ===== Theme Toggle =====
  const toggle = document.querySelector("[data-theme-toggle]");
  const root = document.documentElement;
  let theme = matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
  root.setAttribute("data-theme", theme);

  function updateToggleIcon() {
    if (!toggle) return;
    toggle.innerHTML =
      theme === "dark"
        ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>'
        : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
    toggle.setAttribute(
      "aria-label",
      "Switch to " + (theme === "dark" ? "light" : "dark") + " mode"
    );
  }

  updateToggleIcon();

  if (toggle) {
    toggle.addEventListener("click", function () {
      theme = theme === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", theme);
      updateToggleIcon();
    });
  }

  // ===== Header Scroll Shadow =====
  var header = document.getElementById("header");
  var lastY = 0;

  function onScroll() {
    var y = window.scrollY;
    if (header) {
      if (y > 10) {
        header.classList.add("header--scrolled");
      } else {
        header.classList.remove("header--scrolled");
      }
    }
    lastY = y;
  }

  window.addEventListener("scroll", onScroll, { passive: true });

  // ===== Mobile Menu Toggle =====
  var mobileToggle = document.getElementById("mobileToggle");
  var mainNav = document.getElementById("mainNav");

  if (mobileToggle && mainNav) {
    mobileToggle.addEventListener("click", function () {
      var isOpen = mainNav.classList.toggle("nav--open");
      mobileToggle.setAttribute("aria-expanded", String(isOpen));
    });

    // Close menu on link click
    mainNav.querySelectorAll(".nav__link").forEach(function (link) {
      link.addEventListener("click", function () {
        mainNav.classList.remove("nav--open");
        mobileToggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  // ===== Smooth Scroll for Anchor Links =====
  document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
    anchor.addEventListener("click", function (e) {
      var target = document.querySelector(this.getAttribute("href"));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  });

  // ===== Newsletter Form — Mailchimp JSONP Integration =====
  var nlForm = document.getElementById("newsletterForm");
  var nlSuccess = document.getElementById("newsletterSuccess");
  var nlError = document.getElementById("newsletterError");
  var nlBtn = nlForm ? nlForm.querySelector(".newsletter__btn") : null;

  // Global callback for Mailchimp JSONP response
  window.mcCallback = function (resp) {
    if (nlBtn) {
      nlBtn.disabled = false;
      nlBtn.textContent = "Subscribe";
    }
    if (resp.result === "success") {
      nlForm.style.display = "none";
      if (nlSuccess) nlSuccess.classList.add("newsletter__success--visible");
      if (nlError) nlError.style.display = "none";
    } else {
      // Clean up Mailchimp error messages (strip HTML links etc.)
      var msg = resp.msg || "Something went wrong. Please try again.";
      if (msg.indexOf("already subscribed") > -1) {
        msg = "You're already subscribed! Check your inbox for updates.";
      } else if (msg.indexOf(" - ") > -1) {
        msg = msg.substring(msg.indexOf(" - ") + 3);
      }
      if (nlError) {
        nlError.textContent = msg;
        nlError.style.display = "block";
      }
    }
  };

  if (nlForm) {
    nlForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var email = document.getElementById("nl-email").value.trim();

      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        document.getElementById("nl-email").focus();
        return;
      }

      // Disable button while submitting
      if (nlBtn) {
        nlBtn.disabled = true;
        nlBtn.textContent = "Subscribing...";
      }
      if (nlError) nlError.style.display = "none";

      // Build Mailchimp JSONP URL
      var baseUrl = "https://cfnetworknews.us13.list-manage.com/subscribe/post-json?u=d40058698a0dbd5c27f2fa54c&id=8bda743e10&c=mcCallback";
      var params = "&EMAIL=" + encodeURIComponent(email);
      var phone = document.getElementById("nl-phone").value.trim();
      if (phone) params += "&PHONE=" + encodeURIComponent(phone);

      // JSONP request
      var script = document.createElement("script");
      script.src = baseUrl + params;
      document.body.appendChild(script);

      // Clean up script tag after response
      script.onload = function () { document.body.removeChild(script); };
      script.onerror = function () {
        document.body.removeChild(script);
        if (nlBtn) {
          nlBtn.disabled = false;
          nlBtn.textContent = "Subscribe";
        }
        if (nlError) {
          nlError.textContent = "Network error. Please try again.";
          nlError.style.display = "block";
        }
      };
    });
  }

  // ===== Floating Nav (FAB) — shows when section-nav scrolls out of view =====
  var fabNav = document.getElementById("fabNav");
  var fabToggle = document.getElementById("fabToggle");
  var sectionNav = document.querySelector(".section-nav");

  if (fabToggle && fabNav) {
    fabToggle.addEventListener("click", function () {
      fabNav.classList.toggle("fab-nav--open");
    });

    // Close menu when a link is tapped
    fabNav.querySelectorAll(".fab-nav__item").forEach(function (link) {
      link.addEventListener("click", function () {
        fabNav.classList.remove("fab-nav--open");
      });
    });

    // Show FAB only after scrolling past the section-nav bar
    if (sectionNav) {
      var fabObserver = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) {
              fabNav.classList.remove("fab-nav--visible");
              fabNav.classList.remove("fab-nav--open");
            } else {
              fabNav.classList.add("fab-nav--visible");
            }
          });
        },
        { threshold: 0 }
      );
      fabObserver.observe(sectionNav);
    }
  }

})();
