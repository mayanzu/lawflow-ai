'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

interface Info {
  案号: string
  案由: string
  原告: string
  被告: string
  判决法院: string
  判决结果: string
  上诉期限: string
  上诉法院: string
  判决日期?: string
}

export default function ConfirmPage() {
  const router = useRouter()
  const [info, setInfo] = useState<Info>({
    案号: '',
    案由: '',
    原告: '',
    被告: '',
    判决法院: '',
    判决结果: '',
    上诉期限: '',
    上诉法院: '',
    判决日期: '',
  })
  const [appealDeadline, setAppealDeadline] = useState<number | null>(null)
  const [daysLeft, setDaysLeft] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [extracted, setExtracted] = useState(false)

  useEffect(() => {
    const raw = localStorage.getItem('lw_analyze_info')
    const ocr = localStorage.getItem('lw_ocr_text') || ''

    if (raw) {
      try {
        const parsed = JSON.parse(raw)
        const parsedInfo: Info = {
          案号: parsed.案号 || '',
          案由: parsed.案由 || '',
          原告: parsed.原告 || '',
          被告: parsed.被告 || '',
          判决法院: parsed.判决法院 || '',
          判决结果: parsed.判决结果 || '',
          上诉期限: parsed.上诉期限 || '',
          上诉法院: parsed.上诉法院 || '',
          判决日期: parsed.判决日期 || '',
        }
        setInfo(parsedInfo)
        setExtracted(true)
        calculateDeadline(parsed.判决日期, parsed.上诉期限)

        // 自动推断上诉法院（如果为空）
        if (!parsed.上诉法院 && parsed.判决法院) {
          const court = parsed.判决法院
          let appealCourt = ''
          if (court.includes('区人民法院') || court.includes('县人民法院')) {
            appealCourt = court.replace(/区人民法院|县人民法院/, '中级人民法院')
          } else if (court.includes('中级人民法院')) {
            appealCourt = court.replace(/中级人民法院/, '高级人民法院')
          } else if (court.includes('高级人民法院')) {
            appealCourt = '最高人民法院'
          } else {
            appealCourt = court + ' 的上级法院'
          }
          setInfo(prev => ({ ...prev, 上诉法院: appealCourt }))
        }
      } catch {}
    }

    // 从 OCR 文本中智能提取判决日期（支持中文数字）
    if (ocr && !info.判决日期) {
      const dateStr = extractDatesFromOcr(ocr)
      if (dateStr) {
        const d = new Date(dateStr)
        if (!isNaN(d.getTime()) && d.getFullYear() >= 2000 && d.getFullYear() <= 2030) {
          setInfo(prev => ({ ...prev, 判决日期: dateStr }))
          calculateDeadline(dateStr, info.上诉期限 || '15')
        }
      }
    }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 辅助函数：中文数字转整数
  function cnToInt(s: string): number {
    const d: Record<string, number> = {'〇':0,'零':0,'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9}
    if (!s) return 0
    let r = 0
    for (const ch of s) { if (ch in d) r = r * 10 + d[ch] }
    return r
  }

  function parseDate(s: string): string | null {
    // 阿拉伯数字格式: 2026年3月27日 或 26年3月27日
    const m1 = s.match(/(\d{2,4})年(\d{1,2})月(\d{1,2})日/)
    if (m1) {
      let y = parseInt(m1[1]), mo = parseInt(m1[2]), d = parseInt(m1[3])
      if (y < 100) y += 2000
      if (y > 1990 && y < 2031 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return `${y}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`
    }
    // 全中文数字: 二〇二六年三月二十七日
    const m2 = s.match(/([零〇一二三四五六七八九十]+)年([零〇一二三四五六七八九十]+)月([零〇一二三四五六七八九十]+)日/)
    if (m2) {
      let y = cnToInt(m2[1]), mo = cnToInt(m2[2]), d = cnToInt(m2[3])
      if (y < 100) y += 2000
      if (y > 1990 && y < 2031 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return `${y}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`
    }
    // 阿拉伯年+中文月日: 2026年四月十一日
    const m3 = s.match(/(\d{4})年([零〇一二三四五六七八九十]+)月([零〇一二三四五六七八九十]+)日/)
    if (m3) {
      const y = parseInt(m3[1]), mo = cnToInt(m3[2]), d = cnToInt(m3[3])
      if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return `${y}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`
    }
    return null
  }

  function extractDatesFromOcr(ocrText: string): string | null {
    // 收集所有匹配的日期
    const allDates: string[] = []
    // 阿拉伯数字: 26年3月27日, 2026年3月27日
    const arMatches = [...ocrText.matchAll(/(\d{2,4})年(\d{1,2})月(\d{1,2})日/g)]
    for (const m of arMatches) {
      let y = parseInt(m[1]), mo = parseInt(m[2]), d = parseInt(m[3])
      if (y < 100) y += 2000
      if (y > 1990 && y < 2031 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31)
        allDates.push(`${y}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`)
    }
    // 全中文: 二〇二六年四月十一日
    const cnMatches = [...ocrText.matchAll(/([零〇一二三四五六七八九十]+)年([零〇一二三四五六七八九十]+)月([零〇一二三四五六七八九十]+)日/g)]
    for (const m of cnMatches) {
      let y = cnToInt(m[1]), mo = cnToInt(m[2]), d = cnToInt(m[3])
      if (y < 100) y += 2000
      if (y > 1990 && y < 2031 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31)
        allDates.push(`${y}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`)
    }
    if (allDates.length === 0) return null
    // 取最后一个（判决日期通常在正文末尾）
    return allDates[allDates.length - 1]
  }

  function calculateDeadline(判决日期: string, 上诉期限: string) {
    if (!判决日期) return
    const days = parseInt(上诉期限) || 15
    const deadline = new Date(判决日期)
    deadline.setDate(deadline.getDate() + days)
    setAppealDeadline(deadline.getTime())

    const now = Date.now()
    const diff = Math.ceil((deadline.getTime() - now) / (1000 * 60 * 60 * 24))
    setDaysLeft(diff)
  }

  function handleFieldChange(field: keyof Info, value: string) {
    setInfo(prev => {
      const next = { ...prev, [field]: value }
      if (field === '判决日期' || field === '上诉期限') {
        calculateDeadline(field === '判决日期' ? value : prev.判决日期, field === '上诉期限' ? value : prev.上诉期限)
      }
      return next
    })
  }

  function handleConfirm() {
    localStorage.setItem('lw_analyze_info', JSON.stringify(info))
    router.push('/generate')
  }

  function handleBack() {
    router.push('/flow')
  }

  const isUrgent = daysLeft !== null && daysLeft <= 7
  const isExpired = daysLeft !== null && daysLeft <= 0

  return (
    <div style={{ minHeight: '100vh', background: '#F8F9FA', fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif' }}>
      {/* 导航 */}
      <div style={{ padding: '16px 40px', background: '#FFF', borderBottom: '1px solid #E8EAED', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button onClick={handleBack} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '17px', fontWeight: 600, color: '#1D1D1F' }}>
          ← 返回
        </button>
        <span style={{ fontSize: '14px', color: '#6E6E73' }}>案件信息确认</span>
        <div style={{ width: 60 }} />
      </div>

      {/* 上诉期限提醒 */}
      {daysLeft !== null && (
        <div style={{
          margin: '24px auto 0',
          maxWidth: 720,
          padding: '16px 20px',
          borderRadius: 12,
          background: isExpired ? '#FEF0EF' : isUrgent ? '#FFF3E0' : '#E8F5E9',
          border: `1px solid ${isExpired ? '#F5C6C5' : isUrgent ? '#FFE0B2' : '#C8E6C9'}`,
          display: 'flex',
          alignItems: 'center',
          gap: 16,
        }}>
          <div style={{ fontSize: 32 }}>
            {isExpired ? '⚠️' : isUrgent ? '⏰' : '📅'}
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: isExpired ? '#D93025' : isUrgent ? '#E65100' : '#2E7D32', marginBottom: 2 }}>
              {isExpired ? '上诉期已届满' : `上诉期限：剩余 ${daysLeft} 天`}
            </div>
            <div style={{ fontSize: 12, color: '#5F6368' }}>
              判决日期：{info.判决日期 || '未填写'} &nbsp;|&nbsp; 上诉期限：{info.上诉期限 || '15'} 天 &nbsp;|&nbsp; 届满日期：{appealDeadline ? new Date(appealDeadline).toLocaleDateString('zh-CN') : '—'}
            </div>
          </div>
        </div>
      )}

      <div style={{ maxWidth: 720, margin: '32px auto', padding: '0 24px' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#1D1D1F', margin: '0 0 8px' }}>确认案件信息</h2>
          <p style={{ fontSize: 14, color: '#86868B', margin: 0 }}>
            请核实以下信息，修正后继续。上诉状将基于本页填写内容生成。
          </p>
        </div>

        <div style={{ background: '#FFF', borderRadius: 16, padding: '28px 32px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
          {/* 基本信息 */}
          <div style={{ marginBottom: 28 }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: '#86868B', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 16, paddingBottom: 10, borderBottom: '1px solid #F0F0F0' }}>基本信息</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              {(['案号', '案由', '判决法院', '判决日期'] as const).map(field => (
                <div key={field}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#5F6368', display: 'block', marginBottom: 6 }}>{field}</label>
                  <input
                    type={field === '判决日期' ? 'date' : 'text'}
                    value={info[field]}
                    onChange={e => handleFieldChange(field, e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', border: '1px solid #E0E0E0', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', color: '#1D1D1F', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* 当事人信息 */}
          <div style={{ marginBottom: 28 }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: '#86868B', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 16, paddingBottom: 10, borderBottom: '1px solid #F0F0F0' }}>当事人信息</h3>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#5F6368', display: 'block', marginBottom: 6 }}>原告（上诉人）</label>
              <input value={info.原告} onChange={e => handleFieldChange('原告', e.target.value)} style={{ width: '100%', padding: '10px 12px', border: '1px solid #E0E0E0', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', color: '#1D1D1F', outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#5F6368', display: 'block', marginBottom: 6 }}>被告（被上诉人）</label>
              <input value={info.被告} onChange={e => handleFieldChange('被告', e.target.value)} style={{ width: '100%', padding: '10px 12px', border: '1px solid #E0E0E0', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', color: '#1D1D1F', outline: 'none', boxSizing: 'border-box' }} />
            </div>
          </div>

          {/* 上诉信息 */}
          <div style={{ marginBottom: 28 }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: '#86868B', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 16, paddingBottom: 10, borderBottom: '1px solid #F0F0F0' }}>上诉信息</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              {(['上诉期限', '上诉法院'] as const).map(field => (
                <div key={field}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#5F6368', display: 'block', marginBottom: 6 }}>
                    {field} {field === '上诉期限' && <span style={{ fontWeight: 400 }}>(天)</span>}
                  </label>
                  <input
                    type={field === '上诉期限' ? 'number' : 'text'}
                    value={info[field]}
                    onChange={e => handleFieldChange(field, e.target.value)}
                    placeholder={field === '上诉期限' ? '15' : ''}
                    style={{ width: '100%', padding: '10px 12px', border: '1px solid #E0E0E0', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', color: '#1D1D1F', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* 判决结果 */}
          <div>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: '#86868B', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 16, paddingBottom: 10, borderBottom: '1px solid #F0F0F0' }}>一审判决结果（摘要）</h3>
            <textarea
              value={info.判决结果}
              onChange={e => handleFieldChange('判决结果', e.target.value)}
              rows={4}
              style={{ width: '100%', padding: '12px', border: '1px solid #E0E0E0', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', color: '#1D1D1F', outline: 'none', resize: 'vertical', lineHeight: 1.7, boxSizing: 'border-box' }}
              placeholder="请简要填写一审法院判决内容..."
            />
          </div>
        </div>

        {/* 操作按钮 */}
        <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
          <button
            onClick={handleBack}
            style={{ flex: 1, padding: 14, background: '#FFF', color: '#1D1D1F', border: '1px solid #E0E0E0', borderRadius: 12, cursor: 'pointer', fontSize: 16, fontWeight: 500 }}
          >
            返回修改
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            style={{ flex: 2, padding: 14, background: '#0071E3', color: '#FFF', border: 'none', borderRadius: 12, cursor: 'pointer', fontSize: 16, fontWeight: 600, opacity: loading ? 0.6 : 1 }}
          >
            {loading ? '处理中...' : '确认并生成上诉状 →'}
          </button>
        </div>

        <p style={{ fontSize: 12, color: '#86868B', textAlign: 'center', marginTop: 16 }}>
          上诉状将基于以上信息生成，请确保信息准确无误
        </p>
      </div>
    </div>
  )
}
