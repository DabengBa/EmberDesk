import { readFile, writeFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';

const source = new URL('../app/lib/settings-write-owner.ts', import.meta.url);
const output = new URL('../public/scripts/settings-write-owner.js', import.meta.url);
const js = stripTypeScriptTypes(await readFile(source, 'utf8')).replace(/[\t ]+$/gm, '').replace(/\n+$/, '\n');
const generated = `/* eslint-disable */\n// Generated from app/lib/settings-write-owner.ts; run node scripts/build-settings-write-owner.mjs.\n${js}`;
if (process.argv.includes('--check')) {
    if (await readFile(output, 'utf8').catch(() => '') !== generated) throw new Error('Settings write owner artifact is stale');
} else {
    await writeFile(output, generated);
}
