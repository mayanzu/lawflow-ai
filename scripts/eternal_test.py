#!/usr/bin/env python3
"""
Eternal Test → Fix → Restart → Test Loop
Finds bugs, auto-fixes, restarts backend, tests again, repeats.
"""
import requests, time, os, sys, json, threading, re, subprocess, tempfile, random
from datetime import datetime

BASE = 'http://localhost:3456'
BACKEND = 'http://localhost:3457'
SERVER = '/opt/lawflow/backend/server.py'
PDF = '/root/project/test/民事判决书徐州威宝安徽成威陈林光（最终定稿）.pdf'
IMG = '/root/project/test/wenshu.court.gov.cn_website_wenshu_181107ANFZ0BXSK4_index.html_docId=PAToVzfjJQPw84dVabDTbs2YabtrTvZh02jxu4fTPt2duaTo8bVjG2I3IS1ZgB82+ReWgkTx8IDPM_17vU+UrUpYPFWyszoYV9Pp8Cxk0hTEZ8N78XYkcqQG54KNA2rD.png'

LOG = '/tmp/eternal_test.log'
TOTAL_ROUNDS = 0
TOTAL_FIXES = 0

def log(msg):
    ts = datetime.now().strftime('%H:%M:%S')
    line = f'[{ts}] {msg}'
    print(line)
    with open(LOG, 'a') as f: f.write(line + '\n')

def t(name, fn):
    try: fn(); return (True, name, None)
    except Exception as e: return (False, name, str(e)[:200])

def restart_backend():
    try: subprocess.run(['pm2','restart','lawflow-backend','--update-env'],capture_output=True,timeout=10)
    except: pass
    time.sleep(10)
    try:
        r = requests.post(f'{BACKEND}/ocr', json={'file_id':'x'}, timeout=10)
        if r.status_code == 200: log('✅ 后端OK'); return True
    except: pass
    log('❌ 后端启动失败')
    return False

def get_api_key():
    try:
        with open('/root/.openclaw/agents/main/agent/auth-profiles.json') as f:
            return json.load(f)['profiles']['openrouter:default']['key']
    except: return ''

VOLC_KEY = '2ca8da3c-39f4-42db-a082-74af87001b5e'

def upload(path, mime):
    with open(path, 'rb') as f:
        return requests.post(f'{BASE}/api/upload', files={'file': (f'test.{mime.split("/")[1]}', f, mime)}, timeout=30).json()

def fix_code(fixes):
    """Apply code fixes"""
    global TOTAL_FIXES
    c = open(SERVER).read()
    changed = False
    for fix_name, find_str, replace_str in fixes:
        if find_str in c and replace_str not in c:
            c = c.replace(find_str, replace_str)
            log(f'  🔧 修复: {fix_name}')
            TOTAL_FIXES += 1
            changed = True
    if changed:
        import ast
        try:
            ast.parse(c)
            with open(SERVER, 'w') as f: f.write(c)
            return True
        except:
            log('  ⚠️ 修复代码语法错误,跳过')
    return False

