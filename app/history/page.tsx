'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface HistoryItem {
  id: string; fileName: string; uploadTime: string
  案号: string; 原告: string; 被告: string; 判决法院: string
}

export default function HistoryPage() {
  const router = useRouter()
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const raw = localStorage.getItem('lw_history')
    if (raw) { try { setHistory(JSON.parse(raw)) } catch {} }
    setLoading(false)
  }, [])

  function handleDelete(id: string) {
    if (!confirm('确定删除此记录？')) return
    const updated = history.filter(h => h.id !== id)
    setHistory(updated)
    localStorage.setItem('lw_history', JSON.stringify(updated))
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F8F9FA', fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif' }}>
      <div style={{ padding: '12px 16px', background: '#FFF', borderBottom: '1px solid #E8EAED', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button onClick={() => router.push('/')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', fontWeight: 600, color: '#1D1D1F', padding: '8px 0' }}>← 返回</button>
        <span style={{ fontSize: '15px', fontWeight: 600, color: '#1D1D1F' }}>历史记录</span>
        <div style={{ width: 50 }} />
      </div>

      <div style={{ padding: '20px 16px 80px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#1D1D1F', margin: '0 0 2px' }}>历史记录</h2>
            <p style={{ fontSize: '13px', color: '#86868B', margin: 0 }}>共 {history.length} 条</p>
          </div>
          <button onClick={() => { Object.keys(localStorage).filter(k => k.startsWith('lw_') || k === 'wf_started').forEach(k => localStorage.removeItem(k)); router.push('/') }} style={{ padding: '8px 16px', background: '#0071E3', color: '#FFF', border: 'none', borderRadius: 980, cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>+ 新任务</button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#86868B', fontSize: '14px' }}>加载中...</div>
        ) : history.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', background: '#FFF', borderRadius: 16 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}></div>
            <p style={{ fontSize: '15px', fontWeight: 600, color: '#1D1D1F', marginBottom: 6 }}>暂无历史记录</p>
            <p style={{ fontSize: '13px', color: '#86868B', marginBottom: 20 }}>处理完成的案件会自动保存在此处</p>
            <button onClick={() => router.push('/')} style={{ padding: '10px 20px', background: '#0071E3', color: '#FFF', border: 'none', borderRadius: 980, cursor: 'pointer', fontSize: '14px', fontWeight: 600 }}>开始第一个任务</button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {history.map(item => (
              <div key={item.id} style={{ background: '#FFF', borderRadius: 12, padding: '14px 16px', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
                <div style={{ marginBottom: 6 }}>
                  <span style={{ fontSize: '14px', fontWeight: 600, color: '#1D1D1F' }}>{item.案号 || item.fileName}</span>
                  {item.判决法院 && <span style={{ fontSize: '12px', color: '#86868B', marginLeft: 8 }}>{item.判决法院}</span>}
                </div>
                <div style={{ fontSize: '12px', color: '#86868B', marginBottom: 10 }}>{item.原告 || '—'} → {item.被告 || '—'}</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => { localStorage.setItem('lw_file_id', item.id); localStorage.setItem('lw_file_name', item.fileName); alert('已加载案件信息，请前往首页重新上传原文件以继续处理。') }} style={{ flex: 1, padding: '8px', background: '#F5F5F7', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: '13px', color: '#0071E3', fontWeight: 500, minHeight: 40 }}>查看详情</button>
                  <button onClick={() => handleDelete(item.id)} style={{ padding: '8px 12px', background: '#FFF', border: '1px solid #E8E8ED', borderRadius: 8, cursor: 'pointer', fontSize: '13px', color: '#86868B', minHeight: 40 }}>删除</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
