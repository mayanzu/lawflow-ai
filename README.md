# LawFlow 诉状助手

法律文书 OCR 识别 + AI 信息提取 + 诉状生成工具。

## 功能

- **PDF/图片 OCR 识别**：腾讯云 OCR 优先，本地 RapidOCR 兜底
- **案件信息提取**：AI 自动从判决书中提取案号、案由、当事人、判决法院、判决结果等9个关键字段
- **上诉期限计算**：自动根据判决日期和上诉期限计算截止日期
- **诉状生成**：流式输出，带法律依据，可直接复制或下载

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | Next.js 14 (App Router) |
| 后端 | Python (ThreadingTCPServer) |
| AI | Doubao Seed (火山引擎) / OpenRouter |
| OCR | 腾讯云 OCR + RapidOCR |
| 部署 | PM2 |

## 目录结构

```
lawflow/
├── app/                    # Next.js 前端页面
│   ├── page.tsx            # 首页（文件上传）
│   ├── flow/page.tsx       # OCR + AI 提取流程
│   ├── confirm/page.tsx    # 案件信息确认
│   ├── generate/page.tsx   # 诉状生成
│   ├── result/page.tsx     # 结果展示
│   └── history/page.tsx    # 历史记录
│   └── api/                # API 路由
│       ├── upload/         # 文件上传
│       ├── ocr/            # OCR 识别
│       ├── analyze/        # AI 案件信息提取
│       └── generate-appeal/ # 诉状生成
├── backend/
│   └── server.py           # Python HTTP 后端（PM2 管理）
└── uploads/                # 上传文件存储（7天自动清理）
```

## 部署

### 环境变量

```bash
# 腾讯云 OCR
TENCENT_SECRET_ID=your_secret_id
TENCENT_SECRET_KEY=your_secret_key

# 火山引擎（推荐）
VOLCENGINE_KEY=your_key
VOLCENGINE_MODEL=doubao-seed-2-0-lite-260215

# 或 OpenRouter
OPENROUTER_API_KEY=your_key
```

### 启动后端

```bash
cd /opt/lawflow/backend
pm2 start ecosystem.config.js --env production
```

### 启动前端（生产环境）

```bash
cd /opt/lawflow
npm run build
npx next start -p 3456
```

## API

### POST /api/upload
上传文件，返回 file_id

### POST /api/ocr
```
Body: { file_id }
返回: { success, text, chars }
```

### POST /api/analyze
```
Body: { text: "OCR识别文本" }
返回: { success, info: {案号, 案由, 原告, 被告, 判决法院, 判决日期, 判决结果, 上诉期限, 上诉法院}, partial, missing_fields }
```

### POST /api/generate-appeal
```
Body: { info: {...}, ocr_text: "..." }
返回: { success, appeal: "诉状内容" }
```

### POST /api/generate-appeal-stream
流式版本，返回 Server-Sent Events

## 版本

- v1.2.0 (2026-04-05)：修复 OCR 全流程，AI 提取稳定化，日期格式修复
- v1.1.0 (2026-04-04)：支持流式输出诉状生成
- v1.0.0 (2026-04-03)：初始版本
