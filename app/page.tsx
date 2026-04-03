'use client'
import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'

export default function Home() {
  const router = useRouter()
  const [uploadPct, setUploadPct] = useState(-1)
  const [isDragActive, setIsDragActive] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const doUpload = (file: File) => {
    setErrorMsg('')
    // 清理旧数据
    Object.keys(localStorage).filter(k => k.startsWith('lw_') || k === 'wf_started').forEach(k => localStorage.removeItem(k))
    localStorage.setItem('lw_file_name', file.name)
    localStorage.setItem('lw_file_size', String(file.size))

    // 显示全屏上传进度
    setUploadPct(0)

    const formData = new FormData()
    formData.append('file', file)
    const xhr = new XMLHttpRequest()
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) setUploadPct(Math.round((e.loaded / e.total) * 100))
    }
    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText)
        if (data.success) {
          localStorage.setItem('lw_file_id', data.file_id)
          if (data.file_path) localStorage.setItem('lw_file_path', data.file_path)
          setUploadPct(100)
          // 上传完成后再跳转（无等待）
          setTimeout(() => router.push(`/flow?file=${encodeURIComponent(file.name)}&t=${Date.now()}`), 200)
        } else {
          setErrorMsg(data.error || '上传失败')
          setUploadPct(-1)
        }
      } catch { setErrorMsg('上传响应解析失败'); setUploadPct(-1) }
    }
    xhr.onerror = () => { setErrorMsg('网络错误，请检查连接后重试'); setUploadPct(-1) }
    xhr.open('POST', '/api/upload')
    xhr.send(formData)
  }

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) doUpload(files[0])
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragActive(false)
    const files = e.dataTransfer.files
    if (files.length > 0) doUpload(files[0])
  }

  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragActive(true) }
  const onDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDragActive(false) }
  const uploading = uploadPct >= 0

  // 上传中：全屏动画
  if (uploading) {
    return (
      <div style={{ minHeight: '100vh', background: '#FFFFFF', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit' }}>
        <div style={{ textAlign: 'center', padding: '0 24px', width: '100%', maxWidth: '400px' }}>
          <div style={{ width: 48, height: 48, borderRadius: '50%', border: '3px solid #F0F0F0', borderTopColor: '#0071E3', animation: 'spin 0.8s linear infinite', margin: '0 auto 24px' }} />
          <h2 style={{ fontSize: 'clamp(18px, 2.5vw, 22px)', fontWeight: 700, color: '#1D1D1F', marginBottom: '8px' }}>文件上传中</h2>
          <p style={{ fontSize: 'clamp(13px, 1.8vw, 15px)', color: '#86868B', marginBottom: '24px', minHeight: 20 }}>{uploadPct < 100 ? '上传完成后自动进入分析' : '正在跳转...'}</p>
          <div style={{ width: '100%', maxWidth: '280px', height: 4, background: '#F0F0F0', borderRadius: 2, overflow: 'hidden', margin: '0 auto' }}>
            <motion.div style={{ height: '100%', background: '#0071E3', borderRadius: 2 }} animate={{ width: `${uploadPct}%` }} transition={{ duration: 0.15 }} />
          </div>
          <p style={{ fontSize: 'clamp(18px, 3vw, 24px)', fontWeight: 700, color: '#0071E3', marginTop: '12px' }}>{uploadPct}%</p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#FFFFFF', fontFamily: 'inherit' }}>
      {/* 导航栏 */}
      <div style={{ padding: 'clamp(12px, 2vw, 16px) clamp(16px, 3vw, 32px)', borderBottom: '1px solid #F5F5F7', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 'clamp(16px, 2vw, 19px)', fontWeight: 600, color: '#1D1D1F' }}>诉状助手</span>
        <button onClick={() => router.push('/history')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 'clamp(13px, 1.8vw, 15px)', color: '#0071E3', fontWeight: 500, padding: '8px 4px' }}>历史记录</button>
      </div>

      {/* 标题区 */}
      <div style={{ padding: 'clamp(36px, 6vw, 64px) clamp(20px, 4vw, 32px) clamp(24px, 4vw, 40px)', textAlign: 'center', maxWidth: '640px', margin: '0 auto' }}>
        <h1 style={{ fontSize: 'clamp(24px, 4vw, 34px)', fontWeight: 700, lineHeight: 1.15, letterSpacing: '-0.03em', color: '#1D1D1F', margin: '0 0 12px' }}>
          把判决书变成<br />专业上诉状
        </h1>
        <p style={{ fontSize: 'clamp(14px, 2.2vw, 17px)', lineHeight: 1.5, color: '#6E6E73', margin: 0 }}>
          上传一审判决书，AI 自动识别，生成规范的民事上诉状。
        </p>
      </div>

      {/* 上传区 */}
      <div style={{ padding: '0 clamp(16px, 3vw, 32px) clamp(40px, 6vw, 64px)', maxWidth: 'clamp(400px, 80vw, 560px)', margin: '0 auto' }}>
        {/* 错误提示 */}
        <AnimatePresence>
          {errorMsg && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0, height: 'auto' }}
              exit={{ opacity: 0, height: 0, marginBottom: 0 }}
              style={{
                margin: '0 0 16px',
                padding: '12px 16px',
                borderRadius: 12,
                background: '#FEF0EF',
                border: '1px solid #F5C6C5',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                overflow: 'hidden'
              }}
            >
              <span style={{ fontSize: 14, color: '#D93025', fontWeight: 500 }}>{errorMsg}</span>
              <button onClick={() => setErrorMsg('')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#D93025', padding: '0 4px', lineHeight: 1 }}>×</button>
            </motion.div>
          )}
        </AnimatePresence>

        <div
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          style={{
            border: isDragActive ? '2px solid #0071E3' : '2px dashed #E0E0E0',
            borderRadius: '16px',
            padding: 'clamp(24px, 4vw, 40px) clamp(16px, 3vw, 24px)',
            transition: 'all 0.2s',
            background: isDragActive ? 'rgba(0,113,227,0.04)' : '#F8F9FA',
            textAlign: 'center',
          }}
        >
          <p style={{ fontSize: 'clamp(14px, 2vw, 16px)', fontWeight: 600, color: '#1D1D1F', margin: '0 0 6px' }}>
            {isDragActive ? '松开上传' : '点击或拖拽上诉书'}
          </p>
          <p style={{ fontSize: 'clamp(12px, 1.8vw, 14px)', color: '#86868B', margin: '0 0 clamp(16px, 2vw, 24px)' }}>支持 PDF、PNG、JPG，最大 50MB</p>
          <label htmlFor="file-upload" style={{ display: 'inline-block', background: '#0071E3', color: '#fff', border: 'none', borderRadius: '980px', padding: 'clamp(10px, 1.5vw, 14px) clamp(20px, 3vw, 28px)', fontSize: 'clamp(14px, 2vw, 16px)', fontWeight: 500, cursor: 'pointer' }}>
            选择文件
          </label>
          <input id="file-upload" type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={onFileChange} style={{ display: 'none' }} />
        </div>
      </div>

      {/* 流程说明 */}
      <div style={{ padding: '0 clamp(16px, 3vw, 32px) clamp(60px, 8vw, 96px)', maxWidth: 'clamp(400px, 90vw, 560px)', margin: '0 auto' }}>
        <p style={{ fontSize: 'clamp(12px, 1.8vw, 14px)', fontWeight: 600, color: '#0071E3', textAlign: 'center', marginBottom: '20px' }}>处理流程</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(160px, 100%), 1fr))', gap: 'clamp(12px, 2vw, 20px)' }}>
          {[
            { step: '01', title: '文件上传', desc: '支持扫描件' },
            { step: '02', title: 'AI 法律分析', desc: '提取案件要素' },
            { step: '03', title: '生成上诉状', desc: '规范的文书格式' },
            { step: '04', title: '导出与编辑', desc: '支持编辑导出' },
          ].map((f, i) => (
            <div key={i} style={{ background: '#F8F9FA', borderRadius: '12px', padding: 'clamp(12px, 2vw, 18px)' }}>
              <div style={{ fontSize: 'clamp(10px, 1.5vw, 12px)', fontWeight: 600, color: '#0071E3', marginBottom: '6px' }}>{f.step}</div>
              <div style={{ fontSize: 'clamp(13px, 2vw, 15px)', fontWeight: 600, color: '#1D1D1F', marginBottom: '4px' }}>{f.title}</div>
              <div style={{ fontSize: 'clamp(11px, 1.6vw, 13px)', color: '#86868B', lineHeight: 1.5 }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
