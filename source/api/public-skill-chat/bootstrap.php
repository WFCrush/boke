<?php
declare(strict_types=1);

function psc_config(): array
{
    static $config = null;
    if ($config !== null) return $config;
    $config = require __DIR__ . '/config.php';
    $local = __DIR__ . '/config.local.php';
    if (is_file($local)) {
        $extra = require $local;
        if (is_array($extra)) $config = array_replace($config, $extra);
    }
    $config['baseUrl'] = rtrim((string)($config['baseUrl'] ?? ''), '/');
    $config['model'] = trim((string)($config['model'] ?? ''));
    $config['apiKey'] = trim((string)($config['apiKey'] ?? ''));
    $config['skillName'] = trim((string)($config['skillName'] ?? 'xie-xiao-shu'));
    $config['allowedOrigin'] = (string)($config['allowedOrigin'] ?? '*');
    $config['rateLimitPerHour'] = max(1, (int)($config['rateLimitPerHour'] ?? 60));
    return $config;
}

function psc_send_headers(): void
{
    $config = psc_config();
    header('Content-Type: application/json; charset=utf-8');
    header('Access-Control-Allow-Origin: ' . $config['allowedOrigin']);
    header('Access-Control-Allow-Credentials: true');
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');
    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        http_response_code(204);
        exit;
    }
}

