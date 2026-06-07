'use strict';

const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');

const express = require('express');

const projectRoot = path.resolve(__dirname, '..');
const app = express();

const port = positiveInt(process.env.SKILL_CHAT_PORT || process.env.PORT, 5050);
const host = process.env.SKILL_CHAT_HOST || process.env.HOST || '127.0.0.1';
const routePrefix = normalizeRoutePrefix(process.env.PUBLIC_SKILL_CHAT_ROUTE_PREFIX || '/boke/api/public-skill-chat');
const legacyRoutePrefix = normalizeRoutePrefix(process.env.PUBLIC_SKILL_CHAT_LEGACY_ROUTE_PREFIX || '/api/public-skill-chat');
const storageDir = path.resolve(process.env.PUBLIC_SKILL_CHAT_DIR || path.join(projectRoot, 'skill-chat-sessions', 'sessions'));
const skillName = normalizeSkillName(process.env.SKILL_CHAT_SKILL || 'xie-xiao-shu');
const skillDir = path.resolve(process.env.SKILL_CHAT_SKILL_DIR || path.join(projectRoot, 'skills', skillName));
const baseUrl = normalizeBaseUrl(process.env.SKILL_CHAT_BASE_URL || process.env.OPENAI_BASE_URL || '');
const model = String(process.env.SKILL_CHAT_MODEL || '').trim();
const apiKey = String(process.env.SKILL_CHAT_API_KEY || process.env.OPENAI_API_KEY || '').trim();
const secretSalt = String(process.env.SKILL_CHAT_SECRET_SALT || '').trim();
const allowedOrigins = csv(process.env.PUBLIC_SKILL_CHAT_ALLOWED_ORIGINS || process.env.PUBLIC_SKILL_CHAT_ORIGIN || '');
const rateLimitPerHour = positiveInt(process.env.PUBLIC_SKILL_CHAT_RATE_LIMIT, 60);
const requestTimeoutMs = positiveInt(process.env.SKILL_CHAT_REQUEST_TIMEOUT_MS, 120000);
const minSecretLength = positiveInt(process.env.SKILL_CHAT_MIN_SECRET_LENGTH, 12);
const maxSecretLength = positiveInt(process.env.SKILL_CHAT_MAX_SECRET_LENGTH, 160);
const maxMessageChars = positiveInt(process.env.SKILL_CHAT_MAX_MESSAGE_CHARS, 8000);
const maxConversationChars = positiveInt(process.env.SKILL_CHAT_MAX_CONVERSATION_CHARS, 60000);
const maxMaterialChars = positiveInt(process.env.SKILL_CHAT_MAX_MATERIAL_CHARS, 140000);

const rateBuckets = new Map();
const sessionLocks = new Map();
let skillMaterialCache = null;

app.set('trust proxy', 1);
app.use(express.json({ limit: '256kb' }));
app.use((error, _req, res, next) => {
  if (error && error.type === 'entity.parse.failed') {
    res.status(400).json({ error: '请求体不是有效 JSON' });
    return;
  }
  next(error);
});

const router = express.Router();
router.use(publicAccess);
router.get('/health', health);
router.post('/session', withJsonErrors(sessionRoute));
router.post('/message', withJsonErrors(messageRoute));
router.post('/end', withJsonErrors(endRoute));

app.use(routePrefix, router);
if (legacyRoutePrefix !== routePrefix) app.use(legacyRoutePrefix, router);

app.use((req, res) => {
  if (isPublicPath(req.path)) {
    res.status(404).json({ error: '接口不存在' });
    return;
  }
  res.status(404).type('text/plain').send('Not found');
});

app.use((error, _req, res, _next) => {
  const status = error && error.status ? error.status : 500;
  res.status(status).json({ error: publicErrorMessage(error, status) });
});

app.listen(port, host, async () => {
  await ensureStorageDir();
  console.log(`Skill chat API listening on http://${host}:${port}${routePrefix}`);
});

