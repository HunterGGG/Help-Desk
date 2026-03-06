# Backend API (Cloudflare Worker)

Base URL: `https://<worker>/`

## Auth
- `POST /auth/register` — регистрация пользователя.
- `POST /auth/login` — вход по login/password.
- `POST /auth/change-admin-credentials` — смена логина/пароля администратора (только admin).

## Tickets
- `POST /tickets` — создать заявку.
- `GET /tickets` — список заявок (user: только свои, admin: все; поддерживает `?page=1&sort=status&status=NEW`).
- `GET /tickets/:id` — детали + чат.
- `PUT /tickets/:id` — user редактирует только NEW, admin меняет status.
- `DELETE /tickets/:id` — удалить заявку (admin).

## Messages
- `POST /tickets/:id/messages` — отправить сообщение в чат заявки.

## Files
- `POST /files/upload` — загрузка файла в R2.
  - max size: 10MB
  - allowed: jpg/png/pdf/docx

## Notifications
- `GET /notifications`
- `POST /notifications/:id/read`

## Cleanup
- `POST /cron/cleanup` — удаляет DONE старше 5 дней + R2 вложения.
