// ===== 全局状态 =====
let token = localStorage.getItem('bokeAdminToken') || '';
let currentFile = '';
let currentTab = 'editor';
let allPosts = [];
let taxonomy = { categories: [], tags: [] };
let isDirty = false;
let autosaveTimer = null;
let skillMessages = [];
let skillBusy = false;
let publishStatusCache = null;

const $ = (id) => document.getElementById(id);
const $$ = (sel) => document.querySelectorAll(sel);

// ===== Toast 通知系统 =====
function toast(message, type = 'info', timeout = 2500) {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = message;
  $('toastContainer').appendChild(el);
  setTimeout(() => el.classList.add('show'), 10);
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, timeout);
}

// ===== 自定义确认框 =====
function confirmDialog(title, message, danger = true) {
  return new Promise((resolve) => {
    $('confirmTitle').textContent = title;
    $('confirmMessage').textContent = message;
    $('confirmOk').className = danger ? 'danger' : 'primary';
    $('confirmModal').classList.remove('hidden');
    const ok = () => { cleanup(); resolve(true); };
    const cancel = () => { cleanup(); resolve(false); };
    const cleanup = () => {
      $('confirmModal').classList.add('hidden');
      $('confirmOk').onclick = null;
      $('confirmCancel').onclick = null;
    };
    $('confirmOk').onclick = ok;
    $('confirmCancel').onclick = cancel;
  });
}

// ===== 日志输出 =====
function log(message) {
  $('log').textContent = typeof message === 'string' ? message : JSON.stringify(message, null, 2);
  $('log').scrollTop = $('log').scrollHeight;
  if ($('publishLog')) {
    $('publishLog').textContent = $('log').textContent;
    $('publishLog').scrollTop = $('publishLog').scrollHeight;
  }
  // 有日志输出时自动展开抽屉
  if ($('logDrawer').classList.contains('collapsed') && message && !message.includes('就绪')) {
    $('logDrawer').classList.remove('collapsed');
    $('logToggle').textContent = '▼';
  }
}

// ===== API 封装 =====
function friendlyNetworkError(error) {
  if (error && error.name === 'TypeError' && String(error.message || '').includes('fetch')) {
    return '连接不到本地后台服务。请确认“博客后台服务”窗口还开着，然后刷新页面再试。';
  }
  return error.message || '操作失败';
}

async function api(url, options = {}) {
  let res;
  try {
    res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'x-admin-token': token,
        ...(options.headers || {}),
      },
    });
  } catch (error) {
    throw new Error(friendlyNetworkError(error));
  }
  const raw = await res.text().catch(() => '');
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch (_) { data = { raw }; }
  if (!res.ok) {
    if (res.status === 404 && raw.includes('Cannot')) {
      throw new Error('后台服务版本不匹配，请重启博客后台服务后再试');
    }
    throw new Error(data.error || data.raw || `操作失败（HTTP ${res.status}）`);
  }
  return data;
}

// ===== 表单数据 =====
function postForm() {
  const dateStr = $('postDate').value;
  return {
    title: $('title').value.trim() || '未命名文章',
    slug: '',
    categories: $('categories').value.trim(),
    tags: $('tags').value.trim(),
    description: $('description').value.trim(),
    excerpt: $('excerpt').value.trim(),
    cover: $('cover').value.trim(),
    index_img: $('indexImg').value.trim(),
    banner_img: $('bannerImg').value.trim(),
    sticky: $('sticky').checked ? 100 : 0,
    date: dateStr ? dateStr.replace('T', ' ') + ':00' : '',
    content: $('content').value,
  };
}

