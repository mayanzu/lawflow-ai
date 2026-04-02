'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

type StepStatus = 'pending' | 'active' | 'done'

interface Step {
  id: string
  title: string
  icon: string
  status: StepStatus
  progress: number
  message: string
}

const STEPS: Step[] = [
  { id: 'upload', title: '上传文件', icon: '📤', status: 'pending', progress: 0, message: '等待上传' },
  { id: 'ocr', title: 'OCR 识别', icon: '🔍', status: 'pending', progress: 0, message: '等待识别' },
  { id: 'analyze', title: 'AI 分析', icon: '🧠', status: 'pending', progress: 0, message: '等待分析' },
  { id: 'generate', title: '生成诉状', icon: '📝', status: 'pending', progress: 0, message: '等待生成' },
  { id: 'done', title: '完成', icon: '✅', status: 'pending', progress: 0, message: '' },
]

function updateStep(steps: Step[], id: string, status: StepStatus, progress: number, message: string) {
  return steps.map(s => s.id === id ? { ...s, status, progress, message } : s)
}

export default function FlowPage() {
  const router = useRouter()
  const search = useSearchParams()
  const fileName = search.get('file') || '判决书.pdf'
  const isDone = search.get('done') === 'true'

  const [steps, setSteps] = useState<Step[]>(STEPS)
  const [currentStep, setCurrentStep] = useState(0)
  const [error, setError] = useState('')

  // 初始化：如果还没开始处理，立即开始
  useEffect(() => {
    const started = localStorage.getItem('wf_started')
    if (!started) {
      localStorage.setItem('wf_started', 'true')
      processSteps()
    } else if (isDone) {
      // 显示完成状态
      setSteps(STEPS.map(s => ({ ...s, status: 'done', progress: 100, message: '完成' })))
      setCurrentStep(4)
      return
    }
  }, [isDone])

  async function processSteps() {
    try {
      // Step 0: 模拟上传进度
      setSteps(s => updateStep(s, 'upload', 'active', 10, '准备上传...'))
      await sleep(200)
      setSteps(s => updateStep(s, 'upload', 'active', 30, '上传中...'))
      await sleep(500)
      setSteps(s => updateStep(s, 'upload', 'active', 70, '上传中...'))
      await sleep(300)
      setSteps(s => updateStep(s, 'upload', 'active', 90, '上传完成'))
      await sleep(200)
      setSteps(s => updateStep(s, 'upload', 'done', 100, '上传完成'))
      setCurrentStep(1)

      // Step 1: OCR 识别
      setSteps(s => updateStep(s, 'ocr', 'active', 10, '正在识别文档...'))
      const ocrResult = await mockOCR()
      setSteps(s => updateStep(s, 'ocr', 'active', 50, ocrResult?.text?.charAt(0) || '识别中...'))
      await sleep(1000)
      setSteps(s => updateStep(s, 'ocr', 'done', 100, `识别完成 - ${ocrResult.characters || 0} 字`))
      setCurrentStep(2)

      // Step 2: AI 分析
      setSteps(s => updateStep(s, 'analyze', 'active', 10, '正在分析案件信息...'))
      await sleep(1000)
      setSteps(s => updateStep(s, 'analyze', 'active', 40, '提取关键信息...'))
      await sleep(800)
      setSteps(s => updateStep(s, 'analyze', 'active', 70, '分析法律关系...'))
      await sleep(800)
      setSteps(s => updateStep(s, 'analyze', 'done', 100, `分析完成 - ${['案号', '当事人', '案件类型'].length} 项信息`))
      setCurrentStep(3)

      // Step 3: AI 生成
      setSteps(s => updateStep(s, 'generate', 'active', 10, '正在准备生成...'))
      await sleep(800)
      setSteps(s => updateStep(s, 'generate', 'active', 30, '正在生成上诉状...'))
      await sleep(1200)
      setSteps(s => updateStep(s, 'generate', 'active', 60, '生成正文中...'))
      await sleep(1000)
      setSteps(s => updateStep(s, 'generate', 'active', 80, '完善格式...'))
      await sleep(600)
      setSteps(s => updateStep(s, 'generate', 'done', 100, '生成完成'))
      setCurrentStep(4)

      // 完成，重定向到结果页
      router.push(`/result?done=true`)

    } catch (err: any) {
      setError(err.message || '处理失败，请重试')
    }
  }

  function mockOCR() {
    // 模拟 OCR 识别
    return new Promise<{ text: string; characters: number }>((resolve) => {
      setTimeout(() => resolve({ text: '(2025)京0105民初12345号', characters: 2456 }), 1500)
    })
  }

  function sleep(ms: number) {
    return new Promise(r => setTimeout(r, ms))
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F8F9FA', fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif' }}>
      {/* 顶部导航 */}
      <div style={{ padding: '16px 40px', background: '#FFFFFF', borderBottom: '1px solid #E8EAED', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button onClick={() => router.push('/')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '17px', fontWeight: 600, color: '#1D1D1F' }}>
          ← 返回
        </button>
        <span style={{ fontSize: '14px', color: '#5F6368' }}>{fileName}</span>
      </div>

      <div style={{ maxWidth: '500px', margin: '60px auto 0', padding: '0 24px' }}>
        {/* 标题 */}
        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
          <h2 style={{ fontSize: '24px', fontWeight: 700, color: '#1D1D1F', margin: '0 0 8px' }}>
            处理中
          </h2>
          <p style={{ fontSize: '14px', color: '#5F6368', margin: 0 }}>
            预计需要 2-3 分钟，请勿关闭页面
          </p>
        </div>

        {/* 步骤列表 */}
        <div style={{ background: '#FFFFFF', borderRadius: '16px', padding: '32px', boxShadow: '0 2px 16px rgba(0,0,0,0.08)' }}>
          {steps.slice(0, 5).map((step, i) => (
            <div key={step.id} style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '16px',
              paddingBottom: i < 3 ? '28px' : '0',
              position: 'relative',
              opacity: step.status === 'pending' ? 0.4 : 1,
              transition: 'opacity 0.3s',
            }}>
              {/* 连接线 */}
              {i < 3 && (
                <div style={{
                  position: 'absolute',
                  left: '19px',
                  top: '38px',
                  width: '2px',
                  height: 'calc(100% - 10px)',
                  background: step.status === 'done' ? '#0071E3' : '#E8EAED',
                }} />
              )}

              {/* 图标/状态 */}
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                background: step.status === 'done' ? '#0071E3' : step.status === 'active' ? '#E8F0FE' : '#F1F3F4',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '18px',
                flexShrink: 0,
                position: 'relative',
              }}>
                {step.status === 'active' ? (
                  <div style={{
                    width: '20px',
                    height: '20px',
                    borderRadius: '50%',
                    border: '2px solid #0071E3',
                    borderTopColor: 'transparent',
                    animation: 'spin 1s linear infinite',
                  }} />
                ) : step.status === 'done' ? (
                  <span style={{ color: '#FFF', fontWeight: 500 }}>✓</span>
                ) : (
                  <span style={{ fontSize: '14px', fontWeight: 500, color: '#5F6368' }}>{i + 1}</span>
                )}
              </div>

              {/* 文字内容 */}
              <div style={{ flex: 1, paddingTop: '2px' }}>
                <div style={{ fontSize: '15px', fontWeight: 600, color: step.status === 'active' ? '#0071E3' : '#1D1D1F' }}>
                  {step.title}
                </div>
                <div style={{ fontSize: '13px', color: '#5F6368', marginTop: '4px' }}>
                  {step.message}
                </div>
                {step.status === 'active' && (
                  <div style={{ marginTop: '8px', height: '4px', background: '#E8EAED', borderRadius: '2px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${step.progress}%`, background: '#0071E3', borderRadius: '2px', transition: 'width 0.3s' }} />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* 错误提示 */}
        {error && (
          <div style={{ marginTop: '24px', padding: '16px', background: '#FCE8E6', borderRadius: '12px', fontSize: '14px', color: '#D93025', textAlign: 'center' }}>
            {error}
            <button onClick={() => window.location.reload()} style={{ marginTop: '12px', padding: '8px 16px', background: '#FFF', border: '1px solid #D93025', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', color: '#D93025' }}>
              重新处理
            </button>
          </div>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
