/**
 * Диагностика /put/ — вопросы и варианты ответов.
 * Меняйте тексты здесь: логика экранов и scoring подхватывают структуру.
 *
 * Типы вопросов:
 *  - single: один ответ
 *  - multi: несколько ответов (кнопка «Далее»)
 *
 * scores: баллы в блоки PEOPLE | FINANCE | GUEST | PROCESS
 * (чем выше — тем сильнее «зона внимания»)
 */
window.PUT_DATA = {
  brand: "Академия счастья",
  intro: {
    title: "Академия счастья",
    subtitle: "Проверьте состояние своего ресторана и узнайте, что мешает ему расти",
    cta: "Начать диагностику"
  },
  roleStep: {
    title: "Кто вы?",
    lead: "От роли зависят вопросы и рекомендация."
  },
  roles: [
    { id: "owner", label: "Владелец бизнеса" },
    { id: "ops", label: "Операционный директор" },
    { id: "chef", label: "Шеф-повар" },
    { id: "employee", label: "Сотрудник ресторана" }
  ],
  reactions: ["Поняли.", "Это важно.", "Ещё один вопрос.", "Хорошо.", "Записали."],
  branches: {
    owner: {
      introTitle: "Как поживает ваш бизнес?",
      questions: [
        {
          id: "owner_state",
          type: "single",
          text: "Как вы оцениваете текущее состояние бизнеса?",
          options: [
            { id: "great", label: "Всё отлично", scores: { PEOPLE: 0, FINANCE: 0, GUEST: 0, PROCESS: 0 } },
            { id: "stable", label: "Стабильно, но есть проблемы", scores: { PEOPLE: 1, FINANCE: 1, GUEST: 1, PROCESS: 1 } },
            { id: "uneasy", label: "Чувствую, что что-то не так", scores: { PEOPLE: 2, FINANCE: 2, GUEST: 1, PROCESS: 2 } },
            { id: "serious", label: "Есть серьёзные проблемы", scores: { PEOPLE: 3, FINANCE: 3, GUEST: 2, PROCESS: 3 } }
          ]
        },
        {
          id: "owner_team_clarity",
          type: "single",
          text: "Насколько вы понимаете, что происходит с вашей командой?",
          options: [
            { id: "full", label: "Полностью понимаю", scores: { PEOPLE: 0, PROCESS: 0 } },
            { id: "mostly", label: "В целом понимаю", scores: { PEOPLE: 1, PROCESS: 1 } },
            { id: "effects", label: "Вижу только последствия", scores: { PEOPLE: 3, PROCESS: 2 } },
            { id: "blind", label: "Почти не понимаю", scores: { PEOPLE: 4, PROCESS: 3 } }
          ]
        },
        {
          id: "owner_turnover",
          type: "single",
          text: "Как часто сотрудники увольняются?",
          options: [
            { id: "never", label: "Почти никогда", scores: { PEOPLE: 0 } },
            { id: "sometimes", label: "Иногда", scores: { PEOPLE: 1 } },
            { id: "regular", label: "Регулярно", scores: { PEOPLE: 3 } },
            { id: "often", label: "Очень часто", scores: { PEOPLE: 4 } }
          ]
        },
        {
          id: "owner_worry",
          type: "multi",
          text: "Что сейчас беспокоит больше всего?",
          options: [
            { id: "people", label: "Люди и команда", scores: { PEOPLE: 3 }, problem: "people" },
            { id: "managers", label: "Управляющие", scores: { PEOPLE: 2, PROCESS: 2 }, problem: "people" },
            { id: "service", label: "Сервис и гости", scores: { GUEST: 3 }, problem: "guest" },
            { id: "finance", label: "Финансы", scores: { FINANCE: 3 }, problem: "finance" },
            { id: "process", label: "Процессы", scores: { PROCESS: 3 }, problem: "process" },
            { id: "turnover", label: "Текучка", scores: { PEOPLE: 3 }, problem: "people" },
            { id: "other", label: "Другое", scores: { PROCESS: 1 }, problem: "process" }
          ]
        },
        {
          id: "owner_if_nothing",
          type: "single",
          text: "Если завтра ничего не менять, что произойдёт?",
          options: [
            { id: "nothing", label: "Ничего", scores: {} },
            { id: "accumulate", label: "Проблемы будут накапливаться", scores: { PROCESS: 2, PEOPLE: 1 } },
            { id: "quality", label: "Упадёт качество", scores: { GUEST: 3, PROCESS: 2 } },
            { id: "money", label: "Потеряем деньги", scores: { FINANCE: 3 } },
            { id: "crisis", label: "Могут возникнуть серьёзные проблемы", scores: { PEOPLE: 2, FINANCE: 2, GUEST: 2, PROCESS: 2 } }
          ]
        },
        {
          id: "owner_ideal",
          type: "multi",
          text: "Что для вас было бы идеальным результатом?",
          options: [
            { id: "happy_team", label: "Счастливая стабильная команда", scores: { PEOPLE: 1 }, goal: "people" },
            { id: "revenue", label: "Рост выручки", scores: { FINANCE: 1 }, goal: "finance" },
            { id: "less_turnover", label: "Меньше текучки", scores: { PEOPLE: 1 }, goal: "people" },
            { id: "managers", label: "Сильные управляющие", scores: { PEOPLE: 1, PROCESS: 1 }, goal: "people" },
            { id: "service", label: "Стабильный сервис", scores: { GUEST: 1 }, goal: "guest" },
            { id: "clarity", label: "Понятная картина бизнеса", scores: { PROCESS: 1 }, goal: "process" }
          ]
        }
      ]
    },
    ops: {
      introTitle: "Что происходит внутри операционной системы?",
      questions: [
        {
          id: "ops_locations",
          type: "single",
          text: "Сколько у вас точек?",
          options: [
            { id: "1", label: "1", scores: {}, meta: { locations: 1 } },
            { id: "2_3", label: "2–3", scores: { PROCESS: 1 }, meta: { locations: 2 } },
            { id: "4_9", label: "4–9", scores: { PROCESS: 2 }, meta: { locations: 4 } },
            { id: "10plus", label: "10+", scores: { PROCESS: 3 }, meta: { locations: 10 } }
          ]
        },
        {
          id: "ops_control",
          type: "single",
          text: "Насколько вы контролируете состояние каждой точки?",
          options: [
            { id: "all", label: "Вижу всё", scores: {} },
            { id: "kpi", label: "Вижу основные показатели", scores: { PROCESS: 1 } },
            { id: "late", label: "Узнаю о проблемах постфактум", scores: { PROCESS: 3, PEOPLE: 1 } },
            { id: "manual", label: "Проблемы приходится искать вручную", scores: { PROCESS: 4, PEOPLE: 1 } }
          ]
        },
        {
          id: "ops_problems",
          type: "multi",
          text: "Где сейчас больше всего проблем?",
          options: [
            { id: "managers", label: "Управляющие", scores: { PEOPLE: 3 }, problem: "people" },
            { id: "staff", label: "Персонал", scores: { PEOPLE: 3 }, problem: "people" },
            { id: "service", label: "Сервис", scores: { GUEST: 3 }, problem: "guest" },
            { id: "finance", label: "Финансы", scores: { FINANCE: 3 }, problem: "finance" },
            { id: "process", label: "Процессы", scores: { PROCESS: 3 }, problem: "process" },
            { id: "turnover", label: "Текучка", scores: { PEOPLE: 3 }, problem: "people" },
            { id: "comms", label: "Коммуникация", scores: { PEOPLE: 2, PROCESS: 2 }, problem: "people" }
          ]
        },
        {
          id: "ops_signal",
          type: "single",
          text: "Как вы сейчас понимаете, что в ресторане появилась проблема?",
          options: [
            { id: "numbers", label: "По цифрам", scores: { FINANCE: 1, PROCESS: 1 } },
            { id: "complaints", label: "По жалобам", scores: { GUEST: 3 } },
            { id: "manager", label: "Мне сообщает управляющий", scores: { PEOPLE: 1, PROCESS: 2 } },
            { id: "staff", label: "Мне сообщают сотрудники", scores: { PEOPLE: 2 } },
            { id: "late_feel", label: "Чувствую проблему уже когда она стала серьёзной", scores: { PROCESS: 4, PEOPLE: 2, GUEST: 2 } }
          ]
        },
        {
          id: "ops_time",
          type: "single",
          text: "Сколько времени уходит на сбор информации по ресторанам?",
          options: [
            { id: "lt1", label: "До часа в неделю", scores: {} },
            { id: "1_3", label: "1–3 часа", scores: { PROCESS: 1 } },
            { id: "3_7", label: "3–7 часов", scores: { PROCESS: 2 } },
            { id: "gt7", label: "Больше 7 часов", scores: { PROCESS: 3 } }
          ]
        },
        {
          id: "ops_dashboard",
          type: "single",
          text: "Хотели бы вы видеть состояние всех точек в одном месте?",
          options: [
            { id: "yes", label: "Да", scores: { PROCESS: 1 }, meta: { wantsPulse: true } },
            { id: "need", label: "Очень нужно", scores: { PROCESS: 2 }, meta: { wantsPulse: true } },
            { id: "have", label: "У нас уже есть система", scores: {} },
            { id: "unsure", label: "Пока не уверен", scores: {} }
          ]
        }
      ]
    },
    chef: {
      introTitle: "Что сейчас мешает вам работать сильнее?",
      questions: [
        {
          id: "chef_hard",
          type: "multi",
          text: "Что сейчас сложнее всего?",
          options: [
            { id: "knowledge", label: "Не хватает знаний", scores: { PEOPLE: 1 }, problem: "education" },
            { id: "crew", label: "Не хватает команды", scores: { PEOPLE: 3 }, problem: "people" },
            { id: "train", label: "Сложно обучать сотрудников", scores: { PEOPLE: 2, PROCESS: 1 }, problem: "education" },
            { id: "quality", label: "Сложно держать качество", scores: { GUEST: 2, PROCESS: 2 }, problem: "process" },
            { id: "time", label: "Нет времени на развитие", scores: { PEOPLE: 1 }, problem: "education" },
            { id: "managers", label: "Проблемы с управляющими", scores: { PEOPLE: 2, PROCESS: 1 }, problem: "people" },
            { id: "other", label: "Другое", scores: { PROCESS: 1 }, problem: "process" }
          ]
        },
        {
          id: "chef_need",
          type: "multi",
          text: "Чего вам больше всего не хватает?",
          options: [
            { id: "exchange", label: "Обмена опытом", scores: {}, problem: "education" },
            { id: "learning", label: "Обучения", scores: {}, problem: "education" },
            { id: "mentor", label: "Наставника", scores: {}, problem: "education" },
            { id: "system", label: "Системы", scores: { PROCESS: 2 }, problem: "process" },
            { id: "time", label: "Времени", scores: { PROCESS: 1 }, problem: "process" },
            { id: "team", label: "Сильной команды", scores: { PEOPLE: 2 }, problem: "people" }
          ]
        },
        {
          id: "chef_leader",
          type: "single",
          text: "Хотели бы вы прокачать себя как руководителя?",
          options: [
            { id: "yes", label: "Да", scores: {}, meta: { wantsGrowth: true } },
            { id: "very", label: "Очень хочу", scores: {}, meta: { wantsGrowth: true } },
            { id: "dunno", label: "Пока не знаю", scores: {} }
          ]
        },
        {
          id: "chef_skill",
          type: "multi",
          text: "Какой навык хотите развить?",
          options: [
            { id: "people", label: "Управление людьми", scores: {}, problem: "education" },
            { id: "comms", label: "Коммуникация", scores: {}, problem: "education" },
            { id: "lead", label: "Лидерство", scores: {}, problem: "education" },
            { id: "coach", label: "Коучинг", scores: {}, problem: "education" },
            { id: "aware", label: "Осознанность", scores: {}, problem: "education" },
            { id: "system", label: "Системное управление", scores: { PROCESS: 1 }, problem: "education" }
          ]
        }
      ]
    },
    employee: {
      introTitle: "Как вам работается?",
      questions: [
        {
          id: "emp_feel",
          type: "single",
          text: "Как вы себя чувствуете на работе?",
          options: [
            { id: "great", label: "Очень хорошо", scores: { PEOPLE: 0 } },
            { id: "ok", label: "В целом хорошо", scores: { PEOPLE: 1 } },
            { id: "mixed", label: "По-разному", scores: { PEOPLE: 2 } },
            { id: "hard", label: "Мне тяжело", scores: { PEOPLE: 3 } },
            { id: "leave", label: "Хочу уйти", scores: { PEOPLE: 4 } }
          ]
        },
        {
          id: "emp_block",
          type: "multi",
          text: "Что больше всего мешает?",
          options: [
            { id: "boss", label: "Руководитель", scores: { PEOPLE: 3 }, problem: "people" },
            { id: "team", label: "Коллектив", scores: { PEOPLE: 2 }, problem: "people" },
            { id: "schedule", label: "График", scores: { PROCESS: 2 }, problem: "process" },
            { id: "pay", label: "Зарплата", scores: { FINANCE: 2 }, problem: "finance" },
            { id: "load", label: "Нагрузка", scores: { PROCESS: 2, PEOPLE: 1 }, problem: "process" },
            { id: "growth", label: "Отсутствие развития", scores: { PEOPLE: 2 }, problem: "education" },
            { id: "vibe", label: "Атмосфера", scores: { PEOPLE: 3 }, problem: "people" },
            { id: "belong", label: "Не чувствую себя частью команды", scores: { PEOPLE: 3 }, problem: "people" }
          ]
        },
        {
          id: "emp_growth",
          type: "single",
          text: "Чувствуете ли вы, что можете развиваться здесь?",
          options: [
            { id: "yes", label: "Да", scores: { PEOPLE: 0 } },
            { id: "rather_yes", label: "Скорее да", scores: { PEOPLE: 1 } },
            { id: "rather_no", label: "Скорее нет", scores: { PEOPLE: 3 } },
            { id: "no", label: "Нет", scores: { PEOPLE: 4 } }
          ]
        },
        {
          id: "emp_better",
          type: "multi",
          text: "Что изменило бы вашу работу к лучшему?",
          options: [
            { id: "boss", label: "Лучший руководитель", scores: { PEOPLE: 2 }, problem: "people" },
            { id: "conditions", label: "Лучшие условия", scores: { PROCESS: 1, FINANCE: 1 }, problem: "process" },
            { id: "learning", label: "Обучение", scores: { PEOPLE: 1 }, problem: "education" },
            { id: "growth", label: "Рост", scores: { PEOPLE: 1 }, problem: "education" },
            { id: "respect", label: "Больше уважения", scores: { PEOPLE: 2 }, problem: "people" },
            { id: "relations", label: "Лучшие отношения в команде", scores: { PEOPLE: 2 }, problem: "people" }
          ]
        }
      ]
    }
  },
  blockLabels: {
    PEOPLE: "Люди",
    PROCESS: "Процессы",
    GUEST: "Гость",
    FINANCE: "Финансы"
  },
  form: {
    title: "Хотите получить следующий шаг?",
    lead: "Оставьте контакты — мы свяжемся с учётом вашей роли и ответов."
  }
};
