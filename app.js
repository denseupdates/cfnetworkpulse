/* CF Network News — app.js (multi-page) */

(function () {
  "use strict";

  // ===== Theme Toggle =====
  var toggle = document.querySelector("[data-theme-toggle]");
  var root = document.documentElement;

  var theme = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
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

  function onScroll() {
    var y = window.scrollY;
    if (header) {
      if (y > 10) {
        header.classList.add("header--scrolled");
      } else {
        header.classList.remove("header--scrolled");
      }
    }
  }

  window.addEventListener("scroll", onScroll, { passive: true });

  // ===== Smooth Scroll for Same-Page Anchor Links =====
  document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
    anchor.addEventListener("click", function (e) {
      var href = this.getAttribute("href");
      if (href === "#") return;
      var target = document.querySelector(href);
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  });

  // ===== Newsletter Form — Mailchimp Integration =====
  var nlForm = document.getElementById("newsletterForm");
  var nlSuccess = document.getElementById("newsletterSuccess");
  var nlError = document.getElementById("newsletterError");
  var nlBtn = nlForm ? nlForm.querySelector(".newsletter__btn") : null;

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

      // Build form data
      var formData = "u=d40058698a0dbd5c27f2fa54c&id=8bda743e10";
      formData += "&EMAIL=" + encodeURIComponent(email);
      formData += "&b_d40058698a0dbd5c27f2fa54c_8bda743e10=";

      // Submit via hidden iframe to avoid redirect
      var iframeName = "mc-iframe-" + Date.now();
      var iframe = document.createElement("iframe");
      iframe.name = iframeName;
      iframe.style.display = "none";
      document.body.appendChild(iframe);

      var form = document.createElement("form");
      form.method = "POST";
      form.action = "https://cfnetworknews.us13.list-manage.com/subscribe/post";
      form.target = iframeName;
      form.style.display = "none";

      // Add fields to the hidden form
      var fields = {
        u: "d40058698a0dbd5c27f2fa54c",
        id: "8bda743e10",
        EMAIL: email,
        b_d40058698a0dbd5c27f2fa54c_8bda743e10: ""
      };

      for (var key in fields) {
        var input = document.createElement("input");
        input.type = "hidden";
        input.name = key;
        input.value = fields[key];
        form.appendChild(input);
      }

      document.body.appendChild(form);
      form.submit();

      // Show success after brief delay
      setTimeout(function () {
        nlForm.style.display = "none";
        if (nlSuccess) nlSuccess.classList.add("newsletter__success--visible");
        if (nlBtn) {
          nlBtn.disabled = false;
          nlBtn.textContent = "Subscribe";
        }
        document.body.removeChild(form);
        document.body.removeChild(iframe);
      }, 1500);
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
