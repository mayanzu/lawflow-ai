// 统一错误处理系统
// 提供类型安全的错误处理和用户友好的错误消息

export type ErrorCode = 
  | 'UNKNOWN_ERROR'
  | 'NETWORK_ERROR'
  | 'API_ERROR'
  | 'VALIDATION_ERROR'
  | 'FILE_TOO_LARGE'
  | 'FILE_TYPE_INVALID'
  | 'OCR_FAILED'
  | 'AI_ANALYSIS_FAILED'
  | 'GENERATION_FAILED'
  | 'TASK_CANCELLED'
  | 'TASK_TIMEOUT'
  | 'STORAGE_ERROR'
  | 'PERMISSION_DENIED'

export interface AppError extends Error {
  code: ErrorCode
  statusCode?: number
  userMessage: string
  shouldRetry: boolean
}

export class BaseError extends Error implements AppError {
  code: ErrorCode
  statusCode?: number
  userMessage: string
  shouldRetry: boolean

  constructor(
    message: string,
    code: ErrorCode = 'UNKNOWN_ERROR',
    options: {
      statusCode?: number
      userMessage?: string
      shouldRetry?: boolean
      cause?: Error
    } = {}
  ) {
    super(message, { cause: options.cause })
    this.name = 'BaseError'
    this.code = code
    this.statusCode = options.statusCode
    this.userMessage = options.userMessage || this.getDefaultUserMessage(code)
    this.shouldRetry = options.shouldRetry ?? this.getDefaultRetryable(code)
  }

  private getDefaultUserMessage(code: ErrorCode): string {
    const messages: Record<ErrorCode, string> = {
      UNKNOWN_ERROR: '发生未知错误，请稍后重试',
      NETWORK_ERROR: '网络连接失败，请检查网络后重试',
      API_ERROR: '服务器处理失败，请稍后重试',
      VALIDATION_ERROR: '输入数据验证失败，请检查后重试',
      FILE_TOO_LARGE: '文件过大，请上传不超过50MB的文件',
      FILE_TYPE_INVALID: '不支持的文件类型，请上传PDF或图片',
      OCR_FAILED: '文字识别失败，请检查文件清晰度后重试',
      AI_ANALYSIS_FAILED: 'AI分析失败，请稍后重试',
      GENERATION_FAILED: '文书生成失败，请稍后重试',
      TASK_CANCELLED: '任务已取消',
      TASK_TIMEOUT: '处理超时，请稍后重试',
      STORAGE_ERROR: '本地存储失败，请检查浏览器设置',
      PERMISSION_DENIED: '权限不足，无法访问',
    }
    return messages[code] || '操作失败，请稍后重试'
  }

  private getDefaultRetryable(code: ErrorCode): boolean {
    const retryableCodes: ErrorCode[] = [
      'NETWORK_ERROR',
      'API_ERROR',
      'OCR_FAILED',
      'AI_ANALYSIS_FAILED',
      'GENERATION_FAILED',
      'TASK_TIMEOUT',
    ]
    return retryableCodes.includes(code)
  }
}

// 便捷的错误工厂函数
export const Errors = {
  network: (cause?: Error) =>
    new BaseError('Network error', 'NETWORK_ERROR', { cause, shouldRetry: true }),

  api: (message: string, statusCode?: number, cause?: Error) =>
    new BaseError(message, 'API_ERROR', { statusCode, cause }),

  validation: (message: string, cause?: Error) =>
    new BaseError(message, 'VALIDATION_ERROR', { cause, shouldRetry: false }),

  fileTooLarge: (maxSize: number, cause?: Error) =>
    new BaseError(`File exceeds ${maxSize}MB`, 'FILE_TOO_LARGE', {
      userMessage: `文件过大，请上传不超过${maxSize}MB的文件`,
      cause,
      shouldRetry: false,
    }),

  fileTypeInvalid: (allowedTypes: string[], cause?: Error) =>
    new BaseError(`Invalid file type`, 'FILE_TYPE_INVALID', {
      userMessage: `不支持的文件类型，请上传${allowedTypes.join('、')}格式`,
      cause,
      shouldRetry: false,
    }),

  ocrFailed: (cause?: Error) =>
    new BaseError('OCR failed', 'OCR_FAILED', { cause, shouldRetry: true }),

  aiAnalysisFailed: (cause?: Error) =>
    new BaseError('AI analysis failed', 'AI_ANALYSIS_FAILED', { cause, shouldRetry: true }),

  generationFailed: (cause?: Error) =>
    new BaseError('Generation failed', 'GENERATION_FAILED', { cause, shouldRetry: true }),

  taskCancelled: () =>
    new BaseError('Task cancelled', 'TASK_CANCELLED', { shouldRetry: false }),

  taskTimeout: (cause?: Error) =>
    new BaseError('Task timeout', 'TASK_TIMEOUT', { cause, shouldRetry: true }),

  storage: (cause?: Error) =>
    new BaseError('Storage error', 'STORAGE_ERROR', { cause, shouldRetry: false }),
}

