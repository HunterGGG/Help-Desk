PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  first_name TEXT NOT NULL,
  last_name TEXT DEFAULT '',
  login TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  phone TEXT DEFAULT '',
  cabinet TEXT NOT NULL,
  department TEXT DEFAULT '',
  role TEXT NOT NULL CHECK(role IN ('user','admin')),
  webauthn_credential_id TEXT,
  webauthn_public_key TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT DEFAULT '',
  cabinet TEXT NOT NULL,
  department TEXT DEFAULT '',
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('NEW','IN_PROGRESS','DONE','REJECTED')) DEFAULT 'NEW',
  attachment_key TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ticket_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL,
  sender TEXT NOT NULL CHECK(sender IN ('user','admin')),
  message_text TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  payload TEXT NOT NULL,
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tickets_user ON tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_created ON tickets(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_ticket ON ticket_messages(ticket_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at DESC);

INSERT OR IGNORE INTO users (id, first_name, last_name, login, password_hash, phone, cabinet, department, role)
VALUES (1, 'Системный', 'Администратор', 'adm', '$2a$10$qEhX9J2hU3TZ20x8rT8VzeIFfI8K3LxAb4q2PASi6DPd7OJbRRqtq', '', 'IT', 'IT', 'admin');
-- Default admin password hash corresponds to: Admin1234!
