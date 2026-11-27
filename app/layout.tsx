import type { Metadata } from 'next'
import './globals.css'
import TitleManager from '@/components/TitleManager'

export const metadata: Metadata = {
  title: '无间道 · 清华大学电子系学生节',
  description: '清华大学电子系学生节晚会的节目单、弹幕和抽奖结果。',
  icons: {
    icon: '/theme/icon.png',
    apple: '/theme/icon.png',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-CN">
      <body style={{ fontFamily: '"Songti SC", "STSong", "SimSun", serif' }}>
        <TitleManager />
        {children}
      </body>
    </html>
  )
}
