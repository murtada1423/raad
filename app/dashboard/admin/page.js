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

function ConfirmDialog({ message, onConfirm, onCancel }) {
  return (
    <div style={dlg.overlay} onClick={onCancel}>
      <div style={dlg.dialog} onClick={(e) => e.stopPropagation()}>
        <div style={dlg.icon}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ff453a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </div>
        <p style={dlg.message}>{message}</p>
        <div style={dlg.actions}>
          <button style={dlg.cancelBtn} onClick={onCancel}>إلغاء</button>
          <button style={dlg.confirmBtn} onClick={onConfirm}>تأكيد الحذف</button>
        </div>
      </div>
    </div>
  )
}

const dlg = {
  overlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.4)',
    backdropFilter: 'blur(8px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1100, padding: 16,
    animation: 'fadeIn 0.2s ease',
  },
  dialog: {
    width: '100%', maxWidth: 380,
    background: 'rgba(255,255,255,0.92)',
    backdropFilter: 'blur(32px) saturate(180%)',
    borderRadius: 24, padding: 32,
    border: '1px solid rgba(255,255,255,0.4)',
    boxShadow: '0 32px 80px rgba(0,0,0,0.12)',
    animation: 'fadeInUp 0.25s ease',
    textAlign: 'center',
  },
  icon: {
    width: 48, height: 48, borderRadius: 14,
    background: 'rgba(255,69,58,0.1)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    margin: '0 auto 16px',
  },
  message: {
    fontSize: 15, fontWeight: 500, color: '#1d1d1f',
    marginBottom: 24, lineHeight: 1.5,
  },
  actions: {
    display: 'flex', gap: 12,
  },
  cancelBtn: {
    flex: 1, padding: '12px',
    fontSize: 14, fontWeight: 600,
    color: '#6e6e73',
    background: 'rgba(0,0,0,0.04)',
    border: '1px solid rgba(0,0,0,0.06)',
    borderRadius: 10, cursor: 'pointer',
    fontFamily: 'inherit',
  },
  confirmBtn: {
    flex: 1, padding: '12px',
    fontSize: 14, fontWeight: 600,
    color: '#fff',
    background: '#ff453a',
    border: 'none', borderRadius: 10,
    cursor: 'pointer', fontFamily: 'inherit',
    boxShadow: '0 4px 16px rgba(255,69,58,0.3)',
  },
}

