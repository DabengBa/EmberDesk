import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { afterEach, expect, test } from '@jest/globals';

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const roots = [];
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

test('offline backup requires consent and restores the complete data root without overwriting', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'offline-backup-'));
    roots.push(root);
    const source = path.join(root, 'source');
    const backup = path.join(root, 'backup');
    const restored = path.join(root, 'restored');
    const storage = path.join(source, 'alice', 'storage');
    fs.mkdirSync(storage, { recursive: true });

    fs.mkdirSync(path.join(source, '_storage'));
    fs.writeFileSync(path.join(source, '_storage', 'account'), 'account');
    fs.writeFileSync(path.join(source, 'alice', 'media.png'), 'image');
    const db = new DatabaseSync(path.join(storage, 'emberdesk.sqlite'));
    db.exec("PRAGMA journal_mode=WAL; CREATE TABLE secret_records(value TEXT); INSERT INTO secret_records VALUES ('private-key')");
    // Save an actual WAL snapshot; then close the writer before running the CLI.
    const wal = fs.readFileSync(path.join(storage, 'emberdesk.sqlite-wal'));
    const database = fs.readFileSync(path.join(storage, 'emberdesk.sqlite'));
    db.close();
    fs.writeFileSync(path.join(storage, 'emberdesk.sqlite'), database);
    fs.writeFileSync(path.join(storage, 'emberdesk.sqlite-wal'), wal);
    const run = (...args) => spawnSync(process.execPath, ['scripts/offline-backup.mjs', ...args], { cwd: repoRoot, encoding: 'utf8' });
    const args = ['backup', '--source', source, '--destination', backup];
    expect(run(...args, '--include-keys').status).not.toBe(0);
    expect(run(...args, '--confirm-stopped').status).not.toBe(0);
    expect(run('backup', '--source', source, '--destination', path.join(source, 'nested'), '--confirm-stopped', '--include-keys').status).not.toBe(0);
    expect(run(...args, '--confirm-stopped', '--include-keys').status).toBe(0);
    expect(fs.readFileSync(path.join(backup, 'alice', 'storage', 'emberdesk.sqlite-wal'))).toEqual(wal);
    expect(run('restore', '--source', backup, '--destination', restored, '--confirm-stopped').status).toBe(0);
    expect(fs.readFileSync(path.join(restored, '_storage', 'account'), 'utf8')).toBe('account');
    expect(fs.readFileSync(path.join(restored, 'alice', 'media.png'), 'utf8')).toBe('image');
    const recovered = new DatabaseSync(path.join(restored, 'alice', 'storage', 'emberdesk.sqlite'));
    expect(recovered.prepare('SELECT value FROM secret_records').get().value).toBe('private-key');
    recovered.close();
    expect(run('restore', '--source', backup, '--destination', restored, '--confirm-stopped').status).not.toBe(0);
    expect(fs.readFileSync(path.join(source, 'alice', 'storage', 'emberdesk.sqlite-wal'))).toEqual(wal);
});

test('backup and restore relocate internal links and never rely on the original tree', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'offline-backup-links-'));
    roots.push(root);
    const source = path.join(root, 'source');
    const backup = path.join(root, 'backup');
    const restored = path.join(root, 'restored');
    fs.mkdirSync(path.join(source, 'alice', 'media'), { recursive: true });
    fs.writeFileSync(path.join(source, 'alice', 'media', 'image.png'), 'original-media');
    fs.symlinkSync(path.join(source, 'alice', 'media'), path.join(source, 'alice', 'absolute-media'), 'dir');
    fs.symlinkSync('media/image.png', path.join(source, 'alice', 'relative-image'));
    const run = (...args) => spawnSync(process.execPath, ['scripts/offline-backup.mjs', ...args], { cwd: repoRoot, encoding: 'utf8' });
    expect(run('backup', '--source', source, '--destination', backup, '--confirm-stopped', '--include-keys').status).toBe(0);
    expect(fs.realpathSync(path.join(backup, 'alice', 'absolute-media'))).toBe(path.join(backup, 'alice', 'media'));
    expect(run('restore', '--source', backup, '--destination', restored, '--confirm-stopped').status).toBe(0);
    expect(fs.realpathSync(path.join(restored, 'alice', 'absolute-media'))).toBe(path.join(restored, 'alice', 'media'));
    fs.renameSync(source, path.join(root, 'original-moved'));
    expect(fs.readFileSync(path.join(restored, 'alice', 'absolute-media', 'image.png'), 'utf8')).toBe('original-media');
    expect(fs.readFileSync(path.join(backup, 'alice', 'relative-image'), 'utf8')).toBe('original-media');
    fs.writeFileSync(path.join(restored, 'alice', 'relative-image'), 'changed-restored');
    expect(fs.readFileSync(path.join(backup, 'alice', 'media', 'image.png'), 'utf8')).toBe('original-media');
    expect(fs.readFileSync(path.join(root, 'original-moved', 'alice', 'media', 'image.png'), 'utf8')).toBe('original-media');
});

test.each(['backup', 'restore'].flatMap(command => ['absolute', 'relative', 'dangling'].map(kind => [command, kind])))('%s rejects external or unresolved %s links without an incomplete copy', (command, kind) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'offline-backup-external-'));
    roots.push(root);
    const source = path.join(root, 'source');
    const backup = path.join(root, 'backup');
    fs.mkdirSync(source);
    fs.writeFileSync(path.join(root, 'outside'), 'external-media');
    const target = kind === 'absolute' ? path.join(root, 'outside') : kind === 'relative' ? '../outside' : 'missing';
    fs.symlinkSync(target, path.join(source, 'link'));
    const result = spawnSync(process.execPath, ['scripts/offline-backup.mjs', command, '--source', source, '--destination', backup, '--confirm-stopped', ...(command === 'backup' ? ['--include-keys'] : [])], { cwd: repoRoot, encoding: 'utf8' });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/symbolic link/i);
    expect(fs.existsSync(backup)).toBe(false);
    expect(fs.readFileSync(path.join(root, 'outside'), 'utf8')).toBe('external-media');
});
