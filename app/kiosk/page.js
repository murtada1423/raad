'use client'

import { useEffect, useRef, useState } from 'react'

export default function KioskPage() {
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [payload, setPayload] = useState({ token: '', timestamp: '' })
  const [code, setCode] = useState('')
  const [countdown, setCountdown] = useState(30)
  const canvasRef = useRef(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    let timeoutId

    async function generate() {
      try {
        const res = await fetch('/api/kiosk-code', { method: 'POST' })
        const data = await res.json()
        if (!mounted || !data.token) return

        const json = JSON.stringify({ token: data.token, timestamp: data.timestamp })

        const QRCode = (await import('qrcode')).default
        if (!mounted) return

        QRCode.toCanvas(canvasRef.current, json, {
          width: 420,
          margin: 1,
          scale: 8,
          color: { dark: '#1d1d1f', light: '#ffffff' },
        }).then(() => {
          if (mounted) {
            setPayload({ token: data.token, timestamp: data.timestamp })
            setQrDataUrl(json)
            setCode(data.code)
            setLoading(false)
          }
        })
      } catch {
        // Retry on next interval
      }
    }

    generate()
    timeoutId = setInterval(generate, 30000)
    return () => { mounted = false; clearInterval(timeoutId) }
  }, [])

  useEffect(() => {
    setCountdown(30)
  }, [payload])

  useEffect(() => {
    const id = setInterval(() => {
      setCountdown((c) => Math.max(0, c - 1))
    }, 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <div style={styles.container}>
      <div style={styles.orb1} />
      <div style={styles.orb2} />

      <div style={styles.content}>
        <div style={styles.badge}>نظام الحضور</div>

        <h1 style={styles.title}>تسجيل حضور الموظفين</h1>
        <p style={styles.subtitle}>امسح رمز QR أو أدخل الرمز الظاهر باستخدام تطبيق الموظف</p>

        {/* QR + Code side by side */}
        <div style={styles.splitSection}>
          {/* Code Display (left) */}
          <div style={styles.codeSection}>
            <span style={styles.codeLabel}>أدخل الرمز</span>
            <span dir="ltr" style={styles.codeValue}>{code || 'جاري التحميل...'}</span>
          </div>

          {/* QR Code (right) */}
          <div style={styles.qrFrame}>
            <canvas ref={canvasRef} style={styles.canvas} />
            <div style={styles.qrGlow} />
          </div>
        </div>

        {/* Countdown centered at bottom */}
        <div style={styles.footer}>
          <span style={styles.footerLabel}>تحديث خلال</span>
          <span dir="ltr" style={{ ...styles.countdownNum, color: countdown <= 5 ? '#ff453a' : '#1d1d1f' }}>{countdown}</span>
          <span style={styles.footerLabel}>ثانية</span>
        </div>
      </div>

      <div style={styles.watermark}>نظام الحضور والرواتب</div>
    </div>
  )
}

const styles = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'radial-gradient(ellipse at 30% 20%, #e8e0f5 0%, #f5f5f7 60%)',
    fontFamily: 'var(--font-sans)',
    position: 'relative',
    overflow: 'hidden',
    padding: '24px',
  },
  orb1: {
    position: 'absolute',
    width: '600px', height: '600px', borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(124,58,237,0.08) 0%, transparent 70%)',
    top: '-150px', right: '-100px', pointerEvents: 'none',
  },
  orb2: {
    position: 'absolute',
    width: '500px', height: '500px', borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(59,130,246,0.06) 0%, transparent 70%)',
    bottom: '-100px', left: '-80px', pointerEvents: 'none',
  },
  content: {
    position: 'relative', display: 'flex', flexDirection: 'column',
    alignItems: 'center', textAlign: 'center', zIndex: 1,
  },
  badge: {
    display: 'inline-block', padding: '6px 16px', fontSize: '11px',
    fontWeight: 700, letterSpacing: '2px', color: '#6e6e73',
    border: '1px solid rgba(0,0,0,0.08)', borderRadius: '100px',
    marginBottom: '24px',
  },
  title: {
    fontSize: 'clamp(32px, 5vw, 52px)', fontWeight: 700, color: '#1d1d1f',
    letterSpacing: '-0.5px', marginBottom: '12px',
  },
  subtitle: {
    fontSize: '15px', color: '#6e6e73', maxWidth: '480px',
    lineHeight: '1.6', marginBottom: '36px',
  },
  splitSection: {
    display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '48px',
    marginBottom: '48px', flexWrap: 'wrap', justifyContent: 'center',
  },
  qrFrame: {
    position: 'relative', padding: '12px', background: '#ffffff',
    borderRadius: '28px', border: '1px solid rgba(0,0,0,0.06)',
    boxShadow: '0 32px 80px rgba(0,0,0,0.08)',
  },
  canvas: {
    display: 'block', width: '340px', height: '340px',
    maxWidth: '60vw', maxHeight: '60vw', borderRadius: '18px',
  },
  qrGlow: {
    position: 'absolute', inset: '-4px', borderRadius: '32px',
    background: 'linear-gradient(135deg, rgba(124,58,237,0.1), rgba(59,130,246,0.1))',
    filter: 'blur(16px)', zIndex: -1,
  },
  codeSection: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px',
    padding: '40px 64px', background: 'rgba(255,255,255,0.85)',
    backdropFilter: 'blur(16px)', borderRadius: '24px',
    border: '1px solid rgba(0,0,0,0.06)',
    minWidth: '280px',
  },
  codeLabel: {
    fontSize: '14px', fontWeight: 600, color: '#aeaeb2',
    letterSpacing: '1px',
  },
  codeValue: {
    fontSize: 'clamp(48px, 8vw, 72px)', fontWeight: 800,
    color: '#1d1d1f', letterSpacing: '16px',
  },
  footer: {
    display: 'flex', alignItems: 'center', gap: '12px',
    padding: '14px 32px',
    background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(16px)',
    borderRadius: '100px', border: '1px solid rgba(0,0,0,0.06)',
  },
  footerLabel: {
    fontSize: '13px', fontWeight: 600, color: '#aeaeb2',
  },
  countdownNum: {
    fontSize: '28px', fontWeight: 800, color: '#1d1d1f',
  },
  watermark: {
    position: 'fixed', bottom: '24px', fontSize: '11px', color: '#aeaeb2', letterSpacing: '1px',
  },
}
