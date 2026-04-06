'use client'
import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { storage } from '@/lib/storage'
import { Errors, toAppError, getErrorDisplayInfo } from '@/lib/error'
import { UPLOAD_CONFIG } from '@/lib/config'

const ICON_COLORS: Record<string, string> = {
  appeal: '#0071E3', complaint: '#34C759', defense: '#FF9500',
  representation: '#AF52DE', execution: '#5AC8FA', preservation: '#FF3B30',
}

/**
 * 首页组件 - 文件上传入口
 * 
 * 功能：
 * - 支持拖拽和点击上传PDF/图片文件
 * - 文件类型和大小验证
 * - 上传成功后跳转到处理流程页
 * 
 * @returns React组件
 */
export default function HomePage() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragActive, setIsDragActive] = useState(false)
  const [mobile, setMobile] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<{ title: string; message: string } | null>(null)

  // 监听窗口大小变化，适配移动端
  useEffect(() => {
    const check = () => setMobile(window.innerWidth < 640)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  /**
   * 验证文件是否合法
   * @param file - 待验证的文件
   * @returns 验证结果，合法返回null，否则返回错误信息
   */
  const validateFile = (file: File): { valid: boolean; error?: string } => {
    const ext = '.' + file.name.split('.').pop()?.toLowerCase()
    
    // 检查文件类型
    if (!UPLOAD_CONFIG.allowedTypes.includes(ext)) {
      return {
        valid: false,
        error: `不支持的文件类型，请上传${UPLOAD_CONFIG.allowedTypes.join('、')}格式`
      }
    }
    
    // 检查文件大小
    if (file.size > UPLOAD_CONFIG.maxFileSize * 1024 * 1024) {
      return {
        valid: false,
        error: `文件过大，请上传不超过${UPLOAD_CONFIG.maxFileSize}MB的文件`
      }
    }
    
    return { valid: true }
  }

  /**
   * 处理文件上传
   * @param file - 用户选择的文件
   */
  const handleFile = async (file: File) => {
    // 重置状态
    setError(null)
    
    // 验证文件
    const validation = validateFile(file)
    if (!validation.valid) {
      setError({ title: '文件错误', message: validation.error! })
      return
    }

    setIsUploading(true)
    
    try {
      // 清空之前的存储数据
      storage.clear()
      
      // 保存文件信息到存储
      storage.set('file_name', file.name)
      storage.set('workflow_started', Date.now())
      
      // 创建表单数据并上传
      const formData = new FormData()
      formData.append('file', file)
      
      const res = await fetch('/api/upload', { 
        method: 'POST', 
        body: formData 
      })
      
      if (!res.ok) {
        throw new Error(`上传失败: ${res.status}`)
      }
      
      const data = await res.json()
      
      if (data.success) {
        // 保存文件ID
        storage.set('file_id', data.file_id)
        
        // 短暂延迟确保状态保存
        await new Promise<void>(resolve => setTimeout(resolve, 300))
        
        // 跳转到处理流程页
        router.push(`/flow?file=${encodeURIComponent(file.name)}&t=${Date.now()}`)
      } else {
        throw new Error(data.error || '上传失败')
      }
    } catch (err) {
      console.error('Upload error:', err)
      const appError = toAppError(err)
      const displayInfo = getErrorDisplayInfo(appError)
      setError({ title: displayInfo.title, message: displayInfo.message })
    } finally {
      setIsUploading(false)
    }
  }

  const pad = mobile ? 16 : 24

  const UPLOAD_ICON = (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#0071E3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
    </svg>)
  const OCR_ICON = (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0071E3" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      <line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>
    </svg>)
  const AI_ICON = (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0071E3" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a4 4 0 0 1 4 4c0 1.1-.9 2-2 2h-4a2 2 0 0 1-2-2 4 4 0 0 1 4-4z"/>
      <path d="M12 8v4"/><circle cx="8" cy="16" r="1"/><circle cx="12" cy="16" r="1"/><circle cx="16" cy="16" r="1"/>
      <path d="M6 17h12"/><path d="M7 22h10"/>
    </svg>)
  const GRID_ICON = (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0071E3" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/>
      <rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>
    </svg>)
  const ZAP_ICON = (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0071E3" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
    </svg>)

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg, #FFFFFF 0%, #F5F5F7 50%, #FFFFFF 100%)' }}>
      {/* Nav */}
      <nav style={{ position: 'sticky', top: 0, zIndex: 100, backdropFilter: 'saturate(180%) blur(20px)', WebkitBackdropFilter: 'saturate(180%) blur(20px)', background: 'rgba(255,255,255,0.72)', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: `0 ${pad}px`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: 56 }}>
          <span style={{ fontSize: '1.2rem', fontWeight: 700, color: '#1D1D1F', letterSpacing: '-0.03em' }}>诉状助手</span>
          <button onClick={() => router.push('/history')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.9rem', color: '#0071E3', fontWeight: 500, padding: '8px 16px', borderRadius: 980 }}>历史记录</button>
        </div>
      </nav>

      <main style={{ maxWidth: 1200, margin: '0 auto', padding: `${mobile ? 32 : 64}px ${pad}px 80px` }}>
        {/* Hero */}
        <div style={{ textAlign: 'center', maxWidth: 720, margin: '0 auto 40px' }}>
          <div style={{ display: 'inline-block', background: '#F0F4FF', color: '#0071E3', fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.08em', padding: '5px 14px', borderRadius: 980, marginBottom: 16 }}>v2.0 · 多文书支持</div>
          <h1 style={{ fontSize: mobile ? '2rem' : 'clamp(2.2rem, 5vw, 3.8rem)', fontWeight: 800, lineHeight: 1.08, letterSpacing: '-0.04em', color: '#1D1D1F', margin: '0 0 16px' }}>一键生成诉讼文书</h1>
          <p style={{ fontSize: mobile ? '0.95rem' : 'clamp(1.1rem, 2vw, 1.4rem)', lineHeight: 1.6, color: '#6E6E73', margin: 0 }}>上传一审判决书，AI 自动提取案件信息<br />6 种诉讼文书一键生成</p>
        </div>

        {/* 错误提示 */}
        {error && (
          <div style={{
            maxWidth: 960,
            margin: '0 auto 24px',
            padding: '16px 20px',
            background: '#FCE8E6',
            borderRadius: 12,
            border: '1px solid #F5C6CB',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 12,
          }}>
            <span style={{ color: '#D93025', fontSize: 18, fontWeight: 700 }}>!</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#D93025', marginBottom: 4 }}>
                {error.title}
              </div>
              <div style={{ fontSize: '0.85rem', color: '#5F6368' }}>
                {error.message}
              </div>
            </div>
            <button 
              onClick={() => setError(null)}
              style={{
                background: 'none',
                border: 'none',
                color: '#5F6368',
                cursor: 'pointer',
                fontSize: '1.2rem',
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>
        )}

        {/* 上传 + 流程 */}
        <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : '1fr 400px', gap: mobile ? 16 : 32, maxWidth: 960, margin: '0 auto' }}>
          {/* 上传卡片 */}
          <div 
            onDragOver={e => { 
              e.preventDefault(); 
              if (!isUploading) setIsDragActive(true) 
            }}
            onDragLeave={() => setIsDragActive(false)}
            onDrop={async e => { 
              e.preventDefault(); 
              setIsDragActive(false); 
              if (!isUploading && e.dataTransfer.files?.[0]) {
                await handleFile(e.dataTransfer.files[0])
              }
            }}
            onClick={() => !isUploading && fileInputRef.current?.click()}
            style={{
              background: '#FFFFFF', 
              borderRadius: mobile ? 18 : 22,
              padding: mobile ? '36px 24px' : '48px 32px', 
              textAlign: 'center',
              border: isDragActive ? '2px solid #0071E3' : '1px solid rgba(0,0,0,0.06)',
              boxShadow: '0 4px 24px rgba(0,0,0,0.06)', 
              cursor: isUploading ? 'not-allowed' : 'pointer',
              transition: 'all 0.25s ease',
              opacity: isUploading ? 0.7 : 1,
            }}
          >
            <div style={{ 
              width: 60, 
              height: 60, 
              borderRadius: '50%', 
              background: isUploading ? '#E8E8ED' : '#F0F4FF', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              margin: '0 auto 20px' 
            }}>
              {isUploading ? (
                <div style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  border: '3px solid #E8E8ED',
                  borderTopColor: '#0071E3',
                  animation: 'spin 1s linear infinite',
                }} />
              ) : UPLOAD_ICON}
            </div>
            <p style={{ fontSize: '1.05rem', fontWeight: 600, color: '#1D1D1F', marginBottom: 6 }}>
              {isUploading ? '上传中...' : isDragActive ? '松开上传' : '拖拽文件到此处'}
            </p>
            <p style={{ fontSize: '0.85rem', color: '#86868B', margin: '0 0 20px' }}>
              支持 PDF、PNG、JPG，最大 {UPLOAD_CONFIG.maxFileSize}MB
            </p>
            <div style={{ 
              display: 'inline-block', 
              background: isUploading ? '#86868B' : '#0071E3', 
              color: '#FFF', 
              borderRadius: 980, 
              padding: '12px 28px', 
              fontSize: '0.95rem', 
              fontWeight: 600, 
              boxShadow: isUploading ? 'none' : '0 2px 12px rgba(0,113,227,0.3)'
            }}>
              {isUploading ? '请稍候...' : '选择文件'}
            </div>
            <input 
              ref={fileInputRef} 
              type="file" 
              accept={UPLOAD_CONFIG.allowedTypes.join(',')}
              style={{ display: 'none' }} 
              disabled={isUploading}
              onChange={async e => { 
                const f = e.target.files?.[0]; 
                if (f) await handleFile(f) 
              }} 
            />
            <style>{`
              @keyframes spin {
                to { transform: rotate(360deg); }
              }
            `}</style>
          </div>

          {/* 功能流程 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: mobile ? 10 : 14 }}>
            {[
              { n: '01', t: 'OCR 识别', d: '高精度识别扫描件', i: OCR_ICON },
              { n: '02', t: 'AI 分析', d: '自动提取案件信息', i: AI_ICON },
              { n: '03', t: '选择文书', d: '6种文书任意选择', i: GRID_ICON },
              { n: '04', t: '生成文书', d: '专业法律文书即刻生成', i: ZAP_ICON },
            ].map(f => (
              <div key={f.n} style={{ background: '#FFFFFF', borderRadius: 16, padding: mobile ? '14px 16px' : 18, border: '1px solid rgba(0,0,0,0.04)', boxShadow: '0 2px 12px rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', gap: 14, transition: 'all 0.2s' }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, background: '#F5F5F7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{f.i}</div>
                <div>
                  <div style={{ fontSize: mobile ? '0.9rem' : '1rem', fontWeight: 600, color: '#1D1D1F', letterSpacing: '-0.02em' }}>{f.t}</div>
                  <div style={{ fontSize: '0.75rem', color: '#86868B', marginTop: 2 }}>{f.d}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 文书类型 */}
        <div style={{ marginTop: mobile ? 40 : 56, maxWidth: 960, marginLeft: 'auto', marginRight: 'auto' }}>
          <p style={{ fontSize: '0.75rem', fontWeight: 600, color: '#86868B', textAlign: 'center', marginBottom: 16, letterSpacing: '0.08em' }}>支持的文书类型</p>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${mobile ? 2 : 6}, 1fr)`, gap: mobile ? 10 : 12 }}>
            {[
              { name: '民事上诉状', c: '#E8F0FE', k: 'appeal' },
              { name: '民事起诉状', c: '#F0F9EE', k: 'complaint' },
              { name: '民事答辩状', c: '#FFF3E0', k: 'defense' },
              { name: '代理词', c: '#F3E5F5', k: 'representation' },
              { name: '执行申请书', c: '#E0F7FA', k: 'execution' },
              { name: '保全申请书', c: '#FFEBEE', k: 'preservation' },
            ].map((doc, idx) => {
              const icons: Record<string, JSX.Element> = {
                appeal: <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={ICON_COLORS.appeal} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
                complaint: <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={ICON_COLORS.complaint} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="15" x2="15" y2="15"/></svg>,
                defense: <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={ICON_COLORS.defense} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
                representation: <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={ICON_COLORS.representation} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>,
                execution: <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={ICON_COLORS.execution} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
                preservation: <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={ICON_COLORS.preservation} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>,
              }
              return (
                <div key={doc.name} style={{ textAlign: 'center', padding: mobile ? '14px 8px' : '16px 8px', borderRadius: 14, background: doc.c }}>
                  <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'center' }}>{icons[doc.k]}</div>
                  <div style={{ fontSize: mobile ? '0.72rem' : '0.8rem', fontWeight: 600, color: '#1D1D1F', letterSpacing: '-0.01em' }}>{doc.name}</div>
                </div>
              )
            })}
          </div>
        </div>
      </main>
    </div>
  )
}
