'use client'
import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'

export default function Home() {
  const router = useRouter()
  const [uploadPct, setUploadPct] = useState(-1)
  const [isDragActive, setIsDragActive] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [isTransitioning, setIsTransitioning] = useState(false)

  const doUpload = (file: File) => {
    setErrorMsg('')
    setIsTransitioning(true)
    Object.keys(localStorage).filter(k => k.startsWith('lw_') || k === 'wf_started').forEach(k => localStorage.removeItem(k))
    localStorage.setItem('lw_file_name', file.name)
    localStorage.setItem('lw_file_size', String(file.size))

    setUploadPct(0)
    const formData = new FormData()
    formData.append('file', file)
    const xhr = new XMLHttpRequest()
    xhr.open('POST', '/api/upload')
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) setUploadPct(Math.round((e.loaded / e.total) * 100)) }
    xhr.onload = () => {
      setUploadPct(100)
      try {
        const data = JSON.parse(xhr.responseText)
        if (data.success) {
          localStorage.setItem('lw_file_id', data.file_id)
          if (data.file_path) localStorage.setItem('lw_file_path', data.file_path)
          setTimeout(() => router.push(`/flow?file=${encodeURIComponent(file.name)}&t=${Date.now()}`), 500)
        } else {
          setErrorMsg(data.error || '上传失败')
          setUploadPct(-1)
        }
      } catch { setErrorMsg('上传响应解析失败'); setUploadPct(-1) }
    }
    xhr.onerror = () => { setErrorMsg('网络错误'); setUploadPct(-1) }
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

  if (isTransitioning) {
    return (
      <div style={{ minHeight: '100vh', background: '#FFFFFF', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif' }}>
        <motion.div
          style={{ width: 40, height: 40, borderRadius: '50%', border: '3px solid #F0F0F0', borderTopColor: '#0071E3' }}
          animate={{ rotate: 360 }}
          transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
        />
        <p style={{ fontSize: 15, fontWeight: 500, color: '#1D1D1F', marginTop: 20, marginBottom: 4 }}>{uploadPct < 100 ? '正在上传' : '跳转中...'}</p>
        {uploadPct > 0 && (
          <div style={{ width: 200, height: 3, background: '#F0F0F0', borderRadius: 2, overflow: 'hidden', marginTop: 12 }}>
            <motion.div style={{ height: '100%', background: '#0071E3', borderRadius: 2 }} animate={{ width: `${uploadPct}%` }} transition={{ duration: 0.15 }} />
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#FFFFFF', fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif' }}>
      {/* 导航栏 */}
      <nav style={{ backdropFilter: 'saturate(180%) blur(20px)', WebkitBackdropFilter: 'saturate(180%) blur(20px)', background: 'rgba(255,255,255,0.85)', borderBottom: '1px solid rgba(0,0,0,0.08)' }}>
        <div style={{ maxWidth: 980, margin: '0 auto', padding: '0 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: 52 }}>
          <span style={{ fontSize: 17, fontWeight: 600, color: '#1D1D1F', letterSpacing: '-0.02em' }}>诉状助手</span>
          <button onClick={() => router.push('/history')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#0071E3', fontWeight: 500, padding: '6px 12px', borderRadius: 980 }}>历史记录</button>
        </div>
      </nav>

      {/* 主区域 */}
      <main style={{ maxWidth: 980, margin: '0 auto', padding: '80px 24px 0' }}>
        <div style={{ textAlign: 'center', maxWidth: 640, margin: '0 auto' }}>
          <h1 style={{ fontSize: 'clamp(32px, 5vw, 56px)', fontWeight: 700, lineHeight: 1.08, letterSpacing: '-0.04em', color: '#1D1D1F', margin: '0 0 16px' }}>
            一键生成民事上诉状
          </h1>
          <p style={{ fontSize: 'clamp(16px, 2vw, 20px)', lineHeight: 1.5, color: '#6E6E73', margin: 0, fontWeight: 400 }}>
            上传一审判决书，AI 自动提取案件信息，生成规范的民事上诉状
          </p>
        </div>

        {/* 上传区域 */}
        <div style={{ maxWidth: 520, margin: '48px auto 0', padding: '0 16px' }}>
          <AnimatePresence>
            {errorMsg && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0, height: 'auto' }}
                exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                style={{ marginBottom: 12, padding: '12px 16px', borderRadius: 12, background: '#FEF0EF', border: '1px solid #F5C6C5', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}
              >
                <span style={{ fontSize: 13, color: '#D93025', fontWeight: 500, flex: 1 }}>{errorMsg}</span>
                <button onClick={() => setErrorMsg('')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#D93025', padding: '0 4px', lineHeight: 1 }}>x</button>
              </motion.div>
            )}
          </AnimatePresence>

          <div
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            style={{
              border: isDragActive ? '2px solid #0071E3' : '2px dashed #E0E0E0',
              borderRadius: 20,
              padding: uploading ? '40px 24px' : '56px 24px',
              transition: 'all 0.25s ease',
              background: uploading ? '#FFFFFF' : isDragActive ? 'rgba(0,113,227,0.03)' : '#F8F9FA',
              textAlign: 'center',
            }}
          >
            {uploading ? (
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: '#1D1D1F', marginBottom: 16 }}>正在上传</div>
                <div style={{ width: 240, height: 4, background: '#F0F0F0', borderRadius: 2, overflow: 'hidden', margin: '0 auto 12px' }}>
                  <motion.div style={{ height: '100%', background: '#0071E3', borderRadius: 2 }} animate={{ width: `${uploadPct}%` }} transition={{ duration: 0.15 }} />
                </div>
                <p style={{ fontSize: 24, fontWeight: 700, color: '#0071E3', margin: 0, letterSpacing: '-0.02em' }}>{uploadPct}%</p>
              </div>
            ) : (
              <div>
                <p style={{ fontSize: 15, fontWeight: 500, color: '#1D1D1F', margin: '0 0 6px' }}>{isDragActive ? '松开上传' : '拖拽文件到此处或点击上传'}</p>
                <p style={{ fontSize: 13, color: '#86868B', margin: '0 0 24px' }}>支持 PDF、PNG、JPG，最大 50MB</p>
                <label htmlFor="file-upload" style={{ display: 'inline-block', background: '#0071E3', color: '#FFF', border: 'none', borderRadius: 980, padding: '13px 28px', fontSize: 15, fontWeight: 500, cursor: 'pointer', letterSpacing: '-0.01em', transition: 'background 0.2s' }}>
                  选择文件
                </label>
                <input id="file-upload" type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={onFileChange} style={{ display: 'none' }} />
              </div>
            )}
          </div>
        </div>

        {/* 流程说明 */}
        <div style={{ maxWidth: 560, margin: '64px auto 0', padding: '0 16px 100px' }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: '#0071E3', textAlign: 'center', marginBottom: 28, letterSpacing: '0.06em', textTransform: 'uppercase' }}>处理流程</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            {[
              { step: '01', title: 'OCR 识别', desc: '高精度识别扫描件' },
              { step: '02', title: 'AI 分析', desc: '自动提取案件信息' },
              { step: '03', title: '生成诉状', desc: '输出规范化法律文书' },
            ].map((f) => (
              <div key={f.step} style={{ background: '#F5F5F7', borderRadius: 16, padding: '24px 20px', textAlign: 'center' }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: '#86868B', marginBottom: 8, letterSpacing: '0.08em' }}>{f.step}</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: '#1D1D1F', marginBottom: 6, letterSpacing: '-0.02em' }}>{f.title}</div>
                <div style={{ fontSize: 12, color: '#86868B', lineHeight: 1.5 }}>{f.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}
