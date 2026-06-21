---
title: 紫微斗数命盘解读
date: 2026-06-20
layout: page
math: false
---

<style>
#mingli-app{max-width:620px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
.mc{background:#fff;border-radius:14px;padding:18px 22px;margin:12px 0;box-shadow:0 2px 14px rgba(0,0,0,.07);border-left:5px solid #ddd;transition:box-shadow .2s}
.mc:hover{box-shadow:0 4px 20px rgba(0,0,0,.12)}
.mc-t{font-size:1.05em;font-weight:700;margin-bottom:10px}
.mc-b{color:#444;line-height:1.9;font-size:.94em}
.mc-b p{margin:0 0 8px}
.mc-b ul,.mc-b ol{padding-left:20px;margin:6px 0}
.mc-b li{margin-bottom:4px}
.mc-b strong{color:#222}
.mc-b blockquote{border-left:3px solid #e0e0e0;margin:10px 0;padding:6px 14px;color:#666;background:#fafafa;border-radius:0 6px 6px 0}
.mc-intro{color:#777;font-size:.9em;text-align:center;padding:4px 0 10px}
.mc-intro p{margin:4px 0}
#result-header{display:none;background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;border-radius:14px;padding:20px 24px;margin-bottom:4px;text-align:center}
#result-header h3{margin:0 0 4px;font-size:1.1em;font-weight:600;opacity:.9}
#result-header p{margin:0;font-size:.9em;opacity:.75}
#thinking-bar{display:none;text-align:center;padding:32px 0;color:#aaa;font-size:.9em}
.dot{display:inline-block;width:6px;height:6px;border-radius:50%;background:#bbb;margin:0 3px;animation:pulse 1.2s infinite}
.dot:nth-child(2){animation-delay:.4s}.dot:nth-child(3){animation-delay:.8s}
@keyframes pulse{0%,80%,100%{transform:scale(.6);opacity:.4}40%{transform:scale(1);opacity:1}}
@media(max-width:480px){
  #mingli-form .grid-2{grid-template-columns:1fr!important}
  #mingli-app{padding:0 4px}
  .mc{padding:14px 16px}
}
</style>

<div id="mingli-app">

<form id="mingli-form" style="display:flex;flex-direction:column;gap:12px">
  <div class="grid-2" style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
    <label>出生年<input type="number" id="year" placeholder="如 1995" min="1900" max="2010" required style="width:100%;margin-top:4px"></label>
    <label>出生月<input type="number" id="month" placeholder="1-12" min="1" max="12" required style="width:100%;margin-top:4px"></label>
    <label>出生日<input type="number" id="day" placeholder="1-31" min="1" max="31" required style="width:100%;margin-top:4px"></label>
    <label>出生时辰
      <select id="hour" required style="width:100%;margin-top:4px">
        <option value="">选择时辰</option>
        <option>子时(23-1点)</option><option>丑时(1-3点)</option>
        <option>寅时(3-5点)</option><option>卯时(5-7点)</option>
        <option>辰时(7-9点)</option><option>巳时(9-11点)</option>
        <option>午时(11-13点)</option><option>未时(13-15点)</option>
        <option>申时(15-17点)</option><option>酉时(17-19点)</option>
        <option>戌时(19-21点)</option><option>亥时(21-23点)</option>
      </select>
    </label>
  </div>
  <label>性别
    <select id="gender" required style="margin-left:8px">
      <option value="">选择</option>
      <option>男</option><option>女</option>
    </select>
  </label>
  <button type="submit" id="submit-btn" style="padding:11px;cursor:pointer;border-radius:8px;border:none;background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;font-size:1em;font-weight:600">开始解读</button>
</form>

<div id="thinking-bar">
  <div style="margin-bottom:8px">AI 正在推演星盘</div>
  <div><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>
</div>

<div id="result-header">
  <h3>命盘解读报告</h3>
  <p id="result-subtitle"></p>
</div>
<div id="result-content" style="margin-top:4px"></div>

</div>

<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
<script>
const WORKER_URL = 'https://mingli.wflrsx.workers.dev';

const COLORS = {
  '性格':'#9b59b6','命盘':'#9b59b6','先天':'#9b59b6',
  '事业':'#3498db','职业':'#3498db','工作':'#3498db',
  '财运':'#e67e22','财':'#e67e22','钱':'#e67e22',
  '感情':'#e74c3c','爱情':'#e74c3c','婚姻':'#e74c3c',
  '运势':'#27ae60','流年':'#27ae60','大限':'#27ae60','近期':'#27ae60','近年':'#27ae60',
};
function getColor(t){for(const k in COLORS){if(t.includes(k))return COLORS[k];}return'#7f8c8d';}

function render(md){
  const parts = md.split(/(?=^## )/m);
  let html = '';
  for(const part of parts){
    if(!part.trim()) continue;
    if(part.startsWith('## ')){
      const nl = part.indexOf('\n');
      const rawTitle = nl>0 ? part.slice(3,nl) : part.slice(3);
      const body = nl>0 ? part.slice(nl+1).trim() : '';
      const c = getColor(rawTitle);
      const bodyHtml = body ? '<div class="mc-b">' + marked.parse(body) + '</div>' : '';
      html += '<div class="mc" style="border-left-color:' + c + '">' +
        '<div class="mc-t" style="color:' + c + '">' + rawTitle + '</div>' +
        bodyHtml +
      '</div>';
    } else {
      const parsed = marked.parse(part.trim());
      if(parsed.trim()) html += '<div class="mc-intro">' + parsed + '</div>';
    }
  }
  document.getElementById('result-content').innerHTML = html;
}

document.getElementById('mingli-form').addEventListener('submit', async(e)=>{
  e.preventDefault();
  const btn = document.getElementById('submit-btn');
  const thinking = document.getElementById('thinking-bar');
  const header = document.getElementById('result-header');
  const subtitle = document.getElementById('result-subtitle');
  const content = document.getElementById('result-content');

  const year=document.getElementById('year').value;
  const month=document.getElementById('month').value;
  const day=document.getElementById('day').value;
  const hour=document.getElementById('hour').value;
  const gender=document.getElementById('gender').value;

  btn.disabled=true; btn.textContent='解读中...';
  content.innerHTML=''; header.style.display='none';
  thinking.style.display='block';

  let full='';
  try{
    const resp = await fetch(WORKER_URL,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({year:year,month:month,day:day,hour:hour,gender:gender}),
    });
    const ct=resp.headers.get('content-type')||'';
    if(ct.includes('event-stream')){
      const reader=resp.body.getReader(),dec=new TextDecoder();
      let buf='',hasContent=false;
      while(true){
        const res=await reader.read();
        if(res.done) break;
        buf+=dec.decode(res.value,{stream:true});
        const lines=buf.split('\n'); buf=lines.pop();
        for(const line of lines){
          if(!line.startsWith('data:')) continue;
          const raw=line.slice(5).trim();
          if(raw==='[DONE]') break;
          try{
            const d=JSON.parse(raw);
            const delta = d && d.choices && d.choices[0] && d.choices[0].delta;
            if(delta && delta.content){
              if(!hasContent){
                hasContent=true;
                thinking.style.display='none';
                header.style.display='block';
                subtitle.textContent=year+'年'+month+'月'+day+'日 '+hour+' · '+gender+'命';
              }
              full+=delta.content;
              render(full);
            }
          }catch(err){}
        }
      }
      if(!full) content.textContent='未收到解读内容，请重试';
    } else {
      const data=await resp.json();
      full=data.content||'';
      if(full){ header.style.display='block'; render(full); }
      else content.textContent=data.error||'解读失败';
    }
  }catch(err){
    content.textContent='错误：'+(err.message||String(err));
  }
  thinking.style.display='none';
  btn.disabled=false; btn.textContent='重新解读';
});
</script>
