const CACHE_NAME = 'attendance-v2'
const PRECACHE = [
  '/',
  '/login',
  '/icons/icon.svg',
]

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (e) => {
  const { request } = e
  if (request.method !== 'GET') return

  if (request.url.includes('/api/')) {
    e.respondWith(fetch(request).catch(() => new Response(JSON.stringify({ error: 'offline' }), { headers: { 'Content-Type': 'application/json' } })))
    return
  }

  e.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        fetch(request).then((res) => {
          if (res && res.status === 200) {
            const clone = res.clone()
            caches.open(CACHE_NAME).then((c) => c.put(request, clone))
          }
        }).catch(() => {})
        return cached
      }
      return fetch(request).then((res) => {
        if (res && res.status === 200 && request.location.origin === self.location.origin) {
          const clone = res.clone()
          caches.open(CACHE_NAME).then((c) => c.put(request, clone))
        }
        return res
      }).catch(() => caches.match('/'))
    })
  )
})