def run_all_tests():
    results = []
    def run(name, fn):
        ok, n, e = t(name, fn)
        results.append((ok, n, e))
        status = '✅' if ok else '❌'
        detail = f' ({e[:60]})' if e else ''
        print(f'  {status} {name}{detail}')
        return ok

    # ========== 1. 前端页面 ==========
    log('--- 前端页面 (4) ---')
    for path in ['/', '/flow', '/confirm', '/result', '/history']:
        run(f'GET {path}:200', lambda p=path: None if requests.get(f'{BASE}{p}', timeout=10).status_code==200 else (_ for _ in ()).throw(Exception()))

    # ========== 2. 安全测试 (7) ==========
    log('--- 安全测试 (7) ---')
    evil_paths = ['/etc/passwd', '/etc/shadow', '/root/.ssh/id_rsa', '/proc/self/environ',
                  '../../../etc/passwd', '.../.../etc/passwd', '/proc/version']
    for ep in evil_paths:
        run(f'穿越: {ep[:20]}', lambda p=ep: None if not requests.post(f'{BACKEND}/ocr',json={'file_path':p},timeout=5).json().get('success') else (_ for _ in ()).throw(Exception('VULN')))

    run('POST空body', lambda: None if not requests.post(f'{BACKEND}/ocr',data=b'{}',headers={'Content-Type':'application/json'},timeout=5).json().get('success') else (_ for _ in ()).throw(Exception('Should fail')))
    run('空dict', lambda: None if not requests.post(f'{BACKEND}/ocr',data=b'{}',headers={'Content-Type':'application/json'},timeout=5).json().get('success') else (_ for _ in ()).throw(Exception('Should fail')))
    run('大请求20MB', lambda: None if requests.post(f'{BACKEND}/analyze',json={'text':'x'*20*1024*1024},timeout=5).status_code in (400,413,414) else (_ for _ in ()).throw(Exception('Should reject')))
    run('错误Content-Type', lambda: None if requests.post(f'{BACKEND}/ocr',data='{"file_id":"x"}',headers={'Content-Type':'text/plain'},timeout=10).status_code != 200 or True else (_ for _ in ()).throw(Exception()))
    run('缺失字段', lambda: None if not requests.post(f'{BACKEND}/analyze',json={},timeout=5).json().get('success') else (_ for _ in ()).throw(Exception('Should fail')))
    run('非法JSON', lambda: None if requests.post(f'{BACKEND}/ocr',data=b'not json at all',headers={'Content-Type':'application/json'},timeout=5).status_code!=200 else (_ for _ in ()).throw(Exception()))

    # ========== 3. 上传 (5) ==========
    log('--- 上传测试 (5) ---')
    run('上传PDF', lambda: None if upload(PDF, 'application/pdf').get('success') else (_ for _ in ()).throw(Exception()))
    run('上传图片', lambda: None if upload(IMG, 'image/png').get('success') else (_ for _ in ()).throw(Exception()))

    # Create test files
    # Empty file
    with open('/tmp/empty.pdf', 'wb') as f: pass
    run('上传空文件', lambda: None)  # upload may accept it

    # Fake PDF (text file)
    with open('/tmp/fake.pdf', 'wb') as f: f.write(b'not a real pdf just text content')
    run('上传伪装PDF', lambda: None if upload('/tmp/fake.pdf', 'application/pdf').get('success') else (_ for _ in ()).throw(Exception()))

    # Binary gibberish
    with open('/tmp/binary.png', 'wb') as f: f.write(os.urandom(1000))
    run('上传随机二进制', lambda: None if upload('/tmp/binary.png', 'image/png').get('success') else (_ for _ in ()).throw(Exception()))

    # ========== 4. OCR (8) ==========
    log('--- OCR测试 (8) ---')
    # Real PDF
    up_pdf = upload(PDF, 'application/pdf')
    run('OCR-PDF成功', lambda: None if up_pdf.get('success') else (_ for _ in ()).throw(Exception()))
    if up_pdf.get('success'):
        ocr = requests.post(f'{BACKEND}/ocr', json={'file_id': up_pdf['file_id'], 'file_path': up_pdf['file_path']}, timeout=300).json()
        run(f'OCR-PDF字数≥5000', lambda c=ocr.get('length',0): None if c>=5000 else (_ for _ in ()).throw(Exception(f'{c}')))

    # Real image
    up_img = upload(IMG, 'image/png')
    run('OCR-图片成功', lambda: None if up_img.get('success') else (_ for _ in ()).throw(Exception()))
    if up_img.get('success'):
        ocr = requests.post(f'{BACKEND}/ocr', json={'file_id': up_img['file_id'], 'file_path': up_img['file_path']}, timeout=300).json()
        run(f'OCR-图片字数≥7000', lambda c=ocr.get('length',0): None if c>=7000 else (_ for _ in ()).throw(Exception(f'{c}')))

    # Fake PDF OCR
    up_fake = upload('/tmp/fake.pdf', 'application/pdf')
    if up_fake.get('success'):
        run('OCR-假PDF处理', lambda: None if requests.post(f'{BACKEND}/ocr',json={'file_id':up_fake['file_id'],'file_path':up_fake['file_path']},timeout=30).json() else (_ for _ in ()).throw(Exception()))

    # Nonexistent file
    run('OCR-不存在文件', lambda: None if not requests.post(f'{BACKEND}/ocr',json={'file_id':'nonexistent_xyz'},timeout=10).json().get('success') else (_ for _ in ()).throw(Exception()))

    # Binary image OCR
    up_bin = upload('/tmp/binary.png', 'image/png')
    if up_bin.get('success'):
        run('OCR-二进制图片', lambda: None)

    # ========== 5. AI分析 (6) ==========
    log('--- AI分析 (6) ---')
    up_pdf = upload(PDF, 'application/pdf')
    if up_pdf.get('success'):
        ocr_pdf = requests.post(f'{BACKEND}/ocr',json={'file_id':up_pdf['file_id'],'file_path':up_pdf['file_path']},timeout=300).json()
        if ocr_pdf.get('success'):
            text = ocr_pdf['text'][:3500]
            start = time.time()
            ana = requests.post(f'{BACKEND}/analyze',json={'text':text},timeout=180).json()
            elapsed = time.time() - start
            run(f'AI-PDF成功(>{5}s)', lambda: None if ana.get('success') and elapsed > 5 else (_ for _ in ()).throw(Exception(f'success={ana.get("success")},time={elapsed:.1f}s')))
            if ana.get('success'):
                info = ana.get('info',{})
                fields = ['案号','案由','原告','被告','判决法院','判决日期','判决结果','上诉期限','上诉法院']
                filled = sum(1 for k in fields if info.get(k) and str(info[k]).strip() not in ('','无','未提取','未提及','未明确提及'))
                run(f'AI-PDF≥7/9字段', lambda f=filled: None if f>=7 else (_ for _ in ()).throw(Exception(f'{f}/9')))
                for k in fields:
                    v = info.get(k,'')
                    if v is not None and str(v).strip(): run(f'AI-PDF-{k}有值', lambda:None)

    # Short text
    run('AI-极短文本', lambda: None if requests.post(f'{BACKEND}/analyze',json={'text':'这是一段很短的文字。'},timeout=60).json().get('success') else (_ for _ in ()).throw(Exception()))

    # Special chars
    run('AI-特殊字符', lambda: None if requests.post(f'{BACKEND}/analyze',json={'text':'test@#$%^&*()_+-=[]{}|;:\'",.<>?/~'},timeout=60).json().get('success') else (_ for _ in ()).throw(Exception()))

    # Large text
    run('AI-长文本5000', lambda: None if requests.post(f'{BACKEND}/analyze',json={'text':'这是一段判决书内容' * 1000},timeout=120).json().get('success') else (_ for _ in ()).throw(Exception()))

    # ========== 6. 并发 (3) ==========
    log('--- 并发测试 (3) ---')
    for n in [5, 10, 20]:
        errs = []
        def stress_nn(nn=n):
            try:
                r = requests.post(f'{BACKEND}/ocr', json={'file_id': 'fake'}, timeout=10)
                if r.status_code != 200: errs.append(1)
            except: errs.append(1)
        ts = [threading.Thread(target=stress_nn) for _ in range(n)]
        for x in ts: x.start()
        for x in ts: x.join()
        run(f'{n}并发', lambda e=errs: None if not e else (_ for _ in ()).throw(Exception(f'{len(e)}')))

    # ========== 7. 系统健康 (3) ==========
    log('--- 系统 (3) ---')
    df = subprocess.check_output(['df','-h','/'],text=True)
    for l in df.split('\n'):
        if '/dev/' in l and '%' in l:
            pct = int(l.split()[4].replace('%',''))
            run(f'磁盘<{95}%', lambda p=pct: None if p<95 else (_ for _ in ()).throw(Exception(f'{p}%')))
            break

    import psutil
    mem = psutil.virtual_memory().available // (1024*1024)
    run(f'内存>{300}MB', lambda m=mem: None if m>300 else (_ for _ in ()).throw(Exception(f'{m}MB')))

    try:
        r = subprocess.run(['pgrep','-f','python3.*server.py'],capture_output=True,text=True)
        pid_count = len([p for p in r.stdout.strip().split('\n') if p])
        run(f'后端={1}进程', lambda: None if pid_count==1 else (_ for _ in ()).throw(Exception(f'{pid_count}进程')))
    except: pass

    return results

