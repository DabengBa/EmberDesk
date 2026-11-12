import React, { createRef } from 'react';
import { createRoot } from 'react-dom/client';
import { RegexEditor } from '../app/components/regex/RegexEditor';
import { RegexDebugger } from '../app/components/regex/RegexDebugger';
import { RegexSettingsPanel } from '../app/components/regex/RegexSettingsPanel';
import { RegexImportTargetControl } from '../app/components/regex/RegexImportTargetControl';
import '../public/scripts/extensions/regex/style.css';

const calls = [];
window.fixture = { calls, editor: createRef(), debugger: createRef(), target: createRef(), fail: false };
const record = (name, ...args) => { calls.push([name, ...args]); if (window.fixture.fail) throw Error('preset failed'); };
const groups = [{ key: 'global', label: 'Global', rules: [{ id: 'a', name: 'First' }, { id: 'b', name: 'Second' }] }, { key: 'preset', label: 'Preset', rules: [] }, { key: 'scoped', label: 'Scoped', rules: [] }];
let selected = 'p';
const presets = { list: () => ({ presets: [{ id: 'p', name: 'Preset A' }, { id: 'q', name: 'Preset B' }], selected }), select: id => { record('select', id); selected = id; }, create: () => record('create'), update: () => record('update'), apply: () => record('apply'), delete: () => record('delete') };
const toolbar = { openEditor: type => record('editor', type), openDebugger: () => record('debugger'), importFiles: files => record('import', files.length), setScopedAllowed: allowed => record('scoped', allowed), setPresetAllowed: allowed => record('preset', allowed), scopedAllowed: false, presetAllowed: false, onError: message => calls.push(['error', message]) };
const emptySnapshot = { groups: [] };
const bridge = { getSnapshot: () => emptySnapshot, subscribe: () => () => {}, execute: async () => 'saved' };
createRoot(document.getElementById('root')).render(<><RegexEditor ref={window.fixture.editor} initial={null} onRun={(draft, input) => `${draft.findRegex}:${input}`} infoFor={draft => `Info ${draft.scriptName}`} /><RegexDebugger ref={window.fixture.debugger} getGroups={() => groups} reorder={async (key, ids) => { record('reorder', key, ids); return 'saved'; }} runForDebug={(g, input, options) => { calls.push(['run', g, options]); return { steps: [{ label: g[0].rules[0]?.name ?? 'none', html: '<b>step</b>' }], final: input + ' done' }; }} openEditor={(type, id) => record('debugEditor', type, id)} commands={{ openStepsPopup: html => record('steps', html), openFinalPopup: result => record('final', result) }} /><RegexImportTargetControl ref={window.fixture.target} characterName="Character" /><RegexSettingsPanel list={bridge} toolbar={toolbar} presets={presets} /></>);
