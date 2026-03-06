import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { z } from 'zod';
import { sign, verify } from 'hono/jwt';
import { hashSync, compareSync } from 'bcryptjs';

type Bindings = {
  DB: D1Database;
  FILES: R2Bucket;
  JWT_SECRET: string;
  JWT_ISSUER: string;
  WEB_PUSH?: string;
};

type Variables = {
  user: { id: number; role: 'user' | 'admin'; login: string };
};

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

app.use('*', cors({ origin: '*', allowHeaders: ['Content-Type', 'Authorization'], allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'] }));

const registrationSchema = z.object({
  firstName: z.string().min(1).max(80),
  lastName: z.string().max(80).optional().default(''),
  login: z.string().min(3).max(50).regex(/^[a-zA-Z0-9._-]+$/),
  password: z.string().min(8).max(120),
  phone: z.string().max(30).optional().default(''),
  cabinet: z.string().min(1).max(30),
  department: z.string().max(120).optional().default('')
});

const ticketSchema = z.object({
  title: z.string().min(3).max(150),
  description: z.string().min(5).max(5000),
  firstName: z.string().min(1).max(80),
  lastName: z.string().max(80).optional().default(''),
  cabinet: z.string().min(1).max(30),
  department: z.string().max(120).optional().default(''),
  attachmentKey: z.string().max(255).optional()
});

const messageSchema = z.object({ message: z.string().min(1).max(3000) });

const allowedStatuses = ['NEW', 'IN_PROGRESS', 'DONE', 'REJECTED'] as const;

type Status = typeof allowedStatuses[number];

function sanitize(input: string): string {
  return input.replace(/[<>"']/g, '');
}

async function auth(c: any, next: any) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return c.json({ error: 'Нет токена' }, 401);
  try {
    const token = authHeader.slice(7);
    const payload = await verify(token, c.env.JWT_SECRET);
    c.set('user', { id: Number(payload.sub), role: payload.role as 'user' | 'admin', login: String(payload.login) });
    await next();
  } catch {
    return c.json({ error: 'Невалидный токен' }, 401);
  }
}

async function adminOnly(c: any, next: any) {
  const u = c.get('user');
  if (u.role !== 'admin') return c.json({ error: 'Доступ запрещен' }, 403);
  await next();
}

async function notify(db: D1Database, userId: number, eventType: string, payload: string) {
  await db.prepare('INSERT INTO notifications (user_id, event_type, payload, is_read) VALUES (?, ?, ?, 0)').bind(userId, eventType, payload).run();
}

app.get('/health', (c) => c.json({ ok: true }));

app.post('/auth/register', async (c) => {
  const body = registrationSchema.parse(await c.req.json());
  const passwordHash = hashSync(body.password, 10);
  try {
    await c.env.DB.prepare(
      `INSERT INTO users (first_name, last_name, login, password_hash, phone, cabinet, department, role)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'user')`
    ).bind(sanitize(body.firstName), sanitize(body.lastName), body.login.toLowerCase(), passwordHash, sanitize(body.phone), sanitize(body.cabinet), sanitize(body.department)).run();
    return c.json({ success: true }, 201);
  } catch {
    return c.json({ error: 'Логин уже занят' }, 409);
  }
});

app.post('/auth/login', async (c) => {
  const schema = z.object({ login: z.string(), password: z.string() });
  const data = schema.parse(await c.req.json());
  const row = await c.env.DB.prepare('SELECT id, login, password_hash, role FROM users WHERE login = ?').bind(data.login.toLowerCase()).first<any>();
  if (!row || !compareSync(data.password, row.password_hash)) return c.json({ error: 'Неверный логин или пароль' }, 401);
  const token = await sign({ sub: String(row.id), role: row.role, login: row.login, iss: c.env.JWT_ISSUER, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 12 }, c.env.JWT_SECRET);
  return c.json({ token, role: row.role });
});

app.post('/auth/change-admin-credentials', auth, adminOnly, async (c) => {
  const schema = z.object({ login: z.string().min(3), password: z.string().min(8) });
  const data = schema.parse(await c.req.json());
  await c.env.DB.prepare('UPDATE users SET login = ?, password_hash = ? WHERE role = \"admin\"').bind(data.login.toLowerCase(), hashSync(data.password, 10)).run();
  return c.json({ success: true });
});

app.post('/files/upload', auth, async (c) => {
  const form = await c.req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) return c.json({ error: 'Файл не найден' }, 400);
  const allowed = ['image/jpeg', 'image/png', 'application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
  if (!allowed.includes(file.type)) return c.json({ error: 'Недопустимый тип файла' }, 400);
  if (file.size > 10 * 1024 * 1024) return c.json({ error: 'Размер файла больше 10MB' }, 400);
  const key = `${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  await c.env.FILES.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type } });
  return c.json({ key });
});

app.post('/tickets', auth, async (c) => {
  const user = c.get('user');
  const data = ticketSchema.parse(await c.req.json());
  const result = await c.env.DB.prepare(
    `INSERT INTO tickets (user_id, first_name, last_name, cabinet, department, title, description, status, attachment_key)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'NEW', ?)`
  ).bind(user.id, sanitize(data.firstName), sanitize(data.lastName), sanitize(data.cabinet), sanitize(data.department), sanitize(data.title), sanitize(data.description), data.attachmentKey ?? null).run();
  return c.json({ id: result.meta.last_row_id }, 201);
});

app.get('/tickets', auth, async (c) => {
  const user = c.get('user');
  const page = Number(c.req.query('page') ?? 1);
  const offset = (page - 1) * 10;
  const status = c.req.query('status');
  const sort = c.req.query('sort') === 'status' ? 'status ASC, created_at DESC' : 'created_at DESC';

  if (user.role === 'admin') {
    const where = status && allowedStatuses.includes(status as Status) ? 'WHERE status = ?' : '';
    const bindValues = status && allowedStatuses.includes(status as Status) ? [status, 10, offset] : [10, offset];
    const query = `SELECT id, user_id, created_at, cabinet, title, status FROM tickets ${where} ORDER BY ${sort} LIMIT ? OFFSET ?`;
    const { results } = await c.env.DB.prepare(query).bind(...bindValues).all();
    return c.json({ items: results });
  }

  const { results } = await c.env.DB.prepare('SELECT id, created_at, cabinet, title, status FROM tickets WHERE user_id = ? ORDER BY created_at DESC LIMIT 50').bind(user.id).all();
  return c.json({ items: results });
});

app.get('/tickets/:id', auth, async (c) => {
  const user = c.get('user');
  const id = Number(c.req.param('id'));
  const ticket = await c.env.DB.prepare('SELECT * FROM tickets WHERE id = ?').bind(id).first<any>();
  if (!ticket) return c.json({ error: 'Не найдено' }, 404);
  if (user.role !== 'admin' && ticket.user_id !== user.id) return c.json({ error: 'Нет доступа' }, 403);
  const messages = await c.env.DB.prepare('SELECT sender, created_at, message_text FROM ticket_messages WHERE ticket_id = ? ORDER BY created_at ASC').bind(id).all();
  return c.json({ ...ticket, messages: messages.results });
});

app.put('/tickets/:id', auth, async (c) => {
  const user = c.get('user');
  const id = Number(c.req.param('id'));
  const ticket = await c.env.DB.prepare('SELECT user_id, status FROM tickets WHERE id = ?').bind(id).first<any>();
  if (!ticket) return c.json({ error: 'Не найдено' }, 404);
  if (user.role !== 'admin' && ticket.user_id !== user.id) return c.json({ error: 'Нет доступа' }, 403);
  if (user.role === 'user' && ticket.status !== 'NEW') return c.json({ error: 'Можно редактировать только NEW' }, 400);

  if (user.role === 'admin') {
    const schema = z.object({ status: z.enum(allowedStatuses) });
    const data = schema.parse(await c.req.json());
    await c.env.DB.prepare('UPDATE tickets SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(data.status, id).run();
    await notify(c.env.DB, ticket.user_id, 'status_changed', `Статус заявки #${id}: ${data.status}`);
    return c.json({ success: true });
  }

  const data = ticketSchema.partial().parse(await c.req.json());
  await c.env.DB.prepare(
    `UPDATE tickets SET first_name = COALESCE(?, first_name), last_name = COALESCE(?, last_name), cabinet = COALESCE(?, cabinet),
     department = COALESCE(?, department), title = COALESCE(?, title), description = COALESCE(?, description), updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  ).bind(data.firstName ? sanitize(data.firstName) : null, data.lastName ? sanitize(data.lastName) : null, data.cabinet ? sanitize(data.cabinet) : null, data.department ? sanitize(data.department) : null, data.title ? sanitize(data.title) : null, data.description ? sanitize(data.description) : null, id).run();
  return c.json({ success: true });
});

app.delete('/tickets/:id', auth, adminOnly, async (c) => {
  const id = Number(c.req.param('id'));
  const ticket = await c.env.DB.prepare('SELECT attachment_key FROM tickets WHERE id = ?').bind(id).first<any>();
  if (!ticket) return c.json({ error: 'Не найдено' }, 404);
  if (ticket.attachment_key) await c.env.FILES.delete(ticket.attachment_key);
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM ticket_messages WHERE ticket_id = ?').bind(id),
    c.env.DB.prepare('DELETE FROM tickets WHERE id = ?').bind(id)
  ]);
  return c.json({ success: true });
});

app.post('/tickets/:id/messages', auth, async (c) => {
  const user = c.get('user');
  const id = Number(c.req.param('id'));
  const data = messageSchema.parse(await c.req.json());
  const ticket = await c.env.DB.prepare('SELECT user_id FROM tickets WHERE id = ?').bind(id).first<any>();
  if (!ticket) return c.json({ error: 'Не найдено' }, 404);
  if (user.role !== 'admin' && ticket.user_id !== user.id) return c.json({ error: 'Нет доступа' }, 403);
  const sender = user.role === 'admin' ? 'admin' : 'user';
  await c.env.DB.prepare('INSERT INTO ticket_messages (ticket_id, sender, message_text) VALUES (?, ?, ?)').bind(id, sender, sanitize(data.message)).run();
  await notify(c.env.DB, ticket.user_id, 'new_message', `Новое сообщение в заявке #${id}`);
  return c.json({ success: true }, 201);
});

app.get('/admin/users', auth, adminOnly, async (c) => {
  const { results } = await c.env.DB.prepare('SELECT id, first_name, last_name, login, phone, cabinet, department, created_at FROM users WHERE role = \"user\" ORDER BY created_at DESC').all();
  return c.json({ items: results });
});

app.get('/notifications', auth, async (c) => {
  const user = c.get('user');
  const { results } = await c.env.DB.prepare('SELECT id, event_type, payload, is_read, created_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50').bind(user.id).all();
  return c.json({ items: results });
});

app.post('/notifications/:id/read', auth, async (c) => {
  const user = c.get('user');
  const id = Number(c.req.param('id'));
  await c.env.DB.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?').bind(id, user.id).run();
  return c.json({ success: true });
});

app.post('/cron/cleanup', async (c) => {
  const oldTickets = await c.env.DB.prepare("SELECT id, attachment_key FROM tickets WHERE status = 'DONE' AND created_at < datetime('now', '-5 day')").all<any>();
  for (const t of oldTickets.results) {
    if (t.attachment_key) await c.env.FILES.delete(t.attachment_key);
    await c.env.DB.batch([
      c.env.DB.prepare('DELETE FROM ticket_messages WHERE ticket_id = ?').bind(t.id),
      c.env.DB.prepare('DELETE FROM tickets WHERE id = ?').bind(t.id)
    ]);
  }
  return c.json({ removed: oldTickets.results.length });
});

export default app;
