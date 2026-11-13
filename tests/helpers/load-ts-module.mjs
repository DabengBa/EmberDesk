import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { stripTypeScriptTypes } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function resolveSourcePath(fromDir, specifier) {
    const raw = specifier.startsWith('@/')
        ? path.join(REPO_ROOT, 'app', specifier.slice(2))
        : specifier.startsWith('@sillytavern/')
            ? path.join(REPO_ROOT, 'public/scripts', specifier.slice('@sillytavern/'.length))
            : specifier.startsWith('.')
                ? path.resolve(fromDir, specifier)
                : null;
    if (!raw) return null;
    for (const candidate of [raw, `${raw}.ts`, `${raw}.js`, path.join(raw, 'index.ts'), path.join(raw, 'index.js')]) {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
            return candidate;
        }
    }
    return null;
}

function emitModuleGraph(entryFile, outRoot, seen = new Map()) {
    const real = fs.realpathSync(entryFile);
    if (seen.has(real)) return seen.get(real);
    const rel = path.relative(REPO_ROOT, real).replace(/\.ts$/, '.mjs');
    const dest = path.join(outRoot, rel);
    seen.set(real, dest);

    const raw = fs.readFileSync(real, 'utf8');
    const js = real.endsWith('.ts') ? stripTypeScriptTypes(raw) : raw;
    const rewritten = js.replace(
        /\b((?:import|export)\s+(?:[^'"]*?\s+from\s+)?|import\s*\(\s*)(['"])([^'"]+)\2/g,
        (full, prefix, quote, specifier) => {
            const target = resolveSourcePath(path.dirname(real), specifier);
            if (!target) return full;
            const emitted = emitModuleGraph(target, outRoot, seen);
            let relSpec = path.relative(path.dirname(dest), emitted).split(path.sep).join('/');
            if (!relSpec.startsWith('.')) relSpec = `./${relSpec}`;
            return `${prefix}${quote}${relSpec}${quote}`;
        },
    );
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, rewritten, 'utf8');
    return dest;
}

export async function loadTsModule(repoRelativePath) {
    const entry = path.resolve(REPO_ROOT, repoRelativePath);
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-ts-test-'));
    fs.writeFileSync(path.join(tempRoot, 'package.json'), '{"type":"module"}');
    fs.symlinkSync(path.join(REPO_ROOT, 'node_modules'), path.join(tempRoot, 'node_modules'), 'dir');
    const outFile = emitModuleGraph(entry, tempRoot);
    return import(pathToFileURL(outFile).href);
}