// 错误转换器 - 将未知错误转换为AppError
export function toAppError(error: unknown): AppError {
  if (error instanceof BaseError) {
    return error
  }

  if (error instanceof Error) {
    // 网络错误
    if (error.message.includes('fetch') || 
        error.message.includes('network') ||
        error.message.includes('timeout')) {
      return Errors.network(error)
    }
    return new BaseError(error.message, 'UNKNOWN_ERROR', { cause: error })
  }

  return new BaseError(String(error), 'UNKNOWN_ERROR')
}

// API响应错误处理
export async function handleApiResponse<T>(
  response: Response,
  errorMapper?: (data: any) => AppError
): Promise<T> {
  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    
    if (errorMapper) {
      throw errorMapper(data)
    }

    // 根据状态码生成错误
    switch (response.status) {
      case 400:
        throw Errors.validation(data.error || '请求参数错误')
      case 413:
        throw Errors.fileTooLarge(50)
      case 429:
        throw new BaseError('Rate limited', 'API_ERROR', {
          statusCode: 429,
          userMessage: '请求过于频繁，请稍后重试',
          shouldRetry: true,
        })
      case 500:
      case 502:
      case 503:
        throw Errors.api(data.error || '服务器错误', response.status)
      default:
        throw Errors.api(data.error || '请求失败', response.status)
    }
  }

  return response.json()
}

// 带重试的API调用
export async function fetchWithRetry<T>(
  url: string,
  options: RequestInit = {},
  retryConfig: {
    maxRetries?: number
    retryDelay?: number
    shouldRetry?: (error: AppError) => boolean
  } = {}
): Promise<T> {
  const { maxRetries = 3, retryDelay = 1000, shouldRetry } = retryConfig

  let lastError: AppError

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options)
      return await handleApiResponse<T>(response)
    } catch (error) {
      lastError = toAppError(error)

      // 最后一次尝试或不应重试
      if (attempt === maxRetries || 
          (shouldRetry && !shouldRetry(lastError)) ||
          !lastError.shouldRetry) {
        throw lastError
      }

      // 等待后重试
      await sleep(retryDelay * (attempt + 1))
    }
  }

  throw lastError!
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// 错误边界组件用的错误处理器
export function getErrorDisplayInfo(error: AppError): {
  title: string
  message: string
  action: 'retry' | 'back' | 'none'
} {
  const info: Record<ErrorCode, { title: string; action: 'retry' | 'back' | 'none' }> = {
    UNKNOWN_ERROR: { title: '出错了', action: 'retry' },
    NETWORK_ERROR: { title: '网络错误', action: 'retry' },
    API_ERROR: { title: '服务器错误', action: 'retry' },
    VALIDATION_ERROR: { title: '输入错误', action: 'back' },
    FILE_TOO_LARGE: { title: '文件过大', action: 'back' },
    FILE_TYPE_INVALID: { title: '文件类型不支持', action: 'back' },
    OCR_FAILED: { title: '识别失败', action: 'retry' },
    AI_ANALYSIS_FAILED: { title: '分析失败', action: 'retry' },
    GENERATION_FAILED: { title: '生成失败', action: 'retry' },
    TASK_CANCELLED: { title: '已取消', action: 'none' },
    TASK_TIMEOUT: { title: '处理超时', action: 'retry' },
    STORAGE_ERROR: { title: '存储错误', action: 'back' },
    PERMISSION_DENIED: { title: '权限不足', action: 'back' },
  }

  const config = info[error.code] || info.UNKNOWN_ERROR

  return {
    title: config.title,
    message: error.userMessage,
    action: config.action,
  }
}
