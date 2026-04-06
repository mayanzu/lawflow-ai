import '../styles/globals.css'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0" />
        <style>{`
          :root {
            --font-unit: 16px;
          }
          *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
          html { font-size: var(--font-unit); }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "PingFang SC", "Microsoft YaHei", sans-serif;
            background: #FFFFFF;
            color: #1D1D1F;
            -webkit-font-smoothing: antialiased;
            line-height: 1.5;
          }

          /* 高分屏：2x Retina 放大字号 */
          @media (min-resolution: 1.5dppx), (min-resolution: 144dpi) {
            :root { --font-unit: 17px; }
          }
          @media (min-resolution: 2dppx), (min-resolution: 192dpi) {
            :root { --font-unit: 18px; }
          }

          /* 大屏幕：增大容器 */
          @media (min-width: 1440px) {
            :root { --font-unit: 19px; }
          }
          @media (min-width: 1920px) {
            :root { --font-unit: 21px; }
          }
          @media (min-width: 2560px) {
            :root { --font-unit: 24px; }
          }

          /* 滚动条美化 */
          ::-webkit-scrollbar { width: 6px; }
          ::-webkit-scrollbar-track { background: transparent; }
          ::-webkit-scrollbar-thumb { background: #D1D1D6; border-radius: 3px; }
          ::-webkit-scrollbar-thumb:hover { background: #AEAEB2; }
        `}</style>
      </head>
      <body style={{ minHeight: '100vh' }}>{children}</body>
    </html>
  )
}
