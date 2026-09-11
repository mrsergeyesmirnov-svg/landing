# Platform API — CRM и Master Audit Академии на Railway Postgres

Сайт на GitHub Pages статический. Backend `platform-api` хранит CRM и Master Audit в той же Railway Postgres, что используется проектом Pulse, но в отдельных таблицах `academy_*`.

## Railway

В Railway используется сервис из папки `platform-api` и существующий `DATABASE_URL`.

Переменные окружения:

- `DATABASE_URL` — PostgreSQL;
- `SESSION_SECRET` — случайная строка минимум 32 символа;
- `PLATFORM_USERS_JSON` — JSON-массив пользователей платформы;
- `CORS_ORIGINS` — `https://www.pulseteam.online,https://pulseteam.online`.

Публичный API платформы: `https://api.pulseteam.online`.

`railway.toml` запускает `master_app:app`: он использует существующую CRM/API из `main.py`, убирает обязательный TOTP и добавляет Master Audit.

## Авторизация

Только **логин + пароль**. Google Authenticator / TOTP не нужен.

Пароли не хранятся открытым текстом. Для каждого пользователя в `PLATFORM_USERS_JSON` хранится PBKDF2-SHA256 hash.

Создать запись:

```bash
python create_user.py sergey
```

Скрипт попросит пароль и выведет только JSON-запись с `username` и `password_hash`.

Пример структуры переменной:

```json
[
  {"username":"sergey","password_hash":"..."},
  {"username":"partner","password_hash":"..."}
]
```

Существующие записи с полем `totp_secret` можно не переделывать: новое приложение его просто игнорирует.

Сессия — подписанная HttpOnly Secure cookie. Если включено «Запомнить», срок 30 дней; иначе 12 часов.

## Master Audit

Таблицы создаются автоматически при первом обращении к API аудита:

- `academy_audit_sessions` — Day 0 / Day 30 / Day 60 / внеплановые аудиты;
- `academy_audit_answers` — 150 ответов, оценки 0/1/2/N/A и комментарии/evidence;
- `academy_audit_baselines` — зафиксированная Healthy Baseline ресторана.

Основные endpoints:

| Метод | Путь | Назначение |
|---|---|---|
| GET | `/api/audits` | история аудитов |
| POST | `/api/audits` | создать аудит |
| GET | `/api/audits/{id}` | открыть/продолжить аудит |
| PUT | `/api/audits/{id}/answers/{item_id}` | автосохранить ответ |
| POST | `/api/audits/{id}/complete` | завершить и посчитать результат |
| POST | `/api/audits/{id}/baseline` | сохранить Healthy Baseline |
| DELETE | `/api/audits/{id}` | удалить незавершённый черновик |

Все эти endpoints требуют авторизованную сессию.

## Остальной API

| Метод | Путь | Кто |
|---|---|---|
| POST | `/api/leads` | публичная форма |
| POST | `/api/auth/login` | логин + пароль |
| GET | `/api/auth/me` | текущая сессия |
| POST | `/api/auth/logout` | выход |
| GET/POST | `/api/clients` | CRM |
| POST | `/api/clients/{id}/comments` | комментарии CRM |
| POST | `/api/clients/{id}/docs` | документы |
| GET | `/api/leads` | лиды |
| GET | `/health` | проверка backend/DB |

Frontend платформы находится в `/platform/`, а `platform/config.js` указывает на `https://api.pulseteam.online`.
