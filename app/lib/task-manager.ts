// 异步任务管理器 - UI优先响应架构
// 管理OCR、AI分析等后台任务的创建、轮询和状态更新

export type TaskType = 'ocr' | 'analyze' | 'generate'
export type TaskStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled'

export interface Task {
  id: string
  type: TaskType
  status: TaskStatus
  progress: number // 0-100
  message: string
  result?: any
  error?: string
  createdAt: number
  updatedAt: number
  fileId?: string
  fileName?: string
}

type TaskListener = (task: Task) => void

class TaskManager {
  private tasks: Map<string, Task> = new Map()
  private listeners: Map<string, Set<TaskListener>> = new Map()
  private pollIntervals: Map<string, number> = new Map()
  private readonly POLL_INTERVAL = 1000 // 1秒轮询一次
  private readonly MAX_POLL_TIME = 10 * 60 * 1000 // 最大轮询10分钟

  // 创建新任务
  createTask(type: TaskType, fileId: string, fileName: string): Task {
    const task: Task = {
      id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type,
      status: 'pending',
      progress: 0,
      message: '等待处理...',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      fileId,
      fileName,
    }
    this.tasks.set(task.id, task)
    this.saveToStorage()
    return task
  }

  // 获取任务
  getTask(taskId: string): Task | undefined {
    return this.tasks.get(taskId)
  }

  // 获取所有任务
  getAllTasks(): Task[] {
    return Array.from(this.tasks.values()).sort((a, b) => b.createdAt - a.createdAt)
  }

  // 获取进行中的任务
  getActiveTasks(): Task[] {
    return this.getAllTasks().filter(t => t.status === 'pending' || t.status === 'processing')
  }

  // 更新任务状态
  updateTask(taskId: string, updates: Partial<Task>): Task | undefined {
    const task = this.tasks.get(taskId)
    if (!task) return undefined

    const updatedTask = { ...task, ...updates, updatedAt: Date.now() }
    this.tasks.set(taskId, updatedTask)
    this.saveToStorage()
    this.notifyListeners(taskId, updatedTask)
    return updatedTask
  }

  // 订阅任务更新
  subscribe(taskId: string, listener: TaskListener): () => void {
    if (!this.listeners.has(taskId)) {
      this.listeners.set(taskId, new Set())
    }
    this.listeners.get(taskId)!.add(listener)

    // 立即通知当前状态
    const task = this.tasks.get(taskId)
    if (task) listener(task)

    // 返回取消订阅函数
    return () => {
      this.listeners.get(taskId)?.delete(listener)
    }
  }

  // 通知监听器
  private notifyListeners(taskId: string, task: Task): void {
    this.listeners.get(taskId)?.forEach(listener => {
      try {
        listener(task)
      } catch (e) {
        console.error('Task listener error:', e)
      }
    })
  }

  // 开始轮询任务状态
  startPolling(taskId: string, apiEndpoint: string): void {
    if (this.pollIntervals.has(taskId)) return

    const startTime = Date.now()
    
    const poll = async () => {
      const task = this.tasks.get(taskId)
      if (!task) return

      // 超过最大轮询时间
      if (Date.now() - startTime > this.MAX_POLL_TIME) {
        this.updateTask(taskId, { 
          status: 'failed', 
          error: '任务处理超时',
          message: '处理超时，请重试'
        })
        this.stopPolling(taskId)
        return
      }

      // 任务已完成或失败
      if (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') {
        this.stopPolling(taskId)
        return
      }

      try {
        const res = await fetch(`${apiEndpoint}?taskId=${taskId}`)
        const data = await res.json()

        if (data.success) {
          this.updateTask(taskId, {
            status: data.status,
            progress: data.progress,
            message: data.message,
            result: data.result,
            error: data.error,
          })

          // 任务结束，停止轮询
          if (data.status === 'completed' || data.status === 'failed') {
            this.stopPolling(taskId)
          }
        }
      } catch (e) {
        console.error('Poll error:', e)
      }
    }

    // 立即执行一次
    poll()
    
    // 设置定时轮询
    const interval = window.setInterval(poll, this.POLL_INTERVAL)
    this.pollIntervals.set(taskId, interval)
  }

