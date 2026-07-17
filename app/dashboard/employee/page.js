'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

function Toast({ type, message, onClose }) {
  useEffect(() => {
    if (!message) return
    const t = setTimeout(onClose, 4000)
    return () => clearTimeout(t)
  }, [message, onClose])

  if (!message) return null

  const isSuccess = type === 'success'

  return (
    <div style={{
      position: 'fixed', top: 24, right: 24, zIndex: 9999,
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '14px 20px',
      background: isSuccess ? 'rgba(52,199,89,0.1)' : 'rgba(255,69,58,0.1)',
      border: `1px solid ${isSuccess ? 'rgba(52,199,89,0.2)' : 'rgba(255,69,58,0.2)'}`,
      borderRadius: 14,
      backdropFilter: 'blur(16px)',
      boxShadow: '0 8px 32px rgba(0,0,0,0.08)',
      animation: 'slideIn 0.3s ease-out',
      maxWidth: 400,
    }}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={isSuccess ? '#34c759' : '#ff453a'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {isSuccess ? (
          <path d="M20 6L9 17l-5-5" />
        ) : (
          <>
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </>
        )}
      </svg>
      <span style={{ fontSize: 14, fontWeight: 500, color: isSuccess ? '#34c759' : '#ff453a' }}>
        {message}
      </span>
    </div>
  )
}

export default function EmployeeDashboard() {
  const [profile, setProfile] = useState(null)
  const [attendance, setAttendance] = useState(null)
  const [history, setHistory] = useState([])
  const [monthAdvance, setMonthAdvance] = useState(0)
  const [loading, setLoading] = useState(true)
  const [showScanner, setShowScanner] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [toast, setToast] = useState({ type: '', message: '' })
  const [cameraError, setCameraError] = useState('')
  const [viewMonth, setViewMonth] = useState(new Date().getMonth() + 1)
  const [viewYear, setViewYear] = useState(new Date().getFullYear())
  const [monthRecords, setMonthRecords] = useState([])
  // Audit trail
  const [auditEntries, setAuditEntries] = useState({})
  const [auditModalRecord, setAuditModalRecord] = useState(null)
  const [employeeAuditLog, setEmployeeAuditLog] = useState([])
  const [auditLogLoading, setAuditLogLoading] = useState(false)

  const router = useRouter()
  const supabase = createClient()
  const scannerRef = useRef(null)
  const scannerInstanceRef = useRef(null)

  const showToast = useCallback((type, message) => {
    setToast({ type, message })
  }, [])

  const closeToast = useCallback(() => {
    setToast({ type: '', message: '' })
  }, [])

  const getEffectiveDate = () => {
    const d = new Date()
    if (d.getUTCHours() < 4) d.setUTCDate(d.getUTCDate() - 1)
    return d.toISOString().slice(0, 10)
  }

  async function loadData(userId) {
    const today = await supabase
      .from('attendance')
      .select('*')
      .eq('employee_id', userId)
      .eq('date', getEffectiveDate())
      .order('check_in', { ascending: false })
      .limit(1)

    if (today.data) setAttendance(today.data[0] || null)

    const ms = String(viewMonth).padStart(2, '0')
    const prefix = `${viewYear}-${ms}`
    const monthStart = `${prefix}-01`
    const totalDays = new Date(viewYear, viewMonth, 0).getDate()
    const monthEnd = `${prefix}-${String(totalDays).padStart(2, '0')}`

    const hist = await supabase
      .from('attendance')
      .select('*')
      .eq('employee_id', userId)
      .gte('date', monthStart)
      .lte('date', monthEnd)
      .order('date', { ascending: false })
      .order('check_in', { ascending: false })

    if (hist.data) {
      const seen = new Set()
      const deduped = hist.data.filter((r) => {
        if (seen.has(r.date)) return false
        seen.add(r.date)
        return true
      })
      setMonthRecords(hist.data)
      setHistory(deduped)
    }

    // Load audit entries for the employee's records in this month
    const { data: auditData } = await supabase
      .from('audit_log')
      .select('*')
      .eq('employee_id', userId)
      .gte('created_at', monthStart)
      .order('created_at', { ascending: false })
    const auditMap = {}
    ;(auditData || []).forEach((entry) => {
      const rid = entry.record_id
      if (rid) {
        if (!auditMap[rid]) auditMap[rid] = []
        auditMap[rid].push(entry)
      }
    })
    setAuditEntries(auditMap)

    // Load monthly advance
    const { data: advData } = await supabase
      .from('employee_advances')
      .select('amount')
      .eq('employee_id', userId)
      .eq('month', viewMonth)
      .eq('year', viewYear)
      .maybeSingle()
    setMonthAdvance(advData?.amount || 0)
  }

  async function loadEmployeeAuditLog(userId) {
    setAuditLogLoading(true)
    const { data } = await supabase
      .from('audit_log')
      .select('*')
      .eq('employee_id', userId)
      .order('created_at', { ascending: false })
      .limit(100)
    setEmployeeAuditLog(data || [])
    setAuditLogLoading(false)
  }

  const formatHours = (decimalHours) => {
    if (decimalHours == null || isNaN(decimalHours)) return '—'
    const totalMinutes = Math.round(decimalHours * 60)
    const h = Math.floor(totalMinutes / 60)
    const m = totalMinutes % 60
    if (h === 0) return `${m} دقيقة`
    if (m === 0) return `${h} ساعة`
    return `${h} ساعة و ${m} دقيقة`
  }

  const formatDate = (d) => {
    if (!d) return '—'
    const dt = new Date(d)
    const day = String(dt.getDate()).padStart(2, '0')
    const month = String(dt.getMonth() + 1).padStart(2, '0')
    const year = dt.getFullYear()
    return `${day}-${month}-${year}`
  }

  const formatTime = (d) => {
    if (!d) return '—'
    const dt = new Date(d)
    let h = dt.getHours()
    const m = String(dt.getMinutes()).padStart(2, '0')
    const ampm = h < 12 ? 'صباحاً' : 'مساءاً'
    h = h % 12 || 12
    return `${h}:${m} ${ampm}`
  }

  useEffect(() => {
    let mounted = true
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: p, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      if (error) {
        router.push('/login?error=noprofile')
        return
      }
      if (p?.role !== 'employee') {
        router.push('/dashboard/admin')
        return
      }

      if (!mounted) return
      setProfile(p)
      await loadData(p.id)
      loadEmployeeAuditLog(p.id)
      setLoading(false)
    }
    init()
    return () => { mounted = false }
  }, [])

  // Reload monthly data when year/month filter changes
  useEffect(() => {
    if (profile) loadData(profile.id)
  }, [viewMonth, viewYear, profile])

  // Periodic polling fallback (every 30s) to keep data fresh
  useEffect(() => {
    if (!profile) return
    const id = setInterval(() => { loadData(profile.id) }, 30000)
    return () => clearInterval(id)
  }, [profile])

  // Initialize scanner when modal opens
  useEffect(() => {
    if (!showScanner) return

    let cancelled = false

    async function startScanner() {
      try {
        const { Html5Qrcode } = await import('html5-qrcode')

        if (cancelled) return

        const el = document.getElementById('qr-scanner-container')
        if (!el) return

        const scanner = new Html5Qrcode('qr-scanner-container')
        scannerInstanceRef.current = scanner

        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 260, height: 260 } },
          async (decodedText) => {
            if (cancelled || scanning) return
            setScanning(true)
            await scanner.stop()
            scannerInstanceRef.current = null
            handleScanResult(decodedText)
          },
          () => {}
        )
      } catch (err) {
        if (!cancelled) {
          setCameraError('الوصول إلى الكاميرا مرفوض أو غير متاح')
        }
      }
    }

    setCameraError('')
    setScanning(false)
    const t = setTimeout(startScanner, 100)
    return () => {
      cancelled = true
      clearTimeout(t)
      if (scannerInstanceRef.current) {
        scannerInstanceRef.current.stop().catch(() => {})
        scannerInstanceRef.current = null
      }
    }
  }, [showScanner])

  async function handleScanResult(decodedText) {
    let parsed
    try {
      parsed = JSON.parse(decodedText)
    } catch {
      showToast('error', 'تنسيق رمز QR غير صالح')
      setShowScanner(false)
      setScanning(false)
      return
    }

    if (!parsed.timestamp) {
      showToast('error', 'بيانات رمز QR غير صالحة')
      setShowScanner(false)
      setScanning(false)
      return
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { data, error } = await supabase.rpc('process_attendance_scan', {
          p_user_id: profile.id,
          p_lat: position.coords.latitude,
          p_lng: position.coords.longitude,
          p_qr_timestamp: parsed.timestamp,
        })

        setScanning(false)
        setShowScanner(false)

        if (error) {
          showToast('error', error.message)
          return
        }

        if (data?.success) {
          showToast('success', data.action === 'check_out' ? 'تم تسجيل الخروج — تم تسجيل الحضور!' : 'تم تسجيل الدخول — تم تسجيل الحضور!')
          await loadData(profile.id)
        } else {
          const msg = data?.error === 'Outside geofence — you must be at the office'
            ? 'خارج نطاق المكتب'
            : data?.error === 'QR code expired or invalid timestamp'
              ? 'رمز QR منتهي الصلاحية'
              : data?.error || 'فشل المسح'
          showToast('error', msg)
        }
      },
      () => {
        showToast('error', 'الوصول إلى GPS مطلوب لتسجيل الحضور')
        setShowScanner(false)
        setScanning(false)
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
    )
  }

  function handleSignOut() {
    supabase.auth.signOut()
    router.push('/login')
  }

  const totalDaysInMonth = new Date(viewYear, viewMonth, 0).getDate()
  const monthlySalary = profile?.monthly_salary || 0
  const reqHours = profile?.required_hours || 8
  const dynamicDailyRate = monthlySalary / totalDaysInMonth
  const dailyRate = Math.round(dynamicDailyRate)

  const computeRowPay = (totalHours) => {
    if (totalHours == null || totalHours <= 0) return { deduction: 0, addition: 0 }
    const totalWorkedMinutes = Math.round(totalHours * 60)
    const requiredMinutes = reqHours * 60
    const minuteRate = dynamicDailyRate / requiredMinutes
    const netDiff = totalWorkedMinutes - requiredMinutes
    return {
      deduction: netDiff < 0 ? Math.round(Math.abs(netDiff) * minuteRate) : 0,
      addition: netDiff > 0 ? Math.round(netDiff * minuteRate) : 0,
    }
  }

  const hasAttendance = !!(attendance?.check_in)

  let hoursWorked = 0
  let todayAddition = 0
  let todayDeduction = 0
  let netEarned = 0
  let todayStatus = 'no record'

  if (hasAttendance) {
    hoursWorked = attendance.total_hours || 0
    const { deduction, addition } = computeRowPay(hoursWorked)
    todayDeduction = deduction
    todayAddition = addition
    netEarned = Math.max(0, Math.round(dynamicDailyRate) + todayAddition - todayDeduction)
    todayStatus = attendance.check_out ? 'Completed' : 'Checked In'
  }

  const iqd = (value) =>
    new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value) + ' د.ع'

  const presentMonthRecords = monthRecords.filter((r) => r.status !== 'absent' && r.check_out !== null)
  const attendanceDays = presentMonthRecords.length
  const absenceDays = totalDaysInMonth - attendanceDays

  let totalAdditions = 0
  let totalDeductions = 0
  for (const r of presentMonthRecords) {
    const { deduction, addition } = computeRowPay(r.total_hours)
    totalAdditions += addition
    totalDeductions += deduction
  }
  const netPayable = attendanceDays === 0
    ? 0
    : Math.max(0, Math.round(dynamicDailyRate * attendanceDays) + totalAdditions - totalDeductions)

  if (loading) {
    return (
      <div style={styles.wrapper}>
        <div style={styles.loading}>
          <div style={styles.spinner} />
        </div>
      </div>
    )
  }

  return (
    <div style={styles.wrapper}>
      <Toast type={toast.type} message={toast.message} onClose={closeToast} />

      <div style={styles.container}>
        <header style={styles.header}>
          <div>
            <h1 style={styles.greeting}>{profile?.full_name}</h1>
            <p style={styles.role}>موظف</p>
          </div>
          <div style={styles.headerActions}>
            <button style={styles.scanBtn} onClick={() => setShowScanner(true)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 7V5a2 2 0 0 1 2-2h2" /><path d="M17 3h2a2 2 0 0 1 2 2v2" />
                <path d="M21 17v2a2 2 0 0 1-2 2h-2" /><path d="M7 21H5a2 2 0 0 1-2-2v-2" />
                <line x1="7" y1="12" x2="17" y2="12" />
              </svg>
              تسجيل الحضور
            </button>
            <button style={styles.signOutRed} onClick={handleSignOut}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              تسجيل الخروج
            </button>
          </div>
        </header>

        {/* Status Banner */}
        <div style={{
          ...styles.statusBanner,
          background: todayStatus === 'Completed' ? 'rgba(52,199,89,0.06)' : todayStatus === 'Checked In' ? 'rgba(255,204,0,0.06)' : 'rgba(142,142,147,0.04)',
          borderColor: todayStatus === 'Completed' ? 'rgba(52,199,89,0.15)' : todayStatus === 'Checked In' ? 'rgba(255,204,0,0.15)' : 'rgba(142,142,147,0.08)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 8, height: 8, borderRadius: '50%',
              background: todayStatus === 'Completed' ? '#34c759' : todayStatus === 'Checked In' ? '#ffcc00' : '#8e8e93',
              flexShrink: 0,
            }} />
            <span style={{ fontSize: 14, fontWeight: 600, color: todayStatus === 'Completed' ? '#34c759' : todayStatus === 'Checked In' ? '#b8860b' : '#8e8e93' }}>
              {todayStatus === 'no record' ? 'لا يوجد سجل حضور لليوم' : todayStatus === 'Completed' ? 'مكتمل' : todayStatus === 'Checked In' ? 'تم تسجيل الدخول' : todayStatus}
            </span>
          </div>
          {todayStatus !== 'no record' && (
            <span style={{ fontSize: 13, color: '#6e6e73' }} dir="ltr">
              {new Date(attendance.check_in).toLocaleTimeString('en-US')}
              {attendance.check_out ? ` — ${new Date(attendance.check_out).toLocaleTimeString('en-US')}` : ''}
            </span>
          )}
          {todayStatus === 'no record' && (
            <span style={{ fontSize: 13, color: '#aeaeb2' }}>
              امسح رمز QR في كشك المكتب
            </span>
          )}
        </div>

        {/* Stats Cards */}
        <div style={styles.statsGrid}>
          <div style={styles.statCard}>
            <p style={styles.statLabel}>ساعات العمل</p>
            <p style={styles.statValue}>{hasAttendance ? formatHours(hoursWorked) : '—'}</p>
          </div>
          <div style={styles.statCard}>
            <p style={styles.statLabel}>المكتسب اليوم</p>
            <p style={styles.statValue}>
              {hasAttendance
                ? <span dir="ltr">{new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(netEarned)} د.ع</span>
                : '—'}
            </p>
          </div>
          <div style={styles.statCard}>
            <p style={styles.statLabel}>الإضافي</p>
            <p style={{ ...styles.statValue, color: todayAddition > 0 ? '#34c759' : '#aeaeb2' }}>
              {hasAttendance ? <span dir="ltr">{iqd(todayAddition)}</span> : '—'}
            </p>
          </div>
          <div style={styles.statCard}>
            <p style={styles.statLabel}>الخصومات</p>
            <p style={{ ...styles.statValue, color: todayDeduction > 0 ? '#ff453a' : '#aeaeb2' }}>
              {hasAttendance ? <span dir="ltr">{iqd(todayDeduction)}</span> : '—'}
            </p>
          </div>
        </div>

        {/* Month / Year Filters */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          <select value={viewMonth} onChange={(e) => setViewMonth(Number(e.target.value))} style={{
            padding: '10px 14px', fontSize: 14, fontWeight: 600,
            color: '#1d1d1f', background: '#ffffff',
            border: '1px solid rgba(0,0,0,0.08)', borderRadius: 10,
            outline: 'none', fontFamily: 'inherit', cursor: 'pointer', flex: 1,
          }}>
            {[1,2,3,4,5,6,7,8,9,10,11,12].map((m) => (
              <option key={m} value={m}>{String(m).padStart(2, '0')}</option>
            ))}
          </select>
          <select value={viewYear} onChange={(e) => setViewYear(Number(e.target.value))} style={{
            padding: '10px 14px', fontSize: 14, fontWeight: 600,
            color: '#1d1d1f', background: '#ffffff',
            border: '1px solid rgba(0,0,0,0.08)', borderRadius: 10,
            outline: 'none', fontFamily: 'inherit', cursor: 'pointer', flex: 1,
          }}>
            {[2026, 2027, 2028, 2029, 2030].map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>

        {/* Pay Info */}
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>ملخص الراتب — {String(viewMonth).padStart(2, '0')}/{viewYear}</h2>
          <div style={styles.payRows}>
            <div style={styles.payRow}>
              <span style={styles.payLabel}>الراتب الشهري</span>
              <span style={styles.payValue}>
                <span dir="ltr">{iqd(monthlySalary)}</span>
              </span>
            </div>
            <div style={styles.payRow}>
              <span style={styles.payLabel}>السعر اليومي</span>
              <span style={styles.payValue}>
                <span dir="ltr">{iqd(dailyRate)}</span>
              </span>
            </div>
            <div style={styles.payRow}>
              <span style={styles.payLabel}>أيام الحضور</span>
              <span style={{ ...styles.payValue, color: '#34c759' }}>{attendanceDays}</span>
            </div>
            <div style={styles.payRow}>
              <span style={styles.payLabel}>أيام الغياب</span>
              <span style={{ ...styles.payValue, color: '#ff453a' }}>{absenceDays}</span>
            </div>
            <div style={styles.payRow}>
              <span style={styles.payLabel}>الإضافي</span>
              <span style={{ ...styles.payValue, color: '#34c759' }}>{iqd(totalAdditions)}</span>
            </div>
            <div style={styles.payRow}>
              <span style={styles.payLabel}>خصم التأخير</span>
              <span style={{ ...styles.payValue, color: '#ff453a' }}>{iqd(totalDeductions)}</span>
            </div>
            <div style={styles.payRow}>
              <span style={styles.payLabel}>السلفة</span>
              <span style={{ ...styles.payValue, color: monthAdvance > 0 ? '#ff453a' : '#aeaeb2' }}>
                {monthAdvance > 0 ? iqd(monthAdvance) : '—'}
              </span>
            </div>
            <div style={{ ...styles.payRow, borderTop: '1px solid rgba(0,0,0,0.06)', paddingTop: 12, marginTop: 4 }}>
              <span style={{ ...styles.payLabel, fontWeight: 700, fontSize: 15, color: '#7c3aed' }}>صافي الراتب للشهر المحدد</span>
              <span style={{ ...styles.payValue, fontWeight: 700, fontSize: 16, color: '#7c3aed' }}>
                <span dir="ltr">{iqd(Math.max(0, netPayable - monthAdvance))}</span>
              </span>
            </div>
          </div>
        </div>

        {/* History */}
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>آخر سجل الحضور</h2>
          {history.length === 0 ? (
            <div style={styles.emptyState}>
              <p>لا توجد سجلات حضور بعد.</p>
            </div>
          ) : (
            <div style={styles.table}>
              <div style={styles.tableHeader}>
                <span style={styles.th}>التاريخ</span>
                <span style={styles.th}>دخول</span>
                <span style={styles.th}>خروج</span>
                <span style={styles.th}>ساعات</span>
                <span style={styles.th}>الحالة</span>
                <span style={{ ...styles.th, textAlign: 'center', width: 36 }}></span>
              </div>
              {history.map((r) => {
                const hasAudit = auditEntries[r.id]?.length > 0
                const noCheckOut = !r.check_out
                return (
                  <div key={r.id} style={{
                    ...styles.tableRow,
                    borderLeft: hasAudit ? '3px solid #ff9f0a' : '3px solid transparent',
                  }}>
                    <span style={styles.td}><span dir="ltr">{formatDate(r.date)}</span></span>
                    <span style={styles.td}><span dir="ltr">{new Date(r.check_in).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span></span>
                    <span style={styles.td}>{r.check_out ? <span dir="ltr">{new Date(r.check_out).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span> : '—'}</span>
                    <span style={styles.td}>{r.total_hours ? formatHours(r.total_hours) : '—'}</span>
                    {noCheckOut ? (
                      <span style={{ ...styles.td, fontWeight: 600, color: '#cc9a00' }}>
                        لم يسجل خروج
                      </span>
                    ) : (
                      <span style={{
                        ...styles.td, fontWeight: 600,
                        color: r.status === 'present' ? '#34c759' : r.status === 'late' ? '#b8860b' : '#ff453a',
                      }}>
                        {r.status === 'present' ? 'حاضر' : r.status === 'late' ? 'متأخر' : 'مغادرة مبكرة'}
                      </span>
                    )}
                    <span style={{ textAlign: 'center' }}>
                      {hasAudit && (
                        <button style={styles.auditBtn} onClick={() => setAuditModalRecord(r.id)} title="عرض تفاصيل التعديل">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ff9f0a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                          </svg>
                        </button>
                      )}
                    </span>
                  </div>
                  )
                })}
            </div>
          )}
        </div>

        {/* Audit Log Section */}
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>سجل التعديلات على حسابي</h2>
          {auditLogLoading ? (
            <div style={styles.emptyState}><p>جاري التحميل...</p></div>
          ) : employeeAuditLog.length === 0 ? (
            <div style={styles.emptyState}><p>لا توجد تعديلات على سجلاتك.</p></div>
          ) : (
            <div style={styles.table}>
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 0.6fr 1fr 1.2fr', gap: 8,
                padding: '10px 0', borderBottom: '1px solid rgba(0,0,0,0.06)', marginBottom: 4,
              }}>
                <span style={styles.th}>التاريخ</span>
                <span style={styles.th}>الإجراء</span>
                <span style={styles.th}>بواسطة</span>
                <span style={styles.th}>السبب</span>
              </div>
              {employeeAuditLog.map((entry) => {
                const actionLabels = { created: 'إضافة', updated: 'تعديل', deleted: 'حذف' }
                const actionColors = { created: '#34c759', updated: '#ff9f0a', deleted: '#ff453a' }
                const dateStr = formatDate(entry.created_at)
                const timeStr = new Date(entry.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
                return (
                  <div key={entry.id} style={{
                    display: 'grid', gridTemplateColumns: '1fr 0.6fr 1fr 1.2fr', gap: 8,
                    padding: '10px 0', borderBottom: '1px solid rgba(0,0,0,0.04)', alignItems: 'center',
                    cursor: 'pointer',
                  }} onClick={() => setAuditModalRecord(entry.record_id)}>
                    <span style={styles.td}><span dir="ltr" style={{ fontSize: 12 }}>{dateStr} {timeStr}</span></span>
                    <span>
                      <span style={{
                        display: 'inline-block', padding: '2px 8px', borderRadius: 6,
                        fontSize: 11, fontWeight: 600, fontFamily: 'inherit',
                        background: `${actionColors[entry.action]}15`,
                        color: actionColors[entry.action],
                      }}>
                        {actionLabels[entry.action] || entry.action}
                      </span>
                    </span>
                    <span style={styles.td}>المدير</span>
                    <span style={{ ...styles.td, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {entry.reason || '—'}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Audit Detail Modal */}
      {auditModalRecord && (() => {
        const entries = auditEntries[auditModalRecord] || []
        if (entries.length === 0) return null
        const latest = entries[0]
        const actionLabels = { created: 'إضافة', updated: 'تعديل', deleted: 'حذف' }
        const actionColors = { created: '#34c759', updated: '#ff9f0a', deleted: '#ff453a' }
        return (
          <div style={styles.overlay} onClick={() => setAuditModalRecord(null)}>
            <div style={{ ...styles.modal, maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
              <button style={styles.modalClose} onClick={() => setAuditModalRecord(null)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(0,0,0,0.3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
              <h3 style={styles.modalTitle}>تفاصيل التعديل</h3>
              <p style={styles.modalSub}>
                {entries.length} {entries.length === 1 ? 'تعديل' : 'تعديلات'} على هذا السجل
              </p>
              <div style={{ maxHeight: 350, overflowY: 'auto' }}>
                {entries.map((entry, idx) => {
                  const dateStr = formatDate(entry.created_at)
                  const timeStr = new Date(entry.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
                  const oldCIn = entry.old_data?.check_in ? formatTime(entry.old_data.check_in) : '—'
                  const oldCOut = entry.old_data?.check_out ? formatTime(entry.old_data.check_out) : '—'
                  const newCIn = entry.new_data?.check_in ? formatTime(entry.new_data.check_in) : '—'
                  const newCOut = entry.new_data?.check_out ? formatTime(entry.new_data.check_out) : '—'
                  return (
                    <div key={entry.id || idx} style={{
                      background: idx % 2 === 0 ? 'rgba(0,0,0,0.02)' : 'transparent',
                      borderRadius: 10, padding: '12px 0',
                      borderBottom: '1px solid rgba(0,0,0,0.04)',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <span style={{
                          display: 'inline-block', padding: '2px 10px', borderRadius: 6,
                          fontSize: 11, fontWeight: 600, fontFamily: 'inherit',
                          background: `${actionColors[entry.action]}15`,
                          color: actionColors[entry.action],
                        }}>
                          {actionLabels[entry.action] || entry.action}
                        </span>
                        <span style={{ fontSize: 11, color: '#aeaeb2' }}>
                          {dateStr} {timeStr}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: '#6e6e73', marginBottom: 4 }}>
                        تم بواسطة: <b style={{ color: '#1d1d1f' }}>{entry.changed_by ? 'المدير' : 'المدير'}</b>
                      </div>
                      {entry.action === 'updated' && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 6 }}>
                          <div style={{ background: 'rgba(255,69,58,0.04)', borderRadius: 8, padding: 8 }}>
                            <div style={{ fontSize: 10, color: '#ff453a', fontWeight: 600, marginBottom: 4 }}>القيم القديمة</div>
                            <div style={{ fontSize: 12, color: '#6e6e73' }}>دخول: {oldCIn}</div>
                            <div style={{ fontSize: 12, color: '#6e6e73' }}>خروج: {oldCOut}</div>
                          </div>
                          <div style={{ background: 'rgba(52,199,89,0.04)', borderRadius: 8, padding: 8 }}>
                            <div style={{ fontSize: 10, color: '#34c759', fontWeight: 600, marginBottom: 4 }}>القيم الجديدة</div>
                            <div style={{ fontSize: 12, color: '#6e6e73' }}>دخول: {newCIn}</div>
                            <div style={{ fontSize: 12, color: '#6e6e73' }}>خروج: {newCOut}</div>
                          </div>
                        </div>
                      )}
                      {entry.action === 'created' && (
                        <div style={{ background: 'rgba(52,199,89,0.04)', borderRadius: 8, padding: 8, marginTop: 6 }}>
                          <div style={{ fontSize: 10, color: '#34c759', fontWeight: 600, marginBottom: 4 }}>القيم المضافّة</div>
                          <div style={{ fontSize: 12, color: '#6e6e73' }}>دخول: {newCIn}</div>
                          <div style={{ fontSize: 12, color: '#6e6e73' }}>خروج: {newCOut}</div>
                        </div>
                      )}
                      {entry.action === 'deleted' && (
                        <div style={{ background: 'rgba(255,69,58,0.04)', borderRadius: 8, padding: 8, marginTop: 6 }}>
                          <div style={{ fontSize: 10, color: '#ff453a', fontWeight: 600, marginBottom: 4 }}>القيم المحذوفة</div>
                          <div style={{ fontSize: 12, color: '#6e6e73' }}>دخول: {oldCIn}</div>
                          <div style={{ fontSize: 12, color: '#6e6e73' }}>خروج: {oldCOut}</div>
                        </div>
                      )}
                      {entry.reason && (
                        <div style={{ marginTop: 6, fontSize: 12, color: '#6e6e73' }}>
                          السبب: <span style={{ color: '#1d1d1f' }}>{entry.reason}</span>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )
      })()}



      {/* Scanner Modal */}
      {showScanner && (
        <div style={styles.overlay} onClick={() => setShowScanner(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <button style={styles.modalClose} onClick={() => setShowScanner(false)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(0,0,0,0.3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
            <h3 style={styles.modalTitle}>امسح رمز QR</h3>
            <p style={styles.modalSub}>وجّه الكاميرا إلى رمز QR في كشك المكتب</p>
            <div style={styles.scannerBox}>
              <div id="qr-scanner-container" ref={scannerRef} style={styles.scannerContainer} />
              {cameraError && <p style={styles.cameraError}>{cameraError}</p>}
              {scanning && (
                <div style={styles.scanningOverlay}>
                  <div style={styles.spinner} />
                  <p style={{ color: '#6e6e73', fontSize: 14, marginTop: 12 }}>جاري المعالجة...</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const styles = {
  wrapper: {
    minHeight: '100vh',
    background: '#f5f5f7',
    fontFamily: 'var(--font-sans)',
    color: '#1d1d1f',
  },
  container: {
    maxWidth: '720px',
    margin: '0 auto',
    padding: '40px 24px 80px',
  },
  loading: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
  },
  spinner: {
    width: 28,
    height: 28,
    border: '2px solid rgba(0,0,0,0.06)',
    borderTopColor: 'rgba(0,0,0,0.4)',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 28,
    flexWrap: 'wrap',
    gap: 16,
  },
  greeting: {
    fontSize: 28,
    fontWeight: 700,
    color: '#1d1d1f',
    marginBottom: 4,
  },
  role: {
    fontSize: 14,
    color: '#6e6e73',
    fontWeight: 500,
  },
  headerActions: {
    display: 'flex',
    gap: 10,
    alignItems: 'center',
  },
  scanBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 18px',
    fontSize: 14,
    fontWeight: 600,
    color: '#fff',
    background: 'linear-gradient(135deg, #7c3aed, #3b82f6)',
    border: 'none',
    borderRadius: 10,
    cursor: 'pointer',
    fontFamily: 'inherit',
    boxShadow: '0 4px 16px rgba(124,58,237,0.25)',
  },
  signOutRed: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '10px 16px',
    fontSize: 13,
    fontWeight: 600,
    color: '#ff453a',
    background: 'rgba(255,69,58,0.08)',
    border: '1px solid rgba(255,69,58,0.15)',
    borderRadius: 10,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  statusBanner: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '14px 20px',
    borderRadius: 14,
    border: '1px solid',
    marginBottom: 24,
    flexWrap: 'wrap',
    gap: 8,
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
    background: '#ffffff',
    borderRadius: 14,
    padding: '20px',
    border: '1px solid rgba(0,0,0,0.06)',
    boxShadow: '0 1px 4px rgba(0,0,0,0.02)',
  },
  statLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: '#aeaeb2',
    textTransform: 'uppercase',
    letterSpacing: '0.8px',
    marginBottom: 8,
  },
  statValue: {
    fontSize: 22,
    fontWeight: 700,
    color: '#1d1d1f',
  },
  section: {
    background: '#ffffff',
    borderRadius: 16,
    padding: 28,
    border: '1px solid rgba(0,0,0,0.06)',
    marginBottom: 16,
    boxShadow: '0 1px 4px rgba(0,0,0,0.02)',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 600,
    color: '#1d1d1f',
    marginBottom: 20,
  },
  payRows: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  payRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  payLabel: {
    fontSize: 14,
    color: '#6e6e73',
  },
  payValue: {
    fontSize: 14,
    fontWeight: 500,
    color: '#1d1d1f',
  },
  emptyState: {
    textAlign: 'center',
    padding: '36px 0',
    color: '#aeaeb2',
    fontSize: 14,
  },
  table: {
    display: 'flex',
    flexDirection: 'column',
  },
  tableHeader: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr 0.8fr 1fr 36px',
    gap: 8,
    padding: '10px 0',
    borderBottom: '1px solid rgba(0,0,0,0.06)',
    marginBottom: 4,
  },
  th: {
    fontSize: 11,
    fontWeight: 600,
    color: '#aeaeb2',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  tableRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr 0.8fr 1fr 36px',
    gap: 8,
    padding: '12px 0',
    borderBottom: '1px solid rgba(0,0,0,0.04)',
    alignItems: 'center',
  },
  td: {
    fontSize: 13,
    color: '#6e6e73',
  },

  // Scanner Modal
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.4)',
    backdropFilter: 'blur(8px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: 16,
    animation: 'fadeIn 0.2s ease',
  },
  modal: {
    position: 'relative',
    width: '100%',
    maxWidth: 420,
    background: 'rgba(255,255,255,0.85)',
    backdropFilter: 'blur(32px) saturate(180%)',
    borderRadius: 24,
    padding: 32,
    border: '1px solid rgba(255,255,255,0.4)',
    boxShadow: '0 32px 80px rgba(0,0,0,0.12)',
    animation: 'fadeInUp 0.25s ease',
  },
  modalClose: {
    position: 'absolute',
    top: 16,
    left: 16,
    background: 'rgba(0,0,0,0.04)',
    border: 'none',
    borderRadius: 10,
    width: 36,
    height: 36,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 700,
    color: '#1d1d1f',
    marginBottom: 6,
  },
  modalSub: {
    fontSize: 13,
    color: '#6e6e73',
    marginBottom: 24,
  },
  scannerBox: {
    position: 'relative',
    borderRadius: 16,
    overflow: 'hidden',
    background: '#000',
    aspectRatio: '1 / 1',
    maxHeight: 340,
  },
  scannerContainer: {
    width: '100%',
    height: '100%',
  },
  cameraError: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#ff453a',
    fontSize: 14,
    textAlign: 'center',
    padding: 20,
  },
  scanningOverlay: {
    position: 'absolute',
    inset: 0,
    background: 'rgba(255,255,255,0.7)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  },
  auditBtn: {
    width: 28,
    height: 28,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#ff9f0a',
    background: 'rgba(255,159,10,0.08)',
    border: '1px solid rgba(255,159,10,0.15)',
    borderRadius: 8,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
}
