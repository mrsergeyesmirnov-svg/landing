/**
 * Scoring и рекомендации для /put/.
 * Чистая функция: answers + role → результат. Удобно позже заменить/дополнить AI.
 */
window.PUT_SCORING = (function () {
  var BLOCKS = ["PEOPLE", "FINANCE", "GUEST", "PROCESS"];

  function emptyScores() {
    return { PEOPLE: 0, FINANCE: 0, GUEST: 0, PROCESS: 0 };
  }

  function levelFromScore(score, maxHint) {
    var t = Math.max(1, maxHint || 6);
    var ratio = score / t;
    if (ratio >= 0.55) return "red";
    if (ratio >= 0.28) return "yellow";
    return "green";
  }

  function levelEmoji(level) {
    if (level === "red") return "🔴";
    if (level === "yellow") return "🟡";
    return "🟢";
  }

  /**
   * @param {string} role
   * @param {Object} answersMap  { questionId: string|string[] }
   * @param {Object} data        PUT_DATA
   */
  function scoreAnswers(role, answersMap, data) {
    var branch = data.branches[role];
    var scores = emptyScores();
    var selectedProblems = [];
    var meta = {};
    var answerLog = [];

    if (!branch) {
      return {
        scores: scores,
        selectedProblems: [],
        meta: {},
        answerLog: [],
        resultBlocks: [],
        primaryProblem: null,
        secondaryProblem: null,
        totalAttention: 0,
        recommendedProduct: "contact",
        headline: "Есть зона, которую стоит проверить",
        body: "По вашим ответам мы подготовим следующий шаг.",
        cta: "Оставить контакт",
        ctaHref: null,
        priceHint: null
      };
    }

    branch.questions.forEach(function (q) {
      var raw = answersMap[q.id];
      if (raw == null || raw === "" || (Array.isArray(raw) && !raw.length)) return;
      var ids = Array.isArray(raw) ? raw : [raw];
      ids.forEach(function (oid) {
        var opt = q.options.filter(function (o) { return o.id === oid; })[0];
        if (!opt) return;
        answerLog.push({ questionId: q.id, question: q.text, optionId: opt.id, label: opt.label });
        if (opt.scores) {
          BLOCKS.forEach(function (b) {
            if (opt.scores[b]) scores[b] += opt.scores[b];
          });
        }
        if (opt.problem && selectedProblems.indexOf(opt.problem) < 0) {
          selectedProblems.push(opt.problem);
        }
        if (opt.meta) {
          Object.keys(opt.meta).forEach(function (k) { meta[k] = opt.meta[k]; });
        }
      });
    });

    var ranked = BLOCKS.map(function (b) {
      return { block: b, score: scores[b], label: data.blockLabels[b] };
    }).sort(function (a, b) { return b.score - a.score; });

    var maxScore = ranked[0] ? ranked[0].score : 0;
    var resultBlocks = ranked.map(function (r) {
      return {
        block: r.block,
        label: r.label,
        score: r.score,
        level: levelFromScore(r.score, Math.max(maxScore, 4)),
        emoji: levelEmoji(levelFromScore(r.score, Math.max(maxScore, 4)))
      };
    });

    // Для владельца/сотрудника в UI показываем топ-1..3 «горячих» или все 4 с уровнями
    var attentionBlocks = resultBlocks.filter(function (b) { return b.level !== "green" || b.score > 0; });
    if (!attentionBlocks.length) attentionBlocks = resultBlocks.slice(0, 3);

    var primary = ranked[0] && ranked[0].score > 0 ? ranked[0].block : null;
    var secondary = ranked[1] && ranked[1].score > 0 ? ranked[1].block : null;
    var totalAttention = BLOCKS.reduce(function (s, b) { return s + scores[b]; }, 0);

    var rec = recommend(role, scores, selectedProblems, meta, totalAttention);

    return {
      scores: scores,
      people_score: scores.PEOPLE,
      finance_score: scores.FINANCE,
      guest_score: scores.GUEST,
      process_score: scores.PROCESS,
      selectedProblems: selectedProblems,
      meta: meta,
      answerLog: answerLog,
      resultBlocks: resultBlocks,
      attentionBlocks: attentionBlocks.slice(0, 3),
      primaryProblem: primary,
      secondaryProblem: secondary,
      totalAttention: totalAttention,
      recommendedProduct: rec.product,
      headline: rec.headline,
      body: rec.body,
      cta: rec.cta,
      ctaHref: rec.ctaHref,
      priceHint: rec.priceHint,
      secondaryCta: rec.secondaryCta || null,
      secondaryHref: rec.secondaryHref || null
    };
  }

  function recommend(role, scores, problems, meta, total) {
    var high = total >= 10;
    var moderate = total >= 5 && total < 10;
    var edu = problems.indexOf("education") >= 0 || meta.wantsGrowth;

    if (role === "chef") {
      if (edu || meta.wantsGrowth) {
        return {
          product: "tour",
          headline: "Вам может подойти Тур / Академия счастья",
          body: "Мы создаём среду, в которой руководители ресторанов развивают управление людьми, осознанность, коучинг и HR-компетенции.",
          cta: "Узнать о ближайшем туре",
          ctaHref: "/tury/",
          secondaryCta: "Получить информацию",
          secondaryHref: null,
          priceHint: "Формат и стоимость — по ближайшему потоку"
        };
      }
      return {
        product: "contact",
        headline: "По вашим ответам есть зона, которую стоит обсудить",
        body: "Похоже, здесь есть потенциал для улучшения — в команде кухни, процессах или развитии. Оставьте контакт — подскажем следующий шаг.",
        cta: "Получить информацию",
        ctaHref: null,
        priceHint: null
      };
    }

    if (role === "employee") {
      return {
        product: "feedback",
        headline: "Мы видим несколько зон, которые могут влиять на ваше состояние на работе",
        body: "Это не диагноз — ориентир по ответам. Если хотите, расскажите подробнее: подскажем, куда можно направить запрос.",
        cta: "Рассказать о ситуации",
        ctaHref: null,
        priceHint: null
      };
    }

    if (role === "ops") {
      var multi = (meta.locations || 1) >= 2;
      var late = scores.PROCESS >= 5;
      if (multi || meta.wantsPulse || late) {
        return {
          product: "pulse",
          headline: "Операционная зона внимания",
          body: late
            ? "Главный сигнал — вы часто узнаёте о проблемах уже после того, как они стали заметны. «Состояние смены» помогает замечать изменения раньше и держать точки в одном контуре."
            : "Похоже, есть потенциал собрать состояние точек в одном месте и снизить ручной сбор информации.",
          cta: "Посмотреть, как это работает",
          ctaHref: "/sostoyanie/",
          priceHint: "Подписка от 2 990 ₽/мес · пилот 14 дней"
        };
      }
      return {
        product: "consultation",
        headline: "Операционная зона внимания",
        body: "По вашим ответам больше всего внимания требуют отдельные блоки ниже. Можно начать с короткого разбора контура.",
        cta: "Посмотреть, как это работает",
        ctaHref: "/sostoyanie/",
        priceHint: "Ориентир — после короткого разговора"
      };
    }

    // owner
    if (high) {
      return {
        product: "diagnostics",
        headline: "Ваш ресторан требует внимания",
        body: "Мы можем провести диагностику состояния ресторана, найти основные точки просадки и предложить план изменений.",
        cta: "Получить разбор",
        ctaHref: "/diagnostika/",
        priceHint: "Аудит от 20 000 ₽"
      };
    }
    if (moderate) {
      return {
        product: "pulse",
        headline: "Есть зона, которую стоит проверить",
        body: "По вашим ответам картина умеренная, но есть потенциал для улучшения. Часто помогает контур «Состояние смены» или короткая консультация.",
        cta: "Получить разбор",
        ctaHref: "/sostoyanie/",
        priceHint: "Подписка от 2 990 ₽/мес или консультация"
      };
    }
    return {
      product: "consultation",
      headline: "Похоже, здесь есть потенциал для улучшения",
      body: "Даже при спокойной картине полезно зафиксировать точку отсчёта. Можем предложить лёгкий следующий шаг.",
      cta: "Получить разбор",
      ctaHref: "/diagnostika/",
      priceHint: "Ориентир — после короткого разговора"
    };
  }

  return {
    BLOCKS: BLOCKS,
    scoreAnswers: scoreAnswers,
    levelEmoji: levelEmoji
  };
})();
