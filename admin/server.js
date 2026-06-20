const crypto = require('crypto');
const { execFile, spawn } = require('child_process');
const fs = require('fs/promises');
const fss = require('fs');
const os = require('os');
const path = require('path');

const express = require('express');
const matter = require('gray-matter');
const multer = require('multer');
const mammoth = require('mammoth');
const JSZip = require('jszip');
const slugify = require('slugify');

const root = path.resolve(__dirname, '..');
const postsDir = path.join(root, 'source', '_posts');
const uploadsDir = path.join(root, 'source', 'uploads');
const secureDir = path.join(root, 'source', 'secure');
const backupDir = path.join(root, '.admin-backups', 'posts');
const trashDir = path.join(root, '.admin-trash', 'posts');
const contactFile = path.join(root, 'source', 'contact', 'contact.json');
const publicDir = path.join(__dirname, 'public');
const hexoConfig = path.join(root, '_config.yml');
const homeProfileFile = path.join(root, 'source', 'home-profile.json');
const publishDir = path.join(root, 'public');
const port = Number(process.env.PORT || process.env.ADMIN_PORT || 5050);
const host = process.env.ADMIN_HOST || (process.env.PORT ? '0.0.0.0' : '127.0.0.1');
const passwordFile = path.join(root, '.admin-password');
const skillChatConfigFile = path.join(root, '.admin-tmp', 'skill-chat-config.json');
const publicSkillChatDir = process.env.PUBLIC_SKILL_CHAT_DIR
  ? path.resolve(process.env.PUBLIC_SKILL_CHAT_DIR)
  : path.join(root, 'skill-chat-sessions', 'sessions');
const publicSkillChatClientConfigFile = path.join(root, 'source', 'js', 'public-skill-chat-config.js');
let password = process.env.ADMIN_PASSWORD || 'admin123';
const sessions = new Map();
const jobs = new Map();
const publicSkillChatRate = new Map();

const app = express();
app.set('trust proxy', 1);

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

app.use(express.json({ limit: '2mb' }));
app.use(assertAdminStatic);
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

function timestampName() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function assertSafeMdFile(file) {
  if (!file.endsWith('.md') || file.includes('/') || file.includes('\\')) {
    throw new Error('文件名不合法');
  }
}