function psc_json(array $data, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function psc_error(Throwable $error, int $status = 400): void
{
    psc_json(['error' => $error->getMessage()], $status);
}

function psc_input(): array
{
    $raw = file_get_contents('php://input') ?: '';
    if ($raw === '') return [];
    $data = json_decode($raw, true);
    if (!is_array($data)) throw new RuntimeException('请求体不是有效 JSON');
    return $data;
}

function psc_storage_dir(string $name): string
{
    $dir = __DIR__ . '/' . $name;
    if (!is_dir($dir) && !mkdir($dir, 0755, true) && !is_dir($dir)) {
        throw new RuntimeException('无法创建存储目录：' . $name);
    }
    return $dir;
}

function psc_protected_file_read(string $file): string
{
    $raw = is_file($file) ? (string)file_get_contents($file) : '';
    return preg_replace('/^<\?php exit; \?>\s*/', '', $raw) ?? '';
}

function psc_protected_file_write(string $file, string $content): void
{
    $payload = "<?php exit; ?>\n" . $content;
    if (file_put_contents($file, $payload, LOCK_EX) === false) {
        throw new RuntimeException('写入会话失败，请检查服务器目录权限');
    }
}

function psc_validate_secret($secret): string
{
    $text = trim((string)$secret);
    if (strlen($text) < 6) throw new RuntimeException('会话密钥至少需要 6 个字符');
    if (strlen($text) > 120) throw new RuntimeException('会话密钥过长');
    return $text;
}

function psc_chat_id(string $secret): string
{
    return substr(hash('sha256', $secret), 0, 24);
}

function psc_session_file(string $id): string
{
    return psc_storage_dir('sessions') . '/' . $id . '.json.php';
}

function psc_markdown_file(string $id): string
{
    return psc_storage_dir('sessions') . '/' . $id . '.md.php';
}

function psc_load_session($secret): array
{
    $secret = psc_validate_secret($secret);
    $id = psc_chat_id($secret);
    $file = psc_session_file($id);
    if (is_file($file)) {
        $session = json_decode(psc_protected_file_read($file), true);
        if (is_array($session)) return $session;
    }
    $now = gmdate('c');
    return [
        'id' => $id,
        'title' => 'Skill 对话记录',
        'status' => 'active',
        'createdAt' => $now,
        'updatedAt' => $now,
        'endedAt' => '',
        'secretHash' => hash('sha256', $secret),
        'messages' => [],
        'summary' => '',
    ];
}

function psc_markdown(array $session): string
{
    $lines = [
        '---',
        'id: ' . ($session['id'] ?? ''),
        'title: ' . ($session['title'] ?? 'Skill 对话记录'),
        'status: ' . ($session['status'] ?? 'active'),
        'createdAt: ' . ($session['createdAt'] ?? ''),
        'updatedAt: ' . ($session['updatedAt'] ?? ''),
        'endedAt: ' . ($session['endedAt'] ?? ''),
        'messageCount: ' . count($session['messages'] ?? []),
        '---',
        '',
        '# ' . ($session['title'] ?? 'Skill 对话记录'),
        '',
        '- 会话 ID：' . ($session['id'] ?? ''),
        '- 状态：' . ($session['status'] ?? 'active'),
        '- 创建时间：' . ($session['createdAt'] ?? ''),
        '- 更新时间：' . ($session['updatedAt'] ?? ''),
        '',
    ];
    if (!empty($session['summary'])) {
        $lines[] = '## 结束分析';
        $lines[] = '';
        $lines[] = trim((string)$session['summary']);
        $lines[] = '';
    }
    $lines[] = '## 对话记录';
    $lines[] = '';
    foreach (($session['messages'] ?? []) as $index => $message) {
        $role = ($message['role'] ?? '') === 'user' ? '用户' : 'Skill';
        $lines[] = '### ' . ($index + 1) . '. ' . $role;
        $lines[] = '';
        $lines[] = trim((string)($message['content'] ?? '')) ?: '(空)';
        $lines[] = '';
    }
    return implode("\n", $lines) . "\n";
}

function psc_save_session(array $session): void
{
    $session['updatedAt'] = $session['updatedAt'] ?? gmdate('c');
    psc_protected_file_write(psc_session_file((string)$session['id']), json_encode($session, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n");
    psc_protected_file_write(psc_markdown_file((string)$session['id']), psc_markdown($session));
}

function psc_public_view(array $session): array
{
    return [
        'id' => $session['id'] ?? '',
        'title' => $session['title'] ?? 'Skill 对话记录',
        'status' => $session['status'] ?? 'active',
        'createdAt' => $session['createdAt'] ?? '',
        'updatedAt' => $session['updatedAt'] ?? '',
        'endedAt' => $session['endedAt'] ?? '',
        'messages' => $session['messages'] ?? [],
        'summary' => $session['summary'] ?? '',
    ];
}

function psc_title_from_message(string $message): string
{
    $text = trim(preg_replace('/\s+/u', ' ', $message) ?? $message);
    if ($text === '') return 'Skill 对话记录';
    if (function_exists('mb_strlen') && mb_strlen($text, 'UTF-8') > 28) {
        return mb_substr($text, 0, 28, 'UTF-8') . '...';
    }
    return strlen($text) > 84 ? substr($text, 0, 84) . '...' : $text;
}

function psc_text_limit(string $text, int $chars): string
{
    if (function_exists('mb_strlen') && function_exists('mb_substr')) {
        return mb_strlen($text, 'UTF-8') > $chars ? mb_substr($text, 0, $chars, 'UTF-8') : $text;
    }
    return strlen($text) > $chars ? substr($text, 0, $chars) : $text;
}

function psc_rate_limit(): void
{
    $config = psc_config();
    $ip = (string)($_SERVER['REMOTE_ADDR'] ?? 'unknown');
    $file = psc_storage_dir('rate') . '/' . hash('sha256', $ip) . '.json.php';
    $now = time();
    $state = ['count' => 0, 'resetAt' => $now + 3600];
    if (is_file($file)) {
        $loaded = json_decode(psc_protected_file_read($file), true);
        if (is_array($loaded)) $state = array_replace($state, $loaded);
    }
    if ((int)$state['resetAt'] <= $now) $state = ['count' => 0, 'resetAt' => $now + 3600];
    if ((int)$state['count'] >= $config['rateLimitPerHour']) {
        throw new RuntimeException('请求过于频繁，请稍后再试');
    }
    $state['count'] = (int)$state['count'] + 1;
    psc_protected_file_write($file, json_encode($state, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
}

function psc_system_prompt(): string
{
    $config = psc_config();
    return implode("\n\n", [
        '你正在作为公开网页里的 skill 对话助手运行，当前 skill: ' . $config['skillName'] . '。',
        '默认使用简体中文。回答要直接、克制、有洞察，但不能冒充持牌心理咨询或医疗诊断。',
        '用户如果表达自伤、自杀或现实危机，立即停止分析，建议联系当地紧急服务或危机热线。',
        '如果用户在关系、梦境、依恋、边界、客体关系等主题上求助，优先使用精神动力学与关系模式分析框架。',
        '输出适合直接显示在网页中的 Markdown。咨询式对话保持短句和追问；用户明确要求分析或总结时再展开。',
        '不要编造某位作者或老师的“原话”。可以说“基于这个框架”，但不能伪造引用。',
    ]);
}

function psc_safe_messages(array $messages): array
{
    $items = array_slice($messages, -20);
    $safe = [];
    foreach ($items as $item) {
        if (!is_array($item)) continue;
        $role = (string)($item['role'] ?? '');
        $content = trim((string)($item['content'] ?? ''));
        if (($role === 'user' || $role === 'assistant') && $content !== '') {
            $safe[] = ['role' => $role, 'content' => psc_text_limit($content, 12000)];
        }
    }
    return $safe;
}

function psc_openai_request(string $endpoint, array $body): array
{
    $config = psc_config();
    if ($config['baseUrl'] === '' || $config['model'] === '') throw new RuntimeException('模型接口尚未配置');
    if ($config['apiKey'] === '') throw new RuntimeException('Skill 对话 API Key 未设置');
    if (!function_exists('curl_init')) throw new RuntimeException('服务器未启用 cURL，无法调用模型接口');

    $ch = curl_init($config['baseUrl'] . '/' . ltrim($endpoint, '/'));
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 15,
        CURLOPT_TIMEOUT => 90,
        CURLOPT_HTTPHEADER => [
            'Authorization: Bearer ' . $config['apiKey'],
            'Content-Type: application/json',
        ],
        CURLOPT_POSTFIELDS => json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
    ]);
    $text = curl_exec($ch);
    $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    curl_close($ch);

    if ($text === false || $text === '') {
        throw new RuntimeException($err ?: '模型接口没有返回内容');
    }
    $data = json_decode((string)$text, true);
    if (!is_array($data)) throw new RuntimeException('模型接口返回了无效 JSON');
    if ($status < 200 || $status >= 300) {
        $detail = $data['error']['message'] ?? $data['error'] ?? ('HTTP ' . $status);
        throw new RuntimeException(is_string($detail) ? $detail : json_encode($detail, JSON_UNESCAPED_UNICODE));
    }
    return $data;
}

function psc_chat_completion(array $messages): array
{
    $config = psc_config();
    $payload = [
        'model' => $config['model'],
        'messages' => array_merge([
            ['role' => 'system', 'content' => psc_system_prompt()],
        ], psc_safe_messages($messages)),
        'temperature' => 0.7,
    ];
    $data = psc_openai_request('/chat/completions', $payload);
    $content = $data['choices'][0]['message']['content'] ?? '';
    if (trim((string)$content) === '') throw new RuntimeException('模型没有返回可显示的内容');
    return [
        'role' => 'assistant',
        'content' => (string)$content,
        'model' => $data['model'] ?? $config['model'],
        'usage' => $data['usage'] ?? null,
    ];
}

function psc_summary(array $messages): string
{
    $prompt = implode("\n", [
        '请对以上完整对话做一次结束分析梳理。',
        '输出结构：',
        '1. 核心主题',
        '2. 反复出现的关系/情绪模式',
        '3. 可能被激活的边界、依恋或客体关系线索',
        '4. 可以继续观察的具体问题',
        '5. 一段克制的收束语',
        '不要诊断，不要吓人，不要承诺疗效。',
    ]);
    $reply = psc_chat_completion(array_merge($messages, [
        ['role' => 'user', 'content' => $prompt],
    ]));
    return $reply['content'];
}

psc_send_headers();
