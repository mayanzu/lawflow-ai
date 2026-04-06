'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { C, Nav, Card, Spinner, Btn, Icons } from '@/ui'

interface HistoryItem {
  id: string; fileName: string; uploadTime: string;
  案号: string; 案由: string; 原告: string; 被告: string;
  判决法院: string; 判决日期: string;
  analyzeInfo?: Record<string, string>; appealText?: string;
  generatedDocuments?: Record<string, { content: string; generatedAt: string; legalBasis?: string[] }>;
}

export default function HistoryPage() {
  const router = useRouter()
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [mobile, setMobile] = useState(false)

  useEffect(() => {
    const check = () => setMobile(window.innerWidth < 640)
    check(); window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  async function callApi(endpoint: string, body: any) {
    try {
      const res = await fetch('http://163.7.1.176:3457' + endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      })
      return res.json()
    } catch { return null }
  }

  async function loadHistory() {
    const docTypes = ['appeal','complaint','defense','representation','execution','preservation']
    const res = await callApi('/get-history', {})
    const backendHistory = (res?.success ? res.history : []) as HistoryItem[]

    // Merge legacy localStorage data with backend
    const localRaw = localStorage.getItem('lw_history')
    if (localRaw) {
      try {
        const localData = JSON.parse(localRaw || '[]')
        const mergedMap = new Map<string, HistoryItem>()
        // Backend first
        for (const h of backendHistory) mergedMap.set(h.id, h)
        // Local fallback
        for (const h of localData) {
          if (!mergedMap.has(h.id)) mergedMap.set(h.id, {
            ...h,
            generatedDocuments: h.appealText ? {
              appeal: { content: h.appealText, generatedAt: h.uploadTime || new Date().toISOString() }
            } : undefined,
          })
        }
        setHistory(Array.from(mergedMap.values()).sort((a, b) => (b.uploadTime || '').localeCompare(a.uploadTime || '')))
        return
      } catch {}
    }

    setHistory(backendHistory)
    setIsLoading(false)
  }

  useEffect(() => { loadHistory() }, [])

  function handleDelete(id: string) {
    setHistory(h => h.filter(x => x.id !== id))
    callApi('/delete-history', { file_id: id })
  }

  function handleClearAll() {
    setHistory([]); localStorage.removeItem('lw_history')
    callApi('/clear-history', {})
  }

  const DOC_TYPES = [
    { key: 'appeal', name: '上诉状' },
    { key: 'complaint', name: '起诉状' },
    { key: 'defense', name: '答辩状' },
    { key: 'representation', name: '代理词' },
    { key: 'execution', name: '执行申请' },
    { key: 'preservation', name: '保全申请' },
  ]

  function navigateToDoc(item: HistoryItem, docType: string) {
    localStorage.setItem('lw_file_id', item.id); localStorage.setItem('lw_file_name', item.fileName); localStorage.setItem('lw_doc_type', docType)
    if (item.analyzeInfo) localStorage.setItem('lw_analyze_info', JSON.stringify(item.analyzeInfo))
    const doc = item.generatedDocuments?.[docType]
    if (doc?.content) localStorage.setItem('lw_appeal_text', doc.content)
    else localStorage.removeItem('lw_appeal_text')
    localStorage.setItem('lw_ocr_text', ''); router.push('/result')
  }

  function formatDate(d: string): string {
    if (!d) return ''; const date = new Date(d); const diff = Math.floor((Date.now() - date.getTime()) / 86400000)
    if (diff === 0) return '今天'; if (diff === 1) return '昨天'; if (diff < 7) return `${diff}天前`; return date.toLocaleDateString('zh-CN')
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg }}>
      <Nav title="历史记录" left={
        <button onClick={() => router.push('/')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.blue, display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.9rem', fontWeight: 500 }}>
          {Icons.arrowLeft(16, C.blue)} 返回
        </button>
      } right={
        history.length > 0 ? <button onClick={handleClearAll} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, fontSize: '0.85rem', fontWeight: 500 }}>清空</button> : <div style={{ width: 48 }} />
      } />

      <main style={{ maxWidth: 800, margin: '0 auto', padding: `${mobile ? 16 : 32}px ${mobile ? 16 : 24}px 80px` }}>
        {isLoading ? (
          <Card padding={48} style={{ textAlign: 'center' }}>
            <Spinner size={36} />
            <p style={{ fontSize: '0.9rem', color: C.muted, marginTop: 16 }}>加载历史记录...</p>
          </Card>
        ) : history.length === 0 ? (
          <Card padding={64} style={{ textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
              {Icons.fileText(28, C.muted)}
            </div>
            <p style={{ fontSize: '1rem', fontWeight: 600, color: C.text, marginBottom: 6 }}>暂无历史记录</p>
            <p style={{ fontSize: '0.85rem', color: C.muted, marginBottom: 24 }}>处理完成的案件会自动保存在此处</p>
            <Btn variant="primary" onClick={() => router.push('/')}>开始第一个任务</Btn>
          </Card>
        ) : (
          <div>
            <p style={{ fontSize: '0.75rem', fontWeight: 600, color: C.muted, letterSpacing: '0.06em', marginBottom: 20, textTransform: 'uppercase' }}>
              共 {history.length} 条记录
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {history.map(item => (
                <Card key={item.id} padding={24} hover={false}>
                  <div onClick={() => setExpandedId(expandedId === item.id ? null : item.id)} style={{ cursor: 'pointer' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                      <div>
                        <span style={{ fontSize: '0.95rem', fontWeight: 600, color: C.text }}>{item.案号 || item.fileName}</span>
                        {item.案由 && <span style={{ fontSize: '0.8rem', color: C.muted, marginLeft: 8 }}>· {item.案由}</span>}
                      </div>
                      <span style={{ fontSize: '0.75rem', color: C.muted, flexShrink: 0 }}>{formatDate(item.uploadTime)}</span>
                    </div>
                    {(item.原告 || item.被告) && (
                      <div style={{ fontSize: '0.85rem', color: C.sub, marginBottom: 12 }}>
                        {item.原告 || '—'} → {item.被告 || '—'}
                        {item.判决法院 && <span style={{ color: C.muted, marginLeft: 8 }}>· {item.判决法院}</span>}
                      </div>
                    )}
                  </div>

                  {/* 文书类型标签 */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                    {DOC_TYPES.map(dt => {
                      const hasDoc = item.generatedDocuments?.[dt.key]
                      return (
                        <div key={dt.key} onClick={() => navigateToDoc(item, dt.key)} style={{
                          padding: '6px 14px', borderRadius: 980, fontSize: '0.8rem', fontWeight: 500,
                          background: hasDoc ? C.blue : '#F5F5F7', color: hasDoc ? '#FFF' : C.sub,
                          cursor: 'pointer', transition: 'all 0.2s',
                        }}>
                          {hasDoc ? `查看 ${dt.name}` : `生成 ${dt.name}`}
                        </div>
                      )
                    })}
                    <button onClick={() => handleDelete(item.id)} style={{ padding: '6px 12px', background: 'none', border: 'none', cursor: 'pointer', color: C.muted }}>
                      {Icons.trash(16, C.muted)}
                    </button>
                  </div>

                  {/* 展开详情 */}
                  {expandedId === item.id && (
                    <div style={{ marginTop: 20, padding: 20, background: C.bg, borderRadius: 14 }}>
                      <div style={{ fontSize: '0.7rem', fontWeight: 600, color: C.muted, letterSpacing: '0.06em', marginBottom: 14 }}>详细案件信息</div>
                      <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : '1fr 1fr', gap: 8 }}>
                        {Object.entries(item.analyzeInfo || {}).filter(([k]) => k !== 'undefined').map(([k, v]) => v ? (
                          <div key={k} style={{ fontSize: '0.8rem' }}>
                            <span style={{ color: C.muted, marginRight: 6 }}>{k}:</span>
                            <span style={{ color: C.text, fontWeight: 500 }}>{String(v)}</span>
                          </div>
                        ) : null)}
                      </div>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
