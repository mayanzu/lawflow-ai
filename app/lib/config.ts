// 应用配置文件
// 所有配置项从环境变量读取，避免硬编码

// 验证必需的环境变量
function requireEnv(key: string): string {
  const value = process.env[key]
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`)
  }
  return value
}

// 可选的环境变量
function optionalEnv(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue
}

// 律所配置
export const LAW_FIRM_CONFIG = {
  name: optionalEnv('LAW_FIRM_NAME', '安徽国恒律师事务所'),
  attorney: optionalEnv('LAW_FIRM_ATTORNEY', '赵光辉'),
  years: optionalEnv('LAW_FIRM_YEARS', '20'),
  address: optionalEnv('LAW_FIRM_ADDRESS', ''),
  phone: optionalEnv('LAW_FIRM_PHONE', ''),
} as const

// API配置
export const API_CONFIG = {
  // 后端服务地址
  backendUrl: optionalEnv('BACKEND_URL', 'http://localhost:3457'),
  
  // 请求超时（毫秒）
  timeout: parseInt(optionalEnv('API_TIMEOUT', '30000'), 10),
  
  // 最大重试次数
  maxRetries: parseInt(optionalEnv('API_MAX_RETRIES', '3'), 10),
  
  // 重试延迟（毫秒）
  retryDelay: parseInt(optionalEnv('API_RETRY_DELAY', '1000'), 10),
} as const

// 文件上传配置
export const UPLOAD_CONFIG = {
  // 最大文件大小（MB）
  maxFileSize: parseInt(optionalEnv('MAX_FILE_SIZE_MB', '50'), 10),
  
  // 允许的文件类型
  allowedTypes: optionalEnv('ALLOWED_FILE_TYPES', '.pdf,.png,.jpg,.jpeg').split(','),
  
  // 允许的文件MIME类型
  allowedMimeTypes: [
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/jpg',
  ],
} as const

// OCR配置
export const OCR_CONFIG = {
  // 腾讯云OCR
  tencent: {
    enabled: optionalEnv('TENCENT_OCR_ENABLED', 'true') === 'true',
    secretId: process.env.TENCENT_SECRET_ID || '',
    secretKey: process.env.TENCENT_SECRET_KEY || '',
    region: optionalEnv('TENCENT_OCR_REGION', 'ap-guangzhou'),
  },
  
  // 本地RapidOCR
  rapidOcr: {
    enabled: optionalEnv('RAPID_OCR_ENABLED', 'true') === 'true',
  },
  
  // 图片预处理
  preprocessing: {
    enabled: optionalEnv('OCR_PREPROCESSING', 'true') === 'true',
    dpi: parseInt(optionalEnv('OCR_DPI', '150'), 10),
    maxPages: parseInt(optionalEnv('OCR_MAX_PAGES', '30'), 10),
  },
} as const

// AI配置
export const AI_CONFIG = {
  // AI提供商: 'volcengine' | 'openrouter'
  provider: optionalEnv('AI_PROVIDER', 'volcengine') as 'volcengine' | 'openrouter',
  
  // 火山引擎
  volcengine: {
    key: process.env.VOLCENGINE_KEY || '',
    model: optionalEnv('VOLCENGINE_MODEL', 'doubao-seed-2-0-lite-260215'),
    endpoint: optionalEnv('VOLCENGINE_ENDPOINT', 'https://ark.cn-beijing.volces.com/api/v3/chat/completions'),
    reasoning: optionalEnv('VOLCENGINE_REASONING', 'minimal'),
    maxTokens: parseInt(optionalEnv('AI_MAX_TOKENS', '6144'), 10),
    temperature: parseFloat(optionalEnv('AI_TEMPERATURE', '0.25')),
  },
  
  // OpenRouter
  openrouter: {
    key: process.env.OPENROUTER_API_KEY || '',
    model: optionalEnv('OPENROUTER_MODEL', 'google/gemma-3-4b-it:free'),
  },
  
  // 速率限制
  rateLimit: {
    minInterval: parseInt(optionalEnv('AI_RATE_LIMIT_MS', '3000'), 10),
  },
} as const

// 存储配置
export const STORAGE_CONFIG = {
  // 历史记录最大条数
  maxHistoryItems: parseInt(optionalEnv('MAX_HISTORY_ITEMS', '20'), 10),
  
  // 上传文件保留天数
  uploadRetentionDays: parseInt(optionalEnv('UPLOAD_RETENTION_DAYS', '7'), 10),
  
  // 上传文件最大数量
  maxUploadFiles: parseInt(optionalEnv('MAX_UPLOAD_FILES', '20'), 10),
  
  // 上传文件最大总大小（GB）
  maxUploadTotalSizeGB: parseInt(optionalEnv('MAX_UPLOAD_TOTAL_GB', '1'), 10),
  
  // LocalStorage键前缀
  storageKeyPrefix: optionalEnv('STORAGE_KEY_PREFIX', 'lw_'),
} as const

// 功能开关
export const FEATURE_FLAGS = {
  // 启用异步任务
  asyncTasks: optionalEnv('FEATURE_ASYNC_TASKS', 'true') === 'true',
  
  // 启用流式输出
  streaming: optionalEnv('FEATURE_STREAMING', 'true') === 'true',
  
  // 启用任务进度推送
  taskProgress: optionalEnv('FEATURE_TASK_PROGRESS', 'true') === 'true',
  
  // 启用调试模式
  debug: optionalEnv('DEBUG_MODE', 'false') === 'true',
} as const

// UI配置
export const UI_CONFIG = {
  // 默认语言
  defaultLocale: optionalEnv('DEFAULT_LOCALE', 'zh-CN'),
  
  // 主题
  theme: {
    primaryColor: optionalEnv('THEME_PRIMARY_COLOR', '#0071E3'),
    borderRadius: optionalEnv('THEME_BORDER_RADIUS', '18px'),
  },
  
  // 动画
  animation: {
    enabled: optionalEnv('UI_ANIMATION', 'true') === 'true',
    duration: parseInt(optionalEnv('UI_ANIMATION_DURATION', '300'), 10),
  },
} as const

// 验证配置有效性
export function validateConfig(): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  
  // 检查AI配置
  if (AI_CONFIG.provider === 'volcengine' && !AI_CONFIG.volcengine.key) {
    errors.push('火山引擎AI密钥未配置 (VOLCENGINE_KEY)')
  }
  
  if (AI_CONFIG.provider === 'openrouter' && !AI_CONFIG.openrouter.key) {
    errors.push('OpenRouter API密钥未配置 (OPENROUTER_API_KEY)')
  }
  
  // 检查OCR配置
  if (OCR_CONFIG.tencent.enabled && (!OCR_CONFIG.tencent.secretId || !OCR_CONFIG.tencent.secretKey)) {
    console.warn('腾讯云OCR已启用但密钥未配置，将使用本地OCR')
  }
  
  return {
    valid: errors.length === 0,
    errors,
  }
}

// 客户端安全配置（不包含敏感信息）
export function getClientConfig() {
  return {
    lawFirm: {
      name: LAW_FIRM_CONFIG.name,
      attorney: LAW_FIRM_CONFIG.attorney,
      years: LAW_FIRM_CONFIG.years,
    },
    upload: {
      maxFileSize: UPLOAD_CONFIG.maxFileSize,
      allowedTypes: UPLOAD_CONFIG.allowedTypes,
    },
    storage: {
      maxHistoryItems: STORAGE_CONFIG.maxHistoryItems,
    },
    features: FEATURE_FLAGS,
    ui: UI_CONFIG,
  }
}
