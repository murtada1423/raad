'use client'

import { useEffect, useRef, useState } from 'react'

export default function KioskPage() {
  const [qrDataUrl, setQrDataUrl] = useState('')
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
        width: 420,
        margin: 1,
        scale: 8,
        color: { dark: '#1d1d1f', light: '#ffffff' },
      }).then(() => {
        if (mounted) {
          setPayload({ token, timestamp })
          setQrDataUrl(json)
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

  return (
    <div style={styles.container}>
      <div style={styles.orb1} />
      <div style={styles.orb2} />

      <div style={styles.content}>
        <div style={styles.badge}>نظام الحضور</div>

        <h1 style={styles.title}>تسجيل حضور الموظفين</h1>
        <p style={styles.subtitle}>امسح رمز QR أدناه باستخدام تطبيق الموظف لتسجيل الحضور</p>

        <div style={styles.qrFrame}>
          <canvas ref={canvasRef} style={styles.canvas} />
          <div style={styles.qrGlow} />
        </div>

        <div style={styles.footer}>
          <div style={styles.footerRow}>
            <span style={styles.footerLabel}>الرمز</span>
            <span dir="ltr" style={styles.footerValue}>{payload.token.slice(0, 8)}...</span>
          </div>
          <div style={styles.footerRow}>
            <span style={styles.footerLabel}>التوليد</span>
            <span dir="ltr" style={styles.footerValue}>{new Date(payload.timestamp).toLocaleTimeString('en-US')}</span>
          </div>
          <div style={styles.footerRow}>
            <span style={styles.footerLabel}>التحديث</span>
            <span dir="ltr" style={styles.footerValue}>كل 30 ثانية</span>
          </div>
          <div style={styles.footerRow}>
            <span style={styles.footerLabel}>العد التنازلي</span>
            <span dir="ltr" style={{ ...styles.footerValue, color: countdown <= 5 ? '#ff453a' : '#1d1d1f', fontWeight: 700, fontSize: 18 }}>{countdown} ث</span>
          </div>
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
    width: '600px',
    height: '600px',
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(124,58,237,0.08) 0%, transparent 70%)',
    top: '-150px',
    right: '-100px',
    pointerEvents: 'none',
  },
  orb2: {
    position: 'absolute',
    width: '500px',
    height: '500px',
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(59,130,246,0.06) 0%, transparent 70%)',
    bottom: '-100px',
    left: '-80px',
    pointerEvents: 'none',
  },

  content: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    zIndex: 1,
  },
  badge: {
    display: 'inline-block',
    padding: '6px 16px',
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '2px',
    color: '#6e6e73',
    border: '1px solid rgba(0,0,0,0.08)',
    borderRadius: '100px',
    marginBottom: '24px',
  },
  title: {
    fontSize: 'clamp(32px, 5vw, 52px)',
    fontWeight: 700,
    color: '#1d1d1f',
    letterSpacing: '-0.5px',
    marginBottom: '12px',
  },
  subtitle: {
    fontSize: '15px',
    color: '#6e6e73',
    maxWidth: '420px',
    lineHeight: '1.6',
    marginBottom: '48px',
  },

  qrFrame: {
    position: 'relative',
    padding: '16px',
    background: '#ffffff',
    borderRadius: '32px',
    border: '1px solid rgba(0,0,0,0.06)',
    boxShadow: '0 32px 80px rgba(0,0,0,0.08)',
    marginBottom: '48px',
  },
  canvas: {
    display: 'block',
    width: '420px',
    height: '420px',
    maxWidth: '80vw',
    maxHeight: '80vw',
    borderRadius: '20px',
  },
  qrGlow: {
    position: 'absolute',
    inset: '-4px',
    borderRadius: '36px',
    background: 'linear-gradient(135deg, rgba(124,58,237,0.1), rgba(59,130,246,0.1))',
    filter: 'blur(16px)',
    zIndex: -1,
  },

  footer: {
    display: 'flex',
    gap: '40px',
    padding: '20px 32px',
    background: 'rgba(255,255,255,0.7)',
    backdropFilter: 'blur(16px)',
    borderRadius: '16px',
    border: '1px solid rgba(0,0,0,0.06)',
  },
  footerRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    alignItems: 'center',
  },
  footerLabel: {
    fontSize: '10px',
    fontWeight: 600,
    color: '#aeaeb2',
    textTransform: 'uppercase',
    letterSpacing: '1px',
  },
  footerValue: {
    fontSize: '13px',
    fontWeight: 500,
    color: '#6e6e73',
  },

  watermark: {
    position: 'fixed',
    bottom: '24px',
    fontSize: '11px',
    color: '#aeaeb2',
    letterSpacing: '1px',
  },
}
