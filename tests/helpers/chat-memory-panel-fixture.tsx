import { createRoot } from 'react-dom/client';
import { ChatMemoryPanel } from '../../app/components/chat-memory/ChatMemoryPanel';
import type { ChatMemoryView } from '../../app/components/chat-memory/types';

const settings = { enabled: true, keepTurns: 5, maxTokens: 400, role: 'system' as const, prompt: '总结关键事实', wrap: '{{summary}}' };
let view: ChatMemoryView | null = {
    settings, globalSettings: settings, overrides: { keepTurns: 5 },
    history: [{ at: 1793098000000, action: 'regenerate', turnKey: 'turn-1', status: 'failed', error: 'save_failed' }],
    turns: [
        { key: 'turn-1', index: 0, pinned: false, eligible: true, status: 'failed', summary: { text: '旧摘要 <b>只读</b>', status: 'failed' }, running: false },
        { key: 'turn-2', index: 1, pinned: false, eligible: false, status: null, summary: null, running: false },
    ],
    stats: { totalTurns: 2, verbatimTurns: 2, summarizedTurns: 0 }, queueDepth: 0, running: false,
};
const listeners = new Set<() => void>();
const calls: unknown[] = [];
let fail = true;
let throwNext = false;
let hold = false;
let release: (() => void) | undefined;
const root = createRoot(document.getElementById('root')!);
const bridge = {
    getView: () => view,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    updateSettings: async (overrides: object) => {
        calls.push(['settings', overrides]);
        if (!fail && view) {
            const next = { ...view.overrides, ...overrides };
            for (const key of Object.keys(next)) if (next[key] === null) delete next[key];
            view = { ...view, overrides: next, settings: { ...settings, ...next } };
            listeners.forEach(listener => listener());
        }
        return { ok: !fail, error: fail ? 'save_failed' : undefined };
    },
    regenerate: async (key: string) => {
        calls.push(['regenerate', key]);
        if (hold) await new Promise<void>(resolve => { release = resolve; });
        if (throwNext) { throwNext = false; throw new Error('network_failure'); }
        return { ok: !fail, error: fail ? 'save_failed' : undefined };
    },
    retry: async (key: string) => { calls.push(['retry', key]); return { ok: !fail, error: fail ? 'save_failed' : undefined }; },
    setPinned: async (key: string, pinned: boolean) => { calls.push(['pin', key, pinned]); return { ok: true }; },
    close: () => root.render(null),
    onDraftDiscarded: () => {
        const notice = document.createElement('p');
        notice.setAttribute('role', 'alert');
        notice.textContent = '会话已切换或面板已关闭，未应用的设置草稿已丢弃，未写入其他会话。';
        document.body.appendChild(notice);
    },
};
Object.assign(window, {
    panelTest: {
        calls, setFailure: (value: boolean) => { fail = value; }, listenerCount: () => listeners.size,
        switchChat: () => { view = null; listeners.forEach(listener => listener()); },
        forceSwitchChat: () => {
            bridge.close();
            if (view) view = { ...view, settings: { ...settings, keepTurns: 12 }, overrides: {}, history: [], turns: [] };
        },
        setThrow: () => { throwNext = true; }, setHold: () => { hold = true; }, release: () => release?.(),
    },
});
document.getElementById('opener')!.onclick = () => root.render(<ChatMemoryPanel bridge={bridge} />);
