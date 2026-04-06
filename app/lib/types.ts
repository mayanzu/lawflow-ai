export interface CaseInfo {
  案号: string
  案由: string
  原告: string
  被告: string
  判决法院: string
  判决日期: string
  判决结果: string
  上诉期限: string
  上诉法院: string
}

export interface GeneratedDocument {
  content: string
  generatedAt: string
  legalBasis?: string[]
}

export interface HistoryItem {
  id: string
  fileName: string
  uploadTime: string
  案号: string
  案由: string
  原告: string
  被告: string
  判决法院: string
  判决日期: string
  analyzeInfo?: CaseInfo
  appealText?: string
  generatedDocuments?: Record<string, GeneratedDocument>
}

export interface DocType {
  key: string
  name: string
  desc: string
  icon: string
}

export interface UploadResponse {
  success: boolean
  file_id?: string
  file_path?: string
  file_name?: string
  file_size?: number
  error?: string
}

export interface OcrResponse {
  success: boolean
  text?: string
  length?: number
  error?: string
}

export interface AnalyzeResponse {
  success: boolean
  info?: CaseInfo
  partial?: boolean
  missing_fields?: string[]
  error?: string
}

export interface GenerateResponse {
  success: boolean
  appeal?: string
  legal_basis?: string[]
  error?: string
}

export interface TaskStatus {
  id: string
  type: 'ocr' | 'analyze' | 'generate'
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled'
  progress: number
  message: string
  file_id: string
  file_name: string
  created_at: number
  updated_at: number
  result?: Record<string, unknown>
  error?: string
}

export interface TaskResponse {
  success: boolean
  task?: TaskStatus
  error?: string
}

export const DOC_TYPES: DocType[] = [
  { key: 'appeal', name: '民事上诉状', desc: '不服一审判决时使用', icon: 'doc' },
  { key: 'complaint', name: '民事起诉状', desc: '新案立案时使用', icon: 'fileText' },
  { key: 'defense', name: '民事答辩状', desc: '被诉后答辩时使用', icon: 'shield' },
  { key: 'representation', name: '代理词', desc: '庭审总结时使用', icon: 'scale' },
  { key: 'execution', name: '执行申请书', desc: '判决后申请强制执行时使用', icon: 'clock' },
  { key: 'preservation', name: '保全申请书', desc: '诉讼前/中申请财产保全时使用', icon: 'lock' },
]

export const CASE_INFO_FIELDS: (keyof CaseInfo)[] = [
  '案号', '案由', '原告', '被告', '判决法院', '判决日期', '判决结果', '上诉期限', '上诉法院'
]
