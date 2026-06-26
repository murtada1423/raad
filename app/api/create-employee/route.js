import { createClient } from '@supabase/supabase-js'

export async function POST(request) {
  try {
    const { email, password, full_name, monthly_salary, required_hours, check_in_time } = await request.json()

    if (!email || !password || !full_name) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name, role: 'employee' },
    })

    if (authError) {
      return Response.json({ error: authError.message }, { status: 400 })
    }

    const { error: profileError } = await supabaseAdmin.from('profiles').insert({
      id: authUser.user.id,
      full_name,
      role: 'employee',
      monthly_salary: monthly_salary || 450000,
      required_hours: required_hours || 8,
      check_in_time: check_in_time || '09:00',
    })

    if (profileError) {
      await supabaseAdmin.auth.admin.deleteUser(authUser.user.id)
      return Response.json({ error: profileError.message }, { status: 500 })
    }

    return Response.json({ success: true, user: authUser.user })
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}
