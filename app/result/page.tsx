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

  useEffect(() => {
    const saved = localStorage.getItem('lw_appeal_text')
    if (saved) { setAppealText(saved); setEditedText(saved) }
    else { const demo = generateDemo(); setAppealText(demo); setEditedText(demo) }
  }, [])

  function handleCopy() {
    navigator.clipboard.writeText(editedText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
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

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
      <nav style={{ padding: '20px 48px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button onClick={() => router.push('/')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '21px', fontWeight: 600, color: '#1D1D1F', letterSpacing: '-0.03em' }}>诉状助手</button>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button onClick={handleCopy} className="apple-btn-secondary" style={{ padding: '10px 20px', fontSize: '14px' }}>
            {copied ? '已复制' : '复制全文'}
          </button>
          <button onClick={handleExport} className="apple-btn-secondary" style={{ padding: '10px 20px', fontSize: '14px' }}>
            导出文件
          </button>
          <button onClick={() => {
            localStorage.clear()
            router.push('/')
          }} className="apple-btn-secondary" style={{ padding: '10px 20px', fontSize: '14px' }}>
            重新生成
          </button>
          <button onClick={() => {
            const blob = new Blob([editedText], { type: 'text/plain;charset=utf-8' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = '民事上诉状.txt'
            a.click()
            URL.revokeObjectURL(url)
          }} className="apple-btn" style={{ padding: '10px 20px', fontSize: '14px' }}>
            保存文书
          </button>
        </div>
      </nav>

      <div style={{ maxWidth: '860px', margin: '0 auto', padding: '48px 24px' }}>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <div style={{ textAlign: 'center', marginBottom: '48px' }}>
            <h1 style={{ fontSize: '32px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '12px', letterSpacing: '-0.03em' }}>民事上诉状生成完成</h1>
            <p style={{ fontSize: '15px', color: 'var(--text-secondary)' }}>可直接编辑文书内容，或导出为文件</p>
          </div>

          <div className="glass-card" style={{ padding: '40px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-primary)' }}>民事上诉状</h2>
              <button onClick={() => setIsEditing(!isEditing)}
                style={{ background: isEditing ? 'var(--accent)' : 'var(--bg-secondary)', color: isEditing ? '#FFFFFF' : 'var(--accent)', border: 'none', borderRadius: '980px', padding: '8px 20px', cursor: 'pointer', fontSize: '14px', fontWeight: 500, transition: 'all 0.2s' }}>
                {isEditing ? '完成编辑' : '编辑'}
              </button>
            </div>

            {isEditing ? (
              <textarea value={editedText} onChange={e => setEditedText(e.target.value)}
                style={{ width: '100%', minHeight: '600px', background: 'var(--bg-secondary)', border: 'none', borderRadius: '12px', padding: '24px', fontSize: '15px', lineHeight: 1.8, color: 'var(--text-primary)', resize: 'vertical', fontFamily: 'inherit', outline: 'none' }} />
            ) : (
              <div style={{ background: 'var(--bg-secondary)', borderRadius: '12px', padding: '28px', fontSize: '15px', lineHeight: 1.8, color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>
                {editedText}
              </div>
            )}

            <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>
                共 {editedText.length} 字
              </div>
              {editedText !== appealText && (
                <button onClick={() => setEditedText(appealText)} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: '13px' }}>
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

function generateDemo() {
  return '民  事  上  诉  状\n\n上诉人（原审原告）：张三，男，1985年3月15日出生，汉族，住北京市朝阳区建国路88号。\n\n被上诉人（原审被告）：北京某科技有限公司，住所地北京市海淀区中关村大街1号。\n\n上诉人因与被上诉人劳动合同纠纷一案，不服北京市朝阳区人民法院（2025）京0105民初12345号民事判决，现依法提起上诉。\n\n上诉请求：\n一、请求撤销一审判决第一项，改判被上诉人支付上诉人经济补偿金人民币180000元；\n二、请求维持一审判决第二项；\n三、本案诉讼费用由被上诉人承担。\n\n事实与理由：\n（此处为 AI 生成的上诉理由，包含对一审判决的法律分析、证据引用、判例对比等完整论述。）\n\n此致\n北京市第三中级人民法院\n\n上诉人：张三\n2025年X月X日'
}
