'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

export default function ResultPage() {
  const router = useRouter()
  const [streamingText, setStreamingText] = useState('')
  const [editedText, setEditedText] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [copied, setCopied] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [streamDone, setStreamDone] = useState(false)
  const [isExportMenu, setIsExportMenu] = useState(false)
  const [isValidating, setIsValidating] = useState(false)
  const [validateResults, setValidateResults] = useState<any>(null)
  const [showValidate, setShowValidate] = useState(false)
  const [legalBasis, setLegalBasis] = useState<string[]>([])
  const [showBasis, setShowBasis] = useState(false)
  const streamEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const raw = localStorage.getItem('lw_appeal_text')
    if (raw) {
      setEditedText(raw)
      setStreamDone(true)
    } else {
      startStreaming()
    }
    // Save history
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
    const entry: any = {
      id: fileId || `manual_${Date.now()}`,
      fileName,
      uploadTime: new Date().toISOString(),
      案号: caseInfo.案号 || caseNum || '未识别',
      原告: caseInfo.原告 || '未知',
      被告: caseInfo.被告 || '未知',
      判决法院: caseInfo.判决法院 || '',
      案由: caseInfo.案由 || '',
      上诉法院: caseInfo.上诉法院 || '',
      判决日期: caseInfo.判决日期 || '',
      analyzeInfo: caseInfo,
    }
    try {
      const historyRaw = localStorage.getItem('lw_history')
      let history: any[] = []
      try { history = JSON.parse(historyRaw || '[]') } catch {}
      const existing = history.findIndex(h => h.id === entry.id)
      // 合并更新数据，不覆盖已有的上诉文书
      if (existing >= 0) {
        history[existing] = { ...history[existing], ...entry }
      } else {
        history.unshift(entry)
      }
      history = history.slice(0, 20)
      localStorage.setItem('lw_history', JSON.stringify(history))
    } catch {}
    const basisStr = localStorage.getItem('lw_legal_basis')
    if (basisStr) { try { setLegalBasis(JSON.parse(basisStr)) } catch {} }
  }, [])

  useEffect(() => {
    if (streamEndRef.current && isGenerating) {
      streamEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [streamingText, isGenerating])

  async function startStreaming() {
    setIsGenerating(true)
    setStreamDone(false)
    setStreamingText('')
    try {
      const infoStr = localStorage.getItem('lw_analyze_info') || '{}'
      const ocrText = localStorage.getItem('lw_ocr_text') || ''
      // 非流式接口，结果完整后直接显示
      const res = await fetch('/api/generate-appeal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ info: JSON.parse(infoStr), ocr_text: ocrText }),
      })
      if (!res.ok) { setIsGenerating(false); setStreamDone(true); return }
      const data = await res.json()
      if (data.success && data.appeal) {
        const finalText = data.appeal
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
      }
    } catch { setIsGenerating(false) }
    setStreamDone(true)
    setIsGenerating(false)
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

  async function handleValidate() {
    const text = localStorage.getItem('lw_appeal_text') || editedText
    const infoRaw = localStorage.getItem('lw_analyze_info') || '{}'
    let info: any = {}
    try { info = JSON.parse(infoRaw) } catch {}
    setIsValidating(true)
    setShowValidate(true)
    try {
      const res = await fetch('http://163.7.1.176:3457/validate-appeal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appeal_text: text, info })
      })
      const data = await res.json()
      setValidateResults(data)
    } catch (e: any) {
      setValidateResults({ success: false, error: e.message })
    }
    setIsValidating(false)
  }

  function handleRegenerate() {
    if (!confirm('重新生成将清空当前内容，确定继续？')) return
    Object.keys(localStorage).filter(k => k.startsWith('lw_') || k === 'wf_started').forEach(k => localStorage.removeItem(k))
    router.push('/')
  }

  const displayText = editedText || streamingText

  return (
    <div style={{ minHeight: '100vh', background: '#FFFFFF', fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif' }}>
      {/* 导航栏 */}
      <nav style={{ backdropFilter: 'saturate(180%) blur(20px)', WebkitBackdropFilter: 'saturate(180%) blur(20px)', background: 'rgba(255,255,255,0.85)', borderBottom: '1px solid rgba(0,0,0,0.08)', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ maxWidth: 980, margin: '0 auto', padding: '0 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: 52 }}>
          <button onClick={() => router.push('/')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#0071E3', fontWeight: 500 }}>返回首页</button>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#1D1D1F', letterSpacing: '-0.02em' }}>民事上诉状</span>
          {streamDone && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <button onClick={handleCopy} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: copied ? '#0071E3' : '#86868B', fontWeight: 500 }}>{copied ? '已复制' : '复制'}</button>
              <div style={{ position: 'relative', display: 'inline-block' }}>
                <button onClick={() => setIsExportMenu(v => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#86868B', fontWeight: 500, padding: '0 4px' }}>导出</button>
                {isExportMenu && (
                  <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, background: '#FFF', borderRadius: 10, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', border: '1px solid #E8E8ED', overflow: 'hidden', zIndex: 10, minWidth: 120 }}>
                    <button onClick={() => { handleExport('txt'); setIsExportMenu(false) }} style={{ display: 'block', width: '100%', padding: '10px 16px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#1D1D1F', textAlign: 'left', borderBottom: '1px solid #F0F0F0' }}>TXT 文本</button>
                    <button onClick={() => { handleExport('docx'); setIsExportMenu(false) }} style={{ display: 'block', width: '100%', padding: '10px 16px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#1D1D1F', textAlign: 'left' }}>DOC Word</button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </nav>

      {/* 主内容 */}
      <main style={{ maxWidth: 720, margin: '0 auto', padding: '40px 24px 80px' }}>
        {isGenerating && !streamDone && (
          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', border: '3px solid #F0F0F0', borderTopColor: '#0071E3', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
            <p style={{ fontSize: 15, color: '#86868B' }}>AI 正在撰写法律文书...</p>
          </div>
        )}

        {streamDone && !isEditing && (
          <div style={{ marginBottom: 32, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <p style={{ fontSize: 12, color: '#86868B', margin: 0 }}>{editedText.length.toLocaleString()} 字</p>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={handleValidate} style={{ padding: '10px 20px', background: validateResults?.overall === 'error' ? '#FF3B30' : validateResults?.overall === 'warning' ? '#FF9500' : '#34C759', color: '#FFF', border: 'none', borderRadius: 980, cursor: 'pointer', fontSize: 14, fontWeight: 500 }}>校验</button>
              <button onClick={() => setIsEditing(true)} style={{ padding: '10px 20px', background: '#0071E3', color: '#FFF', border: 'none', borderRadius: 980, cursor: 'pointer', fontSize: 14, fontWeight: 500 }}>编辑</button>
              <button onClick={handleRegenerate} style={{ padding: '10px 20px', background: '#FFF', color: '#0071E3', border: '1px solid #0071E3', borderRadius: 980, cursor: 'pointer', fontSize: 14, fontWeight: 500 }}>新建任务</button>
            </div>
          </div>
        )}

        {/* 诉状内容 */}
        {displayText && (
          <div style={{ background: '#F8F9FA', borderRadius: 16, overflow: 'hidden' }}>
            {isEditing ? (
              <textarea
                value={editedText}
                onChange={e => setEditedText(e.target.value)}
                style={{ width: '100%', minHeight: '500px', border: 'none', padding: '24px', fontSize: 15, lineHeight: 2, color: '#1D1D1F', fontFamily: 'inherit', outline: 'none', resize: 'vertical', boxSizing: 'border-box', background: '#FFF' }}
              />
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

        {/* 校验结果 */}
        {showValidate && (
          <div style={{ marginBottom: 32 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: '#1D1D1F', margin: 0 }}>诉状校验结果</h3>
              <button onClick={() => setShowValidate(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#86868B' }}>关闭</button>
            </div>
            {isValidating ? (
              <div style={{ textAlign: 'center', padding: '24px 0' }}>
                <div style={{ width: 24, height: 24, borderRadius: '50%', border: '2px solid #F0F0F0', borderTopColor: '#0071E3', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
                <p style={{ fontSize: 13, color: '#86868B', margin: 0 }}>校验中...</p>
              </div>
            ) : validateResults?.success === false ? (
              <div style={{ padding: '16px', background: '#FEF0EF', borderRadius: 12, color: '#D93025', fontSize: 13 }}>{validateResults.error || "校验失败"}</div>
            ) : validateResults?.results ? (
              <div>
                <div style={{ padding: '12px 16px', borderRadius: 12, marginBottom: 12, fontSize: 13, fontWeight: 600,
                  background: validateResults.overall === 'ok' ? '#F0FAF0' : validateResults.overall === 'warning' ? '#FFF8F0' : '#FEF0EF',
                  color: validateResults.overall === 'ok' ? '#2E7D32' : validateResults.overall === 'warning' ? '#E65100' : '#D93025'
                }}>
                  {validateResults.overall === 'ok' ? '校验通过' : validateResults.overall === 'warning' ? '存在警告' : '存在错误'} — 通过{validateResults.ok}/{validateResults.results.length}项，警告{validateResults.warnings}项，错误{validateResults.errors}项
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {validateResults.results.map((r: any, i: number) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px', background: '#F8F9FA', borderRadius: 10 }}>
                      <span style={{ width: 20, height: 20, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, marginTop: 1,
                        background: r.status === 'ok' ? '#34C759' : r.status === 'warning' ? '#FF9500' : '#FF3B30',
                        color: '#FFF'
                      }}>{r.status === 'ok' ? '✓' : r.status === 'warning' ? '!': '✗'}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#1D1D1F' }}>{r.check}</div>
                        <div style={{ fontSize: 12, color: r.status === 'ok' ? '#86868B' : r.status === 'warning' ? '#E65100' : '#D93025', marginTop: 2, lineHeight: 1.5 }}>{r.msg}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )}

        {/* 法律依据 */}
        {legalBasis.length > 0 && (
          <div style={{ marginTop: 32 }}>
            <div style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }} onClick={() => setShowBasis(!showBasis)}>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: '#1D1D1F', margin: 0 }}>引用法律条文</h3>
              <span style={{ fontSize: 13, color: '#86868B' }}>{showBasis ? '收起' : '展开'}</span>
            </div>
            {showBasis && (
              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {legalBasis.map((article, i) => (
                  <div key={i} style={{ padding: '10px 14px', background: '#F8F9FA', borderRadius: 10, fontSize: 13, color: '#1D1D1F', lineHeight: 1.6 }}>{article}</div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 底部操作 */}
        {streamDone && !isGenerating && (
          <div style={{ marginTop: 40, display: 'flex', gap: 12 }}>
            <button onClick={() => router.push('/')} style={{ flex: 1, padding: '14px 20px', background: '#0071E3', color: '#FFF', border: 'none', borderRadius: 12, cursor: 'pointer', fontSize: 15, fontWeight: 600 }}>新建任务</button>
            <button onClick={() => router.push('/history')} style={{ flex: 1, padding: '14px 20px', background: '#FFF', color: '#0071E3', border: '1px solid #0071E3', borderRadius: 12, cursor: 'pointer', fontSize: 15, fontWeight: 500 }}>查看历史</button>
          </div>
        )}
      </main>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes blink { 50% { opacity: 0; } }
      `}</style>
    </div>
  )
}
