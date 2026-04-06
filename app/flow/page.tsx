'use client'
import { useState, useEffect, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

type StepStatus = 'pending' | 'active' | 'done' | 'error'

interface Step {
  id: string
  title: string
  status: StepStatus
  progress: number
  message: string
}

const DOC_TYPES = [
  { key: 'appeal', name: '民事上诉状', desc: '不服一审判决' },
  { key: 'complaint', name: '民事起诉状', desc: '新案立案' },
  { key: 'defense', name: '民事答辩状', desc: '被诉后答辩' },
  { key: 'representation', name: '代理词', desc: '庭审总结' },
  { key: 'execution', name: '执行申请书', desc: '申请强制执行' },
  { key: 'preservation', name: '保全申请书', desc: '诉讼中保全' },
]

const STEPS = [
  { id: 'upload', title: '上传' },
  { id: 'ocr', title: 'OCR 识别' },
  { id: 'analyze', title: 'AI 分析' },
]

function sleep(ms: number) { return new Promise<void>(r => setTimeout(r, ms)) }

function FlowContent() {
  const router = useRouter()
  const search = useSearchParams()

  const [steps, setSteps] = useState<Step[]>(STEPS.map(s => ({ ...s, status: 'pending' as StepStatus, progress: 0, message: '' })))
  const [error, setError] = useState('')
  const [rateLimit, setRateLimit] = useState(false)
  const [retryAfter, setRetryAfter] = useState(0)
  const [ocrText, setOcrText] = useState('')
  const [ocrExpanded, setOcrExpanded] = useState(false)
  const [fileName, setFileName] = useState('')
  const [isDone, setIsDone] = useState(false)
  const [analyzeInfo, setAnalyzeInfo] = useState<any>(null)
  const [infoFields, setInfoFields] = useState<Record<string, string>>({})

  const processRef = useRef<boolean>(false)
  const fileIdRef = useRef<string>('')
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  function setStepStatus(idx: number, status: StepStatus, progress = 0, message = '') {
    setSteps(prev => prev.map((s, i) => i === idx ? { ...s, status, progress, message } : s))
  }

  async function callApi(url: string, body: any) {
    for (let attempt = 0; attempt <= 2; attempt++) {
      if (abortRef.current?.signal.aborted) throw new Error('请求已取消')
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: abortRef.current?.signal })
      if (res.status === 429) {
        if (attempt === 2) throw new Error('API 频率超限')
        const wait = (attempt + 1) * 8000
        setRateLimit(true); setRetryAfter(Math.ceil(wait / 1000))
        if (countdownRef.current) clearInterval(countdownRef.current)
        countdownRef.current = setInterval(() => {
          setRetryAfter(prev => { if (prev <= 1) { clearInterval(countdownRef.current!); setRateLimit(false); return 0 }; return prev - 1 })
        }, 1000)
        await sleep(wait)
        if (abortRef.current?.signal.aborted) throw new Error('请求已取消')
        continue
      }
      if (!res.ok) throw new Error(`请求失败: ${res.status}`)
      return res.json()
    }
    throw new Error('请求失败')
  }

  async function processFile() {
    if (processRef.current) return
    processRef.current = true

    setStepStatus(0, 'done', 100, '完成')

    let text = ''
    // OCR
    setStepStatus(1, 'active', 10, '正在识别...')
    try {
      const ocrRes = await callApi('/api/ocr', { file_id: fileIdRef.current })
      if (!ocrRes.success) throw new Error(ocrRes.error || 'OCR 识别失败')
      text = ocrRes.text || ''
      setOcrText(text)
      localStorage.setItem('lw_ocr_text', text)
      setStepStatus(1, 'done', 100, `已识别 ${text.length.toLocaleString()} 字`)
    } catch (err: any) {
      if (err.message === '请求已取消') return
      setStepStatus(1, 'error', 0, err.message); setError(`OCR 识别失败: ${err.message}`); return
    }

    // AI 分析
    setStepStatus(2, 'active', 10, '正在分析...')
    try {
      const analyzeRes = await callApi('/api/analyze', { text })
      if (analyzeRes.success && analyzeRes.info) {
        localStorage.setItem('lw_analyze_info', JSON.stringify(analyzeRes.info))
        // 标记缺失字段
        if (analyzeRes.missing_fields?.length > 0) {
          localStorage.setItem('lw_missing_fields', JSON.stringify(analyzeRes.missing_fields))
          setStepStatus(2, 'done', 80, `完成（${analyzeRes.missing_fields.length}个字段需补充）`)
        } else {
          localStorage.removeItem('lw_missing_fields')
          setStepStatus(2, 'done', 100, '完成')
        }
        setAnalyzeInfo(analyzeRes.info)
        setInfoFields({ ...analyzeRes.info })
        setInfoFields({
          ...analyzeRes.info,
          判决日期: toDateInputVal(analyzeRes.info.判决日期)
        })
      } else {
        localStorage.removeItem('lw_analyze_info')
        localStorage.removeItem('lw_missing_fields')
        setStepStatus(2, 'done', 100, '完成（请手动填写）')
      }
    } catch {
      setStepStatus(2, 'done', 100, '完成（可手动填写）')
    }

    setIsDone(true)
  }

  // 转换日期为 YYYY-MM-DD
  function toDateInputVal(s: string): string {
    if (!s || typeof s !== 'string') return ''
    const m = s.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/)
    if (m) return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
    return ''
  }

  function handleGoToConfirm(docType: string) {
    localStorage.setItem('lw_doc_type', docType)
    localStorage.setItem('lw_analyze_info', JSON.stringify(infoFields))
    router.push('/result')
  }

  useEffect(() => {
    const fid = localStorage.getItem('lw_file_id') || ''
    const fname = localStorage.getItem('lw_file_name') || search.get('file') || ''
    fileIdRef.current = fid; setFileName(fname)
    if (!fid) { router.push('/'); return }
    const t = setTimeout(() => processFile(), 300)
    return () => { clearTimeout(t); if (countdownRef.current) clearInterval(countdownRef.current); abortRef.current?.abort() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div style={{ minHeight: '100vh', background: '#FFFFFF', fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif' }}>
      {/* 导航栏 */}
      <nav style={{ backdropFilter: 'saturate(180%) blur(20px)', WebkitBackdropFilter: 'saturate(180%) blur(20px)', background: 'rgba(255,255,255,0.85)', borderBottom: '1px solid rgba(0,0,0,0.08)' }}>
        <div style={{ maxWidth: 980, margin: '0 auto', padding: '0 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: 52 }}>
          <button onClick={() => { Object.keys(localStorage).filter(k => k.startsWith('lw_') || k === 'wf_started').forEach(k => localStorage.removeItem(k)); abortRef.current?.abort(); router.push('/') }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#0071E3', fontWeight: 500 }}>返回</button>
          <span style={{ fontSize: 13, color: '#86868B', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fileName}</span>
          <div style={{ width: 40 }} />
        </div>
      </nav>

      {/* 主内容 */}
      <main style={{ maxWidth: 680, margin: '0 auto', padding: '48px 24px 80px' }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: '#1D1D1F', margin: '0 0 4px', letterSpacing: '-0.03em' }}>
          {isDone ? '处理完成' : error ? '处理出错' : '正在处理'}
        </h1>
        <p style={{ fontSize: 15, color: '#86868B', margin: '0 0 40px' }}>
          {error ? error : isDone ? '已为您提取案件信息，请确认后继续。' : '请稍候，系统正在处理您的文件。'}
        </p>

        {/* 步骤列表 */}
        <div style={{ background: '#F8F9FA', borderRadius: 16, padding: 24, marginBottom: 24 }}>
          {steps.map((step, i) => (
            <div key={step.id} style={{ display: 'flex', alignItems: 'center', gap: 16, paddingBottom: i < steps.length - 1 ? 20 : 0, marginBottom: i < steps.length - 1 ? 20 : 0, borderBottom: i < steps.length - 1 ? '1px solid #E8E8ED' : 'none' }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: step.status === 'done' ? '#0071E3' : step.status === 'active' ? '#E8F0FE' : step.status === 'error' ? '#FCE8E6' : '#F1F3F4', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {step.status === 'done' && <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M13.5 4.5L6 12L2.5 8.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                {step.status === 'active' && <div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid #0071E3', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />}
                {step.status === 'error' && <span style={{ color: '#D93025', fontSize: 14, fontWeight: 600 }}>!</span>}
                {step.status === 'pending' && <span style={{ color: '#86868B', fontSize: 12, fontWeight: 500 }}>{i + 1}</span>}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: step.status === 'error' ? '#D93025' : '#1D1D1F', marginBottom: 2 }}>{step.title}</div>
                <div style={{ fontSize: 13, color: '#86868B', lineHeight: 1.4 }}>{step.message}</div>
                {step.status === 'active' && step.progress > 0 && (
                  <div style={{ marginTop: 8, height: 3, background: '#E8E8ED', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${step.progress}%`, background: '#0071E3', transition: 'width 0.4s ease' }} />
                  </div>
                )}
              </div>
              <div style={{ fontSize: 12, fontWeight: 600, color: step.status === 'done' ? '#0071E3' : step.status === 'error' ? '#D93025' : '#86868B', minWidth: 40, textAlign: 'right' }}>
                {step.status === 'done' ? '完成' : step.status === 'error' ? '错误' : step.status === 'active' ? '处理中' : '等待'}
              </div>
            </div>
          ))}
        </div>

        {/* AI 分析结果（可编辑） */}
        {isDone && analyzeInfo && (
          <div style={{ background: '#F8F9FA', borderRadius: 16, overflow: 'hidden', marginBottom: 32 }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #E8E8ED' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#86868B', letterSpacing: '0.06em' }}>AI 提取的案件信息（可编辑修正）</div>
                {Object.keys(infoFields).length > 0 && <div style={{ fontSize: 10, color: '#86868B' }}>点击字段即可修改</div>}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {(['案号', '案由', '原告', '被告', '判决法院', '判决日期', '上诉期限', '上诉法院'] as const).map(k => {
                  const v = infoFields[k] || ''
                  return (
                    <div key={k} style={{ background: '#FFFFFF', borderRadius: 8, padding: '8px 10px', border: '1px solid #E8E8ED' }}>
                      <div style={{ fontSize: 10, fontWeight: 600, color: '#86868B', letterSpacing: '0.04em', marginBottom: 2 }}>{k}</div>
                      <input
                        type={k === '判决日期' ? 'date' : 'text'}
                        value={v}
                        onChange={e => {
                          const update = { ...infoFields, [k]: e.target.value }
                          setInfoFields(update)
                          localStorage.setItem('lw_analyze_info', JSON.stringify(update))
                        }}
                        style={{ width: '100%', border: 'none', outline: 'none', fontSize: 13, fontWeight: 500, color: '#1D1D1F', background: 'transparent', fontFamily: 'inherit', padding: '2px 0', boxSizing: 'border-box' }}
                        placeholder={'未提取'}
                      />
                    </div>
                  )
                })}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12, marginTop: 12 }}>
                {(['判决结果'] as const).map(k => {
                  const v = infoFields[k] || ''
                  return (
                    <div key={k} style={{ background: '#FFFFFF', borderRadius: 8, padding: '8px 10px', border: '1px solid #E8E8ED' }}>
                      <div style={{ fontSize: 10, fontWeight: 600, color: '#86868B', letterSpacing: '0.04em', marginBottom: 2 }}>{k}</div>
                      <textarea
                        value={v}
                        onChange={e => {
                          const update = { ...infoFields, [k]: e.target.value }
                          setInfoFields(update)
                          localStorage.setItem('lw_analyze_info', JSON.stringify(update))
                        }}
                        rows={2}
                        style={{ width: '100%', border: 'none', outline: 'none', fontSize: 13, color: '#1D1D1F', background: 'transparent', fontFamily: 'inherit', padding: '2px 0', resize: 'vertical', boxSizing: 'border-box' }}
                        placeholder={'未提取'}
                      />
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* OCR 结果预览 */}
        {ocrText && isDone && (
          <div style={{ background: '#F8F9FA', borderRadius: 16, overflow: 'hidden', marginBottom: 32 }}>
            <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }} onClick={() => setOcrExpanded(v => !v)}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#86868B', letterSpacing: '0.06em', marginBottom: 2 }}>OCR 识别结果</div>
                <div style={{ fontSize: 13, color: '#86868B' }}>{ocrText.length.toLocaleString()} 字</div>
              </div>
              <div style={{ fontSize: 12, color: '#0071E3', fontWeight: 500 }}>{ocrExpanded ? '收起' : '展开'}</div>
            </div>
            {ocrExpanded && (
              <div style={{ padding: '0 20px 16px', maxHeight: 280, overflow: 'auto', background: '#FFFFFF', borderRadius: '0 0 16px 16px' }}>
                <pre style={{ margin: 0, fontSize: 12, lineHeight: 1.8, color: '#3D3D3F', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'inherit' }}>{ocrText}</pre>
              </div>
            )}
          </div>
        )}

        {/* 错误提示 */}
        {(error || rateLimit) && (
          <div style={{ marginTop: 24, padding: '16px 20px', background: '#FEF0EF', borderRadius: 14, border: '1px solid #F5C6C5' }}>
            <div style={{ fontSize: 13, color: '#D93025', marginBottom: 16 }}>{rateLimit ? `请求过于频繁，${retryAfter} 秒后重试...` : error}</div>
            <div style={{ display: 'flex', gap: 10 }}>
              {!rateLimit && <button onClick={() => { processRef.current = false; setIsDone(false); setError(''); processFile() }} style={{ flex: 1, padding: '10px 16px', background: '#0071E3', color: '#FFF', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 500 }}>重试</button>}
              <button onClick={() => { Object.keys(localStorage).filter(k => k.startsWith('lw_') || k === 'wf_started').forEach(k => localStorage.removeItem(k)); router.push('/') }} style={{ flex: 1, padding: '10px 16px', background: '#FFF', color: '#0071E3', border: '1px solid #0071E3', borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 500 }}>重新上传</button>
            </div>
          </div>
        )}

        {/* 文书类型选择 */}
        {isDone && !error && (
          <div style={{ marginBottom: 32 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#86868B', letterSpacing: '0.06em', marginBottom: 16 }}>选择要生成的文书</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {DOC_TYPES.map(doc => (
                <div key={doc.key} onClick={() => handleGoToConfirm(doc.key)} style={{ background: '#F8F9FA', borderRadius: 12, padding: '18px 20px', cursor: 'pointer', border: '1px solid #E0E0E0', transition: 'all 0.2s ease' }}
                     onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = '#0071E3'; (e.currentTarget as HTMLDivElement).style.background = '#F0F4FF' }}
                     onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = '#E0E0E0'; (e.currentTarget as HTMLDivElement).style.background = '#F8F9FA' }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#1D1D1F', marginBottom: 4 }}>{doc.name}</div>
                  <div style={{ fontSize: 12, color: '#86868B' }}>{doc.desc}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 操作按钮 */}
        {isDone && !error && (
          <div style={{ display: 'flex', gap: 12 }}>
            <button onClick={() => router.push('/')} style={{ flex: 1, padding: '14px 20px', background: '#FFF', color: '#1D1D1F', border: '1px solid #E0E0E0', borderRadius: 12, cursor: 'pointer', fontSize: 15, fontWeight: 500 }}>上传新文件</button>
          </div>
        )}
      </main>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

export default function FlowPage() {
  return <Suspense><FlowContent /></Suspense>
}