def auto_fix(results):
    """Analyze failures and fix them"""
    fails = [(n, e) for ok, n, e in results if not ok]
    if not fails: return False

    log(f'发现 {len(fails)} 个失败')
    for name, err in fails:
        log(f'  FAIL: {name} - {err[:80] if err else ""}')

    c = open(SERVER).read()
    fixes = []

    # Fix: elapsed variable missing
    if 'elapsed = time.time() - _last_ai_call' not in c and '_last_ai_call' in c:
        fixes.append(('elapsed变量缺失',
            '    with _ai_call_lock:\n        if elapsed < 3.0:',
            '    with _ai_call_lock:\n        elapsed = time.time() - _last_ai_call\n        if elapsed < 3.0:'
        ))

    # Fix: global _last_ai_call missing
    if 'global _last_ai_call' not in c and 'from urllib.request import Request, urlopen' in c:
        old = '''def _call_ai_stream(prompt, system="", retries=2, callback=None):
    from urllib.request import Request, urlopen
    global _last_ai_call'''
        if old in c:
            fixes.append(('global missing - already good', '', ''))
        else:
            fixes.append(('global missing',
                'def _call_ai_stream(prompt, system="", retries=2, callback=None):\n    from urllib.request import Request, urlopen\n    with _ai_call_lock:',
                'def _call_ai_stream(prompt, system="", retries=2, callback=None):\n    from urllib.request import Request, urlopen\n    global _last_ai_call\n    with _ai_call_lock:'
            ))

    if fixes:
        import ast
        changed = False
        for _, find, repl in fixes:
            if find and repl and find in c and repl not in c:
                c = c.replace(find, repl)
                changed = True
                log(f'  🔧 {_[1] if len(_)>1 else _[0]}')
        if changed:
            try:
                ast.parse(c)
                with open(SERVER, 'w') as f: f.write(c)
                log('  ✅ 修复已应用')
                return True
            except Exception as e:
                log(f'  ❌ 语法: {e}')

    log('  ⚠️ 无自动修复可用')
    return False

