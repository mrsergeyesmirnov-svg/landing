/**
 * UI-сценарий /put/ — узнающий опрос Академии счастья
 * intro → role → branchIntro → question → result → form
 */
(function () {
  var DATA = window.PUT_DATA;
  var SCORING = window.PUT_SCORING;
  var STORAGE_KEY = "academy_put_reflect_v3";

  var state = {
    phase: "intro", // intro | role | branchIntro | question | result | form
    role: null,
    qIndex: 0,
    answers: {},
    channel: "telegram",
    reaction: "",
    result: null
  };

  function load() {
    try {
      var raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (!raw) return;
      if (raw.role) state.role = raw.role;
      if (raw.answers) state.answers = raw.answers;
      if (raw.phase) state.phase = raw.phase;
      if (typeof raw.qIndex === "number") state.qIndex = raw.qIndex;
      if (raw.channel) state.channel = raw.channel;
    } catch (e) {}
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        role: state.role,
        answers: state.answers,
        phase: state.phase,
        qIndex: state.qIndex,
        channel: state.channel,
        at: Date.now()
      }));
    } catch (e) {}
  }

  function utm() {
    var p = new URLSearchParams(location.search);
    return {
      utm_source: p.get("utm_source") || "",
      utm_medium: p.get("utm_medium") || "",
      utm_campaign: p.get("utm_campaign") || ""
    };
  }

  function branch() {
    return state.role ? DATA.branches[state.role] : null;
  }

  function questions() {
    var b = branch();
    return b ? b.questions : [];
  }

  function totalSteps() {
    // intro + role + (optional branch intro counted in questions flow) + questions + result/form
    return 2 + questions().length + 1;
  }

  function currentStepNumber() {
    if (state.phase === "intro") return 1;
    if (state.phase === "role") return 2;
    if (state.phase === "branchIntro") return 3;
    if (state.phase === "question") return 3 + state.qIndex;
    return totalSteps();
  }

  function roleLabel(id) {
    var r = DATA.roles.filter(function (x) { return x.id === id; })[0];
    return r ? r.label : id;
  }

  function pickReaction() {
    var list = DATA.reactions || [];
    if (!list.length) return "";
    return list[Math.floor(Math.random() * list.length)];
  }

  function $(sel) { return document.querySelector(sel); }

  function setProgress() {
    var total = Math.max(totalSteps(), 4);
    var n = currentStepNumber();
    var meta = $("#stepMeta");
    var bar = $("#bar");
    if (state.phase === "intro") {
      meta.innerHTML = "";
      bar.style.width = "5%";
      return;
    }
    meta.innerHTML = 'Шаг <strong>' + n + "</strong> из " + total;
    bar.style.width = Math.round((n / total) * 100) + "%";
  }

  function animatePanel() {
    var panel = $("#panel");
    panel.classList.remove("is-in");
    void panel.offsetWidth;
    panel.classList.add("is-in");
  }

  function answerValue(qid) {
    return state.answers[qid];
  }

  function setSingle(qid, oid) {
    state.answers[qid] = oid;
    save();
  }

  function toggleMulti(qid, oid) {
    var cur = state.answers[qid];
    if (!Array.isArray(cur)) cur = [];
    var i = cur.indexOf(oid);
    if (i >= 0) cur.splice(i, 1);
    else cur.push(oid);
    state.answers[qid] = cur.slice();
    save();
  }

  function isSelected(qid, oid) {
    var v = state.answers[qid];
    if (Array.isArray(v)) return v.indexOf(oid) >= 0;
    return v === oid;
  }

  function computeResult() {
    state.result = SCORING.scoreAnswers(state.role, state.answers, DATA);
    return state.result;
  }

  function maskRuPhone(raw) {
    var d = String(raw || "").replace(/\D/g, "");
    if (d.charAt(0) === "8") d = "7" + d.slice(1);
    if (d.length && d.charAt(0) !== "7") d = "7" + d;
    if (!d) return "+7 ";
    d = d.slice(0, 11);
    var rest = d.slice(1);
    var out = "+7";
    if (rest.length) out += " " + rest.slice(0, 3);
    if (rest.length > 3) out += " " + rest.slice(3, 6);
    if (rest.length > 6) out += "-" + rest.slice(6, 8);
    if (rest.length > 8) out += "-" + rest.slice(8, 10);
    return out;
  }

  function digitsPhone(raw) {
    var d = String(raw || "").replace(/\D/g, "");
    if (d.length === 11 && d[0] === "8") d = "7" + d.slice(1);
    if (d.length === 10) d = "7" + d;
    return d;
  }

  function buildLeadPayload(form) {
    var result = state.result || computeResult();
    var u = utm();
    var answersFlat = {};
    Object.keys(state.answers).forEach(function (k) {
      answersFlat[k] = state.answers[k];
    });

    var noteParts = [
      "Роль: " + roleLabel(state.role) + " (" + state.role + ")",
      "Продукт: " + result.recommendedProduct,
      "Канал: " + state.channel,
      "Блоки: PEOPLE=" + result.people_score +
        " FINANCE=" + result.finance_score +
        " GUEST=" + result.guest_score +
        " PROCESS=" + result.process_score,
      "Primary: " + (result.primaryProblem || "—") +
        "; Secondary: " + (result.secondaryProblem || "—"),
      "Problems: " + (result.selectedProblems || []).join(", "),
      "Ответы:"
    ];
    (result.answerLog || []).forEach(function (a) {
      noteParts.push("· " + a.question + " → " + a.label);
    });
    if (form.email) noteParts.push("Email: " + form.email);
    if (form.comment) noteParts.push("Комментарий: " + form.comment);

      return {
      restaurant: form.name || ("Состояние · " + roleLabel(state.role)),
      city: "",
      contact: form.name || "",
      phone: form.phone,
      telegram: form.telegram,
      size: "",
      sizeLabel: roleLabel(state.role),
      problemLabel: (result.headline || "").slice(0, 120),
      problemK: 1,
      expertLabel: state.role,
      expertTier: result.recommendedProduct,
      priceMin: 0,
      priceMax: 0,
      note: noteParts.join("\n").slice(0, 3900),
      consent: true,
      contactConsent: true,
      source: "put",
      // расширенный payload для будущего API (бэкенд сейчас кладёт в lead_meta/note)
      _diagnostic: {
        role: state.role,
        answers: answersFlat,
        selected_problems: result.selectedProblems,
        result_blocks: result.resultBlocks,
        recommended_product: result.recommendedProduct,
        people_score: result.people_score,
        finance_score: result.finance_score,
        guest_score: result.guest_score,
        process_score: result.process_score,
        primary_problem: result.primaryProblem,
        secondary_problem: result.secondaryProblem,
        contact_channel: state.channel,
        email: form.email || "",
        utm_source: u.utm_source,
        utm_medium: u.utm_medium,
        utm_campaign: u.utm_campaign,
        timestamp: new Date().toISOString()
      }
    };
  }

  function renderZones(blocks) {
    return '<div class="zones">' + blocks.map(function (b) {
      return '<div class="zone is-' + b.level + '">' +
        '<span class="name">' + b.label + "</span>" +
        "<span class=\"zone-score\">" + (typeof b.display === "number" ? b.display : "") +
        " " + b.emoji + "</span></div>";
    }).join("") + "</div>";
  }

  function renderScoreBars(blocks) {
    return '<div class="score-bars">' + blocks.map(function (b) {
      var n = typeof b.display === "number" ? b.display : 0;
      return '<div class="score-row">' +
        '<div class="score-label">' + b.label + "</div>" +
        '<div class="score-track"><i style="width:' + n + '%"></i></div>' +
        '<div class="score-num">' + n + "</div></div>";
    }).join("") + "</div>";
  }

  function render() {
    var panel = $("#panel");
    setProgress();
    animatePanel();

    if (state.phase === "intro") {
      panel.innerHTML =
        '<p class="kicker">Академия счастья</p>' +
        "<h1>" + DATA.intro.title.replace(" ", "<br/>") + "</h1>" +
        '<p class="lead">' + DATA.intro.subtitle + "</p>" +
        (DATA.intro.prompt ? '<p class="prompt">' + DATA.intro.prompt + "</p>" : "") +
        '<div class="actions"><button type="button" class="btn btn-primary" id="start">' +
        DATA.intro.cta + "</button></div>";
      $("#start").onclick = function () {
        state.phase = "role";
        save();
        render();
      };
      return;
    }

    if (state.phase === "role") {
      panel.innerHTML =
        '<p class="kicker">О себе</p>' +
        "<h1>" + DATA.roleStep.title + "</h1>" +
        '<p class="lead">' + DATA.roleStep.lead + "</p>" +
        '<div class="choices" id="roles"></div>' +
        '<div class="actions">' +
          '<button type="button" class="btn btn-ghost" id="back">Назад</button>' +
        "</div>";
      var roles = $("#roles");
      DATA.roles.forEach(function (r) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "choice" + (state.role === r.id ? " is-on" : "");
        b.textContent = r.label;
        b.onclick = function () {
          state.role = r.id;
          state.answers = {};
          state.qIndex = 0;
          save();
          state.phase = "branchIntro";
          save();
          render();
        };
        roles.appendChild(b);
      });
      $("#back").onclick = function () {
        state.phase = "intro";
        save();
        render();
      };
      return;
    }

    if (state.phase === "branchIntro") {
      var br = branch();
      panel.innerHTML =
        '<p class="kicker">' + roleLabel(state.role) + "</p>" +
        "<h1>" + (br.introTitle || "Несколько вопросов") + "</h1>" +
        '<div class="actions">' +
          '<button type="button" class="btn btn-ghost" id="back">Назад</button>' +
          '<button type="button" class="btn btn-primary" id="go">Продолжить →</button>' +
        "</div>";
      $("#back").onclick = function () {
        state.phase = "role";
        save();
        render();
      };
      $("#go").onclick = function () {
        state.qIndex = 0;
        state.phase = "question";
        state.reaction = "";
        save();
        render();
      };
      return;
    }

    if (state.phase === "question") {
      var qs = questions();
      var q = qs[state.qIndex];
      if (!q) {
        state.phase = "result";
        computeResult();
        save();
        render();
        return;
      }
      var multi = q.type === "multi";
      var selectedOk = multi
        ? (Array.isArray(answerValue(q.id)) && answerValue(q.id).length > 0)
        : !!answerValue(q.id);

      panel.innerHTML =
        '<p class="kicker">' + roleLabel(state.role) + "</p>" +
        '<h1 class="ink">' + q.text + "</h1>" +
        (multi ? '<p class="lead">Можно выбрать несколько вариантов.</p>' : "") +
        '<div class="choices" id="opts"></div>' +
        '<div class="actions">' +
          '<button type="button" class="btn btn-ghost" id="back">Назад</button>' +
          (multi
            ? '<button type="button" class="btn btn-primary" id="next" ' + (selectedOk ? "" : "disabled") + ">Далее</button>"
            : "") +
        "</div>";

      var opts = $("#opts");
      q.options.forEach(function (o) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "choice" + (isSelected(q.id, o.id) ? " is-on" : "");
        b.textContent = o.label;
        b.onclick = function () {
          if (multi) {
            toggleMulti(q.id, o.id);
            render();
          } else {
            setSingle(q.id, o.id);
            state.reaction = "";
            save();
            render();
            setTimeout(function () {
              goNextQuestion();
            }, 280);
          }
        };
        opts.appendChild(b);
      });

      $("#back").onclick = function () {
        state.reaction = "";
        if (state.qIndex <= 0) {
          state.phase = "branchIntro";
          save();
          render();
          return;
        }
        state.qIndex -= 1;
        save();
        render();
      };
      if (multi) {
        $("#next").onclick = function () {
          if (!selectedOk) return;
          state.reaction = "";
          goNextQuestion();
        };
      }
      return;
    }

    if (state.phase === "result") {
      var result = state.result || computeResult();
      var zonesHtml = "";
      if (result.showScores) {
        zonesHtml =
          '<p class="kicker" style="margin-top:8px">Зоны внимания</p>' +
          renderScoreBars(result.resultBlocks || []);
      }

      panel.innerHTML =
        '<p class="kicker">Для вас</p>' +
        '<div class="result-card">' +
          "<h2>" + result.headline + "</h2>" +
          '<p class="body">' + result.body + "</p>" +
          (result.softLine ? '<p class="soft">' + result.softLine + "</p>" : "") +
          zonesHtml +
          (result.priceHint ? '<p class="price">' + result.priceHint + "</p>" : "") +
        "</div>" +
        '<div class="actions">' +
          '<button type="button" class="btn btn-ghost" id="back">Назад</button>' +
          (result.ctaHref
            ? '<a class="btn btn-ghost" href="' + result.ctaHref + '">' + result.cta + "</a>"
            : "") +
          '<button type="button" class="btn btn-primary" id="toForm">' +
            (result.ctaHref ? (result.secondaryCta || "Оставить контакт") : result.cta) +
          "</button>" +
        "</div>";

      $("#back").onclick = function () {
        state.phase = "question";
        state.qIndex = Math.max(0, questions().length - 1);
        save();
        render();
      };
      $("#toForm").onclick = function () {
        state.phase = "form";
        save();
        render();
      };
      return;
    }

    if (state.phase === "form") {
      var result = state.result || computeResult();
      panel.innerHTML =
        '<p class="kicker">' + roleLabel(state.role) + "</p>" +
        "<h1>" + DATA.form.title + "</h1>" +
        '<p class="lead">' + DATA.form.lead + "</p>" +
        '<form class="form" id="leadForm" novalidate>' +
          '<div class="field"><label for="name">Имя</label><input id="name" autocomplete="name" required placeholder="Как к вам обращаться" /></div>' +
          '<div class="field"><label for="phone">Телефон *</label><input id="phone" type="tel" inputmode="tel" autocomplete="tel" required placeholder="+7 9XX XXX-XX-XX" /></div>' +
          '<div class="field"><label for="telegram">Telegram *</label><input id="telegram" autocomplete="username" required placeholder="@username или ID" /></div>' +
          '<div class="field"><label for="email">Email <span style="font-weight:600;text-transform:none;letter-spacing:0">(необязательно)</span></label><input id="email" type="email" autocomplete="email" placeholder="name@company.ru" /></div>' +
          '<div class="field"><label>Как с вами связаться?</label><div class="channel" id="channels"></div></div>' +
          '<div class="field"><label for="comment">Комментарий</label><textarea id="comment" rows="2" placeholder="Если хотите уточнить"></textarea></div>' +
          '<label class="consent"><input type="checkbox" id="consent" required /><span>Согласен(на) с <a href="/sostoyanie/privacy.html" target="_blank" rel="noopener">политикой конфиденциальности</a> и обработкой персональных данных</span></label>' +
          '<label class="consent"><input type="checkbox" id="contactOk" required /><span>Напишите мне — согласен(на), чтобы со мной связались</span></label>' +
          '<p class="err" id="err" hidden></p>' +
          '<p class="ok" id="ok" hidden>Заявка отправлена. Мы напишем вам.</p>' +
          '<div class="actions">' +
            '<button type="button" class="btn btn-ghost" id="back">Назад</button>' +
            '<button type="submit" class="btn btn-primary" id="submit">Отправить</button>' +
          "</div>" +
        "</form>";

      var channels = $("#channels");
      ["telegram", "phone", "whatsapp"].forEach(function (ch) {
        var labels = { telegram: "Telegram", phone: "Телефон", whatsapp: "WhatsApp" };
        var b = document.createElement("button");
        b.type = "button";
        b.className = "choice" + (state.channel === ch ? " is-on" : "");
        b.textContent = labels[ch];
        b.onclick = function () {
          state.channel = ch;
          save();
          render();
        };
        channels.appendChild(b);
      });

      var phoneEl = $("#phone");
      phoneEl.addEventListener("focus", function () {
        if (!String(phoneEl.value || "").replace(/\D/g, "")) phoneEl.value = "+7 ";
      });
      phoneEl.addEventListener("input", function () {
        phoneEl.value = maskRuPhone(phoneEl.value);
      });

      $("#back").onclick = function () {
        state.phase = "result";
        save();
        render();
      };

      $("#leadForm").addEventListener("submit", function (e) {
        e.preventDefault();
        var err = $("#err");
        var ok = $("#ok");
        err.hidden = true;
        ok.hidden = true;

        var dig = digitsPhone(phoneEl.value);
        if (dig.length !== 11) {
          err.textContent = "Укажите телефон в формате +7…";
          err.hidden = false;
          return;
        }
        var tg = String($("#telegram").value || "").trim();
        if (tg.charAt(0) === "@") tg = tg.slice(1);
        tg = tg.replace(/^https?:\/\/(t\.me|telegram\.me)\//i, "").replace(/\/$/, "").trim();
        if (!(/^\d{5,15}$/.test(tg) || /^[A-Za-z0-9_]{5,32}$/.test(tg))) {
          err.textContent = "Укажите Telegram: @username или числовой ID.";
          err.hidden = false;
          return;
        }
        if (!$("#consent").checked) {
          err.textContent = "Нужно согласие с политикой конфиденциальности.";
          err.hidden = false;
          return;
        }
        if (!$("#contactOk").checked) {
          err.textContent = "Отметьте «Напишите мне», чтобы мы могли связаться.";
          err.hidden = false;
          return;
        }

        var form = {
          name: $("#name").value.trim(),
          phone: "+7 " + dig.slice(1, 4) + " " + dig.slice(4, 7) + "-" + dig.slice(7, 9) + "-" + dig.slice(9),
          telegram: /^\d+$/.test(tg) ? tg : ("@" + tg),
          email: $("#email").value.trim(),
          comment: $("#comment").value.trim()
        };

        var payload = buildLeadPayload(form);
        // сохраняем полный диагностический пакет локально
        try {
          localStorage.setItem(STORAGE_KEY + "_last_lead", JSON.stringify(payload._diagnostic));
        } catch (ex) {}

        var apiBody = Object.assign({}, payload);
        delete apiBody._diagnostic;

        var btn = $("#submit");
        btn.disabled = true;
        var base = (window.PLATFORM_API_URL || "").replace(/\/$/, "");

        function done() {
          ok.hidden = false;
          btn.disabled = false;
          $("#leadForm").reset();
        }

        if (!base) {
          err.textContent = "Не удалось отправить на сервер. Напишите @yank0vski в Telegram.";
          err.hidden = false;
          btn.disabled = false;
          console.warn("[put] PLATFORM_API_URL не задан", payload);
          return;
        }

        fetch(base + "/api/leads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(apiBody)
        }).then(function (r) {
          if (!r.ok) {
            return r.text().then(function (t) { throw new Error(t || ("HTTP " + r.status)); });
          }
          return r.json();
        }).then(function (data) {
          console.log("[put] lead saved", data);
          done();
        }).catch(function (ex) {
          console.warn("[put] lead failed", ex);
          err.textContent = "Не удалось отправить. Напишите @yank0vski в Telegram.";
          err.hidden = false;
          btn.disabled = false;
        });
      });
    }
  }

  function goNextQuestion() {
    var qs = questions();
    if (state.qIndex >= qs.length - 1) {
      computeResult();
      state.phase = "result";
      save();
      render();
      return;
    }
    state.qIndex += 1;
    save();
    render();
  }

  // boot
  load();
  // если восстановились на question без роли — сброс
  if ((state.phase === "question" || state.phase === "branchIntro" || state.phase === "result" || state.phase === "form") && !state.role) {
    state.phase = "intro";
  }
  if (state.phase === "result" || state.phase === "form") {
    computeResult();
  }
  render();
})();
