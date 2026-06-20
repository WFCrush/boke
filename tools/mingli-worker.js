// 紫微斗数命盘解读 Cloudflare Worker
// ⚠️ 警告：此文件含密钥，禁止提交到 GitHub！

const API_KEY = 'sk-Tz8ULzbBZgjj9hAjAtjvTz39lww0LiUbduxc4c4wnOOlN9Y3';
const BASE_URL = 'https://aiapi.yjsnpitext1145141.top/v1';
const MODEL = 'claude-opus-4-6';

const SYSTEM_PROMPT = `你是一位紫微斗数命理师，融合三合派与中州派解盘风格。

【核心原则】
- 用朋友聊天的语气，不讲教科书式定义
- 给出有判断力的结论，不模棱两可
- 把星曜名词转化为生活类比
- 不预言死亡，不制造恐惧，不替代决策
- 初次解读准确率约65-75%，结尾可通过校准问题提升到85%+

【解读结构】每个板块：一句核心判断 → 星盘依据 → 现实影响 → 一条具体建议

【解读板块】命盘底色（先天性格）、事业、财运、感情婚姻、当前大限、近年流年

【输出格式】直接输出 Markdown，可使用加粗和列表。结尾提2-3个校准问题来提升准确度。`;

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
      || `请帮我解读命盘：${year}年${month}月${day}日，${hour}，${gender}`;

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
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMsg },
        ],
        temperature: 0.7,
        max_tokens: 2000,
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
