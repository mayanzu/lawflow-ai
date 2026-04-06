'use client'
import { useState, useEffect, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { C, Nav, Card, Spinner, Btn, Icons } from '@/ui'
import { taskManager, useTask, Task, TaskType } from '@/lib/task-manager'

const DOC_TYPES = [
  { key: 'appeal',         name: '民事上诉状', desc: '不服一审判决',     icon: 'doc' },
  { key: 'complaint',      name: '民事起诉状', desc: '新案立案',         icon: 'fileText' },
  { key: 'defense',        name: '民事答辩状', desc: '被诉后答辩',       icon: 'shield' },
  { key: 'representation', name: '代理词',     desc: '庭审总结',         icon: 'scale' },
  { key: 'execution',      name: '执行申请书', desc: '申请强制执行',     icon: 'clock' },
  { key: 'preservation',   name: '保全申请书', desc: '诉讼中保全',       icon: 'lock' },
]

const ICON_MAP: Record<string, (s: number, c: string) => React.ReactElement> = {
  search: Icons.search, brain: Icons.brain, grid: Icons.grid,
  doc: Icons.doc, fileText: Icons.fileText, shield: Icons.shield,
  scale: Icons.scale, clock: Icons.clock, lock: Icons.lock,
}

// 任务进度组件
function TaskProgressCard({ 
  task, 
  onRetry, 
  onCancel 
}: { 
  task: Task
  onRetry?: () => void
  onCancel?: () => void 
}) {
  const isActive = task.status === 'pending' || task.status === 'processing'
  const isError = task.status === 'failed'
  const isCompleted = task.status === 'completed'

  const getStatusIcon = () => {
    if (isCompleted) return Icons.check(20, C.green)
    if (isError) return <span style={{ color: C.red, fontSize: 18, fontWeight: 700 }}>!</span>
    if (isActive) return <Spinner size={20} />
    return null
  }

  const getStatusColor = () => {
    if (isCompleted) return C.green
    if (isError) return C.red
    if (isActive) return C.blue
    return C.muted
  }

  return (
    <Card padding={20} style={{ marginBottom: 16 }} hover={false}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ 
          width: 44, 
          height: 44, 
          borderRadius: 12, 
          background: isCompleted ? '#E8F5E9' : isError ? '#FCE8E6' : '#E8F0FE',
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          flexShrink: 0
        }}>
          {getStatusIcon()}
        </div>
        
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: '0.95rem', fontWeight: 600, color: C.text }}>
              {task.type === 'ocr' ? 'OCR识别' : task.type === 'analyze' ? 'AI分析' : '文书生成'}
            </span>
            <span style={{ 
              fontSize: '0.75rem', 
              color: getStatusColor(),
              background: isCompleted ? '#E8F5E9' : isError ? '#FCE8E6' : '#E8F0FE',
              padding: '2px 8px',
              borderRadius: 4
            }}>
              {task.status === 'pending' ? '等待中' : 
               task.status === 'processing' ? '处理中' :
               task.status === 'completed' ? '已完成' :
               task.status === 'failed' ? '失败' : '已取消'}
            </span>
          </div>
          
          <div style={{ fontSize: '0.8rem', color: C.muted, marginBottom: 8 }}>
            {task.message}
          </div>
          
          {/* 进度条 */}
          <div style={{ 
            height: 4, 
            background: C.border, 
            borderRadius: 2,
            overflow: 'hidden'
          }}>
            <div style={{
              height: '100%',
              width: `${task.progress}%`,
              background: getStatusColor(),
              borderRadius: 2,
              transition: 'width 0.3s ease'
            }} />
          </div>
        </div>

        {/* 操作按钮 */}
        <div style={{ display: 'flex', gap: 8 }}>
          {isError && onRetry && (
            <button 
              onClick={onRetry}
              style={{
                padding: '8px 16px',
                background: C.blue,
                color: '#FFF',
                border: 'none',
                borderRadius: 8,
                fontSize: '0.8rem',
                cursor: 'pointer'
              }}
            >
              重试
            </button>
          )}
          {isActive && onCancel && (
            <button 
              onClick={onCancel}
              style={{
                padding: '8px 16px',
                background: 'transparent',
                color: C.muted,
                border: `1px solid ${C.border}`,
                borderRadius: 8,
                fontSize: '0.8rem',
                cursor: 'pointer'
              }}
            >
              取消
            </button>
          )}
        </div>
      </div>
    </Card>
  )
}

