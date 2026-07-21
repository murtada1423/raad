import './globals.css'

export const metadata = {
  title: 'نظام الحضور والرواتب',
  description: 'إدارة حضور ورواتب الموظفين',
  manifest: '/manifest.json',
  themeColor: '#7c3aed',
  appleWebApp: {
    capable: true,
    title: 'الحضور',
    statusBarStyle: 'black-translucent',
  },
  other: {
    'mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-status-bar-style': 'black-translucent',
    'msapplication-TileColor': '#7c3aed',
  },
}

export default function RootLayout({ children }) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <link rel="icon" href="/icons/icon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/icons/icon.svg" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="theme-color" content="#7c3aed" />
        <link rel="preconnect" href="https://ilrmjvckjyrsfbhwnagi.supabase.co" />
      </head>
      <body style={{ margin: 0, background: '#f5f5f7' }}>
        <div id="app-loading" style={{
          position: 'fixed', inset: 0, zIndex: 99999,
          background: '#f5f5f7',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 16,
        }}>
          <img src="/icons/icon.svg" width="64" height="64" alt="" style={{ filter: 'drop-shadow(0 4px 12px rgba(124,58,237,0.2))' }} />
          <p style={{ fontSize: 14, color: '#aeaeb2', fontFamily: 'system-ui, sans-serif' }}>جاري التحميل...</p>
        </div>
        <script dangerouslySetInnerHTML={{
          __html: `document.addEventListener('DOMContentLoaded',()=>{var e=document.getElementById('app-loading');if(e)e.remove();if('serviceWorker' in navigator){navigator.serviceWorker.register('/sw.js').catch(()=>{})}})`
        }} />
        {children}
      </body>
    </html>
  )
}
