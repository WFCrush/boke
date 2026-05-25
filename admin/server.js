const crypto = require('crypto');
const { execFile, spawn } = require('child_process');
const fs = require('fs/promises');
const fss = require('fs');
const path = require('path');

const express = require('express');
const matter = require('gray-matter');
const multer = require('multer');
const slugify = require('slugify');

const root = path.resolve(__dirname, '..');
const postsDir = path.join(root, 'source', '_posts');
const uploadsDir = path.join(root, 'source', 'uploads');
const secureDir = path.join(root, 'source', 'secure');
const publicDir = path.join(__dirname, 'public');
const hexoConfig = path.join(root, '_config.yml');
const publishDir = path.join(root, 'public');
const port = Number(process.env.ADMIN_PORT || 5050);
const passwordFile = path.join(root, '.admin-password');
let password = process.env.ADMIN_PASSWORD || 'admin123';
const sessions = new Map();
const jobs = new Map();

const app = express();

app.use(express.json({ limit: '2mb' }));
app.use(express.static(publicDir));

const upload = multer({
  dest: path.join(root, '.admin-tmp'),
  limits: { fileSize: 80 * 1024 * 1024 },
});

function safeName(value, fallback = 'post') {
  const raw = String(value || '').trim();
  const chineseSafe = raw
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
    .replace(/\s+/g, '-')
    .replace(/^\.+|\.+$/g, '');
  if (chineseSafe) return chineseSafe;
  const base = slugify(raw, { lower: true, strict: true, locale: 'zh' });
  return base || fallback;
}

async function uniquePostFile(base) {
  let file = `${base}.md`;
  let index = 2;
  while (true) {
    try {
      await fs.access(path.join(postsDir, file));
      file = `${base}-${index}.md`;
      index += 1;
    } catch (_) {
      return file;
    }
  }
}

function todayString() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

