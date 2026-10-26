import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const query = process.argv.slice(2).filter(argument => argument !== '--').join(' ').trim();
const root = path.resolve('.docs');

if (!query) {
    console.error('Usage: pnpm run docs:search -- <query>');
    process.exit(1);
}

const pattern = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
const results = [];

function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        if (entry.name === 'dist' || entry.name === 'node_modules') continue;
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            walk(file);
            continue;
        }
        if (!/\.(?:md|json|ya?ml|txt)$/i.test(entry.name)) continue;
        const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
        lines.forEach((line, index) => {
            if (pattern.test(line)) results.push(`${path.relative(process.cwd(), file)}:${index + 1}:${line.trim()}`);
        });
    }
}

walk(root);
console.log(results.join('\n'));