function csv(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function positiveInt(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function normalizeRoutePrefix(value) {
  const raw = String(value || '').trim().replace(/\/+$/, '');
  if (!raw || raw[0] !== '/') throw new Error('PUBLIC_SKILL_CHAT_ROUTE_PREFIX 必须以 / 开头');
  return raw;
}

function normalizeBaseUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function normalizeSkillName(value) {
  const name = String(value || 'xie-xiao-shu').trim();
  if (!/^[a-zA-Z0-9_.-]+$/.test(name) || name.includes('..')) {
    throw new Error('SKILL_CHAT_SKILL 只能包含字母、数字、点、下划线和短横线');
  }
  return name;
}

function isPublicPath(pathname) {
  return pathname === routePrefix
    || pathname.startsWith(`${routePrefix}/`)
    || pathname === legacyRoutePrefix
    || pathname.startsWith(`${legacyRoutePrefix}/`);
}

function publicAccess(req, res, next) {
  const origin = req.get('Origin') || '';
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  try {
    enforceRateLimit(req);
    next();
  } catch (error) {
    next(error);
  }
}

function enforceRateLimit(req) {
  const key = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const windowMs = 60 * 60 * 1000;
  const bucket = rateBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  if (bucket.count >= rateLimitPerHour) throw httpError(429, '请求过于频繁，请稍后再试');
  bucket.count += 1;
}

async function health(_req, res) {
  let storageWritable = false;
  let skillInstalled = false;
  try {
    await ensureStorageDir();
    await fs.access(storageDir, fs.constants.W_OK);
    storageWritable = true;
  } catch (_) {}
  try {
    await loadSkillMaterial();
    skillInstalled = true;
  } catch (_) {}
  res.json({
    ok: Boolean(baseUrl && model && apiKey && secretSalt && storageWritable && skillInstalled),
    time: new Date().toISOString(),
    skillName,
    modelConfigured: Boolean(model),
    hasApiKey: Boolean(apiKey),
    hasSecretSalt: Boolean(secretSalt),
    storageWritable,
    skillInstalled,
  });
}

async function sessionRoute(req, res) {
  const secret = validateSecret(req.body && req.body.secret);
  const id = sessionId(secret);
  const session = await withSessionLock(id, async () => {
    const loaded = await loadSessionById(id);
    if (loaded) return loaded;
    const now = new Date().toISOString();
    const created = {
      id,
      title: 'Skill 对话记录',
      status: 'active',
      createdAt: now,
      updatedAt: now,
      endedAt: '',
      messages: [],
      summary: '',
    };
    await saveSession(created);
    return created;
  });
  res.json(publicSessionView(session));
}

async function messageRoute(req, res) {
  const secret = validateSecret(req.body && req.body.secret);
  const content = String((req.body && req.body.message) || '').trim();
  if (!content) throw httpError(400, '消息不能为空');
  if (content.length > maxMessageChars) throw httpError(413, `单条消息不能超过 ${maxMessageChars} 个字符`);
  const id = sessionId(secret);
  const result = await withSessionLock(id, async () => {
    const session = await loadSessionById(id) || newSession(id);
    if (session.status === 'ended') throw httpError(409, '这段对话已经结束，请换一个会话密钥开始新的对话');
    const now = new Date().toISOString();
    session.messages.push({ role: 'user', content, createdAt: now });
    if (session.messages.length === 1) session.title = titleFromMessage(content);
    const reply = await runSkillChat(session.messages.map(({ role, content: text }) => ({ role, content: text })));
    session.messages.push({
      role: 'assistant',
      content: reply.content,
      createdAt: new Date().toISOString(),
      model: reply.model,
      usage: reply.usage,
    });
    session.updatedAt = new Date().toISOString();
    await saveSession(session);
    return { session, reply };
  });
  res.json({
    session: publicSessionView(result.session),
    reply: { role: 'assistant', content: result.reply.content },
  });
}

async function endRoute(req, res) {
  const secret = validateSecret(req.body && req.body.secret);
  const id = sessionId(secret);
  const session = await withSessionLock(id, async () => {
    const loaded = await loadSessionById(id);
    if (!loaded || loaded.messages.length === 0) throw httpError(400, '还没有可分析的对话');
    if (loaded.status !== 'ended' || !loaded.summary) {
      loaded.summary = await runSkillSummary(loaded.messages.map(({ role, content }) => ({ role, content })));
      loaded.status = 'ended';
      loaded.endedAt = new Date().toISOString();
      loaded.updatedAt = loaded.endedAt;
      await saveSession(loaded);
    }
    return loaded;
  });
  res.json(publicSessionView(session));
}

function validateSecret(value) {
  if (!secretSalt) throw httpError(500, '服务端未配置会话盐');
  const text = String(value || '').trim();
  if (text.length < minSecretLength) throw httpError(400, `会话密钥至少需要 ${minSecretLength} 个字符`);
  if (text.length > maxSecretLength) throw httpError(400, '会话密钥过长');
  return text;
}

function sessionId(secret) {
  return crypto.createHmac('sha256', secretSalt).update(secret).digest('hex').slice(0, 32);
}

function newSession(id) {
  const now = new Date().toISOString();
  return {
    id,
    title: 'Skill 对话记录',
    status: 'active',
    createdAt: now,
    updatedAt: now,
    endedAt: '',
    messages: [],
    summary: '',
  };
}

function sessionJsonFile(id) {
  return path.join(storageDir, `${id}.json`);
}

function sessionMarkdownFile(id) {
  return path.join(storageDir, `${id}.md`);
}

async function ensureStorageDir() {
  await fs.mkdir(storageDir, { recursive: true });
  await fs.chmod(storageDir, 0o750).catch(() => {});
}

async function loadSessionById(id) {
  try {
    const session = JSON.parse(await fs.readFile(sessionJsonFile(id), 'utf8'));
    if (session && session.id === id && Array.isArray(session.messages)) return session;
    throw httpError(500, '会话文件结构不合法');
  } catch (error) {
    if (error && error.code === 'ENOENT') return null;
    throw error;
  }
}

async function saveSession(session) {
  await ensureStorageDir();
  await atomicWrite(sessionJsonFile(session.id), `${JSON.stringify(session, null, 2)}\n`, 0o640);
  await atomicWrite(sessionMarkdownFile(session.id), sessionMarkdown(session), 0o640);
}

async function atomicWrite(file, content, mode) {
  const temp = `${file}.${process.pid}.${crypto.randomBytes(8).toString('hex')}.tmp`;
  await fs.writeFile(temp, content, { encoding: 'utf8', mode });
  await fs.rename(temp, file);
  await fs.chmod(file, mode).catch(() => {});
}

async function withSessionLock(id, fn) {
  const previous = sessionLocks.get(id) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => { release = resolve; });
  sessionLocks.set(id, previous.then(() => current, () => current));
  await previous.catch(() => {});
  try {
    return await fn();
  } finally {
    release();
    if (sessionLocks.get(id) === current) sessionLocks.delete(id);
  }
}

function titleFromMessage(message) {
  const text = String(message || '').replace(/\s+/g, ' ').trim();
  if (!text) return 'Skill 对话记录';
  return text.length > 28 ? `${text.slice(0, 28)}...` : text;
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

function sessionMarkdown(session) {
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
  if (session.summary) lines.push('## 结束分析', '', session.summary.trim(), '');
  lines.push('## 对话记录', '');
  session.messages.forEach((message, index) => {
    lines.push(`### ${index + 1}. ${message.role === 'user' ? '用户' : 'Skill'}`, '');
    lines.push(String(message.content || '').trim() || '(空)', '');
  });
  return `${lines.join('\n')}\n`;
}

async function loadSkillMaterial() {
  if (skillMaterialCache) return skillMaterialCache;
  const skillFile = path.join(skillDir, 'SKILL.md');
  const knowledgeFile = path.join(skillDir, '知识库.txt');
  const [skill, knowledge] = await Promise.all([
    fs.readFile(skillFile, 'utf8').catch((error) => {
      if (error && error.code === 'ENOENT') throw httpError(503, `缺少 skill 文件：${skillFile}`);
      throw error;
    }),
    fs.readFile(knowledgeFile, 'utf8').catch((error) => {
      if (error && error.code === 'ENOENT') throw httpError(503, `缺少知识库文件：${knowledgeFile}`);
      throw error;
    }),
  ]);
  const material = [
    `# Skill: ${skillName}`,
    '',
    '## SKILL.md',
    skill.trim(),
    '',
    '## 知识库.txt',
    knowledge.trim(),
  ].join('\n');
  if (material.length > maxMaterialChars) {
    throw httpError(503, `skill 材料长度 ${material.length} 超过 SKILL_CHAT_MAX_MATERIAL_CHARS=${maxMaterialChars}`);
  }
  skillMaterialCache = material;
  return skillMaterialCache;
}

async function runSkillChat(messages) {
  assertModelConfigured();
  const safeMessages = validateConversation(messages);
  const material = await loadSkillMaterial();
  const systemPrompt = [
    `你正在作为公开网页里的 skill 对话助手运行，当前 skill: ${skillName}。`,
    '默认使用简体中文。回答要直接、克制、有洞察，但不能冒充持牌心理咨询、医疗诊断或危机干预。',
    '用户如果表达自伤、自杀或现实紧急危险，立即停止分析，建议联系当地紧急服务或危机热线。',
    '严格依据下方完整 skill 材料工作；如果材料不足以支持某个“原话”或事实，不要编造。',
    '输出适合直接显示在网页中的 Markdown。',
    '',
    material,
  ].join('\n\n');
  const payload = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      ...safeMessages,
    ],
    temperature: Number(process.env.SKILL_CHAT_TEMPERATURE || 0.7),
  };
  const data = await openAIRequest('/chat/completions', payload);
  const content = data && data.choices && data.choices[0] && data.choices[0].message
    ? String(data.choices[0].message.content || '').trim()
    : '';
  if (!content) throw httpError(502, '模型没有返回可显示的内容');
  return {
    role: 'assistant',
    content,
    model: data.model || model,
    usage: data.usage || null,
  };
}

