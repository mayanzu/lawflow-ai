'use client'
import { useState, useEffect, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { C, Nav, Card, Spinner, Btn, Icons } from '@/ui'
import { storage } from '@/lib/storage'
import { DOC_TYPES as DOC_TYPES_CONFIG, type CaseInfo } from '@/lib/types'

const DOC_TYPES = DOC_TYPES_CONFIG

const STEPS = [
  { id: 'ocr',     title: 'OCR 识别', icon: 'search' },
  { id: 'analyze', title: 'AI 分析',  icon: 'brain' },
  { id: 'select',  title: '选择文书', icon: 'grid' },
]

type StepState = 'pending' | 'active' | 'done' | 'error'

const ICON_MAP: Record<string, (s: number, c: string) => React.ReactElement> = {
  search: Icons.search, brain: Icons.brain, grid: Icons.grid,
  doc: Icons.doc, fileText: Icons.fileText, shield: Icons.shield,
  scale: Icons.scale, clock: Icons.clock, lock: Icons.lock,
}

function FlowContent() {
  const router = useRouter()
  const search = useSearchParams()

  const [mobile, setMobile] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)
  const [stepStatus, setStepStatus] = useState<StepState[]>((Array.from({ length: STEPS.length })).map((_, i) => i === 0 ? 'active' : 'pending'))
  const [stepMessages, setStepMessages] = useState<string[]>(['请稍候...'])
  const [error, setError] = useState('')
  const [ocrText, setOcrText] = useState('')
  const [ocrExpanded, setOcrExpanded] = useState(false)
  const [fileName, setFileName] = useState('')
  const [analyzeInfo, setAnalyzeInfo] = useState<CaseInfo | null>(null)
  const [infoFields, setInfoFields] = useState<Record<string, string>>({})
  const [selectedDoc, setSelectedDoc] = useState<string | null>(null)

  useEffect(() => {
    const check = () => setMobile(window.innerWidth < 640)
    check(); window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const processRef = useRef(false)
  const fileIdRef = useRef('')

  function setStepDone(idx: number, msg: string) {
    setStepStatus(p => { const n = [...p]; n[idx] = 'done'; return n })
    setStepMessages(p => { const n = [...p]; n[idx] = msg; return n })
  }
  function setStepActive(idx: number, msg: string) {
    setStepStatus(p => { const n = [...p]; n[idx] = 'active'; return n })
    setStepMessages(p => { const n = [...p]; n[idx] = msg; return n })
  }
  function setStepError(idx: number, msg: string) {
    setStepStatus(p => { const n = [...p]; n[idx] = 'error'; return n })
    setStepMessages(p => { const n = [...p]; n[idx] = msg; return n })
  }

  async function callApi(url: string, body: any) {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (!res.ok) throw new Error(`请求失败: ${res.status}`)
    return res.json()
  }

  async function processFile() {
    if (processRef.current) return
    processRef.current = true
    let text = ''

    setStepActive(0, '正在识别...')
    try {
      const ocrRes = await callApi('/api/ocr', { file_id: fileIdRef.current })
      if (!ocrRes.success) throw new Error(ocrRes.error || 'OCR 识别失败')
      text = ocrRes.text || ''
      setOcrText(text)
      storage.set('ocr_text', text)
      setStepDone(0, `已识别 ${text.length.toLocaleString()} 字`)
    } catch (e: any) { setStepError(0, e.message); setError(`OCR 识别失败: ${e.message}`); return }

    setStepActive(1, '正在提取案件信息...'); setCurrentStep(1)
    try {
      const analyzeRes = await callApi('/api/analyze', { text })
      if (analyzeRes.success && analyzeRes.info) {
        const fields = { ...analyzeRes.info }
        if (fields.判决日期) {
          const m = String(fields.判决日期).match(/(\d{4})年(\d{1,2})月(\d{1,2})日/)
          if (m) fields.判决日期 = `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`
        }
        storage.set('analyze_info', fields)
        setAnalyzeInfo(fields); setInfoFields(fields)
        setStepDone(1, `已提取 ${Object.values(fields).filter(Boolean).length} 个字段`)
      } else { setStepDone(1, '提取完成，请手动填写') }
    } catch { setStepDone(1, '提取完成，请手动填写') }
    setCurrentStep(2); setStepActive(2, '请选择要生成的文书类型')
  }

  function handleSelectDoc(docType: string) {
    setSelectedDoc(docType)
    setStepDone(2, `已选择 ${DOC_TYPES.find(d => d.key === docType)?.name}`)
    storage.set('doc_type', docType)
    storage.remove('appeal_text')
    storage.remove('legal_basis')
    storage.set('analyze_info', infoFields)
    router.push('/result')
  }

  useEffect(() => {
    const fid = storage.get<string>('file_id', '')
    const fname = storage.get<string>('file_name', '') || search.get('file') || ''
    fileIdRef.current = fid || ''; setFileName(fname)
    if (!fid) { router.push('/'); return }
    setTimeout(() => processFile(), 300)
  // eslint-disable-next-line
  }, [])

  const allDone = stepStatus[2] === 'done' || stepStatus[2] === 'active'
  const pad = mobile ? 16 : 32

  return (
    <div style={{ minHeight: '100vh', background: C.bg }}>
      <Nav
        title={fileName}
        left={<button onClick={() => { storage.clear(); router.push('/') }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.blue, display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.9rem', fontWeight: 500 }}>{Icons.arrowLeft(16, C.blue)} 返回</button>}
      />

      <main style={{ maxWidth: 800, margin: '0 auto', padding: `${mobile ? 16 : 40}px ${pad}px 80px` }}>
        {/* 步骤指示器 */}
        <Card padding={mobile ? 20 : 32} style={{ marginBottom: mobile ? 16 : 32 }}>
          {mobile ? (
            /* 移动端：垂直步骤条 */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {STEPS.map((s, i) => (
                <div key={s.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: stepStatus[i] === 'done' ? C.blue : stepStatus[i] === 'active' ? '#E8F0FE' : stepStatus[i] === 'error' ? '#FCE8E6' : '#F1F3F4', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {stepStatus[i] === 'done' ? Icons.check(18, '#FFF') : stepStatus[i] === 'error' ? <span style={{ color: C.red, fontSize: 16, fontWeight: 700 }}>!</span> : ICON_MAP[s.icon]?.(18, stepStatus[i] === 'active' ? C.blue : C.muted)}
                    </div>
                    {i < STEPS.length - 1 && <div style={{ width: 2, height: 32, background: stepStatus[i] === 'done' ? C.blue : C.border }} />}
                  </div>
                  <div style={{ paddingBottom: i < STEPS.length - 1 ? 20 : 0 }}>
                    <div style={{ fontSize: '0.9rem', fontWeight: 600, color: stepStatus[i] === 'error' ? C.red : C.text }}>{s.title}</div>
                    <div style={{ fontSize: '0.75rem', color: C.muted, marginTop: 2 }}>{stepMessages[i]}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* 桌面端：横向步骤 */
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              {STEPS.map((s, i) => (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
                    <div style={{ width: 48, height: 48, borderRadius: 14, background: stepStatus[i] === 'done' ? C.blue : stepStatus[i] === 'active' ? '#E8F0FE' : '#F1F3F4', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                      {stepStatus[i] === 'done' ? Icons.check(22, '#FFF') : stepStatus[i] === 'error' ? <span style={{ color: C.red, fontSize: 20, fontWeight: 700 }}>!</span> : ICON_MAP[s.icon]?.(22, stepStatus[i] === 'active' ? C.blue : C.muted)}
                    </div>
                    <span style={{ fontSize: '0.9rem', fontWeight: 600, color: stepStatus[i] === 'error' ? C.red : C.text }}>{s.title}</span>
                    <span style={{ fontSize: '0.75rem', color: C.muted, marginTop: 4 }}>{stepMessages[i]}</span>
                  </div>
                  {i < STEPS.length - 1 && <div style={{ width: 40, height: 2, background: stepStatus[i] === 'done' ? C.blue : C.border, borderRadius: 1, flex: 0 }} />}
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* 错误 */}
        {error && (
          <Card padding={mobile ? 16 : 24} style={{ background: '#FEECEB', borderColor: '#F5C6CB', marginBottom: mobile ? 16 : 24 }}>
            <div style={{ color: C.red, fontSize: '0.9rem', fontWeight: 500, marginBottom: 14 }}>{error}</div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Btn variant="primary" onClick={() => { processRef.current = false; setError(''); setCurrentStep(0); setStepStatus(['active', 'pending', 'pending']); setStepMessages(['请稍候...']); processFile() }}>重试</Btn>
              <Btn variant="secondary" onClick={() => { storage.clear(); router.push('/') }}>重新上传</Btn>
            </div>
          </Card>
        )}

        {/* AI 提取信息 */}
        {allDone && (
          <Card padding={mobile ? 16 : 28} style={{ marginBottom: mobile ? 16 : 24 }} hover={false}>
            <div style={{ fontSize: '0.7rem', fontWeight: 600, color: C.muted, letterSpacing: '0.08em', marginBottom: 16, textTransform: 'uppercase' }}>
              AI 提取的案件信息（点击可修改）
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : '1fr 1fr', gap: mobile ? 10 : 14 }}>
              {(['案号', '案由', '原告', '被告', '判决法院', '判决日期', '上诉期限', '上诉法院'] as const).map(k => {
                const v = infoFields[k] || ''
                const isValid = Boolean(v)
                return (
                  <label key={k}>
                    <div style={{ fontSize: '0.7rem', fontWeight: 600, color: isValid ? C.muted : '#E65100', letterSpacing: '0.04em', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                      {k} {!isValid && <span style={{ fontSize: '0.6rem', background: '#FFF3E0', color: '#E65100', padding: '1px 5px', borderRadius: 4 }}>待补充</span>}
                    </div>
                    <input type={k === '判决日期' ? 'date' : 'text'} value={v}
                      onChange={e => { const u = { ...infoFields, [k]: e.target.value }; setInfoFields(u); storage.set('analyze_info', u) }}
                      style={{ width: '100%', padding: '9px 11px', border: `1px solid ${isValid ? C.border : '#FF9800'}`, borderRadius: 10, fontSize: '0.85rem', color: isValid ? C.text : '#E65100', background: '#FFF', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', transition: 'border-color 0.2s' }} />
                  </label>
                )
              })}
            </div>
            <div style={{ marginTop: mobile ? 10 : 14 }}>
              <label>
                <div style={{ fontSize: '0.7rem', fontWeight: 600, color: C.muted, letterSpacing: '0.04em', marginBottom: 6 }}>判决结果</div>
                <textarea value={infoFields.判决结果 || ''}
                  onChange={e => { const u = { ...infoFields, 判决结果: e.target.value }; setInfoFields(u); storage.set('analyze_info', u) }}
                  rows={2} style={{ width: '100%', padding: '9px 11px', border: `1px solid ${C.border}`, borderRadius: 10, fontSize: '0.85rem', color: C.text, background: '#FFF', outline: 'none', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }} />
              </label>
            </div>
          </Card>
        )}

        {/* 文书类型选择 */}
        {allDone && (
          <div style={{ marginBottom: 32 }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 600, color: C.muted, letterSpacing: '0.08em', marginBottom: 14, textTransform: 'uppercase' }}>选择要生成的文书类型</div>
            <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : '1fr 1fr', gap: mobile ? 10 : 14 }}>
              {DOC_TYPES.map(doc => {
                const isSelected = selectedDoc === doc.key
                const Icon = ICON_MAP[doc.icon!]
                return (
                  <div key={doc.key} onClick={() => handleSelectDoc(doc.key)} style={{
                    background: isSelected ? '#E8F0FE' : C.white, borderRadius: mobile ? 16 : 20,
                    padding: mobile ? '16px 14px' : '20px 18px', cursor: 'pointer',
                    border: isSelected ? `2px solid ${C.blue}` : `1px solid ${C.border}`,
                    transition: 'all 0.2s ease', display: 'flex', alignItems: 'center', gap: 14,
                  }}
                  onMouseEnter={e => { if (!isSelected) { (e.currentTarget as HTMLDivElement).style.borderColor = C.blue } }}
                  onMouseLeave={e => { if (!isSelected) { (e.currentTarget as HTMLDivElement).style.borderColor = C.border } }}>
                    <div style={{ width: 40, height: 40, borderRadius: 12, background: isSelected ? C.blue : C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.2s' }}>
                      {Icon!(18, isSelected ? '#FFF' : C.blue)}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '0.9rem', fontWeight: 600, color: C.text, letterSpacing: '-0.02em' }}>{doc.name}</div>
                      <div style={{ fontSize: '0.72rem', color: C.muted, marginTop: 2 }}>{doc.desc}</div>
                    </div>
                    {isSelected && Icons.check(14, C.blue)}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* OCR 折叠 */}
        {ocrText && allDone && (
          <div style={{ borderRadius: 16, overflow: 'hidden', border: `1px solid ${C.border}` }}>
            <div onClick={() => setOcrExpanded(v => !v)} style={{ padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', background: C.white }}>
              <div>
                <div style={{ fontSize: '0.7rem', fontWeight: 600, color: C.muted, letterSpacing: '0.06em', marginBottom: 2 }}>OCR 识别原文</div>
                <div style={{ fontSize: '0.78rem', color: C.muted }}>{ocrText.length.toLocaleString()} 字</div>
              </div>
              <div style={{ fontSize: '0.78rem', color: C.blue, fontWeight: 500 }}>{ocrExpanded ? '收起' : '展开'}</div>
            </div>
            {ocrExpanded && (
              <div style={{ padding: '0 16px 14px', maxHeight: mobile ? 200 : 280, overflow: 'auto', background: C.bg }}>
                <pre style={{ margin: 0, fontSize: '0.78rem', lineHeight: 1.8, color: C.sub, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'inherit' }}>{ocrText}</pre>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}

export default function FlowPage() { return <Suspense><FlowContent /></Suspense> }
