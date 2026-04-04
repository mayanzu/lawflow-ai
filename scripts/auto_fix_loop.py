#!/usr/bin/env python3
"""
LawFlow 自动测试→修复→验证 循环脚本
"""

import requests, json, time, os, sys, threading, subprocess
from datetime import datetime

BASE = 'http://localhost:3456'
BACKEND = 'http://localhost:3457'
PASS, FAIL = '✅', '❌'
PDF_PATH = '/root/project/test/民事判决书徐州威宝安徽成威陈林光（最终定稿）.pdf'
IMG_PATH = '/root/project/test/wenshu.court.gov.cn_website_wenshu_181107ANFZ0BXSK4_index.html_docId=PAToVzfjJQPw84dVabDTbs2YabtrTvZh02jxu4fTPt2duaTo8bVjG2I3IS1ZgB82+ReWgkTx8IDPM_17vU+UrUpYPFWyszoYV9Pp8Cxk0hTEZ8N78XYkcqQG54KNA2rD.png'

def log(msg):
    print(f'[{datetime.now().strftime("%H:%M:%S")}] {msg}')
    sys.stdout.flush()

def restart():
    try: subprocess.run(['fuser','-k','3457/tcp'],capture_output=True,timeout=5)
    except: pass
    time.sleep(2)
    try:
        r = subprocess.run(['pgrep','-f','python3.*server.py'],capture_output=True,text=True)
        if r.returncode==0:
            for p in r.stdout.strip().split('\n'):
                try: os.kill(int(p),9)
                except: pass
    except: pass
    time.sleep(3)
    try:
        subprocess.Popen(['python3','-u','server.py'],
            stdout=open('/tmp/backend.log','w'),stderr=subprocess.STDOUT,
            cwd='/opt/lawflow/backend',start_new_session=True)
    except Exception as e:
        log(f'Start failed: {e}')
    time.sleep(8)
    try:
        r = requests.post(f'{BACKEND}/ocr',json={'file_id':'x'},timeout=5)
        if r.status_code==200: log('Backend OK'); return True
    except: pass
    log('Backend FAIL')
    return False

def run_test():
    results = []
    def t(name,fn):
        try: fn(); results.append((PASS,name))
        except Exception as e: results.append((FAIL,name,str(e)[:200]))

    # 1. Security
    d = requests.post(f'{BACKEND}/ocr',json={'file_path':'/etc/passwd'},timeout=10).json()
    t('路径穿越',lambda:None if not d.get('success') else (_ for _ in ()).throw(AssertionError('VULN')))

    r = requests.post(f'{BACKEND}/ocr',data=b'{}',headers={'Content-Type':'application/json'},timeout=5).json()
    t('空POST',lambda:None if not r.get('success') else (_ for _ in ()).throw(AssertionError('Should fail')))

    # 2. Upload+OCR
    texts = {}
    for label,path,mime,minc in [('PDF',PDF_PATH,'application/pdf',5000),('PNG',IMG_PATH,'image/png',7000)]:
        try:
            with open(path,'rb') as f:
                up = requests.post(f'{BASE}/api/upload',files={'file':(f't.{mime.split("/")[1]}',f,mime)},timeout=30).json()
            assert up.get('success'), 'Upload failed'
            t(f'上传{label}',lambda:None)
            ocr = requests.post(f'{BACKEND}/ocr',json={'file_id':up['file_id'],'file_path':up['file_path']},timeout=300).json()
            assert ocr.get('success'), f'OCR: {ocr.get("error")}'
            assert ocr['length']>=minc, f'{ocr["length"]}<{minc}'
            texts[label] = ocr.get('text','')
            t(f'OCR{label}',lambda:None)
        except Exception as e:
            t(f'上传+OCR{label}',lambda:(_ for _ in ()).throw(e))

    # 3. AI
    for label,text in texts.items():
        if not text: continue
        ana = requests.post(f'{BACKEND}/analyze',json={'text':text},timeout=120).json()
        assert ana.get('success'), f'AI: {ana.get("error")}'
        t(f'AI{label}success',lambda:None)
        info = ana.get('info',{})
        fields = ['案号','案由','原告','被告','判决法院','判决日期','判决结果','上诉期限','上诉法院']
        filled = sum(1 for k in fields if info.get(k) and str(info[k]).strip() not in ('','无','未提取'))
        # 只测图片OCR的AI，因为PDF已经稳定通过
        t(f'AI{label}>=6/9',lambda f=filled:None if f>=6 else (_ for _ in ()).throw(AssertionError(f'{f}/9')))

    # 4. Concurrent
    errs=[]
    def stress():
        try:
            r = requests.post(f'{BACKEND}/ocr',json={'file_id':'fake'},timeout=10)
            if r.status_code!=200: errs.append('err')
        except: errs.append('except')
    ts=[threading.Thread(target=stress) for _ in range(10)]
    for x in ts: x.start()
    for x in ts: x.join()
    t('10并发',lambda:None if not errs else (_ for _ in ()).throw(AssertionError(f'{len(errs)}')))

    # 5. System
    df = subprocess.check_output(['df','-h','/'],text=True)
    for line in df.split('\n'):
        if '/dev/' in line and '%' in line:
            pct = int(line.split()[4].replace('%',''))
            t(f'磁盘{pct}%',lambda p=pct:None if p<95 else (_ for _ in ()).throw(AssertionError(f'{p}%')))
            break
    return results

def main():
    log('🔁 LawFlow 自动测试循环 开始')
    restart()
    for i in range(1,21):
        log(f'--- 第 {i} 轮 ---')
        results = run_test()
        fails = sum(1 for r in results if r[0]==FAIL)
        passes = sum(1 for r in results if r[0]==PASS)
        log(f'结果: {passes} 通过, {fails} 失败')
        for tag,name,*d in results:
            if tag==FAIL: log(f'  {FAIL} {name}: {d[0] if d else ""}')
        if fails==0:
            log('🎉 全部通过!')
            return True
        log(f'⏳ 30s 后下一轮...')
        time.sleep(30)
    log('⚠️ 达到最大迭代')

if __name__=='__main__':
    try: main()
    except Exception as e:
        log(f'ERROR: {e}')
        import traceback; log(traceback.format_exc())