async function backupPost(file, reason = 'save') {
  assertSafeMdFile(file);
  await ensureDirs();
  const source = path.join(postsDir, file);
  try {
    await fs.access(source);
  } catch (_) {
    return '';
  }
  const target = path.join(backupDir, `${timestampName()}-${reason}-${safeName(file.replace(/\.md$/i, ''), 'post')}.md`);
  await fs.copyFile(source, target);
  return path.basename(target);
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

function isLocalRequest(req) {
  const ip = req.ip || req.socket.remoteAddress || '';
  return ip.includes('127.0.0.1') || ip.includes('::1') || ip === '::ffff:127.0.0.1';
}

function assertAdminStatic(req, res, next) {
  if (req.path.startsWith('/api/')) {
    next();
    return;
  }
  if (isLocalRequest(req)) {
    next();
    return;
  }
  res.status(403).send('Admin UI is only available from localhost.');
}

function assertLocal(req, res, next) {
  if (req.path.startsWith('/api/public-skill-chat/')) {
    next();
    return;
  }
  if (isLocalRequest(req)) {
    next();
    return;
  }
  res.status(403).json({ error: '后台只允许本机访问' });
}

function publicSkillChatAccess(req, res, next) {
  if (!req.path.startsWith('/api/public-skill-chat/')) {
    next();
    return;
  }
  const allowedOrigin = process.env.PUBLIC_SKILL_CHAT_ORIGIN || '*';
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Vary', 'Origin');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  const limit = Number(process.env.PUBLIC_SKILL_CHAT_RATE_LIMIT || 60);
  const windowMs = 60 * 60 * 1000;
  const key = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const current = publicSkillChatRate.get(key);
  if (!current || current.resetAt <= now) {
    publicSkillChatRate.set(key, { count: 1, resetAt: now + windowMs });
    next();
    return;
  }
  if (current.count >= limit) {
    res.status(429).json({ error: '请求过于频繁，请稍后再试' });
    return;
  }
  current.count += 1;
  next();
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
  await fs.mkdir(backupDir, { recursive: true });
  await fs.mkdir(trashDir, { recursive: true });
  await fs.mkdir(path.dirname(contactFile), { recursive: true });
  await fs.mkdir(path.dirname(homeProfileFile), { recursive: true });
}

async function readHomeProfile(fallbackIntro = '') {
  try {
    const parsed = JSON.parse(await fs.readFile(homeProfileFile, 'utf8'));
    return {
      intro: String(parsed.intro || fallbackIntro || '').trim(),
      title: String(parsed.title || '').trim(),
      kicker: String(parsed.kicker || '').trim(),
    };
  } catch (_) {
    return { intro: String(fallbackIntro || '').trim(), title: '', kicker: '' };
  }
}

async function writeHomeProfile(input, fallbackIntro = '') {
  await fs.mkdir(path.dirname(homeProfileFile), { recursive: true });
  const current = await readHomeProfile(fallbackIntro);
  const next = {
    ...current,
    intro: String(input.intro ?? current.intro ?? fallbackIntro ?? '').trim(),
  };
  await fs.writeFile(homeProfileFile, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  return next;
}

async function readPost(file) {
  const fullPath = path.join(postsDir, file);
  const raw = await fs.readFile(fullPath, 'utf8');
  const stat = await fs.stat(fullPath);
  const parsed = matter(raw);
  return {
    file,
    title: parsed.data.title || file.replace(/\.md$/i, ''),
    date: parsed.data.date || '',
    updated: parsed.data.updated || stat.mtime,
    categories: parsed.data.categories || [],
    tags: parsed.data.tags || [],
    description: parsed.data.description || '',
    excerpt: parsed.data.excerpt || '',
    cover: parsed.data.cover || '',
    index_img: parsed.data.index_img || '',
    banner_img: parsed.data.banner_img || '',
    sticky: parsed.data.sticky || 0,
    content: parsed.content.trimStart(),
    modifiedAt: stat.mtime,
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
    updated: todayString(),
    categories: normalizeList(input.categories),
    tags: normalizeList(input.tags),
  };
  ['description', 'excerpt', 'cover', 'index_img', 'banner_img'].forEach((key) => {
    const value = String(input[key] || '').trim();
    if (value) data[key] = value;
  });
  const stickyValue = Number(input.sticky);
  if (Number.isFinite(stickyValue) && stickyValue > 0) {
    data.sticky = stickyValue;
  }
  return matter.stringify(String(input.content || '').trimStart(), data);
}

function zipPathName(value) {
  return String(value || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .split('/')
    .filter((part) => part && part !== '.')
    .join('/');
}

function isUnsafeZipPath(name) {
  const raw = String(name || '');
  if (!raw || raw.includes('\0') || /^[a-zA-Z]:/.test(raw) || raw.startsWith('/') || raw.startsWith('\\')) return true;
  return zipPathName(raw).split('/').some((part) => part === '..');
}

function isExternalUrl(value) {
  return /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(String(value || '').trim());
}

function decodeMdUrl(value) {
  const cleaned = String(value || '').trim().replace(/^<|>$/g, '').split(/[?#]/)[0];
  try {
    return decodeURI(cleaned);
  } catch (_) {
    return cleaned;
  }
}

function resolveZipAsset(markdownEntryName, link) {
  const decoded = zipPathName(decodeMdUrl(link));
  if (!decoded || isExternalUrl(link)) return '';
  const baseDir = path.posix.dirname(zipPathName(markdownEntryName));
  return zipPathName(path.posix.normalize(path.posix.join(baseDir === '.' ? '' : baseDir, decoded)));
}

async function uniqueUploadFileName(originalName, fallback = 'image') {
  const ext = path.extname(originalName).toLowerCase();
  const base = safeName(path.basename(originalName, ext), fallback);
  let name = `${Date.now()}-${base}${ext}`;
  let index = 2;
  while (true) {
    try {
      await fs.access(path.join(uploadsDir, name));
      name = `${Date.now()}-${base}-${index}${ext}`;
      index += 1;
    } catch (_) {
      return name;
    }
  }
}

function makePostBody(parsed, originalName, ext, content) {
  const titleFromFM = parsed.data && parsed.data.title;
  const titleFromName = path.basename(originalName, ext);
  const title = String(titleFromFM || titleFromName || '未命名文章').trim();
  const stickyValue = parsed.data && Number(parsed.data.sticky);
  return {
    title,
    date: parsed.data && parsed.data.date ? String(parsed.data.date) : todayString(),
    categories: parsed.data ? parsed.data.categories : [],
    tags: parsed.data ? parsed.data.tags : [],
    description: parsed.data ? parsed.data.description : '',
    excerpt: parsed.data ? parsed.data.excerpt : '',
    cover: parsed.data ? parsed.data.cover : '',
    index_img: parsed.data ? parsed.data.index_img : '',
    banner_img: parsed.data ? parsed.data.banner_img : '',
    sticky: Number.isFinite(stickyValue) ? stickyValue : 0,
    content: String(content || '').trimStart(),
  };
}

async function importMarkdownText(raw, originalName, ext) {
  const parsed = matter(raw);
  const postBody = makePostBody(parsed, originalName, ext, parsed.content);
  const file = await uniquePostFile(safeName(postBody.title, `post-${Date.now()}`));
  await fs.writeFile(path.join(postsDir, file), postMarkdown(postBody), 'utf8');
  return readPost(file);
}

function referencedMarkdownImages(content) {
  const refs = [];
  const mdImageRe = /!\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  const htmlImageRe = /<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
  let match;
  while ((match = mdImageRe.exec(content))) refs.push(match[1]);
  while ((match = htmlImageRe.exec(content))) refs.push(match[1]);
  return Array.from(new Set(refs));
}

function replaceImageReference(content, originalRef, publicUrl) {
  const escaped = originalRef.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return content
    .replace(new RegExp(`(!\\[[^\\]]*\\]\\()${escaped}((?:\\s+"[^"]*")?\\))`, 'g'), `$1${publicUrl}$2`)
    .replace(new RegExp(`(<img\\b[^>]*\\bsrc=["'])${escaped}(["'][^>]*>)`, 'gi'), `$1${publicUrl}$2`);
}

async function importZipPackage(filePath, originalName) {
  const buffer = await fs.readFile(filePath);
  const zip = await JSZip.loadAsync(buffer);
  const entries = Object.values(zip.files)
    .filter((entry) => !entry.dir)
    .filter((entry) => !isUnsafeZipPath(entry.name))
    .filter((entry) => !zipPathName(entry.name).split('/').some((part) => part === '__MACOSX' || part === '.DS_Store'));
  const markdownEntries = entries.filter((entry) => /\.(md|markdown)$/i.test(zipPathName(entry.name)));
  if (markdownEntries.length === 0) throw new Error('压缩包里没有找到 .md 或 .markdown 文件');
  if (markdownEntries.length > 1) throw new Error('压缩包里只能包含一个 Markdown 文件');

  const markdownEntry = markdownEntries[0];
  const markdownEntryName = zipPathName(markdownEntry.name);
  const imageExts = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp']);
  const imageEntries = new Map();
  entries.forEach((entry) => {
    const normalized = zipPathName(entry.name);
    if (imageExts.has(path.extname(normalized).toLowerCase())) imageEntries.set(normalized.toLowerCase(), entry);
  });

  let raw = await markdownEntry.async('string');
  const parsed = matter(raw);
  let content = parsed.content;
  const rootPath = await getSiteRoot();
  const siteRoot = rootPath.replace(/\/$/, '');
  const copied = new Map();

  for (const ref of referencedMarkdownImages(content)) {
    if (isExternalUrl(ref) || ref.startsWith('/')) continue;
    const assetPath = resolveZipAsset(markdownEntryName, ref);
    const entry = imageEntries.get(assetPath.toLowerCase());
    if (!entry) continue;
    if (!copied.has(assetPath.toLowerCase())) {
      const ext = path.extname(assetPath).toLowerCase();
      const uploadName = await uniqueUploadFileName(path.basename(assetPath), 'image');
      await fs.writeFile(path.join(uploadsDir, uploadName), await entry.async('nodebuffer'));
      copied.set(assetPath.toLowerCase(), `${siteRoot}/uploads/${encodeURIComponent(uploadName)}`);
    }
    content = replaceImageReference(content, ref, copied.get(assetPath.toLowerCase()));
  }

  parsed.content = content;
  return importMarkdownText(matter.stringify(parsed.content, parsed.data), path.basename(markdownEntryName), path.extname(markdownEntryName).toLowerCase());
}

function defaultCodexHome() {
  return process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
}

function normalizeSkillName(value) {
  const name = String(value || 'xie-xiao-shu').trim();
  if (!/^[a-zA-Z0-9_.-]+$/.test(name) || name.includes('..')) return 'xie-xiao-shu';
  return name;
}

function skillRootPath(skillName = 'xie-xiao-shu') {
  return path.join(defaultCodexHome(), 'skills', normalizeSkillName(skillName));
}

function redactSecret(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (text.length <= 8) return '********';
  return `${text.slice(0, 4)}...${text.slice(-4)}`;
}

function normalizeBaseUrl(value) {
  const raw = String(value || '').trim().replace(/\/+$/, '');
  return raw || 'https://api.openai.com/v1';
}

async function readSkillChatLocalConfig() {
  try {
    return JSON.parse(await fs.readFile(skillChatConfigFile, 'utf8'));
  } catch (_) {
    return {};
  }
}

async function writeSkillChatLocalConfig(input) {
  await fs.mkdir(path.dirname(skillChatConfigFile), { recursive: true });
  const current = await readSkillChatLocalConfig();
  const hasPublicApiBase = Object.prototype.hasOwnProperty.call(input, 'publicApiBase');
  const next = {
    ...current,
    baseUrl: normalizeBaseUrl(input.baseUrl || current.baseUrl),
    model: String(input.model || current.model || 'gpt-4.1-mini').trim(),
    skillName: normalizeSkillName(input.skillName || current.skillName || 'xie-xiao-shu'),
    publicApiBase: String(hasPublicApiBase ? input.publicApiBase : (current.publicApiBase || '')).trim().replace(/\/+$/, ''),
    updatedAt: new Date().toISOString(),
  };
  if (/\/v1$/i.test(next.publicApiBase)) {
    throw new Error('公开页面 API 地址不能填模型接口 /v1，请填部署后的 Node 后端根地址，或先留空');
  }
  if (typeof input.apiKey === 'string' && input.apiKey.trim()) next.apiKey = input.apiKey.trim();
  if (input.clearApiKey) delete next.apiKey;
  await fs.writeFile(skillChatConfigFile, JSON.stringify(next, null, 2), 'utf8');
  return next;
}

async function getSkillChatConfig() {
  const local = await readSkillChatLocalConfig();
  const envKey = process.env.SKILL_CHAT_API_KEY || process.env.OPENAI_API_KEY || '';
  const apiKey = envKey || local.apiKey || '';
  const baseUrl = normalizeBaseUrl(process.env.SKILL_CHAT_BASE_URL || process.env.OPENAI_BASE_URL || local.baseUrl);
  const model = String(process.env.SKILL_CHAT_MODEL || local.model || 'gpt-4.1-mini').trim();
  const skillName = normalizeSkillName(process.env.SKILL_CHAT_SKILL || local.skillName || 'xie-xiao-shu');
  const publicApiBase = String(process.env.PUBLIC_SKILL_CHAT_API_BASE || local.publicApiBase || '').trim().replace(/\/+$/, '');
  return {
    baseUrl,
    model,
    skillName,
    apiKey,
    hasApiKey: Boolean(apiKey),
    apiKeySource: envKey ? 'env' : (local.apiKey ? 'local' : ''),
    maskedApiKey: redactSecret(apiKey),
    publicApiBase,
  };
}

function publicSkillChatConfig(config) {
  return {
    baseUrl: config.baseUrl,
    model: config.model,
    skillName: config.skillName,
    hasApiKey: config.hasApiKey,
    apiKeySource: config.apiKeySource,
    maskedApiKey: config.maskedApiKey,
    publicApiBase: config.publicApiBase,
    adminUrl: `http://127.0.0.1:${port}/`,
    apiUrl: `http://127.0.0.1:${port}/api/skill-chat/chat`,
  };
}

async function writePublicSkillChatClientConfig(publicApiBase) {
  await fs.mkdir(path.dirname(publicSkillChatClientConfigFile), { recursive: true });
  const base = String(publicApiBase || '').trim().replace(/\/+$/, '');
  const js = [
    '(function () {',
    `  window.BOKE_SKILL_CHAT_API_BASE = ${JSON.stringify(base)};`,
    `  window.BOKE_SKILL_CHAT_API_STYLE = ${JSON.stringify(base ? 'node' : '')};`,
    '}());',
    '',
  ].join('\n');
  await fs.writeFile(publicSkillChatClientConfigFile, js, 'utf8');
}

function fallbackSkillPrompt(skillName) {
  return [
    `当前云端未读取到完整的 ${skillName} skill 文件，先使用压缩版关系分析框架运行。`,
    '核心工作方式：把用户叙述拆成事实、感受、身体反应、幻想/梦境元素、关系互动和反复出现的模式。',
    '重点观察依恋需求、亲密与吞没感、边界、控制/被控制、羞耻、攻击性、理想化与贬低、分离焦虑、重复性关系脚本。',
    '回答时不要把梦境或性内容当作现实意图的证据，也不要给确定诊断；更适合提出可能的心理动力假设和可观察问题。',
    '结构建议：先共情与命名主题，再给 2-4 个可能原因，最后给用户可继续观察或记录的问题。',
  ].join('\n');
}

async function loadSkillPrompt(skillName) {
  const dir = skillRootPath(skillName);
  const skillFile = path.join(dir, 'SKILL.md');
  const knowledgeFile = path.join(dir, '知识库.txt');
  const parts = [];
  try {
    const raw = await fs.readFile(skillFile, 'utf8');
    parts.push(raw.slice(0, 14000));
  } catch (_) {}
  try {
    const raw = await fs.readFile(knowledgeFile, 'utf8');
    const lines = raw.split(/\r?\n/);
    const selected = [
      ...lines.slice(0, 110),
      ...lines.slice(178, 240),
      ...lines.slice(638, 724),
    ];
    parts.push(selected.join('\n').slice(0, 14000));
  } catch (_) {}

  const material = parts.length ? parts.join('\n\n') : fallbackSkillPrompt(skillName);

  return [
    `你正在作为 Codex 后台里的可视化 skill 对话助手运行，当前 skill: ${skillName}。`,
    '默认使用简体中文。回答要直接、克制、有洞察，但不能冒充持牌心理咨询或医疗诊断。',
    '用户如果表达自伤、自杀或现实危机，立即停止分析，建议联系当地紧急服务或危机热线。',
    '如果用户在关系、梦境、依恋、边界、客体关系等主题上求助，优先使用下方 skill 材料里的框架。',
    '不要编造“原话”。只有材料里出现过的原话才可标成原话；否则说“基于这个框架”。',
    '当前是网页聊天场景，输出适合直接显示的 Markdown。',
    material,
  ].filter(Boolean).join('\n\n').slice(0, 30000);
}

function safeMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter((item) => item && (item.role === 'user' || item.role === 'assistant'))
    .slice(-20)
    .map((item) => ({
      role: item.role,
      content: String(item.content || '').slice(0, 12000),
    }))
    .filter((item) => item.content.trim());
}

async function openAIRequest(config, endpoint, options = {}) {
  if (!config.apiKey) throw new Error('Skill 对话 API Key 未设置');
  const url = `${normalizeBaseUrl(config.baseUrl)}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
  const response = await fetch(url, {
    method: options.method || 'GET',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (_) { data = { raw: text }; }
  if (!response.ok) {
    const detail = data && data.error ? (data.error.message || JSON.stringify(data.error)) : text;
    throw new Error(detail || `HTTP ${response.status}`);
  }
  return data;
}

async function listSkillChatModels(config) {
  const data = await openAIRequest(config, '/models');
  return (data.data || [])
    .map((model) => model.id)
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
}

async function runSkillChatCompletion(config, messages) {
  const systemPrompt = await loadSkillPrompt(config.skillName);
  const payload = {
    model: config.model,
    messages: [
      { role: 'system', content: systemPrompt },
      ...safeMessages(messages),
    ],
    temperature: 0.7,
  };
  const data = await openAIRequest(config, '/chat/completions', { method: 'POST', body: payload });
  const content = data && data.choices && data.choices[0] && data.choices[0].message
    ? data.choices[0].message.content
    : '';
  if (!content) throw new Error('模型没有返回可显示的内容');
  return {
    role: 'assistant',
    content,
    model: data.model || config.model,
    usage: data.usage || null,
  };
}

function publicChatIdFromSecret(secret) {
  return crypto.createHash('sha256').update(String(secret || '').trim()).digest('hex').slice(0, 24);
}

function publicChatFile(id, ext) {
  return path.join(publicSkillChatDir, `${id}.${ext}`);
}

function validatePublicSecret(secret) {
  const text = String(secret || '').trim();
  if (text.length < 6) throw new Error('会话密钥至少需要 6 个字符');
  if (text.length > 120) throw new Error('会话密钥过长');
  return text;
}

function publicChatMarkdown(session) {
  const lines = [
    '---',
    `id: ${session.id}`,
    `title: ${session.title || 'Skill 对话记录'}`,
    `status: ${session.status}`,
    `createdAt: ${session.createdAt}`,
    `updatedAt: ${session.updatedAt}`,
    `endedAt: ${session.endedAt || ''}`,
    `messageCount: ${session.messages.length}`,
    '---',
    '',
    `# ${session.title || 'Skill 对话记录'}`,
    '',
    `- 会话 ID：${session.id}`,
    `- 状态：${session.status}`,
    `- 创建时间：${session.createdAt}`,
    `- 更新时间：${session.updatedAt}`,
    '',
  ];
  if (session.summary) {
    lines.push('## 结束分析', '', session.summary.trim(), '');
  }
  lines.push('## 对话记录', '');
  session.messages.forEach((message, index) => {
    lines.push(`### ${index + 1}. ${message.role === 'user' ? '用户' : 'Skill'}`);
    lines.push('');
    lines.push(String(message.content || '').trim() || '(空)');
    lines.push('');
  });
  return `${lines.join('\n')}\n`;
}

async function savePublicChatSession(session) {
  await fs.mkdir(publicSkillChatDir, { recursive: true });
  await fs.writeFile(publicChatFile(session.id, 'json'), `${JSON.stringify(session, null, 2)}\n`, 'utf8');
  await fs.writeFile(publicChatFile(session.id, 'md'), publicChatMarkdown(session), 'utf8');
}

async function loadPublicChatSession(secret) {
  const normalizedSecret = validatePublicSecret(secret);
  const id = publicChatIdFromSecret(normalizedSecret);
  try {
    const session = JSON.parse(await fs.readFile(publicChatFile(id, 'json'), 'utf8'));
    return session;
  } catch (_) {
    const now = new Date().toISOString();
    return {
      id,
      title: 'Skill 对话记录',
      status: 'active',
      createdAt: now,
      updatedAt: now,
      endedAt: '',
      secretHash: crypto.createHash('sha256').update(normalizedSecret).digest('hex'),
      messages: [],
      summary: '',
    };
  }
}

function publicSessionView(session) {
  return {
    id: session.id,
    title: session.title,
    status: session.status,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    endedAt: session.endedAt,
    messages: session.messages,
    summary: session.summary || '',
  };
}

function titleFromMessage(message) {
  const text = String(message || '').replace(/\s+/g, ' ').trim();
  if (!text) return 'Skill 对话记录';
  return text.length > 28 ? `${text.slice(0, 28)}...` : text;
}

async function runPublicSkillChat(messages) {
  const config = await getSkillChatConfig();
  return runSkillChatCompletion(config, messages);
}

async function runPublicSkillSummary(messages) {
  const summaryPrompt = [
    '请对以上完整对话做一次结束分析梳理。',
    '输出结构：',
    '1. 核心主题',
    '2. 反复出现的关系/情绪模式',
    '3. 可能被激活的边界、依恋或客体关系线索',
    '4. 可以继续观察的具体问题',
    '5. 一段克制的收束语',
    '不要诊断，不要吓人，不要承诺疗效。',
  ].join('\n');
  const reply = await runPublicSkillChat([
    ...messages,
    { role: 'user', content: summaryPrompt },
  ]);
  return reply.content;
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

function stripYamlValue(value) {
  return String(value || '').replace(/^['"]|['"]$/g, '').trim();
}

function readTopLevelYamlValue(text, key) {
  const match = text.match(new RegExp(`^${key}:[ \\t]*(.+?)\\s*$`, 'm'));
  return match ? stripYamlValue(match[1]) : '';
}

function ensureTrailingSlash(value) {
  const text = String(value || '').trim();
  return text && !text.endsWith('/') ? `${text}/` : text;
}

function normalizeRootPath(value) {
  const cleaned = stripYamlValue(value) || '/';
  const withLeading = cleaned.startsWith('/') ? cleaned : `/${cleaned}`;
  return ensureTrailingSlash(withLeading);
}

function composeSiteUrl(rawUrl, rootPath) {
  const cleaned = stripYamlValue(rawUrl);
  if (!cleaned) return '';
  try {
    const url = new URL(cleaned);
    const normalizedRoot = normalizeRootPath(rootPath);
    if (normalizedRoot !== '/' && (!url.pathname || url.pathname === '/')) {
      url.pathname = normalizedRoot;
    }
    return ensureTrailingSlash(url.href);
  } catch (_) {
    return ensureTrailingSlash(cleaned);
  }
}

function parseGitHubRemote(remoteUrl) {
  const cleaned = String(remoteUrl || '').trim();
  let match = cleaned.match(/^https?:\/\/(?:[^@\s/]+@)?github\.com\/([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i);
  if (!match) match = cleaned.match(/^git@github\.com:([^/\s]+)\/([^/\s]+?)(?:\.git)?$/i);
  if (!match) match = cleaned.match(/^ssh:\/\/git@github\.com\/([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i);
  if (!match) return { owner: '', repo: '', repoPath: '', repoUrl: '', actionsUrl: '' };
  const owner = match[1];
  const repo = match[2].replace(/\.git$/i, '');
  return {
    owner,
    repo,
    repoPath: `${owner}/${repo}`,
    repoUrl: `https://github.com/${owner}/${repo}`,
    actionsUrl: `https://github.com/${owner}/${repo}/actions/workflows/pages.yml`,
  };
}

function inferGitHubPagesUrl(owner, repo) {
  if (!owner || !repo) return '';
  if (repo.toLowerCase() === `${owner.toLowerCase()}.github.io`) {
    return `https://${repo}/`;
  }
  return `https://${owner.toLowerCase()}.github.io/${repo}/`;
}

async function readHexoSiteInfo() {
  try {
    const config = await fs.readFile(hexoConfig, 'utf8');
    const rootPath = normalizeRootPath(readTopLevelYamlValue(config, 'root') || '/');
    const url = readTopLevelYamlValue(config, 'url');
    return {
      configuredUrl: url,
      rootPath,
      siteUrl: composeSiteUrl(url, rootPath),
    };
  } catch (_) {
    return { configuredUrl: '', rootPath: '/', siteUrl: '' };
  }
}

async function gitOutput(args) {
  const result = await execPlain('git', args);
  return result.ok ? result.output.trim() : '';
}

async function readGitHubRemoteInfo() {
  const remoteUrl = await gitOutput(['remote', 'get-url', 'origin']);
  return { remoteUrl, ...parseGitHubRemote(remoteUrl) };
}

async function getCredentialToken() {
  const result = await runWithInput('git', ['credential', 'fill'], 'protocol=https\nhost=github.com\n\n');
  const match = result.output.match(/^password=(.+)$/m);
  return match ? match[1].trim() : '';
}

async function collectPublishStatus(options = {}) {
  const { includeRun = true } = options;
  const remote = await readGitHubRemoteInfo();
  const site = await readHexoSiteInfo();
  const branch = (await gitOutput(['branch', '--show-current'])) || (await gitOutput(['rev-parse', '--abbrev-ref', 'HEAD']));
  const headSha = await gitOutput(['rev-parse', 'HEAD']);
  const headMessage = await gitOutput(['log', '-1', '--pretty=%s']);
  const branchStatus = await gitOutput(['status', '--short', '--branch']);
  const dirtyText = await gitOutput(['status', '--short']);
  const dirtyFiles = dirtyText ? dirtyText.split(/\r?\n/).filter(Boolean) : [];
  const credentialReady = Boolean(await getCredentialToken().catch(() => ''));
  const siteUrl = site.siteUrl || inferGitHubPagesUrl(remote.owner, remote.repo);
  const status = {
    ...remote,
    branch,
    headSha,
    shortSha: headSha ? headSha.slice(0, 7) : '',
    headMessage,
    branchStatus,
    dirtyFiles,
    dirtyCount: dirtyFiles.length,
    credentialReady,
    siteUrl,
    rootPath: site.rootPath,
    configuredUrl: site.configuredUrl,
    latestRun: null,
    latestRunError: '',
    checkedAt: new Date().toISOString(),
  };
  if (includeRun && remote.owner && remote.repo && credentialReady) {
    try {
      status.latestRun = await latestPagesRun(status);
    } catch (error) {
      status.latestRunError = error.message;
    }
  }
  return status;
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
  const token = await getCredentialToken();
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

async function latestPagesRun(context) {
  const owner = context && context.owner;
  const repo = context && context.repo;
  if (!owner || !repo) return null;
  const data = await githubRequest(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/workflows/pages.yml/runs?per_page=1`);
  return data.workflow_runs && data.workflow_runs[0];
}

async function checkPublicSite(siteUrl) {
  if (!siteUrl) return false;
  const res = await fetch(siteUrl, { cache: 'no-store' });
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

async function publicSiteContains(text, siteUrl) {
  if (!text) return true;
  if (!siteUrl) return false;
  const joiner = siteUrl.includes('?') ? '&' : '?';
  const res = await fetch(`${siteUrl}${joiner}v=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) return false;
  const html = await res.text();
  return html.includes(text);
}

async function waitForDeployment(job, expectedSha, context) {
  const publishContext = context || await collectPublishStatus({ includeRun: false });
  addLog(job, '正在监测 GitHub Pages 自动部署...');
  let lastId = '';
  if (publishContext.owner && publishContext.repo) {
    for (let i = 0; i < 60; i += 1) {
      let runInfo = null;
      try {
        runInfo = await latestPagesRun(publishContext);
      } catch (error) {
        addLog(job, `暂时无法读取 GitHub Actions 状态：${error.message}`);
        break;
      }
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
  } else {
    addLog(job, '没有识别到 GitHub origin 仓库，跳过 Actions 状态监测。');
  }

  const expectedTitle = await latestPostExpectation();
  addLog(job, expectedTitle ? `正在检测公开博客是否出现文章：${expectedTitle}` : '正在检测公开博客是否可访问...');
  for (let i = 0; i < 18; i += 1) {
    if ((await checkPublicSite(publishContext.siteUrl)) && (await publicSiteContains(expectedTitle, publishContext.siteUrl))) {
      job.siteOk = true;
      addLog(job, `公开博客已经可以访问：${publishContext.siteUrl}`);
      return;
    }
    addLog(job, '公开博客暂未刷新，继续等待...');
    await wait(5000);
  }
  throw new Error(`部署任务 ${lastId || ''} 已结束，但公开页面暂未检测到更新`);
}

async function runPublishJob(job) {
  try {
    const publishContext = await collectPublishStatus({ includeRun: false });
    if (publishContext.repoPath) addLog(job, `同步仓库：${publishContext.repoPath}`);
    if (publishContext.siteUrl) addLog(job, `公开站点：${publishContext.siteUrl}`);
    const build = await runStreaming(job, npmCommand, ['run', 'build']);
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
    await waitForDeployment(job, expectedSha, publishContext);
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

app.use(publicSkillChatAccess);
app.use(assertLocal);

app.get('/api/ping', (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.get('/api/public-skill-chat/health', async (_req, res) => {
  try {
    const config = await getSkillChatConfig();
    res.json({
      ok: true,
      time: new Date().toISOString(),
      model: config.model,
      baseUrl: config.baseUrl,
      skillName: config.skillName,
      hasApiKey: config.hasApiKey,
      storageDir: publicSkillChatDir,
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post('/api/login', (req, res) => {
  if (req.body.password !== password) {
    res.status(401).json({ error: '密码不正确' });
    return;
  }
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, Date.now());
  res.json({ token });
});

app.get('/api/skill-chat/status', auth, async (_req, res) => {
  try {
    const config = await getSkillChatConfig();
    const skillDir = skillRootPath(config.skillName);
    let skillInstalled = false;
    let knowledgeInstalled = false;
    try { await fs.access(path.join(skillDir, 'SKILL.md')); skillInstalled = true; } catch (_) {}
    try { await fs.access(path.join(skillDir, '知识库.txt')); knowledgeInstalled = true; } catch (_) {}
    res.json({
      ...publicSkillChatConfig(config),
      skillDir,
      skillInstalled,
      knowledgeInstalled,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/skill-chat/config', auth, async (req, res) => {
  try {
    const saved = await writeSkillChatLocalConfig(req.body || {});
    await writePublicSkillChatClientConfig(saved.publicApiBase);
    const config = await getSkillChatConfig();
    res.json(publicSkillChatConfig(config));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/skill-chat/models', auth, async (_req, res) => {
  try {
    const config = await getSkillChatConfig();
    const models = await listSkillChatModels(config);
    res.json({ models, selected: config.model, baseUrl: config.baseUrl });
  } catch (error) {
    res.status(502).json({ error: error.message });
  }
});

app.post('/api/skill-chat/test', auth, async (_req, res) => {
  try {
    const config = await getSkillChatConfig();
    const models = await listSkillChatModels(config);
    res.json({
      ok: true,
      message: 'Skill 对话接口连接成功',
      modelCount: models.length,
      selected: config.model,
      baseUrl: config.baseUrl,
      apiUrl: publicSkillChatConfig(config).apiUrl,
    });
  } catch (error) {
    res.status(502).json({ error: error.message });
  }
});

app.post('/api/skill-chat/chat', auth, async (req, res) => {
  try {
    const config = await getSkillChatConfig();
    if (req.body && req.body.model) config.model = String(req.body.model).trim();
    if (req.body && req.body.skillName) config.skillName = normalizeSkillName(req.body.skillName);
    const reply = await runSkillChatCompletion(config, req.body && req.body.messages);
    res.json(reply);
  } catch (error) {
    res.status(502).json({ error: error.message });
  }
});

app.post('/api/public-skill-chat/session', async (req, res) => {
  try {
    const session = await loadPublicChatSession(req.body && req.body.secret);
    await savePublicChatSession(session);
    res.json(publicSessionView(session));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/public-skill-chat/message', async (req, res) => {
  try {
    const content = String((req.body && req.body.message) || '').trim();
    if (!content) throw new Error('消息不能为空');
    if (content.length > 8000) throw new Error('单条消息过长');
    const session = await loadPublicChatSession(req.body && req.body.secret);
    if (session.status === 'ended') throw new Error('这段对话已经结束，请换一个会话密钥开始新的对话');
    const now = new Date().toISOString();
    session.messages.push({ role: 'user', content, createdAt: now });
    if (session.messages.length === 1) session.title = titleFromMessage(content);
    const reply = await runPublicSkillChat(session.messages.map(({ role, content: text }) => ({ role, content: text })));
    session.messages.push({ role: 'assistant', content: reply.content, createdAt: new Date().toISOString(), model: reply.model, usage: reply.usage });
    session.updatedAt = new Date().toISOString();
    await savePublicChatSession(session);
    res.json({ session: publicSessionView(session), reply: { role: 'assistant', content: reply.content } });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/public-skill-chat/end', async (req, res) => {
  try {
    const session = await loadPublicChatSession(req.body && req.body.secret);
    if (!session.messages.length) throw new Error('还没有可分析的对话');
    if (session.status !== 'ended' || !session.summary) {
      const summary = await runPublicSkillSummary(session.messages.map(({ role, content }) => ({ role, content })));
      const now = new Date().toISOString();
      session.summary = summary;
      session.status = 'ended';
      session.endedAt = now;
      session.updatedAt = now;
      await savePublicChatSession(session);
    }
    res.json(publicSessionView(session));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
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
    const description = matchTop(main, 'description');
    const aboutIntro = readFieldUnderSection(fluid, 'about', 'intro');
    const homeProfile = await readHomeProfile(aboutIntro || description);
    res.json({
      title: matchTop(main, 'title'),
      subtitle: matchTop(main, 'subtitle'),
      description,
      author: matchTop(main, 'author'),
      navbarTitle: readFieldUnderSection(fluid, 'navbar', 'blog_title'),
      aboutName: readFieldUnderSection(fluid, 'about', 'name'),
      aboutIntro,
      homeIntro: homeProfile.intro,
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
    setIf(body.title, (v) => {
      main = replaceTopLevelField(main, 'title', v);
      // 同步导航栏标题，避免被旧值覆盖（核心 bug 修复点）
      fluid = replaceFieldUnderSection(fluid, 'navbar', 'blog_title', v);
    });
    setIf(body.subtitle, (v) => { main = replaceTopLevelField(main, 'subtitle', v); });
    setIf(body.description, (v) => { main = replaceTopLevelField(main, 'description', v); });
    setIf(body.author, (v) => { main = replaceTopLevelField(main, 'author', v); });
    setIf(body.navbarTitle, (v) => { fluid = replaceFieldUnderSection(fluid, 'navbar', 'blog_title', v); });
    setIf(body.aboutName, (v) => { fluid = replaceFieldUnderSection(fluid, 'about', 'name', v); });
    let homeIntro = null;
    setIf(body.aboutIntro, (v) => {
      fluid = replaceFieldUnderSection(fluid, 'about', 'intro', v);
      homeIntro = v;
    });
    setIf(body.homeIntro, (v) => { homeIntro = v; });
    if (Array.isArray(body.slogans)) {
      const cleaned = body.slogans.map((s) => String(s || '').trim()).filter(Boolean);
      fluid = replaceSloganList(fluid, cleaned);
    }
    await fs.writeFile(hexoConfig, main, 'utf8');
    await fs.writeFile(fluidPath, fluid, 'utf8');
    if (homeIntro !== null) {
      await writeHomeProfile({ intro: homeIntro }, readFieldUnderSection(fluid, 'about', 'intro'));
    }
    const currentHomeProfile = await readHomeProfile(readFieldUnderSection(fluid, 'about', 'intro'));
    res.json({
      ok: true,
      homeIntro: currentHomeProfile.intro,
      aboutIntro: readFieldUnderSection(fluid, 'about', 'intro'),
    });
  } catch (error) {
    res.status(500).json({ error: `保存站点配置失败：${error.message}` });
  }
});

// 标签和分类汇总（用于自动补全）
app.get('/api/taxonomy', auth, async (_req, res) => {
  await ensureDirs();
  try {
    const files = (await fs.readdir(postsDir)).filter((file) => file.endsWith('.md'));
    const posts = await Promise.all(files.map(readPost));
    const categories = new Set();
    const tags = new Set();
    posts.forEach((post) => {
      (post.categories || []).forEach((c) => categories.add(String(c)));
      (post.tags || []).forEach((t) => tags.add(String(t)));
    });
    res.json({ categories: Array.from(categories), tags: Array.from(tags) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 草稿自动保存（仅本地文件，不会发布）
app.put('/api/draft', auth, async (req, res) => {
  await ensureDirs();
  try {
    const draftDir = path.join(root, '.admin-tmp');
    await fs.mkdir(draftDir, { recursive: true });
    const draftFile = path.join(draftDir, 'autosave.json');
    await fs.writeFile(draftFile, JSON.stringify({
      ...req.body,
      savedAt: new Date().toISOString(),
    }, null, 2), 'utf8');
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/draft', auth, async (_req, res) => {
  try {
    const draftFile = path.join(root, '.admin-tmp', 'autosave.json');
    const raw = await fs.readFile(draftFile, 'utf8');
    res.json(JSON.parse(raw));
  } catch (_) {
    res.json(null);
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
  try {
    assertSafeMdFile(file);
  } catch (error) {
    res.status(400).json({ error: error.message });
    return;
  }
  await backupPost(file, 'save');
  await fs.writeFile(path.join(postsDir, file), postMarkdown(req.body), 'utf8');
  res.json(await readPost(file));
});

app.delete('/api/posts/:file', auth, async (req, res) => {
  await ensureDirs();
  const file = req.params.file;
  try {
    assertSafeMdFile(file);
  } catch (error) {
    res.status(400).json({ error: error.message });
    return;
  }
  await backupPost(file, 'delete');
  const source = path.join(postsDir, file);
  const target = path.join(trashDir, `${timestampName()}-${safeName(file.replace(/\.md$/i, ''), 'post')}.md`);
  try {
    await fs.rename(source, target);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  res.json({ ok: true });
});

app.get('/api/trash', auth, async (_req, res) => {
  await ensureDirs();
  const files = (await fs.readdir(trashDir)).filter((file) => file.endsWith('.md'));
  const items = await Promise.all(files.map(async (file) => {
    const raw = await fs.readFile(path.join(trashDir, file), 'utf8');
    const stat = await fs.stat(path.join(trashDir, file));
    const parsed = matter(raw);
    return {
      file,
      title: parsed.data.title || file.replace(/\.md$/i, ''),
      date: parsed.data.date || '',
      deletedAt: stat.mtime,
    };
  }));
  items.sort((a, b) => String(b.deletedAt).localeCompare(String(a.deletedAt)));
  res.json(items);
});

app.post('/api/trash/:file/restore', auth, async (req, res) => {
  await ensureDirs();
  const file = req.params.file;
  try {
    assertSafeMdFile(file);
  } catch (error) {
    res.status(400).json({ error: error.message });
    return;
  }
  const raw = await fs.readFile(path.join(trashDir, file), 'utf8');
  const parsed = matter(raw);
  const title = parsed.data.title || file.replace(/^\d{8}-\d{6}-/, '').replace(/\.md$/i, '');
  const restoredFile = await uniquePostFile(safeName(title, 'restored-post'));
  await fs.writeFile(path.join(postsDir, restoredFile), raw, 'utf8');
  await fs.rm(path.join(trashDir, file), { force: true });
  res.json(await readPost(restoredFile));
});

app.delete('/api/trash/:file', auth, async (req, res) => {
  await ensureDirs();
  const file = req.params.file;
  try {
    assertSafeMdFile(file);
  } catch (error) {
    res.status(400).json({ error: error.message });
    return;
  }
  await fs.rm(path.join(trashDir, file), { force: true });
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
  res.json(await run(npmCommand, ['run', 'build']));
});

app.post('/api/import-md', auth, upload.single('file'), async (req, res) => {
  await ensureDirs();
  if (!req.file) {
    res.status(400).json({ error: '请选择 Markdown 文件或 ZIP 压缩包' });
    return;
  }
  const ext = path.extname(req.file.originalname).toLowerCase();
  if (!['.md', '.markdown', '.zip'].includes(ext)) {
    await fs.rm(req.file.path, { force: true });
    res.status(400).json({ error: '只能导入 .md、.markdown 或包含文章资源的 .zip 文件' });
    return;
  }
  try {
    const post = ext === '.zip'
      ? await importZipPackage(req.file.path, req.file.originalname)
      : await importMarkdownText(await fs.readFile(req.file.path, 'utf8'), req.file.originalname, ext);
    await fs.rm(req.file.path, { force: true });
    res.json(post);
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

app.get('/api/publish/status', auth, async (_req, res) => {
  try {
    res.json(await collectPublishStatus());
  } catch (error) {
    res.status(500).json({ error: `读取发布状态失败：${error.message}` });
  }
});

app.get('/api/jobs/:id', auth, (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) {
    res.status(404).json({ error: '任务不存在' });
    return;
  }
  res.json(job);
});

app.listen(port, host, async () => {
  await ensureDirs();
  try {
    const filePassword = (await fs.readFile(passwordFile, 'utf8')).trim();
    if (filePassword) password = filePassword;
  } catch (_) {
    // Use the default or environment password when no local password file exists.
  }
  console.log(`博客管理员后台已启动：http://${host}:${port}`);
  console.log(`默认密码：${password}`);
});
