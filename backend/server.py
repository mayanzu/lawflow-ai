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

def _pdf_to_long_image(path, dpi=150):
    import fitz, os, io, tempfile
    from PIL import Image
    doc = fitz.open(path)
    total = min(len(doc), 30)
    pages = []
    max_w = 0
    for pg in range(total):
        mat = fitz.Matrix(dpi/72, dpi/72)
        pix = doc[pg].get_pixmap(matrix=mat)
        buf = pix.tobytes("png")
        img = Image.open(io.BytesIO(buf))
        pages.append(img.convert("RGB"))
        max_w = max(max_w, img.width)
        del pix
    doc.close()
    for i in range(len(pages)):
        if pages[i].width < max_w:
            new = Image.new("RGB", (max_w, pages[i].height), (255, 255, 255))
            new.paste(pages[i], (0, 0))
            pages[i] = new
    total_h = sum(p.height for p in pages)
    result = Image.new("RGB", (max_w, total_h), (255, 255, 255))
    y = 0
    for p in pages:
        result.paste(p, (0, y))
        y += p.height
    tmp = tempfile.mktemp(suffix=".jpg", prefix="lawflow_pdf_")
    result.save(tmp, "JPEG", quality=85)
    for p in pages:
        p.close()
    result.close()
    print(f"[pdf-to-img] merged {total} pages -> {max_w}x{total_h}px", flush=True)
    return tmp

import io


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
    1. pdfplumber 提取文字（纯文本PDF秒级返回）
    2. 合并为长图 -> 腾讯云 OCR 只调用一次（节省API额度）
    3. 腾讯云失败 -> RapidOCR 逐页兜底"""
    import gc

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
            return "\n".join(pdf_text)
    except Exception as e:
        print(f"  pdfplumber failed: {e}", flush=True)

    # Step 2: 合并长图 -> 腾讯云 OCR 一次调用
    if USE_TENCENT_OCR:
        try:
            long_img_path = _pdf_to_long_image(path, dpi=150)
            try:
                with open(long_img_path, 'rb') as f:
                    img_b64 = base64.b64encode(f.read()).decode('utf-8')
                result = _tencent_ocr_base64(img_b64)
                if result and len(result) > 100:
                    print(f"  [long-img] Tencent OCR success: {len(result)} chars", flush=True)
                    os.remove(long_img_path)
                    return result
                else:
                    print(f"  [long-img] Tencent OCR thin result: {len(result) if result else 0} chars, falling back", flush=True)
            finally:
                if os.path.exists(long_img_path):
                    os.remove(long_img_path)
        except Exception as e:
            print(f"  [long-img] failed: {e}", flush=True)

    # Step 3: RapidOCR 逐页兜底（之前用腾讯云的页面处理逻辑）
    ocr_local = _get_ocr_img()
    if not ocr_local:
        return ""
    doc = fitz.open(path)
    total_pages = min(len(doc), 30)
    MATRIX = fitz.Matrix(1.2, 1.2)
    all_text = []
    for pg in range(total_pages):
        try:
            pix = doc[pg].get_pixmap(matrix=MATRIX)
            tmp = tempfile.mktemp(suffix=".png")
            pix.save(tmp)
            del pix
            result = ocr_local(tmp)
            if result and hasattr(result, 'txts'):
                texts = [t for t in result.txts if t and t.strip()]
                if texts:
                    all_text.append("\n".join(texts))
                    print(f"  P{pg+1}: Local OCR {len(texts)} items", flush=True)
            os.remove(tmp)
        except Exception as e:
            print(f"  P{pg+1}: error: {e}", flush=True)
        finally:
            gc.collect()
    doc.close()
    gc.collect()
    return "\n".join(all_text)


