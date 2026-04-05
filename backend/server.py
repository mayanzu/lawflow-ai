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
    env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "/opt/lawflow/.env")
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
    env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "/opt/lawflow/.env")
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

# 上传文件清理：7天过期 或 超过20个文件 或 总量>1GB
_last_cleanup = 0.0
_CLEANUP_INTERVAL = 3600  # 每1小时清理一次

def _cleanup_old_uploads():
    global _last_cleanup
    now = time.time()
    if now - _last_cleanup < _CLEANUP_INTERVAL:
        return  # 距离上次清理不到1小时，跳过
    _last_cleanup = now
    try:
        cutoff = time.time() - 7 * 86400
        files = []
        total_size = 0
        for f in os.listdir(UPLOAD_DIR):
            p = os.path.join(UPLOAD_DIR, f)
            if os.path.isfile(p):
                stat = os.stat(p)
                total_size += stat.st_size
                files.append((p, stat.st_mtime))
        
        # 1. 删除7天前的文件
        files.sort(key=lambda x: x[1], reverse=True)
        for p, mtime in files:
            if mtime < cutoff:
                os.remove(p)
        
        # 2. 只保留最近20个文件
        files = sorted(files, key=lambda x: x[1], reverse=True)
        if len(files) > 20:
            for p, _ in files[20:]:
                if os.path.exists(p):
                    os.remove(p)
        
        # 3. 总量超过1GB时删除最旧文件
        remaining = [p for p, _ in sorted(files[:20], key=lambda x: x[1], reverse=True) if os.path.exists(p)]
        total = sum(os.path.getsize(p) for p in remaining if os.path.exists(p))
        files = sorted(files[:20], key=lambda x: x[1])  # oldest first
        while total > 1024*1024*1024 and files:
            old_p = files.pop(0)[0]
            if os.path.exists(old_p):
                total -= os.path.getsize(old_p)
                os.remove(old_p)
    except Exception as e:
        print(f"[Cleanup error] {e}", flush=True)

