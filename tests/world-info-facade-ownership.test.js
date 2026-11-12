import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@jest/globals';

test('import feedback has an explicit owner outside the World Info facade', () => {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const facade = fs.readFileSync(path.join(root, 'public/scripts/world-info.js'), 'utf8');
    expect(facade).not.toContain('function showWorldInfoBatchConflictPopup');
    expect(facade).not.toContain('function updateWorldInfoBatchProgress');
    const owner = fs.readFileSync(path.join(root, 'public/scripts/world-info-import-ui.js'), 'utf8');
    expect(owner).toContain('function showWorldInfoBatchConflictPopup');
    expect(owner).toContain('function updateWorldInfoBatchProgress');
});

test('book lifecycle and character/chat commands have an owner outside the facade', () => {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const facade = fs.readFileSync(path.join(root, 'public/scripts/world-info.js'), 'utf8');
    expect(facade).not.toContain('async function renameWorldInfo(');
    expect(facade).not.toContain('async function moveWorldInfoEntry(');
    const commands = fs.readFileSync(path.join(root, 'public/scripts/world-info-book-commands.js'), 'utf8');
    expect(commands).toContain('async function renameWorldInfo(');
    expect(commands).toContain('async function moveWorldInfoEntry(');
});

test('book management dialogs and cascade feedback are owned by the book UI', () => {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const facade = fs.readFileSync(path.join(root, 'public/scripts/world-info.js'), 'utf8');
    expect(facade).not.toContain('async function deleteWorldInfoWithCascade(');
    const ui = fs.readFileSync(path.join(root, 'public/scripts/world-info-book-ui.js'), 'utf8');
    expect(ui).toContain('async function deleteWorldInfoWithCascade(');
});

test('panel event binding belongs to a dedicated UI adapter', () => {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const facade = fs.readFileSync(path.join(root, 'public/scripts/world-info.js'), 'utf8');
    expect(facade).not.toContain("$('#world_import_file').on('change'");
    const ui = fs.readFileSync(path.join(root, 'public/scripts/world-info-panel-ui.js'), 'utf8');
    expect(ui).toContain("$('#world_import_file').on('change'");
});

test('book list replay and deletion reference cleanup live outside the facade', () => {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const facade = fs.readFileSync(path.join(root, 'public/scripts/world-info.js'), 'utf8');
    expect(facade).not.toContain('async function flushDeletedWorldsFromUI(');
    const sync = fs.readFileSync(path.join(root, 'public/scripts/world-info-book-sync.js'), 'utf8');
    expect(sync).toContain('async function flushDeletedWorldsFromUI(');
});

test('workbench dialogs and batch command presentation live outside the facade', () => {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const facade = fs.readFileSync(path.join(root, 'public/scripts/world-info.js'), 'utf8');
    expect(facade).not.toContain('async function promptApplyWorldInfoCurrentSorting(');
    const ui = fs.readFileSync(path.join(root, 'public/scripts/world-info-editor-ui.js'), 'utf8');
    expect(ui).toContain('async function promptApplyWorldInfoCurrentSorting(');
});

test('character embedded book and global selection adapters live outside the facade', () => {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const facade = fs.readFileSync(path.join(root, 'public/scripts/world-info.js'), 'utf8');
    expect(facade).not.toContain('function checkEmbeddedWorld(');
    expect(facade).not.toContain('function onWorldInfoChange(');
    const adapter = fs.readFileSync(path.join(root, 'public/scripts/world-info-reference-ui.js'), 'utf8');
    expect(adapter).toContain('function checkEmbeddedWorld(');
    expect(adapter).toContain('function onWorldInfoChange(');
});

test('entry defaults and standalone entry commands have a separate owner', () => {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const facade = fs.readFileSync(path.join(root, 'public/scripts/world-info.js'), 'utf8');
    expect(facade).not.toContain('export function duplicateWorldInfoEntry(');
    const commands = fs.readFileSync(path.join(root, 'public/scripts/world-info-entry-commands.js'), 'utf8');
    expect(commands).toContain('function duplicateWorldInfoEntry(');
    expect(commands).toContain('newWorldInfoEntryDefinition =');
});