// 任务列表组件
function TaskList({ 
  fileId,
  onTaskComplete 
}: { 
  fileId: string
  onTaskComplete?: (task: Task) => void 
}) {
  const [tasks, setTasks] = useState<Task[]>([])

  useEffect(() => {
    // 加载该文件相关的所有任务
    const allTasks = taskManager.getAllTasks().filter(t => t.fileId === fileId)
    setTasks(allTasks)

    // 订阅任务更新
    const interval = setInterval(() => {
      const updated = taskManager.getAllTasks().filter(t => t.fileId === fileId)
      setTasks(updated)
      
      // 检查是否有完成的任务
      updated.forEach(task => {
        if (task.status === 'completed' && task.result) {
          onTaskComplete?.(task)
        }
      })
    }, 500)

    return () => clearInterval(interval)
  }, [fileId, onTaskComplete])

  const handleRetry = async (task: Task) => {
    const endpoint = task.type === 'ocr' ? '/api/tasks' : 
                    task.type === 'analyze' ? '/api/tasks' : '/api/tasks'
    
    await taskManager.retryTask(task.id, endpoint, {
      type: task.type,
      file_id: task.fileId,
      file_name: task.fileName,
    })
    
    // 重新开始轮询
    taskManager.startPolling(task.id, '/api/tasks')
  }

  const handleCancel = (taskId: string) => {
    taskManager.cancelTask(taskId)
    fetch(`/api/tasks?taskId=${taskId}`, { method: 'DELETE' })
  }

  if (tasks.length === 0) return null

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ 
        fontSize: '0.75rem', 
        fontWeight: 600, 
        color: C.muted, 
        letterSpacing: '0.08em',
        marginBottom: 12,
        textTransform: 'uppercase'
      }}>
        处理进度
      </div>
      {tasks.map(task => (
        <TaskProgressCard
          key={task.id}
          task={task}
          onRetry={() => handleRetry(task)}
          onCancel={() => handleCancel(task.id)}
        />
      ))}
    </div>
  )
}

