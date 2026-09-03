/**
 * /put/ — опрос «А вы счастливы?» Академии счастья.
 * Меняйте тексты здесь; scoring и UI подхватывают структуру.
 *
 * scores — внутренняя оценка (PEOPLE | FINANCE | GUEST | PROCESS).
 * Пользователю баллы показываем только owner / ops.
 */
window.PUT_DATA = {
  brand: "Академия счастья",
  intro: {
    title: "Академия счастья",
    missionLabel: "Миссия",
    subtitle: "Мы создаём среду, где счастливы люди, растёт бизнес и возвращаются гости.",
    lead: "Короткий опрос — чтобы честно посмотреть на себя, команду и проект.",
    cta: "А вы счастливы?"
  },
  roleStep: {
    title: "Кто вы в ресторане?",
    lead: "От роли зависят вопросы — так точнее."
  },
  roles: [
    { id: "owner", label: "Владелец" },
    { id: "ops", label: "Операционный директор" },
    { id: "manager", label: "Управляющий" },
    { id: "hr", label: "HR" },
    { id: "chef", label: "Шеф" },
    { id: "team", label: "Команда" },
    { id: "guest", label: "Просто смотрю" }
  ],
  reactions: [],
  blockLabels: {
    PEOPLE: "Люди",
    PROCESS: "Процессы",
    GUEST: "Гость",
    FINANCE: "Финансы"
  },
  form: {
    title: "Хотите следующий шаг?",
    lead: "Оставьте контакты — напишем с учётом того, что вы рассказали."
  },
  branches: {
    owner: {
      introTitle: "Посмотрим, что происходит в вашем проекте",
      showScores: true,
      questions: [
        {
          id: "owner_away",
          type: "single",
          text: "Если завтра вы на неделю уедете из бизнеса — что произойдёт?",
          options: [
            { id: "fine", label: "Ничего особенного — всё работает и без меня", scores: { PEOPLE: 0, PROCESS: 0 } },
            { id: "calls", label: "Начнут звонить по разным вопросам", scores: { PEOPLE: 2, PROCESS: 2 } },
            { id: "fix", label: "Придётся разбирать несколько ситуаций", scores: { PEOPLE: 3, PROCESS: 3 } },
            { id: "nope", label: "Даже не хочу это проверять", scores: { PEOPLE: 4, PROCESS: 4, FINANCE: 2 } }
          ]
        },
        {
          id: "owner_walkin",
          type: "single",
          text: "Когда вы в последний раз заходили в ресторан и понимали: всё действительно работает без вас?",
          options: [
            { id: "recent", label: "Недавно — и было спокойно", scores: { PEOPLE: 0, PROCESS: 0 } },
            { id: "sometimes", label: "Бывает, но редко", scores: { PEOPLE: 2, PROCESS: 1 } },
            { id: "long", label: "Давно", scores: { PEOPLE: 3, PROCESS: 3 } },
            { id: "never", label: "Такого не припомню", scores: { PEOPLE: 4, PROCESS: 4 } }
          ]
        },
        {
          id: "owner_want_see",
          type: "multi",
          text: "Когда вы заходите без предупреждения, что вам важнее всего увидеть?",
          options: [
            { id: "calm", label: "Спокойную команду", scores: { PEOPLE: 1 }, goal: "people" },
            { id: "full", label: "Полный зал", scores: { GUEST: 1, FINANCE: 1 }, goal: "guest" },
            { id: "manager", label: "Сильного управляющего, который всё держит", scores: { PEOPLE: 1, PROCESS: 1 }, goal: "people" },
            { id: "works", label: "Чтобы всё просто работало", scores: { PROCESS: 1 }, goal: "process" },
            { id: "want_work", label: "Чтобы люди действительно хотели здесь работать", scores: { PEOPLE: 1 }, goal: "people" }
          ]
        },
        {
          id: "owner_signal",
          type: "single",
          text: "Откуда вы обычно узнаёте, что в проекте что-то не так?",
          options: [
            { id: "feel", label: "Чувствую сам, когда захожу", scores: { PEOPLE: 1, PROCESS: 1 } },
            { id: "numbers", label: "По цифрам", scores: { FINANCE: 2 } },
            { id: "manager", label: "Когда говорит управляющий", scores: { PROCESS: 2, PEOPLE: 1 } },
            { id: "guest", label: "Когда уже пишет гость", scores: { GUEST: 3, PROCESS: 2 } },
            { id: "late", label: "Когда уже поздно что-то менять на ходу", scores: { PROCESS: 4, GUEST: 2, PEOPLE: 2 } }
          ]
        },
        {
          id: "owner_halfyear",
          type: "single",
          text: "Если через полгода всё останется как сейчас — вы будете…",
          options: [
            { id: "ok", label: "Спокойны: так и задумано", scores: {} },
            { id: "uneasy", label: "С лёгким беспокойством", scores: { PEOPLE: 1, PROCESS: 1 } },
            { id: "worried", label: "Уже недовольны", scores: { PEOPLE: 2, FINANCE: 2, PROCESS: 2 } },
            { id: "no", label: "Так оставлять нельзя", scores: { PEOPLE: 3, FINANCE: 3, GUEST: 2, PROCESS: 3 } }
          ]
        }
      ]
    },
    ops: {
      introTitle: "Посмотрим на вашу операционную картину",
      showScores: true,
      questions: [
        {
          id: "ops_phone",
          type: "single",
          text: "Сколько точек вы сегодня можете открыть на телефоне и сразу понять: где всё в порядке, а где нет?",
          options: [
            { id: "all", label: "Все", scores: { PROCESS: 0 }, meta: { locations: 2 } },
            { id: "most", label: "Большинство", scores: { PROCESS: 1 }, meta: { locations: 2 } },
            { id: "numbers", label: "Только по цифрам", scores: { PROCESS: 2, FINANCE: 1 }, meta: { locations: 2 } },
            { id: "late", label: "Узнаю, когда проблема уже случилась", scores: { PROCESS: 4, PEOPLE: 1 }, meta: { locations: 2 } }
          ]
        },
        {
          id: "ops_tonight",
          type: "single",
          text: "Если сегодня вечером в одной из точек начнётся сбой — когда вы об этом узнаете?",
          options: [
            { id: "today", label: "Сегодня", scores: { PROCESS: 0 } },
            { id: "tomorrow", label: "Завтра", scores: { PROCESS: 2 } },
            { id: "manager", label: "Когда сообщит управляющий", scores: { PROCESS: 3, PEOPLE: 1 } },
            { id: "numbers", label: "Когда появятся цифры", scores: { FINANCE: 2, PROCESS: 3 } },
            { id: "guest", label: "Когда пожалуется гость", scores: { GUEST: 4, PROCESS: 4 } }
          ]
        },
        {
          id: "ops_energy",
          type: "single",
          text: "На что уходит больше всего вашей энергии на этой неделе?",
          options: [
            { id: "people", label: "Люди и управляющие", scores: { PEOPLE: 3 }, problem: "people" },
            { id: "fire", label: "Срочные проблемы по точкам", scores: { PROCESS: 3 }, problem: "process" },
            { id: "numbers", label: "Сбор и сверка цифр", scores: { FINANCE: 2, PROCESS: 2 }, problem: "finance" },
            { id: "guest", label: "Разбор гостевых обращений", scores: { GUEST: 3 }, problem: "guest" },
            { id: "all", label: "Всё сразу — и это выматывает", scores: { PEOPLE: 2, PROCESS: 2, FINANCE: 1, GUEST: 1 }, problem: "process" }
          ]
        },
        {
          id: "ops_one_place",
          type: "single",
          text: "Нужна ли вам сводка по всем точкам в одном месте — без поиска по чатам?",
          options: [
            { id: "yes", label: "Да", scores: { PROCESS: 1 }, meta: { wantsPulse: true } },
            { id: "need", label: "Да, это приоритет", scores: { PROCESS: 2 }, meta: { wantsPulse: true } },
            { id: "have", label: "У нас уже есть похожий инструмент", scores: {} },
            { id: "later", label: "Пока не актуально", scores: {} }
          ]
        }
      ]
    },
    hr: {
      introTitle: "Посмотрим, как вы видите людей в проекте",
      showScores: false,
      questions: [
        {
          id: "hr_signal",
          type: "single",
          text: "Откуда вы обычно узнаёте, что в команде что-то не так?",
          options: [
            { id: "pulse", label: "Из регулярных опросов или замеров", scores: { PEOPLE: 0, PROCESS: 0 } },
            { id: "managers", label: "От управляющих", scores: { PEOPLE: 1, PROCESS: 1 } },
            { id: "exit", label: "Когда человек уже уходит", scores: { PEOPLE: 4, PROCESS: 2 } },
            { id: "late", label: "Когда конфликт уже разгорелся", scores: { PEOPLE: 4, PROCESS: 3 } },
            { id: "feel", label: "Скорее по ощущению, без ясной картины", scores: { PEOPLE: 3, PROCESS: 2 } }
          ]
        },
        {
          id: "hr_turnover",
          type: "single",
          text: "Как сейчас с удержанием людей?",
          options: [
            { id: "stable", label: "В целом стабильно", scores: { PEOPLE: 0 } },
            { id: "spot", label: "Есть точечные сложности", scores: { PEOPLE: 2 } },
            { id: "leak", label: "Люди уходят чаще, чем хотелось бы", scores: { PEOPLE: 3, PROCESS: 1 } },
            { id: "hard", label: "Удержание — главная боль", scores: { PEOPLE: 4, PROCESS: 2 } }
          ]
        },
        {
          id: "hr_early",
          type: "single",
          text: "Успеваете ли вы видеть напряжение в команде до того, как оно станет проблемой?",
          options: [
            { id: "yes", label: "Да, чаще успеваем", scores: { PEOPLE: 0, PROCESS: 0 } },
            { id: "sometimes", label: "Иногда", scores: { PEOPLE: 2, PROCESS: 1 } },
            { id: "rare", label: "Редко", scores: { PEOPLE: 3, PROCESS: 2 } },
            { id: "no", label: "Обычно узнаём уже поздно", scores: { PEOPLE: 4, PROCESS: 3 } }
          ]
        },
        {
          id: "hr_need",
          type: "single",
          text: "Чего сейчас не хватает, чтобы работать с людьми увереннее?",
          options: [
            { id: "picture", label: "Ясной картины состояния команды", scores: { PROCESS: 3 }, problem: "process", meta: { wantsPulse: true } },
            { id: "managers", label: "Опоры со стороны управляющих", scores: { PEOPLE: 3 }, problem: "people" },
            { id: "tools", label: "Простого инструмента без тяжёлых отчётов", scores: { PROCESS: 2 }, problem: "process", meta: { wantsPulse: true } },
            { id: "growth", label: "Среды развития для руководителей", scores: { PEOPLE: 1 }, problem: "education", meta: { wantsGrowth: true } },
            { id: "breath", label: "Времени не только на срочное", scores: { PEOPLE: 2 }, problem: "people" }
          ]
        }
      ]
    },
    manager: {
      introTitle: "Посмотрим, как у вас с командой",
      showScores: false,
      questions: [
        {
          id: "mgr_holds",
          type: "single",
          text: "Бывает ощущение, что весь ресторан держится на вас?",
          options: [
            { id: "no", label: "Нет, команда справляется", scores: { PEOPLE: 0 } },
            { id: "sometimes", label: "Иногда", scores: { PEOPLE: 2 } },
            { id: "often", label: "Часто", scores: { PEOPLE: 3, PROCESS: 2 } },
            { id: "always", label: "Почти всегда", scores: { PEOPLE: 4, PROCESS: 3 } }
          ]
        },
        {
          id: "mgr_absence",
          type: "single",
          text: "Если сегодня один сильный человек из команды не выйдет — что произойдёт?",
          options: [
            { id: "nothing", label: "Ничего критичного", scores: { PEOPLE: 0, PROCESS: 0 } },
            { id: "redis", label: "Перераспределим нагрузку", scores: { PEOPLE: 1, PROCESS: 1 } },
            { id: "hard", label: "День пройдёт тяжело", scores: { PEOPLE: 3, PROCESS: 2 } },
            { id: "stop", label: "Работа заметно просядет", scores: { PEOPLE: 4, PROCESS: 3, GUEST: 2 } }
          ]
        },
        {
          id: "mgr_end",
          type: "single",
          text: "Когда заканчиваете день, какое ощущение чаще всего остаётся?",
          options: [
            { id: "beautiful", label: "Удовлетворение от результата", scores: { PEOPLE: 0, GUEST: 0 } },
            { id: "phew", label: "Облегчение: справились", scores: { PEOPLE: 1, PROCESS: 1 } },
            { id: "more", label: "Осталось недоделанное", scores: { PEOPLE: 2, PROCESS: 2 } },
            { id: "again", label: "Завтра снова начинать с нуля", scores: { PEOPLE: 3, PROCESS: 3 } }
          ]
        },
        {
          id: "mgr_need",
          type: "single",
          text: "Чего вам сейчас не хватает, чтобы команда работала устойчивее?",
          options: [
            { id: "team", label: "Людей, на которых можно опереться", scores: { PEOPLE: 3 }, problem: "people" },
            { id: "clarity", label: "Ясной картины происходящего", scores: { PROCESS: 3 }, problem: "process" },
            { id: "support", label: "Поддержки руководства", scores: { PEOPLE: 2, PROCESS: 1 }, problem: "people" },
            { id: "breath", label: "Паузы и восстановления", scores: { PEOPLE: 2 }, problem: "people" }
          ]
        }
      ]
    },
    chef: {
      introTitle: "Посмотрим, куда вы хотите расти",
      showScores: false,
      questions: [
        {
          id: "chef_day",
          type: "single",
          text: "Если бы завтра появился один свободный день только на развитие — чему бы вы его отдали?",
          options: [
            { id: "manage", label: "Управлению командой", scores: { PEOPLE: 1 }, problem: "education", meta: { wantsGrowth: true } },
            { id: "lead", label: "Лидерским навыкам", scores: { PEOPLE: 1 }, problem: "education", meta: { wantsGrowth: true } },
            { id: "people", label: "Пониманию людей", scores: { PEOPLE: 1 }, problem: "education", meta: { wantsGrowth: true } },
            { id: "kitchen", label: "Развитию кухни", scores: { PROCESS: 1, GUEST: 1 }, problem: "education" },
            { id: "teach", label: "Передаче знаний", scores: { PEOPLE: 1 }, problem: "education", meta: { wantsGrowth: true } },
            { id: "rest", label: "Восстановлению", scores: { PEOPLE: 1 }, problem: "people" }
          ]
        },
        {
          id: "chef_joy",
          type: "multi",
          text: "Когда смотрите на свою команду, что для вас важнее всего?",
          options: [
            { id: "grow", label: "Рост людей", scores: {}, goal: "people" },
            { id: "solo", label: "Самостоятельность", scores: {}, goal: "process" },
            { id: "care", label: "Ответственность и вовлечённость", scores: {}, goal: "people" },
            { id: "bond", label: "Сплочённость команды", scores: {}, goal: "people" },
            { id: "guests", label: "Возвращающиеся гости", scores: { GUEST: 1 }, goal: "guest" }
          ]
        },
        {
          id: "chef_hard",
          type: "single",
          text: "Что сильнее всего забирает силы на кухне сейчас?",
          options: [
            { id: "people", label: "Люди и атмосфера в цехе", scores: { PEOPLE: 3 }, problem: "people" },
            { id: "pace", label: "Темп и хаос в работе", scores: { PROCESS: 3 }, problem: "process" },
            { id: "quality", label: "Удержание качества каждый день", scores: { GUEST: 2, PROCESS: 2 }, problem: "process" },
            { id: "alone", label: "Ощущение, что тяну один", scores: { PEOPLE: 4 }, problem: "people" }
          ]
        },
        {
          id: "chef_space",
          type: "single",
          text: "Нужна ли вам среда для развития рядом с другими руководителями — без формальных лекций?",
          options: [
            { id: "yes", label: "Да", scores: {}, meta: { wantsGrowth: true }, problem: "education" },
            { id: "very", label: "Да, это важно", scores: {}, meta: { wantsGrowth: true }, problem: "education" },
            { id: "maybe", label: "Возможно", scores: {}, problem: "education" },
            { id: "no", label: "Пока не актуально", scores: {} }
          ]
        }
      ]
    },
    team: {
      introTitle: "Несколько вопросов о вашей работе",
      showScores: false,
      questions: [
        {
          id: "team_friends",
          type: "single",
          text: "Когда рассказываете о своей работе, что обычно говорите?",
          options: [
            { id: "love", label: "Мне нравится эта работа", scores: { PEOPLE: 0 } },
            { id: "ok", label: "В целом нормально", scores: { PEOPLE: 1 } },
            { id: "mixed", label: "По-разному", scores: { PEOPLE: 2 } },
            { id: "show", label: "Сложно объяснить словами", scores: { PEOPLE: 2 } },
            { id: "next", label: "Думаю, куда двигаться дальше", scores: { PEOPLE: 4 } }
          ]
        },
        {
          id: "team_halfyear",
          type: "multi",
          text: "Что должно измениться, чтобы через полгода вы были довольны этой работой?",
          options: [
            { id: "money", label: "Доход", scores: { FINANCE: 1 }, problem: "finance" },
            { id: "team", label: "Команда", scores: { PEOPLE: 2 }, problem: "people" },
            { id: "boss", label: "Руководитель", scores: { PEOPLE: 2 }, problem: "people" },
            { id: "grow", label: "Возможность расти", scores: { PEOPLE: 2 }, problem: "education" },
            { id: "respect", label: "Уважение", scores: { PEOPLE: 2 }, problem: "people" },
            { id: "interest", label: "Интерес к задачам", scores: { PEOPLE: 1, PROCESS: 1 }, problem: "education" },
            { id: "dunno", label: "Пока не знаю", scores: {} }
          ]
        },
        {
          id: "team_shift",
          type: "single",
          text: "После работы вы чаще уходите с ощущением…",
          options: [
            { id: "proud", label: "Гордости за результат", scores: { PEOPLE: 0, GUEST: 0 } },
            { id: "ok", label: "Спокойной отработки", scores: { PEOPLE: 1 } },
            { id: "empty", label: "Пустоты", scores: { PEOPLE: 3 } },
            { id: "heavy", label: "Тяжести", scores: { PEOPLE: 4 } }
          ]
        },
        {
          id: "team_heard",
          type: "single",
          text: "Чувствуете, что вас слышат, когда говорите о работе?",
          options: [
            { id: "yes", label: "Да", scores: { PEOPLE: 0 } },
            { id: "sometimes", label: "Иногда", scores: { PEOPLE: 2 } },
            { id: "rare", label: "Редко", scores: { PEOPLE: 3 } },
            { id: "no", label: "Почти нет", scores: { PEOPLE: 4 } }
          ]
        }
      ]
    },
    guest: {
      introTitle: "Несколько коротких вопросов",
      showScores: false,
      questions: [
        {
          id: "guest_why",
          type: "single",
          text: "Что привело вас на эту страницу?",
          options: [
            { id: "curious", label: "Просто интересно", scores: {} },
            { id: "friend", label: "Посоветовали знакомые", scores: {} },
            { id: "partner", label: "Смотрю как партнёр или инвестор", scores: {}, meta: { watcher: "partner" } },
            { id: "future", label: "Думаю о своём проекте в HoReCa", scores: {}, meta: { watcher: "future" } },
            { id: "other", label: "Другое", scores: {} }
          ]
        },
        {
          id: "guest_feel",
          type: "single",
          text: "Что для вас значит «счастливый ресторан»?",
          options: [
            { id: "people", label: "Люди хотят там работать", scores: { PEOPLE: 1 } },
            { id: "guest", label: "Гости возвращаются сами", scores: { GUEST: 1 } },
            { id: "owner", label: "Собственник спокоен", scores: { PROCESS: 1 } },
            { id: "all", label: "Всё вместе", scores: { PEOPLE: 1, GUEST: 1, PROCESS: 1 } }
          ]
        },
        {
          id: "guest_next",
          type: "single",
          text: "Хотите, чтобы мы коротко рассказали, чем занимаемся — без продажи?",
          options: [
            { id: "yes", label: "Да, интересно", scores: {}, meta: { wantsInfo: true } },
            { id: "tour", label: "Интересны туры и Академия", scores: {}, problem: "education", meta: { wantsGrowth: true } },
            { id: "product", label: "Интересен продукт для ресторанов", scores: {}, meta: { wantsPulse: true } },
            { id: "no", label: "Пока просто смотрю", scores: {} }
          ]
        }
      ]
    }
  }
};
