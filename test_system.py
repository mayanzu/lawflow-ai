#!/usr/bin/env python3
"""
LawFlow 自动化系统测试
测试流程：上传 PDF → OCR → AI分析 → 6种文书生成 → 验证内容
"""
import requests, json, time, sys, os, argparse
from datetime import datetime

BASE_URL = "http://localhost:3457"
FRONTEND = "http://localhost:3456"
TEST_PDF = "/opt/lawflow/uploads/file_1775454490560_3i9t8b.pdf"

DOC_TYPES = [
    "appeal", "complaint", "defense",
    "representation", "execution", "preservation"
]

DOC_NAMES = {
    "appeal": "民事上诉状",
    "complaint": "民事起诉状",
    "defense": "民事答辩状",
    "representation": "代理词",
    "execution": "执行申请书",
    "preservation": "保全申请书",
}

PASS = "\033[92m✓\033[0m"
FAIL = "\033[91m✗\033[0m"
INFO = "\033[94m*\033[0m"
WARN = "\033[93m!\033[0m"

def log(msg, level="info"):
    prefix = {"info": INFO, "pass": PASS, "fail": FAIL, "warn": WARN}.get(level, INFO)
    ts = datetime.now().strftime("%H:%M:%S")
    print(f"[{ts}] {prefix} {msg}")

def api(path, data=None, stream=False, timeout=120):
    url = BASE_URL + path
    try:
        if stream:
            r = requests.post(url, json=data, stream=True, timeout=timeout,
                            headers={"Content-Type": "application/json"})
            return r
        else:
            r = requests.post(url, json=data, timeout=30,
                            headers={"Content-Type": "application/json"})
            return r.json()
    except Exception as e:
        return {"success": False, "error": str(e)}

def upload_pdf(path):
    if not os.path.exists(path):
        log(f"测试文件不存在: {path}", "fail")
        return None
    log(f"上传测试文件: {os.path.basename(path)}")
    with open(path, "rb") as f:
        files = {"file": (os.path.basename(path), f, "application/pdf")}
        r = requests.post(f"{BASE_URL}/upload", files=files, timeout=30)
    data = r.json()
    if data.get("success"):
        log(f"上传成功, file_id={data.get('file_id')}", "pass")
        return data.get("file_id")
    log(f"上传失败: {data}", "fail")
    return None

def ocr_step(file_id):
    log("Step 1: OCR 识别")
    r = api("/ocr", {"file_id": file_id})
    if r.get("success"):
        text = r.get("text", "")
        log(f"OCR 完成, 识别文字 {len(text)} 字", "pass")
        return text
    log(f"OCR 失败: {r.get('error')}", "fail")
    return None

def analyze_step(ocr_text):
    log("Step 2: AI 分析案件信息")
    r = api("/analyze", {"text": ocr_text})
    if r.get("success"):
        info = r.get("info", {})
        missing = r.get("missing_fields", [])
        log(f"分析完成, 提取字段: {list(info.keys())}", "pass")
        if missing:
            log(f"缺少字段: {missing}", "warn")
        return info
    log(f"分析失败: {r.get('error')}", "fail")
    return None

def generate_doc_stream(file_id, info, ocr_text, doc_type):
    log(f"Step 3: 生成文书 [{DOC_NAMES.get(doc_type, doc_type)}]")
    start = time.time()
    r = api(f"/generate-doc-stream",
            {"file_id": file_id, "info": info, "ocr_text": ocr_text, "doc_type": doc_type},
            stream=True, timeout=150)
    
    full_text = ""
    chunk_count = 0
    done = False
    legal_basis = []
    
    try:
        for line in r.iter_lines():
            if not line:
                continue
            line = line.decode("utf-8", errors="replace")
            if line.startswith("data: "):
                try:
                    d = json.loads(line[6:].strip())
                    if d.get("type") == "chunk":
                        full_text += d.get("content", "")
                        chunk_count += 1
                    elif d.get("type") == "done":
                        full_text = d.get("appeal", full_text)
                        legal_basis = d.get("legal_basis", [])
                        done = True
                        break
                    elif d.get("type") == "error":
                        log(f"生成错误: {d.get('error')}", "fail")
                        return None
                except:
                    pass
    except Exception as e:
        log(f"流式读取异常: {e}", "fail")
        return None
    
    elapsed = time.time() - start
    
    if not done:
        log("未收到 done 信号，内容可能不完整", "warn")
    
    return {
        "content": full_text,
        "elapsed": round(elapsed, 1),
        "chunks": chunk_count,
        "legal_basis": legal_basis,
        "length": len(full_text)
    }

