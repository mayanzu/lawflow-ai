'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { C, Icons } from '@/ui'
import { taskManager, useActiveTasks, Task } from '@/lib/task-manager'

// 任务状态指示器（导航栏用）
export function TaskIndicator() {
  const activeTasks = useActiveTasks()
  const [isOpen, setIsOpen] = useState(false)
  const router = useRouter()

  if (activeTasks.length === 0) return null

  const totalProgress = activeTasks.reduce((sum, t) => sum + t.progress, 0) / activeTasks.length

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 12px',
          background: '#E8F0FE',
          border: 'none',
          borderRadius: 20,
          cursor: 'pointer',
          fontSize: '0.8rem',
          color: C.blue,
          fontWeight: 500,
        }}
      >
        <div style={{
          width: 16,
          height: 16,
          borderRadius: '50%',
          border: `2px solid ${C.blue}`,
          borderTopColor: 'transparent',
          animation: 'spin 1s linear infinite',
        }} />
        {activeTasks.length} 个任务处理中
      </button>

      {isOpen && (
        <div style={{
          position: 'absolute',
          top: '100%',
          right: 0,
          marginTop: 8,
          width: 320,
          background: C.white,
          borderRadius: 16,
          boxShadow: '0 8px 30px rgba(0,0,0,0.12)',
          border: `1px solid ${C.border}`,
          zIndex: 1000,
          overflow: 'hidden',
        }}>
          <div style={{
            padding: '12px 16px',
            borderBottom: `1px solid ${C.border}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: C.text }}>
              后台任务
            </span>
            <span style={{ fontSize: '0.75rem', color: C.muted }}>
              平均进度 {Math.round(totalProgress)}%
            </span>
          </div>
          
          <div style={{ maxHeight: 300, overflow: 'auto' }}>
            {activeTasks.map(task => (
              <TaskItem 
                key={task.id} 
                task={task}
                onClick={() => {
                  if (task.fileId) {
                    router.push(`/flow?file=${encodeURIComponent(task.fileName || '')}`)
                    setIsOpen(false)
                  }
                }}
              />
            ))}
          </div>

          <div style={{
            padding: '10px 16px',
            borderTop: `1px solid ${C.border}`,
            background: C.bg,
          }}>
            <button
              onClick={() => {
                router.push('/tasks')
                setIsOpen(false)
              }}
              style={{
                width: '100%',
                padding: '8px',
                background: 'transparent',
                border: 'none',
                color: C.blue,
                fontSize: '0.8rem',
                cursor: 'pointer',
              }}
            >
              查看全部任务
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}

// 单个任务项
function TaskItem({ task, onClick }: { task: Task; onClick?: () => void }) {
  const getIcon = () => {
    if (task.type === 'ocr') return Icons.search(16, C.blue)
    if (task.type === 'analyze') return Icons.brain(16, C.blue)
    return Icons.doc(16, C.blue)
  }

  return (
    <div
      onClick={onClick}
      style={{
        padding: '12px 16px',
        borderBottom: `1px solid ${C.border}`,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'background 0.2s',
      }}
      onMouseEnter={e => {
        if (onClick) e.currentTarget.style.background = C.bg
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = 'transparent'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        {getIcon()}
        <span style={{ fontSize: '0.8rem', color: C.text, flex: 1 }}>
          {task.fileName || '未命名文件'}
        </span>
        <span style={{ fontSize: '0.75rem', color: C.muted }}>
          {task.progress}%
        </span>
      </div>
      
      <div style={{ fontSize: '0.75rem', color: C.muted, marginBottom: 6 }}>
        {task.message}
      </div>
      
      <div style={{
        height: 3,
        background: C.border,
        borderRadius: 2,
        overflow: 'hidden',
      }}>
        <div style={{
          height: '100%',
          width: `${task.progress}%`,
          background: task.status === 'failed' ? C.red : C.blue,
          borderRadius: 2,
          transition: 'width 0.3s ease',
        }} />
      </div>
    </div>
  )
}

// 全屏任务管理页面
export default function TaskManagerPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('all')
  const router = useRouter()

  useEffect(() => {
    const updateTasks = () => {
      let all = taskManager.getAllTasks()
      if (filter === 'active') {
        all = all.filter(t => t.status === 'pending' || t.status === 'processing')
      } else if (filter === 'completed') {
        all = all.filter(t => t.status === 'completed' || t.status === 'failed')
      }
      setTasks(all)
    }

    updateTasks()
    const interval = setInterval(updateTasks, 1000)
    return () => clearInterval(interval)
  }, [filter])

  const handleClearCompleted = () => {
    tasks
      .filter(t => t.status === 'completed' || t.status === 'failed')
      .forEach(t => taskManager.removeTask(t.id))
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg }}>
      <Nav
        title="任务管理"
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
            }}
          >
            {Icons.arrowLeft(16, C.blue)} 返回
          </button>
        }
      />

      <main style={{ maxWidth: 800, margin: '0 auto', padding: '32px 24px' }}>
        {/* 筛选标签 */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
          {(['all', 'active', 'completed'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                padding: '8px 16px',
                background: filter === f ? C.blue : C.white,
                color: filter === f ? '#FFF' : C.text,
                border: `1px solid ${filter === f ? C.blue : C.border}`,
                borderRadius: 20,
                fontSize: '0.85rem',
                cursor: 'pointer',
              }}
            >
              {f === 'all' ? '全部' : f === 'active' ? '进行中' : '已完成'}
            </button>
          ))}
          
          <div style={{ flex: 1 }} />
          
          <button
            onClick={handleClearCompleted}
            style={{
              padding: '8px 16px',
              background: 'transparent',
              color: C.muted,
              border: `1px solid ${C.border}`,
              borderRadius: 20,
              fontSize: '0.85rem',
              cursor: 'pointer',
            }}
          >
            清理已完成
          </button>
        </div>

        {/* 任务列表 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {tasks.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: 64,
              color: C.muted,
            }}>
              <div style={{ fontSize: '1rem', marginBottom: 8 }}>暂无任务</div>
              <div style={{ fontSize: '0.85rem' }}>
                {filter === 'all' ? '上传文件开始处理' : '该分类下没有任务'}
              </div>
            </div>
          ) : (
            tasks.map(task => (
              <TaskCard key={task.id} task={task} />
            ))
          )}
        </div>
      </main>
    </div>
  )
}

// 任务卡片
function TaskCard({ task }: { task: Task }) {
  const router = useRouter()

  const getStatusColor = () => {
    switch (task.status) {
      case 'completed': return C.green
      case 'failed': return C.red
      case 'processing': return C.blue
      case 'cancelled': return C.muted
      default: return C.muted
    }
  }

  const getStatusText = () => {
    switch (task.status) {
      case 'completed': return '已完成'
      case 'failed': return '失败'
      case 'processing': return '处理中'
      case 'cancelled': return '已取消'
      default: return '等待中'
    }
  }

  return (
    <div style={{
      background: C.white,
      borderRadius: 16,
      padding: 20,
      border: `1px solid ${C.border}`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: '0.95rem', fontWeight: 600, color: C.text, marginBottom: 4 }}>
            {task.fileName || '未命名文件'}
          </div>
          <div style={{ fontSize: '0.8rem', color: C.muted }}>
            {task.type === 'ocr' ? 'OCR识别' : task.type === 'analyze' ? 'AI分析' : '文书生成'}
            {' · '}
            {new Date(task.createdAt).toLocaleString()}
          </div>
        </div>
        <div style={{
          padding: '4px 12px',
          background: `${getStatusColor()}15`,
          color: getStatusColor(),
          borderRadius: 12,
          fontSize: '0.75rem',
          fontWeight: 500,
        }}>
          {getStatusText()}
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: '0.8rem', color: C.muted, marginBottom: 6 }}>
          {task.message}
        </div>
        <div style={{
          height: 6,
          background: C.border,
          borderRadius: 3,
          overflow: 'hidden',
        }}>
          <div style={{
            height: '100%',
            width: `${task.progress}%`,
            background: getStatusColor(),
            borderRadius: 3,
            transition: 'width 0.3s ease',
          }} />
        </div>
      </div>

      {task.error && (
        <div style={{
          padding: 10,
          background: '#FCE8E6',
          borderRadius: 8,
          fontSize: '0.8rem',
          color: C.red,
          marginBottom: 12,
        }}>
          {task.error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        {task.status === 'completed' && task.fileId && (
          <button
            onClick={() => router.push(`/flow?file=${encodeURIComponent(task.fileName || '')}`)}
            style={{
              padding: '8px 16px',
              background: C.blue,
              color: '#FFF',
              border: 'none',
              borderRadius: 8,
              fontSize: '0.8rem',
              cursor: 'pointer',
            }}
          >
            查看结果
          </button>
        )}
        
        {task.status === 'failed' && (
          <button
            onClick={() => {
              // 重试逻辑
            }}
            style={{
              padding: '8px 16px',
              background: C.blue,
              color: '#FFF',
              border: 'none',
              borderRadius: 8,
              fontSize: '0.8rem',
              cursor: 'pointer',
            }}
          >
            重试
          </button>
        )}
        
        <button
          onClick={() => taskManager.removeTask(task.id)}
          style={{
            padding: '8px 16px',
            background: 'transparent',
            color: C.muted,
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            fontSize: '0.8rem',
            cursor: 'pointer',
          }}
        >
          删除
        </button>
      </div>
    </div>
  )
}

// 简化Nav组件
function Nav({ title, left }: { title: string; left?: React.ReactNode }) {
  return (
    <nav style={{
      position: 'sticky',
      top: 0,
      zIndex: 100,
      backdropFilter: 'saturate(180%) blur(20px)',
      WebkitBackdropFilter: 'saturate(180%) blur(20px)',
      background: 'rgba(255,255,255,0.72)',
      borderBottom: '1px solid rgba(0,0,0,0.06)',
    }}>
      <div style={{
        maxWidth: 1200,
        margin: '0 auto',
        padding: '0 24px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        height: 56,
      }}>
        {left}
        <span style={{ fontSize: '1.1rem', fontWeight: 700, color: C.text }}>{title}</span>
        <div style={{ width: 60 }} />
      </div>
    </nav>
  )
}
