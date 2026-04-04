#!/usr/bin/env python3
"""
LawFlow 轻量监控脚本
- 快速检查：安全、并发、页面 (每5分钟)
- AI深度检查：OCR+AI分析 (每30分钟，避免429限流)
- 发现故障自动修复 + 重启后端
"""

import requests, time, json, os, sys, subprocess, threading, signal
from datetime import datetime

BASE = 'http://localhost:3456'
BACKEND = 'http://localhost:3457'
PDF_PATH = '/root/project/test/民事判决书徐州威宝安徽成威陈林光（最终定稿）.pdf'
IMG_PATH = '/root/project/test/wenshu.court.gov.cn_website_wenshu_181107ANFZ0BXSK4_index.html_docId=PAToVzfjJQPw84dVabDTbs2YabtrTvZh02jxu4fTPt2duaTo8bVjG2I3IS1ZgB82+ReWgkTx8IDPM_17vU+UrUpYPFWyszoYV9Pp8Cxk0hTEZ8N78XYkcqQG54KNA2rD.png'

LOG_FILE = '/tmp/lawflow_monitor.log'
FAIL_COUNT = 0
MAX_FAILS = 3
AI_CHECK_INTERVAL = 1800  # 30分钟
last_ai_check = 0

def log(msg, level='INFO'):
    ts = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    line = f'[{ts}] [{level}] {msg}'
    print(line)
    with open(LOG_FILE, 'a') as f:
        f.write(line + '\n')

def restart_backend():
    """Kill and restart the backend"""
    log('🔄 重启后端...')
    try: subprocess.run(['fuser', '-k', '3457/tcp'], capture_output=True, timeout=5)
    except: pass
    try:
        r = subprocess.run(['pgrep', '-f', 'python3.*server.py'], capture_output=True, text=True)
        if r.returncode == 0:
            for p in r.stdout.strip().split('\n'):
                try: os.kill(int(p), 9)
                except: pass
    except: pass
    time.sleep(3)
    subprocess.Popen(
        ['python3', '-u', 'server.py'],
        stdout=open('/tmp/backend.log', 'w'), stderr=subprocess.STDOUT,
        cwd='/opt/lawflow/backend', start_new_session=True
    )
    time.sleep(8)
    try:
        r = requests.post(f'{BACKEND}/ocr', json={'file_id': 'x'}, timeout=5)
        if r.status_code == 200:
            log('✅ 后端重启成功')
            return True
    except: pass
    log('❌ 后端重启失败', 'ERROR')
    return False

def check_security():
    """快速安全测试 (无AI调用)"""
    failures = []

    # 1. 路径穿越
    d = requests.post(f'{BACKEND}/ocr', json={'file_path': '/etc/passwd'}, timeout=10).json()
    if d.get('success'): failures.append('路径穿越: VULNERABLE')

    # 2. 空POST body
    r = requests.post(f'{BACKEND}/ocr', data=b'{}', headers={'Content-Type': 'application/json'}, timeout=5)
    d = r.json()
    if d.get('success'): failures.append('空POST body: 应返回错误')

    return failures

def check_concurrent():
    """并发测试 (无AI调用)"""
    errors = 0
    def stress():
        nonlocal errors
        try:
            r = requests.post(f'{BACKEND}/ocr', json={'file_id': 'fake'}, timeout=10)
            if r.status_code != 200: errors += 1
        except: errors += 1

    threads = [threading.Thread(target=stress) for _ in range(10)]
    for t in threads: t.start()
    for t in threads: t.join()
    return errors

def check_pages():
    """页面可访问性"""
    for p in ['/', '/flow', '/confirm', '/result', '/history']:
        try:
            r = requests.get(f'{BASE}{p}', timeout=10)
            if r.status_code != 200: return [f'页面 {p}: HTTP {r.status_code}']
        except Exception as e: return [f'页面 {p}: {e}']
    return []

