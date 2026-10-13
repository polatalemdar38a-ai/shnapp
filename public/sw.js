self.addEventListener('push', function(event) {
  const data = event.data ? event.data.json() : { title: 'SHNAPP', body: 'Yeni mesajınız var' };
  event.waitUntil(self.registration.showNotification(data.title, { body: data.body, icon: '/icon.png' }));
});
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(clients.openWindow('/'));
});