import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // حذف الجلسات الأقدم من 35 ثانية
    await supabase
      .from('kiosk_sessions')
      .delete()
      .lt('created_at', new Date(Date.now() - 35000).toISOString())

    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    let code = ''
    for (let i = 0; i < 4; i++) {
      code += chars[Math.floor(Math.random() * chars.length)]
    }
    const token = crypto.randomUUID()
    const timestamp = new Date().toISOString()

    const { error } = await supabase
      .from('kiosk_sessions')
      .insert({ code, token })

    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }

    return Response.json({ code, token, timestamp })
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}
