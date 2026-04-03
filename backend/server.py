"""
诉状助手 - AI 后端服务（qwen 模型）
真实 OCR + AI 分析 + 上诉状生成
"""
import os
# 禁用 PaddlePaddle 模型联网检查
os.environ['FLAGS_allocator_strategy'] = 'auto_growth'

import json, sys, time, subprocess, socketserver, http.client
import threading
import shutil
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

# ===== OCR 引擎：RapidOCR =====
_rapidocr_img = None
_rapidocr_pdf = None
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

def _get_ocr_pdf():
    global _rapidocr_pdf
    if _rapidocr_pdf is None:
        with _rapidocr_lock:
            if _rapidocr_pdf is None:
                try:
                    from rapidocr_pdf import RapidOCRPDF
                    _rapidocr_pdf = RapidOCRPDF()
                except ImportError as e:
                    print(f"[OCR-pdf] {e}", flush=True)
    return _rapidocr_pdf

def _ocr_image(path):
    """图片 OCR - RapidOCR"""
    ocr = _get_ocr_img()
    if not ocr:
        return ""
    result = ocr(path)
    if result and hasattr(result, 'txts'):
        return "\n".join([t for t in result.txts if t and t.strip()])
    return ""

def _ocr_pdf(path):
    """PDF OCR:
    1. 先用 pdfplumber 提取文字（纯文本PDF）
    2. 无文字时用 fitz 转图 + RapidOCR 识别（扫描件）"""
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
    
    # 扫描件：用 fitz 转图 + RapidOCR
    ocr = _get_ocr_img()
    if not ocr:
        return ""
    
    import fitz, tempfile
    tmpdir = tempfile.mkdtemp()
    doc = fitz.open(path)
    try:
        for i in range(min(len(doc), 30)):
            pix = doc[i].get_pixmap(matrix=fitz.Matrix(1.5, 1.5))
            p = os.path.join(tmpdir, f"p{i}.png")
            pix.save(p)
            try:
                result = ocr(p)
                if result and hasattr(result, 'txts'):
                    page_text = "\n".join([t for t in result.txts if t and t.strip()])
                    if page_text:
                        parts.append(page_text)
            except Exception as e:
                print(f"[PDF OCR page {i}] {e}", flush=True)
            if os.path.exists(p):
                os.remove(p)
    finally:
        doc.close()
        shutil.rmtree(tmpdir)
    return "\n".join(parts)


# ===== 速率控制 =====
_last_ai_call = 0.0
_ai_call_lock = threading.Lock()


# ===== AI 调用 =====
def _call_ai_stream(prompt, system="", retries=2, callback=None):
    from urllib.request import Request, urlopen
    import time
    # 速率控制：3秒冷却
    with _ai_call_lock:
        elapsed = time.time() - _last_ai_call
        if elapsed < 3.0:
            time.sleep(3.0 - elapsed)
        _last_ai_call = time.time()
    
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
    """同步版本，兼容旧代码"""
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

            prompt = f"请根据以下信息生成一份民事上诉状：{json.dumps(info, ensure_ascii=False)}，判决书内容：{ocr_text[:1000]}"

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
            legal_articles = re.findall(r"《([^《]+)》第?(\d+)[条款项]", text_so_far)
            legal_basis = [f"《{m[0]}》第{m[1]}条" for m in legal_articles[:8]]
            send_sse({"type": "done", "appeal": text_so_far, "legal_basis": legal_basis})

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

## 写作要求（极其重要）
1. 当事人：上诉人为我方客户{firm}委托{attorney}律师代理，当事人信息必须填写判决书中的全称，不得使用占位符
2. 格式严格遵循《民事诉讼法》标准民事上诉状格式
3. 上诉请求列明2-3项，如：①依法撤销XX人民法院XX号判决；②依法改判...
4. 事实与理由部分至少分三点，每点含具体事实、法律依据（准确引用法律条文号和条文名称）、结论
5. 结尾格式：
   此致
   [上诉法院全称]
   上诉人：（原告全称）
   委托代理人：{firm} {attorney} 律师
   202X年X月X日
   附：本上诉状副本X份
6. 所有名称、案号、金额、日期必须与判决书完全一致
7. 只输出上诉状正文，无任何解释说明'''

        text = _call_ai(prompt, "直接返回民事上诉状正文，不输出任何额外说明。")
        import re
        legal_articles = re.findall(r"《([^《]+)》第?(\d+)[条款项]", text)
        legal_basis = [f"《{m[0]}》第{m[1]}条" for m in legal_articles[:8]]
        return {"success": True, "appeal": text, "legal_basis": legal_basis}

if __name__ == "__main__":
    print(f"AI Backend ({OPENROUTER_MODEL}): http://localhost:3457", flush=True)
    ThreadedTCPServer(("0.0.0.0", 3457), Handler).serve_forever()
