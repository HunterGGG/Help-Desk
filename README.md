# HelpDesk (GitHub Pages + Cloudflare Workers + D1 + R2)

Минималистичное внутреннее IT HelpDesk-приложение на русском языке.

## 1) Структура проекта

```text
Help-Desk/
├── backend/
│   ├── src/index.ts
│   ├── package.json
│   ├── tsconfig.json
│   └── wrangler.toml
├── frontend/
│   ├── index.html
│   ├── src/main.js
│   ├── src/styles.css
│   └── public/sw.js
├── database/
│   └── schema.sql
├── docs/
│   └── api.md
└── README.md
```

## 2) База данных

Схема находится в `database/schema.sql`:
- `users`
- `tickets`
- `ticket_messages`
- `notifications`

Включён дефолтный админ:
- login: `adm`
- password: `Admin1234!`

Пароли хранятся в bcrypt hash.

## 3) Backend (Cloudflare Worker)

### Локальный запуск
```bash
cd backend
npm install
npx wrangler d1 create helpdesk-db
# вставьте database_id в wrangler.toml
npx wrangler d1 execute helpdesk-db --local --file=../database/schema.sql
npx wrangler dev
```

### Продакшен деплой
```bash
cd backend
npx wrangler secret put JWT_SECRET
npx wrangler deploy
```

Дополнительно:
- Создайте R2 bucket `helpdesk-files`.
- Настройте cron trigger на `POST /cron/cleanup` 1 раз в день.

## 4) Frontend (GitHub Pages)

Frontend — статический SPA без сборки.

### Локально
```bash
cd frontend
python3 -m http.server 4173
```

### Деплой на GitHub Pages
1. Commit/push в GitHub.
2. Settings → Pages → Deploy from branch.
3. Выберите root: `/frontend` (или публикуйте через GitHub Actions).
4. В `frontend/src/main.js` задайте `API = 'https://<your-worker-domain>'`.

## 5) Безопасность

- bcrypt hash для паролей.
- Параметризованные SQL-запросы (защита от SQL injection).
- Базовая санитизация текста (XSS mitigation).
- Валидация типов и размера файла (защита от malicious upload).

## 6) Web Push

В frontend зарегистрирован service worker (`public/sw.js`).
Для полного push-потока нужно добавить VAPID подписки в backend (таблица + endpoint), и использовать Web Push провайдер.

## 7) Покрытие функционала

### User side
- Регистрация и вход.
- Создание заявки.
- Просмотр своих заявок.
- Редактирование заявки только в статусе `NEW`.
- Чат внутри заявки.
- Просмотр уведомлений.

### Admin side
- Вход с дефолтными учетными данными.
- Dashboard: вкладки Tickets/Users.
- Сортировка и пагинация в API (`GET /tickets`).
- Изменение статуса.
- Удаление заявки.
- Ответы в чате.
- Смена логина/пароля админа.
