<?php
require __DIR__ . '/bootstrap.php';

try {
    $config = psc_config();
    $sessions = psc_storage_dir('sessions');
    psc_json([
        'ok' => true,
        'time' => gmdate('c'),
        'model' => $config['model'],
        'baseUrl' => $config['baseUrl'],
        'skillName' => $config['skillName'],
        'hasApiKey' => $config['apiKey'] !== '',
        'storageWritable' => is_writable($sessions),
    ]);
} catch (Throwable $error) {
    psc_error($error, 500);
}
