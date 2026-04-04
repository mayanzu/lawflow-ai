"""
诉状助手 - AI 后端服务（qwen 模型）
真实 OCR + AI 分析 + 上诉状生成
"""
import os
os.environ['FLAGS_allocator_strategy'] = 'auto_growth'

import json, sys, time, subprocess, socketserver, threading, shutil, tempfile, gc
from http.server import HTTPServer, BaseHTTPRequestHandler

# 模型配置
OPENROUTER_MODEL = 'google/gemma-3-4b-it:free'
OAUTH_PATH = '/root/.openclaw/agents/main/agent/auth-profiles.json'
if os.path.exists(OAUTH_PATH):
    with open(OAUTH_PATH) as f:
        _auth = json.load(f).get('profiles', {})
    OPENROUTER_KEY = _auth.get('openrouter:default', {}).get('key', '')
else:
    OPENROUTER_KEY = os.environ.get('OPENROUTER_API_KEY', '')

# 火山引擎方舟 (备用，无频率限制)
def _load_env():
    env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "../../.env")
    try:
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    k, v = line.split('=', 1)
                    os.environ[k.strip()] = v.strip()
    except: pass
_load_env()
VOLCENGINE_KEY = os.environ.get('VOLCENGINE_KEY', '2ca8da3c-39f4-42db-a082-74af87001b5e')
VOLCENGINE_MODEL = 'doubao-seed-2-0-lite-260215'
VOLCENGINE_ENDPOINT = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions'
VOLCENGINE_REASONING = 'minimal'  # minimal, low, medium, high
AI_PROVIDER = 'volcengine'  # openrouter 或 volcengine

# ===== 腾讯云 OCR 配置 =====
def _load_tencent_creds():
    env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "../../.env")
    try:
        with open(env_path) as f:
            for line in f:
                if '=' in line:
                    k, v = line.strip().split('=', 1)
                    os.environ[k] = v
    except: pass

_load_tencent_creds()
TENCENT_SECRET_ID = os.environ.get('TENCENT_SECRET_ID', '')
TENCENT_SECRET_KEY = os.environ.get('TENCENT_SECRET_KEY', '')
USE_TENCENT_OCR = bool(TENCENT_SECRET_ID and TENCENT_SECRET_KEY)

def _tencent_ocr_base64(image_base64):
    "调用腾讯云通用印刷体识别接口"
    try:
        from tencentcloud.common import credential
        from tencentcloud.common.exception import tencent_cloud_sdk_exception
        from tencentcloud.ocr.v20181119 import ocr_client, models
        
        cred = credential.Credential(TENCENT_SECRET_ID, TENCENT_SECRET_KEY)
        client = ocr_client.OcrClient(cred, "ap-guangzhou")
        req = models.GeneralBasicOCRRequest()
        req.ImageBase64 = image_base64
        # 识别所有语言（默认中文）
        resp = client.GeneralBasicOCR(req)
        
        lines = []
        for text_item in resp.TextDetections:
            lines.append(text_item.DetectedText)
        return "\n".join(lines)
    except Exception as e:
        print(f"[Tencent OCR error] {e}", flush=True)
        return None  # openrouter 或 volcengine

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

# 上传文件7天自动清理
def _cleanup_old_uploads(days=7):
    try:
        cutoff = time.time() - days * 86400
        for f in os.listdir(UPLOAD_DIR):
            p = os.path.join(UPLOAD_DIR, f)
            if os.path.isfile(p) and os.stat(p).st_mtime < cutoff:
                os.remove(p)
    except Exception:
        pass

# ===== OCR 引擎 =====
_rapidocr_img = None
_rapidocr_lock = threading.Lock()

def _get_ocr_img():
    global _rapidocr_img
    if _rapidocr_img is None:
        with _rapidocr_lock:
            if _rapidocr_img is None:
                try:
                    from rapidocr import RapidOCR
                    _rapidocr_img = RapidOCR()
                except ImportError as e:
                    print(f"[OCR-img] {e}", flush=True)
    return _rapidocr_img

