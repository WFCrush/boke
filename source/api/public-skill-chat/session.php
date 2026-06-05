<?php
require __DIR__ . '/bootstrap.php';

try {
    $input = psc_input();
    psc_rate_limit();
    $session = psc_load_session($input['secret'] ?? '');
    psc_save_session($session);
    psc_json(psc_public_view($session));
} catch (Throwable $error) {
    psc_error($error, 400);
}
