const crypto = require('crypto');
const { execFile } = require('child_process');
const fs = require('fs/promises');
const path = require('path');

const express = require('express');
const matter = require('gray-matter');
const multer = require('multer');
const slugify = require('slugify');

const root = path.resolve(__dirname, '..');
const postsDir = path.join(root, 'source', '_posts');
const uploadsDir = path.join(root, 'source', 'uploads');
const publicDir = path.join(__dirname, 'public');
const port = Number(process.env.ADMIN_PORT || 5050);
const passwordFile = path.join(root, '.admin-password');
let password = process.env.ADMIN_PASSWORD || 'admin123';
const sessions = new Map();

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
  res.json({
    name,
    url: `/uploads/${name}`,
    markdown: ext.match(/\.(png|jpe?g|gif|webp)$/) ? `![${name}](/uploads/${name})` : `[${name}](/uploads/${name})`,
  });
});

app.post('/api/build', auth, async (_req, res) => {
  res.json(await run('npm.cmd', ['run', 'build']));
});

app.post('/api/publish', auth, async (_req, res) => {
  res.json(await run('npm.cmd', ['run', 'publish']));
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
