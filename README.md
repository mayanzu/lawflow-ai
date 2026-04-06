# LawFlow 诉状助手

上传一审判决书，AI 自动提取案件信息，6 种诉讼文书一键生成。

## 功能

| 功能 | 说明 |
|------|------|
| OCR 识别 | PDF/图片上传，腾讯云 OCR 优先，本地 RapidOCR 兜底 |
| AI 信息提取 | 自动提取案号、当事人、判决法院、日期等关键字段，可直接在界面修正 |
| 6 种文书 | 民事上诉状、民事起诉状、民事答辩状、代理词、执行申请书、保全申请书 |
| 流式生成 | 分段流式输出，实时看到文书内容 |
| 一键导出 | 支持复制、TXT 下载、DOC 下载 |
| 持久化历史 | 服务端保存，换设备不丢失（最多 20 条） |
| 法律依据 | 自动从生成内容中提取引用法条 |

## 支持的文书类型

| 文书 | 适用场景 |
|------|---------|
| 民事上诉状 | 不服一审判决，向二审法院提起上诉 |
| 民事起诉状 | 新案立案，向有管辖权法院提起诉讼 |
| 民事答辩状 | 被诉后，向法院提交书面答辩意见 |
| 代理词 | 庭审结束后，提交代理意见总结 |
| 执行申请书 | 判决生效后，申请强制执行 |
| 保全申请书 | 诉讼前/中，申请财产保全 |

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | Next.js 14 (App Router) |
| 后端 | Python ThreadingTCPServer |
| AI | Doubao Seed（火山引擎）/ OpenRouter |
| OCR | 腾讯云 OCR + RapidOCR 本地兜底 |
| 部署 | PM2 + next start |

## 目录结构

```
lawflow/
├── app/                    # Next.js 前端
│   ├── page.tsx            # 首页（上传 + 功能介绍）
│   ├── flow/page.tsx       # OCR → AI 分析 → 选择文书类型
│   ├── result/page.tsx     # 文书展示 / 复制 / 导出 / 编辑
│   └── history/page.tsx    # 历史记录
├── backend/
│   └── server.py           # Python HTTP 后端（OCR + AI 分析 + 文书生成）
├── prompts/                # 各文书类型 prompt 模板
│   ├── appeal.json          # 民事上诉状
│   ├── complaint.json       # 民事起诉状
│   ├── defense.json         # 民事答辩状
│   ├── representation.json  # 代理词
│   ├── execution.json       # 执行申请书
│   └── preservation.json    # 保全申请书
├── data/                   # 持久化数据（history.json）
├── uploads/                # 上传文件（7 天自动清理）
└── test_system.py          # 自动化测试脚本
```

## 部署

### 环境变量（`.env`）

```bash
# 腾讯云 OCR
TENCENT_SECRET_ID=your_secret_id
TENCENT_SECRET_KEY=your_secret_key

# 火山引擎（AI 生成）
VOLCENGINE_KEY=your_key
VOLCENGINE_MODEL=doubao-seed-2-0-lite-260215
```

### 启动后端

```bash
pm2 restart lawflow-backend
```

### 启动前端

```bash
cd /opt/lawflow
npx next start -p 3456 -H 0.0.0.0
```

## API 端口

| 服务 | 端口 |
|------|------|
| 前端（Next.js） | 3456 |
| 后端（Python） | 3457 |

## 测试

```bash
# 测试所有 6 种文书
python3 test_system.py --skip-upload --file-id <file_id>

# 测试单个文书
python3 test_system.py --skip-upload --file-id <file_id> --doc representation

# 持续监控（每 5 分钟）
bash monitor.sh
```

## 版本

- **v2.0** — Apple Design UI、6 种文书、Prompt 优化、手机端适配
- **v1.3** — 持久化历史、服务端保存
