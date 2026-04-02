"""
诉状助手 - AI 后端服务（qwen 模型）
真实 PaddleOCR + AI 分析 + 上诉状生成
"""
import json, os, sys, time, subprocess
from http.server import HTTPServer, BaseHTTPRequestHandler

# 模型配置
OPENROUTER_MODEL = 'stepfun/step-3.5-flash:free'
OAUTH_PATH = '/root/.openclaw/agents/main/agent/auth-profiles.json'
if os.path.exists(OAUTH_PATH):
    with open(OAUTH_PATH) as f:
        _auth = json.load(f).get('profiles', {})
    OPENROUTER_KEY = _auth.get('openrouter:default', {}).get('key', '')
else:
    OPENROUTER_KEY = os.environ.get('OPENROUTER_API_KEY', '')

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

_paddle_ocr = None
def _get_ocr():
    global _paddle_ocr
    if _paddle_ocr is None:
        from paddleocr import PaddleOCR
        _paddle_ocr = PaddleOCR(use_angle_cls=True, lang='ch', show_log=False)
    return _paddle_ocr

def _call_ai(prompt, system="", retries=2):
    from urllib.request import Request, urlopen
    import time
    msgs = []
    if system: msgs.append({"role": "system", "content": system})
    msgs.append({"role": "user", "content": prompt})
    body = json.dumps({"model": OPENROUTER_MODEL, "messages": msgs, "max_tokens": 6144, "temperature": 0.25})
    last_err = ""
    for attempt in range(retries + 1):
        req = Request("https://openrouter.ai/api/v1/chat/completions", data=body.encode(), method="POST")
        req.add_header("Content-Type", "application/json")
        req.add_header("Authorization", f"Bearer {OPENROUTER_KEY}")
        try:
            resp = urlopen(req, timeout=180)
            data = json.loads(resp.read())
            return data["choices"][0]["message"]["content"]
        except Exception as e:
            last_err = str(e)
            if "429" in last_err and attempt < retries:
                wait = (attempt + 1) * 5
                time.sleep(wait)
                continue
            return f"[AI 调用失败: {last_err}]"
    return f"[AI 调用失败: {last_err}]"

def _ocr_pdf(path):
    import pdfplumber
    import fitz, tempfile
    parts = []
    try:
        with pdfplumber.open(path) as pdf:
            for pg in pdf.pages:
                t = pg.extract_text()
                if t and len(t.strip()) > 10: parts.append(t)
    except: pass
    if parts: return "\n".join(parts)
    ocr = _get_ocr()
    doc, tmpdir = fitz.open(path), tempfile.mkdtemp()
    for i in range(min(len(doc), 30)):
        pix = doc[i].get_pixmap(matrix=fitz.Matrix(2, 2))
        p = os.path.join(tmpdir, f"p{i}.png"); pix.save(p)
        res = ocr.ocr(p, cls=True)
        for line in res:
            if line:
                for w in line: parts.append(w[1][0])
        os.remove(p)
    doc.close()
    return "\n".join(parts)

def _ocr_image(path):
    ocr, parts = _get_ocr(), []
    res = ocr.ocr(path, cls=True)
    for line in res:
        if line:
            for w in line: parts.append(w[1][0])
    return "\n".join(parts)

class Handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_POST(self):
        ct = self.headers.get("Content-Type", "")
        if "multipart/form-data" in ct:
            raw = self.rfile.read(int(self.headers.get("Content-Length", 0)))
            res = self._upload_file(raw, ct)
        else:
            n = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(n)) if n else {}
            p = self.path.split("?")[0]
            if p == "/ocr": res = self._ocr(body)
            elif p == "/analyze": res = self._analyze(body)
            elif p == "/generate-appeal": res = self._generate(body)
            elif p == "/upload": res = self._upload_json(body)
            else: res = {"success": False, "error": "Unknown"}
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
                        if "filename=" in l: fname = l.split("filename=")[1].strip('"')
                    fid = f"file_{int(time.time())}_{os.urandom(3).hex()}"
                    ext = os.path.splitext(fname)[1] or ".pdf"
                    path = os.path.join(UPLOAD_DIR, fid + ext)
                    with open(path, "wb") as f: f.write(fd)
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
            with open(path, "wb") as f: f.write(fb)
            return {"success": True, "file_id": fid, "file_path": path, "file_name": fn}
        return {"success": False, "error": "No file data"}

    def _ocr(self, body):
        path, fid = body.get("file_path",""), body.get("file_id","")
        if not path:
            for f in os.listdir(UPLOAD_DIR):
                if f.startswith(fid): path = os.path.join(UPLOAD_DIR, f); break
        if not path or not os.path.exists(path):
            return {"success": False, "error": "File not found"}
        ext = os.path.splitext(path)[1].lower()
        text = ""
        if ext == ".pdf": text = _ocr_pdf(path)
        elif ext in (".png",".jpg",".jpeg",".bmp"): text = _ocr_image(path)
        else:
            with open(path, "r", errors="ignore") as f: text = f.read()
        if not text or len(text.strip()) < 10:
            return {"success": False, "error": "Could not extract text"}
        return {"success": True, "text": text, "length": len(text)}

    def _analyze(self, body):
        txt = body.get("text", "")
        if not txt: return {"success": False, "error": "No text"}
        prompt = f'''你是一个专业的法律信息提取系统。从以下判决书中提取关键信息，返回纯JSON格式：

{{"案号":"判决书案号","案由":"案由","原告":"原告全称","被告":"被告全称","判决法院":"一审法院全称","判决结果":"一审判决结果的核心内容（1-2句话）","判决日期":"YYYY年MM月DD日或中文数字格式","上诉期限":"几天","上诉法院":"上诉法院全称"}}

判决书原文：
{txt[:3000]}'''
        r = _call_ai(prompt, "你是法律信息提取AI。只返回JSON，不要任何其他文字或解释。")
        try:
            cl = r.strip()
            if cl.startswith("```"): cl = cl.split("\n",1)[-1]
            if cl.endswith("```"): cl = cl[:-3]
            return {"success": True, "info": json.loads(cl.strip())}
        except:
            return {"success": True, "info": {"raw": r}}

    def _generate(self, body):
        info = body.get("info", {})
        ocr_text = body.get("ocr_text", "")
        firm = "安徽国恒律师事务所"
        attorney = "赵光辉"

        # 自动判定立场：从判决书原文中查找安徽国恒律师事务所/赵光辉的位置
        position = "上诉人"
        if ocr_text:
            # 寻找律所/律师名称的上下文，判断是代表原告还是被告
            idx1 = ocr_text.find(firm)
            idx2 = ocr_text.find(attorney)
            start = max(idx1, idx2) - 200 if max(idx1, idx2) >= 0 else 0
            if start < 0: start = 0
            context = ocr_text[start:start+300]
            # 判断：律师在原告段还是被告段
            is_def = "被告" in context and "被告"[:3] not in ["上诉人"]
            if idx1 >= 0 or idx2 >= 0:
                # 如果律所/律师名称在被告段之前出现，说明被告是我们的客户——被告方上诉
                client_side = "上诉人（原审被告）" if "被告" in context or "被上诉人" not in context else "上诉人（原审原告）"
            else:
                client_side = "上诉人"
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
    HTTPServer(("0.0.0.0", 3457), Handler).serve_forever()
