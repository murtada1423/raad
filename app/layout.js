import './globals.css'

export const metadata = {
  title: 'نظام الحضور والرواتب',
  description: 'إدارة حضور ورواتب الموظفين',
}

export default function RootLayout({ children }) {
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  )
}
