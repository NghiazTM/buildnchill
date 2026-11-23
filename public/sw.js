/* BuildnChill — service worker chỉ dùng cho thông báo sự kiện (không cache trang). */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = { title: 'BuildnChill', body: event.data && event.data.text() }; }
  event.waitUntil(self.registration.showNotification(data.title || 'BuildnChill', {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/favicon-32x32.png',
    tag: data.tag || 'bnc',
    data: { url: data.url || '/events' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/events';
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if (c.url.startsWith(self.location.origin) && 'focus' in c) {
        await c.focus();
        if ('navigate' in c) return c.navigate(url);
        return undefined;
      }
    }
    return self.clients.openWindow(url);
  })());
});
