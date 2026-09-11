(function (global) {
  "use strict";

  var recordedBlob = null;
  var recordedName = "voice-audit.webm";
  var mediaRecorder = null;
  var mediaStream = null;
  var chunks = [];
  var busy = false;

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>\"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function ensureStyles() {
    if (document.getElementById("ahAiStyles")) return;
    var style = document.createElement("style");
    style.id = "ahAiStyles";
    style.textContent = [
      ".ah-menu-btn{white-space:nowrap}",
      ".ah-ai-card{border:1px solid #d6d3d1;background:linear-gradient(180deg,#fff 0%,#fafaf9 100%)}",
      ".ah-ai-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}",
      ".ah-ai-badge{font-size:.68rem;font-weight:800;color:#7c3aed;background:#f5f3ff;border:1px solid #ddd6fe;border-radius:999px;padding:5px 8px;white-space:nowrap}",
      ".ah-ai-tools{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:12px 0}",
      ".ah-ai-tools button,.ah-file-label{display:flex;align-items:center;justify-content:center;min-height:48px;text-align:center}",
      ".ah-file-label{cursor:pointer;border:1px solid #e7e5e4;border-radius:12px;background:#fff;font-weight:800;padding:10px 12px}",
      ".ah-ai-status{font-size:.8rem;color:#57534e;margin-top:9px;min-height:1.3em;white-space:pre-wrap}",
      ".ah-ai-status.ok{color:#166534}.ah-ai-status.err{color:#9f1239}",
      ".ah-ai-note{width:100%;min-height:90px;border:1px solid #e7e5e4;border-radius:12px;padding:11px 12px;font:inherit;resize:vertical;background:#fff}",
      ".ah-recording{background:#fff1f2!important;border-color:#fda4af!important;color:#9f1239!important}",
      "@media(max-width:650px){.ah-ai-tools{grid-template-columns:1fr}.top{align-items:flex-start}.top .ah-menu-btn{display:inline-flex!important;padding:9px 11px;font-size:.82rem}}"
    ].join("");
    document.head.appendChild(style);
  }

  function addMenuButton() {
    var top = document.querySelector(".audit-shell .top");
    if (!top || top.querySelector(".ah-menu-btn")) return;
    var link = document.createElement("a");
    link.className = "btnx ah-menu-btn";
    link.href = "index.html";
    link.textContent = "← Главное меню";
    top.appendChild(link);
  }

  function currentAuditId() {
    return global.AH_CURRENT_AUDIT_ID || "";
  }

  function isAuditOpen() {
    var view = document.getElementById("auditView");
    return !!(view && !view.classList.contains("hidden"));
  }

  function selectedFile() {
    var input = document.getElementById("ahAiFile");
    return input && input.files && input.files[0] ? input.files[0] : null;
  }

  function setStatus(text, cls) {
    var node = document.getElementById("ahAiStatus");
    if (!node) return;
    node.className = "ah-ai-status" + (cls ? " " + cls : "");
    node.textContent = text || "";
  }

  function updateRecordedLabel() {
    var node = document.getElementById("ahRecordedLabel");
    if (!node) return;
    node.textContent = recordedBlob
      ? "Голосовая запись готова · " + Math.max(1, Math.round(recordedBlob.size / 1024)) + " КБ"
      : "Можно надиктовать наблюдения прямо здесь.";
  }

  function injectAiCard() {
    if (!isAuditOpen() || !currentAuditId()) return;
    var view = document.getElementById("auditView");
    if (!view || view.querySelector("#ahAiCard")) return;
    var card = document.createElement("div");
    card.id = "ahAiCard";
    card.className = "card ah-ai-card";
    card.innerHTML =
      '<div class="ah-ai-head"><div><h3 style="margin:0 0 5px">ИИ-помощник аудита</h3>' +
      '<div class="muted">Надиктуй наблюдения или загрузи запись разговора. ИИ расшифрует её, сопоставит с 150 стандартами и сам заполнит только подтверждённые пункты.</div></div>' +
      '<span class="ah-ai-badge">не перезаписывает ручное</span></div>' +
      '<div class="ah-ai-tools">' +
      '<button class="btnx" type="button" id="ahRecordBtn">🎙 Записать голосом</button>' +
      '<label class="ah-file-label" for="ahAiFile">📎 Загрузить запись<input id="ahAiFile" type="file" accept="audio/*,video/mp4,.mp3,.m4a,.wav,.webm,.mp4" hidden></label>' +
      '</div>' +
      '<div class="muted" id="ahRecordedLabel">Можно надиктовать наблюдения прямо здесь.</div>' +
      '<div class="field" style="margin-top:10px"><label>Текст / заметки / готовая расшифровка</label>' +
      '<textarea class="ah-ai-note" id="ahAiNote" placeholder="Например: менеджер сказал, что pre-shift проводят только по пятницам; у новичков нет единого плана адаптации…"></textarea></div>' +
      '<div class="actions"><button class="btnx primary" type="button" id="ahAnalyzeBtn">Разобрать и заполнить аудит</button></div>' +
      '<div class="ah-ai-status" id="ahAiStatus"></div>';

    view.insertBefore(card, view.firstChild);
    document.getElementById("ahRecordBtn").onclick = toggleRecording;
    document.getElementById("ahAnalyzeBtn").onclick = analyze;
    document.getElementById("ahAiFile").onchange = function () {
      var f = selectedFile();
      setStatus(f ? "Выбран файл: " + f.name + " · " + Math.round(f.size / 1024 / 1024 * 10) / 10 + " МБ" : "");
    };
    updateRecordedLabel();
  }

  function bestMime() {
    if (!global.MediaRecorder || !MediaRecorder.isTypeSupported) return "";
    var types = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"];
    for (var i = 0; i < types.length; i++) {
      if (MediaRecorder.isTypeSupported(types[i])) return types[i];
    }
    return "";
  }

  function stopTracks() {
    if (mediaStream) mediaStream.getTracks().forEach(function (t) { t.stop(); });
    mediaStream = null;
  }

  function toggleRecording() {
    if (busy) return;
    var button = document.getElementById("ahRecordBtn");
    if (mediaRecorder && mediaRecorder.state === "recording") {
      mediaRecorder.stop();
      if (button) {
        button.textContent = "🎙 Записать ещё";
        button.classList.remove("ah-recording");
      }
      return;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !global.MediaRecorder) {
      setStatus("Этот браузер не поддерживает запись с микрофона. Используй «Загрузить запись».", "err");
      return;
    }
    setStatus("Запрашиваю доступ к микрофону…");
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
      mediaStream = stream;
      chunks = [];
      var mime = bestMime();
      try {
        mediaRecorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      } catch (_) {
        mediaRecorder = new MediaRecorder(stream);
      }
      mediaRecorder.ondataavailable = function (event) {
        if (event.data && event.data.size) chunks.push(event.data);
      };
      mediaRecorder.onstop = function () {
        var type = mediaRecorder.mimeType || (chunks[0] && chunks[0].type) || "audio/webm";
        recordedBlob = new Blob(chunks, { type: type });
        recordedName = type.indexOf("mp4") >= 0 ? "voice-audit.m4a" : "voice-audit.webm";
        stopTracks();
        updateRecordedLabel();
        setStatus("Запись готова. Нажми «Разобрать и заполнить аудит».", "ok");
      };
      mediaRecorder.start(1000);
      if (button) {
        button.textContent = "⏹ Остановить запись";
        button.classList.add("ah-recording");
      }
      setStatus("Идёт запись… Говори свободно: что увидел, что сказал менеджер, где есть система, а где её нет.");
    }).catch(function (err) {
      setStatus("Не удалось включить микрофон: " + (err.message || err), "err");
    });
  }

  function analyze() {
    if (busy) return;
    var auditId = currentAuditId();
    if (!auditId) {
      setStatus("Не вижу активный аудит. Открой или начни аудит ещё раз.", "err");
      return;
    }
    if (mediaRecorder && mediaRecorder.state === "recording") {
      setStatus("Сначала останови запись.", "err");
      return;
    }
    var noteNode = document.getElementById("ahAiNote");
    var note = noteNode ? noteNode.value.trim() : "";
    var file = selectedFile();
    if (!file && !recordedBlob && !note) {
      setStatus("Сначала надиктуй, загрузи запись или добавь текст.", "err");
      return;
    }
    if (file && file.size > 50 * 1024 * 1024) {
      setStatus("Файл больше 50 МБ. Сожми его или раздели разговор на части.", "err");
      return;
    }
    busy = true;
    var btn = document.getElementById("ahAnalyzeBtn");
    if (btn) btn.disabled = true;
    setStatus("1/3 Загружаю и расшифровываю → 2/3 сопоставляю с 150 пунктами → 3/3 сохраняю в аудит. Длинная запись может занять пару минут.");
    var form = new FormData();
    form.append("note", note);
    form.append("overwrite", "false");
    if (file) form.append("file", file, file.name);
    else if (recordedBlob) form.append("file", recordedBlob, recordedName);

    global.PlatformAuth.request("/api/audits/" + encodeURIComponent(auditId) + "/ai-ingest", {
      method: "POST",
      body: form
    }).then(function (result) {
      setStatus(
        "Готово. ИИ нашёл " + result.proposed_count + " подтверждаемых ответов и автоматически записал " + result.applied_count + ". " +
        (result.skipped_count ? "Пропущено/сохранено вручную: " + result.skipped_count + ". " : "") +
        (result.summary || ""),
        "ok"
      );
      sessionStorage.setItem("ah_reopen_audit", auditId);
      setTimeout(function () { location.reload(); }, 1400);
    }).catch(function (err) {
      busy = false;
      if (btn) btn.disabled = false;
      setStatus(err.message || String(err), "err");
    });
  }

  function tryReopenAfterReload() {
    var id = sessionStorage.getItem("ah_reopen_audit");
    if (!id) return;
    var button = document.querySelector('[data-open="' + CSS.escape(id) + '"]');
    if (!button) return;
    sessionStorage.removeItem("ah_reopen_audit");
    button.click();
  }

  function syncUi() {
    ensureStyles();
    addMenuButton();
    injectAiCard();
    tryReopenAfterReload();
  }

  global.addEventListener("ah:audit-context", function () {
    setTimeout(syncUi, 0);
  });

  var observer = new MutationObserver(function () {
    syncUi();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "hidden"] });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", syncUi);
  else syncUi();
})(window);
