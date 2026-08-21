# Platform API — CRM Академии на Railway Postgres

Сайт на GitHub Pages — статический. Чтобы калькулятор писал в CRM и платформа хранила записи, нужен маленький бэкенд.

## Ответ на вопрос: новое пространство или подключиться?

**Новый Railway-аккаунт / «пространство» не нужно.**

У Pulse-бота уже есть Postgres на Railway (`DATABASE_URL`). Делаем так:

1. В **том же Railway-проекте**, где бот — добавить **новый сервис** `platform-api` (из этой папки).
2. К сервису подключить **ту же Postgres** (Variables → `DATABASE_URL` = тот же, что у бота).
3. API сам создаст таблицы `academy_clients` и `academy_leads` — они **не пересекаются** с `feedback_events` / `problems` бота.

Отдельную Postgres-базу создавать не обязательно. Отдельный сервис — да (это не БД, а приложение).

```
Railway project (уже есть)
├── pulse-bot          ← как сейчас
├── Postgres           ← как сейчас, DATABASE_URL
└── platform-api       ← НОВЫЙ сервис, тот же DATABASE_URL
```

## Деплой

1. Railway → New → GitHub Repo `landing` → Root Directory: `platform-api`
2. Variables:
   - `DATABASE_URL` = скопировать из Postgres / из бота
   - `PLATFORM_TOKEN` = `smena2026` (тот же пароль платформы)
   - `CORS_ORIGINS` = `https://www.pulseteam.online,https://pulseteam.online`
3. Deploy → скопировать публичный URL вида `https://platform-api-xxxx.up.railway.app`
4. В репозитории `landing` файл `platform/config.js`:

```js
window.PLATFORM_API_URL = "https://platform-API-URL.up.railway.app";
window.PLATFORM_TOKEN = "smena2026";
```

5. Commit + push → Pages обновится.

## Что умеет API

| Метод | Путь | Кто |
|---|---|---|
| POST | `/api/leads` | публично — калькулятор `/diagnostika/` |
| GET/POST | `/api/clients` | CRM (заголовок `X-Platform-Token`) |
| POST | `/api/clients/{id}/comments` | CRM |
| POST | `/api/clients/{id}/docs` | калькулятор счетов |
| GET | `/api/leads` | список заявок |
| GET | `/health` | проверка |

## Локально

```bash
cd platform-api
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
export DATABASE_URL='postgresql://...'
export PLATFORM_TOKEN=smena2026
uvicorn main:app --reload --port 8000
```

В `platform/config.js` временно: `http://127.0.0.1:8000`.