def _preprocess_image_cv2(path):
    """OpenCV 图像预处理：CLAHE + 二值化 + 倾斜校正 + 智能缩放"""
    import numpy as np
    cv2 = __import__('cv2')

    # 1. 读取图片
    img = cv2.imread(path)
    if img is None:
        return None
    
    h, w = img.shape[:2]

    # 2. 灰度化
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # 3. CLAHE 自适应对比度增强（消除阴影 + 增强文字）
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    gray = clahe.apply(gray)

    # 4. 高斯模糊去噪
    gray = cv2.GaussianBlur(gray, (3, 3), 0)

    # 5. 自适应二值化（文字纯黑/背景纯白）
    block_size = max(11, int(h / 100) * 2 + 1)
    if block_size % 2 == 0:
        block_size += 1
    binary = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                    cv2.THRESH_BINARY, block_size, 10)

    # 6. 倾斜校正
    coords = np.column_stack(np.where(binary > 0))
    if len(coords) > 0:
        rect = cv2.minAreaRect(coords)
        angle = rect[-1]
        if angle >= 45:
            angle = -(90 - angle)
        elif angle <= -45:
            angle = abs(90 + angle)
        
        if abs(angle) > 0.5:
            (hc, wc) = binary.shape[:2]
            center = (wc // 2, hc // 2)
            M = cv2.getRotationMatrix2D(center, angle, 1.0)
            binary = cv2.warpAffine(binary, M, (wc, hc),
                                     flags=cv2.INTER_CUBIC,
                                     borderMode=cv2.BORDER_REPLICATE)

    # 7. 智能缩放（确保文字高度适合 OCR 最佳识别范围 24-48px）
    num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(binary, connectivity=8)
    if num_labels > 2:
        heights = stats[1:, cv2.CC_STAT_HEIGHT]
        widths = stats[1:, cv2.CC_STAT_WIDTH]
        mask = (heights > 4) & (heights < h * 0.5) & (widths > 4)
        if mask.any():
            median_h = np.median(heights[mask])
            if median_h > 0:
                target_h = 36
                if median_h < target_h * 0.7:
                    scale = min(target_h / median_h, 3.0)
                    binary = cv2.resize(binary, (0, 0), fx=scale, fy=scale,
                                        interpolation=cv2.INTER_CUBIC)
                elif median_h > target_h * 3:
                    scale = max(target_h / median_h, 0.2)
                    binary = cv2.resize(binary, (0, 0), fx=scale, fy=scale,
                                        interpolation=cv2.INTER_AREA)

    # 限制最大尺寸防止 OOM
    bh, bw = binary.shape[:2]
    max_dim = 3000
    if max(bh, bw) > max_dim:
        scale = max_dim / max(bh, bw)
        binary = cv2.resize(binary, (0, 0), fx=scale, fy=scale,
                            interpolation=cv2.INTER_AREA)

    return binary


def _ocr_image(path):
    """图片 OCR：腾讯云OCR优先，本地RapidOCR兜底"""
    import base64
    # 1. Tencent OCR first (highest accuracy for Chinese documents)
    if USE_TENCENT_OCR:
        try:
            with open(path, 'rb') as f:
                img_data = base64.b64encode(f.read()).decode('utf-8')
            result = _tencent_ocr_base64(img_data)
            if result and len(result) > 50:
                print(f"[Tencent OCR] {len(result)} chars", flush=True)
                return result
        except Exception as e:
            print(f"[Tencent OCR fallback]: {e}", flush=True)
    
    # 2. Fallback: Local RapidOCR with OpenCV preprocessing
    ocr = _get_ocr_img()
    if not ocr:
        return ""
    try:
        import tempfile
        cv2 = __import__('cv2')
        preprocessed = _preprocess_image_cv2(path)
        if preprocessed is not None:
            tmp_cv = tempfile.mktemp(suffix=".png")
            cv2.imwrite(tmp_cv, preprocessed)
            try:
                result = ocr(tmp_cv)
            finally:
                if os.path.exists(tmp_cv):
                    os.remove(tmp_cv)
            if result and hasattr(result, 'txts'):
                texts = [t for t in result.txts if t and t.strip()]
                total = "\n".join(texts)
                if len(total) > 50:
                    return total
        # Direct fallback
        try:
            result2 = ocr(path)
            if result2 and hasattr(result2, 'txts'):
                texts2 = [t for t in result2.txts if t and t.strip()]
                total2 = "\n".join(texts2)
                if len(total2) > 50:
                    return total2
        except Exception:
            pass
    except Exception as e:
        print(f"[OCR-local] {e}", flush=True)
    return ""


def _ocr_pdf(path):
    """PDF OCR:
    1. 先用 pdfplumber 提取文字（纯文本PDF，秒级）
    2. 无文字时，腾讯云OCR优先，本地 RapidOCR 逐页兜底"""
    import gc
    import base64
    # Step 1: Text-based PDF (fast, near-zero memory)
    try:
        import pdfplumber
        parts = []
        with pdfplumber.open(path) as pdf:
            for pg in pdf.pages:
                t = pg.extract_text()
                if t and len(t.strip()) > 10:
                    parts.append(t)
        if parts:
            return "\n".join(parts)
    except Exception as e:
        print(f"[OCR pdfplumber] {e}", flush=True)

    # Step 2: Scanned PDF - fitz + RapidOCR, one page at a time
    ocr = _get_ocr_img()
    if not ocr:
        return ""

    try:
        import fitz
        # 降低DPI: 1.2x = ~960px宽(A4)，OCR足够，内存减半
        MATRIX = fitz.Matrix(1.2, 1.2)
        
        doc = fitz.open(path)
        total_pages = min(len(doc), 30)
        all_text = []

        for pg in range(total_pages):
            # 渲染一页 -> 临时文件 -> OCR -> 立即释放
            pix = None
            tmp = None
            try:
                pix = doc[pg].get_pixmap(matrix=MATRIX)
                tmp = tempfile.mktemp(suffix=".png")
                pix.save(tmp)
                del pix  # 立即释放Pixmap内存
                pix = None

                result = ocr(tmp)
                if result and hasattr(result, 'txts'):
                    texts = [t for t in result.txts if t and t.strip()]
                    if texts:
                        all_text.append("\n".join(texts))
            except Exception as e:
                print(f"[OCR page {pg}] {e}", flush=True)
            finally:
                # 绝对确保临时文件和对象被清理
                if tmp and os.path.exists(tmp):
                    os.remove(tmp)
                if pix is not None:
                    del pix
                gc.collect()

        doc.close()
        del doc
        gc.collect()

        text = "\n".join(all_text)
        if text.strip():
            return text
        print("[OCR-pdf] returned empty", flush=True)
    except Exception as e:
        print(f"[OCR-pdf] {e}", flush=True)

    return ""


# ===== 速率控制 =====
_last_ai_call = 0.0
_ai_call_lock = threading.Lock()

# ===== AI 调用 =====
def _call_ai_stream(prompt, system="", retries=2, callback=None):
    from urllib.request import Request, urlopen
    global _last_ai_call
    with _ai_call_lock:
        elapsed = time.time() - _last_ai_call
        if elapsed < 3.0:
            time.sleep(3.0 - elapsed)
        _last_ai_call = time.time()

    msgs = []
    if system:
        msgs.append({"role": "system", "content": system})
    msgs.append({"role": "user", "content": prompt})
    last_err = ""
    
    for attempt in range(retries + 1):
        if AI_PROVIDER == 'volcengine':
            # 火山方舟 API (openai 兼容格式)
            body_dict = {"model": VOLCENGINE_MODEL, "messages": msgs, "max_tokens": 6144, "temperature": 0.25, "stream": True}
            body_dict["reasoning_effort"] = VOLCENGINE_REASONING
            body = json.dumps(body_dict)
            req = Request(VOLCENGINE_ENDPOINT, data=body.encode(), method="POST")
            req.add_header("Content-Type", "application/json")
            req.add_header("Authorization", f"Bearer {VOLCENGINE_KEY}")
        else:
            # OpenRouter API
            body = json.dumps({"model": OPENROUTER_MODEL, "messages": msgs, "max_tokens": 6144, "temperature": 0.25, "stream": True})
            req = Request("https://openrouter.ai/api/v1/chat/completions", data=body.encode(), method="POST")
            req.add_header("Content-Type", "application/json")
            req.add_header("Authorization", f"Bearer {OPENROUTER_KEY}")
        try:
            resp = urlopen(req, timeout=30)
            buffer = b""
            while True:
                chunk = resp.read(8192)
                if not chunk:
                    if buffer:
                        buf_str = buffer.decode("utf-8", errors="ignore")
                        for line in buf_str.split("\n"):
                            if line.strip().startswith("data: "):
                                data_str = line.strip()[6:]
                                if data_str and data_str != "[DONE]":
                                    try:
                                        data = json.loads(data_str)
                                        delta = data.get("choices", [{}])[0].get("delta", {}).get("content", "")
                                        if delta and callback:
                                            callback(delta)
                                    except json.JSONDecodeError:
                                        pass
                    break
                buffer += chunk
                while b"\n\n" in buffer:
                    event, buffer = buffer.split(b"\n\n", 1)
                    event_str = event.decode("utf-8", errors="ignore")
                    if event_str.startswith("data: "):
                        data_str = event_str[6:].strip()
                        if data_str == "[DONE]":
                            if callback:
                                callback("")
                            return
                        if data_str:
                            try:
                                data = json.loads(data_str)
                                delta = data.get("choices", [{}])[0].get("delta", {}).get("content", "")
                                if delta and callback:
                                    callback(delta)
                            except json.JSONDecodeError:
                                pass
        except Exception as e:
            last_err = str(e)
            if "429" in last_err or "Too Many Requests" in last_err:
                if attempt < retries:
                    wait = (attempt + 1) * 10
                    time.sleep(wait)
                    continue
                last_err = "Rate limited by OpenRouter (please retry later)" 
            if callback:
                callback(f"[AI 调用失败: {last_err}]")
            return
    if callback:
        callback(f"[AI 调用失败: {last_err}]")


def _call_ai(prompt, system="", retries=2):
    chunks = []
    def collect(chunk):
        chunks.append(chunk)
    _call_ai_stream(prompt, system, retries, callback=collect)
    return "".join(chunks)


# ===== HTTP 服务器 =====
class ThreadedHandler(BaseHTTPRequestHandler):
    daemon_threads = True
    timeout = 60
    def log_message(self, *args):
        pass

class ThreadedTCPServer(socketserver.ThreadingMixIn, HTTPServer):
    daemon_threads = True
    allow_reuse_address = True

class Handler(ThreadedHandler):
    pass

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_POST(self):
        _cleanup_old_uploads()
        ct = self.headers.get("Content-Type", "")
        if "multipart/form-data" in ct:
            n = int(self.headers.get("Content-Length", 0))
            if n > 50 * 1024 * 1024:
                self.send_error(413, "Request body too large")
                return
            raw = self.rfile.read(n)
            res = self._upload_file(raw, ct)
        else:
            n = int(self.headers.get("Content-Length", 0))
            if n > 10 * 1024 * 1024:
                self.send_error(413, "Request body too large")
                return
            try:
                body = json.loads(self.rfile.read(n)) if n else {}
            except json.JSONDecodeError as e:
                self.send_error(400, f"Invalid JSON: {e}")
                return
            p = self.path.split("?")[0]
            if p == "/ocr":
                res = self._ocr(body)
            elif p == "/analyze":
                res = self._analyze(body)
            elif p == "/generate-appeal":
                res = self._generate(body)
            elif p == "/generate-appeal-stream":
                self._generate_stream(body)
                return
            elif p == "/upload":
                res = self._upload_json(body)
            else:
                res = {"success": False, "error": "Unknown"}
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(res, ensure_ascii=False).encode())

    def _upload_file(self, raw, ct):
        try:
            bnd = ct.split("boundary=")[1]
            for part in raw.split(b"--" + bnd.encode()):
                if b"filename=" in part:
                    hd = part[:part.find(b"\r\n\r\n")].decode()
                    fd = part[part.find(b"\r\n\r\n")+4:]
                    fd = fd.split(b"\r\n--")[0].split(b"--")[0].rstrip(b"\r\n")
                    fname = "upload"
                    for l in hd.split("\r\n"):
                        if "filename=" in l:
                            fname = l.split("filename=")[1].strip('"')
                    fid = f"file_{int(time.time())}_{os.urandom(3).hex()}"
                    ext = os.path.splitext(fname)[1] or ".pdf"
                    path = os.path.join(UPLOAD_DIR, fid + ext)
                    with open(path, "wb") as f:
                        f.write(fd)
                    return {"success": True, "file_id": fid, "file_path": path, "file_name": fname, "file_size": len(fd)}
        except Exception as e:
            return {"success": False, "error": str(e)}
        return {"success": False, "error": "No file"}

    def _upload_json(self, body):
        import base64
        fd, fn = body.get("file_data",""), body.get("file_name","upload.pdf")
        if fd and "," in fd:
            fb = base64.b64decode(fd.split(",")[1])
            fid = f"file_{int(time.time())}_{os.urandom(3).hex()}"
            ext = os.path.splitext(fn)[1] or ".pdf"
            path = os.path.join(UPLOAD_DIR, fid + ext)
            with open(path, "wb") as f:
                f.write(fb)
            return {"success": True, "file_id": fid, "file_path": path, "file_name": fn}
        return {"success": False, "error": "No file data"}

    def _ocr(self, body):
        path, fid = body.get("file_path",""), body.get("file_id","")
        if not path and not fid:
            return {"success": False, "error": "No file specified"}
        if not path:
            for f in os.listdir(UPLOAD_DIR):
                if f.startswith(fid):
                    path = os.path.join(UPLOAD_DIR, f)
                    break
        if not path:
            return {"success": False, "error": "No file specified"}
        # 安全：限制只能访问 uploads 目录
        real_path = os.path.realpath(path)
        uploads_real = os.path.realpath(UPLOAD_DIR)
        if not real_path.startswith(uploads_real):
            print(f"[SECURITY] Path traversal blocked: {path}", flush=True)
            return {"success": False, "error": "Access denied"}
        if not os.path.exists(path):
            return {"success": False, "error": "File not found"}
        ext = os.path.splitext(path)[1].lower()
        text = ""
        try:
            if ext == ".pdf":
                text = _ocr_pdf(path)
            elif ext in (".png",".jpg",".jpeg",".bmp"):
                text = _ocr_image(path)
            else:
                with open(path, "r", errors="ignore") as f:
                    text = f.read()
        except Exception as e:
            print(f"[OCR route error] {e}", flush=True)
            return {"success": False, "error": f"OCR failed: {e}"}
        if not text or len(text.strip()) < 10:
            return {"success": False, "error": "Could not extract text"}
        return {"success": True, "text": text, "length": len(text)}

    def _analyze(self, body):
        import re
        txt = body.get("text", "")
        if not txt:
            return {"success": False, "error": "No text"}
        text_chunk = txt[:3500]

        REQUIRED_FIELDS = ["案号","案由","原告","被告","判决法院","判决日期","判决结果","上诉期限","上诉法院"]

        def build_prompt(extra=""):
            return f"""请提取以下判决书的9个关键字段，返回JSON：

需要提取的字段（必须都有值）：
1. 案号 - 格式如(2025)皖0406民初3597号
2. 案由 - 案件类型
3. 原告 - 原告全称
4. 被告 - 被告全称
5. 判决法院 - 法院全称
6. 判决日期 - 格式如2025年3月15日
7. 判决结果 - 简要概括判决结果
8. 上期限 - 数字(默认15)
9. 上诉法院 - 上诉至哪个法院

判决书原文片段：
---
{text_chunk}
---

请直接返回JSON（用```json包裹）：
{{"案号":"...","案由":"...","原告":"...","被告":"...","判决法院":"...","判决日期":"...","判决结果":"...","上诉期限":"15","上诉法院":"..."}}"""

        def try_parse(r):
            cl = r.strip()
            if not cl:
                return None, "空响应"
            if cl.startswith("```"):
                lines = cl.split("\n")
                if lines[0].strip().startswith("```"):
                    cl = "\n".join(lines[1:])
                if cl.strip().endswith("```"):
                    cl = cl.strip()[:-3].strip()
            m = re.search(r'```(?:json)?\s*\n([\s\S]*?)\n```', cl, re.DOTALL)
            if m:
                try:
                    return json.loads(m.group(1)), None
                except:
                    pass
            start = cl.find('{')
            if start >= 0:
                depth = 0
                for i in range(start, len(cl)):
                    if cl[i] == '{':
                        depth += 1
                    elif cl[i] == '}':
                        depth -= 1
                    if depth == 0:
                        try:
                            return json.loads(cl[start:i+1]), None
                        except:
                            break
            try:
                return json.loads(cl), None
            except Exception as e:
                return None, str(e)

        prompt = build_prompt()
        r = _call_ai(prompt, system="")
        info, err = try_parse(r)

        if info:
            missing = [f for f in REQUIRED_FIELDS if not info.get(f) or str(info.get(f)).strip() in ("","无","未提取","null","undefined")]
            if not missing:
                return {"success": True, "info": info}
            missing_str = "、".join(missing)
            retry_count = 0
            while missing and retry_count < 2:
                retry_count += 1
                prompt_retry = build_prompt(f"【注意】上次提取缺少以下字段，请从判决书中补充完整：{missing_str}")
                r = _call_ai(prompt_retry, system="")
                info_retry, _ = try_parse(r)
                if info_retry:
                    for f in missing:
                        if info_retry.get(f) and str(info_retry.get(f)).strip() not in ("","无","未提取"):
                            info[f] = info_retry[f]
                    missing = [f for f in missing if not info.get(f) or str(info.get(f)).strip() in ("","无","未提取")]

        if info:
            for f in REQUIRED_FIELDS:
                if not info.get(f) or str(info.get(f)).strip() in ("","无","未提取","null"):
                    info[f] = "未提取"
            return {"success": True, "info": info}

        return {"success": True, "info": {"raw": r if r else ""}}


    def _generate_stream(self, body):
        import re, threading, time
        info = body.get("info", {})
        ocr_text = body.get("ocr_text", "")
        firm = "安徽国恒律师事务所"
        attorney = "赵光辉"
        stream_done = threading.Event()
        stream_timed_out = False

        # 使用与 _generate 相同的强化 prompt
        prompt = f'''你是安徽国恒律师事务所赵光辉律师。请根据以下案件信息撰写民事上诉状。

## 案件信息
{json.dumps(info, ensure_ascii=False, indent=2)}

## 判决书原文
{ocr_text}

## 【格式要求】
必须包含以下部分（按顺序）：
1. 标题：民事上诉状
2. 上诉人/被上诉人信息（从上方案件信息中提取姓名）
3. 上诉请求（2-3项具体请求）
4. 事实与理由（分3点以上，每点含法律依据）
5. 结尾：此致 + 上诉法院全称
6. 署名：上诉人姓名（从案件信息提取）
7. 委托代理人：安徽国恒律师事务所 赵光辉 律师

## 【绝对禁止】
❌ 禁止任何Markdown符号（** # --- ` ```）
❌ 禁止前言说明（"以下是..." "根据..."）
❌ 禁止后缀提示（"如需..." "注意..."）
❌ 禁止emoji
❌ 禁止占位符（"XXX" "..." "年 月 日"）
❌ 禁止省略任何署名

直接输出文书正文，不要任何额外文字。'''

        def send_sse(data_dict):
            try:
                self.wfile.write(f"data: {json.dumps(data_dict, ensure_ascii=False)}\n\n".encode())
                self.wfile.flush()
            except BrokenPipeError:
                raise Exception("客户端已断开连接")
            except Exception as e:
                print(f"[SSE send error] {e}", flush=True, file=sys.stderr)

        def on_chunk(chunk):
            if stream_timed_out:
                return
            full_text.append(chunk)
            try:
                send_sse({"type": "chunk", "content": chunk})
            except Exception:
                pass

        full_text = []
        try:
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Connection", "keep-alive")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()

            def stream_task():
                try:
                    _call_ai_stream(prompt, retries=2, callback=on_chunk)
                finally:
                    stream_done.set()

            t = threading.Thread(target=stream_task)
            t.daemon = True
            t.start()
            if not stream_done.wait(120):
                stream_timed_out = True
                send_sse({"type": "error", "error": "生成超时（120秒）"})
                return

            text_so_far = "".join(full_text)
            # 后处理清理
            cleaned = self._clean_appeal_text(text_so_far, info)
            legal_articles = re.findall(r"《([^《]+)》第?(\d+)[条款项]", cleaned)
            legal_basis = [f"《{m[0]}》第{m[1]}条" for m in legal_articles[:8]]
            send_sse({"type": "done", "appeal": cleaned, "legal_basis": legal_basis})

        except Exception as e:
            try:
                send_sse({"type": "error", "error": str(e)})
            except Exception:
                pass
        finally:
            try:
                self.wfile.close()
            except Exception:
                pass

    def _generate(self, body):
        import re
        info = body.get("info", {})
        ocr_text = body.get("ocr_text", "")
        firm = "安徽国恒律师事务所"
        attorney = "赵光辉"
        if ocr_text:
            idx1 = ocr_text.find(firm)
            idx2 = ocr_text.find(attorney)
            start = max(idx1, idx2) - 200 if max(idx1, idx2) >= 0 else 0
            if start < 0:
                start = 0
            context = ocr_text[start:start+300]
            client_side = "上诉人（原审被告）" if "被告" in context or "被上诉人" not in context else "上诉人（原审原告）"
        else:
            client_side = "上诉人"

        prompt = f'''你是安徽国恒律师事务所的资深诉讼律师{attorney}，专注民商事诉讼二十年。

请根据以下判决书信息，撰写一份完整的、可直接提交人民法院的《民事上诉状》。

## 案件信息
{json.dumps(info, ensure_ascii=False, indent=2)}

## 判决书原文
{ocr_text}

## 写作要求（极其重要，违反任何一条都会导致文书报废）
【禁止事项】
❌ 禁止使用任何Markdown符号（** **、# 号、---等）
❌ 禁止输出任何前言/说明/提示（如"这是一份..."、"使用提示"等）
❌ 禁止输出任何后缀/总结/注释
❌ 禁止使用emoji表情
❌ 禁止使用占位符（如XXX、XX等），当事人名称、金额、日期必须与判决书完全一致

【输出要求】
✅ 直接输出民事上诉状正文，从标题"民事上诉状"开始，到附项结束
✅ 标准法律文书格式，纯文本，不用任何标记符号
✅ 当事人：上诉人为我方客户{firm}委托{attorney}律师代理
✅ 上诉请求列明2-3项
✅ 事实与理由部分至少分三点，每点含具体事实、法律依据（准确引用法律条文号和条文名称）、结论
✅ 结尾格式：
   此致
   [上诉法院全称]
   上诉人：[上诉人全称]
   委托代理人：{firm} {attorney} 律师
   判决日期之日起十五日内提交

只输出文书正文，多一个字都不要。'''

        text = _call_ai(prompt, "你是文书写作AI。不要任何前言后语，直接输出民事上诉状正文纯文本，不含Markdown。")
        
        # 后处理：清理 AI 废话和 Markdown
        text = self._clean_appeal_text(text, info)
        
        import re
        legal_articles = re.findall(r"《([^《]+)》第?(\d+)[条款项]", text)
        legal_basis = [f"《{m[0]}》第{m[1]}条" for m in legal_articles[:8]]
        return {"success": True, "appeal": text, "legal_basis": legal_basis}
    
    def _clean_appeal_text(self, text, info):
        """清理 AI 输出的废话和 Markdown 符号"""
        import re
        
        # 1. 删除开头的废话（AI 常见的"这是一份..."开头）
        # 找到真正的开头（以 民事上诉状 开头）
        title_match = re.search(r'[#= ]*民事上诉状[#= ]*\n', text)
        if title_match:
            text = text[title_match.start():]
        
        # 2. 截断到结尾（删除 AI 的"使用提示"等后缀）
        stop_kwds = ['使用提示', '注意事项', '温馨提示', '注：', '📝', '💡', '请根据', '📄']
        stop_pos = len(text)
        for kw in stop_kwds:
            pos = text.find(kw)
            if pos > 0 and pos < stop_pos:
                # 找到这个位置之前的一段
                stop_pos = pos
        
        # 找到最后一个合理的结尾点（附：之后）
        append_pos = text.find('附：')
        if append_pos > 0 and append_pos < stop_pos:
            # 找到"附："之后的最后一个句号或换行
            end = text.rfind('\n', append_pos, stop_pos)
            if end > append_pos:
                stop_pos = end
        
        text = text[:stop_pos].strip()
        
        # 3. 删除 Markdown 标记
        # 删除 ** ** 加粗标记
        text = re.sub(r'\*\*(.+?)\*\*', r'\1', text)
        # 删除 # 标题标记
        text = re.sub(r'^#{1,6}\s*', '', text, flags=re.MULTILINE)
        # 删除 --- 分割线
        text = re.sub(r'\n---*\n', '\n', text)
        # 删除多余的 > 引用标记
        text = re.sub(r'^>\s*', '', text, flags=re.MULTILINE)
        # 删除多余的 ``` 代码块标记
        text = re.sub(r'```[^`]*```', '', text)
        text = re.sub(r'```', '', text)
        
        # 4. 清理多余空行（保留最多2个连续空行）
        text = re.sub(r'\n{4,}', '\n\n\n', text)
        
        # 5. 确保以"民事上诉状"开头
        text = text.strip()
        if not text.startswith('民事上诉状') and '民事上诉状' in text:
            idx = text.index('民事上诉状')
            text = text[idx:]
        
        # 6. 补充基本格式（如果 AI 没输出完整）
        if not text.startswith('民事上诉状'):
            title = '民事上诉状\n'
            text = title + text
        
        # 7. 补充结尾格式（如果 AI 没输出完整）
        if '附：' not in text and '此致' in text:
            # 找到上诉法院后补充结尾
            pass  # AI 通常已经输出完整
        
        return text

if __name__ == "__main__":
    model_name = VOLCENGINE_MODEL if AI_PROVIDER == 'volcengine' else OPENROUTER_MODEL
    print(f"AI Backend ({model_name}, provider={AI_PROVIDER}): http://localhost:3457", flush=True)
    ThreadedTCPServer(("0.0.0.0", 3457), Handler).serve_forever()
