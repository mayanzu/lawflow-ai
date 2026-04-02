'use client'
import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'

export default function Home() {
  const router = useRouter()
  const [uploadPct, setUploadPct] = useState(-1)
  const [isDragActive, setIsDragActive] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

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
          if (data.file_data) localStorage.setItem('lw_file_data', data.file_data)
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

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragActive(true)
  }

  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragActive(false)
  }

  const uploading = uploadPct >= 0

  return (
    <div style={{ minHeight: '100vh', background: '#FFFFFF', fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif' }}>
      <div style={{ padding: '16px 48px', borderBottom: '1px solid #F5F5F7' }}>
        <span style={{ fontSize: '17px', fontWeight: 600, color: '#1D1D1F', letterSpacing: '-0.02em' }}>诉状助手</span>
      </div>

      <div style={{ maxWidth: '640px', margin: '0 auto', padding: '100px 24px 40px', textAlign: 'center' }}>
        <h1 style={{ fontSize: '56px', fontWeight: 700, lineHeight: 1.05, letterSpacing: '-0.045em', color: '#1D1D1F', margin: 0 }}>
          把判决书变成<br />专业上诉状
        </h1>
        <p style={{ fontSize: '21px', lineHeight: 1.5, color: '#6E6E73', fontWeight: 400, maxWidth: '480px', margin: '20px auto 0' }}>
          上传一审判决书，AI 自动识别案件要素，生成规范的民事上诉状。
        </p>
      </div>

      <div style={{ maxWidth: '480px', margin: '0 auto', padding: '0 24px 80px', textAlign: 'center' }}>
        <div
          onClick={() => fileInputRef.current?.click()}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          style={{
            border: uploading ? '2px solid #0071E3' : isDragActive ? '2px solid #0071E3' : '2px dashed #E8E8ED',
            borderRadius: '18px',
            padding: uploading ? '36px 32px' : '48px 32px',
            cursor: uploading ? 'default' : 'pointer',
            transition: 'all 0.25s',
            background: uploading ? '#FFFFFF' : isDragActive ? 'rgba(0,113,227,0.04)' : '#F5F5F7',
            position: 'relative',
          }}
        >
          <input ref={fileInputRef} type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={onFileChange} style={{ display: 'none' }} />

          {uploading ? (
            <>
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ fontSize: '17px', fontWeight: 600, color: '#1D1D1F', margin: '0 0 24px' }}>
                正在上传
              </motion.p>
              <div style={{ width: '100%', maxWidth: '260px', margin: '0 auto 12px', height: '4px', background: '#E8E8ED', borderRadius: '2px', overflow: 'hidden' }}>
                <motion.div style={{ height: '100%', background: '#0071E3', borderRadius: '2px' }}
                  animate={{ width: `${uploadPct}%` }} transition={{ duration: 0.15 }} />
              </div>
              <p style={{ fontSize: '14px', color: '#86868B', margin: 0 }}>{uploadPct}%</p>
            </>
          ) : (
            <>
              <p style={{ fontSize: '17px', fontWeight: 600, color: '#1D1D1F', margin: '0 0 8px' }}>
                {isDragActive ? '松开上传' : '点击或拖拽上传判决书'}
              </p>
              <p style={{ fontSize: '14px', color: '#86868B', margin: '0 0 24px' }}>
                支持 PDF、PNG、JPG，最大 50MB
              </p>
              <button
                onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click() }}
                style={{ background: '#0071E3', color: '#fff', border: 'none', borderRadius: '980px', padding: '14px 28px', fontSize: '17px', fontWeight: 500, cursor: 'pointer' }}>
                选择文件
              </button>
            </>
          )}
        </div>
      </div>

      <div style={{ maxWidth: '920px', margin: '0 auto', padding: '80px 24px 120px' }}>
        <p style={{ fontSize: '17px', fontWeight: 600, color: '#0071E3', textAlign: 'center', marginBottom: '4px' }}>处理流程</p>
        <p style={{ fontSize: '13px', color: '#86868B', textAlign: 'center', marginBottom: '48px' }}>四步完成，全程自动化</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '32px' }}>
          {[
            { step: '01', title: '智能 OCR', desc: 'PaddleOCR 高精度识别扫描件' },
            { step: '02', title: 'AI 法律分析', desc: '自动提取案号/案由/判决要点' },
            { step: '03', title: '生成上诉状', desc: '生成规范的民事上诉状' },
            { step: '04', title: '导出与编辑', desc: '支持编辑、复制、导出' },
          ].map((f, i) => (
            <div key={i} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '12px', color: '#0071E3', fontWeight: 600, marginBottom: '12px' }}>{f.step}</div>
              <div style={{ fontSize: '17px', fontWeight: 600, color: '#1D1D1F', marginBottom: '8px' }}>{f.title}</div>
              <div style={{ fontSize: '14px', color: '#6E6E73', lineHeight: 1.5 }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
