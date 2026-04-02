'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

interface StepState {
  status: 'pending' | 'active' | 'done' | 'error'
  progress: number
  message: string
}

export default function GeneratePage() {
  const router = useRouter()
  const [analyzeStep, setAnalyzeStep] = useState<StepState>({ status: 'pending', progress: 0, message: '等待开始' })
  const [generateStep, setGenerateStep] = useState<StepState>({ status: 'pending', progress: 0, message: '等待开始' })
  const [error, setError] = useState('')
  const [appealText, setAppealText] = useState('')
  const [info, setInfo] = useState<Record<string, string>>({})
  const [legalBasis, setLegalBasis] = useState<string[]>([])

  const processRef = useRef<boolean>(false)
  const abortRef = useRef<AbortController | null>(null)

  function sleep(ms: number) { return new Promise<void>(r => setTimeout(r, ms)) }

  async function callApi(url: string, body: any) {
    for (let attempt = 0; attempt <= 2; attempt++) {
      if (abortRef.current?.signal.aborted) throw new Error('请求已取消')
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: abortRef.current?.signal,
      })
      if (res.status === 429) {
        if (attempt === 2) throw new Error('API 频率超限，请稍后重试')
        await sleep((attempt + 1) * 8000)
        continue
      }
      if (!res.ok) throw new Error(`请求失败: ${res.status}`)
      return res.json()
    }
    throw new Error('请求失败')
  }

  async function run() {
    if (processRef.current) return
    processRef.current = true

    const ocrText = localStorage.getItem('lw_ocr_text') || ''
    const rawInfo = localStorage.getItem('lw_analyze_info')
    if (!rawInfo) { setError('未找到案件信息，请重新开始'); return }

    let parsedInfo: Record<string, string> = {}
    try { parsedInfo = JSON.parse(rawInfo) } catch {}

    // ─── AI 分析 ───
    setAnalyzeStep({ status: 'active', progress: 10, message: '正在分析案件...' })
    try {
      setAnalyzeStep({ status: 'active', progress: 30, message: '提取案件要素...' })
      await sleep(600)
      setAnalyzeStep({ status: 'active', progress: 70, message: '整理法律关系...' })
      await sleep(500)
      setAnalyzeStep({ status: 'done', progress: 100, message: `已提取 ${Object.keys(parsedInfo).length} 项` })
    } catch (err: any) {
      if (err.message === '请求已取消') return
      setAnalyzeStep({ status: 'error', progress: 0, message: err.message })
      setError(`分析失败: ${err.message}`)
      return
    }

    // ─── 生成诉状 ───
    setGenerateStep({ status: 'active', progress: 10, message: '正在准备生成...' })
    try {
      abortRef.current = new AbortController()
      const timeout = setTimeout(() => abortRef.current?.abort(), 180000)

      setGenerateStep({ status: 'active', progress: 20, message: '正在生成上诉状...' })
      const genRes = await callApi('/api/generate-appeal', {
        info: parsedInfo,
        ocr_text: ocrText,
      })

      clearTimeout(timeout)

      if (!genRes.success) throw new Error(genRes.error || '生成失败')

      const appeal = genRes.appeal || ''
      const basis = genRes.legal_basis || []
      setAppealText(appeal)
      setLegalBasis(basis)
      localStorage.setItem('lw_appeal_text', appeal)
      if (basis.length > 0) localStorage.setItem('lw_legal_basis', JSON.stringify(basis))

      setGenerateStep({ status: 'done', progress: 100, message: '生成完成' })
      await sleep(600)
      router.push('/result')
    } catch (err: any) {
      clearTimeout(180000)
      if (err.name === 'AbortError' || err.message === '请求已取消') return
      setGenerateStep({ status: 'error', progress: 0, message: err.message })
      setError(`生成失败: ${err.message}`)
    }
  }

  useEffect(() => {
    const raw = localStorage.getItem('lw_analyze_info')
    if (raw) {
      try { setInfo(JSON.parse(raw)) } catch {}
    }
    const t = setTimeout(() => run(), 400)
    return () => {
      clearTimeout(t)
      abortRef.current?.abort()
    }
  }, [])

  return (
    <div style={{ minHeight: '100vh', background: '#F8F9FA', fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif' }}>
      {/* 导航 */}
      <div style={{ padding: '16px 40px', background: '#FFF', borderBottom: '1px solid #E8EAED', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button
          onClick={() => { Object.keys(localStorage).filter(k => k.startsWith('lw_') || k === 'wf_started').forEach(k => localStorage.removeItem(k)); abortRef.current?.abort(); router.push('/') }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '17px', fontWeight: 600, color: '#1D1D1F' }}
        >
          ← 返回首页
        </button>
        <span style={{ fontSize: '14px', color: '#6E6E73' }}>生成上诉状</span>
        <div style={{ width: 80 }} />
      </div>

      <div style={{ maxWidth: 720, margin: '60px auto 0', padding: '0 24px' }}>
        {/* 页面标题 */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <h2 style={{ fontSize: 24, fontWeight: 700, color: '#1D1D1F', margin: '0 0 8px' }}>
            {error ? '生成出错' : '正在生成上诉状'}
          </h2>
          <p style={{ fontSize: 14, color: '#86868B', margin: 0 }}>
            {error ? '请根据提示操作' : 'AI 正在生成规范的上诉状，请稍候'}
          </p>
        </div>

        {/* 已确认案件信息 */}
        <div style={{ background: '#FFF', borderRadius: 16, padding: '20px 24px', marginBottom: 24, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: '#86868B', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>已确认案件信息</h3>
            <button onClick={() => router.push('/confirm')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#0071E3', fontWeight: 500 }}>
              修改信息
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            {Object.entries(info).filter(([k]) => k !== 'raw' && k !== '判决结果').slice(0, 6).map(([key, val]) => (
              <div key={key} style={{ background: '#F8F9FA', borderRadius: 8, padding: '10px 12px' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#86868B', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>{key}</div>
                <div style={{ fontSize: 13, fontWeight: 500, color: '#1D1D1F', lineHeight: 1.4, wordBreak: 'break-word' }}>{String(val)}</div>
              </div>
            ))}
          </div>
        </div>

        {/* AI 分析进度 */}
        <div style={{ background: '#FFF', borderRadius: 16, padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
              background: analyzeStep.status === 'done' ? '#0071E3' : analyzeStep.status === 'active' ? '#E8F0FE' : analyzeStep.status === 'error' ? '#FCE8E6' : '#F1F3F4',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {analyzeStep.status === 'active' && <div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid #0071E3', borderTopColor: 'transparent', animation: 'spin 1s linear infinite' }} />}
              {analyzeStep.status === 'done' && <span style={{ color: '#FFF', fontSize: 14, fontWeight: 600 }}>✓</span>}
              {analyzeStep.status === 'error' && <span style={{ color: '#D93025', fontSize: 14, fontWeight: 600 }}>!</span>}
              {analyzeStep.status === 'pending' && <span style={{ color: '#86868B', fontSize: 12, fontWeight: 500 }}>1</span>}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: analyzeStep.status === 'error' ? '#D93025' : '#1D1D1F' }}>AI 案件分析</div>
              <div style={{ fontSize: 13, color: '#86868B', marginTop: 2 }}>{analyzeStep.message}</div>
              {analyzeStep.status === 'active' && (
                <div style={{ marginTop: 8, height: 3, background: '#E8E8ED', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${analyzeStep.progress}%`, background: '#0071E3', borderRadius: 2, transition: 'width 0.4s' }} />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 生成诉状进度 */}
        <div style={{ background: '#FFF', borderRadius: 16, padding: '20px 24px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
              background: generateStep.status === 'done' ? '#0071E3' : generateStep.status === 'active' ? '#E8F0FE' : generateStep.status === 'error' ? '#FCE8E6' : '#F1F3F4',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {generateStep.status === 'active' && <div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid #0071E3', borderTopColor: 'transparent', animation: 'spin 1s linear infinite' }} />}
              {generateStep.status === 'done' && <span style={{ color: '#FFF', fontSize: 14, fontWeight: 600 }}>✓</span>}
              {generateStep.status === 'error' && <span style={{ color: '#D93025', fontSize: 14, fontWeight: 600 }}>!</span>}
              {generateStep.status === 'pending' && <span style={{ color: '#86868B', fontSize: 12, fontWeight: 500 }}>2</span>}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: generateStep.status === 'error' ? '#D93025' : '#1D1D1F' }}>生成上诉状</div>
              <div style={{ fontSize: 13, color: '#86868B', marginTop: 2 }}>{generateStep.message}</div>
              {generateStep.status === 'active' && (
                <div style={{ marginTop: 8, height: 3, background: '#E8E8ED', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${generateStep.progress}%`, background: '#0071E3', borderRadius: 2, transition: 'width 0.4s' }} />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 错误 */}
        {error && (
          <div style={{ marginTop: 24, padding: 20, background: '#FEF0EF', borderRadius: 12, border: '1px solid #F5C6C5' }}>
            <div style={{ fontSize: 14, color: '#D93025', marginBottom: 12 }}>{error}</div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={() => { processRef.current = false; run() }} style={{ padding: '8px 20px', background: '#0071E3', color: '#FFF', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 500 }}>
                重试
              </button>
              <button onClick={() => router.push('/confirm')} style={{ padding: '8px 20px', background: '#FFF', color: '#0071E3', border: '1px solid #0071E3', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 500 }}>
                修改案件信息
              </button>
            </div>
          </div>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