# 启动时立即清理一次
_cleanup_old_uploads()

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
    1. 腾讯云 OCR 优先（每页转图片逐页识别）
    2. pdfplumber 提取文字（纯文本PDF兜底）
    3. 本地 RapidOCR 逐页兜底"""
    import gc
    import base64
    import fitz

    doc = fitz.open(path)
    total_pages = min(len(doc), 30)
    MATRIX = fitz.Matrix(1.2, 1.2)

    # Step 1: pdfplumber 先试（纯文本PDF秒级返回）
    try:
        import pdfplumber
        pdf_text = []
        with pdfplumber.open(path) as pdf:
            for pg in pdf.pages:
                t = pg.extract_text()
                if t and len(t.strip()) > 10:
                    pdf_text.append(t)
        if pdf_text:
            doc.close()
            return "\n".join(pdf_text)
    except Exception as e:
        print(f"  pdfplumber failed: {e}", flush=True)

    # Step 2: 扫描件 -> 每页优先腾讯云OCR，失败 fallback RapidOCR
    ocr_local = _get_ocr_img()
    tencent_failed = False
    
    try:
        import fitz
        # 降低DPI: 1.2x = ~960px宽(A4)，OCR足够
        MATRIX = fitz.Matrix(1.2, 1.2)
        
        doc = fitz.open(path)
        total_pages = min(len(doc), 30)
        all_text = []

        for pg in range(total_pages):
            pix = doc[pg].get_pixmap(matrix=MATRIX)
            tmp = tempfile.mktemp(suffix=".png")
            try:
                pix.save(tmp)
                del pix; pix = None
                
                # 1. 腾讯云 OCR 优先（高精度）
                page_text = None
                if USE_TENCENT_OCR:
                    try:
                        with open(tmp, 'rb') as f:
                            img_b64 = base64.b64encode(f.read()).decode('utf-8')
                        tencent_result = _tencent_ocr_base64(img_b64)
                        if tencent_result and len(tencent_result) > 50:
                            page_text = tencent_result
                            print(f"  Page {pg+1}: Tencent OCR {len(tencent_result)} chars", flush=True)
                    except Exception as e:
                        print(f"  Page {pg+1}: Tencent OCR fallback: {e}", flush=True)
                
                # 2. Fallback 本地 RapidOCR
                if not page_text and ocr_local:
                    try:
                        result = ocr_local(tmp)
                        if result and hasattr(result, 'txts'):
                            texts = [t for t in result.txts if t and t.strip()]
                            if texts:
                                page_text = "\n".join(texts)
                                print(f"  Page {pg+1}: Local OCR {len(page_text)} chars", flush=True)
                    except Exception as e:
                        print(f"  Page {pg+1}: Local OCR error: {e}", flush=True)
                
                if page_text:
                    all_text.append(page_text)
            except Exception as e:
                print(f"[OCR page {pg}] {e}", flush=True)
            finally:
                if os.path.exists(tmp):
                    os.remove(tmp)
                gc.collect()

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
        _cleanup_old_uploads()  # 每1小时执行一次
        ct = self.headers.get("Content-Type", "")
        if "multipart/form-data" in ct:
            n = int(self.headers.get("Content-Length", 0))
            if n > 50 * 1024 * 1024:  # 单文件上限50MB
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
            elif p == "/validate-appeal":
                res = self._validate_appeal(body.get("appeal_text", ""), body.get("info", {}))
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
        text_chunk = txt  # 发送完整OCR文本，不截断

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
8. 上诉期限 - 数字(默认15)
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

        # 检查实际提取到的有效字段（排除"未提取"等占位符）
        valid_fields = {}
        empty_placeholders = ("","无","未提取","null","undefined","错误")
        for f in REQUIRED_FIELDS:
            v = info.get(f, "")
            if v and str(v).strip() not in empty_placeholders:
                valid_fields[f] = str(v).strip()

        missing = [f for f in REQUIRED_FIELDS if f not in valid_fields]
        all_missing = len(valid_fields) == 0
        print(f"[analyze] valid={list(valid_fields.keys())}, missing={missing}", flush=True)

        # 全部字段都未提取到 -> 返回失败，让用户手动填写
        if all_missing:
            return {"success": False, "error": "未能从判决书中提取到有效信息，请手动填写", "partial": False}

        # 部分字段提取到 -> 返回已提取的，允许前端编辑补充
        result_info = {f: valid_fields.get(f, "") for f in REQUIRED_FIELDS}
        return {"success": True, "info": result_info, "partial": True, "missing_fields": missing}


    def _generate_stream(self, body):
        import re, threading, time
        info = body.get("info", {})
        ocr_text = body.get("ocr_text", "")
        firm = "安徽国恒律师事务所"
        attorney = "赵光辉"
        stream_done = threading.Event()
        stream_timed_out = False

        # 使用与 _generate 相同的强化 prompt
        # 从OCR原文直接提取当事人姓名
        import re
        def _get_party(ocr, info, key):
            v = info.get(key) or ""
            if v and v not in ("", "未提取", "（信息不详）"):
                return v
            for pat in [
                r"上诉人[（(]原审原告[）)][：:]*\s*([^\n\r\s,，,。]+)",
                r"上诉人[：:]\s*([^\n\r\s,，,。]+)",
                r"原告[：:]\s*([^\n\r\s,，,。]+)",
            ]:
                m = re.search(pat, ocr)
                if m and len(m.group(1).strip()) >= 2:
                    return m.group(1).strip()
            return "（信息不详）"
        plaintiff = _get_party(ocr_text, info, "原告") or _get_party(ocr_text, info, "上诉人") or "（信息不详）"
        defendant = _get_party(ocr_text, info, "被告") or _get_party(ocr_text, info, "被上诉人") or "（信息不详）"

        prompt = f'''你是安徽国恒律师事务所的资深诉讼律师赵光辉。任务是撰写一份完整的、可直接提交法院的民事上诉状。

## 绝对禁止
- Markdown符号：** ## --- ``` ``
- 前言：如"根据..."、"以下是..."
- 后缀：如"使用提示"、"注意事项"
- emoji、占位符：XXX、[姓名]、（此处填写...）

## 7个必须包含的部分

【1 标题】民事上诉状（单独一行）

【2 当事人】
上诉人（原审原告/原审被告）：{plaintiff}
被上诉人（原审被告/原审原告）：{defendant}

【3 上诉请求】2-3项，每项独立成段，如：
一、撤销[原审法院][案号]判决第X项
二、改判[具体内容]
三、[其他诉求]

【4 事实与理由】分3段以上，每段：事实→法律依据→结论
引用法律条文要写全称和具体条号，如《民事诉讼法》第170条

【5 结尾】
此致
[上诉法院全称]

【6 上诉人署名】
上诉人：{plaintiff}
[年]年[月]月[日]日

【7 委托代理人】
委托代理人：赵光辉
安徽国恒律师事务所律师

## 案件信息（部分字段可能为空，请以下方判决书原文为准）
{json.dumps(info, ensure_ascii=False, indent=2)}

## 判决书原文（上诉人、被上诉人姓名必须从此处提取，禁止用占位符）
{ocr_text}

【重要】从判决书原文中查找：
- "上诉人（原审原告/原审被告）："后面的人名
- "被上诉人（原审被告/原审原告）："后面的人名
- 禁止写 XXX、XX、[姓名] 等占位符，必须填入真实人名
{json.dumps(info, ensure_ascii=False, indent=2)}

## 判决书原文（当事人名称必须从判决书中提取）
{ocr_text}

【重要】上诉人、被上诉人的真实姓名必须从上面的判决书原文中查找并填入。绝对不要写 XXX 、XX 、[姓名] 等占位符。
{ocr_text}

输出：从"民事上诉状"到"安徽国恒律师事务所律师"，不要任何说明文字。'''

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

            # 兜底：校验发现 error 则重新生成（最多3次）
            for attempt in range(3):
                validation = self._validate_appeal(cleaned, info)
                if validation.get("overall") != "error":
                    break
                errors = [r for r in validation["results"] if r["status"] == "error"]
                if not errors:
                    break
                xxx_errors = [e for e in errors if "占位符" in e["check"] or "XXX" in str(e["msg"])]
                if attempt > 0 and xxx_errors:
                    print(f"[generate-stream] attempt {attempt+1}: XXX placeholder persists, breaking", flush=True)
                    break
                errors_text = "\n".join(["- " + e["check"] + "：" + e["msg"] for e in errors])
                print(f"[generate-stream] attempt {attempt+1} errors, regenerating...", flush=True)
                retry_prompt = f'''上一次的诉状存在以下问题，请重新撰写：
{errors_text}

【重要】禁止写XXX、XX、[姓名]等占位符。如果找不到姓名，写"（信息不详）"。

判决书原文：
{ocr_text}

输出：从"民事上诉状"到"安徽国恒律师事务所律师"，只输出正文，禁止任何占位符。'''
                full_text = []
                def on_retry(chunk):
                    if stream_timed_out: return
                    full_text.append(chunk)
                    try:
                        send_sse({"type": "chunk", "content": chunk})
                    except Exception:
                        pass
                _call_ai_stream(retry_prompt, retries=2, callback=on_retry)
                cleaned = self._clean_appeal_text("".join(full_text), info)

            # 最终兜底：替换残留占位符
            import re as _re
            _p = info.get("原告") or info.get("上诉人") or "（信息不详）"
            _d = info.get("被告") or info.get("被上诉人") or "（信息不详）"
            for _old, _new in [("XXX", _p), ("XX", _d), ("[上诉人]", _p), ("[被上诉人]", _d), ("[姓名]", _p)]:
                if _old in cleaned:
                    cleaned = cleaned.replace(_old, _new)
            cleaned = _re.sub(r"\[.*?\]", "（信息不详）", cleaned)
            cleaned = _re.sub(r"X{2,}", _p, cleaned)

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

        prompt = f'''你是安徽国恒律师事务所的资深诉讼律师{attorney}。你的任务是撰写一份完整的、可直接提交法院的民事上诉状。

## 绝对禁止（违反任何一条文书直接报废）
- 禁止任何Markdown符号：** ## --- ```` ```
- 禁止任何前言：如"根据..."、"以下是..."、"现将..."
- 禁止任何后缀提示：如"使用提示"、"注意事项"、"注："
- 禁止emoji符号
- 禁止占位符：XXX、XX、[姓名]、[日期] 等必须填入真实内容
- 禁止空白段落或"（此处填写...）"类占位说明

## 必须包含的全部内容（共7个部分，缺一不可）

【第一部分：标题】
民事上诉状
（单独一行，无其他内容）

【第二部分：当事人信息】
上诉人（原审原告/原审被告）：{plaintiff}，……（身份证号等身份信息）
被上诉人（原审被告/原审原告）：{defendant}，……
（注意：如果判决书没有提供某方详细身份信息，只写姓名也可，但格式必须正确）

【第三部分：上诉请求】（必须列明2-3项，每项独立成段）
一、撤销[原审法院名称]（[案号]民事判决第X项，改判为……
二、改判[具体改判内容，如：上诉人无需承担XX责任]
三、[其他具体诉求]

【第四部分：事实与理由】（分3段以上，每段结构为：事实陈述→法律依据→结论）
一、[具体事实1，根据判决书原审查明的事实]
    法律依据：《中华人民共和国民事诉讼法》第X条……
    结论：……

二、[具体事实2，涉及程序违法或事实认定错误]
    法律依据：《最高人民法院关于适用〈中华人民共和国民事诉讼法〉的解释》第X条……
    结论：……

三、[具体事实3，新证据或法律适用错误]
    法律依据：《中华人民共和国[相关法律]》第X条……
    结论：……

【第五部分：此致敬礼】
此致
[上诉法院全称，如：XX市中级人民法院]

【第六部分：上诉人署名】
上诉人：{plaintiff}（自然人签字）
（如果是单位上诉）：上诉人：[单位全称]（加盖公章）
[年]年[月]月[日]日

【第七部分：委托代理人】
委托代理人：赵光辉
安徽国恒律师事务所律师

## 案件信息（用于上诉法院、案号等；当事人姓名请从下方判决书原文中提取）
{json.dumps(info, ensure_ascii=False, indent=2)}

## 判决书原文（参考提取事实与理由）
{ocr_text}

输出要求：严格按上述7个部分的格式输出，不要删减任何部分，不要添加任何说明性文字。
从"民事上诉状"开始，到"安徽国恒律师事务所律师"结束。'''

        def extract_parties_from_ocr(ocr, info):
            import re
            plaintiff = info.get("原告") or info.get("上诉人") or ""
            defendant = info.get("被告") or info.get("被上诉人") or ""
            if not plaintiff or plaintiff in ("", "未提取", "（信息不详）"):
                for pat in [
                    r"上诉人[（(]原审原告[）)][：:]*\s*([^\n\r\s,，,。]+)",
                    r"上诉人[：:]\s*([^\n\r\s,，,。]+)",
                    r"原告[：:]\s*([^\n\r\s,，,。]+)",
                ]:
                    m = re.search(pat, ocr)
                    if m and len(m.group(1).strip()) >= 2:
                        plaintiff = m.group(1).strip()
                        break
            if not defendant or defendant in ("", "未提取", "（信息不详）"):
                for pat in [
                    r"被上诉人[（(]原审被告[）)][：:]*\s*([^\n\r\s,，,。]+)",
                    r"被上诉人[：:]\s*([^\n\r\s,，,。]+)",
                    r"被告[：:]\s*([^\n\r\s,，,。]+)",
                ]:
                    m = re.search(pat, ocr)
                    if m and len(m.group(1).strip()) >= 2:
                        defendant = m.group(1).strip()
                        break
            return plaintiff or "（信息不详）", defendant or "（信息不详）"

        plaintiff, defendant = extract_parties_from_ocr(ocr_text, info)
        info_for_prompt = {**info, "原告": plaintiff, "被告": defendant}
        _prompt = prompt.replace(
            "{json.dumps(info, ensure_ascii=False, indent=2)}",
            "{json.dumps(info_for_prompt, ensure_ascii=False, indent=2)}"
        )

        def do_generate():
            text = _call_ai(_prompt, "你是专业法律文书写作AI。上诉状必须使用真实人名，禁止任何占位符（XXX、XX、[姓名]）。只输出正文，不要前言说明。")
            return self._clean_appeal_text(text, info)

        text = do_generate()

        # 兜底：校验发现 error 则重新生成（最多3次）
        for attempt in range(3):
            validation = self._validate_appeal(text, info)
            if validation.get("overall") != "error":
                break
            errors = [r for r in validation["results"] if r["status"] == "error"]
            if not errors:
                break
            xxx_errors = [e for e in errors if "占位符" in e["check"] or "XXX" in str(e["msg"])]
            if attempt > 0 and xxx_errors:
                print(f"[generate] attempt {attempt+1}: XXX placeholder persists, breaking", flush=True)
                break
            errors_text = "\n".join(["- " + e["check"] + "：" + e["msg"] for e in errors])
            print(f"[generate] attempt {attempt+1} errors, regenerating: {errors_text[:200]}", flush=True)
            fix_prompt = f'''上一次的诉状存在以下问题，请重新撰写：
{errors_text}

【重要】禁止写XXX、XX、[姓名]等占位符。如果判决书中确实找不到姓名，写"（信息不详）"，不要留空。

判决书原文：
{ocr_text}

输出：从"民事上诉状"到"安徽国恒律师事务所律师"，只输出正文，禁止任何占位符。'''
            text = _call_ai(fix_prompt, "你是专业法律文书写作AI。上诉状必须使用真实人名，禁止占位符。")
            text = self._clean_appeal_text(text, info)

        # 最终兜底：替换残留的 XXX 等占位符
        import re as _re
        _p = info.get("原告") or info.get("上诉人") or "（信息不详）"
        _d = info.get("被告") or info.get("被上诉人") or "（信息不详）"
        for _old, _new in [("XXX", _p), ("XX", _d), ("[上诉人]", _p), ("[被上诉人]", _d), ("[姓名]", _p)]:
            if _old in text:
                text = text.replace(_old, _new)
        text = _re.sub(r"\[.*?\]", "（信息不详）", text)
        text = _re.sub(r"X{2,}", _p, text)

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


    def _validate_appeal(self, appeal_text, info):
        import re
        results = []
        info = info or {}

        def add(check, status, msg):
            results.append({"check": check, "status": status, "msg": msg})

        # 1. 标题
        if re.search(r"^民事上诉状", appeal_text.strip()):
            add("标题", "ok", "包含标题民事上诉状")
        else:
            add("标题", "error", "缺少标题民事上诉状")

        # 2. 上诉人
        appellant_name = info.get("原告") or info.get("上诉人") or ""
        if re.search(r"上诉人[：:]\s*\S", appeal_text):
            add("上诉人", "ok", "包含上诉人信息")
        else:
            add("上诉人", "error", "缺少上诉人信息（应为：" + appellant_name + "）")

        # 3. 被上诉人
        appellee_name = info.get("被告") or info.get("被上诉人") or ""
        if re.search(r"被上诉人[：:]\s*\S", appeal_text):
            add("被上诉人", "ok", "包含被上诉人信息")
        else:
            add("被上诉人", "warning", "缺少被上诉人信息（应为：" + appellee_name + "）")

        # 4. 上诉请求
        numbered = re.findall(r"^\s*\d+[.、)）](.+?)(?=^\s*\d|\Z)", appeal_text, re.MULTILINE)
        numbered = [r.strip() for r in numbered if len(r.strip()) > 5]
        vague = any(any(v in r for v in ["请求依法", "请求法院", "请求改判"]) for r in numbered)
        if len(numbered) >= 2:
            if vague:
                add("上诉请求", "warning", "找到" + str(len(numbered)) + "项上诉请求，但包含不具体表述，建议改为具体诉求")
            else:
                add("上诉请求", "ok", "包含" + str(len(numbered)) + "项上诉请求")
        elif len(numbered) == 1:
            add("上诉请求", "warning", "上诉请求仅有1项，建议至少列明2项")
        else:
            add("上诉请求", "error", "未找到上诉请求，请明确列出上诉诉求")

        # 5. 法律依据
        reasons = re.search(r"事实与理由[：:](.+?)(?=\n\n|\n此致|$)", appeal_text, re.DOTALL)
        reasons_text = reasons.group(1) if reasons else appeal_text
        refs = re.findall(r"《([^《]+)》第?(\d+)[条节款项]", reasons_text)
        refs_str = "、".join(["《" + r[0] + "》第" + r[1] + "条" for r in refs[:5]])
        if refs:
            add("法律依据", "ok", "引用了" + str(len(refs)) + "处法律依据：" + refs_str)
        else:
            add("法律依据", "error", "事实与理由中未找到法律条文引用，请补充法律依据")

        # 6. 此致敬礼
        if "此致" in appeal_text:
            add("此致敬礼", "ok", "包含此致敬礼格式")
        else:
            add("此致敬礼", "error", "缺少此致敬礼结尾格式")

        # 7. 上诉法院
        expected_court = info.get("上诉法院") or ""
        if expected_court:
            if expected_court in appeal_text:
                add("上诉法院", "ok", "上诉法院为：" + expected_court)
            else:
                add("上诉法院", "error", "上诉法院应为：" + expected_court + "，请核对")

        # 8. 署名
        has_sig = bool(re.search(r"上诉人[：:]\s*\S", appeal_text))
        has_agent = "委托代理人" in appeal_text and "律师" in appeal_text
        if has_sig and has_agent:
            add("署名", "ok", "包含上诉人署名及委托代理人")
        elif has_sig:
            add("署名", "warning", "包含上诉人署名，但缺少委托代理人")
        else:
            add("署名", "error", "缺少上诉人署名和委托代理人")

        # 9. 占位符检查
        placeholders = re.findall(r"[Xx]{2,}|\.{3}|\[.*?\]", appeal_text)
        bad = [p for p in placeholders if p not in ["...", "——", "…"]]
        if bad:
            add("占位符", "error", "发现未填充占位符：" + ", ".join(set(bad[:5])))
        else:
            add("占位符", "ok", "无占位符")

        # 10. 完整性
        cnt = len(appeal_text.replace(" ", "").replace("\n", ""))
        if cnt < 500:
            add("完整性", "error", "诉状仅" + str(cnt) + "字，内容过少，可能生成不完整")
        elif cnt < 800:
            add("完整性", "warning", "诉状" + str(cnt) + "字，建议丰富事实与理由部分")
        else:
            add("完整性", "ok", "诉状" + str(cnt) + "字，内容充实")

        ok_c = sum(1 for r in results if r["status"] == "ok")
        warn_c = sum(1 for r in results if r["status"] == "warning")
        err_c = sum(1 for r in results if r["status"] == "error")
        overall = "ok" if err_c == 0 and warn_c <= 1 else ("warning" if err_c == 0 else "error")
        return {"success": True, "results": results,
                "ok": ok_c, "warnings": warn_c, "errors": err_c,
                "overall": overall}


if __name__ == "__main__":
    model_name = VOLCENGINE_MODEL if AI_PROVIDER == 'volcengine' else OPENROUTER_MODEL
    print(f"AI Backend ({model_name}, provider={AI_PROVIDER}): http://localhost:3457", flush=True)
    ThreadedTCPServer(("0.0.0.0", 3457), Handler).serve_forever()