// 主要内容组件
function FlowContent() {
  const router = useRouter()
  const search = useSearchParams()
  
  const [mobile, setMobile] = useState(false)
  const [fileName, setFileName] = useState('')
  const [fileId, setFileId] = useState('')
  const [ocrText, setOcrText] = useState('')
  const [analyzeInfo, setAnalyzeInfo] = useState<Record<string, string> | null>(null)
  const [infoFields, setInfoFields] = useState<Record<string, string>>({})
  const [selectedDoc, setSelectedDoc] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)

  // 初始化
  useEffect(() => {
    const check = () => setMobile(window.innerWidth < 640)
    check()
    window.addEventListener('resize', check)
    
    // 加载任务管理器
    taskManager.loadFromStorage()
    
    // 获取文件信息
    const fid = localStorage.getItem('lw_file_id') || ''
    const fname = localStorage.getItem('lw_file_name') || search.get('file') || ''
    setFileId(fid)
    setFileName(fname)
    
    // 检查是否有已保存的结果
    const savedOcr = localStorage.getItem('lw_ocr_text')
    const savedInfo = localStorage.getItem('lw_analyze_info')
    if (savedOcr) setOcrText(savedOcr)
    if (savedInfo) {
      try {
        const parsed = JSON.parse(savedInfo)
        setAnalyzeInfo(parsed)
        setInfoFields(parsed)
      } catch {}
    }
    
    return () => window.removeEventListener('resize', check)
  }, [search])

  // 启动OCR任务
  const startOcrTask = async () => {
    if (!fileId) return
    
    setIsProcessing(true)
    
    // 创建任务
    const task = taskManager.createTask('ocr', fileId, fileName)
    
    // 提交到后端
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'ocr',
        file_id: fileId,
        file_name: fileName,
      }),
    })
    
    const data = await res.json()
    if (data.success) {
      // 开始轮询
      taskManager.startPolling(task.id, '/api/tasks')
    } else {
      taskManager.updateTask(task.id, {
        status: 'failed',
        error: data.error,
        message: '启动失败',
      })
    }
  }

  // 启动AI分析任务
  const startAnalyzeTask = async () => {
    if (!fileId || !ocrText) return
    
    const task = taskManager.createTask('analyze', fileId, fileName)
    
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'analyze',
        file_id: fileId,
        file_name: fileName,
        ocr_text: ocrText,
      }),
    })
    
    const data = await res.json()
    if (data.success) {
      taskManager.startPolling(task.id, '/api/tasks')
    } else {
      taskManager.updateTask(task.id, {
        status: 'failed',
        error: data.error,
        message: '启动失败',
      })
    }
  }

  // 处理任务完成
  const handleTaskComplete = useCallback((task: Task) => {
    if (task.type === 'ocr' && task.result?.text) {
      setOcrText(task.result.text)
      localStorage.setItem('lw_ocr_text', task.result.text)
      // OCR完成，自动启动分析
      setTimeout(() => startAnalyzeTask(), 500)
    } else if (task.type === 'analyze' && task.result?.info) {
      setAnalyzeInfo(task.result.info)
      setInfoFields(task.result.info)
      localStorage.setItem('lw_analyze_info', JSON.stringify(task.result.info))
    }
  }, [])

  // 处理文书选择
  const handleSelectDoc = (docType: string) => {
    setSelectedDoc(docType)
    localStorage.setItem('lw_doc_type', docType)
    localStorage.setItem('lw_analyze_info', JSON.stringify(infoFields))
    router.push('/result')
  }

  // 更新字段
  const updateField = (key: string, value: string) => {
    const updated = { ...infoFields, [key]: value }
    setInfoFields(updated)
    localStorage.setItem('lw_analyze_info', JSON.stringify(updated))
  }

  const pad = mobile ? 16 : 32
  const hasOcr = ocrText.length > 0
  const hasAnalyze = analyzeInfo !== null

  return (
    <div style={{ minHeight: '100vh', background: C.bg }}>
      <Nav
        title={fileName || '文件处理'}
        left={
          <button 
            onClick={() => router.push('/')} 
            style={{ 
              background: 'none', 
              border: 'none', 
              cursor: 'pointer', 
              color: C.blue, 
              display: 'flex', 
              alignItems: 'center', 
              gap: 4, 
              fontSize: '0.9rem', 
              fontWeight: 500 
            }}
          >
            {Icons.arrowLeft(16, C.blue)} 返回
          </button>
        }
      />

      <main style={{ maxWidth: 800, margin: '0 auto', padding: `${mobile ? 16 : 40}px ${pad}px 80px` }}>
        
        {/* 启动处理按钮 */}
        {!hasOcr && !isProcessing && (
          <Card padding={32} style={{ textAlign: 'center', marginBottom: 24 }}>
            <div style={{ 
              width: 64, 
              height: 64, 
              borderRadius: '50%', 
              background: '#E8F0FE',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 20px'
            }}>
              {Icons.upload(32, C.blue)}
            </div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: C.text, marginBottom: 8 }}>
              开始处理文件
            </h3>
            <p style={{ fontSize: '0.85rem', color: C.muted, marginBottom: 20 }}>
              点击按钮开始OCR识别和AI分析<br/>
              处理过程在后台进行，您可以随时离开此页面
            </p>
            <Btn variant="primary" onClick={startOcrTask}>
              开始处理
            </Btn>
          </Card>
        )}

        {/* 任务进度列表 */}
        {fileId && <TaskList fileId={fileId} onTaskComplete={handleTaskComplete} />}

        {/* AI提取信息编辑 */}
        {hasAnalyze && (
          <Card padding={mobile ? 16 : 28} style={{ marginBottom: 24 }} hover={false}>
            <div style={{ 
              fontSize: '0.7rem', 
              fontWeight: 600, 
              color: C.muted, 
              letterSpacing: '0.08em', 
              marginBottom: 16, 
              textTransform: 'uppercase' 
            }}>
              AI提取的案件信息（点击可修改）
            </div>
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: mobile ? '1fr' : '1fr 1fr', 
              gap: mobile ? 10 : 14 
            }}>
              {(['案号', '案由', '原告', '被告', '判决法院', '判决日期', '上诉期限', '上诉法院'] as const).map(k => {
                const v = infoFields[k] || ''
                const isValid = Boolean(v)
                return (
                  <label key={k}>
                    <div style={{ 
                      fontSize: '0.7rem', 
                      fontWeight: 600, 
                      color: isValid ? C.muted : '#E65100', 
                      letterSpacing: '0.04em', 
                      marginBottom: 6,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4
                    }}>
                      {k} 
                      {!isValid && (
                        <span style={{ 
                          fontSize: '0.6rem', 
                          background: '#FFF3E0', 
                          color: '#E65100', 
                          padding: '1px 5px', 
                          borderRadius: 4 
                        }}>
                          待补充
                        </span>
                      )}
                    </div>
                    <input 
                      type={k === '判决日期' ? 'date' : 'text'} 
                      value={v}
                      onChange={e => updateField(k, e.target.value)}
                      style={{ 
                        width: '100%', 
                        padding: '9px 11px', 
                        border: `1px solid ${isValid ? C.border : '#FF9800'}`, 
                        borderRadius: 10, 
                        fontSize: '0.85rem', 
                        color: isValid ? C.text : '#E65100',
                        background: '#FFF',
                        outline: 'none',
                        fontFamily: 'inherit',
                        boxSizing: 'border-box'
                      }} 
                    />
                  </label>
                )
              })}
            </div>
            <div style={{ marginTop: mobile ? 10 : 14 }}>
              <label>
                <div style={{ 
                  fontSize: '0.7rem', 
                  fontWeight: 600, 
                  color: C.muted, 
                  letterSpacing: '0.04em', 
                  marginBottom: 6 
                }}>
                  判决结果
                </div>
                <textarea 
                  value={infoFields.判决结果 || ''}
                  onChange={e => updateField('判决结果', e.target.value)}
                  rows={2} 
                  style={{ 
                    width: '100%', 
                    padding: '9px 11px', 
                    border: `1px solid ${C.border}`, 
                    borderRadius: 10, 
                    fontSize: '0.85rem', 
                    color: C.text,
                    background: '#FFF',
                    outline: 'none',
                    fontFamily: 'inherit',
                    resize: 'vertical',
                    boxSizing: 'border-box'
                  }} 
                />
              </label>
            </div>
          </Card>
        )}

        {/* 文书类型选择 */}
        {hasAnalyze && (
          <div style={{ marginBottom: 32 }}>
            <div style={{ 
              fontSize: '0.7rem', 
              fontWeight: 600, 
              color: C.muted, 
              letterSpacing: '0.08em', 
              marginBottom: 14, 
              textTransform: 'uppercase' 
            }}>
              选择要生成的文书类型
            </div>
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: mobile ? '1fr' : '1fr 1fr', 
              gap: mobile ? 10 : 14 
            }}>
              {DOC_TYPES.map(doc => {
                const isSelected = selectedDoc === doc.key
                const Icon = ICON_MAP[doc.icon]
                return (
                  <div 
                    key={doc.key} 
                    onClick={() => handleSelectDoc(doc.key)}
                    style={{
                      background: isSelected ? '#E8F0FE' : C.white,
                      borderRadius: mobile ? 16 : 20,
                      padding: mobile ? '16px 14px' : '20px 18px',
                      cursor: 'pointer',
                      border: isSelected ? `2px solid ${C.blue}` : `1px solid ${C.border}`,
                      transition: 'all 0.2s ease',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 14,
                    }}
                  >
                    <div style={{ 
                      width: 40, 
                      height: 40, 
                      borderRadius: 12, 
                      background: isSelected ? C.blue : C.bg,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}>
                      {Icon!(18, isSelected ? '#FFF' : C.blue)}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ 
                        fontSize: '0.9rem', 
                        fontWeight: 600, 
                        color: C.text,
                        letterSpacing: '-0.02em'
                      }}>
                        {doc.name}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: C.muted, marginTop: 2 }}>
                        {doc.desc}
                      </div>
                    </div>
                    {isSelected && Icons.check(14, C.blue)}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* OCR原文折叠 */}
        {hasOcr && (
          <OcrPreview text={ocrText} mobile={mobile} />
        )}
      </main>
    </div>
  )
}