function fillEditor(post) {
  currentFile = post.file || '';
  $('currentFile').textContent = currentFile || '尚未保存';
  $('title').value = post.title || '';
  $('categories').value = Array.isArray(post.categories) ? post.categories.join(', ') : (post.categories || '');
  $('tags').value = Array.isArray(post.tags) ? post.tags.join(', ') : (post.tags || '');
  $('description').value = post.description || '';
  $('excerpt').value = post.excerpt || '';
  $('cover').value = post.cover || '';
  $('indexImg').value = post.index_img || '';
  $('bannerImg').value = post.banner_img || '';
  $('sticky').checked = Number(post.sticky) > 0;
  $('content').value = post.content || '';
  if (post.date) {
    const d = new Date(post.date);
    if (!isNaN(d.getTime())) {
      const pad = (n) => String(n).padStart(2, '0');
      $('postDate').value = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
  } else {
    $('postDate').value = '';
  }
  updateWordCount();
  updatePreview();
  isDirty = false;
  setAutosaveStatus('就绪');
}

function newPost() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  fillEditor({
    title: '',
    file: '',
    categories: '',
    tags: '',
    description: '',
    excerpt: '',
    cover: '/img/home-banner.png',
    index_img: '/img/home-banner.png',
    banner_img: '/img/home-banner.png',
    sticky: 0,
    date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:00`,
    content: '',
  });
  $('title').focus();
}

// ===== 加载文章 =====
async function loadPosts() {
  allPosts = await api('/api/posts');
  renderPostList();
  renderPostTable();
  renderStats();
}

async function loadTaxonomy() {
  try {
    taxonomy = await api('/api/taxonomy');
    const dl = $('categoryList');
    dl.innerHTML = taxonomy.categories.map((c) => `<option value="${c}">`).join('');
  } catch (_) {}
}

function renderPostList() {
  const keyword = ($('postSearch').value || '').toLowerCase();
  const list = $('postList');
  list.innerHTML = '';
  const filtered = allPosts.filter((p) => p.title.toLowerCase().includes(keyword) || p.file.toLowerCase().includes(keyword));
  if (filtered.length === 0) {
    list.innerHTML = '<div class="empty empty-card"><strong>没有找到文章</strong><span>换个关键词试试，或新建一篇文章。</span></div>';
    return;
  }
  filtered.forEach((post) => {
    const item = document.createElement('div');
    item.className = `post-card ${post.file === currentFile ? 'active' : ''}`;
    const stickyMark = Number(post.sticky) > 0 ? '<span class="badge badge-pin">置顶</span>' : '';
    const cat = (post.categories || []).join('/');
    const dateText = post.date ? String(post.date).slice(0, 10) : '未设置日期';
    const tagText = (post.tags || []).slice(0, 2).map((t) => `<span class="mini-tag">${escapeHtml(t)}</span>`).join('');
    item.innerHTML = `
      <div class="post-card-top">
        <div class="post-card-title">${escapeHtml(post.title)}</div>
        ${stickyMark}
      </div>
      <div class="post-card-meta">${cat ? `📁 ${escapeHtml(cat)} · ` : ''}${dateText}</div>
      ${tagText ? `<div class="post-card-tags">${tagText}</div>` : ''}
    `;
    item.onclick = () => openPost(post.file);
    list.appendChild(item);
  });
}

function renderPostTable() {
  const keyword = ($('postSearchAll').value || '').toLowerCase();
  const sortBy = $('postSortBy').value;
  let posts = allPosts.filter((p) => p.title.toLowerCase().includes(keyword));
  posts = posts.slice();
  if (sortBy === 'date-desc') posts.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  if (sortBy === 'date-asc') posts.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  if (sortBy === 'title') posts.sort((a, b) => a.title.localeCompare(b.title, 'zh'));
  if (sortBy === 'sticky') posts.sort((a, b) => (Number(b.sticky) || 0) - (Number(a.sticky) || 0));
  const tbody = $('postTableBody');
  tbody.innerHTML = '';
  posts.forEach((post) => {
    const tr = document.createElement('tr');
    const tags = (post.tags || []).slice(0, 3).map((t) => `<span class="mini-tag">${escapeHtml(t)}</span>`).join('');
    const category = (post.categories || []).join('/') || '未分类';
    tr.innerHTML = `
      <td>
        <a href="#" class="post-link">${escapeHtml(post.title)}</a>
        <div class="table-subtext">${escapeHtml(post.file)}</div>
        ${tags ? `<div class="post-card-tags">${tags}</div>` : ''}
      </td>
      <td><span class="pill">${escapeHtml(category)}</span></td>
      <td>${formatDateText(post.date)}</td>
      <td>${Number(post.sticky) > 0 ? '<span class="badge badge-pin">置顶</span>' : '<span class="table-subtext">普通</span>'}</td>
      <td class="table-actions">
        <button class="ghost-btn small" data-action="edit">编辑</button>
        <button class="ghost-btn small danger-text" data-action="delete">删除</button>
      </td>
    `;
    tr.querySelector('[data-action="edit"]').onclick = () => { openPost(post.file); switchTab('editor'); };
    tr.querySelector('.post-link').onclick = (e) => { e.preventDefault(); openPost(post.file); switchTab('editor'); };
    tr.querySelector('[data-action="delete"]').onclick = () => deletePost(post.file, post.title);
    tbody.appendChild(tr);
  });
  if (posts.length === 0) tbody.innerHTML = '<tr><td colspan="5" class="empty empty-card"><strong>没有文章</strong><span>可以先去写作页新建一篇。</span></td></tr>';
}

function renderStats() {
  const total = allPosts.length;
  const stickyCount = allPosts.filter((p) => Number(p.sticky) > 0).length;
  const tagSet = new Set();
  const catSet = new Set();
  let totalWords = 0;
  allPosts.forEach((p) => {
    (p.tags || []).forEach((t) => tagSet.add(t));
    (p.categories || []).forEach((c) => catSet.add(c));
    totalWords += (p.content || '').length;
  });
  $('statsBox').innerHTML = `
    <div class="stat-row"><span>总文章数</span><strong>${total}</strong></div>
    <div class="stat-row"><span>置顶文章</span><strong>${stickyCount}</strong></div>
    <div class="stat-row"><span>分类数</span><strong>${catSet.size}</strong></div>
    <div class="stat-row"><span>标签数</span><strong>${tagSet.size}</strong></div>
    <div class="stat-row"><span>累计字数</span><strong>${totalWords.toLocaleString()}</strong></div>
  `;
}

// ===== 打开/保存/删除 =====
async function openPost(file) {
  if (isDirty) {
    const ok = await confirmDialog('当前文章未保存', '切换会丢失修改，确定继续吗？', false);
    if (!ok) return;
  }
  try {
    const post = await api(`/api/posts/${encodeURIComponent(file)}`);
    fillEditor(post);
    renderPostList();
    toast('已加载', 'info', 1200);
  } catch (error) {
    toast(error.message, 'error');
  }
}

async function savePost(silent = false) {
  if (!$('title').value.trim()) {
    toast('请先填写标题', 'error');
    $('title').focus();
    return null;
  }
  try {
    const body = postForm();
    const url = currentFile ? `/api/posts/${encodeURIComponent(currentFile)}` : '/api/posts';
    const method = currentFile ? 'PUT' : 'POST';
    const post = await api(url, { method, body: JSON.stringify(body) });
    fillEditor(post);
    await loadPosts();
    await loadTaxonomy();
    if (!silent) toast('保存成功', 'success', 1500);
    isDirty = false;
    setAutosaveStatus('已保存');
    return post;
  } catch (error) {
    toast('保存失败：' + error.message, 'error');
    return null;
  }
}

async function deletePost(file, title) {
  const ok = await confirmDialog('移入回收站', `确定把「${title}」移入回收站吗？\n你可以在“更多 > 回收站”里恢复。`, true);
  if (!ok) return;
  try {
    await api(`/api/posts/${encodeURIComponent(file)}`, { method: 'DELETE' });
    toast('已移入回收站', 'success');
    if (currentFile === file) newPost();
    await loadPosts();
  } catch (error) {
    toast('删除失败：' + error.message, 'error');
  }
}

async function deleteCurrentPost() {
  if (!currentFile) {
    toast('当前没有打开任何文章', 'info');
    return;
  }
  await deletePost(currentFile, $('title').value || currentFile);
}

// ===== Markdown 工具 =====
function insertAtCursor(text, cursorOffset = null) {
  const area = $('content');
  const start = area.selectionStart;
  const end = area.selectionEnd;
  area.value = `${area.value.slice(0, start)}${text}${area.value.slice(end)}`;
  area.focus();
  const pos = cursorOffset != null ? start + cursorOffset : start + text.length;
  area.selectionStart = area.selectionEnd = pos;
  markDirty();
  updateWordCount();
  updatePreview();
}

function wrapSelection(prefix, suffix, placeholder = '') {
  const area = $('content');
  const start = area.selectionStart;
  const end = area.selectionEnd;
  const selected = area.value.slice(start, end) || placeholder;
  const replaced = `${prefix}${selected}${suffix}`;
  area.value = `${area.value.slice(0, start)}${replaced}${area.value.slice(end)}`;
  area.focus();
  area.selectionStart = start + prefix.length;
  area.selectionEnd = start + prefix.length + selected.length;
  markDirty();
  updateWordCount();
  updatePreview();
}

function applyMdAction(action) {
  switch (action) {
    case 'bold': return wrapSelection('**', '**', '加粗文字');
    case 'italic': return wrapSelection('*', '*', '斜体');
    case 'heading': return insertAtCursor('\n## 小标题\n');
    case 'quote': return insertAtCursor('\n> 引用内容\n');
    case 'link': {
      const url = prompt('链接地址（http/https）：');
      if (!url) return;
      return wrapSelection('[', `](${url})`, '链接文字');
    }
    case 'code': return wrapSelection('`', '`', 'code');
    case 'codeblock': return insertAtCursor('\n```js\n// 代码\n```\n');
    case 'ul': return insertAtCursor('\n- 列表项\n- 列表项\n');
    case 'ol': return insertAtCursor('\n1. 第一项\n2. 第二项\n');
    case 'hr': return insertAtCursor('\n\n---\n\n');
    case 'columns': return insertAtCursor('\n<div class="boke-columns">\n  <div>\n\n### 左标题\n\n左侧内容。\n\n  </div>\n  <div>\n\n### 右标题\n\n右侧内容。\n\n  </div>\n</div>\n');
  }
}

