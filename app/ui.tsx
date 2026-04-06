// Shared UI components for LawFlow
import React from 'react'

// ===== Colors =====
export const C = {
  white: '#FFFFFF',
  bg:     '#F5F5F7',
  text:   '#1D1D1F',
  sub:    '#6E6E73',
  muted:  '#86868B',
  border: '#E8E8ED',
  blue:   '#0071E3',
  red:    '#D93025',
  green:  '#2E7D32',
}

// ===== Nav =====
export function Nav({ title, left, right }: { title: string; left?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <nav style={{
      position: 'sticky', top: 0, zIndex: 100,
      backdropFilter: 'saturate(180%) blur(20px)', WebkitBackdropFilter: 'saturate(180%) blur(20px)',
      background: 'rgba(255,255,255,0.72)', borderBottom: '1px solid rgba(0,0,0,0.06)'
    }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: 56 }}>
        {left}
        <span style={{ fontSize: '1.1rem', fontWeight: 700, color: C.text, letterSpacing: '-0.03em' }}>{title}</span>
        {right || <div style={{ width: 60 }} />}
      </div>
    </nav>
  )
}

// ===== Button =====
export function Btn({ children, variant = 'primary', onClick, style, disabled }: {
  children: React.ReactNode; variant?: 'primary' | 'secondary' | 'ghost';
  onClick?: () => void; style?: React.CSSProperties; disabled?: boolean
}) {
  const base: Record<string, React.CSSProperties> = {
    primary:   { background: C.blue, color: '#FFF', border: 'none' },
    secondary: { background: C.white, color: C.blue, border: `1px solid ${C.border}` },
    ghost:     { background: 'none', color: C.muted, border: `1px solid ${C.border}` },
  }
  return (
    <button onClick={onClick} disabled={disabled} style={{
      ...base[variant], borderRadius: 980, padding: '12px 24px', fontSize: '0.95rem',
      fontWeight: 500, cursor: disabled ? 'wait' : 'pointer', letterSpacing: '-0.01em',
      transition: 'all 0.2s ease', opacity: disabled ? 0.5 : 1,
      ...style,
    }}>{children}</button>
  )
}

// ===== Card =====
export function Card({ children, padding = 24, style, hover = true }: {
  children: React.ReactNode; padding?: number; style?: React.CSSProperties; hover?: boolean
}) {
  return (
    <div style={{
      background: C.white, borderRadius: 20, padding,
      border: `1px solid rgba(0,0,0,0.04)`,
      boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
      transition: hover ? 'all 0.25s ease' : 'none',
      ...style,
    }}>{children}</div>
  )
}

// ===== Section Label =====
export function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: C.muted, letterSpacing: '0.08em', marginBottom: 16, textTransform: 'uppercase' }}>
      {children}
    </div>
  )
}

// ===== SVG Icons =====
export const Icons = {
  search: (size = 20, color = C.blue) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      <line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>
    </svg>),
  brain: (size = 20, color = C.blue) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a4 4 0 0 1 4 4c0 1.1-.9 2-2 2h-4a2 2 0 0 1-2-2 4 4 0 0 1 4-4z"/>
      <path d="M12 8v4"/><circle cx="8" cy="16" r="1"/><circle cx="12" cy="16" r="1"/><circle cx="16" cy="16" r="1"/>
      <path d="M12 12c-2 0-4 2-4 4"/><path d="M12 12c2 0 4 2 4 4"/>
    </svg>),
  grid: (size = 20, color = C.blue) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
      <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
    </svg>),
  zap: (size = 20, color = C.blue) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
    </svg>),
  doc: (size = 24, color = C.blue) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"/>
      <polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
    </svg>),
  shield: (size = 24, color = C.blue) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>),
  scale: (size = 24, color = C.blue) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v18"/><path d="M3 7l4-4 4 4"/><path d="M13 7l4-4 4 4"/>
      <path d="M3 15h8"/><path d="M13 15h8"/>
    </svg>),
  clock: (size = 24, color = C.blue) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
    </svg>),
  lock: (size = 24, color = C.blue) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>),
  upload: (size = 32, color = C.blue) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
    </svg>),
  layers: (size = 24, color = C.blue) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
    </svg>),
  arrowLeft: (size = 16, color = C.blue) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
    </svg>),
  chevronRight: (size = 16, color: string = C.blue) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6"/>
    </svg>),
  check: (size = 14, color = '#FFF') => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <path d="M13 4L6 11.5L3 8.5" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>),
  trash: (size = 16, color = C.muted) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
      <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
    </svg>),
  fileText: (size = 24, color = C.blue) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"/>
      <polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/>
      <line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/>
    </svg>),
}

// Loading spinner component
export function Spinner({ size = 32 }: { size?: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      border: `3px solid ${C.border}`, borderTopColor: C.blue,
      animation: 'spin 0.8s linear infinite'
    }} />
  )
}
