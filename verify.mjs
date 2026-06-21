const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlscm1qdmNranlyc2ZiaHduYWdpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MjA2NzMxNCwiZXhwIjoyMDk3NjQzMzE0fQ.mPOMwj2U1jJqLLNQKFaD-lV5lz1wRlCq88HKq-8Hn1E'
const BASE = 'https://ilrmjvckjyrsfbhwnagi.supabase.co'

const headers = {
  'apikey': SERVICE_KEY,
  'Authorization': 'Bearer ' + SERVICE_KEY,
  'Content-Type': 'application/json',
}

async function main() {
  const a = await fetch(BASE + '/rest/v1/attendance?select=id&limit=1', { headers })
  console.log('attendance table:', a.status, a.statusText)

  const r = await fetch(BASE + '/rest/v1/rpc/process_attendance_scan', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      p_user_id: '01bead67-7a2b-4089-b8dd-1a11db12a9be',
      p_lat: 33.365481,
      p_lng: 44.531729,
      p_qr_timestamp: new Date(Date.now() - 60000).toISOString(),
    }),
  })
  const body = await r.json()
  console.log('RPC function:', r.status, JSON.stringify(body))
}

main().catch(console.error)