  // 停止轮询
  stopPolling(taskId: string): void {
    const interval = this.pollIntervals.get(taskId)
    if (interval) {
      clearInterval(interval)
      this.pollIntervals.delete(taskId)
    }
  }

  // 取消任务
  cancelTask(taskId: string): boolean {
    const task = this.tasks.get(taskId)
    if (!task || task.status === 'completed' || task.status === 'failed') {
      return false
    }

    this.updateTask(taskId, { status: 'cancelled', message: '已取消' })
    this.stopPolling(taskId)
    return true
  }

  // 删除任务
  removeTask(taskId: string): void {
    this.stopPolling(taskId)
    this.tasks.delete(taskId)
    this.listeners.delete(taskId)
    this.saveToStorage()
  }

  // 清理旧任务（保留最近20个）
  cleanup(): void {
    const tasks = this.getAllTasks()
    if (tasks.length > 20) {
      const toRemove = tasks.slice(20)
      toRemove.forEach(t => this.removeTask(t.id))
    }
  }

  // 保存到 localStorage
  private saveToStorage(): void {
    try {
      const data = Array.from(this.tasks.entries())
      localStorage.setItem('lw_tasks', JSON.stringify(data))
    } catch (e) {
      console.error('Failed to save tasks:', e)
    }
  }

  // 从 localStorage 加载
  loadFromStorage(): void {
    try {
      const data = localStorage.getItem('lw_tasks')
      if (data) {
        const entries = JSON.parse(data) as [string, Task][]
        this.tasks = new Map(entries)
        
        // 恢复进行中的任务轮询
        this.getActiveTasks().forEach(task => {
          // 恢复时标记为待处理，让用户决定重试
          if (task.status === 'processing') {
            this.updateTask(task.id, { 
              status: 'pending', 
              message: '等待恢复...',
              progress: 0
            })
          }
        })
      }
    } catch (e) {
      console.error('Failed to load tasks:', e)
    }
  }

  // 重试失败的任务
  async retryTask(taskId: string, apiEndpoint: string, body: any): Promise<boolean> {
    const task = this.tasks.get(taskId)
    if (!task) return false

    // 重置状态
    this.updateTask(taskId, {
      status: 'pending',
      progress: 0,
      message: '重新提交...',
      error: undefined,
      result: undefined,
    })

    try {
      const res = await fetch(apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, taskId }),
      })
      const data = await res.json()

      if (data.success) {
        this.updateTask(taskId, {
          status: 'processing',
          message: '处理中...',
        })
        return true
      } else {
        this.updateTask(taskId, {
          status: 'failed',
          error: data.error || '提交失败',
          message: '提交失败',
        })
        return false
      }
    } catch (e: any) {
      this.updateTask(taskId, {
        status: 'failed',
        error: e.message,
        message: '网络错误',
      })
      return false
    }
  }
}

// 单例导出
export const taskManager = new TaskManager()

// React Hook for task subscription
import { useState, useEffect } from 'react'

export function useTask(taskId: string | null) {
  const [task, setTask] = useState<Task | null>(null)

  useEffect(() => {
    if (!taskId) {
      setTask(null)
      return
    }

    // 立即获取当前状态
    const current = taskManager.getTask(taskId)
    if (current) setTask(current)

    // 订阅更新
    const unsubscribe = taskManager.subscribe(taskId, (updatedTask) => {
      setTask(updatedTask)
    })

    return unsubscribe
  }, [taskId])

  return task
}

export function useActiveTasks() {
  const [tasks, setTasks] = useState<Task[]>([])

  useEffect(() => {
    // 初始加载
    setTasks(taskManager.getActiveTasks())

    // 监听所有任务变化（简化实现：每秒检查一次）
    const interval = setInterval(() => {
      setTasks(taskManager.getActiveTasks())
    }, 1000)

    return () => clearInterval(interval)
  }, [])

  return tasks
}