export default function AdminDashboard() {
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({ totalEmployees: 0, presentToday: 0, overtimeThisMonth: 0, penaltiesThisMonth: 0 })
  const [employees, setEmployees] = useState([])
  const [attendanceList, setAttendanceList] = useState([])
  const [editingEmployee, setEditingEmployee] = useState(null)
  const [editSalary, setEditSalary] = useState('')
  const [editHours, setEditHours] = useState('')
  const [editCheckIn, setEditCheckIn] = useState('16:00')
  const [editCheckOut, setEditCheckOut] = useState('00:00')
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState({ type: '', message: '' })
  const [profilesMap, setProfilesMap] = useState({})
  const [employeeSalaryMap, setEmployeeSalaryMap] = useState({})
  const [showAddModal, setShowAddModal] = useState(false)
  const [addName, setAddName] = useState('')
  const [addEmail, setAddEmail] = useState('')
  const [addPassword, setAddPassword] = useState('')
  const [addSalary, setAddSalary] = useState('450000')
  const [addHours, setAddHours] = useState('8')
  const [adding, setAdding] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const router = useRouter()
  const supabase = createClient()
  const channelRef = useRef(null)

  const showToast = useCallback((type, message) => setToast({ type, message }), [])
  const closeToast = useCallback(() => setToast({ type: '', message: '' }), [])

  const today = new Date().toISOString().slice(0, 10)
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)

  const iqd = (value) =>
    new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value) + ' د.ع'

  const formatSalaryInput = (raw) => {
    const digits = raw.replace(/\D/g, '')
    if (!digits) return ''
    return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  }

  const dailyRate = (salary, hours) => salary / 30
  const hourlyRate = (salary, hours) => dailyRate(salary, hours) / hours
  const minutelyRate = (salary, hours) => hourlyRate(salary, hours) / 60

  const calcPenaltyAmount = (penaltyMinutes, salary, requiredHours) => {
    if (!penaltyMinutes || penaltyMinutes <= 0) return 0
    return Math.round(penaltyMinutes * minutelyRate(salary, requiredHours))
  }

  const calcOvertimeAmount = (overtimeMinutes, salary, requiredHours) => {
    if (!overtimeMinutes || overtimeMinutes <= 0) return 0
    return Math.round(overtimeMinutes * minutelyRate(salary, requiredHours))
  }

  const getEmployeePay = (employeeId) => employeeSalaryMap[employeeId] || { monthly_salary: 0, required_hours: 8 }

  const statusDisplay = (a) => {
    const statusMap = { present: 'حاضر', late: 'متأخر', early_checkout: 'مغادرة مبكرة', absent: 'غائب' }
    return a.check_out ? `${statusMap[a.status] || a.status} (تم)` : statusMap[a.status] || a.status
  }

  async function loadData() {
    const [{ count: totalEmployees }, { data: todayAttendance }, { data: monthAttendance }, { data: employees }, { data: allProfiles }] = await Promise.all([
      supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'employee'),
      supabase.from('attendance').select('*').eq('date', today),
      supabase.from('attendance').select('*').gte('date', monthStart).lte('date', today).not('check_out', 'is', null),
      supabase.from('profiles').select('*').eq('role', 'employee').order('full_name'),
      supabase.from('profiles').select('id, full_name'),
    ])

    const presentToday = todayAttendance
      ? new Set(todayAttendance.map((a) => a.employee_id)).size
      : 0

    const empList = employees || []

    const overtimeAmtThisMonth = monthAttendance
      ? monthAttendance.reduce((sum, a) => {
          const pay = empList.find((e) => e.id === a.employee_id)
          const sal = pay?.monthly_salary || 0
          const hrs = pay?.required_hours || 8
          return sum + calcOvertimeAmount(a.overtime_minutes, sal, hrs)
        }, 0)
      : 0

    const penaltiesAmtThisMonth = monthAttendance
      ? monthAttendance.reduce((sum, a) => {
          const pay = empList.find((e) => e.id === a.employee_id)
          const sal = pay?.monthly_salary || 0
          const hrs = pay?.required_hours || 8
          return sum + calcPenaltyAmount(a.penalty_minutes, sal, hrs)
        }, 0)
      : 0

    setStats({ totalEmployees: totalEmployees || 0, presentToday, overtimeThisMonth: overtimeAmtThisMonth, penaltiesThisMonth: penaltiesAmtThisMonth })
    setEmployees(empList)
    setAttendanceList(todayAttendance || [])

    const map = {}
    ;(allProfiles || []).forEach((p) => { map[p.id] = p.full_name })
    setProfilesMap(map)

    const payMap = {}
    empList.forEach((e) => { payMap[e.id] = { monthly_salary: e.monthly_salary, required_hours: e.required_hours } })
    setEmployeeSalaryMap(payMap)
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

      if (error || p?.role !== 'admin') {
        router.push('/dashboard/employee')
        return
      }

      if (!mounted) return
      setProfile(p)
      await loadData()
      setLoading(false)
    }
    init()
    return () => { mounted = false }
  }, [])

  // Realtime subscription
  useEffect(() => {
    if (!profile) return

    const channel = supabase
      .channel('admin-attendance')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'attendance', filter: `date=eq.${today}` },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setAttendanceList((prev) => {
              const exists = prev.some((a) => a.id === payload.new.id)
              return exists ? prev : [payload.new, ...prev]
            })
          } else if (payload.eventType === 'UPDATE') {
            setAttendanceList((prev) => prev.map((a) => (a.id === payload.new.id ? payload.new : a)))
          } else if (payload.eventType === 'DELETE') {
            setAttendanceList((prev) => prev.filter((a) => a.id !== payload.old.id))
          }
        }
      )
      .subscribe()

    channelRef.current = channel
    return () => {
      supabase.removeChannel(channel)
    }
  }, [profile])

  async function handleEditSave() {
    if (!editingEmployee) return
    setSaving(true)

    const salary = parseFloat(editSalary)
    const hours = parseFloat(editHours)

    if (isNaN(salary) || salary < 0) {
      showToast('error', 'قيمة الراتب غير صالحة')
      setSaving(false)
      return
    }
    if (isNaN(hours) || hours < 1 || hours > 24) {
      showToast('error', 'الساعات يجب أن تكون بين 1 و 24')
      setSaving(false)
      return
    }

    const { error } = await supabase
      .from('profiles')
      .update({
        monthly_salary: salary,
        required_hours: hours,
        check_in_time: editCheckIn,
        check_out_time: editCheckOut,
      })
      .eq('id', editingEmployee.id)

    if (error) {
      showToast('error', error.message || 'فشل التحديث')
    } else {
      showToast('success', `تم تحديث بيانات ${editingEmployee.full_name}`)
      setEmployees((prev) =>
        prev.map((e) =>
          e.id === editingEmployee.id
            ? { ...e, monthly_salary: salary, required_hours: hours, check_in_time: editCheckIn, check_out_time: editCheckOut }
            : e
        )
      )
      setEditingEmployee(null)
    }
    setSaving(false)
  }

  async function handleAddEmployee() {
    if (!addName.trim() || !addEmail.trim() || !addPassword.trim()) {
      showToast('error', 'يرجى إدخال الاسم والبريد الإلكتروني وكلمة المرور')
      return
    }
    if (addPassword.length < 6) {
      showToast('error', 'كلمة المرور يجب أن تكون 6 أحرف على الأقل')
      return
    }
    setAdding(true)
    try {
      const res = await fetch('/api/create-employee', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: addEmail.trim(),
          password: addPassword,
          full_name: addName.trim(),
          monthly_salary: parseFloat(addSalary) || 450000,
          required_hours: parseFloat(addHours) || 8,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        showToast('error', data.error || 'فشل إضافة الموظف')
      } else {
        showToast('success', `تم إضافة ${addName.trim()}`)
        setShowAddModal(false)
        setAddName('')
        setAddEmail('')
        setAddPassword('')
        setAddSalary('450000')
        setAddHours('8')
        await loadData()
      }
    } catch (err) {
      showToast('error', 'فشل الاتصال بالخادم')
    }
    setAdding(false)
  }

  async function handleDeleteEmployee() {
    if (!deleteTarget) return
    setDeleting(true)
    const { error } = await supabase
      .from('profiles')
      .delete()
      .eq('id', deleteTarget.id)

    if (error) {
      showToast('error', error.message || 'فشل حذف الموظف')
    } else {
      showToast('success', `تم حذف ${deleteTarget.full_name}`)
      setEmployees((prev) => prev.filter((e) => e.id !== deleteTarget.id))
      setDeleteTarget(null)
    }
    setDeleting(false)
  }

  function openEdit(employee) {
    setEditingEmployee(employee)
    setEditSalary(String(employee.monthly_salary))
    setEditHours(String(employee.required_hours))
    setEditCheckIn(employee.check_in_time || '16:00')
    setEditCheckOut(employee.check_out_time || '00:00')
  }

  function handleSignOut() {
    supabase.auth.signOut()
    router.push('/login')
  }

  if (loading) {
    return (
      <div style={s.wrapper}>
        <div style={s.center}><div style={s.spinner} /></div>
      </div>
    )
  }

  const orderedAttendance = [...attendanceList].sort((a, b) => new Date(b.check_in) - new Date(a.check_in))

  return (
    <div style={s.wrapper}>
      <Toast type={toast.type} message={toast.message} onClose={closeToast} />

      <div style={s.container}>
        {/* Header */}
        <header style={s.header}>
          <div>
            <h1 style={s.greeting}>{profile?.full_name}</h1>
            <p style={s.role}>مدير</p>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <a href="/kiosk" target="_blank" rel="noopener noreferrer" style={s.kioskLink}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
              </svg>
              شاشة الباركود للمكتب
            </a>
            <button style={s.signOut} onClick={handleSignOut}>تسجيل الخروج</button>
          </div>
        </header>

        {/* Stats */}
        <div style={s.statsGrid}>
          <div style={s.statCard}>
            <div style={s.statIcon}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
            <p style={s.statLabel}>إجمالي الموظفين</p>
            <p style={s.statValue} dir="ltr">{stats.totalEmployees}</p>
          </div>
          <div style={s.statCard}>
            <div style={{ ...s.statIcon, background: 'rgba(52,199,89,0.1)' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#34c759" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            </div>
            <p style={s.statLabel}>الحضور اليوم</p>
            <p style={s.statValue} dir="ltr">{stats.presentToday}</p>
          </div>
          <div style={s.statCard}>
            <div style={{ ...s.statIcon, background: 'rgba(255,204,0,0.1)' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#cc9a00" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
            <p style={s.statLabel}>الإضافي هذا الشهر</p>
            <p style={s.statValue} dir="ltr">{stats.overtimeThisMonth > 0 ? iqd(stats.overtimeThisMonth) : '0 د.ع'}</p>
          </div>
          <div style={s.statCard}>
            <div style={{ ...s.statIcon, background: 'rgba(255,69,58,0.1)' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ff453a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </div>
            <p style={s.statLabel}>الخصومات هذا الشهر</p>
            <p style={s.statValue} dir="ltr">{stats.penaltiesThisMonth > 0 ? iqd(stats.penaltiesThisMonth) : '0 د.ع'}</p>
          </div>
        </div>

        {/* Employees Table */}
        <div style={s.section}>
          <div style={s.sectionHeader}>
            <h2 style={s.sectionTitle}>الموظفين</h2>
            <button style={s.addBtn} onClick={() => setShowAddModal(true)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              إضافة موظف جديد
            </button>
          </div>
          {employees.length === 0 ? (
            <div style={s.emptyState}><p>لم يتم العثور على موظفين.</p></div>
          ) : (
            <div style={s.tableResponsive}>
              <div style={s.table}>
                <div style={s.tableHeader}>
                  <span style={s.th}>الاسم</span>
                  <span style={s.th}>الراتب الشهري</span>
                  <span style={s.th}>الساعات</span>
                  <span style={{ ...s.th, textAlign: 'center' }}>الإجراءات</span>
                </div>
                {employees.map((emp) => (
                  <div key={emp.id} style={s.tableRow}>
                    <span style={s.tdName}>{emp.full_name}</span>
                    <span style={s.td} dir="ltr">{iqd(emp.monthly_salary)}</span>
                    <span style={s.td} dir="ltr">{emp.required_hours}س</span>
                    <span style={s.tdAction}>
                      <button style={s.editBtn} onClick={() => openEdit(emp)}>تعديل</button>
                      <button style={s.deleteBtn} onClick={() => setDeleteTarget(emp)}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Live Attendance Log */}
        <div style={s.section}>
          <div style={s.sectionHeader}>
            <h2 style={s.sectionTitle}>الحضور المباشر — اليوم</h2>
            <span style={s.liveBadge}>
              <span style={s.liveDot} />
              مباشر
            </span>
          </div>
          {orderedAttendance.length === 0 ? (
            <div style={s.emptyState}><p>لا توجد سجلات حضور لليوم بعد.</p></div>
          ) : (
            <div style={s.tableResponsive}>
              <div style={s.table}>
                <div style={s.attHeader}>
                  <span style={s.th}>الموظف</span>
                  <span style={s.th}>دخول</span>
                  <span style={s.th}>خروج</span>
                  <span style={s.th}>ساعات</span>
                  <span style={s.th}>إضافي (د.ع)</span>
                  <span style={s.th}>خصم (د.ع)</span>
                  <span style={s.th}>الحالة</span>
                </div>
                  {orderedAttendance.map((a) => {
                  const pay = getEmployeePay(a.employee_id)
                  const penAmt = calcPenaltyAmount(a.penalty_minutes, pay.monthly_salary, pay.required_hours)
                  const overAmt = calcOvertimeAmount(a.overtime_minutes, pay.monthly_salary, pay.required_hours)

                  const statusColor =
                    a.status === 'present' ? '#34c759' :
                    a.status === 'late' ? '#cc9a00' :
                    a.status === 'early_checkout' ? '#ff453a' : '#aeaeb2'

                  const badgeBg =
                    a.status === 'present' ? 'rgba(52,199,89,0.1)' :
                    a.status === 'late' ? 'rgba(204,154,0,0.1)' :
                    a.status === 'early_checkout' ? 'rgba(255,69,58,0.1)' :
                    'rgba(0,0,0,0.04)'

                  return (
                    <div key={a.id} style={s.attRow}>
                       <span style={s.tdName}>{profilesMap[a.employee_id] || 'غير معروف'}</span>
                      <span style={s.td}>{new Date(a.check_in).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
                      <span style={s.td}>{a.check_out ? new Date(a.check_out).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '—'}</span>
                      <span style={s.td}>{a.total_hours ? `${a.total_hours.toFixed(1)}س` : '—'}</span>
                      <span style={{ ...s.td, color: overAmt > 0 ? '#34c759' : '#aeaeb2' }}>
                        {overAmt > 0 ? iqd(overAmt) : '—'}
                      </span>
                      <span style={{ ...s.td, color: penAmt > 0 ? '#ff453a' : '#aeaeb2' }}>
                        {penAmt > 0 ? iqd(penAmt) : '—'}
                      </span>
                      <span>
                        <span style={{ ...s.badge, background: badgeBg, color: statusColor }}>
                          {statusDisplay(a)}
                        </span>
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Edit Modal */}
      {editingEmployee && (
        <div style={s.overlay} onClick={() => setEditingEmployee(null)}>
          <div style={s.modal} onClick={(e) => e.stopPropagation()}>
            <button style={s.modalClose} onClick={() => setEditingEmployee(null)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(0,0,0,0.3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>

            <div style={s.modalIcon}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </div>

            <h3 style={s.modalTitle}>تعديل بيانات الموظف</h3>
            <p style={s.modalSub}>{editingEmployee.full_name}</p>

            <div style={s.modalForm}>
              <div style={s.inputGroup}>
                <label style={s.label}>الراتب الشهري (د.ع)</label>
                <input
                  type="number"
                  value={editSalary}
                  onChange={(e) => setEditSalary(e.target.value)}
                  style={s.input}
                  min="0"
                  step="1000"
                />
              </div>
              <div style={s.inputGroup}>
                <label style={s.label}>الساعات المطلوبة / يوم</label>
                <input
                  type="number"
                  value={editHours}
                  onChange={(e) => setEditHours(e.target.value)}
                  style={s.input}
                  min="1"
                  max="24"
                  step="0.5"
                />
              </div>
              <div style={s.inputGroup}>
                <label style={s.label}>وقت الدخول الرسمي</label>
                <input
                  type="time"
                  value={editCheckIn}
                  onChange={(e) => setEditCheckIn(e.target.value)}
                  style={s.input}
                  dir="ltr"
                />
              </div>
              <div style={s.inputGroup}>
                <label style={s.label}>وقت الخروج الرسمي</label>
                <input
                  type="time"
                  value={editCheckOut}
                  onChange={(e) => setEditCheckOut(e.target.value)}
                  style={s.input}
                  dir="ltr"
                />
              </div>
            </div>

            <div style={s.modalActions}>
              <button style={s.cancelBtn} onClick={() => setEditingEmployee(null)}>إلغاء</button>
              <button style={{ ...s.saveBtn, opacity: saving ? 0.7 : 1 }} onClick={handleEditSave} disabled={saving}>
                {saving ? 'جاري الحفظ...' : 'حفظ التغييرات'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Employee Modal */}
      {showAddModal && (
        <div style={s.overlay} onClick={() => { if (!adding) setShowAddModal(false) }}>
          <div style={s.modal} onClick={(e) => e.stopPropagation()}>
            <button style={s.modalClose} onClick={() => { if (!adding) setShowAddModal(false) }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(0,0,0,0.3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>

            <div style={{ ...s.modalIcon, background: 'linear-gradient(135deg, #34c759, #30d158)' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="8.5" cy="7" r="4" /><line x1="20" y1="8" x2="20" y2="14" /><line x1="23" y1="11" x2="17" y2="11" />
              </svg>
            </div>

            <h3 style={s.modalTitle}>إضافة موظف جديد</h3>
            <p style={s.modalSub}>أدخل بيانات الموظف الجديد</p>

            <div style={s.modalForm}>
              <div style={s.inputGroup}>
                <label style={s.label}>إسم الموظف</label>
                <input
                  type="text"
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  style={s.input}
                  placeholder="مثال: أحمد علي"
                />
              </div>
              <div style={s.inputGroup}>
                <label style={s.label}>البريد الإلكتروني</label>
                <input
                  type="email"
                  value={addEmail}
                  onChange={(e) => setAddEmail(e.target.value)}
                  style={s.input}
                  placeholder="employee@company.com"
                  dir="ltr"
                />
              </div>
              <div style={s.inputGroup}>
                <label style={s.label}>كلمة المرور</label>
                <input
                  type="text"
                  value={addPassword}
                  onChange={(e) => setAddPassword(e.target.value)}
                  style={s.input}
                  placeholder="أدخل كلمة مرور قوية"
                  dir="ltr"
                />
              </div>
              <div style={s.inputGroup}>
                <label style={s.label}>الراتب الشهري الأساسي (د.ع)</label>
                <input
                  type="text"
                  value={formatSalaryInput(addSalary)}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, '')
                    setAddSalary(digits)
                  }}
                  style={s.input}
                  inputMode="numeric"
                  dir="ltr"
                />
              </div>
              <div style={s.inputGroup}>
                <label style={s.label}>ساعات الدوام المطلوبة / يوم</label>
                <input
                  type="number"
                  value={addHours}
                  onChange={(e) => setAddHours(e.target.value)}
                  style={s.input}
                  min="1"
                  max="24"
                  step="0.5"
                  dir="ltr"
                />
              </div>
            </div>

            <div style={s.modalActions}>
              <button style={s.cancelBtn} onClick={() => { if (!adding) setShowAddModal(false) }} disabled={adding}>إلغاء</button>
              <button style={{ ...s.saveBtn, background: 'linear-gradient(135deg, #34c759, #30d158)', opacity: adding ? 0.7 : 1 }} onClick={handleAddEmployee} disabled={adding}>
                {adding ? 'جاري الإضافة...' : 'إضافة الموظف'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteTarget && (
        <ConfirmDialog
          message={`هل أنت متأكد من حذف ${deleteTarget.full_name}؟`}
          onConfirm={handleDeleteEmployee}
          onCancel={() => { if (!deleting) setDeleteTarget(null) }}
        />
      )}
    </div>
  )
}

const s = {
  wrapper: {
    minHeight: '100vh',
    background: '#f5f5f7',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    color: '#1d1d1f',
  },
  container: {
    maxWidth: '1040px',
    margin: '0 auto',
    padding: '40px 24px 80px',
  },
  center: {
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
    marginBottom: 32,
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
  signOut: {
    padding: '10px 18px',
    fontSize: 14,
    fontWeight: 600,
    color: '#6e6e73',
    background: 'rgba(0,0,0,0.04)',
    border: '1px solid rgba(0,0,0,0.06)',
    borderRadius: 10,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: 12,
    marginBottom: 28,
  },
  statCard: {
    background: '#ffffff',
    borderRadius: 16,
    padding: '20px',
    border: '1px solid rgba(0,0,0,0.06)',
    boxShadow: '0 1px 4px rgba(0,0,0,0.02)',
  },
  statIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    background: 'rgba(124,58,237,0.1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: '#aeaeb2',
    textTransform: 'uppercase',
    letterSpacing: '0.8px',
    marginBottom: 6,
  },
  statValue: {
    fontSize: 26,
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
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 600,
    color: '#1d1d1f',
    margin: 0,
  },
  liveBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 12px',
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '1px',
    color: '#34c759',
    background: 'rgba(52,199,89,0.1)',
    borderRadius: 100,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: '#34c759',
    animation: 'pulse 2s infinite',
  },
  emptyState: {
    textAlign: 'center',
    padding: '36px 0',
    color: '#aeaeb2',
    fontSize: 14,
  },
  tableResponsive: {
    overflowX: 'auto',
  },
  table: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: 500,
  },
  tableHeader: {
    display: 'grid',
    gridTemplateColumns: '2fr 1.2fr 0.8fr 1fr',
    gap: 12,
    padding: '10px 0',
    borderBottom: '1px solid rgba(0,0,0,0.06)',
    marginBottom: 4,
  },
  attHeader: {
    display: 'grid',
    gridTemplateColumns: '1.5fr 0.9fr 0.9fr 0.7fr 0.7fr 0.7fr 0.9fr',
    gap: 10,
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
    textAlign: 'right',
  },
  tableRow: {
    display: 'grid',
    gridTemplateColumns: '2fr 1.2fr 0.8fr 1fr',
    gap: 12,
    padding: '12px 0',
    borderBottom: '1px solid rgba(0,0,0,0.04)',
    alignItems: 'center',
  },
  attRow: {
    display: 'grid',
    gridTemplateColumns: '1.5fr 0.9fr 0.9fr 0.7fr 0.7fr 0.7fr 0.9fr',
    gap: 10,
    padding: '10px 0',
    borderBottom: '1px solid rgba(0,0,0,0.04)',
    alignItems: 'center',
  },
  td: {
    fontSize: 13,
    color: '#6e6e73',
    textAlign: 'right',
  },
  tdName: {
    fontSize: 13,
    fontWeight: 500,
    color: '#1d1d1f',
    textAlign: 'right',
  },
  tdAction: {
    textAlign: 'center',
    display: 'flex',
    gap: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  editBtn: {
    padding: '6px 14px',
    fontSize: 12,
    fontWeight: 600,
    color: '#fff',
    background: 'linear-gradient(135deg, #7c3aed, #3b82f6)',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
    fontFamily: 'inherit',
    whiteSpace: 'nowrap',
  },
  deleteBtn: {
    width: 32,
    height: 32,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#ff453a',
    background: 'rgba(255,69,58,0.08)',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
  },
  badge: {
    display: 'inline-block',
    padding: '3px 10px',
    fontSize: 11,
    fontWeight: 600,
    borderRadius: 100,
    whiteSpace: 'nowrap',
  },

  // Modal
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
    maxWidth: 440,
    background: 'rgba(255,255,255,0.88)',
    backdropFilter: 'blur(32px) saturate(180%)',
    borderRadius: 24,
    padding: 36,
    border: '1px solid rgba(255,255,255,0.4)',
    boxShadow: '0 32px 80px rgba(0,0,0,0.12)',
    animation: 'fadeInUp 0.25s ease',
  },
  modalClose: {
    position: 'absolute',
    top: 16,
    right: 16,
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
  modalIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    background: 'linear-gradient(135deg, #7c3aed, #3b82f6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    boxShadow: '0 8px 24px rgba(124,58,237,0.25)',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 700,
    color: '#1d1d1f',
    marginBottom: 4,
  },
  modalSub: {
    fontSize: 14,
    color: '#6e6e73',
    marginBottom: 28,
  },
  modalForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: 18,
    marginBottom: 28,
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: 600,
    color: '#6e6e73',
  },
  input: {
    width: '100%',
    padding: '12px 14px',
    fontSize: 15,
    color: '#1d1d1f',
    background: 'rgba(0,0,0,0.03)',
    border: '1px solid rgba(0,0,0,0.08)',
    borderRadius: 10,
    outline: 'none',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  },
  modalActions: {
    display: 'flex',
    gap: 12,
  },
  cancelBtn: {
    flex: 1,
    padding: '12px',
    fontSize: 14,
    fontWeight: 600,
    color: '#6e6e73',
    background: 'rgba(0,0,0,0.04)',
    border: '1px solid rgba(0,0,0,0.06)',
    borderRadius: 10,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  saveBtn: {
    flex: 1,
    padding: '12px',
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
  kioskLink: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '10px 16px',
    fontSize: 13,
    fontWeight: 600,
    color: '#6e6e73',
    background: 'rgba(0,0,0,0.04)',
    border: '1px solid rgba(0,0,0,0.06)',
    borderRadius: 10,
    textDecoration: 'none',
    fontFamily: 'inherit',
    cursor: 'pointer',
  },
  addBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '10px 18px',
    fontSize: 13,
    fontWeight: 600,
    color: '#fff',
    background: 'linear-gradient(135deg, #34c759, #30d158)',
    border: 'none',
    borderRadius: 10,
    cursor: 'pointer',
    fontFamily: 'inherit',
    boxShadow: '0 4px 16px rgba(52,199,89,0.25)',
  },
}
