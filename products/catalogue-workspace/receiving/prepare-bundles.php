<?php
declare(strict_types=1);
/**
 * Preserve the original bundles.php text and insert one native bundle into its
 * literal returned array. Computed/conditional configuration remains with its
 * original owner; no PHP source is evaluated by this preparation helper.
 */
if ($argc !== 3) {
    fwrite(STDERR, "Usage: PHP prepare-bundles.php ORIGINAL COMPLETE_POSTIMAGE\n");
    exit(2);
}
$input = $argv[1];
$output = $argv[2];
if (!is_file($input) || is_link($input)) {
    throw new RuntimeException('Select the retained original regular bundles.php.');
}
$source = file_get_contents($input);
if ($source === false) {
    throw new RuntimeException('The original bundle source could not be read.');
}
$bundle = 'Tjl\\CatalogueWorkspace\\TjlCatalogueWorkspaceBundle';
$tokens = token_get_all($source, TOKEN_PARSE);
$items = [];
$offset = 0;
foreach ($tokens as $token) {
    $text = is_array($token) ? $token[1] : $token;
    $items[] = ['id' => is_array($token) ? $token[0] : null, 'text' => $text, 'offset' => $offset];
    $offset += strlen($text);
}
$significant = static fn(array $t): bool => !in_array($t['id'], [T_WHITESPACE, T_COMMENT, T_DOC_COMMENT], true);
$returns = [];
foreach ($items as $index => $item) {
    if ($item['id'] === T_RETURN) {
        $returns[] = $index;
    }
}
if (count($returns) !== 1) {
    throw new RuntimeException('Computed/conditional bundle configuration requires its original complete reviewed postimage.');
}
$start = $returns[0] + 1;
while (isset($items[$start]) && !$significant($items[$start])) {
    ++$start;
}
if (($items[$start]['id'] ?? null) === T_ARRAY) {
    ++$start;
    while (isset($items[$start]) && !$significant($items[$start])) {
        ++$start;
    }
    $open = '(';
    $close = ')';
} else {
    $open = '[';
    $close = ']';
}
if (($items[$start]['text'] ?? null) !== $open) {
    throw new RuntimeException('The original returned bundle value is not a literal array.');
}
$stack = [];
$end = null;
for ($index = $start; $index < count($items); ++$index) {
    $item = $items[$index];
    if ($item['id'] !== null) {
        continue;
    }
    if (in_array($item['text'], ['[', '(', '{'], true)) {
        $stack[] = $item['text'];
    } elseif (in_array($item['text'], [']', ')', '}'], true)) {
        $match = [']' => '[', ')' => '(', '}' => '{'][$item['text']];
        if (array_pop($stack) !== $match) {
            throw new RuntimeException('Original PHP token structure differs.');
        }
        if ($stack === []) {
            $end = $index;
            break;
        }
    }
}
if ($end === null || $items[$end]['text'] !== $close) {
    throw new RuntimeException('Original literal bundle array is incomplete.');
}
$already = false;
foreach ($items as $item) {
    if ($item['id'] !== null && ltrim($item['text'], '\\') === $bundle) {
        $already = true;
    }
}
$last = $end - 1;
while ($last > $start && !$significant($items[$last])) {
    --$last;
}
$comma = $last !== $start && $items[$last]['text'] !== ',' ? ',' : '';
$newline = str_contains($source, "\r\n") ? "\r\n" : "\n";
$insert = $comma . $newline . '    \\' . $bundle . "::class => ['all' => true]," . $newline;
$position = $items[$end]['offset'];
$postimage = $already ? $source : substr($source, 0, $position) . $insert . substr($source, $position);
token_get_all($postimage, TOKEN_PARSE);
$parent = dirname($output);
if (!is_dir($parent) && !mkdir($parent, 0700, true) && !is_dir($parent)) {
    throw new RuntimeException('Cannot prepare the complete bundle postimage.');
}
if (is_file($output)) {
    if (file_get_contents($output) !== $postimage) {
        throw new RuntimeException('The retained complete bundle postimage differs.');
    }
} else {
    $temporary = tempnam($parent, '.bundles-');
    if ($temporary === false) {
        throw new RuntimeException('Cannot allocate native postimage.');
    }
    try {
        chmod($temporary, 0600);
        $handle = fopen($temporary, 'wb');
        if ($handle === false) {
            throw new RuntimeException('Cannot open native postimage.');
        }
        try {
            $written = 0;
            while ($written < strlen($postimage)) {
                $n = fwrite($handle, substr($postimage, $written));
                if ($n === false || $n === 0) {
                    throw new RuntimeException('Incomplete native postimage write.');
                }
                $written += $n;
            }
            fflush($handle);
            fsync($handle);
        } finally {
            fclose($handle);
        }
        if (!rename($temporary, $output)) {
            throw new RuntimeException('Cannot retain the complete native postimage.');
        }
    } finally {
        if (is_file($temporary)) {
            unlink($temporary);
        }
    }
}
echo json_encode(['schema' => 'tjl.catalogue.bundle-postimage.v1',
    'original' => ['bytes' => strlen($source), 'sha256' => hash('sha256', $source)],
    'postimage' => ['bytes' => strlen($postimage), 'sha256' => hash('sha256', $postimage)],
    'path' => $output], JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES) . "\n";
