// 优化的本地存储管理器
// 使用防抖批量写入，减少localStorage操作次数

import { STORAGE_CONFIG } from './config'

const KEY_PREFIX = STORAGE_CONFIG.storageKeyPrefix

// 防抖函数
function debounce<T extends (...args: any[]) => void>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout>
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId)
    timeoutId = setTimeout(() => fn(...args), delay)
  }
}

// 节流函数
function throttle<T extends (...args: any[]) => void>(
  fn: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      fn(...args)
      inThrottle = true
      setTimeout(() => (inThrottle = false), limit)
    }
  }
}

class StorageManager {
  private memoryCache: Map<string, any> = new Map()
  private pendingWrites: Set<string> = new Set()
  private batchWriteTimer: ReturnType<typeof setTimeout> | null = null
  private readonly BATCH_DELAY = 300 // 批量写入延迟（毫秒）
  private readonly MAX_BATCH_SIZE = 10 // 最大批量大小

  constructor() {
    // 初始化时从localStorage加载到内存缓存
    this.loadAllToCache()
    
    // 页面卸载前确保写入
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => {
        this.flushPendingWrites()
      })
    }
  }

  // 生成带前缀的key
  private key(key: string): string {
    return `${KEY_PREFIX}${key}`
  }

  // 从localStorage加载所有数据到内存缓存
  private loadAllToCache(): void {
    if (typeof window === 'undefined') return

    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key && key.startsWith(KEY_PREFIX)) {
          try {
            const value = localStorage.getItem(key)
            if (value) {
              this.memoryCache.set(key, JSON.parse(value))
            }
          } catch {
            // 解析失败，保持原始值
            const value = localStorage.getItem(key)
            if (value) {
              this.memoryCache.set(key, value)
            }
          }
        }
      }
    } catch (e) {
      console.error('Failed to load storage cache:', e)
    }
  }

  // 获取值（优先从内存缓存）
  get<T>(key: string, defaultValue?: T): T | undefined {
    const fullKey = this.key(key)
    
    // 优先从内存缓存读取
    if (this.memoryCache.has(fullKey)) {
      return this.memoryCache.get(fullKey) as T
    }

    // 回退到localStorage
    if (typeof window === 'undefined') return defaultValue

    try {
      const item = localStorage.getItem(fullKey)
      if (item === null) return defaultValue
      
      const parsed = JSON.parse(item)
      // 更新内存缓存
      this.memoryCache.set(fullKey, parsed)
      return parsed as T
    } catch {
      return defaultValue
    }
  }

  // 设置值（延迟批量写入）
  set<T>(key: string, value: T): void {
    const fullKey = this.key(key)
    
    // 更新内存缓存
    this.memoryCache.set(fullKey, value)
    
    // 标记为待写入
    this.pendingWrites.add(fullKey)
    
    // 调度批量写入
    this.scheduleBatchWrite()
  }

  // 立即设置值（不延迟）
  setImmediate<T>(key: string, value: T): void {
    const fullKey = this.key(key)
    this.memoryCache.set(fullKey, value)
    
    if (typeof window === 'undefined') return

    try {
      localStorage.setItem(fullKey, JSON.stringify(value))
    } catch (e) {
      console.error('Storage set error:', e)
      // 存储已满，尝试清理旧数据
      if (this.isQuotaExceeded(e)) {
        this.cleanupOldData()
        try {
          localStorage.setItem(fullKey, JSON.stringify(value))
        } catch (e2) {
          console.error('Storage set failed after cleanup:', e2)
        }
      }
    }
  }

  // 删除值
  remove(key: string): void {
    const fullKey = this.key(key)
    this.memoryCache.delete(fullKey)
    this.pendingWrites.delete(fullKey)
    
    if (typeof window === 'undefined') return

    try {
      localStorage.removeItem(fullKey)
    } catch (e) {
      console.error('Storage remove error:', e)
    }
  }

  // 批量设置值
  setBatch(items: Record<string, any>): void {
    Object.entries(items).forEach(([key, value]) => {
      const fullKey = this.key(key)
      this.memoryCache.set(fullKey, value)
      this.pendingWrites.add(fullKey)
    })
    
    this.scheduleBatchWrite()
  }

  // 调度批量写入
  private scheduleBatchWrite(): void {
    // 如果待写入数量超过阈值，立即执行
    if (this.pendingWrites.size >= this.MAX_BATCH_SIZE) {
      this.flushPendingWrites()
      return
    }

    // 否则延迟执行
    if (this.batchWriteTimer) {
      clearTimeout(this.batchWriteTimer)
    }
    
    this.batchWriteTimer = setTimeout(() => {
      this.flushPendingWrites()
    }, this.BATCH_DELAY)
  }

  // 执行批量写入
  private flushPendingWrites(): void {
    if (this.pendingWrites.size === 0) return
    if (typeof window === 'undefined') return

    const keysToWrite = Array.from(this.pendingWrites)
    this.pendingWrites.clear()

    try {
      keysToWrite.forEach(key => {
        const value = this.memoryCache.get(key)
        if (value !== undefined) {
          localStorage.setItem(key, JSON.stringify(value))
        }
      })
    } catch (e) {
      console.error('Batch write error:', e)
      // 存储已满
      if (this.isQuotaExceeded(e)) {
        this.cleanupOldData()
        // 重试
        try {
          keysToWrite.forEach(key => {
            const value = this.memoryCache.get(key)
            if (value !== undefined) {
              localStorage.setItem(key, JSON.stringify(value))
            }
          })
        } catch (e2) {
          console.error('Batch write failed after cleanup:', e2)
        }
      }
    }

    if (this.batchWriteTimer) {
      clearTimeout(this.batchWriteTimer)
      this.batchWriteTimer = null
    }
  }

  // 检查是否超出存储配额
  private isQuotaExceeded(error: any): boolean {
    return (
      error instanceof DOMException &&
      (error.name === 'QuotaExceededError' ||
        error.name === 'NS_ERROR_DOM_QUOTA_REACHED')
    )
  }

  // 清理旧数据
  private cleanupOldData(): void {
    if (typeof window === 'undefined') return

    try {
      // 获取所有带前缀的key
      const keys: { key: string; timestamp: number }[] = []
      
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key && key.startsWith(KEY_PREFIX)) {
          try {
            const item = localStorage.getItem(key)
            if (item) {
              const parsed = JSON.parse(item)
              // 假设数据有timestamp字段，或者使用key的排序
              keys.push({
                key,
                timestamp: parsed?.timestamp || parsed?.updatedAt || 0,
              })
            }
          } catch {
            // 无法解析的数据，赋予最低优先级
            keys.push({ key, timestamp: 0 })
          }
        }
      }

      // 按时间戳排序，删除最旧的20%
      keys.sort((a, b) => a.timestamp - b.timestamp)
      const toDelete = Math.ceil(keys.length * 0.2)
      
      for (let i = 0; i < toDelete && i < keys.length; i++) {
        localStorage.removeItem(keys[i].key)
        this.memoryCache.delete(keys[i].key)
      }

      console.log(`Cleaned up ${toDelete} old storage items`)
    } catch (e) {
      console.error('Cleanup error:', e)
    }
  }

  // 清空所有应用数据
  clear(): void {
    if (typeof window === 'undefined') return

    try {
      const keysToRemove: string[] = []
      
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key && key.startsWith(KEY_PREFIX)) {
          keysToRemove.push(key)
        }
      }
      
      keysToRemove.forEach(key => {
        localStorage.removeItem(key)
        this.memoryCache.delete(key)
      })
      
      this.pendingWrites.clear()
    } catch (e) {
      console.error('Clear error:', e)
    }
  }

  // 获取存储使用情况
  getUsage(): { used: number; total: number; percentage: number } {
    if (typeof window === 'undefined') {
      return { used: 0, total: 0, percentage: 0 }
    }

    try {
      let used = 0
      
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key && key.startsWith(KEY_PREFIX)) {
          const value = localStorage.getItem(key) || ''
          used += key.length + value.length
        }
      }
      
      // localStorage通常限制为5-10MB
      const total = 5 * 1024 * 1024 // 5MB估算
      
      return {
        used,
        total,
        percentage: Math.round((used / total) * 100),
      }
    } catch (e) {
      return { used: 0, total: 0, percentage: 0 }
    }
  }

  // 创建命名空间存储
  namespace(ns: string): NamespacedStorage {
    return new NamespacedStorage(this, ns)
  }
}

