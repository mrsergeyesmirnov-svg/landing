(function (global) {
  "use strict";

  function base() {
    return String(global.PLATFORM_API_URL || "").replace(/\/$/, "");
  }

  function rememberAuditContext(path, data) {
    if (!data || !data.audit || !data.audit.id || String(path || "").indexOf("/api/audits") !== 0) return;
    global.AH_CURRENT_AUDIT_ID = data.audit.id;
    global.AH_CURRENT_AUDIT = data.audit;
    try {
      global.dispatchEvent(new CustomEvent("ah:audit-context", { detail: data }));
    } catch (_) {}
  }

  function request(path, options) {
    options = options || {};
    options.credentials = "include";
    var isForm = typeof FormData !== "undefined" && options.body instanceof FormData;
    var defaults = isForm ? {} : { "Content-Type": "application/json" };
    options.headers = Object.assign(defaults, options.headers || {});
    return fetch(base() + path, options).then(function (response) {
      if (!response.ok) {
        return response.json().catch(function () { return {}; }).then(function (data) {
          throw new Error(
            response.status === 401
              ? "Неверный логин или пароль"
              : (data.detail || data.error || "Ошибка сервера")
          );
        });
      }
      return response.json().then(function (data) {
        rememberAuditContext(path, data);
        return data;
      });
    });
  }

  function removeLegacyOtpField() {
    var otp = document.getElementById("otp");
    if (!otp) return;
    otp.required = false;
    var holder = otp.closest ? otp.closest(".field") : null;
    if (holder) holder.hidden = true;
    else otp.hidden = true;
  }

  function loadAuditEnhancements() {
    if (global.__AH_AUDIT_ENHANCEMENTS_LOADING) return;
    if (String(location.pathname).indexOf("restaurant-audit") < 0) return;
    global.__AH_AUDIT_ENHANCEMENTS_LOADING = true;
    var script = document.createElement("script");
    script.src = "audit-ai.js?v=20260911-1";
    script.async = true;
    document.head.appendChild(script);
  }

  function revealApp(showApp, data) {
    var gate = document.getElementById("gate");
    var logout = document.getElementById("logoutBtn");
    if (gate) {
      gate.hidden = true;
      gate.style.setProperty("display", "none", "important");
      gate.setAttribute("aria-hidden", "true");
    }
    if (logout) {
      logout.hidden = false;
      logout.style.setProperty("display", "inline-flex", "important");
    }
    showApp(data);
    loadAuditEnhancements();
  }

  function init(showApp) {
    var form = document.getElementById("gateForm");
    var error = document.getElementById("gateErr");
    var logout = document.getElementById("logoutBtn");
    removeLegacyOtpField();
    if (!form || !base()) return;

    request("/api/auth/me").then(function (data) {
      revealApp(showApp, data);
    }).catch(function () {});

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      if (error) error.classList.remove("on");
      request("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          username: document.getElementById("username").value.trim(),
          password: document.getElementById("pwd").value,
          remember: document.getElementById("remember") ? document.getElementById("remember").checked : true
        })
      }).then(function (data) {
        revealApp(showApp, data);
      }).catch(function (err) {
        if (!error) return;
        error.textContent = err.message;
        error.classList.add("on");
      });
    });

    if (logout) logout.addEventListener("click", function () {
      request("/api/auth/logout", { method: "POST" }).finally(function () { location.reload(); });
    });

    loadAuditEnhancements();
  }

  global.PlatformAuth = { init: init, request: request };
})(window);
