// Vercel Serverless Function - 紫微斗数命理解读
export default async function handler(req, res) {
  // CORS 配置
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method === 'GET') {
    return res.status(200).send('命理解读 API 运行中。请使用 POST 请求。');
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const API_KEY = process.env.CLAUDE_API_KEY || 'sk-Tz8ULzbBZgjj9hAjAtjvTz39lww0LiUbduxc4c4wnOOlN9Y3';
  const BASE_URL = process.env.API_BASE_URL || 'https://aiapi.yjsnpitext1145141.top/v1';
  const MODEL = process.env.MODEL || 'claude-sonnet-4-6';

  const { year, month, day, hour, gender, message } = req.body;
  const userMsg = message?.trim()
    || `请直接创作一段${year}年${month}月${day}日${hour}出生的${gender}性命理解读，风格像朋友聊天，不需要计算实际星盘，依次覆盖性格、事业、财运、感情、近期运势，Markdown格式，结尾提2个问题。`;

  if (!userMsg) {
    return res.status(400).json({ error: '缺少生辰信息' });
  }

  try {
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
      const error = await response.json().catch(() => ({}));
      return res.status(502).json({
        error: error?.error?.message || '模型接口错误'
      });
    }

    // 设置 SSE 响应头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // 透传流式响应
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      res.write(chunk);
    }

    res.end();
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({
      error: '服务器错误: ' + error.message
    });
  }
}
