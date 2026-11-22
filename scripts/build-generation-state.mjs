import { readFile, writeFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { URL } from 'node:url';
import process from 'node:process';

for (const [sourceName, outputName] of [
    ['shared-state.ts', 'generation-shared-state.js'],
    ['attempt-executor.ts', 'generation-typed-runtime.js'],
    ['workspace.ts', 'server-generation-workspace.js'],
    ['caller.ts', 'generation-caller-service.js'],
    ['service.ts', 'generation-service.js'],
]) {
    const source = new URL(`../app/lib/generation/${sourceName}`, import.meta.url);
    const output = new URL(`../public/scripts/${outputName}`, import.meta.url);
    const js = stripTypeScriptTypes(await readFile(source, 'utf8'))
        .replaceAll('from \'./shared-state\'', 'from \'./generation-shared-state.js\'')
        .replaceAll('from \'../../../public/scripts/', 'from \'./')
        .replace(/[\t ]+$/gm, '')
        .replace(/\n+$/, '\n');
    const generated = `/* eslint-disable */\n// Generated from app/lib/generation/${sourceName}; run pnpm run build:generation-state.\n${js}`;
    if (process.argv.includes('--check')) {
        if (await readFile(output, 'utf8').catch(() => '') !== generated) {
            throw new Error(`Generation artifact ${outputName} is stale. Run pnpm run build:generation-state.`);
        }
    } else {
        await writeFile(output, generated);
    }
}
