import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@jest/globals';

const root = fileURLToPath(new URL('../', import.meta.url));

test('rollback options require a database exactly when audit or repair lookup needs one', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-slice-types-'));
    try {
        const entry = path.join(directory, 'entry.ts');
        const registry = path.join(root, 'src/canonical-storage-slice-registry.ts');
        fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify({ type: 'module' }));
        fs.writeFileSync(entry, [
            `import { getDefaultCanonicalStorageSliceRegistry, createCanonicalStorageSliceRegistry, getCanonicalStorageSlice } from ${JSON.stringify(registry)};`,
            'import type { DatabaseSync } from \'node:sqlite\';',
            'export function check(db: DatabaseSync, phase: string, mixed: "reads" | "writes", startsWithW: `w${string}`, key: string, registerDefaults: boolean) {',
            '  const registry = getDefaultCanonicalStorageSliceRegistry();',
            '  const builtins = createCanonicalStorageSliceRegistry({ registerDefaults: true });',
            '  const customRegistry = createCanonicalStorageSliceRegistry();',
            '  const maybeBuiltins = createCanonicalStorageSliceRegistry({ registerDefaults });',
            '  const character = registry.get("characters");',
            '  const settings = registry.get("settings");',
            '  const presets = registry.get("presets");',
            '  const audit = { blocking: false };',
            '  character.getRollbackBlockers({ db });',
            '  character.getRollbackBlockers({ db, phase, persistedAuditStatus: null });',
            '  character.getRollbackBlockers({ phase: "reads", persistedAuditStatus: audit });',
            '  character.getRollbackBlockers({ db: null, phase: "reads", persistedAuditStatus: audit });',
            '  character.getRollbackBlockers({ phase: "custom", persistedAuditStatus: audit });',
            '  settings.getRollbackBlockers({ phase: "chatStats", persistedAuditStatus: audit });',
            '  for (const key of ["world_info", "settings", "secrets", "managed_media", "chats"] as const) {',
            '    registry.get(key).getRollbackBlockers({ phase: "chatStats", persistedAuditStatus: audit });',
            '    registry.get(key).getRollbackBlockers({ db: null, phase: "reads", persistedAuditStatus: audit });',
            '    // @ts-expect-error writes check this slice\'s repairs',
            '    registry.get(key).getRollbackBlockers({ phase: "writes", persistedAuditStatus: audit });',
            '  }',
            '  presets.getRollbackBlockers({ persistedAuditStatus: audit });',
            '  presets.getRollbackBlockers({ db: null, persistedAuditStatus: audit });',
            '  presets.getRollbackBlockers({ phase, persistedAuditStatus: audit });',
            '  getCanonicalStorageSlice("presets").getRollbackBlockers({ persistedAuditStatus: audit });',
            '  getCanonicalStorageSlice("presets", undefined).getRollbackBlockers({ persistedAuditStatus: audit });',
            '  getCanonicalStorageSlice("presets", registry).getRollbackBlockers({ persistedAuditStatus: audit });',
            '  getCanonicalStorageSlice("presets", getDefaultCanonicalStorageSliceRegistry()).getRollbackBlockers({ persistedAuditStatus: audit });',
            '  getCanonicalStorageSlice("presets", Math.random() ? registry : undefined).getRollbackBlockers({ persistedAuditStatus: audit });',
            '  builtins.get("presets").getRollbackBlockers({ db: null, persistedAuditStatus: audit });',
            '  getCanonicalStorageSlice("presets", builtins).getRollbackBlockers({ persistedAuditStatus: audit });',
            '  builtins.get("characters").getRollbackBlockers({ phase: "reads", persistedAuditStatus: audit });',
            '  // @ts-expect-error built-in characters writes still require repairs lookup',
            '  builtins.get("characters").getRollbackBlockers({ phase: "writes", persistedAuditStatus: audit });',
            '  // @ts-expect-error arbitrary custom keys in a built-in registry require a database',
            '  builtins.get("custom").getRollbackBlockers({ phase: "reads", persistedAuditStatus: audit });',
            '  // @ts-expect-error a boolean option does not guarantee built-ins',
            '  maybeBuiltins.get("presets").getRollbackBlockers({ persistedAuditStatus: audit });',
            '  // @ts-expect-error false does not guarantee built-ins',
            '  createCanonicalStorageSliceRegistry({ registerDefaults: false }).get("presets").getRollbackBlockers({ persistedAuditStatus: audit });',
            '  // @ts-expect-error an uncertain registry does not guarantee built-ins',
            '  getCanonicalStorageSlice("presets", maybeBuiltins).getRollbackBlockers({ persistedAuditStatus: audit });',
            '  customRegistry.register({ ...character, key: "custom", getRollbackBlockers: ({ db }: { db: DatabaseSync }) => { db.prepare("SELECT 1"); return character.getRollbackBlockers({ db }); } });',
            '  customRegistry.get("custom").getRollbackBlockers({ db, phase: "reads", persistedAuditStatus: audit });',
            '  createCanonicalStorageSliceRegistry().get(key).getRollbackBlockers({ db });',
            '  // @ts-expect-error the default audit lookup needs a database',
            '  character.getRollbackBlockers();',
            '  // @ts-expect-error empty options still use the default audit lookup',
            '  character.getRollbackBlockers({});',
            '  // @ts-expect-error null audit triggers the lookup',
            '  character.getRollbackBlockers({ phase: "reads", persistedAuditStatus: null });',
            '  // @ts-expect-error default writes require the character repair lookup',
            '  character.getRollbackBlockers({ persistedAuditStatus: audit });',
            '  // @ts-expect-error characters chatStats checks repairs',
            '  character.getRollbackBlockers({ phase: "chatStats", persistedAuditStatus: audit });',
            '  // @ts-expect-error writes check settings repairs',
            '  settings.getRollbackBlockers({ phase: "writes", persistedAuditStatus: audit });',
            '  // @ts-expect-error a widened phase may be writes or chatStats',
            '  character.getRollbackBlockers({ phase, persistedAuditStatus: audit });',
            '  // @ts-expect-error a union including writes is not safe',
            '  character.getRollbackBlockers({ phase: mixed, persistedAuditStatus: audit });',
            '  // @ts-expect-error a template-string type may contain writes',
            '  character.getRollbackBlockers({ phase: startsWithW, persistedAuditStatus: audit });',
            '  // @ts-expect-error an unknown slice could be characters',
            '  registry.get(key).getRollbackBlockers({ phase: "chatStats", persistedAuditStatus: audit });',
            '  // @ts-expect-error custom descriptors can query the database even on reads',
            '  customRegistry.get("custom").getRollbackBlockers({ phase: "reads", persistedAuditStatus: audit });',
            '  // @ts-expect-error null is not a database for an arbitrary descriptor',
            '  customRegistry.get("custom").getRollbackBlockers({ db: null, phase: "reads", persistedAuditStatus: audit });',
            '  // @ts-expect-error a custom registry can replace even a built-in key',
            '  getCanonicalStorageSlice("presets", customRegistry).getRollbackBlockers({ persistedAuditStatus: audit });',
            '  // @ts-expect-error an unknown default-registry key may be custom',
            '  registry.get(key).getRollbackBlockers({ phase: "reads", persistedAuditStatus: audit });',
            '  // @ts-expect-error an unknown registry may be custom',
            '  getCanonicalStorageSlice("presets", Math.random() ? registry : customRegistry).getRollbackBlockers({ persistedAuditStatus: audit });',
            '  // @ts-expect-error null is not a database for a repair lookup',
            '  character.getRollbackBlockers({ db: null, phase: "writes", persistedAuditStatus: audit });',
            '  // @ts-expect-error null is not a database for an audit lookup',
            '  presets.getRollbackBlockers({ db: null });',
            '  // @ts-expect-error presets still need either an audit or a database',
            '  presets.getRollbackBlockers({ phase: "reads" });',
            '  // @ts-expect-error unknown slices must not assume a no-repair presets implementation',
            '  createCanonicalStorageSliceRegistry().get(key).getRollbackBlockers({ persistedAuditStatus: audit });',
            '  // @ts-expect-error an undefined database does not permit the default audit lookup',
            '  presets.getRollbackBlockers({ db: undefined });',
            '}',
        ].join('\n'));
        const config = path.join(directory, 'tsconfig.json');
        fs.writeFileSync(config, JSON.stringify({
            extends: path.join(root, 'tsconfig.server.json'),
            compilerOptions: { typeRoots: [path.join(root, 'node_modules/@types')] },
            files: [entry, path.join(root, 'index.d.ts')],
            include: [],
        }));
        const result = spawnSync(process.execPath, [path.join(root, 'node_modules/typescript/bin/tsc'), '-p', config, '--pretty', 'false'], {
            encoding: 'utf8', timeout: 30_000,
        });
        if (result.error) throw result.error;
        expect({ status: result.status, diagnostics: `${result.stdout}${result.stderr}` }).toEqual({ status: 0, diagnostics: '' });
    } finally {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});
