self.addEventListener('install', (e) => {
    self.skipWaiting();
});

self.addEventListener('activate', (e) => {
    e.waitUntil(clients.claim());
});

// Arka planda bildirim gösterme yeteneği
self.addEventListener('push', (event) => {
    const data = event.data ? event.data.json() : {};
    const title = data.title || "SHNAPP";
    const options = {
        body: data.body || "Yeni bir mesajınız var!",
        icon: "/logo.png",
        badge: "/logo.png",
        vibrate: [100, 50, 100]
    };
    event.waitUntil(self.registration.showNotification(title, options));
});