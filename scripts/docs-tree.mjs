import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve('.docs');
const ignored = new Set(['dist', 'node_modules']);

function walk(directory, prefix = '') {
    const entries = fs.readdirSync(directory, { withFileTypes: true })
        .filter(entry => !ignored.has(entry.name))
        .sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
        const relative = path.join(prefix, entry.name);
        console.log(`${entry.isDirectory() ? 'd' : 'f'} ${relative}`);
        if (entry.isDirectory()) walk(path.join(directory, entry.name), relative);
    }
}

if (!fs.existsSync(root)) {
    console.error(`Documentation root does not exist: ${root}`);
    process.exitCode = 1;
} else {
    walk(root);
}
