// Service Worker for 命理 API
// 在浏览器端直接调用 API，避免 CORS 问题

const API_KEY = 'sk-Tz8ULzbBZgjj9hAjAtjvTz39lww0LiUbduxc4c4wnOOlN9Y3';
const BASE_URL = 'https://aiapi.yjsnpitext1145141.top/v1';
const MODEL = 'claude-sonnet-4-6';

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 只拦截命理 API 请求
  if (url.pathname === '/api/mingli' && event.request.method === 'POST') {
    event.respondWith(handleMingliRequest(event.request));
  }
});

async function handleMingliRequest(request) {
  try {
    const body = await request.json();
    const { year, month, day, hour, gender, message } = body;

    const userMsg = message?.trim()
      || `请直接创作一段${year}年${month}月${day}日${hour}出生的${gender}性命理解读，风格像朋友聊天，不需要计算实际星盘，依次覆盖性格、事业、财运、感情、近期运势，Markdown格式，结尾提2个问题。`;

    const response = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: userMsg }],
        temperature: 0.7,
        max_tokens: 16000,
        stream: true,
      }),
    });

    if (!response.ok) {
      return new Response(
        JSON.stringify({ error: '模型接口错误' }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 透传流式响应
    return new Response(response.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});
