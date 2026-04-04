#!/usr/bin/env python3
"""OpenRouter 免费模型基准测试 - 中文法律文书场景"""
import requests, json, time, sys

API_URL = "https://openrouter.ai/api/v1"

# Get API key
with open('/root/.openclaw/agents/main/agent/auth-profiles.json') as f:
    KEY = json.load(f).get('profiles', {}).get('openrouter:default', {}).get('key', '')

def get_free_models():
    """获取所有免费模型列表"""
    resp = requests.get(f'{API_URL}/models', timeout=30)
    models = []
    for m in resp.json().get('data', []):
        cost = m.get('pricing', {})
        # Check if all prices are 0
        if (cost.get('prompt', 1) == 0 and cost.get('completion', 1) == 0) or ':free' in m['id']:
            name = m.get('name', m['id'])
            context = m.get('context_length', 0)
            models.append({'id': m['id'], 'name': name, 'context': context})
    return models

def test_model(model_id, prompt_text, max_tokens=300):
    """测试单个模型"""
    start = time.time()
    first_token = None
    total_chars = 0
    status = "??"
    
    try:
        body = json.dumps({
            "model": model_id,
            "messages": [{"role": "user", "content": prompt_text}],
            "max_tokens": max_tokens,
            "stream": True,
            "temperature": 0.3,
        })
        
        resp = requests.post(f'{API_URL}/chat/completions', 
            data=body.encode(),
            headers={
                'Content-Type': 'application/json',
                'Authorization': f'Bearer {KEY}'
            },
            timeout=60,
            stream=True
        )
        
        if resp.status_code != 200:
            error = resp.json().get('error', {}).get('message', str(resp.status_code))[:60]
            return {'status': 'FAIL', 'time': 0, 'chars': 0, 'chinese_pct': 0, 'output': f'HTTP {resp.status_code}: {error}'}
        
        total_text = ''
        for line in resp.iter_lines():
            if line and line.startswith(b'data: '):
                try:
                    data = json.loads(line[6:])
                    delta = data.get('choices', [{}])[0].get('delta', {}).get('content', '')
                    if first_token is None and delta:
                        first_token = time.time() - start
                    total_text += delta
                    total_chars += len(delta)
                except: pass
        
        elapsed = time.time() - start
        chinese_chars = sum(1 for c in total_text if '\u4e00' <= c <= '\u9fff')
        chinese_pct = (chinese_chars / len(total_text) * 100) if total_text else 0
        
        # Check JSON extraction quality
        has_json = '```' in total_text or '{' in total_text
        
        return {
            'status': 'OK' if total_chars > 50 else 'SHORT',
            'first_token': first_token,
            'time': elapsed,
            'chars': total_chars,
            'chinese_pct': chinese_pct,
            'output': total_text[:200]
        }
        
    except requests.exceptions.Timeout:
        return {'status': 'TIMEOUT', 'time': 60, 'chars': 0, 'chinese_pct': 0, 'output': '超时'}
    except Exception as e:
        return {'status': 'ERROR', 'time': 0, 'chars': 0, 'chinese_pct': 0, 'output': str(e)[:100]}

