# Pulse Team — деплой на GitHub Pages (бесплатно)

Лендинг — обычные HTML-файлы, без серверного кода. GitHub Pages для этого подходит.

## 1. Репозиторий на GitHub

1. Зайдите на [github.com/new](https://github.com/new)
2. Имя, например: `pulseteam-landing` (или `pulseteam.online`)
3. **Public** (Pages бесплатно только для public)
4. Без README — создадите локально

## 2. Залить файлы

В терминале (папка `landing3`):

```bash
cd "/Users/mac/Desktop/бот/landing3"
git init
git add .
git commit -m "Pulse Team landing — GitHub Pages"
git branch -M main
git remote add origin https://github.com/ВАШ_ЛОГИН/pulseteam-landing.git
git push -u origin main
```

Замените `ВАШ_ЛОГИН` на свой GitHub.

## 3. Включить Pages

GitHub → репозиторий → **Settings** → **Pages**

| Поле | Значение |
|------|----------|
| Source | Deploy from a branch |
| Branch | `main` / **/ (root)** |
| Custom domain | `www.pulseteam.online` |

Сохранить. Появится галочка **Enforce HTTPS** — включить, когда DNS обновится (до 24–48 ч).

Файл `CNAME` в репозитории уже содержит `www.pulseteam.online`.

## 4. DNS (Reg.ru или где куплен домен)

**Отвязать от Vercel:** удалить записи на `76.76.21.21` и `cname.vercel-dns.com`.

### Вариант A — основной сайт на www (рекомендуется, как в canonical)

| Тип | Имя | Значение |
|-----|-----|----------|
| CNAME | `www` | `ВАШ_ЛОГИН.github.io` |
| A | `@` | `185.199.108.153` |
| A | `@` | `185.199.109.153` |
| A | `@` | `185.199.110.153` |
| A | `@` | `185.199.111.153` |

Корень `@` (pulseteam.online без www) GitHub перенаправит на www, если в Pages указан custom domain.

### Вариант B — только www

Только CNAME `www` → `ВАШ_ЛОГИН.github.io`. Корень `@` можно оставить A на GitHub (как выше) или редирект у регистратора.

## 5. Проверка

- `https://ВАШ_ЛОГИН.github.io` — сайт до DNS
- `https://www.pulseteam.online` — после DNS (1–48 ч)
- Яндекс-верификация: `yandex_3ba19479d2e6410e.html` уже в папке

## 6. Обновления

```bash
cd "/Users/mac/Desktop/бот/landing3"
# правки в html
git add .
git commit -m "update landing"
git push
```

Через 1–2 минуты сайт обновится.

## Vercel

В [vercel.com](https://vercel.com) → проект → Settings → Domains → удалить `pulseteam.online`, иначе конфликт DNS.

## Если из РФ всё ещё не открывается

GitHub Pages обычно стабильнее Vercel, но не гарантия 100%. Тогда запасной вариант — статика на **Reg.ru** (хостинг ~5000 ₽/год) теми же файлами из этой папки.
