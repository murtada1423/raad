'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const [payload, setPayload] = useState({ token: '', timestamp: '' })
  const [countdown, setCountdown] = useState(30)
  const canvasRef = useRef(null)

  useEffect(() => {
    let mounted = true
    let timeoutId

    async function generate() {
      const token = crypto.randomUUID()
      const timestamp = new Date().toISOString()
      const json = JSON.stringify({ token, timestamp })
      if (!mounted) return

      const QRCode = (await import('qrcode')).default
      if (!mounted) return

      QRCode.toCanvas(canvasRef.current, json, {
        width: 280,
        margin: 1,
        scale: 6,
        color: { dark: '#1d1d1f', light: '#ffffff' },
      }).then(() => {
        if (mounted) {
          setPayload({ token, timestamp })
        }
      })
    }

    generate()
    timeoutId = setInterval(generate, 30000)
    return () => { mounted = false; clearInterval(timeoutId) }
  }, [])

  // Countdown timer
  useEffect(() => {
    setCountdown(30)
  }, [payload])

  useEffect(() => {
    const id = setInterval(() => {
      setCountdown((c) => Math.max(0, c - 1))
    }, 1000)
    return () => clearInterval(id)
  }, [])

  async function handleSignIn(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (signInError) {
      setError(signInError.message)
      setLoading(false)
      return
    }

    const userId = data.user.id

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single()

    if (profileError || !profile) {
      setError('الملف الشخصي غير موجود. تواصل مع المدير.')
      setLoading(false)
      return
    }

    if (profile.role === 'admin') {
      router.push('/dashboard/admin')
    } else {
      router.push('/dashboard/employee')
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.backgroundShapes}>
        <div style={{ ...styles.shape, ...styles.shape1 }} />
        <div style={{ ...styles.shape, ...styles.shape2 }} />
        <div style={{ ...styles.shape, ...styles.shape3 }} />
      </div>

      <div className="login-grid" dir="ltr" style={styles.grid}>
        {/* Left Side — QR Code */}
        <div style={styles.col}>
          <div style={styles.qrCard}>
            <div style={styles.qrBody}>
              <div style={styles.qrIcon}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
                </svg>
              </div>
              <h2 style={styles.qrTitle}>امسح رمز QR<br />لتسجيل الحضور</h2>
              <p style={styles.qrSub}>استخدم تطبيق الموظف لمسح الرمز الظاهر أدناه</p>
              <div style={styles.qrFrame}>
                <canvas ref={canvasRef} style={styles.canvas} />
                <div style={styles.qrGlow} />
              </div>
            </div>
            <div style={styles.qrFooter}>
              <div style={styles.qrFooterRow}>
                <span style={styles.qrFooterLabel}>الرمز</span>
                <span dir="ltr" style={styles.qrFooterValue}>{payload.token ? payload.token.slice(0, 8) + '...' : '—'}</span>
              </div>
              <div style={styles.qrFooterDivider} />
              <div style={styles.qrFooterRow}>
                <span style={styles.qrFooterLabel}>التحديث</span>
                <span dir="ltr" style={{ ...styles.qrFooterValue, color: countdown <= 5 ? '#ff453a' : '#1d1d1f', fontWeight: 700, fontSize: 15 }}>{countdown} ث</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side — Login Form */}
        <div style={styles.col}>
          <div style={styles.card}>
            <div style={styles.cardInner}>
              <div style={styles.header}>
                <div style={styles.logo}>
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="8" r="4" />
                    <path d="M20 21a8 8 0 1 0-16 0" />
                  </svg>
                </div>
                <h1 style={styles.title}>الحضور والرواتب</h1>
                <p style={styles.subtitle}>تسجيل الدخول إلى حسابك</p>
              </div>

              <form onSubmit={handleSignIn} style={styles.form}>
                <div style={styles.inputGroup}>
                  <label style={styles.label} htmlFor="email">البريد الإلكتروني</label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="أدخل البريد الإلكتروني"
                    style={styles.input}
                    autoComplete="email"
                    required
                  />
                </div>

                <div style={styles.inputGroup}>
                  <label style={styles.label} htmlFor="password">كلمة المرور</label>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="أدخل كلمة المرور"
                    style={styles.input}
                    autoComplete="current-password"
                    required
                  />
                </div>

                {error && <p style={styles.error}>{error}</p>}

                <button type="submit" disabled={loading} style={{
                  ...styles.button,
                  opacity: loading ? 0.7 : 1,
                }}>
                  {loading ? 'جاري تسجيل الدخول...' : 'تسجيل الدخول'}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @media (min-width: 900px) {
          .login-grid {
            grid-template-columns: 1fr 1fr !important;
            max-width: 960px !important;
            gap: 32px !important;
          }
        }
      `}</style>
    </div>
  )
}

const styles = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #e8e0f5 0%, #f0f0f8 50%, #f5f5f7 100%)',
    position: 'relative',
    overflow: 'hidden',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    padding: '24px',
  },
  backgroundShapes: {
    position: 'absolute',
    inset: 0,
    overflow: 'hidden',
  },
  shape: {
    position: 'absolute',
    borderRadius: '50%',
    filter: 'blur(80px)',
    opacity: 0.1,
  },
  shape1: {
    width: '400px',
    height: '400px',
    background: '#7c3aed',
    top: '-10%',
    right: '-5%',
  },
  shape2: {
    width: '350px',
    height: '350px',
    background: '#3b82f6',
    bottom: '-8%',
    left: '-5%',
  },
  shape3: {
    width: '250px',
    height: '250px',
    background: '#ec4899',
    top: '40%',
    left: '60%',
  },
  grid: {
    position: 'relative',
    display: 'grid',
    gridTemplateColumns: '1fr',
    gap: '24px',
    width: '100%',
    maxWidth: '500px',
    alignItems: 'stretch',
  },
  col: {
    display: 'flex',
  },

  // --- QR Card ---
  qrCard: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    background: 'rgba(255,255,255,0.80)',
    backdropFilter: 'blur(24px) saturate(180%)',
    WebkitBackdropFilter: 'blur(24px) saturate(180%)',
    borderRadius: '24px',
    border: '1px solid rgba(255,255,255,0.4)',
    boxShadow: '0 32px 72px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.8)',
    padding: '40px 32px 28px',
  },
  qrBody: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrIcon: {
    width: '52px',
    height: '52px',
    borderRadius: '16px',
    background: 'rgba(124,58,237,0.1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '18px',
  },
  qrTitle: {
    fontSize: '19px',
    fontWeight: 700,
    color: '#1d1d1f',
    textAlign: 'center',
    lineHeight: 1.4,
    marginBottom: '8px',
  },
  qrSub: {
    fontSize: '13px',
    color: '#6e6e73',
    textAlign: 'center',
    marginBottom: '28px',
    maxWidth: '240px',
    lineHeight: 1.5,
  },
  qrFrame: {
    position: 'relative',
    padding: '12px',
    background: '#ffffff',
    borderRadius: '24px',
    border: '1px solid rgba(0,0,0,0.06)',
    boxShadow: '0 16px 48px rgba(0,0,0,0.06)',
  },
  canvas: {
    display: 'block',
    width: '260px',
    height: '260px',
    maxWidth: '100%',
    maxHeight: '100%',
    borderRadius: '16px',
  },
  qrGlow: {
    position: 'absolute',
    inset: '-4px',
    borderRadius: '28px',
    background: 'linear-gradient(135deg, rgba(124,58,237,0.1), rgba(59,130,246,0.1))',
    filter: 'blur(12px)',
    zIndex: -1,
  },
  qrFooter: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    marginTop: '24px',
    padding: '12px 20px',
    background: 'rgba(0,0,0,0.02)',
    borderRadius: '12px',
    width: '100%',
    justifyContent: 'center',
  },
  qrFooterRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    alignItems: 'center',
  },
  qrFooterDivider: {
    width: '1px',
    height: '28px',
    background: 'rgba(0,0,0,0.06)',
  },
  qrFooterLabel: {
    fontSize: '9px',
    fontWeight: 600,
    color: '#aeaeb2',
    textTransform: 'uppercase',
    letterSpacing: '1px',
  },
  qrFooterValue: {
    fontSize: '12px',
    fontWeight: 500,
    color: '#6e6e73',
  },

  // --- Form Card ---
  card: {
    flex: 1,
    background: 'rgba(255,255,255,0.80)',
    backdropFilter: 'blur(24px) saturate(180%)',
    WebkitBackdropFilter: 'blur(24px) saturate(180%)',
    borderRadius: '24px',
    border: '1px solid rgba(255,255,255,0.4)',
    boxShadow: '0 32px 72px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.8)',
    display: 'flex',
    flexDirection: 'column',
  },
  cardInner: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    padding: '48px 40px 44px',
  },
  header: {
    textAlign: 'center',
    marginBottom: '36px',
  },
  logo: {
    width: '56px',
    height: '56px',
    borderRadius: '16px',
    background: 'linear-gradient(135deg, #7c3aed, #3b82f6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 20px',
    boxShadow: '0 8px 24px rgba(124, 58, 237, 0.25)',
  },
  title: {
    fontSize: '22px',
    fontWeight: 700,
    color: '#1d1d1f',
    letterSpacing: '-0.3px',
    marginBottom: '8px',
  },
  subtitle: {
    fontSize: '15px',
    color: '#6e6e73',
    fontWeight: 400,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  label: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#6e6e73',
    letterSpacing: '0.2px',
  },
  input: {
    width: '100%',
    padding: '14px 16px',
    fontSize: '15px',
    color: '#1d1d1f',
    background: 'rgba(0, 0, 0, 0.03)',
    border: '1px solid rgba(0, 0, 0, 0.08)',
    borderRadius: '12px',
    outline: 'none',
    transition: 'border-color 0.2s, box-shadow 0.2s',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
    direction: 'rtl',
  },
  button: {
    width: '100%',
    padding: '14px',
    fontSize: '15px',
    fontWeight: 600,
    color: '#fff',
    background: 'linear-gradient(135deg, #7c3aed, #3b82f6)',
    border: 'none',
    borderRadius: '12px',
    cursor: 'pointer',
    transition: 'opacity 0.2s, transform 0.1s',
    fontFamily: 'inherit',
    letterSpacing: '0.2px',
    marginTop: '4px',
    boxShadow: '0 4px 16px rgba(124, 58, 237, 0.25)',
  },
  error: {
    fontSize: '13px',
    color: '#dc2626',
    textAlign: 'center',
    padding: '10px 14px',
    background: 'rgba(220, 38, 38, 0.06)',
    borderRadius: '10px',
    border: '1px solid rgba(220, 38, 38, 0.15)',
  },
}
