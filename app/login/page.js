'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

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
    fontFamily: 'var(--font-sans)',
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
  card: {
    position: 'relative',
    width: '100%',
    maxWidth: '420px',
    margin: '0 16px',
    background: 'rgba(255, 255, 255, 0.75)',
    backdropFilter: 'blur(24px) saturate(180%)',
    WebkitBackdropFilter: 'blur(24px) saturate(180%)',
    borderRadius: '24px',
    border: '1px solid rgba(255, 255, 255, 0.4)',
    boxShadow: '0 32px 72px rgba(0, 0, 0, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.8)',
  },
  cardInner: {
    padding: '48px 40px 40px',
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
