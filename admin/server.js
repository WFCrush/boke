const crypto = require('crypto');
const { execFile, spawn } = require('child_process');
const fs = require('fs/promises');
const fss = require('fs');
const path = require('path');

const express = require('express');
const matter = require('gray-matter');
const multer = require('multer');
const mammoth = require('mammoth');
const slugify = require('slugify');

const root = path.resolve(__dirname, '..');
const postsDir = path.join(root, 'source', '_posts');
const uploadsDir = path.join(root, 'source', 'uploads');
const secureDir = path.join(root, 'source', 'secure');
const contactFile = path.join(root, 'source', 'contact', 'contact.json');
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
  await fs.mkdir(path.dirname(contactFile), { recursive: true });
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
    sticky: parsed.data.sticky || 0,
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
  const stickyValue = Number(input.sticky);
  if (Number.isFinite(stickyValue) && stickyValue > 0) {
    data.sticky = stickyValue;
  }
  return matter.stringify(String(input.content || '').trimStart(), data);
}

function formatYamlValue(value) {
  const s = String(value == null ? '' : value);
  if (s === '') return "''";
  if (/[:#'"&*!|>{}\[\],\n]/.test(s) || /^\s|\s$/.test(s) || /^(true|false|yes|no|null|~)$/i.test(s)) {
    return `'${s.replace(/'/g, "''")}'`;
  }
  return s;
}

function replaceTopLevelField(text, key, newValue) {
  const re = new RegExp(`^(${key}:[ \\t]*).*$`, 'm');
  if (!re.test(text)) return text;
  return text.replace(re, `$1${formatYamlValue(newValue)}`);
}

function findSectionRange(text, sectionName) {
  const startRe = new RegExp(`^${sectionName}:[ \\t]*\\r?\\n`, 'm');
  const startMatch = startRe.exec(text);
  if (!startMatch) return null;
  const startIdx = startMatch.index;
  const afterHeader = startMatch.index + startMatch[0].length;
  const rest = text.slice(afterHeader);
  const nextSectionRe = /^[a-zA-Z_][\w\-]*:/m;
  const nextMatch = nextSectionRe.exec(rest);
  const endIdx = nextMatch ? afterHeader + nextMatch.index : text.length;
  return { startIdx, headerEnd: afterHeader, endIdx };
}

function replaceFieldUnderSection(text, sectionName, fieldName, newValue) {
  const range = findSectionRange(text, sectionName);
  if (!range) return text;
  const sectionText = text.slice(range.headerEnd, range.endIdx);
  const fieldRe = new RegExp(`^([ \\t]+${fieldName}:[ \\t]*).*$`, 'm');
  if (!fieldRe.test(sectionText)) return text;
  const newSectionText = sectionText.replace(fieldRe, `$1${formatYamlValue(newValue)}`);
  return text.slice(0, range.headerEnd) + newSectionText + text.slice(range.endIdx);
}

function readFieldUnderSection(text, sectionName, fieldName) {
  const range = findSectionRange(text, sectionName);
  if (!range) return '';
  const sectionText = text.slice(range.headerEnd, range.endIdx);
  const fieldRe = new RegExp(`^[ \\t]+${fieldName}:[ \\t]*(.+?)\\s*$`, 'm');
  const m = sectionText.match(fieldRe);
  if (!m) return '';
  return m[1].replace(/^['"]|['"]$/g, '').trim();
}

function readSloganList(text) {
  const range = findSectionRange(text, 'index');
  if (!range) return [];
  const sectionText = text.slice(range.headerEnd, range.endIdx);
  const textBlockRe = /^[ \t]+text:[ \t]*\r?\n((?:[ \t]+-[ \t]+.+\r?\n?)+)/m;
  const m = sectionText.match(textBlockRe);
  if (!m) return [];
  return m[1]
    .split(/\r?\n/)
    .map((line) => {
      const itemMatch = line.match(/^[ \t]+-[ \t]+(.+?)\s*$/);
      if (!itemMatch) return null;
      return itemMatch[1].replace(/^['"]|['"]$/g, '').trim();
    })
    .filter(Boolean);
}

function replaceSloganList(text, slogans) {
  const range = findSectionRange(text, 'index');
  if (!range) return text;
  const sectionText = text.slice(range.headerEnd, range.endIdx);
  const textBlockRe = /^([ \t]+text:[ \t]*\r?\n)((?:[ \t]+-[ \t]+.+\r?\n?)+)/m;
  const m = sectionText.match(textBlockRe);
  if (!m) return text;
  const indent = (m[1].match(/^([ \t]+)/) || ['', '  '])[1];
  const itemIndent = `${indent}  `;
  const list = (slogans.length ? slogans : ['']).map((s) => `${itemIndent}- ${formatYamlValue(s)}`).join('\n');
  const newSectionText = sectionText.replace(textBlockRe, `$1${list}\n`);
  return text.slice(0, range.headerEnd) + newSectionText + text.slice(range.endIdx);
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

function execPlain(command, args) {
  return new Promise((resolve) => {
    execFile(command, args, { cwd: root, shell: false }, (error, stdout, stderr) => {
      resolve({
        ok: !error,
        code: error ? error.code : 0,
        output: [stdout, stderr].filter(Boolean).join('\n').trim(),
      });
    });
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

async function latestPostExpectation() {
  try {
    const files = (await fs.readdir(postsDir)).filter((file) => file.endsWith('.md'));
    const posts = await Promise.all(files.map(readPost));
    posts.sort((a, b) => {
      const aTime = new Date(a.date || 0).getTime() || 0;
      const bTime = new Date(b.date || 0).getTime() || 0;
      return bTime - aTime;
    });
    const latest = posts[0];
    return latest ? latest.title : '';
  } catch (_) {
    return '';
  }
}

async function publicSiteContains(text) {
  if (!text) return true;
  const res = await fetch(`https://wfcrush.github.io/boke/?v=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) return false;
  const html = await res.text();
  return html.includes(text);
}

async function waitForDeployment(job, expectedSha) {
  addLog(job, '正在监测 GitHub Pages 自动部署...');
  let lastId = '';
  for (let i = 0; i < 60; i += 1) {
    const runInfo = await latestPagesRun();
    if (runInfo) {
      lastId = runInfo.id;
      job.actionsUrl = runInfo.html_url;
      const shortSha = String(runInfo.head_sha || '').slice(0, 7);
      addLog(job, `GitHub Actions: ${runInfo.status}${runInfo.conclusion ? ` / ${runInfo.conclusion}` : ''} (${shortSha})`);
      if (expectedSha && runInfo.head_sha !== expectedSha) {
        addLog(job, '等待当前提交触发新的部署...');
      } else if (runInfo.status === 'completed') {
        if (runInfo.conclusion !== 'success') throw new Error(`GitHub Actions 部署失败：${runInfo.html_url}`);
        break;
      }
    }
    await wait(5000);
  }

  const expectedTitle = await latestPostExpectation();
  addLog(job, expectedTitle ? `正在检测公开博客是否出现文章：${expectedTitle}` : '正在检测公开博客是否可访问...');
  for (let i = 0; i < 18; i += 1) {
    if ((await checkPublicSite()) && (await publicSiteContains(expectedTitle))) {
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

    await runStreaming(job, 'git', ['config', 'http.postBuffer', '524288000']);
    await runStreaming(job, 'git', ['config', 'http.lowSpeedLimit', '0']);
    await runStreaming(job, 'git', ['config', 'http.lowSpeedTime', '999999']);
    await runStreaming(job, 'git', ['add', '.']);
    const status = await runStreaming(job, 'git', ['status', '--porcelain']);
    let shouldPush = false;
    if (!status.output.trim()) {
      addLog(job, '没有新的本地改动需要提交。');
    } else {
      const message = `update blog ${new Date().toLocaleString('zh-CN', { hour12: false })}`;
      const commit = await runStreaming(job, 'git', ['commit', '-m', message]);
      if (!commit.ok) throw new Error('提交失败');
      shouldPush = true;
    }

    const ahead = await runStreaming(job, 'git', ['status', '--short', '--branch']);
    if (ahead.output.includes('[ahead ')) shouldPush = true;
    if (shouldPush) {
      let push = await runStreaming(job, 'git', ['push']);
      if (!push.ok) {
        addLog(job, '推送失败，10 秒后自动重试一次...');
        await wait(10000);
        push = await runStreaming(job, 'git', ['push']);
      }
      if (!push.ok) throw new Error('推送到 GitHub 失败，请确认 Clash Verge 已开启，或稍后重试');
    }

    const head = await runStreaming(job, 'git', ['rev-parse', 'HEAD']);
    const expectedSha = head.output.trim().split(/\r?\n/).pop();
    await waitForDeployment(job, expectedSha);
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

async function makePreview(inputPath, ext, base, originalName) {
  const previewRoot = path.join(secureDir, 'previews', base);
  await fs.mkdir(previewRoot, { recursive: true });
  if (['.pdf', '.png', '.jpg', '.jpeg', '.webp'].includes(ext)) {
    const result = await execPlain('python', ['tools/make-preview.py', inputPath, previewRoot, `仅供预览 ${new Date().getFullYear()}`, ext]);
    if (!result.ok) throw new Error(`预览生成失败：${result.output}`);
    const data = JSON.parse(result.output.trim().split(/\r?\n/).pop());
    return {
      type: 'images',
      title: originalName,
      pages: data.pages.map((page) => `previews/${encodeURIComponent(base)}/${encodeURIComponent(page)}`),
    };
  }
  if (ext === '.docx') {
    const converted = await mammoth.convertToHtml({ path: inputPath });
    const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>body{font-family:Microsoft YaHei,Segoe UI,sans-serif;line-height:1.8;max-width:860px;margin:0 auto;padding:24px;color:#1d2733}.wm{position:fixed;inset:0;pointer-events:none;background:repeating-linear-gradient(-25deg,rgba(0,0,0,.045) 0,rgba(0,0,0,.045) 1px,transparent 1px,transparent 140px);z-index:999}</style></head><body><div class="wm"></div><h1>${originalName}</h1>${converted.value}</body></html>`;
    await fs.writeFile(path.join(previewRoot, 'preview.html'), html, 'utf8');
    return {
      type: 'html',
      title: originalName,
      html: `previews/${encodeURIComponent(base)}/preview.html`,
    };
  }
  return null;
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

app.get('/api/contact', auth, async (_req, res) => {
  await ensureDirs();
  try {
    res.json(JSON.parse(await fs.readFile(contactFile, 'utf8')));
  } catch (_) {
    res.json({ qq: '', wechat: '', wechatQr: '', note: '' });
  }
});

app.put('/api/contact', auth, async (req, res) => {
  await ensureDirs();
  const contact = {
    qq: String(req.body.qq || '').trim(),
    wechat: String(req.body.wechat || '').trim(),
    wechatQr: String(req.body.wechatQr || '').trim(),
    note: String(req.body.note || '').trim(),
  };
  await fs.writeFile(contactFile, `${JSON.stringify(contact, null, 2)}\n`, 'utf8');
  res.json(contact);
});

app.get('/api/site-config', auth, async (_req, res) => {
  try {
    const main = await fs.readFile(hexoConfig, 'utf8');
    const fluidPath = path.join(root, '_config.fluid.yml');
    const fluid = await fs.readFile(fluidPath, 'utf8');
    const matchTop = (text, key) => {
      const m = text.match(new RegExp(`^${key}:[ \\t]*(.+?)\\s*$`, 'm'));
      return m ? m[1].replace(/^['"]|['"]$/g, '').trim() : '';
    };
    res.json({
      title: matchTop(main, 'title'),
      subtitle: matchTop(main, 'subtitle'),
      description: matchTop(main, 'description'),
      author: matchTop(main, 'author'),
      aboutName: readFieldUnderSection(fluid, 'about', 'name'),
      aboutIntro: readFieldUnderSection(fluid, 'about', 'intro'),
      slogans: readSloganList(fluid),
    });
  } catch (error) {
    res.status(500).json({ error: `读取站点配置失败：${error.message}` });
  }
});

app.put('/api/site-config', auth, async (req, res) => {
  try {
    const fluidPath = path.join(root, '_config.fluid.yml');
    let main = await fs.readFile(hexoConfig, 'utf8');
    let fluid = await fs.readFile(fluidPath, 'utf8');
    const body = req.body || {};
    const setIf = (value, fn) => {
      if (typeof value === 'string') fn(value.trim());
    };
    setIf(body.title, (v) => { main = replaceTopLevelField(main, 'title', v); });
    setIf(body.subtitle, (v) => { main = replaceTopLevelField(main, 'subtitle', v); });
    setIf(body.description, (v) => { main = replaceTopLevelField(main, 'description', v); });
    setIf(body.author, (v) => { main = replaceTopLevelField(main, 'author', v); });
    setIf(body.aboutName, (v) => { fluid = replaceFieldUnderSection(fluid, 'about', 'name', v); });
    setIf(body.aboutIntro, (v) => { fluid = replaceFieldUnderSection(fluid, 'about', 'intro', v); });
    if (Array.isArray(body.slogans)) {
      const cleaned = body.slogans.map((s) => String(s || '').trim()).filter(Boolean);
      fluid = replaceSloganList(fluid, cleaned);
    }
    await fs.writeFile(hexoConfig, main, 'utf8');
    await fs.writeFile(fluidPath, fluid, 'utf8');
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: `保存站点配置失败：${error.message}` });
  }
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
  const allowed = new Set(['.pdf', '.docx', '.doc', '.pptx', '.xlsx', '.zip', '.png', '.jpg', '.jpeg', '.webp']);
  if (!allowed.has(ext)) {
    await fs.rm(req.file.path, { force: true });
    res.status(400).json({ error: '安全上传支持 PDF、Word、PPT、Excel、ZIP 和图片' });
    return;
  }
  const base = `${Date.now()}-${safeName(path.basename(req.file.originalname, ext), 'file')}`;
  const encryptedName = `${base}${ext}.locked`;
  const targetDir = path.join(secureDir, 'files');
  await fs.mkdir(targetDir, { recursive: true });
  const preview = await makePreview(req.file.path, ext, base, req.file.originalname);
  await encryptFile(req.file.path, path.join(targetDir, encryptedName), filePassword);
  await fs.rm(req.file.path, { force: true });
  if (preview) {
    await fs.writeFile(path.join(secureDir, 'previews', base, 'manifest.json'), JSON.stringify(preview, null, 2), 'utf8');
  }
  const rootPath = await getSiteRoot();
  const filePath = `files/${encodeURIComponent(encryptedName)}`;
  const previewPath = preview ? `&preview=previews/${encodeURIComponent(base)}/manifest.json` : '';
  const openUrl = `${rootPath.replace(/\/$/, '')}/secure/?file=${filePath}&name=${encodeURIComponent(req.file.originalname)}${previewPath}`;
  res.json({
    name: req.file.originalname,
    url: openUrl,
    markdown: `[${req.file.originalname}](${openUrl})`,
  });
});

app.post('/api/build', auth, async (_req, res) => {
  res.json(await run('npm.cmd', ['run', 'build']));
});

app.post('/api/import-md', auth, upload.single('file'), async (req, res) => {
  await ensureDirs();
  if (!req.file) {
    res.status(400).json({ error: '请选择 Markdown 文件' });
    return;
  }
  const ext = path.extname(req.file.originalname).toLowerCase();
  if (ext !== '.md' && ext !== '.markdown') {
    await fs.rm(req.file.path, { force: true });
    res.status(400).json({ error: '只能导入 .md 或 .markdown 文件' });
    return;
  }
  try {
    const raw = await fs.readFile(req.file.path, 'utf8');
    const parsed = matter(raw);
    const titleFromFM = parsed.data && parsed.data.title;
    const titleFromName = path.basename(req.file.originalname, ext);
    const title = String(titleFromFM || titleFromName || '未命名文章').trim();
    const file = await uniquePostFile(safeName(title, `post-${Date.now()}`));
    const stickyValue = parsed.data && Number(parsed.data.sticky);
    const postBody = {
      title,
      date: parsed.data && parsed.data.date ? String(parsed.data.date) : todayString(),
      categories: parsed.data ? parsed.data.categories : [],
      tags: parsed.data ? parsed.data.tags : [],
      sticky: Number.isFinite(stickyValue) ? stickyValue : 0,
      content: parsed.content.trimStart(),
    };
    await fs.writeFile(path.join(postsDir, file), postMarkdown(postBody), 'utf8');
    await fs.rm(req.file.path, { force: true });
    res.json(await readPost(file));
  } catch (error) {
    await fs.rm(req.file.path, { force: true });
    res.status(500).json({ error: `导入失败：${error.message}` });
  }
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
