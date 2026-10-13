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
// Resolve only explicit simple class imports before the literal returned array.
// A use statement alone never constitutes bundle registration.
$aliases = [];
for ($i = 0; $i < $returns[0]; ++$i) {
    if ($items[$i]['id'] !== T_USE) { continue; }
    $use = [];
    while (isset($items[++$i]) && $items[$i]['text'] !== ';') {
        if ($significant($items[$i])) { $use[] = $items[$i]; }
    }
    $name = ''; $alias = ''; $as = false;
    foreach (array_merge($use, [['id' => null, 'text' => ',']]) as $part) {
        if ($part['text'] === ',') {
            if ($name !== '') {
                $bits = explode('\\', trim($name, '\\'));
                $aliases[$alias !== '' ? $alias : end($bits)] = trim($name, '\\');
            }
            $name = ''; $alias = ''; $as = false;
        } elseif ($part['id'] === T_AS) { $as = true;
        } elseif (in_array($part['text'], ['{', '}'], true) || in_array($part['id'], [T_FUNCTION, T_CONST], true)) {
            throw new RuntimeException('Grouped or non-class imports require the original complete bundle postimage review.');
        } elseif ($as) { $alias .= $part['text'];
        } else { $name .= $part['text']; }
    }
}
$entries = []; $entry = []; $depth = 0;
for ($i = $start + 1; $i < $end; ++$i) {
    $token = $items[$i];
    if (!$significant($token)) { continue; }
    if ($token['id'] === null && in_array($token['text'], ['[', '(', '{'], true)) { ++$depth; }
    if ($token['id'] === null && in_array($token['text'], [']', ')', '}'], true)) { --$depth; }
    if ($token['text'] === ',' && $depth === 0) { if ($entry !== []) { $entries[] = $entry; } $entry = [];
    } else { $entry[] = $token; }
}
if ($entry !== []) { $entries[] = $entry; }
$already = false;
foreach ($entries as $entry) {
    $arrow = null;
    foreach ($entry as $i => $part) { if ($part['id'] === T_DOUBLE_ARROW) { $arrow = $i; break; } }
    if ($arrow === null) { throw new RuntimeException('Every bundle entry must have an explicit literal class key.'); }
    $key = array_slice($entry, 0, $arrow);
    $name = implode('', array_column($key, 'text'));
    if (str_ends_with(strtolower($name), '::class')) {
        $name = substr($name, 0, -7);
        $absolute = str_starts_with($name, '\\');
        $name = ltrim($name, '\\');
        $pieces = explode('\\', $name);
        if (!$absolute && isset($aliases[$pieces[0]])) {
            $first = array_shift($pieces);
            $name = $aliases[$first] . ($pieces === [] ? '' : '\\' . implode('\\', $pieces));
        }
    } elseif (count($key) === 1 && $key[0]['id'] === T_CONSTANT_ENCAPSED_STRING &&
              $name[0] === "'" && str_ends_with($name, "'")) {
        $name = str_replace(["\\\\", "\\'"], ["\\", "'"], substr($name, 1, -1));
        $name = ltrim($name, '\\');
    } else {
        throw new RuntimeException('Computed bundle keys require the original complete reviewed postimage.');
    }
    if ($name !== $bundle) { continue; }
    if ($already) { throw new RuntimeException('The original bundle array contains duplicate workspace entries.'); }
    $value = array_slice($entry, $arrow + 1);
    $literal = implode('', array_column($value, 'text'));
    // Do not silently enable a deliberately disabled or conditional entry.
    if (!preg_match('/^(?:\[(.*)\]|array\((.*)\))$/s', $literal, $match)) {
        throw new RuntimeException('Review the workspace bundle enabled environments explicitly.');
    }
    $inside = $match[1] !== '' ? $match[1] : ($match[2] ?? '');
    $environmentEntries = array_filter(explode(',', $inside), static fn(string $x): bool => $x !== '');
    $all = false;
    foreach ($environmentEntries as $environmentEntry) {
        if (!preg_match('/^([\'"])([A-Za-z0-9_-]+)\1=>true$/i', $environmentEntry, $environment)) {
            throw new RuntimeException('The existing workspace bundle environment is disabled or computed; review its exact postimage.');
        }
        if ($environment[2] === 'all') { $all = true; }
    }
    if (!$all) { throw new RuntimeException('The existing workspace bundle must be explicitly enabled for all environments.'); }
    $already = true;
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
