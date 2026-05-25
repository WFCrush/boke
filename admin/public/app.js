let token = localStorage.getItem('bokeAdminToken') || '';
let currentFile = '';

const $ = (id) => document.getElementById(id);

function log(message) {
  $('log').textContent = typeof message === 'string' ? message : JSON.stringify(message, null, 2);
  $('log').scrollTop = $('log').scrollHeight;
}

async function api(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-admin-token': token,
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || '操作失败');
  return data;
}

function postForm() {
  return {
    title: $('title').value.trim() || '未命名文章',
    slug: $('slug').value.trim(),
    categories: $('categories').value.trim(),
    tags: $('tags').value.trim(),
    content: $('content').value,
  };
}

function fillEditor(post) {
  currentFile = post.file || '';
  $('editorTitle').textContent = post.title || '新建文章';
  $('currentFile').textContent = currentFile || '未保存';
  $('title').value = post.title || '';
  $('slug').value = currentFile ? currentFile.replace(/\.md$/i, '') : '';
  $('categories').value = Array.isArray(post.categories) ? post.categories.join(', ') : '';
  $('tags').value = Array.isArray(post.tags) ? post.tags.join(', ') : '';
  $('content').value = post.content || '';
}

async function loadPosts() {
  const posts = await api('/api/posts');
  $('postList').innerHTML = '';
  posts.forEach((post) => {
    const button = document.createElement('button');
    button.className = 'post-item';
    button.innerHTML = `<strong>${post.title}</strong><span>${post.file}</span>`;
    button.onclick = () => openPost(post.file);
    $('postList').appendChild(button);
  });
}

async function openContact() {
  const contact = await api('/api/contact');
  $('contactQq').value = contact.qq || '';
  $('contactWechat').value = contact.wechat || '';
  $('contactWechatQr').value = contact.wechatQr || '';
  $('contactNote').value = contact.note || '';
  $('contactModal').classList.remove('hidden');
}

async function openPost(file) {
  const post = await api(`/api/posts/${encodeURIComponent(file)}`);
  fillEditor(post);
  log('文章已打开。');
}

function newPost() {
  fillEditor({
    title: '',
    file: '',
    categories: [],
    tags: [],
    content: '# 标题\n\n这里开始写正文。\n',
  });
  log('已新建草稿，保存后会写入文章目录。');
}

async function savePost() {
  const body = postForm();
  const url = currentFile ? `/api/posts/${encodeURIComponent(currentFile)}` : '/api/posts';
  const method = currentFile ? 'PUT' : 'POST';
  const post = await api(url, { method, body: JSON.stringify(body) });
  fillEditor(post);
  await loadPosts();
  log('保存成功。');
}

function insertAtCursor(text) {
  const area = $('content');
  const start = area.selectionStart;
  const end = area.selectionEnd;
  area.value = `${area.value.slice(0, start)}${text}${area.value.slice(end)}`;
  area.focus();
  area.selectionStart = area.selectionEnd = start + text.length;
}

function insertColumns() {
  insertAtCursor(`<div class="boke-columns">\n  <div>\n\n### 左边标题\n\n左边内容。\n\n  </div>\n  <div>\n\n### 右边标题\n\n右边内容。\n\n  </div>\n</div>\n`);
}

async function uploadFile(file) {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch('/api/upload', {
    method: 'POST',
    headers: { 'x-admin-token': token },
    body: form,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '上传失败');
  insertAtCursor(`\n${data.markdown}\n`);
  log(`上传成功：${data.url}`);
}

async function uploadProtectedFile(file) {
  const password = prompt('请设置这个文档的打开密码：');
  if (!password) {
    log('已取消密码上传。');
    return;
  }
  const form = new FormData();
  form.append('file', file);
  form.append('password', password);
  const res = await fetch('/api/upload-protected', {
    method: 'POST',
    headers: { 'x-admin-token': token },
    body: form,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '上传失败');
  insertAtCursor(`\n${data.markdown}\n`);
  log(`安全文档已上传：${data.url}\n请记住密码，系统不会保存明文密码。\n提示：公开网页无法绝对禁止截图或录屏，但这个模式不会发布原文件明文。`);
}

async function command(url, label) {
  log(`${label}中，请稍等...`);
  const result = await api(url, { method: 'POST', body: '{}' });
  log(result.output || (result.ok ? `${label}完成。` : `${label}失败。`));
}

async function startPublish() {
  await savePost();
  $('jobState').textContent = '发布中';
  log('正在创建发布任务...');
  const { jobId } = await api('/api/publish', { method: 'POST', body: '{}' });
  const timer = setInterval(async () => {
    try {
      const job = await api(`/api/jobs/${jobId}`);
      $('jobState').textContent = job.status;
      log(job.logs.join('\n'));
      if (job.status === 'success' || job.status === 'failed') {
        clearInterval(timer);
        await loadPosts();
      }
    } catch (error) {
      clearInterval(timer);
      $('jobState').textContent = '错误';
      log(error.message);
    }
  }, 1500);
}

$('login').querySelector('form').onsubmit = async (event) => {
  event.preventDefault();
  try {
    const data = await api('/api/login', {
      method: 'POST',
      body: JSON.stringify({ password: $('password').value }),
    });
    token = data.token;
    localStorage.setItem('bokeAdminToken', token);
    $('login').classList.add('hidden');
    $('app').classList.remove('hidden');
    await loadPosts();
    newPost();
  } catch (error) {
    alert(error.message);
  }
};

$('newPost').onclick = newPost;
$('contactBtn').onclick = () => openContact().catch((error) => log(error.message));
$('policyBtn').onclick = () => $('policyModal').classList.remove('hidden');
$('closeContact').onclick = () => $('contactModal').classList.add('hidden');
$('closePolicy').onclick = () => $('policyModal').classList.add('hidden');
$('contactModal').querySelector('form').onsubmit = async (event) => {
  event.preventDefault();
  await api('/api/contact', {
    method: 'PUT',
    body: JSON.stringify({
      qq: $('contactQq').value,
      wechat: $('contactWechat').value,
      wechatQr: $('contactWechatQr').value,
      note: $('contactNote').value,
    }),
  });
  $('contactModal').classList.add('hidden');
  log('联系方式已保存，发布上线后前台会显示。');
};
$('saveBtn').onclick = () => savePost().catch((error) => log(error.message));
$('insertColumns').onclick = insertColumns;
$('buildBtn').onclick = () => command('/api/build', '生成').catch((error) => log(error.message));
$('publishBtn').onclick = () => startPublish().catch((error) => log(error.message));
$('openSiteBtn').onclick = () => window.open('https://wfcrush.github.io/boke/', '_blank');
$('uploadBtn').onclick = () => $('fileInput').click();
$('protectedUploadBtn').onclick = () => $('protectedFileInput').click();
$('fileInput').onchange = () => {
  const [file] = $('fileInput').files;
  if (file) uploadFile(file).catch((error) => log(error.message));
  $('fileInput').value = '';
};
$('protectedFileInput').onchange = () => {
  const [file] = $('protectedFileInput').files;
  if (file) uploadProtectedFile(file).catch((error) => log(error.message));
  $('protectedFileInput').value = '';
};

if (token) {
  $('login').classList.add('hidden');
  $('app').classList.remove('hidden');
  loadPosts().then(newPost).catch(() => {
    localStorage.removeItem('bokeAdminToken');
    location.reload();
  });
}
