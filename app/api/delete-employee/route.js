import { createClient } from '@supabase/supabase-js'

export async function POST(request) {
  try {
    const { userId } = await request.json()

    if (!userId) {
      return Response.json({ error: 'Missing userId' }, { status: 400 })
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    await supabaseAdmin.from('profiles').delete().eq('id', userId)

    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId)

    if (authError) {
      return Response.json({ error: authError.message }, { status: 500 })
    }

    return Response.json({ success: true })
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}