// ===== 字数统计 =====
function updateWordCount() {
  const text = $('content').value || '';
  const count = text.replace(/\s/g, '').length;
  $('wordCount').textContent = `${count.toLocaleString()} 字`;
}

// ===== 实时预览 =====
function updatePreview() {
  if ($('preview').classList.contains('hidden')) return;
  const md = $('content').value;
  $('preview').innerHTML = window.marked.parse(md);
}

function togglePreview() {
  const preview = $('preview');
  const ta = $('content');
  if (preview.classList.contains('hidden')) {
    preview.classList.remove('hidden');
    ta.classList.add('half');
    preview.classList.add('half');
    $('previewToggle').classList.add('active');
    updatePreview();
  } else {
    preview.classList.add('hidden');
    ta.classList.remove('half');
    preview.classList.remove('half');
    $('previewToggle').classList.remove('active');
  }
}

// ===== 自动保存 / 脏标记 =====
function markDirty() {
  isDirty = true;
  setAutosaveStatus('未保存');
  if (autosaveTimer) clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(autoSaveDraft, 3000);
}

function setAutosaveStatus(text) {
  $('autosaveStatus').textContent = text;
  $('autosaveStatus').className = 'autosave';
  if (text === '未保存') $('autosaveStatus').classList.add('dirty');
  if (text === '已保存' || text === '草稿已存') $('autosaveStatus').classList.add('clean');
}

async function autoSaveDraft() {
  if (!isDirty) return;
  try {
    await api('/api/draft', { method: 'PUT', body: JSON.stringify({ ...postForm(), file: currentFile }) });
    setAutosaveStatus('草稿已存');
  } catch (_) {}
}

