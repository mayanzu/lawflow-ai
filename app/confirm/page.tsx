'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

interface Info {
  案号: string; 案由: string; 原告: string; 被告: string
  判决法院: string; 判决结果: string; 上诉期限: string; 上诉法院: string; 判决日期: string
}

export default function ConfirmPage() {
  const router = useRouter()
  const [info, setInfo] = useState<Info>({
    案号:'', 案由:'', 原告:'', 被告:'',
    判决法院:'', 判决结果:'', 上诉期限:'', 上诉法院:'', 判决日期:''
  })
  const [appealDeadline, setAppealDeadline] = useState<number | null>(null)
  const [daysLeft, setDaysLeft] = useState<number | null>(null)
  const [generating, setGenerating] = useState(false)

  function cnToInt(s: string): number {
    const d: Record<string, number> = {'〇':0,'零':0,'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9}
    if (!s) return 0
    const cnNum: Record<string, number> = {...d, '十':10, '百':100}
    if (s.includes('十')) {
      let result = 0
      const parts = s.split('十')
      if (parts[0] !== '') result += cnNum[parts[0]] ?? 0
      result *= 10
      if (parts[1] !== '') for (const ch of parts[1]) result += cnNum[ch] ?? 0
      return result
    }
    let r = 0
    for (const ch of s) { if (ch in d) r = r * 10 + d[ch] }
    return r
  }

  function parseDate(s: string): string | null {
    const m1 = s.match(/(\d{2,4})年(\d{1,2})月(\d{1,2})日/)
    if (m1) {
      let y = parseInt(m1[1]), mo = parseInt(m1[2]), d = parseInt(m1[3])
      if (y < 100) y += 2000
      if (y > 1990 && y < 2031 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31)
        return `${y}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`
    }
    const m2 = s.match(/([零〇一二三四五六七八九十]+)年([零〇一二三四五六七八九十]+)月([零〇一二三四五六七八九十]+)日/)
    if (m2) {
      let y = cnToInt(m2[1]), mo = cnToInt(m2[2]), d = cnToInt(m2[3])
      if (y < 100) y += 2000
      if (y > 1990 && y < 2031 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31)
        return `${y}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`
    }
    return null
  }

  function calcDeadline(判决日期: string, 上诉期限: string) {
    if (!判决日期) return
    const days = parseInt(上诉期限) || 15
    const deadline = new Date(判决日期)
    deadline.setDate(deadline.getDate() + days)
    setAppealDeadline(deadline.getTime())
    setDaysLeft(Math.ceil((deadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
  }

  function handleFieldChange(field: keyof Info, value: string) {
    setInfo(prev => {
      const next = { ...prev, [field]: value }
      if (field === '判决日期' || field === '上诉期限')
        calcDeadline(field === '判决日期' ? value : prev.判决日期, field === '上诉期限' ? value : prev.上诉期限)
      return next
    })
  }

  async function handleGenerate() {
    setGenerating(true)
    // 保存信息并立即跳转到结果页
    localStorage.setItem('lw_analyze_info', JSON.stringify(info))
    router.push('/result')
  }

  useEffect(() => {
    const raw = localStorage.getItem('lw_analyze_info')
    const ocr = localStorage.getItem('lw_ocr_text') || ''
    if (raw) {
      try {
        const parsed = JSON.parse(raw)
        const parsedInfo: Info = {
          案号: parsed.案号||'', 案由: parsed.案由||'', 原告: parsed.原告||'',
          被告: parsed.被告||'', 判决法院: parsed.判决法院||'',
          判决结果: parsed.判决结果||'', 上诉期限: parsed.上诉期限||'',
          上诉法院: parsed.上诉法院||'', 判决日期: parsed.判决日期||''
        }
        setInfo(parsedInfo)
        if (parsedInfo.判决日期 || parsedInfo.上诉期限)
          calcDeadline(parsedInfo.判决日期 || '2024-01-01', parsedInfo.上诉期限 || '15')
        if (!parsed.上诉法院 && parsed.判决法院) {
          let court = parsed.判决法院, appealCourt = ''
          for (const muni of ['北京','上海','天津','重庆']) {
            if (court.startsWith(muni)) {
              if (court.includes('区人民法院')) appealCourt = muni + '市中级人民法院'
              else if (court.includes('中级人民法院')) appealCourt = muni + '市高级人民法院'
              else if (court.includes('高级人民法院')) appealCourt = '最高人民法院'
              break
            }
          }
          if (!appealCourt) {
            const m = court.match(/^(.+?市)(.+区)人民法院/)
            if (m) appealCourt = m[1] + '中级人民法院'
            else if (court.includes('中级人民法院')) appealCourt = court.replace('中级人民法院','高级人民法院')
            else if (court.includes('高级人民法院')) appealCourt = '最高人民法院'
            else appealCourt = court + ' 的上级法院'
          }
          if (appealCourt) setInfo(prev => ({ ...prev, 上诉法院: appealCourt }))
        }
      } catch {}
    }
    if (ocr && !info.判决日期) {
      const dateStr = parseDate(ocr)
      if (dateStr) {
        calcDeadline(dateStr, parsedInfo.上诉期限 || '15')
        setInfo(prev => ({ ...prev, 判决日期: dateStr }))
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const isUrgent = daysLeft !== null && daysLeft <= 7
  const isExpired = daysLeft !== null && daysLeft <= 0
  const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 12px', border: '1px solid #E0E0E0', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', color: '#1D1D1F', outline: 'none', boxSizing: 'border-box', background: '#FFF' }
  const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: '#86868B', display: 'block', marginBottom: 6 }
  const sectionTitle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: '#86868B', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 14, paddingBottom: 8, borderBottom: '1px solid #F0F0F0' }

  return (
    <div style={{ minHeight: '100vh', background: '#F8F9FA', fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif' }}>
      <div style={{ padding: '12px 16px', background: '#FFF', borderBottom: '1px solid #E8EAED', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button onClick={() => router.push('/flow')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, fontWeight: 600, color: '#1D1D1F', padding: '8px 0' }}>← 返回</button>
        <span style={{ fontSize: 14, color: '#86868B' }}>案件信息确认</span>
        <div style={{ width: 50 }} />
      </div>

      {daysLeft !== null && (
        <div style={{ margin: '16px 16px 0', padding: '12px 16px', borderRadius: 10, background: isExpired ? '#FEF0EF' : isUrgent ? '#FFF3E0' : '#E8F5E9', border: `1px solid ${isExpired ? '#F5C6C5' : isUrgent ? '#FFE0B2' : '#C8E6C9'}` }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: isExpired ? '#D93025' : isUrgent ? '#E65100' : '#2E7D32', marginBottom: 2 }}>
            {isExpired ? '上诉期已届满' : `上诉期限：剩余 ${daysLeft} 天`}
          </div>
          <div style={{ fontSize: 11, color: '#86868B' }}>判决日期：{info.判决日期 || '未填写'} &nbsp;|&nbsp; 届满：{appealDeadline ? new Date(appealDeadline).toLocaleDateString('zh-CN') : '—'}</div>
        </div>
      )}

      <div style={{ padding: '16px 16px 80px', maxWidth: 600, margin: '0 auto' }}>
        <div style={{ background: '#FFF', borderRadius: 14, padding: '16px', marginBottom: 14, boxShadow: '0 1px 6px rgba(0,0,0,0.05)' }}>
          <h3 style={sectionTitle}>基本信息</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {(['案号','案由','判决法院','判决日期'] as const).map(field => (
              <div key={field}>
                <label style={labelStyle}>{field}</label>
                <input type={field === '判决日期' ? 'date' : 'text'} value={info[field]} onChange={e => handleFieldChange(field, e.target.value)} style={inputStyle} />
              </div>
            ))}
          </div>
        </div>

        <div style={{ background: '#FFF', borderRadius: 14, padding: '16px', marginBottom: 14, boxShadow: '0 1px 6px rgba(0,0,0,0.05)' }}>
          <h3 style={sectionTitle}>当事人信息</h3>
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>原告（上诉人）</label>
            <input value={info.原告} onChange={e => handleFieldChange('原告', e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>被告（被上诉人）</label>
            <input value={info.被告} onChange={e => handleFieldChange('被告', e.target.value)} style={inputStyle} />
          </div>
        </div>

        <div style={{ background: '#FFF', borderRadius: 14, padding: '16px', marginBottom: 14, boxShadow: '0 1px 6px rgba(0,0,0,0.05)' }}>
          <h3 style={sectionTitle}>上诉信息</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div><label style={labelStyle}>上诉期限（天）</label><input type="number" value={info.上诉期限} onChange={e => handleFieldChange('上诉期限', e.target.value)} placeholder="15" style={inputStyle} /></div>
            <div><label style={labelStyle}>上诉法院</label><input value={info.上诉法院} onChange={e => handleFieldChange('上诉法院', e.target.value)} style={inputStyle} /></div>
          </div>
        </div>

        <div style={{ background: '#FFF', borderRadius: 14, padding: '16px', marginBottom: 20, boxShadow: '0 1px 6px rgba(0,0,0,0.05)' }}>
          <h3 style={sectionTitle}>一审判决结果（摘要）</h3>
          <textarea value={info.判决结果} onChange={e => handleFieldChange('判决结果', e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.7 }} placeholder="请简要填写..." />
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => router.push('/flow')} style={{ flex: 1, padding: '14px', background: '#FFF', color: '#1D1D1F', border: '1px solid #E0E0E0', borderRadius: 12, cursor: 'pointer', fontSize: 15, fontWeight: 500, minHeight: 48 }}>返回修改</button>
          <button onClick={handleGenerate} disabled={generating} style={{ flex: 2, padding: '14px', background: '#0071E3', color: '#FFF', border: 'none', borderRadius: 12, cursor: generating ? 'wait' : 'pointer', fontSize: 15, fontWeight: 600, minHeight: 48, opacity: generating ? 0.6 : 1 }}>
            {generating ? '生成中...' : '生成上诉状'}
          </button>
        </div>
      </div>
    </div>
  )
}
