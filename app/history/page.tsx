'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface HistoryItem {
  id: string
  fileName: string
  uploadTime: string
  案号: string
  案由: string
  原告: string
  被告: string
  判决法院: string
  判决日期: string
  analyzeInfo?: Record<string, string>
  appealText?: string
}

export default function HistoryPage() {
  const router = useRouter()
  const [history, setHistory] = useState<HistoryItem[]>([])

  function loadHistory() {
    const raw = localStorage.getItem('lw_history')
    if (raw) { try { setHistory(JSON.parse(raw)) } catch { setHistory([]) } }
    else setHistory([])
  }

  useEffect(() => { loadHistory() }, [])

  function handleDelete(id: string) {
    const updated = history.filter(h => h.id !== id)
    setHistory(updated)
    localStorage.setItem('lw_history', JSON.stringify(updated))
  }

  function handleClearAll() {
    setHistory([])
    localStorage.removeItem('lw_history')
  }

  /* 查看结果：跳转到结果页显示已生成的诉状 */
  function viewResult(item: HistoryItem) {
    localStorage.setItem('lw_file_id',           item.id)
    localStorage.setItem('lw_file_name',         item.fileName)
    if (item.analyzeInfo)
      localStorage.setItem('lw_analyze_info',    JSON.stringify(item.analyzeInfo))
    if (item.appealText)
      localStorage.setItem('lw_appeal_text',     item.appealText)
    localStorage.setItem('lw_ocr_text', '')
    router.push('/result')
  }

  /* 编辑信息：跳转到确认页修改案件信息 */
  function editCase(item: HistoryItem) {
    localStorage.setItem('lw_file_id',           item.id)
    localStorage.setItem('lw_file_name',         item.fileName)
    if (item.analyzeInfo)
      localStorage.setItem('lw_analyze_info',    JSON.stringify(item.analyzeInfo))
    // 清空旧诉状，重新生成
    localStorage.removeItem('lw_appeal_text')
    localStorage.setItem('lw_ocr_text', '')
    router.push('/confirm')
  }

  function formatDate(d: string): string {
    if (!d) return ''
    const date = new Date(d)
    const diff = Math.floor((Date.now() - date.getTime()) / 86400000)
    if (diff === 0)  return '今天'
    if (diff === 1)  return '昨天'
    if (diff < 7)    return `${diff}天前`
    return date.toLocaleDateString('zh-CN')
  }

  return (
    <div style={{ minHeight: '100vh', background: '#FFFFFF', fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif' }}>
      {/* 导航栏 */}
      <nav style={{ backdropFilter: 'saturate(180%) blur(20px)', WebkitBackdropFilter: 'saturate(180%) blur(20px)', background: 'rgba(255,255,255,0.85)', borderBottom: '1px solid rgba(0,0,0,0.08)' }}>
        <div style={{ maxWidth: 980, margin: '0 auto', padding: '0 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: 52 }}>
          <button onClick={() => router.push('/')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#0071E3', fontWeight: 500, padding: '4px 8px' }}>返回首页</button>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#1D1D1F', letterSpacing: '-0.02em' }}>历史记录</span>
          <div style={{ width: 40 }} />
        </div>
      </nav>

      <main style={{ maxWidth: 680, margin: '0 auto', padding: '32px 24px 80px' }}>
        {/* 标题 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <p style={{ fontSize: 12, fontWeight: 600, color: '#86868B', letterSpacing: '0.06em', margin: 0 }}>历史记录</p>
            {history.length > 0 && <p style={{ fontSize: 12, color: '#86868B', margin: '4px 0 0' }}>共 {history.length} 条</p>}
          </div>
          {history.length > 0 && (
            <button onClick={handleClearAll} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#86868B', fontWeight: 500, padding: '4px 8px' }}>清空</button>
          )}
        </div>

        {history.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 20px' }}>
            <div style={{ width: 48, height: 48, borderRadius: '50%', border: '3px solid #E0E0E0', margin: '0 auto 16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="24" height="24" viewBox="0 0 20 20" fill="none"><rect x="3" y="2" width="14" height="16" rx="2" stroke="#86868B" strokeWidth="1.5"/><line x1="7" y1="7" x2="13" y2="7" stroke="#86868B" strokeWidth="1.2"/><line x1="7" y1="10" x2="13" y2="10" stroke="#86868B" strokeWidth="1.2"/><line x1="7" y1="13" x2="10" y2="13" stroke="#86868B" strokeWidth="1.2"/></svg>
            </div>
            <p style={{ fontSize: 17, fontWeight: 600, color: '#1D1D1F', marginBottom: 6 }}>暂无历史记录</p>
            <p style={{ fontSize: 14, color: '#86868B', marginBottom: 24 }}>处理完成的案件会自动保存在此处</p>
            <button onClick={() => router.push('/')} style={{ padding: '12px 24px', background: '#0071E3', color: '#FFF', border: 'none', borderRadius: 980, cursor: 'pointer', fontSize: 14, fontWeight: 500 }}>开始第一个任务</button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {history.map(item => (
              <div key={item.id} style={{ background: '#F8F9FA', borderRadius: 16, padding: '18px 20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                  <span style={{ fontSize: 15, fontWeight: 600, color: '#1D1D1F', flex: 1 }}>{item.案号 || item.fileName}</span>
                  <span style={{ fontSize: 12, color: '#86868B', flexShrink: 0, marginLeft: 12 }}>{formatDate(item.uploadTime)}</span>
                </div>
                {item.判决法院 && <div style={{ fontSize: 13, color: '#86868B', marginBottom: 4 }}>{item.判决法院}</div>}
                {(item.原告 || item.被告) && (
                  <div style={{ fontSize: 13, color: '#6E6E73', marginBottom: 14 }}>{item.原告 || '—'} → {item.被告 || '—'}</div>
                )}
                <div style={{ display: 'flex', gap: 10 }}>
                  {item.appealText ? (
                    <button onClick={() => viewResult(item)} style={{ flex: 1, padding: '10px 16px', background: '#0071E3', color: '#FFF', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 500 }}>查看结果</button>
                  ) : (
                    <button onClick={() => viewResult(item)} style={{ flex: 1, padding: '10px 16px', background: '#0071E3', color: '#FFF', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 500 }}>继续生成</button>
                  )}
                  <button onClick={() => editCase(item)} style={{ flex: 1, padding: '10px 16px', background: '#FFF', color: '#0071E3', border: '1px solid #0071E3', borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 500 }}>编辑信息</button>
                  <button onClick={() => handleDelete(item.id)} style={{ background: 'none', border: '1px solid #E0E0E0', borderRadius: 10, cursor: 'pointer', fontSize: 13, color: '#86868B', padding: '0 12px', minWidth: 36 }}>删除</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
