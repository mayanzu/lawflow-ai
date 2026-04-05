'use client'
import { useState, useEffect, useRef, Suspense } from 'react'
import { useRouter } from 'next/navigation'

type Info = { 案号: string; 案由: string; 原告: string; 被告: string; 判决法院: string; 判决结果: string; 上诉期限: string; 上诉法院: string; 判决日期: string }

const INITIAL_INFO: Info = { 案号:'', 案由:'', 原告:'', 被告:'', 判决法院:'', 判决结果:'', 上诉期限:'', 上诉法院:'', 判决日期:'' }

export default function ResultPage() {
  const router = useRouter()
  const [streamingText, setStreamingText] = useState('')
  const [editedText, setEditedText] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [copied, setCopied] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [streamDone, setStreamDone] = useState(false)
  const [isExportMenu, setIsExportMenu] = useState(false)
  const [info, setInfo] = useState<Info>(INITIAL_INFO)
  const [daysLeft, setDaysLeft] = useState<number | null>(null)
  const [appealDeadline, setAppealDeadline] = useState<number | null>(null)
  const [step, setStep] = useState<'analyzing' | 'generating' | 'done'>('analyzing')
  const [analyzingProgress, setAnalyzingProgress] = useState(0)
  const [legalBasis, setLegalBasis] = useState<string[]>([])
  const [showBasis, setShowBasis] = useState(false)
  const [isValidating, setIsValidating] = useState(false)
  const [validateResults, setValidateResults] = useState<any>(null)
  const [showValidate, setShowValidate] = useState(false)
  const streamEndRef = useRef<HTMLDivElement>(null)

  function parseChineseDate(s: string): Date | null {
    if (!s || s.trim() === '') return null
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(s + 'T00:00:00')
    const m = s.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/)
    if (m) return new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]))
    return null
  }

  function calcDeadline(判决日期: string, 上诉期限: string) {
    const d = parseChineseDate(判决日期)
    if (!d || isNaN(d.getTime())) return
    const days = parseInt(上诉期限) || 15
    const deadline = new Date(d)
    deadline.setDate(deadline.getDate() + days)
    setAppealDeadline(deadline.getTime())
    setDaysLeft(Math.ceil((deadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
  }

  useEffect(() => {
    const raw = localStorage.getItem('lw_analyze_info')
    const ocr = localStorage.getItem('lw_ocr_text') || ''
    if (raw) {
      try {
        const parsed = JSON.parse(raw)
        const parsedInfo: Info = {
          案号: parsed.案号||'', 案由: parsed.案由||'', 原告: parsed.原告||'',
          被告: parsed.被告||'', 判决法院: parsed.判决法院||'',
          判决结果: parsed.判决结果||'', 上诉期限: parsed.上诉期限||'',
          上诉法院: parsed.上诉法院||'', 判决日期: parsed.判决日期||''
        }
        setInfo(parsedInfo)
        calcDeadline(parsedInfo.判决日期 || '2024-01-01', parsedInfo.上诉期限 || '15')
      } catch { setStep('analyzing') }
    }
    // Auto-continue to generation if data exists
    if (raw && editedText === '' && streamingText === '') {
      startGenerating()
    }
    // Save history entry
    const fileId = localStorage.getItem('lw_file_id') || ''
    const fileName = localStorage.getItem('lw_file_name') || '未知文件'
    let caseInfo: any = {}
    try { caseInfo = JSON.parse(raw || '{}') } catch {}
    const entry: any = {
      id: fileId, fileName, uploadTime: new Date().toISOString(),
      案号: caseInfo.案号 || '未识别', 原告: caseInfo.原告 || '未知',
      被告: caseInfo.被告 || '未知', 判决法院: caseInfo.判决法院 || '',
      案由: caseInfo.案由 || '', 上诉法院: caseInfo.上诉法院 || '',
      判决日期: caseInfo.判决日期 || '', analyzeInfo: caseInfo,
    }
    try {
      const historyRaw = localStorage.getItem('lw_history')
      let history: any[] = []
      try { history = JSON.parse(historyRaw || '[]') } catch {}
      const existing = history.findIndex(h => h.id === fileId || (h.fileName === fileName && h.uploadTime === entry.uploadTime))
      if (existing >= 0) { history[existing] = { ...history[existing], ...entry } }
      else { history.unshift(entry) }
      localStorage.setItem('lw_history', JSON.stringify(history.slice(0, 20)))
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function startGenerating() {
    setStep('generating')
    setIsGenerating(true)
    setStreamingText('')
    setStreamDone(false)
    try {
      const infoStr = JSON.stringify(info)
      const ocrText = localStorage.getItem('lw_ocr_text') || ''
      const res = await fetch('/api/generate-appeal-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ info, ocr_text: ocrText }),
      })
      if (!res.ok) { setIsGenerating(false); setStep('done'); return }
      const reader = res.body?.getReader()
      if (!reader) { setIsGenerating(false); setStep('done'); return }
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
                const finalText = (data.appeal || '').trim()
                setEditedText(finalText)
                setStreamingText(finalText)
                localStorage.setItem('lw_appeal_text', finalText)
                try {
                  const hist = JSON.parse(localStorage.getItem('lw_history') || '[]')
                  const fid = localStorage.getItem('lw_file_id') || ''
                  const idx = hist.findIndex((h: any) => h.id === fid)
                  if (idx >= 0) { hist[idx].appealText = finalText; localStorage.setItem('lw_history', JSON.stringify(hist)) }
                } catch {}
                if (data.legal_basis?.length > 0) {
                  setLegalBasis(data.legal_basis)
                  localStorage.setItem('lw_legal_basis', JSON.stringify(data.legal_basis))
                }
                setStreamDone(true)
                setStep('done')
                setIsGenerating(false)
              } else if (data.type === 'error') {
                setIsGenerating(false)
              }
            } catch {}
          }
        }
      }
    } catch { setIsGenerating(false) }
    setStreamDone(true)
    setStep('done')
    setIsGenerating(false)
  }

  function handleFieldChange(field: keyof Info, value: string) {
    setInfo(prev => ({ ...prev, [field]: value }))
  }

  async function handleRegenerate() {
    localStorage.setItem('lw_analyze_info', JSON.stringify(info))
    calcDeadline(info.判决日期, info.上诉期限)
    await startGenerating()
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

  const isUrgent = daysLeft !== null && daysLeft <= 7
  const isExpired = daysLeft !== null && daysLeft <= 0
  const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 12px', border: '1px solid #E0E0E0', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', color: '#1D1D1F', outline: 'none', boxSizing: 'border-box', background: '#FFF' }
  const labelStyle: React.CSSProperties = { fontSize: 10, fontWeight: 600, color: '#86868B', display: 'block', marginBottom: 4, letterSpacing: '0.04em' }
  const displayText = editedText || streamingText

  return (
    <div style={{ minHeight: '100vh', background: '#FFFFFF', fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif' }}>
      <nav style={{ backdropFilter: 'saturate(180%) blur(20px)', WebkitBackdropFilter: 'saturate(180%) blur(20px)', background: 'rgba(255,255,255,0.85)', borderBottom: '1px solid rgba(0,0,0,0.08)' }}>
        <div style={{ maxWidth: 980, margin: '0 auto', padding: '0 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: 52 }}>
          <button onClick={() => router.push('/')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#0071E3', fontWeight: 500 }}>返回首页</button>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#1D1D1F', letterSpacing: '-0.02em' }}>生成结果</span>
          <div style={{ width: 40 }} />
        </div>
      </nav>

      <main style={{ maxWidth: 720, margin: '0 auto', padding: '32px 24px 80px' }}>
        {/* 步骤指示 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 32 }}>
          {['OCR 识别', '信息确认', '生成诉状'].map((label, i) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, background: (step === 'analyzing' && i === 0) || (step === 'generating' && i <= 1) || (step === 'done' && i <= 2) ? '#0071E3' : '#E5E5EA', color: (step === 'analyzing' && i === 0) || (step === 'generating' && i <= 1) || (step === 'done' && i <= 2) ? '#FFF' : '#86868B' }}>{i+1}</div>
              <span style={{ fontSize: 13, color: (step === 'analyzing' && i === 0) || (step === 'generating' && i <= 1) || (step === 'done' && i <= 2) ? '#1D1D1F' : '#86868B' }}>{label}</span>
              {i < 2 && <div style={{ width: 32, height: 1, background: '#E5E5EA' }} />}
            </div>
          ))}
        </div>

        {/* 期限提示 */}
        {daysLeft !== null && (
          <div style={{ marginBottom: 24, padding: '12px 16px', borderRadius: 12,
            background: isExpired ? '#FEF0EF' : isUrgent ? '#FFF8F0' : '#F0F9F0',
            border: `1px solid ${isExpired ? '#F5C6C5' : isUrgent ? '#FFE0B2' : '#C8E6C9'}`
          }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: isExpired ? '#D93025' : isUrgent ? '#E65100' : '#2E7D32' }}>
              {isExpired ? '上诉期已届满' : `上诉剩余 ${daysLeft} 天`}
            </div>
          </div>
        )}

        {/* 案件信息卡片（可编辑） */}
        {step === 'generating' || step === 'done' ? (
          <section style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h2 style={{ fontSize: 11, fontWeight: 600, color: '#86868B', letterSpacing: '0.06em', margin: 0 }}>案件信息</h2>
              <button onClick={handleRegenerate} disabled={isGenerating} style={{ padding: '6px 14px', background: isGenerating ? '#86868B' : '#0071E3', color: '#FFF', border: 'none', borderRadius: 980, cursor: isGenerating ? 'wait' : 'pointer', fontSize: 12, fontWeight: 500 }}>
                {isGenerating ? '生成中...' : '按此信息重新生成'}
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {(['案号','案由','判决法院','判决日期'] as const).map(field => (
                <div key={field}>
                  <label style={labelStyle}>{field}</label>
                  <input type={field === '判决日期' ? 'date' : 'text'} value={info[field]} onChange={e => handleFieldChange(field, e.target.value)} style={inputStyle} />
                </div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
              {(['原告','被告','上诉期限','上诉法院'] as const).map(field => (
                <div key={field}>
                  <label style={labelStyle}>{field}</label>
                  <input type="text" value={info[field]} onChange={e => handleFieldChange(field, e.target.value)} style={inputStyle} />
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {/* 生成中/结果 */}
        {isGenerating && step === 'generating' && !streamDone && (
          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', border: '3px solid #F0F0F0', borderTopColor: '#0071E3', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
            <p style={{ fontSize: 15, color: '#86868B' }}>AI 正在撰写法律文书...</p>
          </div>
        )}

        {streamDone && !isEditing && (
          <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <p style={{ fontSize: 12, color: '#86868B', margin: 0 }}>{editedText.length.toLocaleString()} 字</p>
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={() => setIsEditing(true)} style={{ padding: '8px 16px', background: '#0071E3', color: '#FFF', border: 'none', borderRadius: 980, cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>编辑</button>
              <div style={{ position: 'relative', display: 'inline-block' }}>
                <button onClick={() => setIsExportMenu(v => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#86868B', fontWeight: 500 }}>导出</button>
                {isExportMenu && (
                  <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, background: '#FFF', borderRadius: 10, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', border: '1px solid #E8E8ED', overflow: 'hidden', zIndex: 10, minWidth: 120 }}>
                    <button onClick={() => { handleExport('txt'); setIsExportMenu(false) }} style={{ display: 'block', width: '100%', padding: '10px 16px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#1D1D1F', textAlign: 'left', borderBottom: '1px solid #F0F0F0' }}>TXT 文本</button>
                    <button onClick={() => { handleExport('docx'); setIsExportMenu(false) }} style={{ display: 'block', width: '100%', padding: '10px 16px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#1D1D1F', textAlign: 'left' }}>DOC Word</button>
                  </div>
                )}
              </div>
              <button onClick={handleCopy} style={{ padding: '8px 16px', background: '#FFF', color: '#1D1D1F', border: '1px solid #E0E0E0', borderRadius: 980, cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>{copied ? '已复制' : '复制'}</button>
            </div>
          </div>
        )}

        {displayText && (
          <div style={{ background: '#F8F9FA', borderRadius: 16, overflow: 'hidden' }}>
            {isEditing ? (
              <textarea value={editedText} onChange={e => setEditedText(e.target.value)} style={{ width: '100%', minHeight: '500px', border: 'none', padding: '24px', fontSize: 15, lineHeight: 2, color: '#1D1D1F', fontFamily: 'inherit', outline: 'none', resize: 'vertical', boxSizing: 'border-box', background: '#FFF' }} />
            ) : (
              <div style={{ padding: '28px 24px', fontSize: 15, lineHeight: 2, color: '#1D1D1F', whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: '#FFF' }}>
                {displayText}
                {isGenerating && <span style={{ display: 'inline-block', width: 2, height: 16, background: '#0071E3', marginLeft: 2, verticalAlign: 'middle', animation: 'blink 1s step-end infinite' }} />}
                <div ref={streamEndRef} />
              </div>
            )}
          </div>
        )}

        {isEditing && (
          <div style={{ marginTop: 16, display: 'flex', gap: 12 }}>
            <button onClick={() => { setIsEditing(false); localStorage.setItem('lw_appeal_text', editedText) }} style={{ flex: 2, padding: '14px 20px', background: '#0071E3', color: '#FFF', border: 'none', borderRadius: 12, cursor: 'pointer', fontSize: 15, fontWeight: 600 }}>保存</button>
            <button onClick={() => setIsEditing(false)} style={{ flex: 1, padding: '14px 20px', background: '#FFF', color: '#1D1D1F', border: '1px solid #E0E0E0', borderRadius: 12, cursor: 'pointer', fontSize: 15, fontWeight: 500 }}>取消</button>
          </div>
        )}

        {step === 'done' && (
          <div style={{ marginTop: 32, display: 'flex', gap: 12 }}>
            <button onClick={() => router.push('/')} style={{ flex: 1, padding: '14px 20px', background: '#FFF', color: '#0071E3', border: '1px solid #0071E3', borderRadius: 12, cursor: 'pointer', fontSize: 14, fontWeight: 500 }}>新建任务</button>
          </div>
        )}
      </main>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } } @keyframes blink { 50% { opacity: 0; } }`}</style>
    </div>
  )
}
