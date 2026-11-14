import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@jest/globals';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const modulePath = name => JSON.stringify(path.join(repoRoot, 'src/endpoints', name));

function compile(source) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-character-service-types-'));
    try {
        const entry = path.join(root, 'consumer.ts');
        const config = path.join(root, 'tsconfig.json');
        fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ type: 'module' }));
        fs.writeFileSync(entry, source);
        fs.writeFileSync(config, JSON.stringify({
            extends: path.join(repoRoot, 'tsconfig.server.json'),
            compilerOptions: { typeRoots: [path.join(repoRoot, 'node_modules/@types')] },
            files: [entry, path.join(repoRoot, 'index.d.ts')],
            include: [],
        }));
        const result = spawnSync(process.execPath, [path.join(repoRoot, 'node_modules/typescript/bin/tsc'), '--project', config, '--pretty', 'false'], {
            encoding: 'utf8', timeout: 10_000,
        });
        if (result.error) throw result.error;
        return { status: result.status, diagnostics: result.stdout + result.stderr };
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
}

test('strict consumers can compose reads, writes, text replacement and import callbacks', () => {
    const routeSource = fs.readFileSync(path.join(repoRoot, 'src/endpoints/characters.js'), 'utf8');
    const factoryReturn = routeSource.match(/ \* @returns \{(.+)\}\r?\n \*\/\r?\nfunction createCharacterWriteDependencies\(/)?.[1];
    if (!factoryReturn) throw new Error('Character write factory return type not found');
    const factoryReturnType = factoryReturn.replaceAll('import(\'./character-write-service.ts\')', `import(${modulePath('character-write-service.ts')})`);
    const result = compile(`
        import { readCharacterListPayload, readCharacterSummaryPayload, readCharacterFullPayload } from ${modulePath('character-read-service.ts')};
        import type { CharacterReadDependencies } from ${modulePath('character-read-service.ts')};
        import { createCharacterCard, editCharacterCard, renameCharacterCard, deleteCharacterCard } from ${modulePath('character-write-service.ts')};
        import { listCanonicalCharacters, getCanonicalCharacter } from ${modulePath('character-store.js')};
        import { runCharacterTextReplace } from ${modulePath('character-text-replace-service.js')};
        import type { CharacterTextReplaceDependencies } from ${modulePath('character-text-replace-service.js')};
        import { createCharacterImportCoordinator } from ${modulePath('character-import-service.js')};
        import type { CharacterImportHandler } from ${modulePath('character-import-service.js')};

        declare const request: Parameters<typeof createCharacterCard>[0]['request'];
        declare const dependencies: ${factoryReturnType};
        declare const readPorts: CharacterReadDependencies;
        const reads = { ...readPorts, listCanonicalCharacters, getCanonicalCharacter } satisfies CharacterReadDependencies;
        await readCharacterListPayload({ directories: request.user.directories, shallow: true, dependencies: reads });
        await readCharacterSummaryPayload({ directories: request.user.directories, dependencies: reads });
        await readCharacterFullPayload({ directories: request.user.directories, avatarUrl: 'Alice.png', dependencies: reads });
        await createCharacterCard({ request, body: { ch_name: 'Alice' }, dependencies });
        await createCharacterCard({ request, internalName: 'Alice', characterData: '{}', sourceImage: Buffer.alloc(0), dependencies });
        await editCharacterCard({ request, body: { avatar_url: 'Alice.png' }, dependencies });
        await editCharacterCard({ request, avatarUrl: 'Alice.png', targetFile: 'Alice', characterData: '{}', expectedCardJson: '{}', dependencies });
        await renameCharacterCard({ request, body: { avatar_url: 'Alice.png', new_name: 'Bob' }, dependencies });
        await deleteCharacterCard({ request, avatarName: 'Bob.png', dependencies });
        const replace = { getCharacterWriteDependencies: () => dependencies, editCharacterCard } satisfies CharacterTextReplaceDependencies;
        await runCharacterTextReplace({ request, apply: true, dependencies: replace });
        const importer: CharacterImportHandler = async (_path, { request }, name = 'Imported') => {
            const result = await createCharacterCard({ request, internalName: name, characterData: '{}', dependencies });
            return { ok: result.ok, fileName: name, avatarName: result.avatarName, reason: result.reason };
        };
        export const importUpload = createCharacterImportCoordinator({
            importFromYaml: importer, importFromJson: importer, importFromPng: importer,
            importFromCharX: importer, importFromByaf: importer,
        });
    `);
    expect(result).toEqual({ status: 0, diagnostics: '' });
});

test('strict consumers reject incomplete prepared writes and incompatible replacement callbacks', () => {
    const result = compile(`
        import { createCharacterCard } from ${modulePath('character-write-service.ts')};
        import type { CharacterWriteDependencies } from ${modulePath('character-write-service.ts')};
        import { runCharacterTextReplace } from ${modulePath('character-text-replace-service.js')};
        declare const request: Parameters<typeof createCharacterCard>[0]['request'];
        declare const dependencies: CharacterWriteDependencies;
        await createCharacterCard({ request, internalName: 'MissingData', dependencies });
        await runCharacterTextReplace({ request, apply: true, dependencies: { editCharacterCard: async () => true } });
    `);
    expect(result.status).not.toBe(0);
    expect(result.diagnostics).toContain('Property \'characterData\' is missing');
    expect(result.diagnostics).toContain('Promise<boolean>');
});
