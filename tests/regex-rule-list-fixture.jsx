import React from 'react';
import { createRoot } from 'react-dom/client';
import { RegexSettingsPanel } from '../app/components/regex/RegexSettingsPanel';
import '../public/scripts/extensions/regex/style.css';

let snapshot = { groups: [
    { type: 0, key: 'global', available: true, rules: [{ id: 'same', scriptName: 'Global one', disabled: false }, { id: 'two', scriptName: 'Global two', disabled: false }] },
    { type: 2, key: 'preset:a', available: true, rules: [{ id: 'same', scriptName: 'Preset one', disabled: false }] },
    { type: 1, key: 'character:a', available: true, rules: [] },
] };
const listeners = new Set();
window.fixture = { actions: [], next: 'saved', get groups() { return snapshot.groups; }, publish(groups) { snapshot = { groups }; listeners.forEach(fn => fn()); }, resolve: null };
const bridge = {
    getSnapshot: () => snapshot,
    subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); },
    execute: action => {
        window.fixture.actions.push(action);
        if (window.fixture.next === 'pending') return new Promise((resolve, reject) => { window.fixture.resolve = { resolve, reject }; });
        if (window.fixture.next === 'reject') { const error = new Error('fixture failure'); Object.assign(error, window.fixture.errorProps); return Promise.reject(error); }
        return Promise.resolve(window.fixture.next);
    },
};
createRoot(document.getElementById('root')).render(<RegexSettingsPanel bridge={bridge} />);
