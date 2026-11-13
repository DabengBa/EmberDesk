import { strict as assert } from 'node:assert';
import { test } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { loadTsModule } from './helpers/load-ts-module.mjs';

test('synchronous shell drawer artifact matches its typed source', () => {
    const source = readFileSync(new URL('../app/lib/workspace-drawer-domain.ts', import.meta.url), 'utf8');
    const artifact = readFileSync(new URL('../public/scripts/workspace-drawer-domain.js', import.meta.url), 'utf8');
    const normalized = stripTypeScriptTypes(source).replace(/[\t ]+$/gm, '').replace(/\n+$/, '\n');
    assert.equal(artifact, `/* eslint-disable */\n// Generated from app/lib/workspace-drawer-domain.ts; run node scripts/build-workspace-drawer-domain.mjs.\n${normalized}`);
    assert.doesNotMatch(artifact, /[\t ]+$/m);
    assert.doesNotMatch(artifact, /\n\n$/);
});

test('retired shell controls are not registered when their markup is absent', () => {
    const handlers = readFileSync(new URL('../public/scripts/dom-handlers.js', import.meta.url), 'utf8');
    assert.doesNotMatch(handlers, /sliderId: '#(?:amount_gen|max_context)'/);
    assert.doesNotMatch(handlers, /sliderLocked|OpenAllWIEntries|CloseAllWIEntries/);
    assert.doesNotMatch(handlers, /doDrawerOpenClick|\.on\('click', '\.drawer-opener'/);
    const shell = readFileSync(new URL('../public/script.js', import.meta.url), 'utf8');
    assert.doesNotMatch(shell, /doDrawerOpenClick/);
    assert.doesNotMatch(shell, /doNavbarIconClick/);
    // The remaining native wheel handler serves current non-React-owned inputs.
    assert.match(handlers, /input\.hasAttribute\('step'\)/);
});

test('drawer commands serialize switches, honor veto and pin, and persist and notify', async () => {
    const { createWorkspaceDrawerService } = await loadTsModule('app/lib/workspace-drawer-service.ts');
    const records = new Map();
    const events = [];
    const drawers = new Map(['left-nav-panel', 'right-nav-panel', 'SettingsPanel'].map(id => [id, { id, open: false, pinned: false }]));
    const service = createWorkspaceDrawerService({
        get: id => drawers.get(id),
        list: () => [...drawers.values()],
        read: key => records.get(key) ?? null,
        write: (key, value) => records.set(key, value),
        notify: () => events.push([...drawers.values()].filter(item => item.open).map(item => item.id)),
    });
    await service.open('SettingsPanel');
    service.setCloseGuard('SettingsPanel', () => false);
    await Promise.all([service.open('left-nav-panel'), service.open('right-nav-panel')]);
    assert.deepEqual(events, [['SettingsPanel'], ['left-nav-panel', 'SettingsPanel'], ['right-nav-panel', 'SettingsPanel']]);
    assert.equal(records.get('LNavOpened'), 'false');
    assert.equal(service.close('SettingsPanel', { force: true }), false);
    service.setPinned('right-nav-panel', true);
    assert.equal(service.close('right-nav-panel'), false);
    assert.equal(records.get('NavLockOn'), 'true');
    assert.equal(service.close('right-nav-panel', { force: true }), true);
    assert.equal(records.get('NavOpened'), 'false');
    assert.equal(drawers.get('right-nav-panel').pinned, false);
});

test('restore initializes desktop defaults without overwriting stored values', async () => {
    const { createWorkspaceDrawerService } = await loadTsModule('app/lib/workspace-drawer-service.ts');
    const records = new Map([['LNavOpened', 'false']]);
    const drawers = new Map(['left-nav-panel', 'right-nav-panel'].map(id => [id, { id, open: false, pinned: false }]));
    const service = createWorkspaceDrawerService({ get: id => drawers.get(id), list: () => [...drawers.values()], read: key => records.get(key) ?? null, write: (key, value) => records.set(key, value), notify: () => {} });


    service.initializePins({ mobile: false, width: 1200 });
    assert.equal(records.get('LNavOpened'), 'false');
    assert.equal(records.get('NavOpened'), 'true');
    assert.equal(drawers.get('left-nav-panel').pinned, true);
    assert.deepEqual(service.getRestorable({ mobile: false, width: 1200 }), ['right-nav-panel']);
    assert.deepEqual(service.getRestorable({ mobile: false, width: 1000 }), []);
});

test('preserved opens and closeUnpinned leave pinned and vetoed drawers open', async () => {
    const { createWorkspaceDrawerService } = await loadTsModule('app/lib/workspace-drawer-service.ts');
    const drawers = new Map(['left-nav-panel', 'SettingsPanel', 'WorldInfo'].map(id => [id, { id, open: false, pinned: false }]));
    const records = new Map();
    const events = [];
    const service = createWorkspaceDrawerService({ get: id => drawers.get(id), list: () => [...drawers.values()], read: key => records.get(key) ?? null, write: (key, value) => records.set(key, value), notify: () => events.push('change') });


    await service.open('left-nav-panel');
    service.setPinned('left-nav-panel', true);
    await service.open('SettingsPanel', { preserveOpenDrawers: true });
    service.setCloseGuard('SettingsPanel', () => false);
    await service.open('WorldInfo', { preserveOpenDrawers: true });
    service.closeUnpinned();
    assert.equal(drawers.get('left-nav-panel').open, true);
    assert.equal(drawers.get('SettingsPanel').open, true);
    assert.equal(drawers.get('WorldInfo').open, false);
    assert.equal(events.length, 4);
    service.setCloseGuard('SettingsPanel', null);
    assert.equal(service.close('SettingsPanel'), true);
});

test('outside pointer policy preserves excluded and inner targets, pins and guards', async () => {
    const { createWorkspaceDrawerService } = await loadTsModule('app/lib/workspace-drawer-service.ts');
    const drawers = ['SettingsPanel', 'RegexPanel', 'WorldInfo'].map(id => ({ id, open: true, pinned: id === 'WorldInfo' }));
    const writes = [];
    const service = createWorkspaceDrawerService({ get: id => drawers.find(d => d.id === id), list: () => drawers, read: () => null, write: (...args) => writes.push(args), notify: () => {} });
    service.setCloseGuard('SettingsPanel', () => false);
    const target = match => ({ closest: selector => match(selector) ? {} : null });
    for (const excluded of ['#character_cross', '#avatar-and-name-block', '#shadow_popup', '.popup', '#world_popup', '.ui-widget', '.text_pole', '#toast-container', '.select2-results', '.wi-content-editor-modal']) {
        service.handleOutsidePointer(target(selector => selector.split(',').map(part => part.trim()).includes(excluded)));
    }
    service.handleOutsidePointer(target(selector => selector === '.openDrawer'));
    assert.equal(drawers[1].open, true);
    service.handleOutsidePointer(target(() => false));
    assert.deepEqual(drawers.map(d => d.open), [true, false, true]);
    assert.deepEqual(writes, [['RegexNavOpened', 'false']]);
});

test('Escape drawer phases preserve visibility, priority, pins and veto semantics', async () => {
    const { createWorkspaceDrawerService } = await loadTsModule('app/lib/workspace-drawer-service.ts');
    const drawers = [
        { id: 'left-nav-panel', open: true, pinned: true, visible: true },
        { id: 'SettingsPanel', open: true, pinned: false, visible: true },
        { id: 'RegexPanel', open: false, pinned: false, visible: false },
        { id: 'WorldInfo', open: true, pinned: false, visible: true },
        { id: 'right-nav-panel', open: true, pinned: true, visible: true },
    ];
    const writes = [];
    const service = createWorkspaceDrawerService({ get: id => drawers.find(item => item.id === id), list: () => drawers.filter(item => item.open), listVisible: () => drawers.filter(item => item.visible), read: () => null, write: (...args) => writes.push(args), notify: () => {} });
    service.setCloseGuard('SettingsPanel', () => false);
    assert.equal(service.handleEscape('primary'), true);
    assert.equal(drawers[0].open, true);
    assert.equal(drawers[1].open, true);
    assert.deepEqual(writes, []);
    drawers[0].visible = false;
    service.setCloseGuard('SettingsPanel', null);
    assert.equal(service.handleEscape('primary'), true);
    assert.equal(drawers[1].open, false);
    assert.deepEqual(writes, [['SettingsNavOpened', 'false']]);
    drawers[1].visible = false;
    assert.equal(service.handleEscape('primary'), false);
    assert.equal(service.handleEscape('world'), true);
    assert.equal(drawers[3].open, false);
    assert.equal(service.handleEscape('right'), false);
    drawers[4].pinned = false;
    assert.equal(service.handleEscape('right'), true);
    assert.equal(drawers[4].open, false);
});
test('a guard with any falsy return refuses close as before', async () => {
    const { createWorkspaceDrawerService } = await loadTsModule('app/lib/workspace-drawer-service.ts');
    const drawer = { id: 'SettingsPanel', open: true, pinned: false };
    const service = createWorkspaceDrawerService({ get: () => drawer, list: () => [drawer], read: () => null, write: () => {}, notify: () => {} });
    service.setCloseGuard(drawer.id, () => undefined);
    assert.equal(service.close(drawer.id), false);
    assert.equal(drawer.open, true);
});

test('numeric wheel step is rounded, clamped and ignores invalid input', async () => {
    const { numericWheelValue } = await loadTsModule('app/lib/workspace-drawer-service.ts');
    assert.equal(numericWheelValue(0.2, 0.1, 0, 1, -1), 0.3);
    assert.equal(numericWheelValue(1, 0.1, 0, 1, -1), 1);
    assert.equal(numericWheelValue(0, 0, 0, 1, 1), null);
    assert.equal(numericWheelValue(0, 1, 0, 1, 0), null);
});

test('inline drawers in the three owned panels are React-controlled', () => {
    for (const file of ['ai-config/AiConfigPanel.tsx', 'right-nav/RightNavPanel.tsx', 'character-popup/CharacterPopup.tsx']) {
        const source = readFileSync(new URL(`../app/components/${file}`, import.meta.url), 'utf8');
        assert.match(source, /useInlineDrawer/);
        assert.match(source, /aria-expanded/);
    }
});

test('retired inline and counter delegates do not own React controls', () => {
    const source = readFileSync(new URL('../public/scripts/dom-handlers.js', import.meta.url), 'utf8');
    assert.doesNotMatch(source, /\.on\('click', '\.inline-drawer-toggle'/);
    assert.doesNotMatch(source, /\.on\('click', '\.inline-drawer-maximize'/);
    assert.doesNotMatch(source, /\.on\('(?:input|change|keydown|keyup|mouseup blur)', '\.range-block-counter input, \.neo-range-input'/);
    // The separate native wheel compatibility handler still covers non-React numbers.
    assert.match(source, /dataset\.workspaceNumeric !== 'react'/);
});

test('workspace bootstrap installs drawer service and restores through it', () => {
    const shell = readFileSync(new URL('../public/script.js', import.meta.url), 'utf8');
    const ross = readFileSync(new URL('../public/scripts/RossAscends-mods.js', import.meta.url), 'utf8');
    assert.match(shell, /installWorkspaceDrawerService\(createWorkspaceDrawerService\)/);
    assert.match(shell, /workspaceDrawerService\.open\(/);
    assert.match(shell, /workspaceDrawerService\.close\(/);
    assert.match(ross, /drawerService\.initializePins\(/);
    assert.match(ross, /drawerService\.getRestorable\(/);
});

test('drawer commands have one synchronous owner before workspace bootstrap', () => {
    const shell = readFileSync(new URL('../public/script.js', import.meta.url), 'utf8');
    assert.match(shell, /import \{ createWorkspaceDrawerService \} from '\.\/scripts\/workspace-drawer-domain\.js'/);
    assert.match(shell, /installWorkspaceDrawerService\(createWorkspaceDrawerService\)/);
    assert.doesNotMatch(shell, /function openWorkspaceChildSlotHostImmediate\(/);
    assert.doesNotMatch(shell, /if \(workspaceDrawerService\) return workspaceDrawerService\.(?:open|close)/);
});
