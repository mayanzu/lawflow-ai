'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function ResultPage() {
  const router = useRouter()
  const [appealText, setAppealText] = useState('')
  const [editedText, setEditedText] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(true)
  const [legalBasis, setLegalBasis] = useState<string[]>([])
  const [showBasis, setShowBasis] = useState(false)
  const [isExportMenu, setIsExportMenu] = useState(false)

  useEffect(() => {
    const raw = localStorage.getItem('lw_appeal_text')
    if (raw) { setAppealText(raw); setEditedText(raw) }
    const fileId = localStorage.getItem('lw_file_id') || ''
    const fileName = localStorage.getItem('lw_file_name') || '未知文件'
    const caseInfoRaw = localStorage.getItem('lw_analyze_info')
    const ocrRaw = localStorage.getItem('lw_ocr_text') || ''

    // 提取案号作为 fallback
    let caseNum = ''
    if (ocrRaw) {
      const m = ocrRaw.match(/([（(]\d{4}[）)][^\n]{2,10}民初|民终|民申|刑初|刑终|行初|行终)\d+号/)
      if (m) caseNum = m[0].replace(/\s/g, '')
    }

    let caseInfo: any = {}
    try { caseInfo = JSON.parse(caseInfoRaw || '{}') } catch {}

    // 即使案号为空也保存历史记录
    const entry = {
      id: fileId || `manual_${Date.now()}`,
      fileName,
      uploadTime: new Date().toISOString(),
      案号: caseInfo.案号 || caseNum || '未识别',
      原告: caseInfo.原告 || '未知',
      被告: caseInfo.被告 || '未知',
      判决法院: caseInfo.判决法院 || ''
    }

    try {
      const historyRaw = localStorage.getItem('lw_history')
      let history: any[] = []
      try { history = JSON.parse(historyRaw || '[]') } catch {}
      const existing = history.findIndex(h => h.id === entry.id)
      if (existing >= 0) history[existing] = entry; else history.unshift(entry)
      history = history.slice(0, 20)
      localStorage.setItem('lw_history', JSON.stringify(history))
    } catch (e) {
      console.error('Failed to save history:', e)
    }
    const basisStr = localStorage.getItem('lw_legal_basis')
    if (basisStr) { try { setLegalBasis(JSON.parse(basisStr)) } catch {} }
    setLoading(false)
  }, [])

  function handleCopy() {
    navigator.clipboard.writeText(editedText).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
  }

  function handleExport(format: 'txt' | 'docx' = 'txt') {
    if (format === 'docx') {
      // Build HTML that Word can open (simpler than .docx zip format)
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:SimSun,serif;font-size:14pt;line-height:2;padding:1.5cm;}</style></head><body><p style="text-align:center;font-size:18pt;font-weight:bold;letter-spacing:6pt;margin-bottom:30px;">民事上诉状</p>${editedText.replace(/\n/g, '<br>')}</body></html>`
      const blob = new Blob(['\ufeff' + html], { type: 'application/msword' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = '民事上诉状.doc'; a.click()
      URL.revokeObjectURL(url)
    } else {
      const blob = new Blob([editedText], { type: 'text/plain;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = '民事上诉状.txt'; a.click()
      URL.revokeObjectURL(url)
    }
  }

  function handleRegenerate() {
    if (!confirm('重新生成将清空当前内容，确定继续？')) return
    Object.keys(localStorage).filter(k => k.startsWith('lw_') || k === 'wf_started').forEach(k => localStorage.removeItem(k))
    router.push('/')
  }

  if (loading) return <div style={{ minHeight: '100vh', background: '#F8F9FA', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '-apple-system, BlinkMacSystemFont', color: '#86868B', fontSize: '15px' }}>加载中...</div>

  if (!appealText) return (
    <div style={{ minHeight: '100vh', background: '#F8F9FA', fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif' }}>
      <nav style={{ padding: '12px 16px', background: '#FFF', borderBottom: '1px solid #E8EAED' }}>
        <button onClick={() => router.push('/')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', fontWeight: 600, color: '#1D1D1F' }}>诉状助手</button>
      </nav>
      <div style={{ maxWidth: 480, margin: '80px auto', textAlign: 'center', padding: '0 24px' }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}></div>
        <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#1D1D1F', marginBottom: 8 }}>未找到诉状</h2>
        <p style={{ fontSize: '14px', color: '#86868B', marginBottom: 24, lineHeight: 1.6 }}>没有找到生成的诉状内容，请重新上传判决书生成。</p>
        <button onClick={() => router.push('/')} style={{ padding: '12px 24px', background: '#0071E3', color: '#FFF', border: 'none', borderRadius: 980, cursor: 'pointer', fontSize: '15px', fontWeight: 600 }}>重新生成</button>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#F8F9FA', fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif' }}>
      {/* 导航 */}
      <nav style={{ padding: '12px 16px', background: '#FFF', borderBottom: '1px solid #E8EAED', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, zIndex: 100 }}>
        <button onClick={() => router.push('/')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', fontWeight: 600, color: '#1D1D1F', padding: '8px 0' }}>诉状助手</button>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={handleCopy} style={{ padding: '6px 12px', background: '#FFF', border: '1px solid #E0E0E0', borderRadius: 8, cursor: 'pointer', fontSize: '12px', fontWeight: 500, color: '#1D1D1F', minHeight: 36 }}>{copied ? '已复制' : '复制'}</button>
          <div style={{ position: 'relative', display: 'inline-block' }}>
            <button onClick={() => setIsExportMenu(v => !v)} style={{ padding: '6px 12px', background: '#FFF', border: '1px solid #E0E0E0', borderRadius: 8, cursor: 'pointer', fontSize: '12px', fontWeight: 500, color: '#1D1D1F', minHeight: 36 }}>导出 ▾</button>
            {isExportMenu && <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, background: '#FFF', borderRadius: 10, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', border: '1px solid #E8E8ED', overflow: 'hidden', zIndex: 10, minWidth: 120 }}>
              <button onClick={() => { handleExport('txt'); setIsExportMenu(false) }} style={{ display: 'block', width: '100%', padding: '10px 16px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', color: '#1D1D1F', textAlign: 'left' }}>TXT 文本</button>
              <button onClick={() => { handleExport('docx'); setIsExportMenu(false) }} style={{ display: 'block', width: '100%', padding: '10px 16px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', color: '#1D1D1F', textAlign: 'left', borderTop: '1px solid #F0F0F0' }}>DOC Word</button>
            </div>}
          </div>
          <button onClick={handleRegenerate} style={{ padding: '6px 12px', background: '#FFF', border: '1px solid #E0E0E0', borderRadius: 8, cursor: 'pointer', fontSize: '12px', color: '#86868B', minHeight: 36 }}>重新生成</button>
        </div>
      </nav>

      <div style={{ padding: '20px 16px 80px', maxWidth: 800, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <h1 style={{ fontSize: '20px', fontWeight: 700, color: '#1D1D1F', margin: '0 0 4px' }}>民事上诉状生成完成</h1>
          <p style={{ fontSize: '13px', color: '#86868B', margin: 0 }}>{editedText.length} 字</p>
        </div>

        <div style={{ background: '#FFF', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 6px rgba(0,0,0,0.06)' }}>
          {/* 工具栏 */}
          <div style={{ padding: '14px 16px', borderBottom: '1px solid #F5F5F5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: '15px', fontWeight: 600, color: '#1D1D1F', margin: 0 }}>民事上诉状</h2>
            <button onClick={() => setIsEditing(!isEditing)} style={{ background: isEditing ? '#0071E3' : '#F5F5F7', color: isEditing ? '#FFF' : '#1D1D1F', border: 'none', borderRadius: 980, padding: '6px 14px', cursor: 'pointer', fontSize: '13px', fontWeight: 500, transition: 'all 0.2s' }}>{isEditing ? '完成编辑' : '编辑'}</button>
          </div>

          {/* 内容 */}
          {isEditing ? (
            <textarea value={editedText} onChange={e => setEditedText(e.target.value)} style={{ width: '100%', minHeight: 400, border: 'none', padding: '16px', fontSize: '14px', lineHeight: 1.9, color: '#1D1D1F', fontFamily: 'inherit', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
          ) : (
            <div style={{ padding: '16px', fontSize: '14px', lineHeight: 1.9, color: '#1D1D1F', whiteSpace: 'pre-wrap', wordBreak: 'break-word', minHeight: 300 }}>{editedText}</div>
          )}

          {/* 法律依据 */}
          {legalBasis.length > 0 && (
            <div style={{ padding: '14px 16px', borderTop: '1px solid #F0F0F0' }}>
              <button onClick={() => setShowBasis(v => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', color: '#86868B', display: 'flex', alignItems: 'center', gap: 6, padding: 0 }}>
                <span style={{ color: showBasis ? '#0071E3' : '#86868B' }}>{showBasis ? '' : ''}</span>
                本文书引用法条 ({legalBasis.length} 条)
              </button>
              {showBasis && (
                <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {legalBasis.map((art, i) => (
                    <span key={i} style={{ background: '#E8F0FE', color: '#0071E3', padding: '3px 10px', borderRadius: 6, fontSize: '12px', fontWeight: 500 }}>{art}</span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 底部 */}
          {editedText !== appealText && (
            <div style={{ padding: '10px 16px', borderTop: '1px solid #F0F0F0', display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => setEditedText(appealText)} style={{ background: 'none', border: 'none', color: '#0071E3', cursor: 'pointer', fontSize: '12px', fontWeight: 500 }}>恢复原始内容</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
