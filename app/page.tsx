'use client'
import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'

export default function Home() {
  const router = useRouter()
  const [uploadPct, setUploadPct] = useState(-1)
  const [isDragActive, setIsDragActive] = useState(false)
  
  const doUpload = (file: File) => {
    Object.keys(localStorage).filter(k => k.startsWith('lw_') || k === 'wf_started').forEach(k => localStorage.removeItem(k))
    localStorage.setItem('lw_file_name', file.name)
    localStorage.setItem('lw_file_size', String(file.size))
    localStorage.setItem('lw_file_type', file.type)
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
        }
      } catch {}
      router.push(`/flow?file=${encodeURIComponent(file.name)}&t=${Date.now()}`)
    }
    xhr.onerror = () => setUploadPct(-1)
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

  return (
    <div style={{ minHeight: '100vh', background: '#FFFFFF', fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif' }}>
      {/* 导航栏 */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #F5F5F7', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '17px', fontWeight: 600, color: '#1D1D1F' }}>诉状助手</span>
        <button onClick={() => router.push('/history')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', color: '#0071E3', fontWeight: 500, padding: '8px 4px' }}>历史记录</button>
      </div>

      {/* 标题区 */}
      <div style={{ padding: '48px 24px 32px', textAlign: 'center' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 700, lineHeight: 1.15, letterSpacing: '-0.03em', color: '#1D1D1F', margin: '0 0 12px' }}>
          把判决书变成<br />专业上诉状
        </h1>
        <p style={{ fontSize: '16px', lineHeight: 1.5, color: '#6E6E73', margin: 0 }}>
          上传一审判决书，AI 自动识别，生成规范的民事上诉状。
        </p>
      </div>

      {/* 上传区 */}
      <div style={{ padding: '0 16px 48px', maxWidth: '480px', margin: '0 auto' }}>
        <div
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          style={{
            border: uploading ? '2px solid #0071E3' : isDragActive ? '2px solid #0071E3' : '2px dashed #E0E0E0',
            borderRadius: '16px',
            padding: uploading ? '28px 20px' : '36px 20px',
            transition: 'all 0.2s',
            background: uploading ? '#FFFFFF' : isDragActive ? 'rgba(0,113,227,0.04)' : '#F8F9FA',
            textAlign: 'center',
          }}
        >
          {uploading ? (
            <>
              <p style={{ fontSize: '15px', fontWeight: 600, color: '#1D1D1F', margin: '0 0 16px' }}>正在上传</p>
              <div style={{ width: '100%', height: '4px', background: '#E8E8ED', borderRadius: '2px', overflow: 'hidden' }}>
                <motion.div style={{ height: '100%', background: '#0071E3', borderRadius: '2px' }} animate={{ width: `${uploadPct}%` }} transition={{ duration: 0.15 }} />
              </div>
              <p style={{ fontSize: '13px', color: '#86868B', margin: '8px 0 0' }}>{uploadPct}%</p>
            </>
          ) : (
            <>
              <p style={{ fontSize: '15px', fontWeight: 600, color: '#1D1D1F', margin: '0 0 6px' }}>
                {isDragActive ? '松开上传' : '点击或拖拽上传判决书'}
              </p>
              <p style={{ fontSize: '13px', color: '#86868B', margin: '0 0 20px' }}>支持 PDF、PNG、JPG，最大 50MB</p>
              <label htmlFor="file-upload" style={{ display: 'inline-block', background: '#0071E3', color: '#fff', border: 'none', borderRadius: '980px', padding: '12px 24px', fontSize: '15px', fontWeight: 500, cursor: 'pointer' }}>
                选择文件
              </label>
              <input id="file-upload" type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={onFileChange} style={{ display: 'none' }} />
            </>
          )}
        </div>
      </div>

      {/* 流程说明 */}
      <div style={{ padding: '0 16px 80px' }}>
        <p style={{ fontSize: '13px', fontWeight: 600, color: '#0071E3', textAlign: 'center', marginBottom: '24px' }}>处理流程</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px', maxWidth: '480px', margin: '0 auto' }}>
          {[
            { step: '01', title: '智能 OCR', desc: '高精度识别扫描件' },
            { step: '02', title: 'AI 法律分析', desc: '提取案件要素' },
            { step: '03', title: '生成上诉状', desc: '规范的文书格式' },
            { step: '04', title: '导出与编辑', desc: '支持编辑导出' },
          ].map((f, i) => (
            <div key={i} style={{ background: '#F8F9FA', borderRadius: '12px', padding: '16px' }}>
              <div style={{ fontSize: '11px', fontWeight: 600, color: '#0071E3', marginBottom: '6px' }}>{f.step}</div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#1D1D1F', marginBottom: '4px' }}>{f.title}</div>
              <div style={{ fontSize: '12px', color: '#86868B', lineHeight: 1.5 }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