async function getSiteRoot() {
  try {
    const config = await fs.readFile(hexoConfig, 'utf8');
    const match = config.match(/^root:\s*(.+?)\s*$/m);
    const configured = match ? match[1].replace(/^['"]|['"]$/g, '').trim() : '/';
    const withLeading = configured.startsWith('/') ? configured : `/${configured}`;
    return withLeading.endsWith('/') ? withLeading : `${withLeading}/`;
  } catch (_) {
    return '/';
  }
}

function assertLocal(req, res, next) {
  const ip = req.ip || req.socket.remoteAddress || '';
  if (ip.includes('127.0.0.1') || ip.includes('::1') || ip === '::ffff:127.0.0.1') {
    next();
    return;
  }
  res.status(403).json({ error: '后台只允许本机访问' });
}

function auth(req, res, next) {
  const token = req.header('x-admin-token');
  if (token && sessions.has(token)) {
    next();
    return;
  }
  res.status(401).json({ error: '请先登录' });
}

async function ensureDirs() {
  await fs.mkdir(postsDir, { recursive: true });
  await fs.mkdir(uploadsDir, { recursive: true });
  await fs.mkdir(secureDir, { recursive: true });
}

async function readPost(file) {
  const fullPath = path.join(postsDir, file);
  const raw = await fs.readFile(fullPath, 'utf8');
  const parsed = matter(raw);
  return {
    file,
    title: parsed.data.title || file.replace(/\.md$/i, ''),
    date: parsed.data.date || '',
    categories: parsed.data.categories || [],
    tags: parsed.data.tags || [],
    content: parsed.content.trimStart(),
  };
}

function normalizeList(value) {
  if (Array.isArray(value)) return value.filter(Boolean).map(String);
  if (!value) return [];
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function postMarkdown(input) {
  const data = {
    title: input.title || '未命名文章',
    date: input.date || todayString(),
    categories: normalizeList(input.categories),
    tags: normalizeList(input.tags),
  };
  return matter.stringify(String(input.content || '').trimStart(), data);
}

function run(command, args) {
  return new Promise((resolve) => {
    execFile(command, args, { cwd: root, shell: true }, (error, stdout, stderr) => {
      resolve({
        ok: !error,
        code: error ? error.code : 0,
        output: [stdout, stderr].filter(Boolean).join('\n').trim(),
      });
    });
  });
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeJob() {
  const id = crypto.randomBytes(12).toString('hex');
  const job = { id, status: 'running', logs: [], startedAt: new Date().toISOString(), siteOk: false };
  jobs.set(id, job);
  return job;
}

function addLog(job, message) {
  const line = `[${new Date().toLocaleTimeString()}] ${message}`;
  job.logs.push(line);
  if (job.logs.length > 600) job.logs.shift();
}

function runStreaming(job, command, args, options = {}) {
  return new Promise((resolve) => {
    addLog(job, `> ${[command, ...args].join(' ')}`);
    const isCmd = process.platform === 'win32' && command.toLowerCase().endsWith('.cmd');
    const actualCommand = isCmd ? 'cmd.exe' : command;
    const actualArgs = isCmd ? ['/d', '/s', '/c', command, ...args] : args;
    const child = spawn(actualCommand, actualArgs, {
      cwd: root,
      shell: false,
      env: { ...process.env, ...options.env },
    });
    let output = '';
    child.stdout.on('data', (chunk) => {
      const text = chunk.toString('utf8');
      output += text;
      text.split(/\r?\n/).filter(Boolean).forEach((line) => addLog(job, line));
    });
    child.stderr.on('data', (chunk) => {
      const text = chunk.toString('utf8');
      output += text;
      text.split(/\r?\n/).filter(Boolean).forEach((line) => addLog(job, line));
    });
    child.on('close', (code) => {
      resolve({ ok: code === 0, code, output });
    });
  });
}

async function getCredentialToken() {
  const result = await run('git', ['credential', 'fill'], {
    input: 'protocol=https\nhost=github.com\n\n',
  });
  const match = result.output.match(/^password=(.+)$/m);
  return match ? match[1].trim() : '';
}

function runWithInput(command, args, input) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd: root, shell: true });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk.toString('utf8'); });
    child.stderr.on('data', (chunk) => { output += chunk.toString('utf8'); });
    child.on('close', (code) => resolve({ ok: code === 0, code, output }));
    child.stdin.end(input);
  });
}

