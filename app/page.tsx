'use client'
import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'

// SVG icon colors (Apple Design - no emojis)
const iconColors: Record<string, string> = {
  appeal: '#0071E3', complaint: '#34C759', defense: '#FF9500',
  representation: '#AF52DE', execution: '#5AC8FA', preservation: '#FF3B30',
}

export default function HomePage() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragActive, setIsDragActive] = useState(false)
  const [showFileTip, setShowFileTip] = useState(false)
  const uploadPct = useRef(0)

  const handleFile = async (file: File) => {
    const allowed = ['.pdf', '.png', '.jpg', '.jpeg']
    const ext = '.' + file.name.split('.').pop()?.toLowerCase()
    if (!allowed.includes(ext)) return
    if (file.size > 50 * 1024 * 1024) return

    localStorage.clear()
    localStorage.setItem('lw_file_name', file.name)
    localStorage.setItem('wf_started', Date.now().toString())

    const fd = new FormData()
    fd.append('file', file)
    try {
      uploadPct.current = 10
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: fd,
      })
      uploadPct.current = 100
      const data = await res.json()
      if (data.success) {
        localStorage.setItem('lw_file_id', data.file_id)
        await sleep(300)
        router.push(`/flow?file=${encodeURIComponent(file.name)}&t=${Date.now()}`)
      }
    } catch {}
  }

  function sleep(ms: number) { return new Promise<void>(r => setTimeout(r, ms)) }

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg, #FFFFFF 0%, #F5F5F7 50%, #FFFFFF 100%)' }}>
      {/* 导航栏 */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 100,
        backdropFilter: 'saturate(180%) blur(20px)', WebkitBackdropFilter: 'saturate(180%) blur(20px)',
        background: 'rgba(255,255,255,0.72)', borderBottom: '1px solid rgba(0,0,0,0.06)'
      }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: 56 }}>
          <span style={{ fontSize: '1.2rem', fontWeight: 700, color: '#1D1D1F', letterSpacing: '-0.03em' }}>诉状助手</span>
          <button onClick={() => router.push('/history')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.9rem', color: '#0071E3', fontWeight: 500, padding: '8px 16px', borderRadius: 980, transition: 'background 0.2s' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,113,227,0.08)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
            历史记录
          </button>
        </div>
      </nav>

      {/* 主内容区 */}
      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '64px 24px 80px' }}>
        {/* Hero */}
        <div style={{ textAlign: 'center', maxWidth: 720, margin: '0 auto 56px' }} className="fade-in">
          <div style={{ display: 'inline-block', background: '#F0F4FF', color: '#0071E3', fontSize: '0.8rem', fontWeight: 600, letterSpacing: '0.08em', padding: '6px 16px', borderRadius: 980, marginBottom: 20 }}>v2.0 · 多文书支持</div>
          <h1 style={{ fontSize: 'clamp(2.2rem, 5vw, 3.8rem)', fontWeight: 800, lineHeight: 1.08, letterSpacing: '-0.04em', color: '#1D1D1F', margin: '0 0 20px' }}>
            一键生成诉讼文书
          </h1>
          <p style={{ fontSize: 'clamp(1.1rem, 2vw, 1.4rem)', lineHeight: 1.6, color: '#6E6E73', margin: 0, fontWeight: 400 }}>
            上传一审判决书，AI 自动提取案件信息<br className="sm-hidden" />6 种诉讼文书一键生成
          </p>
        </div>

        {/* 上传区域 + 流程 并排 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 400px', gap: 32, maxWidth: 960, margin: '0 auto' }}>
          {/* 上传卡片 */}
          <div
            className="glass-card fade-in"
            style={{
              background: '#FFFFFF',
              borderRadius: 22,
              padding: '48px 32px',
              textAlign: 'center',
              border: isDragActive ? '2px solid #0071E3' : '1px solid rgba(0,0,0,0.06)',
              boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
              transition: 'all 0.25s ease',
              cursor: 'pointer',
            }}
            onDragOver={e => { e.preventDefault(); setIsDragActive(true) }}
            onDragLeave={() => setIsDragActive(false)}
            onDrop={async e => { e.preventDefault(); setIsDragActive(false); if (e.dataTransfer.files?.[0]) await handleFile(e.dataTransfer.files[0]) }}
            onClick={() => fileInputRef.current?.click()}
            onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 8px 40px rgba(0,113,227,0.12)'; e.currentTarget.style.borderColor = '#0071E3' }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 4px 24px rgba(0,0,0,0.06)'; e.currentTarget.style.borderColor = isDragActive ? '#0071E3' : 'rgba(0,0,0,0.06)' }}
          >
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#F0F4FF', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', transition: 'transform 0.2s' }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#0071E3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
            </div>
            <p style={{ fontSize: '1.1rem', fontWeight: 600, color: '#1D1D1F', marginBottom: 8 }}>
              {isDragActive ? '松开上传' : '拖拽文件到此处'}
            </p>
            <p style={{ fontSize: '0.9rem', color: '#86868B', margin: '0 0 24px' }}>
              支持 PDF、PNG、JPG，最大 50MB
            </p>
            <div style={{ display: 'inline-block', background: '#0071E3', color: '#FFF', borderRadius: 980, padding: '14px 32px', fontSize: '1rem', fontWeight: 600, letterSpacing: '-0.01em', transition: 'all 0.2s', boxShadow: '0 2px 12px rgba(0,113,227,0.3)' }}>
              选择文件
            </div>
            <input ref={fileInputRef} id="file-upload" type="file" accept=".pdf,.png,.jpg,.jpeg" style={{ display: 'none' }} onChange={async e => { const f = e.target.files?.[0]; if (f) await handleFile(f) }} />
          </div>

          {/* 功能流程 */}
          <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {[
              { step: '01', title: 'OCR 识别', desc: '高精度识别扫描件',
                icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0071E3" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg> },
              { step: '02', title: 'AI 分析', desc: '自动提取案件信息',
                icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0071E3" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a4 4 0 0 1 4 4c0 1.1-.9 2-2 2h-4a2 2 0 0 1-2-2 4 4 0 0 1 4-4z"/><path d="M12 8v4"/><circle cx="8" cy="16" r="1"/><circle cx="12" cy="16" r="1"/><circle cx="16" cy="16" r="1"/><path d="M12 12c-2 0-4 2-4 4"/><path d="M12 12c2 0 4 2 4 4"/><path d="M6 17h12"/><path d="M7 22h10"/></svg> },
              { step: '03', title: '选择文书', desc: '6种文书任意选择',
                icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0071E3" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg> },
              { step: '04', title: '生成文书', desc: '专业法律文书即刻生成',
                icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0071E3" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg> },
            ].map((f, i) => (
              <div key={f.step} className="glass-card" style={{
                background: '#FFFFFF', borderRadius: 16, padding: 20,
                border: '1px solid rgba(0,0,0,0.04)',
                boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
                display: 'flex', alignItems: 'center', gap: 16,
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateX(4px)'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,113,227,0.1)' }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'translateX(0)'; e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.04)' }}>
                <div style={{ width: 44, height: 44, borderRadius: 14, background: '#F5F5F7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {f.icon}
                </div>
                <div>
                  <div style={{ fontSize: '1rem', fontWeight: 600, color: '#1D1D1F', letterSpacing: '-0.02em' }}>{f.title}</div>
                  <div style={{ fontSize: '0.8rem', color: '#86868B', lineHeight: 1.4, marginTop: 2 }}>{f.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 支持文书类型 */}
        <div className="fade-in" style={{ marginTop: 56, maxWidth: 960, margin: '56px auto 0' }}>
          <p style={{ fontSize: '0.8rem', fontWeight: 600, color: '#86868B', textAlign: 'center', marginBottom: 20, letterSpacing: '0.08em' }}>支持的文书类型</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12 }}>
            {[
              { name: '民事上诉状', icon: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={iconColors.appeal} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>, color: '#E8F0FE' },
              { name: '民事起诉状', icon: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={iconColors.complaint} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="15" x2="15" y2="15"/></svg>, color: '#F0F9EE' },
              { name: '民事答辩状', icon: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={iconColors.defense} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>, color: '#FFF3E0' },
              { name: '代理词', icon: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={iconColors.representation} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>, color: '#F3E5F5' },
              { name: '执行申请书', icon: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={iconColors.execution} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>, color: '#E0F7FA' },
              { name: '保全申请书', icon: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={iconColors.preservation} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>, color: '#FFEBEE' },
            ].map(doc => (
              <div key={doc.name} style={{ textAlign: 'center', padding: '16px 8px', borderRadius: 14, background: doc.color, transition: 'all 0.2s ease', cursor: 'default' }}
                   onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 16px rgba(0,0,0,0.08)' }}
                   onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)'; (e.currentTarget as HTMLDivElement).style.boxShadow = 'none' }}>
                <div style={{ marginBottom: 8 }}>{doc.icon}</div>
                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#1D1D1F', letterSpacing: '-0.01em' }}>{doc.name}</div>
              </div>
            ))}
          </div>
        </div>
      </main>

      <style>{`
        @media (max-width: 768px) {
          .sm-hidden { display: none; }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .fade-in { animation: fadeIn 0.5s cubic-bezier(0.4, 0, 0.2, 1); }
      `}</style>
    </div>
  )
}
