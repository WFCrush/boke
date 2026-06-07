(function () {
  'use strict';

  var root = document.querySelector('[data-skill-chat]');
  if (!root) return;

  var state = {
    secret: '',
    session: null,
    busy: false
  };

  function byId(id) { return document.getElementById(id); }

  function mountShell() {
    root.innerHTML = [
      '<section class="psc-hero" aria-labelledby="psc-title">',
      '  <div>',
      '    <p class="psc-kicker">Skill Dialogue</p>',
      '    <h1 id="psc-title">对话分析板块</h1>',
      '    <p class="psc-lead">输入一个只有你知道的会话密钥，系统会保存本次对话；下次使用同一个密钥，可以继续接上。结束时会对整段对话做一次梳理。</p>',
      '  </div>',
      '  <div class="psc-status-panel">',
      '    <span class="psc-status-dot" data-psc-dot></span>',
      '    <div>',
      '      <strong data-psc-status-title>等待连接</strong>',
      '      <span data-psc-status-text>先输入会话密钥。</span>',
      '    </div>',
      '  </div>',
      '</section>',
      '<section class="psc-console" aria-label="对话控制台">',
      '  <aside class="psc-control">',
      '    <label class="psc-field">',
      '      <span>会话密钥</span>',
      '      <input id="pscSecret" type="password" autocomplete="off" placeholder="至少 12 个字符">',
      '    </label>',
      '    <div class="psc-actions">',
      '      <button id="pscResume" type="button">载入/继续</button>',
      '      <button id="pscNewSecret" type="button" class="psc-quiet">生成密钥</button>',
      '    </div>',
      '    <div class="psc-session-card">',
      '      <span>会话状态</span>',
      '      <strong id="pscSessionState">未载入</strong>',
      '      <code id="pscSessionId">-</code>',
      '    </div>',
      '    <button id="pscEnd" type="button" class="psc-danger">结束对话并分析</button>',
      '    <p class="psc-note">会话密钥不是账号密码，只用于定位你的对话记录。请自行保存；丢失后无法恢复同一段对话。</p>',
      '  </aside>',
      '  <div class="psc-chat" role="main" aria-label="Skill 对话窗口">',
      '    <div id="pscMessages" class="psc-messages" aria-live="polite"></div>',
      '    <div id="pscSummary" class="psc-summary" hidden></div>',
      '    <div class="psc-composer">',
      '      <textarea id="pscInput" rows="4" placeholder="写下你想分析的关系、梦境、困惑或一句卡住你的话..." disabled></textarea>',
      '      <button id="pscSend" type="button" disabled>发送</button>',
      '    </div>',
      '  </div>',
      '</section>'
    ].join('');
  }

  function apiBase() {
    var pageBase = root.getAttribute('data-api-base') || '';
    var globalBase = window.BOKE_SKILL_CHAT_API_BASE || '';
    return (pageBase || globalBase || '').replace(/\/+$/, '');
  }

  function endpoint(path) {
    var apiStyle = window.BOKE_SKILL_CHAT_API_STYLE || '';
    if (apiStyle === 'php') return apiBase() + path + '.php';
    return apiBase() + path;
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, function (ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
    });
  }

  function markdownLite(value) {
    var html = escapeHtml(value)
      .replace(/^###\s+(.+)$/gm, '<h3>$1</h3>')
      .replace(/^##\s+(.+)$/gm, '<h2>$1</h2>')
      .replace(/^#\s+(.+)$/gm, '<h2>$1</h2>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/^-\s+(.+)$/gm, '<li>$1</li>')
      .replace(/\n{2,}/g, '</p><p>')
      .replace(/\n/g, '<br>');
    html = html.replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>');
    return '<p>' + html + '</p>';
  }

  function setStatus(kind, title, text) {
    root.dataset.state = kind;
    byId('pscSessionState').textContent = state.session ? state.session.status : '未载入';
    var titleEl = root.querySelector('[data-psc-status-title]');
    var textEl = root.querySelector('[data-psc-status-text]');
    if (titleEl) titleEl.textContent = title;
    if (textEl) textEl.textContent = text;
  }

  function setBusy(busy) {
    state.busy = busy;
    var send = byId('pscSend');
    var input = byId('pscInput');
    var resume = byId('pscResume');
    var end = byId('pscEnd');
    if (send) send.disabled = busy || !state.session || state.session.status === 'ended';
    if (input) input.disabled = busy || !state.session || state.session.status === 'ended';
    if (resume) resume.disabled = busy;
    if (end) end.disabled = busy || !state.session || state.session.status === 'ended';
  }

  async function request(path, body) {
    if (!apiBase()) {
      throw new Error('站点尚未配置公开对话 API，请稍后再试。');
    }
    var res = await fetch(endpoint(path), {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    });
    var data = await res.json().catch(function () { return null; });
    if (!data) throw new Error('接口返回不是 JSON，请先在浏览器打开后端健康检查页面后重试');
    if (!res.ok) throw new Error(data.error || '请求失败');
    return data;
  }

  function renderMessages() {
    var box = byId('pscMessages');
    var session = state.session;
    if (!session || !session.messages || session.messages.length === 0) {
      box.innerHTML = '<div class="psc-empty"><strong>这里会保存你的对话</strong><span>载入会话后，从一个具体画面开始。</span></div>';
      return;
    }
    box.innerHTML = session.messages.map(function (message) {
      var role = message.role === 'user' ? '你' : 'Skill';
      var body = message.role === 'assistant' ? markdownLite(message.content) : escapeHtml(message.content).replace(/\n/g, '<br>');
      return '<article class="psc-message psc-message-' + message.role + '"><div class="psc-role">' + role + '</div><div class="psc-bubble">' + body + '</div></article>';
    }).join('');
    box.scrollTop = box.scrollHeight;
  }

  function renderSummary() {
    var panel = byId('pscSummary');
    if (!state.session || !state.session.summary) {
      panel.hidden = true;
      panel.innerHTML = '';
      return;
    }
    panel.hidden = false;
    panel.innerHTML = '<h2>结束分析</h2>' + markdownLite(state.session.summary);
  }

  function renderSession() {
    byId('pscSessionState').textContent = state.session ? (state.session.status === 'ended' ? '已结束' : '进行中') : '未载入';
    byId('pscSessionId').textContent = state.session ? state.session.id : '-';
    renderMessages();
    renderSummary();
    setBusy(false);
  }

  function secretValue() {
    var value = byId('pscSecret').value.trim();
    if (value.length < 12) throw new Error('请先输入至少 12 个字符的会话密钥');
    return value;
  }

  async function resumeSession() {
    try {
      setBusy(true);
      state.secret = secretValue();
      var session = await request('/session', { secret: state.secret });
      state.session = session;
      setStatus('ready', '会话已载入', session.status === 'ended' ? '这段对话已经结束，可查看分析。' : '可以继续对话。');
      renderSession();
    } catch (error) {
      setStatus('error', '载入失败', error.message);
      setBusy(false);
    }
  }

  async function sendMessage() {
    var input = byId('pscInput');
    var message = input.value.trim();
    if (!message || state.busy) return;
    try {
      setBusy(true);
      input.value = '';
      state.session.messages.push({ role: 'user', content: message });
      state.session.messages.push({ role: 'assistant', content: '正在分析...' });
      renderMessages();
      var data = await request('/message', { secret: state.secret, message: message });
      state.session = data.session;
      setStatus('ready', '已保存', '这轮对话已写入本地记录。');
      renderSession();
      input.focus();
    } catch (error) {
      setStatus('error', '发送失败', error.message);
      if (state.session && state.session.messages) {
        state.session.messages = state.session.messages.filter(function (item) { return item.content !== '正在分析...'; });
        renderMessages();
      }
      setBusy(false);
    }
  }

  async function endSession() {
    if (!state.session || state.busy) return;
    if (!window.confirm('确定结束这段对话并生成分析梳理吗？结束后不能继续追加消息。')) return;
    try {
      setBusy(true);
      setStatus('working', '正在分析', '正在对整段对话做结束梳理。');
      state.session = await request('/end', { secret: state.secret });
      setStatus('ready', '对话已结束', '分析已生成，并保存为 JSON 和 Markdown。');
      renderSession();
    } catch (error) {
      setStatus('error', '结束失败', error.message);
      setBusy(false);
    }
  }

  function newSecret() {
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    var out = '';
    if (window.crypto && window.crypto.getRandomValues) {
      var bytes = new Uint8Array(24);
      window.crypto.getRandomValues(bytes);
      for (var i = 0; i < bytes.length; i += 1) out += chars[bytes[i] % chars.length];
    } else {
      for (var j = 0; j < 24; j += 1) out += chars[Math.floor(Math.random() * chars.length)];
    }
    byId('pscSecret').value = out;
    setStatus('idle', '密钥已生成', '请保存这个密钥，然后点击载入/继续。');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(out).then(function () {
        setStatus('idle', '密钥已生成', '已尝试复制到剪贴板，请另外保存一份。');
      }).catch(function () {});
    }
  }

  function init() {
    mountShell();
    if (!apiBase()) {
      setStatus('error', '暂未开放', '站点尚未配置公开对话 API。');
    }
    byId('pscResume').addEventListener('click', resumeSession);
    byId('pscNewSecret').addEventListener('click', newSecret);
    byId('pscSend').addEventListener('click', sendMessage);
    byId('pscEnd').addEventListener('click', endSession);
    byId('pscInput').addEventListener('keydown', function (event) {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
      }
    });
    renderMessages();
    setStatus('idle', '等待连接', '输入会话密钥后载入。');
  }

  init();
})();