async function tryRestoreDraft() {
  try {
    const draft = await api('/api/draft');
    if (!draft || !draft.title) return;
    const savedAt = draft.savedAt ? new Date(draft.savedAt) : null;
    const minutesAgo = savedAt ? Math.round((Date.now() - savedAt.getTime()) / 60000) : null;
    const ok = await confirmDialog('发现自动保存的草稿', `${minutesAgo != null ? `${minutesAgo} 分钟前` : '刚才'}保存的草稿「${draft.title}」是否恢复？`, false);
    if (ok) {
      fillEditor({
        title: draft.title,
        file: draft.file || '',
        categories: draft.categories || '',
        tags: draft.tags || '',
        description: draft.description || '',
        excerpt: draft.excerpt || '',
        cover: draft.cover || '',
        index_img: draft.index_img || '',
        banner_img: draft.banner_img || '',
        sticky: draft.sticky || 0,
        date: draft.date || '',
        content: draft.content || '',
      });
      isDirty = true;
      setAutosaveStatus('未保存');
    }
  } catch (_) {}
}

// ===== 上传 =====
async function uploadFile(file) {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch('/api/upload', { method: 'POST', headers: { 'x-admin-token': token }, body: form });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '上传失败');
  insertAtCursor(`\n${data.markdown}\n`);
  toast('上传成功', 'success');
}

async function uploadProtectedFile(file) {
  const password = prompt('请设置这个文档的打开密码：');
  if (!password) return;
  const form = new FormData();
  form.append('file', file);
  form.append('password', password);
  const res = await fetch('/api/upload-protected', { method: 'POST', headers: { 'x-admin-token': token }, body: form });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '上传失败');
  insertAtCursor(`\n${data.markdown}\n`);
  toast('加密上传成功，请记好密码', 'success', 4000);
}

async function importMarkdown(file) {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch('/api/import-md', { method: 'POST', headers: { 'x-admin-token': token }, body: form });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '导入失败');
  return data;
}

async function importMarkdownFiles(files) {
  if (!files || !files.length) return;
  const list = Array.from(files);
  toast(`开始导入 ${list.length} 个文章文件...`, 'info');
  let lastPost = null;
  let okCount = 0;
  for (const file of list) {
    try {
      const post = await importMarkdown(file);
      lastPost = post;
      okCount++;
    } catch (error) {
      toast(`「${file.name}」失败：${error.message}`, 'error', 4000);
    }
  }
  await loadPosts();
  if (lastPost) fillEditor(lastPost);
  toast(`导入完成：${okCount}/${list.length} 篇`, 'success');
}