def check_ai():
    """深度AI检查 (每30分钟)"""
    failures = []
    try:
        with open(IMG_PATH, 'rb') as f:
            up = requests.post(f'{BASE}/api/upload', files={'file': ('t.png', f, 'image/png')}, timeout=30).json()
        if not up.get('success'): failures.append('上传失败'); return failures

        ocr = requests.post(f'{BACKEND}/ocr', json={'file_id': up['file_id'], 'file_path': up['file_path']}, timeout=300).json()
        if not ocr.get('success'): failures.append(f'OCR失败: {ocr.get("error")}'); return failures
        chars = ocr.get('length', 0)
        if chars < 7000: failures.append(f'OCR字数{chars}<7000')

        ana = requests.post(f'{BACKEND}/analyze', json={'text': ocr['text']}, timeout=120).json()
        if not ana.get('success'): failures.append(f'AI失败: {ana.get("error")}'); return failures

        info = ana.get('info', {})
        fields = ['案号','案由','原告','被告','判决法院','判决日期','判决结果','上诉期限','上诉法院']
        filled = sum(1 for k in fields if info.get(k) and str(info[k]).strip() not in ('','无','未提取'))
        if filled < 7: failures.append(f'AI字段{filled}/9<7')
        for k in fields:
            v = info.get(k, '')
            if not v or v.strip() in ('','无','未提取'): failures.append(f'{k}字段为空')

    except Exception as e:
        failures.append(f'AI检查异常: {e}')

    return failures

def check_system():
    """系统健康"""
    issues = []
    df = subprocess.check_output(['df', '-h', '/'], text=True)
    for line in df.split('\n'):
        if '/dev/' in line and '%' in line:
            pct = int(line.split()[4].replace('%',''))
            if pct >= 95: issues.append(f'磁盘 {pct}%')
            break

    with open('/proc/meminfo') as f:
        for line in f:
            if 'MemAvailable' in line:
                avail = int(line.split()[1]) // 1024
                if avail < 300: issues.append(f'内存 {avail}MB')
                break
    return issues

def main():
    global FAIL_COUNT, last_ai_check

    log('=' * 60)
    log('🔍 LawFlow 监控启动')
    log(f'   快速检查: 每5分钟')
    log(f'   AI深度检查: 每30分钟')
    log(f'   自动修复: 最多{MAX_FAILS}次重启')
    log('=' * 60)

    # Initial backend check
    try:
        r = requests.post(f'{BACKEND}/ocr', json={'file_id': 'x'}, timeout=10)
        if r.status_code != 200:
            log('后端异常，重启...')
            restart_backend()
    except:
        log('后端未运行，重启...')
        restart_backend()

    while True:
        try:
            now = time.time()
            issues = []

            # 快速检查 (每次)
            log('--- 快速检查 ---')
            issues.extend(check_security())
            errors = check_concurrent()
            if errors > 0: issues.append(f'并发 {errors}/10 错误')
            issues.extend(check_pages())
            issues.extend(check_system())

            # AI深度检查 (每30分钟)
            if now - last_ai_check >= AI_CHECK_INTERVAL:
                log('--- AI深度检查 ---')
                start = time.time()
                ai_issues = check_ai()
                issues.extend(ai_issues)
                last_ai_check = now
                elapsed = time.time() - start
                if ai_issues:
                    log(f'AI检查发现 {len(ai_issues)} 个问题 ({elapsed:.0f}s)', 'WARN')
                else:
                    log(f'AI检查通过 ({elapsed:.0f}s)')

            # 结果
            if issues:
                FAIL_COUNT += 1
                for issue in issues:
                    log(f'❌ {issue}', 'WARN')
                log(f'连续失败: {FAIL_COUNT}/{MAX_FAILS}')

                if FAIL_COUNT >= MAX_FAILS:
                    log('🔧 自动修复: 重启后端', 'WARN')
                    if restart_backend():
                        FAIL_COUNT = 0
                        log('修复成功')
                    else:
                        log('修复失败，等待下次检查', 'ERROR')
            else:
                FAIL_COUNT = 0
                log('✅ 全部正常')

        except Exception as e:
            log(f'监控异常: {e}', 'ERROR')
            FAIL_COUNT += 1

        # 等待下一轮
        log(f'⏳ 下次检查: 5分钟后')
        time.sleep(300)

if __name__ == '__main__':
    main()