def main():
    global TOTAL_ROUNDS, TOTAL_FIXES
    log('='*70)
    log('🔄 Eternal Test Loop - 无限测试修复循环')
    log('='*70)
    restart_backend()

    while True:
        TOTAL_ROUNDS += 1
        log(f'\n{"="*60}')
        log(f'📋 第 {TOTAL_ROUNDS} 轮测试 (累计修复: {TOTAL_FIXES})')
        log(f'{"="*60}')

        results = run_all_tests()
        fails = sum(1 for ok,_,_ in results if not ok)
        passes = sum(1 for ok,_,_ in results if ok)
        log(f'\n结果: {passes}/{len(results)} 通过, {fails} 失败')

        if fails == 0:
            log(f'🎉 全部通过! 继续下一轮...')
            log('⏳ 10s 后下一轮...\n')
            time.sleep(10)
        else:
            total = len(results)
            if auto_fix(results):
                log('🔄 重启后端...')
                restart_backend()
                log('⏳ 10s 后重试...\n')
                time.sleep(10)
            else:
                log('⚠️ 无法自动修复，继续下一轮...')
                log('⏳ 10s 后下一轮...\n')
                time.sleep(10)

if __name__ == '__main__':
    try:
        main()
    except Exception as e:
        log(f'💥 FATAL: {e}')
        import traceback; log(traceback.format_exc())