async function runSkillSummary(messages) {
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
  const reply = await runSkillChat([...messages, { role: 'user', content: summaryPrompt }]);
  return reply.content;
}

function assertModelConfigured() {
  if (!baseUrl) throw httpError(503, '服务端未配置模型接口地址');
  if (!model) throw httpError(503, '服务端未配置模型名称');
  if (!apiKey) throw httpError(503, '服务端未配置模型 API Key');
}

function validateConversation(messages) {
  if (!Array.isArray(messages)) throw httpError(400, '消息列表不合法');
  let total = 0;
  const safe = messages.map((item) => {
    const role = String(item && item.role || '').trim();
    const content = String(item && item.content || '').trim();
    if (!['user', 'assistant'].includes(role) || !content) throw httpError(400, '消息列表包含不合法条目');
    total += content.length;
    return { role, content };
  });
  if (total > maxConversationChars) {
    throw httpError(413, `会话上下文超过 ${maxConversationChars} 个字符，请结束当前会话后重新开始`);
  }
  return safe;
}

async function openAIRequest(endpoint, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    const response = await fetch(`${baseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (_) {}
    if (!response.ok) {
      const detail = data && data.error && (data.error.message || data.error);
      throw httpError(response.status >= 500 ? 502 : response.status, typeof detail === 'string' ? detail : `模型接口 HTTP ${response.status}`);
    }
    if (!data) throw httpError(502, '模型接口返回了无效 JSON');
    return data;
  } catch (error) {
    if (error && error.name === 'AbortError') throw httpError(504, '模型接口请求超时');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function withJsonErrors(handler) {
  return async (req, res, next) => {
    try {
      await handler(req, res);
    } catch (error) {
      next(error);
    }
  };
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function publicErrorMessage(error, status) {
  if (!error) return '服务异常';
  if (status >= 500 && !error.status) return '服务异常';
  return error.message || '服务异常';
}
