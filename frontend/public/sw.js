self.addEventListener('push', (event) => {
  const data = event.data?.json?.() || { title: 'HelpDesk', body: 'Новое уведомление' };
  event.waitUntil(self.registration.showNotification(data.title || 'HelpDesk', { body: data.body || '' }));
});