// 命名空间存储（用于模块化）
class NamespacedStorage {
  constructor(
    private manager: StorageManager,
    private namespace: string
  ) {}

  private key(key: string): string {
    return `${this.namespace}:${key}`
  }

  get<T>(key: string, defaultValue?: T): T | undefined {
    return this.manager.get<T>(this.key(key), defaultValue)
  }

  set<T>(key: string, value: T): void {
    this.manager.set(this.key(key), value)
  }

  setImmediate<T>(key: string, value: T): void {
    this.manager.setImmediate(this.key(key), value)
  }

  remove(key: string): void {
    this.manager.remove(this.key(key))
  }
}

// 单例导出
export const storage = new StorageManager()

// 便捷导出
export const getItem = <T,>(key: string, defaultValue?: T): T | undefined =>
  storage.get<T>(key, defaultValue)

export const setItem = <T,>(key: string, value: T): void =>
  storage.set(key, value)

export const removeItem = (key: string): void =>
  storage.remove(key)

export const clearStorage = (): void =>
  storage.clear()

// React Hook
import { useState, useEffect, useCallback } from 'react'

export function useStorage<T>(
  key: string,
  defaultValue: T
): [T, (value: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    return storage.get<T>(key) ?? defaultValue
  })

  useEffect(() => {
    // 监听存储变化（支持多标签页同步）
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === `${KEY_PREFIX}${key}`) {
        try {
          const newValue = e.newValue ? JSON.parse(e.newValue) : defaultValue
          setValue(newValue)
        } catch {
          setValue(e.newValue as unknown as T)
        }
      }
    }

    window.addEventListener('storage', handleStorageChange)
    return () => window.removeEventListener('storage', handleStorageChange)
  }, [key, defaultValue])

  const setStoredValue = useCallback(
    (newValue: T | ((prev: T) => T)) => {
      setValue(prev => {
        const valueToStore = newValue instanceof Function ? newValue(prev) : newValue
        storage.set(key, valueToStore)
        return valueToStore
      })
    },
    [key]
  )

  return [value, setStoredValue]
}
