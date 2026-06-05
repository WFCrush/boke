<?php
require __DIR__ . '/bootstrap.php';

try {
    $input = psc_input();
    psc_rate_limit();
    $session = psc_load_session($input['secret'] ?? '');
    if (count($session['messages'] ?? []) === 0) throw new RuntimeException('还没有可分析的对话');
    if (($session['status'] ?? 'active') !== 'ended' || empty($session['summary'])) {
        $messages = array_map(function ($message) {
            return ['role' => $message['role'] ?? '', 'content' => $message['content'] ?? ''];
        }, $session['messages']);
        $session['summary'] = psc_summary($messages);
        $session['status'] = 'ended';
        $session['endedAt'] = gmdate('c');
        $session['updatedAt'] = gmdate('c');
        psc_save_session($session);
    }
    psc_json(psc_public_view($session));
} catch (Throwable $error) {
    psc_error($error, 400);
}
