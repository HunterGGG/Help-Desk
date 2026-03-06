const API = 'http://127.0.0.1:8787';
const app = document.getElementById('app');

const state = { token: localStorage.getItem('token') || '', role: localStorage.getItem('role') || '', page: 'login' };

function htm(strings, ...values) {
  return strings.reduce((a, b, i) => a + b + (values[i] ?? ''), '');
}

function esc(v = '') {
  return String(v).replace(/[&<>"]/g, (s) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[s]));
}

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const res = await fetch(`${API}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Ошибка');
  return data;
}

function setAuth(token, role) {
  state.token = token;
  state.role = role;
  localStorage.setItem('token', token);
  localStorage.setItem('role', role);
}

function logout() {
  state.token = '';
  state.role = '';
  localStorage.clear();
  state.page = 'login';
  render();
}

function renderLogin() {
  app.innerHTML = htm`
    <section class="card"><h2>Вход</h2>
      <form id="loginForm">
        <input name="login" placeholder="Логин" required />
        <input name="password" type="password" placeholder="Пароль" required />
        <button class="btn btn-action" type="submit">Войти</button>
      </form>
      <button id="showRegister" class="btn">Регистрация</button>
    </section>
    <section class="card hidden" id="registerWrap"><h2>Регистрация</h2>
      <form id="registerForm">
        <div class="row">
          <input name="firstName" placeholder="Имя *" required />
          <input name="lastName" placeholder="Фамилия" />
          <input name="login" placeholder="Логин *" required />
          <input name="password" type="password" placeholder="Пароль *" required />
          <input name="phone" placeholder="Телефон" />
          <input name="cabinet" placeholder="Кабинет *" required />
          <input name="department" placeholder="Отдел" />
        </div>
        <button class="btn btn-ok" type="submit">Создать аккаунт</button>
      </form>
    </section>`;

  document.getElementById('showRegister').onclick = () => document.getElementById('registerWrap').classList.toggle('hidden');
  document.getElementById('loginForm').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const data = await api('/auth/login', { method: 'POST', body: JSON.stringify(Object.fromEntries(fd)) });
    setAuth(data.token, data.role);
    state.page = 'dashboard';
    render();
  };
  document.getElementById('registerForm').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    await api('/auth/register', { method: 'POST', body: JSON.stringify(Object.fromEntries(fd)) });
    alert('Успешно зарегистрирован');
  };
}

async function renderUserDashboard() {
  const tickets = await api('/tickets');
  const notifications = await api('/notifications');
  app.innerHTML = htm`
    <div class="tabs">
      <button class="btn btn-action" id="createBtn">Создать заявку</button>
      <button class="btn" id="refreshBtn">Мои заявки</button>
      <button class="btn" id="logoutBtn">Выход</button>
    </div>

    <section id="createWrap" class="card hidden">
      <h3>Новая заявка</h3>
      <form id="ticketForm">
        <div class="row">
          <input name="firstName" placeholder="Имя *" required />
          <input name="lastName" placeholder="Фамилия" />
          <input name="cabinet" placeholder="Кабинет *" required />
          <input name="department" placeholder="Отдел" />
        </div>
        <input name="title" placeholder="Тема *" required />
        <textarea name="description" placeholder="Описание *" required></textarea>
        <input type="file" id="file" accept=".jpg,.png,.pdf,.docx" />
        <div class="row">
          <button type="button" id="cancelTicket" class="btn btn-danger">Отмена</button>
          <button type="submit" class="btn btn-ok">Отправить</button>
        </div>
      </form>
    </section>

    <section class="card"><h3>Уведомления</h3>
      ${notifications.items.map((n) => `<div>${esc(n.created_at)} — ${esc(n.payload)}</div>`).join('') || 'Нет уведомлений'}
    </section>

    <section class="card"><h3>Мои заявки</h3>
      ${tickets.items.map((t) => `<div class="card ticket-item"><b>#${t.id}</b><div>${esc(t.title)}</div><span class="badge">${t.status}</span><button data-id="${t.id}" class="open-ticket btn btn-action">Открыть</button></div>`).join('')}
    </section>

    <section id="ticketDetail"></section>
  `;

  document.getElementById('logoutBtn').onclick = logout;
  document.getElementById('createBtn').onclick = () => document.getElementById('createWrap').classList.remove('hidden');
  document.getElementById('cancelTicket').onclick = () => document.getElementById('createWrap').classList.add('hidden');
  document.getElementById('refreshBtn').onclick = () => render();

  document.getElementById('ticketForm').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = Object.fromEntries(fd);
    const fileEl = document.getElementById('file');
    const file = fileEl.files[0];
    if (file) {
      const f = new FormData();
      f.append('file', file);
      const upload = await fetch(`${API}/files/upload`, { method: 'POST', body: f, headers: { Authorization: `Bearer ${state.token}` } });
      const uploadData = await upload.json();
      if (!upload.ok) throw new Error(uploadData.error);
      payload.attachmentKey = uploadData.key;
    }
    await api('/tickets', { method: 'POST', body: JSON.stringify(payload) });
    alert('Заявка создана');
    render();
  };

  document.querySelectorAll('.open-ticket').forEach((btn) => {
    btn.onclick = async () => {
      const id = btn.getAttribute('data-id');
      const ticket = await api(`/tickets/${id}`);
      const editSection = ticket.status === 'NEW' ? `<button id="editTicket" class="btn btn-action">Обновить описание</button>` : '<small>Редактирование недоступно</small>';
      document.getElementById('ticketDetail').innerHTML = `
        <section class="card"><h3>Заявка #${ticket.id}</h3>
          <p><b>${esc(ticket.title)}</b></p>
          <p>${esc(ticket.description)}</p>
          ${editSection}
          <div id="chat">
            <h4>Чат</h4>
            ${(ticket.messages || []).map((m) => `<div class="chat-line"><b>${m.sender}</b> <span class="muted">[${m.created_at}]</span><br/>${esc(m.message_text)}</div>`).join('')}
            <form id="chatForm"><input name="message" placeholder="Сообщение" required /><button class="btn btn-ok">Отправить</button></form>
          </div>
        </section>`;
      const chatForm = document.getElementById('chatForm');
      chatForm.onsubmit = async (e) => {
        e.preventDefault();
        const fd = new FormData(chatForm);
        await api(`/tickets/${id}/messages`, { method: 'POST', body: JSON.stringify(Object.fromEntries(fd)) });
        render();
      };
      const editBtn = document.getElementById('editTicket');
      if (editBtn) {
        editBtn.onclick = async () => {
          const txt = prompt('Новое описание:');
          if (!txt) return;
          await api(`/tickets/${id}`, { method: 'PUT', body: JSON.stringify({ description: txt }) });
          render();
        };
      }
    };
  });
}

async function renderAdminDashboard() {
  const tickets = await api('/tickets?page=1');
  const users = await api('/admin/users');
  app.innerHTML = htm`
    <div class="tabs">
      <button id="tabTickets" class="btn btn-action">Заявки</button>
      <button id="tabUsers" class="btn">Пользователи</button>
      <button id="logoutBtn" class="btn btn-danger">Выход</button>
    </div>
    <section id="ticketsTab" class="card">
      <h3>Список заявок</h3>
      <div class="table-wrap"><table><thead><tr><th>ID</th><th>Дата</th><th>Кабинет</th><th>Тема</th><th>Статус</th><th>Действия</th></tr></thead><tbody>
      ${tickets.items.map((t) => `<tr><td>${t.id}</td><td>${t.created_at}</td><td>${esc(t.cabinet)}</td><td>${esc(t.title)}</td><td>${t.status}</td><td><button data-open="${t.id}" class="btn">Открыть</button><button data-del="${t.id}" class="btn btn-danger">Удалить</button></td></tr>`).join('')}
      </tbody></table></div>
    </section>
    <section id="usersTab" class="card hidden">
      <h3>Пользователи</h3>
      ${users.items.map((u) => `<div>#${u.id} ${esc(u.first_name)} ${esc(u.last_name)} (${esc(u.login)})</div>`).join('')}
    </section>
    <section id="details"></section>
  `;

  document.getElementById('logoutBtn').onclick = logout;
  document.getElementById('tabTickets').onclick = () => { document.getElementById('ticketsTab').classList.remove('hidden'); document.getElementById('usersTab').classList.add('hidden'); };
  document.getElementById('tabUsers').onclick = () => { document.getElementById('usersTab').classList.remove('hidden'); document.getElementById('ticketsTab').classList.add('hidden'); };

  document.querySelectorAll('[data-del]').forEach((btn) => {
    btn.onclick = async () => {
      await api(`/tickets/${btn.getAttribute('data-del')}`, { method: 'DELETE' });
      render();
    };
  });
  document.querySelectorAll('[data-open]').forEach((btn) => {
    btn.onclick = async () => {
      const id = btn.getAttribute('data-open');
      const t = await api(`/tickets/${id}`);
      document.getElementById('details').innerHTML = `
      <section class="card"><h3>Заявка #${id}</h3>
      <p>${esc(t.description)}</p>
      <select id="statusSel"><option>NEW</option><option>IN_PROGRESS</option><option>DONE</option><option>REJECTED</option></select>
      <button id="saveStatus" class="btn btn-ok">Сменить статус</button>
      <h4>Чат</h4>
      ${(t.messages || []).map((m) => `<div class="chat-line"><b>${m.sender}</b><br/>${esc(m.message_text)}</div>`).join('')}
      <form id="chatAdmin"><input name="message" required /><button class="btn btn-action">Отправить</button></form>
      </section>`;
      document.getElementById('statusSel').value = t.status;
      document.getElementById('saveStatus').onclick = async () => {
        const status = document.getElementById('statusSel').value;
        await api(`/tickets/${id}`, { method: 'PUT', body: JSON.stringify({ status }) });
        render();
      };
      document.getElementById('chatAdmin').onsubmit = async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        await api(`/tickets/${id}/messages`, { method: 'POST', body: JSON.stringify(Object.fromEntries(fd)) });
        render();
      };
    };
  });
}

async function registerPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !state.token) return;
  const reg = await navigator.serviceWorker.register('./public/sw.js');
  const sub = await reg.pushManager.getSubscription();
  if (!sub) {
    console.log('Push subscription can be initialized with VAPID key in production.');
  }
}

async function render() {
  try {
    if (!state.token) return renderLogin();
    if (state.role === 'admin') await renderAdminDashboard();
    else await renderUserDashboard();
    await registerPush();
  } catch (e) {
    alert(e.message);
  }
}

render();
