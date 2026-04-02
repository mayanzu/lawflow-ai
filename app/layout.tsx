import type { Metadata } from 'next'
import '../styles/globals.css'

export const metadata: Metadata = {
  title: '诉状助手 — 把判决书变成专业上诉状',
  description: '上传一审判决书，AI 智能生成规范民事上诉状',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  )
}
