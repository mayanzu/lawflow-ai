'use client'
import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useRouter } from 'next/navigation'

export default function ResultPage() {
  const router = useRouter()
  const [appealText, setAppealText] = useState('')
  const [editedText, setEditedText] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const saved = localStorage.getItem('lw_appeal_text')
    if (saved) {
      setAppealText(saved)
      setEditedText(saved)
    }
    setLoading(false)
  }, [])

  function handleCopy() {
    navigator.clipboard.writeText(editedText).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  function handleExport() {
    const blob = new Blob([editedText], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = '民事上诉状.txt'
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleRegenerate() {
    if (!confirm('重新生成将清空当前内容，确定继续？')) return
    // 清理所有任务相关数据，包括 flow 页的防重复标记
    Object.keys(localStorage).filter(k => k.startsWith('lw_') || k === 'wf_started').forEach(k => localStorage.removeItem(k))
    router.push('/')
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#F8F9FA', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif' }}>
        <p style={{ color: '#86868B', fontSize: '15px' }}>加载中...</p>
      </div>
    )
  }

  if (!appealText) {
    return (
      <div style={{ minHeight: '100vh', background: '#F8F9FA', fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif' }}>
        <nav style={{ padding: '20px 48px', borderBottom: '1px solid #E8EAED', background: '#FFF' }}>
          <button onClick={() => router.push('/')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '21px', fontWeight: 600, color: '#1D1D1F' }}>
            诉状助手
          </button>
        </nav>
        <div style={{ maxWidth: '480px', margin: '100px auto', textAlign: 'center', padding: '0 24px' }}>
          <div style={{ fontSize: '48px', marginBottom: '24px' }}>📄</div>
          <h2 style={{ fontSize: '24px', fontWeight: 700, color: '#1D1D1F', marginBottom: '12px' }}>未找到诉状</h2>
          <p style={{ fontSize: '15px', color: '#6E6E73', marginBottom: '32px', lineHeight: 1.6 }}>
            没有找到生成的诉状内容，请重新上传判决书生成。
          </p>
          <button
            onClick={() => router.push('/')}
            style={{ background: '#0071E3', color: '#FFF', border: 'none', borderRadius: '980px', padding: '14px 28px', fontSize: '17px', fontWeight: 500, cursor: 'pointer' }}
          >
            重新生成
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F8F9FA', fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif' }}>
      <nav style={{ padding: '20px 48px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#FFF', borderBottom: '1px solid #E8EAED' }}>
        <button onClick={() => router.push('/')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '21px', fontWeight: 600, color: '#1D1D1F' }}>
          诉状助手
        </button>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button onClick={handleCopy} style={{ padding: '10px 20px', background: '#FFF', border: '1px solid #E8EAED', borderRadius: '980px', cursor: 'pointer', fontSize: '14px', fontWeight: 500, color: '#1D1D1F' }}>
            {copied ? '已复制' : '复制全文'}
          </button>
          <button onClick={handleExport} style={{ padding: '10px 20px', background: '#FFF', border: '1px solid #E8EAED', borderRadius: '980px', cursor: 'pointer', fontSize: '14px', fontWeight: 500, color: '#1D1D1F' }}>
            导出文件
          </button>
          <button onClick={handleRegenerate} style={{ padding: '10px 20px', background: '#FFF', border: '1px solid #E8EAED', borderRadius: '980px', cursor: 'pointer', fontSize: '14px', fontWeight: 500, color: '#86868B' }}>
            重新生成
          </button>
        </div>
      </nav>

      <div style={{ maxWidth: '860px', margin: '0 auto', padding: '48px 24px' }}>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <div style={{ textAlign: 'center', marginBottom: '40px' }}>
            <h1 style={{ fontSize: '28px', fontWeight: 700, color: '#1D1D1F', marginBottom: '8px', letterSpacing: '-0.02em' }}>
              民事上诉状生成完成
            </h1>
            <p style={{ fontSize: '14px', color: '#86868B' }}>
              可直接编辑内容，或导出为 .txt 文件
            </p>
          </div>

          <div style={{ background: '#FFF', borderRadius: '16px', padding: '36px 40px', boxShadow: '0 2px 16px rgba(0,0,0,0.06)' }}>
            {/* 工具栏 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', paddingBottom: '20px', borderBottom: '1px solid #F5F5F7' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#1D1D1F' }}>民事上诉状</h2>
              <button
                onClick={() => setIsEditing(!isEditing)}
                style={{
                  background: isEditing ? '#0071E3' : '#F5F5F7',
                  color: isEditing ? '#FFF' : '#1D1D1F',
                  border: 'none',
                  borderRadius: '980px',
                  padding: '8px 18px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 500,
                  transition: 'all 0.2s',
                }}
              >
                {isEditing ? '完成编辑' : '编辑'}
              </button>
            </div>

            {/* 内容区 */}
            {isEditing ? (
              <textarea
                value={editedText}
                onChange={e => setEditedText(e.target.value)}
                style={{
                  width: '100%',
                  minHeight: '520px',
                  background: '#F8F9FA',
                  border: 'none',
                  borderRadius: '12px',
                  padding: '24px',
                  fontSize: '15px',
                  lineHeight: 1.9,
                  color: '#1D1D1F',
                  resize: 'vertical',
                  fontFamily: 'inherit',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            ) : (
              <div
                style={{
                  background: '#F8F9FA',
                  borderRadius: '12px',
                  padding: '28px 32px',
                  fontSize: '15px',
                  lineHeight: 1.9,
                  color: '#1D1D1F',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {editedText}
              </div>
            )}

            {/* 底部信息栏 */}
            <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '13px', color: '#86868B' }}>
                {editedText.length} 字
              </div>
              {editedText !== appealText && (
                <button
                  onClick={() => setEditedText(appealText)}
                  style={{ background: 'none', border: 'none', color: '#0071E3', cursor: 'pointer', fontSize: '13px', fontWeight: 500 }}
                >
                  恢复原始内容
                </button>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
