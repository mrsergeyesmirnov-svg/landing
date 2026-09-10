(function (global) {
  "use strict";

  function base() {
    return String(global.PLATFORM_API_URL || "").replace(/\/$/, "");
  }

  function request(path, options) {
    options = options || {};
    options.credentials = "include";
    options.headers = Object.assign({ "Content-Type": "application/json" }, options.headers || {});
    return fetch(base() + path, options).then(function (response) {
      if (!response.ok) throw new Error(response.status === 401 ? "Неверный логин, пароль или код" : "Ошибка сервера");
      return response.json();
    });
  }

  function init(showApp) {
    var form = document.getElementById("gateForm");
    var error = document.getElementById("gateErr");
    var logout = document.getElementById("logoutBtn");
    if (!form || !base()) return;

    request("/api/auth/me").then(showApp).catch(function () {});
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      error.classList.remove("on");
      request("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          username: document.getElementById("username").value.trim(),
          password: document.getElementById("pwd").value,
          otp: document.getElementById("otp").value.trim(),
          remember: document.getElementById("remember").checked
        })
      }).then(showApp).catch(function (err) {
        error.textContent = err.message;
        error.classList.add("on");
      });
    });
    if (logout) logout.addEventListener("click", function () {
      request("/api/auth/logout", { method: "POST" }).finally(function () { location.reload(); });
    });
  }

  global.PlatformAuth = { init: init };
})(window);
