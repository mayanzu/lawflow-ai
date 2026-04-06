'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { C, Nav, Card, Btn, Spinner, Icons } from '@/ui'

const DOC_TYPES = [
  { key: 'appeal',         name: '民事上诉状',   desc: '不服一审判决' },
  { key: 'complaint',      name: '民事起诉状',   desc: '新案立案' },
  { key: 'defense',        name: '民事答辩状',   desc: '被诉后答辩' },
  { key: 'representation', name: '代理词',       desc: '庭审总结' },
  { key: 'execution',      name: '执行申请书',   desc: '申请强制执行' },
  { key: 'preservation',   name: '保全申请书',   desc: '诉讼中保全' },
]

export default function ResultPage() {
  const router = useRouter()
  const [streamingText, setStreamingText] = useState('')
  const [editedText, setEditedText] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [copied, setCopied] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [streamDone, setStreamDone] = useState(false)
  const [isExportMenu, setIsExportMenu] = useState(false)
  const [docType, setDocType] = useState('appeal')
  const [infoFields, setInfoFields] = useState<Record<string, string>>({})
  const [legalBasis, setLegalBasis] = useState<string[]>([])
  const [showBasis, setShowBasis] = useState(false)
  const streamEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Read saved info
    const raw = localStorage.getItem('lw_analyze_info')
    if (raw) {
      try {
        const parsed = JSON.parse(raw)
        // Convert date for input
        if (parsed.判决日期) {
          const m = String(parsed.判决日期).match(/(\d{4})年(\d{1,2})月(\d{1,2})日/)
          if (m) parsed.判决日期 = `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`
        }
        setInfoFields(parsed)
      } catch {}
    }

    // Read doc type
    const savedDoc = localStorage.getItem('lw_doc_type')
    if (savedDoc) setDocType(savedDoc)

    // If result already exists, show it; otherwise start streaming
    const existing = localStorage.getItem('lw_appeal_text')
    if (existing) {
      setEditedText(existing)
      setStreamingText(existing)
      setStreamDone(true)
    } else if (raw) {
      startStreaming(savedDoc || 'appeal')
    }
  // eslint-disable-next-line
  }, [])

  useEffect(() => {
    if (streamEndRef.current && isGenerating) {
      streamEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [streamingText, isGenerating])

  async function startStreaming(typeOverride?: string) {
    const type = typeOverride || docType
    const savedDoc = localStorage.getItem('lw_doc_type')
    setIsGenerating(true); setStreamDone(false); setStreamingText(''); setEditedText('')
    try {
      const ocrText = localStorage.getItem('lw_ocr_text') || ''
      const info = JSON.parse(localStorage.getItem('lw_analyze_info') || '{}')
      const res = await fetch('/api/generate-appeal-stream', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ info, ocr_text: ocrText, doc_type: type }),
      })
      if (!res.ok) { setIsGenerating(false); return }
      const reader = res.body?.getReader()
      if (!reader) { setIsGenerating(false); return }
      const decoder = new TextDecoder(); let buffer = ''
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
            try {
              const data = JSON.parse(trimmed.slice(5).trim())
              if (data.type === 'chunk') setStreamingText(p => p + data.content)
              else if (data.type === 'done') {
                const finalText = (data.appeal || '').trim()
                setEditedText(finalText); setStreamingText(finalText)
                localStorage.setItem('lw_appeal_text', finalText)
                localStorage.setItem('lw_doc_type', type)
                // Save to history
                try {
                  const hist = JSON.parse(localStorage.getItem('lw_history') || '[]')
                  const fid = localStorage.getItem('lw_file_id') || ''
                  const idx = hist.findIndex((h: any) => h.id === fid)
                  if (idx >= 0) { hist[idx].appealText = finalText; localStorage.setItem('lw_history', JSON.stringify(hist)) }
                } catch {}
                if (data.legal_basis?.length > 0) { setLegalBasis(data.legal_basis); localStorage.setItem('lw_legal_basis', JSON.stringify(data.legal_basis)) }
                setStreamDone(true); setIsGenerating(false)
              }
            } catch {}
          }
        }
      }
    } catch { setIsGenerating(false) }
    setStreamDone(true); setIsGenerating(false)
  }

  function handleCopy() {
    navigator.clipboard.writeText(editedText).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
  }

  function handleExport(format: 'txt' | 'docx') {
    if (format === 'docx') {
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:SimSun,serif;font-size:14pt;line-height:2;padding:1.5cm;text-align:justify;}</style></head><body><p style="text-align:center;font-size:18pt;font-weight:bold;letter-spacing:6pt;margin-bottom:30px;">民事上诉状</p>${editedText.replace(/\n/g, '<br>')}</body></html>`
      const blob = new Blob(['\ufeff' + html], { type: 'application/msword' })
      const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = '民事上诉状.doc'; a.click()
      URL.revokeObjectURL(url)
    } else {
      const blob = new Blob([editedText], { type: 'text/plain;charset=utf-8' })
      const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `${DOC_TYPES.find(d=>d.key===docType)?.name || '文书'}.txt`; a.click()
      URL.revokeObjectURL(url)
    }
  }

  const isUrgent = false
  const displayText = editedText || streamingText

  return (
    <div style={{ minHeight: '100vh', background: C.bg }}>
      <Nav
        title={DOC_TYPES.find(d => d.key === docType)?.name || '生成结果'}
        left={
          <button onClick={() => router.push('/')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.blue, display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.9rem', fontWeight: 500 }}>
            {Icons.arrowLeft(16, C.blue)} 返回首页
          </button>
        }
        right={
          <button onClick={() => router.push('/history')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.blue, fontSize: '0.9rem', fontWeight: 500 }}>历史</button>
        }
      />

      <main style={{ maxWidth: 800, margin: '0 auto', padding: '32px 24px 80px' }}>
        {/* 信息卡片（可编辑） */}
        {Object.keys(infoFields).length > 0 && (
          <Card padding={24} style={{ marginBottom: 24 }}>
            <details style={{ cursor: 'pointer' }}>
              <summary style={{ fontSize: '0.75rem', fontWeight: 600, color: C.muted, letterSpacing: '0.06em', textTransform: 'uppercase' }}>案件信息（点击展开编辑）</summary>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 16 }}>
                {(['案号', '案由', '原告', '被告', '判决法院', '判决日期', '上诉期限', '上诉法院'] as const).map(k => (
                  <label key={k}>
                    <div style={{ fontSize: '0.7rem', fontWeight: 600, color: C.muted, marginBottom: 4 }}>{k}</div>
                    <input type={k === '判决日期' ? 'date' : 'text'} value={infoFields[k] || ''}
                      onChange={e => { const u = { ...infoFields, [k]: e.target.value }; setInfoFields(u); localStorage.setItem('lw_analyze_info', JSON.stringify(u)) }}
                      style={{ width: '100%', padding: '8px 10px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: '0.85rem', color: C.text, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', background: '#FFF' }} />
                  </label>
                ))}
              </div>
              <Btn variant="secondary" onClick={() => startStreaming()} style={{ marginTop: 16, width: '100%', fontSize: '0.85rem' }} disabled={isGenerating}>
                {isGenerating ? '正在重新生成...' : '按当前信息重新生成'}
              </Btn>
            </details>
          </Card>
        )}

        {/* 生成中 */}
        {isGenerating && !streamDone && (
          <Card padding={48} style={{ textAlign: 'center', marginBottom: 24 }}>
            <Spinner size={40} />
            <p style={{ fontSize: '1rem', fontWeight: 500, color: C.sub, marginTop: 20, marginBottom: 4 }}>
              AI 正在撰写{DOC_TYPES.find(d => d.key === docType)?.name}...
            </p>
            <p style={{ fontSize: '0.8rem', color: C.muted }}>请稍候，这可能需要 15-60 秒</p>
          </Card>
        )}

        {/* 结果 */}
        {displayText && (
          <Card padding={32} style={{ marginBottom: 24, minHeight: 300 }} hover={false}>
            {isEditing ? (
              <textarea value={editedText} onChange={e => setEditedText(e.target.value)}
                style={{ width: '100%', minHeight: '500px', border: `1px solid ${C.border}`, padding: 20, fontSize: '0.95rem', lineHeight: '2.2', color: C.text, outline: 'none', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box', background: '#FFF', borderRadius: 12 }} />
            ) : (
              <div style={{ padding: '28px 24px', fontSize: '0.95rem', lineHeight: '2.2', color: C.text, whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: '#FFF', borderRadius: 12 }}>
                {displayText}
                {isGenerating && <span style={{ display: 'inline-block', width: 2, height: 16, background: C.blue, marginLeft: 2, verticalAlign: 'middle', animation: 'blink 1s step-end infinite' }} />}
                <div ref={streamEndRef} />
              </div>
            )}
          </Card>
        )}

        {isEditing && (
          <div style={{ marginBottom: 24, display: 'flex', gap: 12 }}>
            <Btn variant="primary" onClick={() => { setIsEditing(false); localStorage.setItem('lw_appeal_text', editedText) }} style={{ flex: 2 }}>保存</Btn>
            <Btn variant="secondary" onClick={() => setIsEditing(false)}>取消</Btn>
          </div>
        )}

        {/* 操作栏 */}
        {streamDone && !isGenerating && displayText && (
          <Card padding={24} style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <span style={{ fontSize: '0.8rem', color: C.muted }}>{editedText.length.toLocaleString()} 字</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <Btn variant="ghost" onClick={handleCopy} style={{ padding: '8px 16px', fontSize: '0.85rem' }}>
                  {copied ? '已复制' : '复制'}
                </Btn>
                <div style={{ position: 'relative', display: 'inline-block' }}>
                  <Btn variant="ghost" onClick={() => setIsExportMenu(v => !v)} style={{ padding: '8px 16px', fontSize: '0.85rem' }}>导出</Btn>
                  {isExportMenu && (
                    <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 8, background: C.white, borderRadius: 12, boxShadow: '0 8px 30px rgba(0,0,0,0.12)', border: `1px solid ${C.border}`, overflow: 'hidden', zIndex: 10, minWidth: 140 }}>
                      <button onClick={() => { handleExport('txt'); setIsExportMenu(false) }} style={{ display: 'block', width: '100%', padding: '12px 16px', background: 'none', border: 'none', borderBottom: `1px solid ${C.border}`, cursor: 'pointer', fontSize: '0.9rem', color: C.text, textAlign: 'left' }}>TXT 文本</button>
                      <button onClick={() => { handleExport('docx'); setIsExportMenu(false) }} style={{ display: 'block', width: '100%', padding: '12px 16px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.9rem', color: C.text, textAlign: 'left' }}>DOC Word</button>
                    </div>
                  )}
                </div>
                <Btn variant="ghost" onClick={() => setIsEditing(true)} style={{ padding: '8px 16px', fontSize: '0.85rem' }}>编辑</Btn>
              </div>
            </div>

            {/* 法律依据 */}
            {legalBasis.length > 0 && (
              <details>
                <summary style={{ cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600, color: C.muted, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 12 }}>引用法律条文 ({legalBasis.length})</summary>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
                  {legalBasis.map((a, i) => (
                    <div key={i} style={{ padding: '10px 14px', background: C.bg, borderRadius: 10, fontSize: '0.85rem', color: C.text, lineHeight: 1.6 }}>{a}</div>
                  ))}
                </div>
              </details>
            )}
          </Card>
        )}

        {/* 切换其他文书 */}
        {streamDone && !isGenerating && (
          <div style={{ marginBottom: 32 }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: C.muted, letterSpacing: '0.08em', marginBottom: 16, textTransform: 'uppercase' }}>生成其他文书</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {DOC_TYPES.filter(d => d.key !== docType).map(d => (
                <button key={d.key} onClick={() => { setDocType(d.key); startStreaming(d.key) }} style={{
                  padding: '16px 18px', background: C.white, border: `1px solid ${C.border}`, borderRadius: 14,
                  cursor: 'pointer', transition: 'all 0.2s ease', textAlign: 'left',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = C.blue; (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 4px 16px rgba(0,113,227,0.08)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = C.border; (e.currentTarget as HTMLButtonElement).style.boxShadow = 'none' }}>
                  <div style={{ fontSize: '0.9rem', fontWeight: 600, color: C.text }}>{d.name}</div>
                  <div style={{ fontSize: '0.75rem', color: C.muted, marginTop: 2 }}>{d.desc}</div>
                </button>
              ))}
            </div>
          </div>
        )}
      </main>

      <style>{`@keyframes blink { 50% { opacity: 0; } } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
