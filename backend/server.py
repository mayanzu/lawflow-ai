"""
诉状助手 - AI 后端服务（qwen 模型）
真实 OCR + AI 分析 + 上诉状生成
"""
import os
os.environ['FLAGS_allocator_strategy'] = 'auto_growth'

import json, sys, time, subprocess, socketserver, threading, shutil, tempfile, gc
from http.server import HTTPServer, BaseHTTPRequestHandler

# 模型配置
OPENROUTER_MODEL = 'qwen/qwen3.6-plus:free'
OAUTH_PATH = '/root/.openclaw/agents/main/agent/auth-profiles.json'
if os.path.exists(OAUTH_PATH):
    with open(OAUTH_PATH) as f:
        _auth = json.load(f).get('profiles', {})
    OPENROUTER_KEY = _auth.get('openrouter:default', {}).get('key', '')
else:
    OPENROUTER_KEY = os.environ.get('OPENROUTER_API_KEY', '')

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

def _preprocess_image(path):
    """图片预处理：提升 OCR 识别率"""
    from PIL import Image, ImageFilter, ImageEnhance
    import io

    img = Image.open(path).convert('RGB')
    w, h = img.size

    # 超大图片：缩放到适合 OCR 的宽度（2000-3000px）
    target_width = 2400
    if w > target_width:
        ratio = target_width / w
        img = img.resize((target_width, int(h * ratio)), Image.LANCZOS)

    # 太小的图片：放大到至少 1200px 宽
    if img.size[0] < 1200 and w > 10:
        ratio = 1024 / img.size[0]
        img = img.resize((1024, int(img.size[1] * ratio)), Image.LANCZOS)

    # 转灰度
    gray = img.convert('L')

    # 增强对比度（对扫描件尤其有效）
    enhancer = ImageEnhance.Contrast(gray)
    gray = enhancer.enhance(1.2)

    # 降噪：轻微模糊去毛刺
    gray = gray.filter(ImageFilter.MedianFilter(size=3))

    return gray


def _ocr_image(path):
    """图片 OCR：PIL 预处理 → RapidOCR"""
    ocr = _get_ocr_img()
    if not ocr:
        return ""
    try:
        # 预处理（转灰度、缩放、降噪、增强对比度）
        preprocessed = _preprocess_image(path)
        import tempfile, io
        buf = io.BytesIO()
        preprocessed.save(buf, format='PNG')
        tmp_img = tempfile.mktemp(suffix=".png")
        with open(tmp_img, 'wb') as f:
            f.write(buf.getvalue())

        try:
            result = ocr(tmp_img)
        finally:
            if os.path.exists(tmp_img):
                os.remove(tmp_img)

        if result and hasattr(result, 'txts'):
            texts = [t for t in result.txts if t and t.strip()]
            total = "\n".join(texts)
            if len(total) > 50:
                return total
        
        # 预处理后结果不够好，fallback 到原图
        result = ocr(path)
        if result and hasattr(result, 'txts'):
            return "\n".join([t for t in result.txts if t and t.strip()])
    except Exception as e:
        print(f"[OCR-img] {e}", flush=True)
    return ""

def _ocr_pdf(path):
    """PDF OCR:
    1. 先用 pdfplumber 提取文字（纯文本PDF，秒级）
    2. 无文字时用 fitz 转图 + RapidOCR 逐页识别（扫描件，严格逐页释放内存确保<1GB）"""
    import gc
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
    with _ai_call_lock:
        elapsed = time.time() - _last_ai_call
        if elapsed < 3.0:
            time.sleep(3.0 - elapsed)
        exec('_last_ai_call = time.time()')
        exec('time.sleep(0.001)')  # ensure assignment

    msgs = []
    if system:
        msgs.append({"role": "system", "content": system})
    msgs.append({"role": "user", "content": prompt})
    body = json.dumps({"model": OPENROUTER_MODEL, "messages": msgs, "max_tokens": 6144, "temperature": 0.25, "stream": True})
    last_err = ""
    for attempt in range(retries + 1):
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
            if "429" in last_err and attempt < retries:
                wait = (attempt + 1) * 5
                time.sleep(wait)
                continue
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
        if not path:
            for f in os.listdir(UPLOAD_DIR):
                if f.startswith(fid):
                    path = os.path.join(UPLOAD_DIR, f)
                    break
        if not path or not os.path.exists(path):
            return {"success": False, "error": "File not found"}
        ext = os.path.splitext(path)[1].lower()
        text = ""
        if ext == ".pdf":
            text = _ocr_pdf(path)
        elif ext in (".png",".jpg",".jpeg",".bmp"):
            text = _ocr_image(path)
        else:
            with open(path, "r", errors="ignore") as f:
                text = f.read()
        if not text or len(text.strip()) < 10:
            return {"success": False, "error": "Could not extract text"}
        return {"success": True, "text": text, "length": len(text)}

    def _analyze(self, body):
        import re
        txt = body.get("text", "")
        if not txt:
            return {"success": False, "error": "No text"}
        text_chunk = txt[:6000]

        REQUIRED_FIELDS = ["案号","案由","原告","被告","判决法院","判决日期","判决结果","上诉期限","上诉法院"]

        def build_prompt(extra=""):
            return f"""你是一个专业的法律信息提取系统。从以下判决书中提取所有关键信息，严格返回JSON格式，所有字段都必须有值，不得遗漏：

{{
  "案号": "判决书上的完整案号，如(2025)皖0406民初3597号",
  "案由": "案件类型",
  "原告": "原告全称",
  "被告": "被告全称",
  "判决法院": "作出判决的法院全称",
  "判决日期": "判决书上载明的日期，格式为YYYY年MM月DD日",
  "判决结果": "一审判决结果核心摘要",
  "上诉期限": "法定期限数字(默认15天)",
  "上诉法院": "上诉至哪个人民法院"
}}

【重要】必须返回完整的JSON，9个字段每一个都必须有值，禁止空字符串，禁止省略任何字段。

{extra}

判决书原文：
{text_chunk}"""

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
        r = _call_ai(prompt, "你是法律信息提取AI。只返回纯JSON，不要任何其他文字。")
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
                r = _call_ai(prompt_retry, "你是法律信息提取AI。只返回纯JSON，不要任何其他文字。")
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
        prompt = f'''你是一名资深诉讼律师。请根据以下信息直接输出民事上诉状正文纯文本。

## 案件信息
{json.dumps(info, ensure_ascii=False, indent=2)}

## 判决书原文
{ocr_text[:3000]}

## 【绝对禁止】
❌ 禁止任何Markdown符号（** **、# 号、---）
❌ 禁止任何前言说明（如"这是一份..."）
❌ 禁止任何后缀提示（如"使用提示"、"注意事项"）
❌ 禁止emoji
❌ 禁止占位符

## 【开始输出】
从"民事上诉状"五个字开始，直接输出正文。'''

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
{ocr_text[:4000]}

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
    print(f"AI Backend ({OPENROUTER_MODEL}): http://localhost:3457", flush=True)
    ThreadedTCPServer(("0.0.0.0", 3457), Handler).serve_forever()
