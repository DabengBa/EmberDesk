import { readFile, writeFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';

const source = new URL('../app/lib/workspace-drawer-domain.ts', import.meta.url);
const output = new URL('../public/scripts/workspace-drawer-domain.js', import.meta.url);
const js = stripTypeScriptTypes(await readFile(source, 'utf8')).replace(/[\t ]+$/gm, '').replace(/\n+$/, '\n');
const generated = `/* eslint-disable */\n// Generated from app/lib/workspace-drawer-domain.ts; run node scripts/build-workspace-drawer-domain.mjs.\n${js}`;
if (process.argv.includes('--check')) {
    if (await readFile(output, 'utf8').catch(() => '') !== generated) throw new Error('Workspace drawer domain artifact is stale');
} else {
    await writeFile(output, generated);
}
