'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

function sleep(ms: number) { return new Promise<void>(r => setTimeout(r, ms)) }

export default function ResultPage() {
  const router = useRouter()
  const [appealText, setAppealText] = useState('')
  const [streamingText, setStreamingText] = useState('')
  const [streamDone, setStreamDone] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [editedText, setEditedText] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [legalBasis, setLegalBasis] = useState<string[]>([])
  const [showBasis, setShowBasis] = useState(false)
  const [isExportMenu, setIsExportMenu] = useState(false)
  const streamEndRef = useRef<HTMLDivElement>(null)

  // Auto-scroll
  useEffect(() => {
    if (streamEndRef.current && isGenerating) {
      streamEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [streamingText, isGenerating])

  // Start streaming if no appeal text exists
  useEffect(() => {
    const raw = localStorage.getItem('lw_appeal_text')
    if (raw) {
      // Already generated, show directly
      setAppealText(raw)
      setEditedText(raw)
      setStreamDone(true)
    } else {
      // Start streaming generation
      setIsGenerating(true)
      startStreaming()
    }

    // Save to history
    const fileId = localStorage.getItem('lw_file_id') || ''
    const fileName = localStorage.getItem('lw_file_name') || '未知文件'
    const caseInfoRaw = localStorage.getItem('lw_analyze_info')
    const ocrRaw = localStorage.getItem('lw_ocr_text') || ''
    let caseNum = ''
    if (ocrRaw) {
      const m = ocrRaw.match(/([（(]\d{4}[）)][^\n]{2,10}民初|民终|民申|刑初|刑终|行初|行终)\d+号/)
      if (m) caseNum = m[0].replace(/\s/g, '')
    }
    let caseInfo: any = {}
    try { caseInfo = JSON.parse(caseInfoRaw || '{}') } catch {}
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
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  async function startStreaming() {
    const infoStr = localStorage.getItem('lw_analyze_info') || '{}'
    const ocrText = localStorage.getItem('lw_ocr_text') || ''

    try {
      const res = await fetch('/api/generate-appeal-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          info: JSON.parse(infoStr),
          ocr_text: ocrText,
        }),
      })

      if (!res.ok) {
        setError('请求失败: ' + res.status)
        setIsGenerating(false)
        return
      }

      const reader = res.body?.getReader()
      if (!reader) { setError('无法读取响应流'); setIsGenerating(false); return }

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        let eventEnd = buffer.indexOf('\n\n')
        while (eventEnd >= 0) {
          const eventData = buffer.slice(0, eventEnd)
          buffer = buffer.slice(eventEnd + 2)
          eventEnd = buffer.indexOf('\n\n')

          for (const line of eventData.split('\n')) {
            const trimmed = line.trim()
            if (!trimmed.startsWith('data:')) continue
            const jsonStr = trimmed.slice(5).trim()
            if (!jsonStr) continue
            try {
              const data = JSON.parse(jsonStr)
              if (data.type === 'chunk') {
                setStreamingText(prev => prev + data.content)
              } else if (data.type === 'done') {
                const finalText = data.appeal || streamingText
                setAppealText(finalText)
                setEditedText(finalText)
                localStorage.setItem('lw_appeal_text', finalText)
                if (data.legal_basis?.length > 0) {
                  setLegalBasis(data.legal_basis)
                  localStorage.setItem('lw_legal_basis', JSON.stringify(data.legal_basis))
                }
                setIsGenerating(false)
                setStreamDone(true)
                return
              } else if (data.type === 'error') {
                setError(data.error)
                setIsGenerating(false)
                return
              }
            } catch { /* ignore parse errors */ }
          }
        }
      }
    } catch (err: any) {
      setError(err.message)
      setIsGenerating(false)
    }
  }

  function handleCopy() {
    navigator.clipboard.writeText(editedText).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
  }

  function handleExport(format: 'txt' | 'docx' = 'txt') {
    if (format === 'docx') {
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:SimSun,serif;font-size:14pt;line-height:2;padding:1.5cm;text-align:justify;}</style></head><body><p style="text-align:center;font-size:18pt;font-weight:bold;letter-spacing:6pt;margin-bottom:30px;">民事上诉状</p>${editedText.replace(/\n/g, '<br>')}</body></html>`
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

  if (loading) return <div style={{ minHeight: '100vh', background: '#F8F9FA', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit', color: '#86868B', fontSize: '15px' }}>加载中...</div>

  // Error state
  if (error && !appealText) return (
    <div style={{ minHeight: '100vh', background: '#F8F9FA', fontFamily: 'inherit' }}>
      <nav style={{ padding: '12px 16px', background: '#FFF', borderBottom: '1px solid #E8EAED' }}>
        <button onClick={() => router.push('/')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', fontWeight: 600, color: '#1D1D1F' }}>诉状助手</button>
      </nav>
      <div style={{ maxWidth: 520, margin: '80px auto', textAlign: 'center', padding: '0 32px' }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>⚠️</div>
        <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#1D1D1F', marginBottom: 8 }}>生成失败</h2>
        <p style={{ fontSize: '14px', color: '#D93025', marginBottom: 24 }}>{error}</p>
        <button onClick={() => router.push('/confirm')} style={{ padding: '12px 24px', background: '#0071E3', color: '#FFF', border: 'none', borderRadius: 980, cursor: 'pointer', fontSize: '15px', fontWeight: 600 }}>返回修改</button>
      </div>
    </div>
  )

  // Display text
  const displayText = appealText || streamingText

  return (
    <div style={{ minHeight: '100vh', background: '#F8F9FA', fontFamily: 'inherit' }}>
      {/* 导航 */}
      <nav style={{ padding: 'clamp(12px, 2vw, 16px) clamp(16px, 3vw, 24px)', background: '#FFF', borderBottom: '1px solid #E8EAED', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, zIndex: 100 }}>
        <button onClick={() => router.push('/')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 'clamp(15px, 2vw, 18px)', fontWeight: 600, color: '#1D1D1F', padding: '8px 0' }}>诉状助手</button>
        {streamDone && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button onClick={handleCopy} style={{ padding: 'clamp(6px, 1vw, 8px) clamp(10px, 2vw, 14px)', background: '#FFF', border: '1px solid #E0E0E0', borderRadius: 8, cursor: 'pointer', fontSize: 'clamp(11px, 1.5vw, 13px)', fontWeight: 500, color: copied ? '#0071E3' : '#1D1D1F', minHeight: 36 }}>{copied ? '✓ 已复制' : '复制'}</button>
            <div style={{ position: 'relative', display: 'inline-block' }}>
              <button onClick={() => setIsExportMenu(v => !v)} style={{ padding: 'clamp(6px, 1vw, 8px) clamp(10px, 2vw, 14px)', background: '#FFF', border: '1px solid #E0E0E0', borderRadius: 8, cursor: 'pointer', fontSize: 'clamp(11px, 1.5vw, 13px)', fontWeight: 500, color: '#1D1D1F', minHeight: 36 }}>导出 ▾</button>
              {isExportMenu && (
                <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, background: '#FFF', borderRadius: 10, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', border: '1px solid #E8E8ED', overflow: 'hidden', zIndex: 10, minWidth: 130 }}>
                  <button onClick={() => { handleExport('txt'); setIsExportMenu(false) }} style={{ display: 'block', width: '100%', padding: '10px 16px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', color: '#1D1D1F', textAlign: 'left', borderBottom: '1px solid #F0F0F0' }}>TXT 文本</button>
                  <button onClick={() => { handleExport('docx'); setIsExportMenu(false) }} style={{ display: 'block', width: '100%', padding: '10px 16px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', color: '#1D1D1F', textAlign: 'left' }}>DOC Word</button>
                </div>
              )}
            </div>
            <button onClick={handleRegenerate} style={{ padding: 'clamp(6px, 1vw, 8px) clamp(10px, 2vw, 14px)', background: '#FFF', border: '1px solid #E0E0E0', borderRadius: 8, cursor: 'pointer', fontSize: 'clamp(11px, 1.5vw, 13px)', color: '#86868B', minHeight: 36 }}>新任务</button>
          </div>
        )}
        {!streamDone && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid #0071E3', borderTopColor: 'transparent', animation: 'spin 1s linear infinite' }} />
            <span style={{ fontSize: '13px', color: '#0071E3', fontWeight: 500 }}>{isGenerating ? '生成中' : '请稍候'}</span>
          </div>
        )}
      </nav>

      <div style={{ padding: 'clamp(16px, 3vw, 24px) clamp(16px, 3vw, 24px) clamp(60px, 8vw, 96px)', maxWidth: 'clamp(400px, 95vw, 840px)', margin: '0 auto' }}>
        {streamDone && (
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <p style={{ fontSize: 'clamp(12px, 1.8vw, 14px)', color: '#86868B', margin: 0 }}>{editedText.length} 字</p>
          </div>
        )}

        <div style={{ background: '#FFF', borderRadius: 14, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
          {/* 工具栏 */}
          {streamDone && (
            <div style={{ padding: 'clamp(12px, 2vw, 16px) clamp(14px, 2.5vw, 18px)', borderBottom: '1px solid #F5F5F5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: 'clamp(14px, 2vw, 16px)', fontWeight: 600, color: '#1D1D1F', margin: 0 }}>民事上诉状</h2>
              <button onClick={() => setIsEditing(!isEditing)} style={{ background: isEditing ? '#0071E3' : '#F5F5F7', color: isEditing ? '#FFF' : '#1D1D1F', border: 'none', borderRadius: 980, padding: 'clamp(6px, 1vw, 8px) clamp(12px, 2vw, 16px)', cursor: 'pointer', fontSize: 'clamp(12px, 1.8vw, 14px)', fontWeight: 500, transition: 'all 0.2s' }}>{isEditing ? '完成编辑' : '编辑'}</button>
            </div>
          )}

          {/* 内容 */}
          {isEditing ? (
            <textarea value={editedText} onChange={e => setEditedText(e.target.value)} style={{ width: '100%', minHeight: 'clamp(300px, 50vw, 500px)', border: 'none', padding: 'clamp(14px, 2vw, 18px)', fontSize: 'clamp(13px, 2vw, 15px)', lineHeight: 1.9, color: '#1D1D1F', fontFamily: 'inherit', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
          ) : (
            <div style={{ padding: 'clamp(14px, 2vw, 18px)', fontSize: 'clamp(13px, 2vw, 15px)', lineHeight: 1.9, color: '#1D1D1F', whiteSpace: 'pre-wrap', wordBreak: 'break-word', minHeight: 'clamp(200px, 40vw, 300px)' }}>
              {displayText}
              {isGenerating && <span style={{ display: 'inline-block', width: 2, height: 14, background: '#0071E3', marginLeft: 2, verticalAlign: 'middle', animation: 'blink 1s step-end infinite' }} />}
              <div ref={streamEndRef} />
            </div>
          )}

          {/* 生成中：进度提示 */}
          {isGenerating && (
            <div style={{ padding: '12px 18px', borderTop: '1px solid #F5F5F5', display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#0071E3', animation: 'pulse 1.5s infinite' }} />
              <span style={{ fontSize: '12px', color: '#86868B' }}>AI 正在撰写上诉状，预计需要 30-60 秒...</span>
            </div>
          )}
        </div>

        {/* 完成后的操作按钮 */}
        {streamDone && (
          <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={() => router.push('/')} style={{ flex: 1, minWidth: 140, padding: '14px', background: '#0071E3', color: '#FFF', border: 'none', borderRadius: 12, cursor: 'pointer', fontSize: 15, fontWeight: 600, minHeight: 48 }}>
                📄 开始新任务
              </button>
              <button onClick={() => router.push('/history')} style={{ flex: 1, minWidth: 140, padding: '14px', background: '#FFF', color: '#0071E3', border: '1px solid #0071E3', borderRadius: 12, cursor: 'pointer', fontSize: 15, fontWeight: 500, minHeight: 48 }}>
                📋 查看历史
              </button>
            </div>
          </div>
        )}

        {/* 法律依据 */}
        {streamDone && legalBasis.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <button onClick={() => setShowBasis(!showBasis)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 'clamp(13px, 1.8vw, 15px)', fontWeight: 600, color: '#0071E3', display: 'flex', alignItems: 'center', gap: 6 }}>
              {showBasis ? '▾' : '▸'} 法律依据（{legalBasis.length} 条）
            </button>
            {showBasis && (
              <div style={{ marginTop: 10, background: '#FFF', borderRadius: 14, padding: 'clamp(14px, 2vw, 18px)', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
                {legalBasis.map((article, i) => (
                  <div key={i} style={{ padding: '8px 10px', borderRadius: 8, marginBottom: i < legalBasis.length - 1 ? 6 : 0, background: '#F8F9FA', fontSize: 'clamp(12px, 1.8vw, 14px)', fontWeight: 500, color: '#1D1D1F' }}>{article}</div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes blink { 50% { opacity: 0; } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
      `}</style>
    </div>
  )
}
