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

  function apiBase() {
    var input = byId('pscApiBase');
    var configured = input && input.value.trim();
    var pageBase = root.getAttribute('data-api-base') || '';
    var globalBase = window.BOKE_SKILL_CHAT_API_BASE || '';
    return (configured || pageBase || globalBase || window.location.origin).replace(/\/+$/, '');
  }

  function endpoint(path) {
    return apiBase() + '/api/public-skill-chat' + path;
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
    byId('pscSend').disabled = busy || !state.session || state.session.status === 'ended';
    byId('pscInput').disabled = busy || !state.session || state.session.status === 'ended';
    byId('pscResume').disabled = busy;
    byId('pscEnd').disabled = busy || !state.session || state.session.status === 'ended';
  }

  async function request(path, body) {
    var res = await fetch(endpoint(path), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    });
    var data = await res.json().catch(function () { return {}; });
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
    if (value.length < 6) throw new Error('请先输入至少 6 个字符的会话密钥');
    return value;
  }

  async function resumeSession() {
    try {
      setBusy(true);
      state.secret = secretValue();
      localStorage.setItem('bokeSkillChatApiBase', apiBase());
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
      var bytes = new Uint8Array(18);
      window.crypto.getRandomValues(bytes);
      for (var i = 0; i < bytes.length; i += 1) out += chars[bytes[i] % chars.length];
    } else {
      for (var j = 0; j < 18; j += 1) out += chars[Math.floor(Math.random() * chars.length)];
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
    var savedBase = localStorage.getItem('bokeSkillChatApiBase') || root.getAttribute('data-api-base') || window.BOKE_SKILL_CHAT_API_BASE || '';
    byId('pscApiBase').value = savedBase || window.location.origin;
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