def main():
    print("="*80)
    print("OpenRouter 免费模型基准测试 - 中文法律文书质量")
    print("="*80)
    
    # Get models
    print("\n📡 获取免费模型列表...")
    models = get_free_models()
    print(f"找到 {len(models)} 个免费模型")
    
    # Filter to reasonable ones (exclude very old or niche models)
    # Test only the most relevant ones
    test_models = [m for m in models if any(kw in m['id'].lower() for kw in 
        ['qwen', 'gemma', 'llama', 'mistral', 'deepseek', 'minimax', 'stepfun', 
         'google', 'meta', 'anthropic', 'openai', 'free'])][:30]
    
    # Also add known models that might be free
    known_free = [
        "google/gemma-3-4b-it:free",
        "google/gemma-3-12b-it:free", 
        "qwen/qwen3.6-plus:free",
        "stepfun/step-3.5-flash:free",
        "minimax/minimax-m2.5:free",
        "meta-llama/llama-3.3-70b-instruct:free",
        "mistralai/mistral-small-3.1-24b-instruct:free",
        "deepseek/deepseek-v3.2-exp:free",
        "openrouter/free",
    ]
    # Add any from known_free that aren't in our list
    for km in known_free:
        if not any(m['id'] == km for m in test_models):
            test_models.append({'id': km, 'name': km, 'context': 0})
    
    print(f"将测试 {len(test_models)} 个模型\n")
    
    # Test prompts
    prompts = [
        ("JSON提取", "请从以下判决书中提取关键信息并返回JSON格式：\n\n安徽省合肥高新技术产业开发区人民法院\n民事判决书\n（2025）皖0191民初8324号\n原告：徐州市威宝物资贸易有限公司\n被告：安徽成威消防科技有限公司\n案件为买卖合同纠纷，法院判决被告在30日内支付货款50万元及违约金。"),
        ("法律文书", "请根据以下信息写一份简短的民事上诉状（约200字）：\n原告张三诉被告李四借款纠纷，案号(2025)皖0101民初1234号，合肥市中级人民法院判决驳回原告诉求，原告不服。"),
    ]
    
    results = []
    
    for model in test_models:
        model_id = model['id']
        print(f"\n{'─'*70}")
        print(f"测试: {model_id}")
        print(f"{'─'*70}")
        
        model_results = {}
        for prompt_name, prompt_text in prompts:
            print(f"  ⏳ {prompt_name}...", end=' ', flush=True)
            result = test_model(model_id, prompt_text)
            model_results[prompt_name] = result
            
            status = result['status']
            if status == 'OK':
                print(f"✅ {result['time']:.1f}s | {result['chars']}字 | 中文{result['chinese_pct']:.0f}%")
            elif status == 'FAIL':
                print(f"❌ {result['output']}")
            else:
                print(f"⚠️ {status}")
        
        results.append({
            'model': model_id,
            'context': model.get('context', 0),
            'results': model_results
        })
    
    # ========== 排名报告 ==========
    print("\n" + "="*80)
    print("🏆 综合排名")
    print("="*80)
    
    # Score models by: speed (lower is better) + quality (higher Chinese % is better)
    scored = []
    for r in results:
        json_res = r['results'].get('JSON提取', {})
        legal_res = r['results'].get('法律文书', {})
        
        if json_res.get('status') != 'OK' or legal_res.get('status') != 'OK':
            continue
            
        avg_time = (json_res.get('time', 999) + legal_res.get('time', 999)) / 2
        avg_cn = (json_res.get('chinese_pct', 0) + legal_res.get('chinese_pct', 0)) / 2
        
        # Score: lower time is better, higher chinese% is better
        # Normalize: time score (0-100), quality score (0-100)
        time_score = max(0, 100 - avg_time * 2)  # 50s = 0, 0s = 100
        quality_score = avg_cn  # Direct percentage
        
        total_score = time_score * 0.4 + quality_score * 0.6
        
        scored.append({
            'model': r['model'],
            'avg_time': avg_time,
            'avg_cn': avg_cn,
            'json_chars': json_res.get('chars', 0),
            'legal_chars': legal_res.get('chars', 0),
            'json_preview': json_res.get('output', '')[:80],
            'total_score': total_score
        })
    
    scored.sort(key=lambda x: x['total_score'], reverse=True)
    
    for i, s in enumerate(scored, 1):
        print(f"\n{i}. {s['model']}")
        print(f"   总分: {s['total_score']:.0f} | 速度: {s['avg_time']:.1f}s | 中文: {s['avg_cn']:.0f}%")
        print(f"   JSON: {s['json_chars']}字 | 文书: {s['legal_chars']}字")
        print(f"   样例: {s['json_preview']}")
    
    if scored:
        best = scored[0]
        print(f"\n{'='*80}")
        print(f"👑 推荐模型: {best['model']}")
        print(f"   总分 {best['total_score']:.0f} | 平均 {best['avg_time']:.1f}s | 中文 {best['avg_cn']:.0f}%")
        print(f"   建议立即切换到这个模型！")
    else:
        print("\n❌ 没有模型通过测试（可能都限流或不可用）")

if __name__ == '__main__':
    main()
