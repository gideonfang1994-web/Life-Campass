#!/usr/bin/env bash
# 浏览器端 AI 接入链路综合验收：Gemini / OpenAI 兼容 × 流式 / 非流式 + 健壮性 + 降级
set -u
MOCK="http://localhost:8791"

pass=0; fail=0
reset() { curl -s -X POST "$MOCK/__reset" >/dev/null; }
last()  { curl -s "$MOCK/__last"; }
ev()    { agent-browser eval "$1" 2>&1 | tail -1; }

# 断言器：从 stdin 读 mock 记录的 JSON，按 node 表达式判断
assert() {
  local name="$1" expr="$2"
  local verdict
  verdict=$(node -e "
    let s='';
    process.stdin.on('data',d=>s+=d).on('end',()=>{
      let r={}; try{ r=JSON.parse(s); }catch(e){ console.log('FAIL|invalid json'); return; }
      const sysLen = r.messages && r.messages.length ? r.messages[0].length : (r.systemPreview||'').length;
      const promptLen = r.messages ? r.messages.join('').length : ((r.systemPreview||'').length + (r.userPreview||'').length);
      const ctx = { r, sysLen, promptLen };
      let ok=false; try{ ok = !!($expr); }catch(e){ ok=false; }
      console.log((ok?'PASS':'FAIL')+'|temp='+r.temperature+' stream='+r.stream+' proto='+r.protocol+' sysLen='+sysLen+' promptLen='+promptLen);
    });
  ")
  if [ "${verdict%%|*}" = "PASS" ]; then
    echo "✅ $name —— ${verdict#*|}"
    pass=$((pass+1))
  else
    echo "❌ $name —— ${verdict#*|}"
    fail=$((fail+1))
  fi
}

# 断言器（响应侧，不走 mock）
# 注意：agent-browser eval 的输出是「JSON 字符串的 JSON 编码」，需要二次解析
assert_res() {
  local name="$1" json="$2" expr="$3"
  local verdict
  verdict=$(printf '%s' "$json" | node -e "
    let s='';
    process.stdin.on('data',d=>s+=d).on('end',()=>{
      let v=s.trim();
      try{ v=JSON.parse(v); }catch(e){}
      let r={};
      try{ r = (typeof v==='string') ? JSON.parse(v) : v; }
      catch(e){ console.log('FAIL|invalid json: '+String(v).slice(0,80)); return; }
      let ok=false; try{ ok = !!($expr); }catch(e){ ok=false; }
      console.log((ok?'PASS':'FAIL')+'|'+JSON.stringify(r).slice(0,160));
    });
  ")
  if [ "${verdict%%|*}" = "PASS" ]; then
    echo "✅ $name —— ${verdict#*|}"
    pass=$((pass+1))
  else
    echo "❌ $name —— ${verdict#*|}"
    fail=$((fail+1))
  fi
}

echo "════════ 1/7 Gemini 原生 · 非流式（analyze-project, T=0.6） ════════"
reset
ev "window.LifeCompassAI.setConfig({provider:'gemini',baseUrl:'$MOCK/v1beta',model:'gemini-3.8-flash',apiKey:'k-gemini',jsonMode:true});" >/dev/null
R=$(ev "(async function(){ const res=await fetch('/api/coach/analyze-project',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project:{title:'测试项目',category:'career',fiveYearVision:'独立开发者'},userLogs:[{date:'2026-10-30',highlight:'写代码',energyLevel:4}]})}); const t=await res.text(); return JSON.stringify({s:res.status,n:t.length}); })()")
assert "gemini-nostream" "r.protocol==='gemini' && r.stream===false && r.temperature===0.6 && promptLen>300" < <(last)
assert_res "  └ 响应非空" "$R" "r.s===200 && r.n>40"

echo "════════ 2/7 Gemini 原生 · 流式（chat, T=0.7） ════════"
reset
R=$(ev "(async function(){ const res=await fetch('/api/coach/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages:[{role:'user',content:'我总拖延怎么办'}],persona:'strategic',context:{projects:[],logs:[]}})}); const ct=res.headers.get('content-type'); const rd=res.body.getReader(); const dec=new TextDecoder(); let buf='',chunks=0,text='',done=false; for(;;){const x=await rd.read(); if(x.done)break; buf+=dec.decode(x.value,{stream:true}); const ps=buf.split('\n\n'); buf=ps.pop()||''; for(const p of ps){const t=p.trim(); if(t.startsWith('data: ')){const ds=t.slice(6); if(ds==='[DONE]'){done=true;continue;} try{const j=JSON.parse(ds); if(j.text){chunks++;text+=j.text;}}catch(e){}}}} return JSON.stringify({s:res.status,ct:ct,chunks:chunks,done:done,len:text.length}); })()")
assert "gemini-stream" "r.protocol==='gemini' && r.stream===true && r.temperature===0.7 && sysLen>100" < <(last)
assert_res "  └ SSE 协议与收尾" "$R" "r.s===200 && r.ct==='text/event-stream' && r.chunks>0 && r.done===true"

echo "════════ 3/7 OpenAI 兼容 · 非流式（autofill, T=0.6, JSON 模式） ════════"
reset
ev "window.LifeCompassAI.setConfig({provider:'openai',baseUrl:'$MOCK/v1',model:'deepseek-v4-flash',apiKey:'sk-test',jsonMode:true});" >/dev/null
R=$(ev "(async function(){ const res=await fetch('/api/ai/autofill',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'daily_log',context:{projects:[{title:'测试项目',progress:40}],recentLogs:[]}})}); const t=await res.text(); return JSON.stringify({s:res.status,n:t.length,hasHighlight:t.indexOf('highlight')>=0}); })()")
assert "openai-nostream" "r.protocol==='openai' && r.stream===false && r.temperature===0.6 && r.responseFormat==='json_object' && promptLen>300" < <(last)
assert_res "  └ 严格 JSON 返回" "$R" "r.s===200 && r.n>40"

echo "════════ 4/7 OpenAI 兼容 · 流式（goal-consultation-chat, T=0.7） ════════"
reset
R=$(ev "(async function(){ const res=await fetch('/api/coach/goal-consultation-chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages:[{role:'user',content:'我想5年做到年入百万'}],context:{}})}); const ct=res.headers.get('content-type'); const rd=res.body.getReader(); const dec=new TextDecoder(); let buf='',chunks=0,text='',done=false; for(;;){const x=await rd.read(); if(x.done)break; buf+=dec.decode(x.value,{stream:true}); const ps=buf.split('\n\n'); buf=ps.pop()||''; for(const p of ps){const t=p.trim(); if(t.startsWith('data: ')){const ds=t.slice(6); if(ds==='[DONE]'){done=true;continue;} try{const j=JSON.parse(ds); if(j.text){chunks++;text+=j.text;}}catch(e){}}}} return JSON.stringify({s:res.status,ct:ct,chunks:chunks,done:done,len:text.length}); })()")
assert "openai-stream" "r.protocol==='openai' && r.stream===true && r.temperature===0.7 && r.messages.length>0 && sysLen>100" < <(last)
assert_res "  └ SSE 协议与收尾" "$R" "r.s===200 && r.ct==='text/event-stream' && r.chunks>0 && r.done===true"

echo "════════ 5/7 健壮性：请求字段缺失不抛错（Proxy 作用域） ════════"
reset
ev "window.LifeCompassAI.setConfig({provider:'gemini',baseUrl:'$MOCK/v1beta',model:'gemini-3.8-flash',apiKey:'k-gemini',jsonMode:true});" >/dev/null
R=$(ev "(async function(){ try{ const res=await fetch('/api/coach/analyze-project',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project:{title:'极简'}})}); const t=await res.text(); return JSON.stringify({s:res.status,n:t.length,err:null}); }catch(e){ return JSON.stringify({s:-1,n:0,err:e.message}); } })()")
assert_res "字段缺失仍返回 200" "$R" "r.s===200 && r.n>20"
assert "  └ prompt 照常渲染（缺失字段→undefined）" "r.protocol==='gemini' && promptLen>300" < <(last)

echo "════════ 6/7 降级：清除配置后回退离线演示 ════════"
ev "window.LifeCompassAI.setConfig(null);" >/dev/null
R=$(ev "(async function(){ const res=await fetch('/api/coach/smart-breakdown',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({goalTitle:'三个月学会吉他',wheelScores:{career:7}})}); const t=await res.text(); return JSON.stringify({s:res.status,n:t.length,head:t.slice(0,60),enabled:window.LifeCompassAI.enabled()}); })()")
assert_res "离线降级可用" "$R" "r.s===200 && r.n>100 && r.enabled===false"

# 回归守卫：OpenAI 兼容协议允许「无 Key」（本地 Ollama / 内网 one-api）。
# 曾经的 bug：getConfig() 只判断 apiKey 不判断 provider，导致保存后被判为未配置，
# 角标仍显示「离线演示」，用户以为配置没生效。此处同时校验启用判定与请求头。
echo "════════ 7/7 无 Key 场景：OpenAI 兼容（Ollama / 内网网关） ════════"
reset
R=$(ev "(function(){ window.LifeCompassAI.setConfig({provider:'openai',baseUrl:'$MOCK/v1',model:'llama3.1',apiKey:'',jsonMode:false}); const c=window.LifeCompassAI.getConfig(); return JSON.stringify({enabled:window.LifeCompassAI.enabled(),hasCfg:!!c,model:c&&c.model}); })()")
assert_res "无 Key 配置被正确识别为已启用" "$R" "r.enabled===true && r.hasCfg===true && r.model==='llama3.1'"
R=$(ev "(async function(){ const res=await fetch('/api/coach/analyze-project',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project:{title:'英文三字经小程序',progress:62},userLogs:[]})}); const t=await res.text(); return JSON.stringify({s:res.status,n:t.length}); })()")
assert_res "  └ 无 Key 也能正常请求" "$R" "r.s===200 && r.n>20"
assert "  └ 未发送 Authorization 头" "r.protocol==='openai' && r.auth===null && r.model==='llama3.1'" < <(last)

echo
echo "════════════════════════════════════════"
echo "  通过 $pass 项 / 失败 $fail 项"
echo "════════════════════════════════════════"
[ "$fail" -eq 0 ] || exit 1
