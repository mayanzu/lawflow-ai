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

const STEPS: Step[] = [
  { id: 'upload', title: '上传文件', status: 'pending', progress: 0, message: '等待上传' },
  { id: 'ocr', title: 'OCR 识别', status: 'pending', progress: 0, message: '等待识别' },
  { id: 'analyze', title: 'AI 分析', status: 'pending', progress: 0, message: '等待分析' },
  { id: 'generate', title: '生成诉状', status: 'pending', progress: 0, message: '等待生成' },
  { id: 'done', title: '完成', status: 'pending', progress: 100, message: '' },
]

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}

function formatBytes(b: number) {
  return b < 1024 ? b + ' B' : b < 1048576 ? (b/1024).toFixed(1) + ' KB' : (b/1048576).toFixed(1) + ' MB'
}

export default function FlowPage() {
  const router = useRouter()
  const search = useSearchParams()

  const [steps, setSteps] = useState<Step[]>(STEPS.map(s => ({ ...s })))
  const [fileName, setFileName] = useState('')
  const [fileId, setFileId] = useState('')
  const [fileSize, setFileSize] = useState('')
  const [error, setError] = useState('')
  const [rateLimit, setRateLimit] = useState(false)
  const [retryAfter, setRetryAfter] = useState(0)
  const [currentStep, setCurrentStep] = useState(0)
  const [ocrText, setOcrText] = useState('')
  const [analyzeInfo, setAnalyzeInfo] = useState<Record<string, string>>({})
  const [showOcrResult, setShowOcrResult] = useState(false)
  const [ocrExpanded, setOcrExpanded] = useState(false)
  const [showAnalyzeResult, setShowAnalyzeResult] = useState(false)
  const startedRef = useRef(false)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  function updateStep(id: string, patch: Partial<Step>) {
    setSteps(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s))
  }

  function goToStep(idx: number) {
    setCurrentStep(idx)
    const ids = ['upload', 'ocr', 'analyze', 'generate', 'done']
    ids.forEach((id, i) => {
      if (i < idx) updateStep(id, { status: 'done', progress: 100, message: '已完成' })
      else if (i === idx) updateStep(id, { status: 'active', progress: 0 })
      else updateStep(id, { status: 'pending', progress: 0, message: '等待中' })
    })
  }

  async function callApi(url: string, body: any, signal?: AbortSignal, retries = 2) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal,
      })
      if (res.status === 429) {
        if (attempt === retries) throw new Error('API 频率超限，请稍后重试')
        // 等待后重试
        const wait = (attempt + 1) * 8000
        setRateLimit(true)
        setRetryAfter(Math.ceil(wait / 1000))
        countdownRef.current = setInterval(() => {
          setRetryAfter(prev => {
            if (prev <= 1) {
              clearInterval(countdownRef.current!)
              setRateLimit(false)
              return 0
            }
            return prev - 1
          })
        }, 1000)
        await sleep(wait)
        if (signal?.aborted) throw new Error('请求已取消')
        continue
      }
      if (!res.ok) throw new Error(`请求失败: ${res.status}`)
      return res.json()
    }
    throw new Error('请求失败')
  }

  async function processFile() {
    if (startedRef.current) return
    startedRef.current = true

    // 清理旧数据
    Object.keys(localStorage).filter(k => k.startsWith('lw_') && !['lw_file_id','lw_file_name','lw_file_size'].includes(k))
      .forEach(k => localStorage.removeItem(k))

    goToStep(0)
    await sleep(400)
    updateStep('upload', { status: 'done', progress: 100, message: '上传完成' })

    // ─── OCR ───
    goToStep(1)
    updateStep('ocr', { message: '正在连接服务器...' })
    await sleep(600)

    let ocrText = ''
    try {
      updateStep('ocr', { progress: 20, message: '正在识别文档...' })
      const ocrRes = await callApi('/api/ocr', { file_id: fileId })
      if (!ocrRes.success) throw new Error(ocrRes.error || 'OCR 识别失败')
      ocrText = ocrRes.text || ''
      localStorage.setItem('lw_ocr_text', ocrText)
      updateStep('ocr', { progress: 80, message: `识别完成，${ocrText.length} 字` })
      setOcrText(ocrText)
      setShowOcrResult(true)
      await sleep(400)
      updateStep('ocr', { progress: 100, message: `识别完成 (${ocrText.length} 字)` })
    } catch (err: any) {
      updateStep('ocr', { status: 'error', message: err.message || 'OCR 失败' })
      setError(`OCR 识别失败: ${err.message}。请重试或重新上传文件。`)
      return
    }

    // ─── AI 分析 ───
    goToStep(2)
    try {
      updateStep('analyze', { progress: 20, message: '正在提取案件信息...' })
      const analyzeRes = await callApi('/api/analyze', { text: ocrText })
      if (!analyzeRes.success) throw new Error(analyzeRes.error || '分析失败')
      const info = analyzeRes.info || {}
      localStorage.setItem('lw_analyze_info', JSON.stringify(info))
      updateStep('analyze', { progress: 80, message: `提取 ${Object.keys(info).length} 项信息` })
      setAnalyzeInfo(info)
      setShowAnalyzeResult(true)
      await sleep(400)
      updateStep('analyze', { progress: 100, message: `分析完成 (${Object.keys(info).length} 项)` })
    } catch (err: any) {
      updateStep('analyze', { status: 'error', message: err.message || '分析失败' })
      setError(`AI 分析失败: ${err.message}。请重试。`)
      return
    }

    // ─── 生成诉状 ───
    goToStep(3)
    try {
      updateStep('generate', { progress: 10, message: '正在准备生成...' })
      await sleep(500)
      updateStep('generate', { progress: 25, message: '正在生成上诉状...' })

      // 120秒超时
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 150000)

      const genRes = await callApi('/api/generate-appeal', {
        info: JSON.parse(localStorage.getItem('lw_analyze_info') || '{}'),
        ocr_text: ocrText,
      }, controller.signal)

      clearTimeout(timeout)

      if (!genRes.success) throw new Error(genRes.error || '生成失败')
      const appealText = genRes.appeal || ''
      localStorage.setItem('lw_appeal_text', appealText)
      updateStep('generate', { progress: 90, message: '格式校验中...' })
      await sleep(600)
      updateStep('generate', { progress: 100, message: '生成完成' })
    } catch (err: any) {
      if (err.name === 'AbortError') {
        updateStep('generate', { status: 'error', message: '生成超时（超过 2 分钟）' })
        setError('AI 生成超时，请稍后重试。')
      } else {
        updateStep('generate', { status: 'error', message: err.message || '生成失败' })
        setError(`生成失败: ${err.message}。请重试。`)
      }
      return
    }

    // ─── 完成 ───
    goToStep(4)
    await sleep(600)
    router.push('/result')
  }

  useEffect(() => {
    const fn = search.get('file') || localStorage.getItem('lw_file_name') || ''
    const fid = localStorage.getItem('lw_file_id') || ''
    const fs = localStorage.getItem('lw_file_size') || ''
    setFileName(fn)
    setFileId(fid)
    setFileSize(fs)

    if (!fid) {
      router.push('/')
      return
    }
    if (startedRef.current) return
    // 延迟启动，让页面先渲染
    const t = setTimeout(() => processFile(), 800)
    return () => clearTimeout(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div style={{ minHeight: '100vh', background: '#F8F9FA', fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif' }}>
      {/* 顶部导航 */}
      <div style={{ padding: '16px 40px', background: '#FFFFFF', borderBottom: '1px solid #E8EAED', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button
          onClick={() => { Object.keys(localStorage).filter(k => k.startsWith('lw_') || k === 'wf_started').forEach(k => localStorage.removeItem(k)); router.push('/') }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '17px', fontWeight: 600, color: '#1D1D1F' }}
        >
          ← 返回首页
        </button>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '14px', fontWeight: 600, color: '#1D1D1F' }}>{fileName}</div>
          {fileSize && <div style={{ fontSize: '12px', color: '#86868B' }}>{formatBytes(+fileSize)}</div>}
        </div>
        <div style={{ width: 80 }} />
      </div>

      <div style={{ maxWidth: '520px', margin: '60px auto 0', padding: '0 24px' }}>
        {/* 标题 */}
        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
          <h2 style={{ fontSize: '24px', fontWeight: 700, color: '#1D1D1F', margin: '0 0 8px' }}>
            {error ? '处理出错' : '正在处理'}
          </h2>
          <p style={{ fontSize: '14px', color: '#5F6368', margin: 0 }}>
            {error ? '请根据提示操作' : '预计需要 2-3 分钟，请勿关闭页面'}
          </p>
        </div>

        {/* 步骤卡片 */}
        <div style={{ background: '#FFFFFF', borderRadius: '16px', padding: '32px', boxShadow: '0 2px 16px rgba(0,0,0,0.08)' }}>
          {steps.slice(0, 4).map((step, i) => (
            <div key={step.id} style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '16px',
              paddingBottom: i < 3 ? '32px' : '0',
              position: 'relative',
              opacity: step.status === 'pending' ? 0.45 : 1,
              transition: 'opacity 0.3s',
            }}>
              {/* 连接线 */}
              {i < 3 && (
                <div style={{
                  position: 'absolute',
                  left: '19px',
                  top: '40px',
                  width: '2px',
                  height: 'calc(100% - 16px)',
                  background: step.status === 'done' ? '#0071E3' : '#E8EAED',
                  transition: 'background 0.3s',
                }} />
              )}

              {/* 状态圆圈 */}
              <div style={{
                width: '40px', height: '40px', borderRadius: '50%',
                background: step.status === 'done' ? '#0071E3' : step.status === 'active' ? '#E8F0FE' : step.status === 'error' ? '#FCE8E6' : '#F1F3F4',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, position: 'relative', zIndex: 1,
                transition: 'background 0.3s',
              }}>
                {step.status === 'active' && (
                  <div style={{
                    width: '20px', height: '20px', borderRadius: '50%',
                    border: '2px solid #0071E3', borderTopColor: 'transparent',
                    animation: 'spin 1s linear infinite',
                  }} />
                )}
                {step.status === 'done' && (
                  <span style={{ color: '#FFF', fontSize: '16px', fontWeight: 600 }}>✓</span>
                )}
                {step.status === 'error' && (
                  <span style={{ color: '#D93025', fontSize: '16px', fontWeight: 600 }}>!</span>
                )}
                {step.status === 'pending' && (
                  <span style={{ color: '#86868B', fontSize: '14px', fontWeight: 500 }}>{i + 1}</span>
                )}
              </div>

              {/* 文字 */}
              <div style={{ flex: 1, paddingTop: '4px' }}>
                <div style={{
                  fontSize: '15px', fontWeight: 600,
                  color: step.status === 'active' ? '#0071E3' : step.status === 'error' ? '#D93025' : '#1D1D1F',
                }}>
                  {step.title}
                </div>
                <div style={{ fontSize: '13px', color: step.status === 'error' ? '#D93025' : '#5F6368', marginTop: '4px', lineHeight: 1.4 }}>
                  {step.message}
                </div>
                {step.status === 'active' && step.progress > 0 && (
                  <div style={{ marginTop: '10px', height: '3px', background: '#E8EAED', borderRadius: '2px', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', width: `${step.progress}%`,
                      background: '#0071E3', borderRadius: '2px',
                      transition: 'width 0.4s ease',
                    }} />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* 错误处理 */}
        {(error || rateLimit) && (
          <div style={{ marginTop: '24px', padding: '20px', background: '#FEF0EF', borderRadius: '12px', border: '1px solid #F5C6C5' }}>
            <div style={{ fontSize: '14px', color: '#D93025', marginBottom: '16px', lineHeight: 1.5 }}>
              {error}
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => { startedRef.current = false; processFile() }}
                style={{ flex: 1, padding: '10px', background: '#0071E3', color: '#FFF', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: 500 }}
              >
                重试
              </button>
              <button
                onClick={() => { localStorage.clear(); router.push('/') }}
                style={{ flex: 1, padding: '10px', background: '#FFF', color: '#0071E3', border: '1px solid #0071E3', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: 500 }}
              >
                重新上传
              </button>
            </div>
          </div>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
