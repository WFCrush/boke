<?php
require __DIR__ . '/bootstrap.php';

try {
    $input = psc_input();
    psc_rate_limit();
    $content = trim((string)($input['message'] ?? ''));
    if ($content === '') throw new RuntimeException('消息不能为空');
    if (strlen($content) > 8000) throw new RuntimeException('单条消息过长');

    $session = psc_load_session($input['secret'] ?? '');
    if (($session['status'] ?? 'active') === 'ended') {
        throw new RuntimeException('这段对话已经结束，请换一个会话密钥开始新的对话');
    }

    $now = gmdate('c');
    $session['messages'][] = ['role' => 'user', 'content' => $content, 'createdAt' => $now];
    if (count($session['messages']) === 1) $session['title'] = psc_title_from_message($content);
    $reply = psc_chat_completion(array_map(function ($message) {
        return ['role' => $message['role'] ?? '', 'content' => $message['content'] ?? ''];
    }, $session['messages']));
    $session['messages'][] = [
        'role' => 'assistant',
        'content' => $reply['content'],
        'createdAt' => gmdate('c'),
        'model' => $reply['model'],
        'usage' => $reply['usage'],
    ];
    $session['updatedAt'] = gmdate('c');
    psc_save_session($session);
    psc_json(['session' => psc_public_view($session), 'reply' => ['role' => 'assistant', 'content' => $reply['content']]]);
} catch (Throwable $error) {
    psc_error($error, 400);
}