// OCR预览组件
function OcrPreview({ text, mobile }: { text: string, mobile: boolean }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div style={{ borderRadius: 16, overflow: 'hidden', border: `1px solid ${C.border}` }}>
      <div 
        onClick={() => setExpanded(v => !v)}
        style={{ 
          padding: '14px 16px', 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          cursor: 'pointer', 
          background: C.white 
        }}
      >
        <div>
          <div style={{ 
            fontSize: '0.7rem', 
            fontWeight: 600, 
            color: C.muted, 
            letterSpacing: '0.06em',
            marginBottom: 2 
          }}>
            OCR识别原文
          </div>
          <div style={{ fontSize: '0.78rem', color: C.muted }}>
            {text.length.toLocaleString()} 字
          </div>
        </div>
        <div style={{ fontSize: '0.78rem', color: C.blue, fontWeight: 500 }}>
          {expanded ? '收起' : '展开'}
        </div>
      </div>
      {expanded && (
        <div style={{ 
          padding: '0 16px 14px', 
          maxHeight: mobile ? 200 : 280, 
          overflow: 'auto', 
          background: C.bg 
        }}>
          <pre style={{ 
            margin: 0, 
            fontSize: '0.78rem', 
            lineHeight: 1.8, 
            color: C.sub,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            fontFamily: 'inherit'
          }}>
            {text}
          </pre>
        </div>
      )}
    </div>
  )
}

export default function FlowPage() {
  return (
    <Suspense>
      <FlowContent />
    </Suspense>
  )
}
