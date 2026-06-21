const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlscm1qdmNranlyc2ZiaHduYWdpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MjA2NzMxNCwiZXhwIjoyMDk3NjQzMzE0fQ.mPOMwj2U1jJqLLNQKFaD-lV5lz1wRlCq88HKq-8Hn1E'
const SUPABASE_URL = 'https://ilrmjvckjyrsfbhwnagi.supabase.co'

async function createAdmin() {
  // 1. Create auth user
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: 'admin@company.com',
      password: 'Admin@123456',
      email_confirm: true,
    }),
  })

  const user = await res.json()
  if (!res.ok) {
    console.error('Failed to create user:', user)
    process.exit(1)
  }

  const userId = user.id
  console.log(`✓ User created: ${user.email} (${userId})`)

  // 2. Try to run SQL schema
  // We'll use the /rest/v1/ endpoint to check if tables exist
  const profileCheck = await fetch(`${SUPABASE_URL}/rest/v1/profiles?select=id&limit=1`, {
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
    },
  })

  if (profileCheck.status === 404 || profileCheck.status === 400) {
    console.log('Tables not found. Please run the SQL schema in Supabase SQL Editor, then run this script again to insert the admin profile.')
    console.log('\n📋 SQL file: supabase_schema.sql')
    console.log('📍 Open: https://supabase.com/dashboard/project/ilrmjvckjyrsfbhwnagi/sql/new')
    process.exit(0)
  }

  // 3. Insert profile (if table exists)
  const profileRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles`, {
    method: 'POST',
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
    body: JSON.stringify({
      id: userId,
      full_name: 'مدير النظام',
      role: 'admin',
      monthly_salary: 450000,
      required_hours: 8,
    }),
  })

  const profile = await profileRes.json()
  if (!profileRes.ok) {
    console.error('Failed to insert profile:', profile)
    process.exit(1)
  }

  console.log('✓ Profile created: Admin')
  console.log('\n✅ All done! You can now log in at:')
  console.log('   Email: admin@company.com')
  console.log('   Password: Admin@123456')
}

createAdmin().catch(console.error)