async function githubRequest(pathname, options = {}) {
  const tokenResult = await runWithInput('git', ['credential', 'fill'], 'protocol=https\nhost=github.com\n\n');
  const token = (tokenResult.output.match(/^password=(.+)$/m) || [])[1];
  if (!token) throw new Error('没有找到 GitHub 登录凭据');
  const res = await fetch(`https://api.github.com${pathname}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token.trim()}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'boke-admin',
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

async function latestPagesRun() {
  const data = await githubRequest('/repos/WFCrush/boke/actions/workflows/pages.yml/runs?per_page=1');
  return data.workflow_runs && data.workflow_runs[0];
}

async function checkPublicSite() {
  const res = await fetch('https://wfcrush.github.io/boke/', { cache: 'no-store' });
  return res.ok;
}

async function waitForDeployment(job) {
  addLog(job, '正在监测 GitHub Pages 自动部署...');
  let lastId = '';
  for (let i = 0; i < 36; i += 1) {
    const runInfo = await latestPagesRun();
    if (runInfo) {
      lastId = runInfo.id;
      job.actionsUrl = runInfo.html_url;
      addLog(job, `GitHub Actions: ${runInfo.status}${runInfo.conclusion ? ` / ${runInfo.conclusion}` : ''}`);
      if (runInfo.status === 'completed') {
        if (runInfo.conclusion !== 'success') throw new Error(`GitHub Actions 部署失败：${runInfo.html_url}`);
        break;
      }
    }
    await wait(5000);
  }

  addLog(job, '正在检测公开博客是否可访问...');
  for (let i = 0; i < 18; i += 1) {
    if (await checkPublicSite()) {
      job.siteOk = true;
      addLog(job, '公开博客已经可以访问：https://wfcrush.github.io/boke/');
      return;
    }
    addLog(job, '公开博客暂未刷新，继续等待...');
    await wait(5000);
  }
  throw new Error(`部署任务 ${lastId || ''} 已结束，但公开页面暂未检测到更新`);
}

async function runPublishJob(job) {
  try {
    const build = await runStreaming(job, 'npm.cmd', ['run', 'build']);
    if (!build.ok) throw new Error('本地构建失败');

    await runStreaming(job, 'git', ['add', '.']);
    const status = await runStreaming(job, 'git', ['status', '--porcelain']);
    if (!status.output.trim()) {
      addLog(job, '没有新的本地改动需要提交。');
    } else {
      const message = `update blog ${new Date().toLocaleString('zh-CN', { hour12: false })}`;
      const commit = await runStreaming(job, 'git', ['commit', '-m', message]);
      if (!commit.ok) throw new Error('提交失败');
      const push = await runStreaming(job, 'git', ['push']);
      if (!push.ok) throw new Error('推送到 GitHub 失败');
    }

    await waitForDeployment(job);
    job.status = 'success';
    addLog(job, '发布完成，其他人刷新公开博客即可看到。');
  } catch (error) {
    job.status = 'failed';
    addLog(job, `发布失败：${error.message}`);
  }
  job.finishedAt = new Date().toISOString();
}

async function encryptFile(inputPath, outputPath, passwordText) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.pbkdf2Sync(passwordText, salt, 210000, 32, 'sha256');
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const source = await fs.readFile(inputPath);
  const encrypted = Buffer.concat([cipher.update(source), cipher.final()]);
  const tag = cipher.getAuthTag();
  await fs.writeFile(outputPath, JSON.stringify({
    v: 1,
    alg: 'AES-GCM',
    kdf: 'PBKDF2',
    hash: 'SHA-256',
    iterations: 210000,
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    data: encrypted.toString('base64'),
  }));
}

app.use(assertLocal);

app.post('/api/login', (req, res) => {
  if (req.body.password !== password) {
    res.status(401).json({ error: '密码不正确' });
    return;
  }
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, Date.now());
  res.json({ token });
});

app.get('/api/posts', auth, async (_req, res) => {
  await ensureDirs();
  const files = (await fs.readdir(postsDir)).filter((file) => file.endsWith('.md'));
  const posts = await Promise.all(files.map(readPost));
  posts.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  res.json(posts.map(({ content, ...post }) => post));
});

app.get('/api/posts/:file', auth, async (req, res) => {
  res.json(await readPost(req.params.file));
});

app.post('/api/posts', auth, async (req, res) => {
  await ensureDirs();
  const title = req.body.title || '未命名文章';
  const file = await uniquePostFile(safeName(req.body.slug || title, `post-${Date.now()}`));
  const fullPath = path.join(postsDir, file);
  try {
    await fs.access(fullPath);
    res.status(409).json({ error: '同名文章已经存在' });
    return;
  } catch (_) {
    await fs.writeFile(fullPath, postMarkdown({ ...req.body, title }), 'utf8');
    res.json(await readPost(file));
  }
});

app.put('/api/posts/:file', auth, async (req, res) => {
  await ensureDirs();
  const file = req.params.file;
  if (!file.endsWith('.md') || file.includes('/') || file.includes('\\')) {
    res.status(400).json({ error: '文件名不合法' });
    return;
  }
  await fs.writeFile(path.join(postsDir, file), postMarkdown(req.body), 'utf8');
  res.json(await readPost(file));
});

app.delete('/api/posts/:file', auth, async (req, res) => {
  const file = req.params.file;
  if (!file.endsWith('.md') || file.includes('/') || file.includes('\\')) {
    res.status(400).json({ error: '文件名不合法' });
    return;
  }
  await fs.rm(path.join(postsDir, file), { force: true });
  res.json({ ok: true });
});

app.post('/api/upload', auth, upload.single('file'), async (req, res) => {
  await ensureDirs();
  if (!req.file) {
    res.status(400).json({ error: '请选择文件' });
    return;
  }
  const ext = path.extname(req.file.originalname).toLowerCase();
  const allowed = new Set(['.pdf', '.docx', '.doc', '.pptx', '.xlsx', '.zip', '.png', '.jpg', '.jpeg', '.gif', '.webp']);
  if (!allowed.has(ext)) {
    await fs.rm(req.file.path, { force: true });
    res.status(400).json({ error: '暂不支持这个文件类型' });
    return;
  }
  const name = `${Date.now()}-${safeName(path.basename(req.file.originalname, ext), 'file')}${ext}`;
  const target = path.join(uploadsDir, name);
  await fs.rename(req.file.path, target);
  const rootPath = await getSiteRoot();
  const publicUrl = `${rootPath.replace(/\/$/, '')}/uploads/${encodeURIComponent(name)}`;
  res.json({
    name,
    url: publicUrl,
    markdown: ext.match(/\.(png|jpe?g|gif|webp)$/) ? `![${name}](${publicUrl})` : `[${name}](${publicUrl})`,
  });
});

app.post('/api/upload-protected', auth, upload.single('file'), async (req, res) => {
  await ensureDirs();
  if (!req.file) {
    res.status(400).json({ error: '请选择文件' });
    return;
  }
  const filePassword = String(req.body.password || '').trim();
  if (!filePassword) {
    await fs.rm(req.file.path, { force: true });
    res.status(400).json({ error: '请设置文件打开密码' });
    return;
  }
  const ext = path.extname(req.file.originalname).toLowerCase();
  const allowed = new Set(['.pdf', '.docx', '.doc', '.pptx', '.xlsx', '.zip']);
  if (!allowed.has(ext)) {
    await fs.rm(req.file.path, { force: true });
    res.status(400).json({ error: '加密文档支持 PDF、Word、PPT、Excel 和 ZIP' });
    return;
  }
  const base = `${Date.now()}-${safeName(path.basename(req.file.originalname, ext), 'file')}`;
  const encryptedName = `${base}${ext}.locked`;
  const targetDir = path.join(secureDir, 'files');
  await fs.mkdir(targetDir, { recursive: true });
  await encryptFile(req.file.path, path.join(targetDir, encryptedName), filePassword);
  await fs.rm(req.file.path, { force: true });
  const rootPath = await getSiteRoot();
  const filePath = `files/${encodeURIComponent(encryptedName)}`;
  const openUrl = `${rootPath.replace(/\/$/, '')}/secure/?file=${filePath}&name=${encodeURIComponent(req.file.originalname)}`;
  res.json({
    name: req.file.originalname,
    url: openUrl,
    markdown: `[${req.file.originalname}](${openUrl})`,
  });
});

app.post('/api/build', auth, async (_req, res) => {
  res.json(await run('npm.cmd', ['run', 'build']));
});

app.post('/api/publish', auth, async (_req, res) => {
  const job = makeJob();
  addLog(job, '发布任务已创建。');
  runPublishJob(job);
  res.json({ jobId: job.id });
});

app.get('/api/jobs/:id', auth, (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) {
    res.status(404).json({ error: '任务不存在' });
    return;
  }
  res.json(job);
});

app.listen(port, '127.0.0.1', async () => {
  await ensureDirs();
  try {
    const filePassword = (await fs.readFile(passwordFile, 'utf8')).trim();
    if (filePassword) password = filePassword;
  } catch (_) {
    // Use the default or environment password when no local password file exists.
  }
  console.log(`博客管理员后台已启动：http://127.0.0.1:${port}`);
  console.log(`默认密码：${password}`);
});