def validate_doc(content, doc_type):
    """验证生成的文书内容是否正确"""
    expected_name = DOC_NAMES.get(doc_type, "")
    issues = []
    
    if not content or len(content) < 50:
        issues.append("内容过短或为空")
        return False, issues
    
    # 检查标题 - 代理词特殊（以"尊敬的合议庭"开头，无"代理词"标题）
    if doc_type == "representation":
        if "尊敬的合议庭" not in content[:600] and expected_name not in content[:400]:
            issues.append(f"缺少标准开头（尊敬的合议庭）")
    elif expected_name not in content[:400] and expected_name not in content:
        issues.append(f"标题'{expected_name}'未出现在前400字")
    
    # 检查禁止的内容
    forbidden = ["使用提示", "注意事项", "温馨提示", "请根据", "此处填写"]
    for kw in forbidden:
        if kw in content:
            issues.append(f"包含禁止词: {kw}")
    
    # 检查明显的占位符
    placeholders = ["XXX", "XXXX", "[此处", "（此处"]
    for ph in placeholders:
        if ph in content:
            issues.append(f"包含未替换占位符: {ph}")
    
    # 检查中文字符比例
    chinese = sum(1 for c in content if '\u4e00' <= c <= '\u9fff')
    if len(content) > 100 and chinese / len(content) < 0.5:
        issues.append(f"中文字符比例过低: {chinese}/{len(content)}")
    
    return len(issues) == 0, issues

def run_test(doc_type, file_id, info, ocr_text):
    log(f"\n{'='*50}")
    log(f"测试文书类型: {DOC_NAMES.get(doc_type, doc_type)} ({doc_type})")
    
    result = generate_doc_stream(file_id, info, ocr_text, doc_type)
    if not result:
        return False
    
    log(f"生成完成: {result['length']}字, 耗时{result['elapsed']}s, {result['chunks']}个chunk", "pass")
    
    if result.get("legal_basis"):
        log(f"提取法律依据: {result['legal_basis'][:2]}...", "info")
    
    ok, issues = validate_doc(result["content"], doc_type)
    
    if ok:
        log(f"内容验证通过", "pass")
        # 打印前300字
        preview = result["content"][:300].replace("\n", " ")
        log(f"预览: {preview}...", "info")
    else:
        log(f"内容验证失败: {'; '.join(issues)}", "fail")
        preview = result["content"][:500].replace("\n", " ")
        log(f"问题内容预览: {preview}...", "fail")
    
    return ok

def check_services():
    log("检查服务状态")
    try:
        r = requests.get(f"{BASE_URL}/", timeout=5)
        log(f"Backend: {r.status_code}", "pass")
    except:
        log("Backend: 不可达", "fail")
        return False
    try:
        r = requests.get(f"{FRONTEND}/", timeout=5)
        log(f"Frontend: {r.status_code}", "pass")
    except:
        log("Frontend: 不可达", "fail")
        return False
    return True

def main():
    parser = argparse.ArgumentParser(description="LawFlow 系统测试")
    parser.add_argument("--loop", "-l", type=int, default=1, help="循环次数")
    parser.add_argument("--doc", "-d", type=str, default="", help="只测试单个文书类型")
    parser.add_argument("--skip-upload", action="store_true", help="跳过上传步骤（使用已有file_id）")
    parser.add_argument("--file-id", type=str, default="", help="指定file_id")
    args = parser.parse_args()
    
    log("=" * 60)
    log("LawFlow 自动化系统测试")
    log(f"时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    log("=" * 60)
    
    if not check_services():
        log("服务检查失败，退出", "fail")
        sys.exit(1)
    
    loop = args.loop
    results = {}
    
    for i in range(loop):
        if loop > 1:
            log(f"\n{'#'*60}")
            log(f"第 {i+1}/{loop} 轮测试")
            log(f"{'#'*60}")
        
        # 上传
        if args.skip_upload and args.file_id:
            file_id = args.file_id
            log(f"使用已有file_id: {file_id}", "info")
        else:
            file_id = upload_pdf(TEST_PDF)
            if not file_id:
                sys.exit(1)
        
        # OCR
        ocr_text = ocr_step(file_id)
        if not ocr_text:
            sys.exit(1)
        
        # 分析
        info = analyze_step(ocr_text)
        if not info:
            log("分析失败但继续测试", "warn")
            info = {}
        
        # 选择测试的文书类型
        if args.doc:
            types_to_test = [args.doc]
        else:
            types_to_test = DOC_TYPES
        
        for doc_type in types_to_test:
            ok = run_test(doc_type, file_id, info, ocr_text)
            results[doc_type] = results.get(doc_type, [])
            results[doc_type].append(ok)
            time.sleep(2)
    
    # 汇总报告
    log(f"\n{'='*60}")
    log("测试结果汇总")
    log(f"{'='*60}")
    
    all_pass = True
    for doc_type in DOC_TYPES:
        if args.doc and doc_type != args.doc:
            continue
        runs = results.get(doc_type, [])
        if not runs:
            log(f"{DOC_NAMES.get(doc_type, doc_type)}: 无数据", "warn")
            continue
        pass_count = sum(runs)
        total = len(runs)
        status = "pass" if pass_count == total else ("warn" if pass_count > 0 else "fail")
        log(f"{DOC_NAMES.get(doc_type, doc_type)}: {pass_count}/{total} 通过", status)
        if pass_count < total:
            all_pass = False
    
    log(f"{'='*60}")
    if all_pass:
        log("全部测试通过!", "pass")
        sys.exit(0)
    else:
        log("部分测试失败", "fail")
        sys.exit(1)

if __name__ == "__main__":
    main()
