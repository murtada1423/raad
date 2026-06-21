const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlscm1qdmNranlyc2ZiaHduYWdpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MjA2NzMxNCwiZXhwIjoyMDk3NjQzMzE0fQ.mPOMwj2U1jJqLLNQKFaD-lV5lz1wRlCq88HKq-8Hn1E'
const BASE = 'https://ilrmjvckjyrsfbhwnagi.supabase.co'

const headers = {
  apikey: SERVICE_KEY,
  Authorization: 'Bearer ' + SERVICE_KEY,
  'Content-Type': 'application/json',
}

async function main() {
  const p = await fetch(BASE + '/rest/v1/profiles?select=*', { headers })
  const profiles = await p.json()
  console.log('=== PROFILES ===')
  console.log(JSON.stringify(profiles, null, 2))

  const u = await fetch(BASE + '/auth/v1/admin/users', { headers })
  const users = await u.json()
  console.log('\n=== AUTH USERS ===')
  if (users.users) {
    console.log(JSON.stringify(users.users.map(u => ({ id: u.id, email: u.email })), null, 2))
  } else {
    console.log(JSON.stringify(users, null, 2))
  }
}
main().catch(console.error)
