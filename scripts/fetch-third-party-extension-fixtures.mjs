import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), '..');

const FIXTURES = [
    {
        name: 'JS-Slash-Runner',
        url: 'https://github.com/N0VI028/JS-Slash-Runner.git',
        commit: 'b65f48a4856da9f0947224404d4c08910a8f350f',
        target: path.join(repoRoot, 'public', 'scripts', 'extensions', 'third-party', 'JS-Slash-Runner'),
    },
];

function git(args, cwd) {
    execFileSync('git', args, { cwd, stdio: 'inherit' });
}

function currentCommit(target) {
    try {
        return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: target, encoding: 'utf8' }).trim();
    } catch {
        return null;
    }
}

let failures = 0;
for (const fixture of FIXTURES) {
    if (currentCommit(fixture.target) === fixture.commit) {
        process.stdout.write(`[third-party-fixtures] ${fixture.name} already at ${fixture.commit.slice(0, 7)} — skipping.\n`);
        continue;
    }
    if (fs.existsSync(fixture.target) && !fs.existsSync(path.join(fixture.target, '.git'))) {
        failures += 1;
        process.stderr.write(`[third-party-fixtures] ${fixture.target} exists but is not a git checkout.\n`);
        process.stderr.write('  Refusing to overwrite a manually installed extension. Move it aside and re-run.\n');
        continue;
    }
    process.stdout.write(`[third-party-fixtures] fetching ${fixture.name} @ ${fixture.commit.slice(0, 7)} ...` + '\n');
    fs.mkdirSync(fixture.target, { recursive: true });
    try {
        if (!fs.existsSync(path.join(fixture.target, '.git'))) {
            git(['init'], fixture.target);
            git(['remote', 'add', 'origin', fixture.url], fixture.target);
        }
        git(['fetch', '--depth', '1', 'origin', fixture.commit], fixture.target);
        git(['checkout', '--detach', 'FETCH_HEAD'], fixture.target);
        process.stdout.write(`[third-party-fixtures] ${fixture.name} ready at ${currentCommit(fixture.target)?.slice(0, 7)}.\n`);
    } catch (error) {
        failures += 1;
        process.stderr.write(`[third-party-fixtures] failed to fetch ${fixture.name}: ${error.message}\n`);
    }
}

if (failures > 0) {
    process.exitCode = 1;
}
