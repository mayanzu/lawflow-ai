'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

type StepStatus = 'pending' | 'active' | 'done' | 'error'

interface Step {
  id: string
  title: string
  status: StepStatus
  progress: number
  message: string
}

const STEPS = [
  { id: 'upload', title: '上传' },
  { id: 'ocr', title: 'OCR识别' },
  { id: 'analyze', title: 'AI分析' },
]

function sleep(ms: number) { return new Promise<void>(r => setTimeout(r, ms)) }

export default function FlowPage() {
  const router = useRouter()
  const search = useSearchParams()

  const [steps, setSteps] = useState<Step[]>(STEPS.map(s => ({ ...s, status: 'pending' as StepStatus, progress: 0, message: '' })))
  const [error, setError] = useState('')
  const [rateLimit, setRateLimit] = useState(false)
  const [retryAfter, setRetryAfter] = useState(0)
  const [ocrText, setOcrText] = useState('')
  const [analyzeInfo, setAnalyzeInfo] = useState<Record<string, string>>({})
  const [ocrExpanded, setOcrExpanded] = useState(true)
  const [fileName, setFileName] = useState('')

  const processRef = useRef<boolean>(false)
  const fileIdRef = useRef<string>('')
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const ocrTextRef = useRef<string>('')

  function setStepStatus(idx: number, status: StepStatus, progress = 0, message = '') {
    setSteps(prev => prev.map((s, i) => i === idx ? { ...s, status, progress, message } : s))
  }

  async function callApi(url: string, body: any) {
    for (let attempt = 0; attempt <= 2; attempt++) {
      if (abortRef.current?.signal.aborted) throw new Error('请求已取消')
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: abortRef.current?.signal })
      if (res.status === 429) {
        if (attempt === 2) throw new Error('API 频率超限，请稍后重试')
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
    if (processRef.current || !fileIdRef.current) return
    processRef.current = true

    setStepStatus(0, 'done', 100, '完成')

    // OCR
    setStepStatus(1, 'active', 10, '正在识别文档...')
    try {
      const ocrRes = await callApi('/api/ocr', { file_id: fileIdRef.current })
      if (!ocrRes.success) throw new Error(ocrRes.error || 'OCR 识别失败')
      const text = ocrRes.text || ''
      ocrTextRef.current = text; setOcrText(text)
      localStorage.setItem('lw_ocr_text', text)
      setStepStatus(1, 'done', 100, `识别完成 ${text.length} 字`)
    } catch (err: any) {
      if (err.message === '请求已取消') return
      setStepStatus(1, 'error', 0, err.message); setError(`OCR 识别失败: ${err.message}`); return
    }

    // AI 分析
    setStepStatus(2, 'active', 10, '正在提取案件信息...')
    try {
      const analyzeRes = await callApi('/api/analyze', { text: ocrTextRef.current })
      if (!analyzeRes.success) throw new Error(analyzeRes.error || '分析失败')
      const info = analyzeRes.info || {}
      setAnalyzeInfo(info)
      localStorage.setItem('lw_analyze_info', JSON.stringify(info))
      setStepStatus(2, 'done', 100, `提取 ${Object.keys(info).length} 项`)
    } catch (err: any) {
      if (err.message === '请求已取消') return
      setStepStatus(2, 'error', 0, err.message); setError(`分析失败: ${err.message}`); return
    }

    // 显示结果，等用户点按钮继续
  }

  function goToConfirm() {
    router.push('/confirm')
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
    <div style={{ minHeight: '100vh', background: '#F8F9FA', fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif' }}>
      {/* 导航栏 */}
      <div style={{ padding: '12px 16px', background: '#FFF', borderBottom: '1px solid #E8EAED', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button onClick={() => { Object.keys(localStorage).filter(k => k.startsWith('lw_') || k === 'wf_started').forEach(k => localStorage.removeItem(k)); abortRef.current?.abort(); router.push('/') }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', fontWeight: 600, color: '#1D1D1F', padding: '8px 0' }}>← 返回</button>
        <span style={{ fontSize: '13px', color: '#6E6E73', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '180px' }}>{fileName}</span>
        <div style={{ width: 50 }} />
      </div>

      {/* 顶部进度条 */}
      <div style={{ background: '#FFF', borderBottom: '1px solid #F0F0F0', padding: '12px 16px' }}>
        <div style={{ display: 'flex', gap: 0, justifyContent: 'center' }}>
          {steps.map((step, i) => (
            <div key={step.id} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
              {i > 0 && <div style={{ position: 'absolute', top: 12, left: 0, right: '50%', height: 2, background: step.status === 'done' ? '#0071E3' : '#E8E8ED' }} />}
              {i < steps.length - 1 && <div style={{ position: 'absolute', top: 12, left: '50%', right: 0, height: 2, background: steps[i + 1]?.status === 'done' ? '#0071E3' : '#E8E8ED' }} />}
              <div style={{ width: 24, height: 24, borderRadius: '50%', zIndex: 1, background: step.status === 'done' ? '#0071E3' : step.status === 'active' ? '#E8F0FE' : step.status === 'error' ? '#FCE8E6' : '#F1F3F4', display: 'flex', alignItems: 'center', justifyContent: 'center', border: step.status === 'active' ? '2px solid #0071E3' : 'none', transition: 'all 0.3s' }}>
                {step.status === 'active' && <div style={{ width: 10, height: 10, borderRadius: '50%', border: '2px solid #0071E3', borderTopColor: 'transparent', animation: 'spin 1s linear infinite' }} />}
                {step.status === 'done' && <span style={{ color: '#FFF', fontSize: 11, fontWeight: 600 }}></span>}
                {step.status === 'error' && <span style={{ color: '#D93025', fontSize: 11, fontWeight: 600 }}>!</span>}
                {step.status === 'pending' && <span style={{ color: '#86868B', fontSize: 11, fontWeight: 500 }}>{i + 1}</span>}
              </div>
              <span style={{ fontSize: 10, fontWeight: 500, color: step.status === 'active' ? '#0071E3' : step.status === 'error' ? '#D93025' : '#86868B', marginTop: 4 }}>{step.title}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 页面标题 */}
      <div style={{ textAlign: 'center', padding: '24px 16px 16px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#1D1D1F', margin: '0 0 4px' }}>{error ? '处理出错' : '正在处理'}</h2>
        <p style={{ fontSize: '13px', color: '#86868B', margin: 0 }}>{error ? '请根据提示操作' : '请稍候'}</p>
      </div>

      {/* 主内容：单栏布局 */}
      <div style={{ padding: '0 16px 60px', maxWidth: '600px', margin: '0 auto' }}>
        {/* 步骤列表 */}
        <div style={{ background: '#FFF', borderRadius: '14px', padding: '16px', marginBottom: '16px', boxShadow: '0 1px 6px rgba(0,0,0,0.05)' }}>
          {steps.map((step, i) => (
            <div key={step.id} style={{ display: 'flex', alignItems: 'center', gap: 14, paddingBottom: i < steps.length - 1 ? 14 : 0, opacity: step.status === 'pending' ? 0.5 : 1 }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: step.status === 'done' ? '#0071E3' : step.status === 'active' ? '#E8F0FE' : '#F1F3F4', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {step.status === 'active' && <div style={{ width: 12, height: 12, borderRadius: '50%', border: '2px solid #0071E3', borderTopColor: 'transparent', animation: 'spin 1s linear infinite' }} />}
                {step.status === 'done' && <span style={{ color: '#FFF', fontSize: 12, fontWeight: 600 }}></span>}
                {step.status === 'error' && <span style={{ color: '#D93025', fontSize: 12, fontWeight: 600 }}>!</span>}
                {step.status === 'pending' && <span style={{ color: '#86868B', fontSize: 12 }}>{i + 1}</span>}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '14px', fontWeight: 600, color: step.status === 'error' ? '#D93025' : '#1D1D1F' }}>{step.title}</div>
                <div style={{ fontSize: '12px', color: '#86868B', marginTop: 2 }}>{step.message}</div>
                {step.status === 'active' && step.progress > 0 && (
                  <div style={{ marginTop: 6, height: 3, background: '#E8E8ED', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${step.progress}%`, background: '#0071E3', transition: 'width 0.4s' }} />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* OCR 结果 */}
        {ocrText && (
          <div style={{ background: '#FFF', borderRadius: '14px', overflow: 'hidden', marginBottom: '16px', boxShadow: '0 1px 6px rgba(0,0,0,0.05)' }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid #F5F5F5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ fontSize: '13px', fontWeight: 600, color: '#86868B', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 2px' }}>OCR 识别结果</h3>
                <p style={{ fontSize: '11px', color: '#86868B', margin: 0 }}>{ocrText.length} 字</p>
              </div>
              <button onClick={() => setOcrExpanded(v => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', color: '#0071E3', fontWeight: 500, padding: '4px 8px' }}>{ocrExpanded ? '收起' : '展开'}</button>
            </div>
            {ocrExpanded && (
              <div style={{ padding: '12px 14px', maxHeight: 240, overflow: 'auto', background: '#FAFAFA' }}>
                <pre style={{ margin: 0, fontSize: '12px', lineHeight: 1.8, color: '#3D3D3F', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'inherit' }}>{ocrText}</pre>
              </div>
            )}
          </div>
        )}

        {/* AI 分析结果 */}
        {Object.keys(analyzeInfo).length > 0 && (
          <div style={{ background: '#FFF', borderRadius: '14px', overflow: 'hidden', boxShadow: '0 1px 6px rgba(0,0,0,0.05)' }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid #F5F5F5' }}>
              <h3 style={{ fontSize: '13px', fontWeight: 600, color: '#86868B', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 2px' }}>AI 案件分析</h3>
              <p style={{ fontSize: '11px', color: '#86868B', margin: 0 }}>已提取 {Object.keys(analyzeInfo).length} 项</p>
            </div>
            <div style={{ padding: '10px' }}>
              {Object.entries(analyzeInfo).filter(([k]) => k !== 'raw').map(([key, val]) => (
                <div key={key} style={{ padding: '8px 10px', borderRadius: 8, marginBottom: 6, background: '#F8F9FA' }}>
                  <div style={{ fontSize: '10px', fontWeight: 600, color: '#86868B', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>{key}</div>
                  <div style={{ fontSize: '13px', fontWeight: 500, color: '#1D1D1F', lineHeight: 1.4, wordBreak: 'break-word' }}>{String(val)}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 分析完成后继续按钮 */}
        {analyzeInfo && Object.keys(analyzeInfo).length > 0 && !error && (
          <button
            onClick={goToConfirm}
            style={{ marginTop: 16, width: '100%', padding: '14px', background: '#0071E3', color: '#FFF', border: 'none', borderRadius: 12, cursor: 'pointer', fontSize: '15px', fontWeight: 600, minHeight: 48, boxShadow: '0 2px 8px rgba(0,113,227,0.3)' }}
          >
            继续 →
          </button>
        )}

        {/* 错误提示 */}
        {(error || rateLimit) && (
          <div style={{ marginTop: 16, padding: 16, background: '#FEF0EF', borderRadius: 12, border: '1px solid #F5C6C5' }}>
            <div style={{ fontSize: '13px', color: '#D93025', marginBottom: 12 }}>{rateLimit ? `API 频率限制，${retryAfter} 秒后自动重试...` : error}</div>
            <div style={{ display: 'flex', gap: 10 }}>
              {!rateLimit && <button onClick={() => { processRef.current = false; processFile() }} style={{ flex: 1, padding: '10px', background: '#0071E3', color: '#FFF', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: '14px', fontWeight: 500, minHeight: 44 }}>重试</button>}
              <button onClick={() => { Object.keys(localStorage).filter(k => k.startsWith('lw_') || k === 'wf_started').forEach(k => localStorage.removeItem(k)); router.push('/') }} style={{ flex: 1, padding: '10px', background: '#FFF', color: '#0071E3', border: '1px solid #0071E3', borderRadius: 8, cursor: 'pointer', fontSize: '14px', fontWeight: 500, minHeight: 44 }}>重新上传</button>
            </div>
          </div>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
