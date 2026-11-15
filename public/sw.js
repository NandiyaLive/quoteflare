// Service worker for lead notifications. It handles push only and does not
// cache anything or intercept requests.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) =>
  event.waitUntil(self.clients.claim()),
)

self.addEventListener('push', (event) => {
  let message
  try {
    message = event.data ? event.data.json() : {}
  } catch {
    message = {}
  }
  // iOS and Chrome require every push to show a notification.
  event.waitUntil(
    self.registration.showNotification(message.title || 'Leads due today', {
      body: message.body || '',
      icon: '/icon-192.png',
      tag: 'lead-digest',
      data: { url: message.url || '/admin/leads' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = new URL(
    (event.notification.data && event.notification.data.url) || '/admin/leads',
    self.location.origin,
  )
  // Never open a URL outside this site, whatever the payload says.
  if (target.origin !== self.location.origin) return
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(async (windows) => {
        for (const client of windows) {
          if (new URL(client.url).origin === self.location.origin) {
            await client.focus()
            return client.navigate(target.href)
          }
        }
        return self.clients.openWindow(target.href)
      }),
  )
})
