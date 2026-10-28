import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve('.docs');
const command = process.argv[2];
const args = process.argv.slice(3).filter((arg) => arg !== '--');
const json = args.includes('--json');
const query = args.filter((arg) => arg !== '--json').join(' ').trim();
const ignored = new Set(['dist', 'node_modules']);

function walk(directory, prefix = '') {
    const result = [];
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).filter((e) => !ignored.has(e.name)).sort((a, b) => a.name.localeCompare(b.name))) {
        const relative = path.join(prefix, entry.name);
        const file = path.join(directory, entry.name);
        result.push({ type: entry.isDirectory() ? 'd' : 'f', path: relative });
        if (entry.isDirectory()) result.push(...walk(file, relative));
    }
    return result;
}
function docs() {
    return walk(root).filter((entry) => entry.type === 'f' && /\.md$/i.test(entry.path) && entry.path !== 'AGENTS.md');
}
function metadata(file) {
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    const end = text.startsWith('---\n') ? text.indexOf('\n---', 4) : -1;
    const meta = {};
    if (end >= 0) for (const line of text.slice(4, end).split('\n')) {
        const match = line.match(/^([\w.-]+):\s*(.*)$/);
        if (match) meta[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
    }
    return { file, meta, text };
}
if (!fs.existsSync(root)) { console.error(`Documentation root does not exist: ${root}`); process.exit(1); }
if (command === 'tree') {
    const result = walk(root);
    if (json) console.log(JSON.stringify(result)); else console.log(result.map((entry) => `${entry.type} ${entry.path}`).join('\n'));
} else if (command === 'index') {
    const topic = args.find((arg) => arg.startsWith('--topic='))?.slice(8) ?? (args.includes('--topic') ? args[args.indexOf('--topic') + 1] : null);
    const result = docs().map((entry) => metadata(entry.path)).filter(({ meta }) => !topic || meta.topic === topic);
    if (json) console.log(JSON.stringify(result.map(({ file, meta }) => ({ file, ...meta }))));
    else console.log(result.map(({ file, meta }) => `${file} | ${meta.kind ?? 'legacy'} | ${meta.topic ?? '(no topic)'} | ${meta.description ?? '(no description)'}`).join('\n'));
} else if (command === 'search') {
    if (!query) { console.error('Usage: pnpm run docs:search -- <query>'); process.exit(1); }
    const pattern = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'iu');
    const result = [];
    for (const entry of docs()) {
        const { meta, text } = metadata(entry.path);
        const searchable = `${entry.path}\n${Object.values(meta).join('\n')}\n${text}`;
        const match = searchable.split(/\r?\n/).findIndex((line) => pattern.test(line));
        if (match >= 0) result.push({ file: entry.path, line: match + 1, text: searchable.split(/\r?\n/)[match].trim() });
    }
    if (json) console.log(JSON.stringify(result)); else console.log(result.map((item) => `${item.file}:${item.line}:${item.text}`).join('\n'));
} else if (command === 'show') {
    const file = query;
    const normalized = file.replace(/^\.docs[\\/]/, '');
    const target = path.resolve(root, normalized);
    if (!target.startsWith(`${root}${path.sep}`) || !fs.existsSync(target)) { console.error(`Documentation file not found: ${file}`); process.exit(1); }
    process.stdout.write(fs.readFileSync(target, 'utf8'));
} else {
    console.error('Usage: node scripts/docs-runtime.mjs <tree|index|search|show> [args]'); process.exit(1);
}
