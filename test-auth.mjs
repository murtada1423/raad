const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlscm1qdmNranlyc2ZiaHduYWdpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwNjczMTQsImV4cCI6MjA5NzY0MzMxNH0.bd2G4OvQu1Fh-vhiEwSVtZwA0S2v0ZFlyVYhChhs0lc'
const BASE = 'https://ilrmjvckjyrsfbhwnagi.supabase.co'

const headers = { 'Content-Type': 'application/json', 'apikey': ANON_KEY }

async function main() {
  // 1. Sign in
  const signIn = await fetch(BASE + '/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers,
    body: JSON.stringify({ email: 'admin@company.com', password: 'Admin@123456' }),
  })
  const session = await signIn.json()
  if (!signIn.ok) {
    console.log('Sign-in failed:', session)
    return
  }
  const token = session.access_token
  console.log('Access token:', token.slice(0, 30) + '...')

  // 2. Query profile with the user token
  const authHeaders = {
    'Content-Type': 'application/json',
    'apikey': ANON_KEY,
    'Authorization': 'Bearer ' + token,
  }

  const prof = await fetch(BASE + '/rest/v1/profiles?select=role&id=eq.' + session.user.id, {
    headers: authHeaders,
  })
  const profile = await prof.json()
  console.log('Profile query:', prof.status, JSON.stringify(profile))

  // 3. Try with single row
  const prof2 = await fetch(BASE + '/rest/v1/profiles?id=eq.' + session.user.id + '&select=role', {
    headers: authHeaders,
  })
  const profile2 = await prof2.json()
  console.log('Profile query 2:', prof2.status, JSON.stringify(profile2))
}
main().catch(console.error)
