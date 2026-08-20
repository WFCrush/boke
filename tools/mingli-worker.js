// 紫微斗数命盘解读 Cloudflare Worker
// ⚠️ 警告：此文件含密钥，禁止提交到 GitHub！

const API_KEY = 'sk-Tz8ULzbBZgjj9hAjAtjvTz39lww0LiUbduxc4c4wnOOlN9Y3';
const BASE_URL = 'https://aiapi.yjsnpitext1145141.top/v1';
const MODEL = 'claude-sonnet-4-6';

const SYSTEM_PROMPT = `你是紫微斗数命理师。用朋友聊天的语气解读命盘，给出有判断力的结论。依次解读：性格、事业、财运、感情、当前运势。用Markdown格式，结尾提2个校准问题。`;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }
    if (request.method === 'GET') {
      return new Response('命理解读 API 运行中。请使用 POST 请求。', {
        status: 200,
        headers: { 'Content-Type': 'text/plain; charset=utf-8', ...CORS }
      });
    }
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: '请求格式错误' }, 400);
    }

    const { year, month, day, hour, gender, message } = body;
    const userMsg = message?.trim()
      || `请直接创作一段${year}年${month}月${day}日${hour}出生的${gender}性命理解读，风格像朋友聊天，不需要计算实际星盘，依次覆盖性格、事业、财运、感情、近期运势，Markdown格式，结尾提2个问题。`;

    if (!userMsg) return json({ error: '缺少生辰信息' }, 400);

    const resp = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'user', content: userMsg },
        ],
        temperature: 0.7,
        max_tokens: 16000,
        stream: true,
      }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      return json({ error: err?.error?.message || '模型接口错误' }, 502);
    }

    // 透传 SSE 流
    return new Response(resp.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        ...CORS,
      },
    });
  },
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}
