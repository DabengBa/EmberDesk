import fs from 'node:fs';
import path from 'node:path';

const docsRoot = path.resolve('.docs');
const ownerRoots = new Map([
    ['tech', 'technical'],
    ['adr', 'adr'],
    ['workflows', 'workflow'],
]);
const errors = [];

function filesUnder(directory) {
    if (!fs.existsSync(directory)) return [];
    const result = [];
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) result.push(...filesUnder(file));
        else if (entry.name.endsWith('.md')) result.push(file);
    }
    return result;
}

function parseFrontmatter(file, text) {
    if (!text.startsWith('---\n')) {
        errors.push(`${path.relative(process.cwd(), file)}: missing YAML frontmatter`);
        return null;
    }
    const end = text.indexOf('\n---', 4);
    if (end < 0) {
        errors.push(`${path.relative(process.cwd(), file)}: unclosed YAML frontmatter`);
        return null;
    }
    const meta = {};
    for (const raw of text.slice(4, end).split('\n')) {
        if (!raw.trim() || /^\s/.test(raw)) continue;
        const match = raw.match(/^([A-Za-z][A-Za-z0-9_.-]*):\s*(.*)$/);
        if (!match) {
            errors.push(`${path.relative(process.cwd(), file)}: invalid frontmatter line: ${raw}`);
            continue;
        }
        meta[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
    }
    return meta;
}

for (const [directory, expectedKind] of ownerRoots) {
    for (const file of filesUnder(path.join(docsRoot, directory))) {
        const meta = parseFrontmatter(file, fs.readFileSync(file, 'utf8'));
        if (!meta) continue;
        for (const field of ['description', 'kind', 'topic']) {
            if (!meta[field]) errors.push(`${path.relative(process.cwd(), file)}: missing frontmatter field ${field}`);
        }
        if (meta.kind && meta.kind !== expectedKind) errors.push(`${path.relative(process.cwd(), file)}: kind must be ${expectedKind}`);
        if (meta.description && meta.description.length < 20) errors.push(`${path.relative(process.cwd(), file)}: description is not useful`);
    }
}

const derivedIndex = path.join(docsRoot, 'logic-description', 'README.md');
if (!fs.existsSync(derivedIndex)) errors.push('.docs/logic-description/README.md: missing derived-note owner index');

if (errors.length) {
    console.error(errors.join('\n'));
    process.exit(1);
}
console.log('Documentation integrity check passed.');
