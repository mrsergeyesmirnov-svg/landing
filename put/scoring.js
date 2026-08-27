/**
 * Внутренний scoring + человеческий результат.
 * Баллы пользователю — только owner / ops (showScores).
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

  /** Нормализуем внутренние баллы в «человеческую» шкалу 0–100 для показа owner/ops */
  function toDisplayScore(raw, maxAmong) {
    var cap = Math.max(maxAmong, 6);
    return Math.round(Math.min(100, (raw / cap) * 100));
  }

  function scoreAnswers(role, answersMap, data) {
    var branch = data.branches[role];
    var scores = emptyScores();
    var selectedProblems = [];
    var meta = {};
    var answerLog = [];
    var goals = [];

    if (!branch) {
      return baseResult(role, scores, [], {}, [], false);
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
        if (opt.goal && goals.indexOf(opt.goal) < 0) goals.push(opt.goal);
        if (opt.meta) {
          Object.keys(opt.meta).forEach(function (k) { meta[k] = opt.meta[k]; });
        }
      });
    });

    var ranked = BLOCKS.map(function (b) {
      return { block: b, score: scores[b], label: data.blockLabels[b] };
    }).sort(function (a, b) { return b.score - a.score; });

    var maxRaw = ranked[0] ? ranked[0].score : 0;
    var resultBlocks = ranked.map(function (r) {
      var level = levelFromScore(r.score, Math.max(maxRaw, 4));
      return {
        block: r.block,
        label: r.label,
        score: r.score,
        display: toDisplayScore(r.score, Math.max(maxRaw, 1)),
        level: level,
        emoji: levelEmoji(level)
      };
    });

    var attentionBlocks = resultBlocks.filter(function (b) { return b.level !== "green" || b.score > 0; });
    if (!attentionBlocks.length) attentionBlocks = resultBlocks.slice(0, 3);

    var primary = ranked[0] && ranked[0].score > 0 ? ranked[0].block : null;
    var secondary = ranked[1] && ranked[1].score > 0 ? ranked[1].block : null;
    var totalAttention = BLOCKS.reduce(function (s, b) { return s + scores[b]; }, 0);
    var showScores = !!branch.showScores;

    var rec = recommend(role, scores, selectedProblems, meta, totalAttention, goals, answerLog);

    return {
      scores: scores,
      people_score: scores.PEOPLE,
      finance_score: scores.FINANCE,
      guest_score: scores.GUEST,
      process_score: scores.PROCESS,
      selectedProblems: selectedProblems,
      goals: goals,
      meta: meta,
      answerLog: answerLog,
      resultBlocks: resultBlocks,
      attentionBlocks: attentionBlocks.slice(0, 4),
      primaryProblem: primary,
      secondaryProblem: secondary,
      totalAttention: totalAttention,
      showScores: showScores,
      recommendedProduct: rec.product,
      headline: rec.headline,
      body: rec.body,
      softLine: rec.softLine || "",
      cta: rec.cta,
      ctaHref: rec.ctaHref,
      priceHint: rec.priceHint,
      secondaryCta: rec.secondaryCta || null,
      secondaryHref: rec.secondaryHref || null
    };
  }

  function baseResult(role, scores, problems, meta, log, showScores) {
    return {
      scores: scores,
      people_score: 0,
      finance_score: 0,
      guest_score: 0,
      process_score: 0,
      selectedProblems: problems,
      goals: [],
      meta: meta,
      answerLog: log,
      resultBlocks: [],
      attentionBlocks: [],
      primaryProblem: null,
      secondaryProblem: null,
      totalAttention: 0,
      showScores: showScores,
      recommendedProduct: "contact",
      headline: "Спасибо, что рассказали о себе",
      body: "Мы рядом — когда захотите продолжить разговор.",
      softLine: "",
      cta: "Оставить контакт",
      ctaHref: null,
      priceHint: null
    };
  }

  function recommend(role, scores, problems, meta, total, goals, answerLog) {
    var high = total >= 9;
    var moderate = total >= 4 && total < 9;
    var edu = problems.indexOf("education") >= 0 || meta.wantsGrowth;

    if (role === "guest") {
      if (meta.wantsGrowth || problems.indexOf("education") >= 0) {
        return {
          product: "tour",
          headline: "Похоже, вам близка среда роста",
          body: "Туры и Академия — место, где можно посмотреть изнутри, как мы работаем с людьми и смыслом в ресторанах.",
          softLine: "Без давления. Просто если откликается.",
          cta: "Посмотреть туры",
          ctaHref: "/tury/",
          secondaryCta: "Написать нам",
          priceHint: null
        };
      }
      if (meta.wantsPulse || meta.watcher === "partner" || meta.watcher === "future") {
        return {
          product: "contact",
          headline: "Рады знакомству",
          body: "Если захотите понять Академию или продукт для ресторанов глубже — оставьте контакт. Расскажем спокойно.",
          softLine: "Мы знаем, как с этим работать — когда будет время.",
          cta: "Оставить контакт",
          ctaHref: null,
          priceHint: null
        };
      }
      return {
        product: "contact",
        headline: "Спасибо, что заглянули",
        body: "Можете просто побродить по сайту — или оставить контакт, если захотите поговорить.",
        softLine: "",
        cta: "Оставить контакт",
        ctaHref: "/",
        secondaryCta: "На главную",
        secondaryHref: "/",
        priceHint: null
      };
    }

    if (role === "chef") {
      if (edu || meta.wantsGrowth) {
        return {
          product: "tour",
          headline: "Похоже, вам важно не только готовить хорошо — вам важно расти",
          body: "Мы создаём среду, где шефы и руководители развивают управление людьми, осознанность и умение передавать знания — рядом с другими.",
          softLine: "Мы знаем, как с этим работать.",
          cta: "Посмотреть, что можно изменить",
          ctaHref: "/tury/",
          secondaryCta: "Узнать о ближайшем туре",
          secondaryHref: "/tury/",
          priceHint: "Формат — по ближайшему потоку"
        };
      }
      return {
        product: "contact",
        headline: "По вашим ответам чувствуется забота о команде",
        body: "Это уже многое. Если захотите — подскажем мягкий следующий шаг: разговор, тур или просто выдохнуть.",
        softLine: "Мы знаем, как с этим работать.",
        cta: "Посмотреть, что можно изменить",
        ctaHref: null,
        priceHint: null
      };
    }

    if (role === "team") {
      var growth = problems.indexOf("education") >= 0 || goals.indexOf("people") >= 0;
      if (scores.PEOPLE >= 6 || answerLog.some(function (a) { return a.optionId === "next"; })) {
        return {
          product: "feedback",
          headline: "Похоже, вам важно не просто работать хорошо. Вам важно чувствовать, что вы растёте",
          body: "Или хотя бы понимать, куда можно двигаться. Мы работаем с проектами, где это слышат — и где состояние команды не прячут.",
          softLine: "Мы знаем, как с этим работать.",
          cta: "Посмотреть, что можно изменить",
          ctaHref: null,
          priceHint: null
        };
      }
      if (growth) {
        return {
          product: "feedback",
          headline: "Вам важно расти — и это уже ясный сигнал",
          body: "Оставьте контакт, если хотите рассказать ситуацию своими словами. Без оценок «хороший/плохой руководитель».",
          softLine: "Мы знаем, как с этим работать.",
          cta: "Посмотреть, что можно изменить",
          ctaHref: null,
          priceHint: null
        };
      }
      return {
        product: "feedback",
        headline: "Спасибо, что честно посмотрели на свою работу",
        body: "Даже спокойные ответы — это уже разговор с собой. Если захотите продолжить — мы рядом.",
        softLine: "",
        cta: "Оставить контакт",
        ctaHref: null,
        priceHint: null
      };
    }

    if (role === "manager") {
      if (scores.PEOPLE >= 6 || scores.PROCESS >= 5) {
        return {
          product: "pulse",
          headline: "Похоже, смена часто держится на вас — и это тяжело носить в одиночку",
          body: "Мы помогаем проектам собирать состояние команды и смены так, чтобы управляющий видел раньше и опирался не только на себя.",
          softLine: "Мы знаем, как с этим работать.",
          cta: "Посмотреть, что можно изменить",
          ctaHref: "/sostoyanie/",
          priceHint: null
        };
      }
      return {
        product: "consultation",
        headline: "У вас есть опора — и всё же есть куда сделать легче",
        body: "По ответам видно внимательность к смене. Если захотите — разберём, что можно усилить без героизма каждый вечер.",
        softLine: "Мы знаем, как с этим работать.",
        cta: "Посмотреть, что можно изменить",
        ctaHref: "/sostoyanie/",
        priceHint: null
      };
    }

    if (role === "ops") {
      var late = scores.PROCESS >= 5 || scores.GUEST >= 3;
      if (late || meta.wantsPulse) {
        return {
          product: "pulse",
          headline: "По вашим ответам есть зоны, на которые стоит обратить внимание",
          body: late
            ? "Часто о сбое узнают слишком поздно — когда уже цифры или гость. Спокойный контур состояния точек помогает увидеть раньше."
            : "Есть запрос видеть картину яснее. Можно начать с короткого разговора о контуре.",
          softLine: "Без давления — просто следующий шаг.",
          cta: "Посмотреть, как это устроено",
          ctaHref: "/sostoyanie/",
          priceHint: "Подписка от 2 990 ₽/мес · пилот 14 дней"
        };
      }
      return {
        product: "consultation",
        headline: "По вашим ответам картина в целом спокойная",
        body: "И всё же есть смысл зафиксировать, где вы узнаёте о проблемах раньше всего. Можем коротко пройтись вместе.",
        softLine: "",
        cta: "Оставить контакт",
        ctaHref: "/sostoyanie/",
        priceHint: null
      };
    }

    // owner
    if (high) {
      return {
        product: "diagnostics",
        headline: "По вашим ответам есть несколько зон, на которые стоит обратить внимание",
        body: "Не «сломано» — скорее места, где проект пока не держится без вас. Можно разобрать это спокойно и предложить план.",
        softLine: "Мы знаем, как с этим работать.",
        cta: "Получить разбор",
        ctaHref: "/diagnostika/",
        priceHint: "Аудит от 20 000 ₽"
      };
    }
    if (moderate) {
      return {
        product: "pulse",
        headline: "Есть зона, которую стоит проверить",
        body: "Похоже, здесь есть потенциал для улучшения — в людях, процессах или ясности картины. Часто помогает мягкий контур или короткий разговор.",
        softLine: "Мы знаем, как с этим работать.",
        cta: "Посмотреть, что можно изменить",
        ctaHref: "/sostoyanie/",
        priceHint: "От 2 990 ₽/мес или консультация"
      };
    }
    return {
      product: "consultation",
      headline: "Похоже, вам важно, чтобы проект жил и без постоянного контроля",
      body: "Это сильная точка. Можно просто зафиксировать, что уже работает — и где хочется ещё спокойствия.",
      softLine: "",
      cta: "Оставить контакт",
      ctaHref: "/diagnostika/",
      priceHint: null
    };
  }

  return {
    BLOCKS: BLOCKS,
    scoreAnswers: scoreAnswers,
    levelEmoji: levelEmoji
  };
})();
