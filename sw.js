self.addEventListener('install', (e) => {
    self.skipWaiting();
});

self.addEventListener('activate', (e) => {
    e.waitUntil(clients.claim());
});

// Cihaz kilitliyken veya uygulama arkadayken gelen arama ve mesaj bildirimlerini yakalar
self.addEventListener('push', (event) => {
    const data = event.data ? event.data.json() : {};

    let title = "SHNAPP - Yeni Mesaj";
    let body = data.body || "Yeni bir mesajınız var.";
    let options = {
        icon: "/logo.png",
        badge: "/logo.png",
        vibrate: [100, 50, 100],
        data: data
    };

    if (data.type === 'incoming-call') {
        title = `📞 ${data.from} Sizi Arıyor...`;
        body = data.isVideo ? "Görüntülü Arama" : "Sesli Arama";
        options = {
            icon: "/logo.png",
            badge: "/logo.png",
            tag: "incoming-call",
            renotify: true,
            requireInteraction: true, // Kullanıcı kapatana kadar ekranda kalır
            vibrate: [500, 250, 500, 250, 500, 250, 500], // Telefon zil ritmi
            data: data,
            actions: [
                { action: 'accept', title: '✅ Cevapla' },
                { action: 'reject', title: '❌ Reddet' }
            ]
        };
    }

    event.waitUntil(
        self.registration.showNotification(title, options)
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    if (event.action === 'accept') {
        event.waitUntil(
            clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
                for (let client of clientList) {
                    if (client.url && 'focus' in client) {
                        return client.focus();
                    }
                }
                if (clients.openWindow) {
                    return clients.openWindow('/');
                }
            })
        );
    }
});