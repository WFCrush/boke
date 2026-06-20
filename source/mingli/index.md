---
title: 紫微斗数命盘解读
date: 2026-06-20
layout: page
---

<div id="mingli-app" style="max-width:600px;margin:0 auto">

<form id="mingli-form" style="display:flex;flex-direction:column;gap:12px">
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
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
  <button type="submit" id="submit-btn" style="padding:10px;cursor:pointer">开始解读</button>
</form>

<div id="result" style="margin-top:24px;display:none">
  <div id="result-thinking" style="color:#888;font-size:0.9em;margin-bottom:8px;display:none">AI 思考中，请稍候（约30秒）...</div>
  <div id="result-content" style="line-height:1.8"></div>
</div>

</div>

<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
<script>
const WORKER_URL = 'https://mingli.zyn6915060.workers.dev';

function renderContent(text) {
  const div = document.getElementById('result-content');
  div.innerHTML = typeof marked !== 'undefined' ? marked.parse(text) : text.replace(/\n/g, '<br>');
}

document.getElementById('mingli-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('submit-btn');
  const resultDiv = document.getElementById('result');
  const thinkingDiv = document.getElementById('result-thinking');
  const contentDiv = document.getElementById('result-content');

  btn.disabled = true;
  btn.textContent = '解读中...';
  contentDiv.innerHTML = '';
  thinkingDiv.style.display = 'none';
  resultDiv.style.display = 'block';

  let fullText = '';
  try {
    const resp = await fetch(WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        year: document.getElementById('year').value,
        month: document.getElementById('month').value,
        day: document.getElementById('day').value,
        hour: document.getElementById('hour').value,
        gender: document.getElementById('gender').value,
      }),
    });

    const contentType = resp.headers.get('content-type') || '';
    if (contentType.includes('event-stream')) {
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let hasContent = false;
      thinkingDiv.style.display = 'block';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop();
        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          const raw = line.slice(5).trim();
          if (raw === '[DONE]') break;
          try {
            const delta = JSON.parse(raw)?.choices?.[0]?.delta;
            if (delta?.reasoning_content && !hasContent) {
              // still thinking
            }
            if (delta?.content) {
              if (!hasContent) { hasContent = true; thinkingDiv.style.display = 'none'; }
              fullText += delta.content;
              renderContent(fullText);
            }
          } catch {}
        }
      }
      if (!fullText) contentDiv.textContent = '未收到解读内容，请重试';
    } else {
      const data = await resp.json();
      fullText = data.content || '';
      contentDiv.textContent = fullText || data.error || '解读失败';
    }
  } catch (err) {
    contentDiv.textContent = '错误：' + (err && err.message ? err.message : String(err));
  }

  btn.disabled = false;
  btn.textContent = '重新解读';
});
</script>