// ===== 回收站 =====
async function loadTrash() {
  try {
    const items = await api('/api/trash');
    const tbody = $('trashTableBody');
    if (!items.length) {
      tbody.innerHTML = '<tr><td colspan="3" class="empty">回收站是空的</td></tr>';
      return;
    }
    tbody.innerHTML = '';
    items.forEach((item) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escapeHtml(item.title)}</td>
        <td>${formatDateText(item.deletedAt)}</td>
        <td>
          <button class="ghost-btn small" data-action="restore">恢复</button>
          <button class="ghost-btn small danger-text" data-action="purge">永久删除</button>
        </td>
      `;
      tr.querySelector('[data-action="restore"]').onclick = () => restoreTrash(item.file);
      tr.querySelector('[data-action="purge"]').onclick = () => purgeTrash(item.file, item.title);
      tbody.appendChild(tr);
    });
  } catch (error) {
    toast('读取回收站失败：' + error.message, 'error');
  }
}

async function restoreTrash(file) {
  try {
    const post = await api(`/api/trash/${encodeURIComponent(file)}/restore`, { method: 'POST', body: '{}' });
    toast('已恢复文章', 'success');
    await loadPosts();
    await loadTrash();
    fillEditor(post);
    switchTab('editor');
  } catch (error) {
    toast('恢复失败：' + error.message, 'error');
  }
}

async function purgeTrash(file, title) {
  const ok = await confirmDialog('永久删除', `确定永久删除「${title}」吗？这个操作不能恢复。`, true);
  if (!ok) return;
  try {
    await api(`/api/trash/${encodeURIComponent(file)}`, { method: 'DELETE' });
    toast('已永久删除', 'success');
    await loadTrash();
  } catch (error) {
    toast('删除失败：' + error.message, 'error');
  }
}

// ===== 站点配置 =====
async function loadSiteConfig() {
  try {
    const cfg = await api('/api/site-config');
    $('cfgTitle').value = cfg.title || '';
    $('cfgSubtitle').value = cfg.subtitle || '';
    $('cfgDescription').value = cfg.description || '';
    $('cfgAuthor').value = cfg.author || '';
    $('cfgAboutName').value = cfg.aboutName || '';
    $('cfgAboutIntro').value = cfg.homeIntro || cfg.aboutIntro || '';
    $('cfgSlogans').value = (cfg.slogans || []).join('\n');
  } catch (error) {
    toast('读取配置失败：' + error.message, 'error');
  }
}

async function saveSiteConfig() {
  const slogans = $('cfgSlogans').value.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  try {
    const data = await api('/api/site-config', {
      method: 'PUT',
      body: JSON.stringify({
        title: $('cfgTitle').value,
        subtitle: $('cfgSubtitle').value,
        description: $('cfgDescription').value,
        author: $('cfgAuthor').value,
        aboutName: $('cfgAboutName').value,
        aboutIntro: $('cfgAboutIntro').value,
        homeIntro: $('cfgAboutIntro').value,
        slogans,
      }),
    });
    if (data && typeof data.homeIntro === 'string') {
      $('cfgAboutIntro').value = data.homeIntro;
    }
    toast('个人信息已保存，记得去“写作”页发布上线', 'success', 3000);
  } catch (error) {
    toast('个人信息保存失败：' + error.message, 'error', 6000);
  }
}

// ===== 联系方式 =====
async function loadContact() {
  try {
    const c = await api('/api/contact');
    $('contactQq').value = c.qq || '';
    $('contactWechat').value = c.wechat || '';
    $('contactWechatQr').value = c.wechatQr || '';
    $('contactNote').value = c.note || '';
  } catch (_) {}
}

async function saveContact() {
  try {
    await api('/api/contact', {
      method: 'PUT',
      body: JSON.stringify({
        qq: $('contactQq').value,
        wechat: $('contactWechat').value,
        wechatQr: $('contactWechatQr').value,
        note: $('contactNote').value,
      }),
    });
    toast('联系方式已保存', 'success');
  } catch (error) {
    toast('保存失败：' + error.message, 'error');
  }
}

// ===== Skill 对话 =====
function renderSkillMessages() {
  const box = $('skillMessages');
  if (!box) return;
  if (!skillMessages.length) {
    box.innerHTML = '<div class="skill-empty"><strong>还没有对话</strong><span>先测试连接，再发送一段关系、梦境或卡住你的话。</span></div>';
    return;
  }
  box.innerHTML = skillMessages.map((message) => {
    const roleText = message.role === 'user' ? '你' : 'Skill';
    const body = message.role === 'assistant' && window.marked
      ? marked.parse(message.content || '')
      : escapeHtml(message.content || '').replace(/\n/g, '<br>');
    return `<article class="skill-message skill-message-${message.role}"><div class="skill-message-role">${roleText}</div><div class="skill-message-body">${body}</div></article>`;
  }).join('');
  box.scrollTop = box.scrollHeight;
}

function setSkillBusy(busy) {
  skillBusy = busy;
  if ($('sendSkillPrompt')) $('sendSkillPrompt').disabled = busy;
  if ($('skillPrompt')) $('skillPrompt').disabled = busy;
}

function setSkillStatus(message, type = 'info') {
  const el = $('skillStatus');
  if (!el) return;
  el.textContent = message;
  el.className = `skill-status skill-status-${type}`;
}

function fillSkillStatus(data) {
  if (!data) return;
  $('skillBaseUrl').value = data.baseUrl || '';
  $('skillPublicApiBase').value = data.publicApiBase || '';
  $('skillModel').value = data.model || '';
  $('skillName').value = data.skillName || 'xie-xiao-shu';
  $('skillAdminUrl').textContent = data.adminUrl || '-';
  $('skillApiUrl').textContent = data.apiUrl || '-';
  const keyText = data.hasApiKey ? `密钥已设置（${data.apiKeySource || 'unknown'} ${data.maskedApiKey || ''}）` : '未设置 API Key';
  const skillText = data.skillInstalled === false ? 'skill 文件未找到' : 'skill 文件已找到';
  const knowledgeText = data.knowledgeInstalled === false ? '知识库未找到' : '知识库已找到';
  const publicText = data.publicApiBase ? '公开页面 API 已配置' : '公开页面 API 未配置';
  setSkillStatus(`${keyText}；${skillText}；${knowledgeText}；${publicText}`, data.hasApiKey && data.skillInstalled !== false ? 'success' : 'warn');
}

async function loadSkillStatus() {
  try {
    const data = await api('/api/skill-chat/status');
    fillSkillStatus(data);
  } catch (error) {
    setSkillStatus(`读取配置失败：${error.message}`, 'error');
  }
}

async function saveSkillConfig() {
  try {
    const publicApiBase = $('skillPublicApiBase').value.trim().replace(/\/+$/, '');
    if (/\/v1$/i.test(publicApiBase)) {
      throw new Error('公开页面 API 地址不能填模型接口 /v1，请填你部署的 Node 后端根地址，或先留空');
    }
    const data = await api('/api/skill-chat/config', {
      method: 'PUT',
      body: JSON.stringify({
        baseUrl: $('skillBaseUrl').value,
        publicApiBase,
        apiKey: $('skillApiKey').value,
        model: $('skillModel').value,
        skillName: $('skillName').value,
      }),
    });
    $('skillApiKey').value = '';
    fillSkillStatus(data);
    await loadSkillStatus();
    toast('Skill 对话配置已保存', 'success');
  } catch (error) {
    toast(`保存配置失败：${error.message}`, 'error');
  }
}

async function loadSkillModels() {
  try {
    setSkillStatus('正在获取模型列表...', 'info');
    const data = await api('/api/skill-chat/models');
    $('skillModelList').innerHTML = (data.models || []).map((model) => `<option value="${escapeHtml(model)}">`).join('');
    if (!$('skillModel').value && data.selected) $('skillModel').value = data.selected;
    setSkillStatus(`获取模型成功：${(data.models || []).length} 个模型`, 'success');
    toast('模型列表已更新', 'success');
  } catch (error) {
    setSkillStatus(`获取模型失败：${error.message}`, 'error');
    toast(`获取模型失败：${error.message}`, 'error');
  }
}

async function testSkillConnection() {
  try {
    setSkillStatus('正在测试连接...', 'info');
    const data = await api('/api/skill-chat/test', { method: 'POST', body: '{}' });
    $('skillApiUrl').textContent = data.apiUrl || $('skillApiUrl').textContent;
    setSkillStatus(`${data.message}；当前模型 ${data.selected}；可用模型 ${data.modelCount} 个`, 'success');
    toast('Skill 对话连接成功', 'success');
  } catch (error) {
    setSkillStatus(`连接失败：${error.message}`, 'error');
    toast(`连接失败：${error.message}`, 'error');
  }
}

async function sendSkillPrompt() {
  const prompt = $('skillPrompt').value.trim();
  if (!prompt || skillBusy) return;
  skillMessages.push({ role: 'user', content: prompt });
  $('skillPrompt').value = '';
  renderSkillMessages();
  setSkillBusy(true);
  skillMessages.push({ role: 'assistant', content: '正在分析...' });
  renderSkillMessages();
  try {
    const payloadMessages = skillMessages
      .filter((item) => item.content !== '正在分析...')
      .map(({ role, content }) => ({ role, content }));
    const reply = await api('/api/skill-chat/chat', {
      method: 'POST',
      body: JSON.stringify({
        model: $('skillModel').value,
        skillName: $('skillName').value,
        messages: payloadMessages,
      }),
    });
    skillMessages[skillMessages.length - 1] = { role: 'assistant', content: reply.content || '' };
    renderSkillMessages();
  } catch (error) {
    skillMessages[skillMessages.length - 1] = { role: 'assistant', content: `出错了：${error.message}` };
    renderSkillMessages();
    toast(`发送失败：${error.message}`, 'error');
  } finally {
    setSkillBusy(false);
    $('skillPrompt').focus();
  }
}

function clearSkillChat() {
  skillMessages = [];
  renderSkillMessages();
}

// ===== GitHub 同步 =====
function formatRunStatus(run) {
  if (!run) return '暂无记录';
  return `${run.status || '-'}${run.conclusion ? ` / ${run.conclusion}` : ''}`;
}

function formatTimeText(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (isNaN(d.getTime())) return String(value);
  return formatDateText(d);
}

function setPublishLink(id, url, fallback = '-') {
  const el = $(id);
  if (!el) return;
  if (url) {
    el.href = url;
    el.textContent = url;
    el.classList.remove('disabled');
  } else {
    el.href = '#';
    el.textContent = fallback;
    el.classList.add('disabled');
  }
}

function openPublishUrl(kind) {
  const data = publishStatusCache || {};
  const url = kind === 'site' ? data.siteUrl : kind === 'actions' ? data.actionsUrl : data.repoUrl;
  if (url) window.open(url, '_blank', 'noopener');
  else toast('还没有读取到可打开的地址', 'info');
}

function renderPublishStatus(data) {
  publishStatusCache = data || {};
  const run = publishStatusCache.latestRun;
  $('publishRepo').textContent = publishStatusCache.repoPath || '未识别';
  $('publishBranch').textContent = publishStatusCache.branch || '-';
  $('publishHead').textContent = publishStatusCache.shortSha
    ? `${publishStatusCache.shortSha} ${publishStatusCache.headMessage || ''}`.trim()
    : '-';
  $('publishDirty').textContent = `${publishStatusCache.dirtyCount || 0} 个文件`;
  $('publishCredential').textContent = publishStatusCache.credentialReady ? '可用' : '未检测到';
  $('publishCredential').className = publishStatusCache.credentialReady ? 'status-good' : 'status-warn';
  $('publishRunStatus').textContent = formatRunStatus(run);
  $('publishRunTime').textContent = formatTimeText(run && (run.updated_at || run.created_at));
  $('publishRoot').textContent = publishStatusCache.rootPath || '/';
  setPublishLink('publishSite', publishStatusCache.siteUrl, '-');

  const dirtyList = $('publishDirtyList');
  const files = publishStatusCache.dirtyFiles || [];
  dirtyList.innerHTML = files.length
    ? files.map((file) => `<code>${escapeHtml(file)}</code>`).join('')
    : '<span class="muted">当前没有未提交改动。</span>';

  const runError = $('publishRunError');
  if (publishStatusCache.latestRunError) {
    runError.textContent = publishStatusCache.latestRunError;
    runError.classList.remove('hidden');
  } else {
    runError.textContent = '';
    runError.classList.add('hidden');
  }
}

async function loadPublishStatus(silent = false) {
  try {
    if (!silent && $('publishJobState')) $('publishJobState').textContent = '刷新中';
    const data = await api('/api/publish/status');
    renderPublishStatus(data);
    if ($('publishJobState')) $('publishJobState').textContent = '就绪';
    return data;
  } catch (error) {
    if ($('publishJobState')) $('publishJobState').textContent = '读取失败';
    if (!silent) toast(`读取同步状态失败：${error.message}`, 'error');
    return null;
  }
}

// ===== 发布 =====
async function startPublish(options = {}) {
  const { saveCurrent = true } = options;
  if (saveCurrent && (isDirty || !currentFile)) {
    const post = await savePost(true);
    if (!post) return;
  }
  $('jobState').textContent = '发布中';
  if ($('publishJobState')) $('publishJobState').textContent = '同步中';
  $('logDrawer').classList.remove('collapsed');
  $('logToggle').textContent = '▼';
  log('正在创建发布任务...');
  try {
    const { jobId } = await api('/api/publish', { method: 'POST', body: '{}' });
    const timer = setInterval(async () => {
      try {
        const job = await api(`/api/jobs/${jobId}`);
        $('jobState').textContent = job.status;
        log(job.logs.join('\n'));
        if (job.status === 'success') {
          clearInterval(timer);
          if ($('publishJobState')) $('publishJobState').textContent = '同步完成';
          toast('发布成功！', 'success', 3000);
          await loadPosts();
          await loadPublishStatus(true);
        } else if (job.status === 'failed') {
          clearInterval(timer);
          if ($('publishJobState')) $('publishJobState').textContent = '同步失败';
          toast('发布失败，查看日志', 'error', 4000);
        }
      } catch (error) {
        clearInterval(timer);
        $('jobState').textContent = '错误';
        if ($('publishJobState')) $('publishJobState').textContent = '错误';
        log(error.message);
      }
    }, 1500);
  } catch (error) {
    log(error.message);
    toast(error.message, 'error');
  }
}

// ===== Tab 切换 =====
function switchTab(tab) {
  currentTab = tab;
  $$('.nav-tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  $$('.tab-panel').forEach((p) => p.classList.toggle('active', p.dataset.panel === tab));
  if (tab === 'site') loadSiteConfig();
  if (tab === 'publish') loadPublishStatus();
  if (tab === 'skill-chat') { loadSkillStatus(); renderSkillMessages(); }
  if (tab === 'more') { loadContact(); loadTrash(); }
  if (tab === 'posts') renderPostTable();
}

// ===== 主题 =====
function toggleTheme() {
  const isDark = document.documentElement.classList.toggle('dark');
  localStorage.setItem('bokeAdminTheme', isDark ? 'dark' : 'light');
  $('themeToggle').textContent = isDark ? '☀️' : '🌙';
}

function applyStoredTheme() {
  if (localStorage.getItem('bokeAdminTheme') === 'dark') {
    document.documentElement.classList.add('dark');
    $('themeToggle').textContent = '☀️';
  }
}

// ===== 工具函数 =====
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function formatDateText(value) {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return String(value).slice(0, 16);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ===== 事件绑定 =====
function bindEvents() {
  // 登录
  $('login').querySelector('form').onsubmit = async (event) => {
    event.preventDefault();
    try {
      const data = await api('/api/login', { method: 'POST', body: JSON.stringify({ password: $('password').value }) });
      token = data.token;
      localStorage.setItem('bokeAdminToken', token);
      await afterLogin();
    } catch (error) {
      toast(error.message, 'error');
    }
  };

  // Tab 导航
  $$('.nav-tab').forEach((b) => { b.onclick = () => switchTab(b.dataset.tab); });

  // 文章管理
  $('newPost').onclick = newPost;
  $('importMdBtn').onclick = () => $('mdImportInput').click();
  $('postSearch').oninput = renderPostList;
  $('postSearchAll').oninput = renderPostTable;
  $('postSortBy').onchange = renderPostTable;

  // 编辑器表单
  $('title').oninput = markDirty;
  $('categories').oninput = markDirty;
  $('tags').oninput = markDirty;
  $('description').oninput = markDirty;
  $('excerpt').oninput = markDirty;
  $('cover').oninput = markDirty;
  $('indexImg').oninput = markDirty;
  $('bannerImg').oninput = markDirty;
  $('postDate').oninput = markDirty;
  $('sticky').onchange = markDirty;
  $('content').oninput = () => {
    markDirty();
    updateWordCount();
    if (!$('preview').classList.contains('hidden')) updatePreview();
  };

  // Markdown 工具栏
  $$('.md-toolbar [data-md]').forEach((btn) => { btn.onclick = () => applyMdAction(btn.dataset.md); });
  $('previewToggle').onclick = togglePreview;
  $('uploadBtn').onclick = () => $('fileInput').click();
  $('zipUploadBtn').onclick = () => $('zipFileInput').click();
  $('protectedUploadBtn').onclick = () => $('protectedFileInput').click();

  // 操作按钮
  $('saveBtn').onclick = () => savePost();
  $('deleteBtn').onclick = deleteCurrentPost;
  $('publishBtn').onclick = () => startPublish().catch((e) => log(e.message));
  $('openSiteBtn').onclick = () => window.open('https://wfcrush.github.io/boke/', '_blank');

  // 顶栏
  $('themeToggle').onclick = toggleTheme;
  $('logoutBtn').onclick = async () => {
    const ok = await confirmDialog('退出登录', '确定要退出吗？', false);
    if (ok) {
      localStorage.removeItem('bokeAdminToken');
      location.reload();
    }
  };

  // 站点配置
  $('saveSiteCfg').onclick = saveSiteConfig;
  $('reloadSiteCfg').onclick = loadSiteConfig;

  // GitHub 同步
  $('publishSyncBtn').onclick = () => startPublish({ saveCurrent: false }).catch((e) => log(e.message));
  $('refreshPublishStatus').onclick = () => loadPublishStatus();
  $('publishOpenSite').onclick = () => openPublishUrl('site');
  $('publishOpenRepo').onclick = () => openPublishUrl('repo');
  $('publishOpenActions').onclick = () => openPublishUrl('actions');
  $('clearPublishLog').onclick = () => {
    log('准备就绪。');
    $('jobState').textContent = '就绪';
    $('publishJobState').textContent = '就绪';
  };

  // 联系方式
  $('saveContact').onclick = saveContact;
  $('reloadTrash').onclick = loadTrash;

  // Skill 对话
  $('saveSkillConfig').onclick = saveSkillConfig;
  $('loadSkillModels').onclick = loadSkillModels;
  $('testSkillConnection').onclick = testSkillConnection;
  $('sendSkillPrompt').onclick = sendSkillPrompt;
  $('clearSkillChat').onclick = clearSkillChat;
  $('skillPrompt').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      sendSkillPrompt();
    }
  });

  // 文件上传
  $('fileInput').onchange = () => {
    const [file] = $('fileInput').files;
    if (file) uploadFile(file).catch((e) => toast(e.message, 'error'));
    $('fileInput').value = '';
  };
  $('zipFileInput').onchange = () => {
    const [file] = $('zipFileInput').files;
    if (file) uploadFile(file).catch((e) => toast(e.message, 'error'));
    $('zipFileInput').value = '';
  };
  $('protectedFileInput').onchange = () => {
    const [file] = $('protectedFileInput').files;
    if (file) uploadProtectedFile(file).catch((e) => toast(e.message, 'error'));
    $('protectedFileInput').value = '';
  };
  $('mdImportInput').onchange = () => {
    const files = $('mdImportInput').files;
    if (files && files.length) importMarkdownFiles(files);
    $('mdImportInput').value = '';
  };

  // 日志抽屉
  $('logToggle').onclick = () => {
    $('logDrawer').classList.toggle('collapsed');
    $('logToggle').textContent = $('logDrawer').classList.contains('collapsed') ? '▲' : '▼';
  };

  // 全局拖拽：编辑器里拖 ZIP 会作为附件上传；文章列表里拖 ZIP 会作为文章包导入。
  let dragCounter = 0;
  window.addEventListener('dragenter', (e) => {
    if (!token) return;
    if (!e.dataTransfer || !Array.from(e.dataTransfer.types || []).includes('Files')) return;
    dragCounter++;
    $('dropOverlay').classList.remove('hidden');
  });
  window.addEventListener('dragover', (e) => { if (token) e.preventDefault(); });
  window.addEventListener('dragleave', () => {
    if (!token) return;
    dragCounter = Math.max(0, dragCounter - 1);
    if (dragCounter === 0) $('dropOverlay').classList.add('hidden');
  });
  window.addEventListener('drop', async (e) => {
    if (!token) return;
    e.preventDefault();
    dragCounter = 0;
    $('dropOverlay').classList.add('hidden');
    const files = Array.from((e.dataTransfer && e.dataTransfer.files) || []);
    const markdownFiles = files.filter((f) => /\.(md|markdown)$/i.test(f.name));
    const zipFiles = files.filter((f) => /\.zip$/i.test(f.name));
    const attachFiles = files.filter((f) => /\.(zip|pdf|docx?|pptx|xlsx|png|jpe?g|gif|webp)$/i.test(f.name));
    if (markdownFiles.length) {
      await importMarkdownFiles(markdownFiles);
    } else if (currentTab === 'editor' && attachFiles.length) {
      for (const file of attachFiles) {
        try { await uploadFile(file); } catch (err) { toast(err.message, 'error'); }
      }
    } else if (zipFiles.length) {
      await importMarkdownFiles(zipFiles);
    } else if (files.length) {
      toast('编辑器支持拖拽 ZIP/图片/文档作为附件；文章列表支持 .md/.zip 文章包导入', 'info');
    }
  });

  // 全局快捷键
  window.addEventListener('keydown', (e) => {
    if (currentTab === 'skill-chat') return;
    const ctrl = e.ctrlKey || e.metaKey;
    if (!ctrl) return;
    if (e.key === 's' || e.key === 'S') { e.preventDefault(); savePost(); }
    else if (e.key === 'b' || e.key === 'B') { if (document.activeElement === $('content')) { e.preventDefault(); applyMdAction('bold'); } }
    else if (e.key === 'i' || e.key === 'I') { if (document.activeElement === $('content')) { e.preventDefault(); applyMdAction('italic'); } }
    else if (e.key === 'k' || e.key === 'K') { if (document.activeElement === $('content')) { e.preventDefault(); applyMdAction('link'); } }
    else if (e.key === 'p' || e.key === 'P') { e.preventDefault(); togglePreview(); }
    else if (e.key === 'Enter') { e.preventDefault(); startPublish().catch((err) => log(err.message)); }
  });

  // 离开页面前提醒
  window.addEventListener('beforeunload', (e) => {
    if (isDirty) { e.preventDefault(); e.returnValue = ''; }
  });
}

// ===== 登录后初始化 =====
async function afterLogin() {
  $('login').classList.add('hidden');
  $('app').classList.remove('hidden');
  await loadPosts();
  await loadTaxonomy();
  await loadSkillStatus();
  renderSkillMessages();
  newPost();
  await tryRestoreDraft();
}

// ===== 启动 =====
applyStoredTheme();
bindEvents();
if (token) {
  afterLogin().catch(() => {
    localStorage.removeItem('bokeAdminToken');
    location.reload();
  });
}
