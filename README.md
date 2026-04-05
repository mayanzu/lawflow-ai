# LawFlow 诉状助手

法律文书 OCR 识别 + AI 信息提取 + 诉状生成工具。

## 功能

- **多格式 OCR**：PDF 长图合并后腾讯云 OCR 一次调用，节省 API 额度，本地 RapidOCR 兜底
- **AI 信息提取**：自动提取案号、案由、当事人、判决法院等 9 个关键段（可在流程页直接编辑修正）
- **日期自动计算**：自动计算上诉截止日期
- **流式诉状生成**：一次性输出，格式符合《民事诉讼法》第 165 条法定要求
- **持久化历史**：案件信息保存在服务端，最多保留 20 条，换设备不丢失

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | Next.js 14 (App Router) |
| 后端 | Python (ThreadingTCPServer) |
| AI | Doubao Seed (火山引擎) / OpenRouter |
| OCR | 腾讯云 OCR + RapidOCR |
| 部署 | PM2 + next start |

## 目录结构

```
lawflow/
├── app/                    # Next.js 前端页面
│   ├── page.tsx            # 首页（文件上传）
│   ├── flow/page.tsx       # OCR + AI 提取流程
│   ├── result/page.tsx     # 诉状结果展示
│   └── history/page.tsx    # 历史记录
├── backend/
│   └── server.py           # Python HTTP 后端
├── data/                   # 持久化数据存储
└── uploads/                # 上传文件存储（7天自动清理）
```

## 部署

### 环境变量

```bash
# 腾讯云 OCR
TENCENT_SECRET_ID=your_secret_id
TENCENT_SECRET_KEY=your_secret_key

# 火山引擎
VOLCENGINE_KEY=your_key
VOLCENGINE_MODEL=doubao-seed-2-0-lite-260215
```

### 启动后端

```bash
cd /opt/lawflow
pm2 start ecosystem.config.js
```

### 启动前端（生产环境）

```bash
cd /opt/lawflow
npx next build && npx next start -p 3456
```

## API

| 端点 | 方法 | 说明 |
|------|------|------|
| /api/upload | POST | 上传文件 |
| /api/ocr | POST | OCR 识别 |
| /api/analyze | POST | AI 提取案件信息 |
| /api/generate-appeal-stream | POST | 流式诉状生成 |
| /api/save-history | POST | 保存历史 |
| /api/get-history | POST | 获取历史列表 |
| /api/delete-history | POST | 删除一条历史 |

## 版本

- **v1.3.0** (2026-04-05)：长图 OCR、流式双份 bug、prompt 内置法定格式、持久化历史、复制按钮修复
- **v1.2.0** (2026-04-05)：OCR 全流程修复，AI 提取稳定化，日期格式修复
- **v1.1.0** (2026-04-04)：流式输出诉状生成
- **v1.0.0** (2026-04-03)：初始版本
