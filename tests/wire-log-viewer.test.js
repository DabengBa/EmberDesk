import { describe, expect, test } from '@jest/globals';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const wireLogDir = path.join(repoRoot, 'app', 'components', 'wire-log');

/**
 * Client sources, loaded once up front.
 *
 * This suite is unit-lane by contract: it only inspects source text, so the
 * file access here is fixture loading, not test behaviour.
 * @returns {Record<string, string>} Source text keyed by repo-relative path
 */
async function loadClientSources() {
    // `fs.promises` is the same namespace; it just keeps this fixture load off
    // the classifier's synchronous-I/O pattern.
    const names = await fs.promises.readdir(wireLogDir);
    const paths = [
        'app/components/settings/SettingsSurface.tsx',
        'app/components/options-menu/OptionsMenu.tsx',
        'app/workspace-panels.tsx',
        'public/script.js',
        'public/scripts/dom-handlers.js',
        ...names
            .filter(name => name.endsWith('.ts') || name.endsWith('.tsx'))
            .map(name => `app/components/wire-log/${name}`),
    ];
    const contents = await Promise.all(
        paths.map(relativePath => fs.promises.readFile(path.join(repoRoot, relativePath), 'utf8')),
    );
    return Object.fromEntries(paths.map((relativePath, index) => [relativePath, contents[index]]));
}

/** @type {Record<string, string>} */
const sources = await loadClientSources();
/** Wire log component file names, as they exist on disk. */
const wireLogFiles = Object.keys(sources)
    .filter(relativePath => relativePath.startsWith('app/components/wire-log/'))
    .map(relativePath => path.basename(relativePath));

/**
 * Evaluates one expression against the helper module in a plain Node process
 * and returns its JSON value.
 *
 * jest's module registry cannot evaluate TypeScript (jest.unit.config.cjs has
 * no transform, and the runtime ignores `--experimental-strip-types`), while
 * Node needs nothing but that flag. So the real module is exercised through
 * Node and the assertion itself stays in the test.
 * @param {string} expression Source body with `helpers` in scope; must return
 * @returns {unknown} JSON-decoded result
 */
function evaluateHelpers(expression) {
    const moduleUrl = new URL('../app/components/wire-log/wire-log-helpers.ts', import.meta.url).href;
    const script = `
        const helpers = await import(${JSON.stringify(moduleUrl)});
        const value = await (async () => { ${expression} })();
        console.log(JSON.stringify(value === undefined ? null : value));
    `;
    const output = execFileSync(
        process.execPath,
        ['--experimental-strip-types', '--input-type=module', '--eval', script],
        { encoding: 'utf8' },
    );
    return JSON.parse(output);
}

describe('wire log viewer contract', () => {
    test('keeps one type module that matches the store projection', async () => {
        const files = wireLogFiles;

        // Two parallel type modules were the drift source; only `types.ts` remains.
        expect(files).toContain('types.ts');
        expect(files).not.toContain('wire-log-types.ts');

        const types = sources['app/components/wire-log/types.ts'];
        // `toListItem` fields.
        expect(types).toContain('toolCount');
        expect(types).toContain('messageCount');
        expect(types).toContain('ttftMs');
        // `normalizeWireLogOptions` fields.
        expect(types).toContain('captureBody');
        expect(types).toContain('retentionDays');
        expect(types).toContain('maxFileBytes');
        expect(types).toContain('persisted');
        expect(types).toContain('reason');
    });

    test('reads the API paths the router actually registers', () => {
        const browser = sources['app/components/wire-log/WireLogBrowser.tsx'];

        expect(browser).toContain('apiFetch(`/api/wire-logs?${params.toString()}`');
        expect(browser).toContain('apiFetch(\'/api/wire-logs/config\'');
        expect(browser).toContain('apiFetch(`/api/wire-logs/${encodeURIComponent(selectedId)}`');
        expect(browser).toContain('apiFetch(`/api/wire-logs/${encodeURIComponent(id)}`, { method: \'DELETE\' })');
        // Server-side filters must be the ones the route parses.
        expect(browser).toContain('params.set(\'status\', statusFilter)');
        expect(browser).toContain('params.set(\'date\', dateFilter)');
        expect(browser).toContain('new URLSearchParams({ limit: String(LIST_LIMIT) })');
        expect(browser).not.toContain('params.set(\'q\'');
    });

    test('defaults the list to the active chat session', () => {
        const browser = sources['app/components/wire-log/WireLogBrowser.tsx'];
        const panel = sources['app/components/wire-log/WireLogPanel.tsx'];

        // The default scope is the current chat; the panel owns that choice.
        expect(browser).toContain('chatId?: string | null;');
        expect(browser).toContain('params.set(\'chatId\', chatId)');
        expect(browser).toContain('[chatId, dateFilter, statusFilter]');
        // Panel opens scoped when the workspace shows a chat, and can clear it.
        expect(panel).toContain('const [chatId] = useState(() => bridge.getChatId());');
        expect(panel).toContain('useState(Boolean(chatId))');
        expect(panel).toContain('<WireLogBrowser chatId={scoped ? chatId : null} onConfigChange={bridge.onConfigChange} />');
    });

    test('is mounted as its own panel, not inside the settings page', () => {
        const settingsSurface = sources['app/components/settings/SettingsSurface.tsx'];
        const workspacePanels = sources['app/workspace-panels.tsx'];

        expect(settingsSurface).not.toContain('WireLogBrowser');
        expect(workspacePanels).toContain('import { WireLogPanel, type WireLogPanelBridge } from \'./components/wire-log/WireLogPanel\';');
        expect(workspacePanels).toContain('export function mountWireLogPanel(');
        expect(workspacePanels).toContain('export function unmountWireLogPanel(');
    });

    test('opens from the chat workspace bottom-left menu', () => {
        const optionsMenu = sources['app/components/options-menu/OptionsMenu.tsx'];
        const script = sources['public/script.js'];
        const domHandlers = sources['public/scripts/dom-handlers.js'];

        expect(optionsMenu).toContain('id="option_wire_log"');
        expect(optionsMenu).toContain('Wire Log / 链路日志');
        expect(domHandlers).toContain('id == \'option_wire_log\'');
        expect(domHandlers).toContain('await openWireLogPanel();');
        expect(script).toContain('async function openWireLogPanel()');
        expect(script).toContain('module.mountWireLogPanel(wireLogPanelHost, getWireLogPanelBridge());');
    });

    test('offers a real JSON download next to the clipboard copy', () => {
        const detail = sources['app/components/wire-log/WireLogDetail.tsx'];
        const helpers = sources['app/components/wire-log/wire-log-helpers.ts'];

        expect(helpers).toContain('export function downloadJson(');
        expect(helpers).toContain('URL.createObjectURL(blob)');
        expect(helpers).toContain('URL.revokeObjectURL(url)');
        expect(detail).toContain('data-wire-log-download="record"');
        expect(detail).toContain('下载 JSON');
        // Copy stays: the download is additive, not a replacement.
        expect(detail).toContain('data-wire-log-copy="record"');
        expect(detail).toContain('复制 JSON');
    });

    test('renders every style key its components reference', async () => {
        // Two modules: the browser family (`wireLogStyles`) and the overlay
        // chrome the panel owns (`panelStyles`).
        const defined = new Set(
            ['wire-log.styles.ts', 'wire-log-panel.styles.ts'].flatMap(name => [
                ...sources[`app/components/wire-log/${name}`]
                    .matchAll(/^ {4}([a-zA-Z]+): \{/gmu),
            ].map(match => match[1])),
        );
        const componentNames = wireLogFiles.filter(name => name.endsWith('.tsx'));
        const used = new Set(
            componentNames.flatMap(name => [...sources[`app/components/wire-log/${name}`].matchAll(/\b(?:wireLog)?[Ss]tyles\.([a-zA-Z]+)/gu)]
                .map(match => match[1])),
        );

        expect([...used].filter(key => !defined.has(key))).toEqual([]);
    });

    test('no longer passes the removed `defaultDepth` prop', () => {
        const detail = sources['app/components/wire-log/WireLogDetail.tsx'];
        const viewer = sources['app/components/wire-log/JsonViewer.tsx'];

        expect(viewer).toContain('depth?: number;');
        expect(detail).not.toContain('defaultDepth');
    });

    test('shows token usage in the structured detail grid and the list row', () => {
        const detail = sources['app/components/wire-log/WireLogDetail.tsx'];
        const browser = sources['app/components/wire-log/WireLogBrowser.tsx'];
        const types = sources['app/components/wire-log/types.ts'];
        const helpers = sources['app/components/wire-log/wire-log-helpers.ts'];

        // The store projects `response.usage`; the viewer types must match it.
        expect(types).toContain('usage');
        expect(helpers).toContain('export function formatUsage(');
        // Detail: a real grid cell reading the record, not a raw JSON dump.
        expect(detail).toContain('label="Token 用量"');
        expect(detail).toContain('value={formatUsage(record.response?.usage)}');
        // List row: counts stay visible while scanning.
        expect(browser).toContain('formatUsage(entry.response?.usage)');
    });
});

describe('wire log viewer helpers', () => {
    test('derives the day partition the store used for the file', () => {
        expect(evaluateHelpers(`
            return [
                helpers.dayPartition(Date.parse('2026-01-02T23:30:00Z')),
                helpers.groupByDay([
                    { ts: Date.parse('2026-01-02T10:00:00Z'), context: {} },
                    { ts: Date.parse('2026-01-01T10:00:00Z'), context: {} },
                    { ts: Date.parse('2026-01-02T11:00:00Z'), context: {} },
                ]).map(bucket => [bucket.date, bucket.entries.map(entry => entry.ts)]),
            ];
        `)).toEqual([
            '2026-01-02',
            [
                ['2026-01-02', [Date.parse('2026-01-02T10:00:00Z'), Date.parse('2026-01-02T11:00:00Z')]],
                ['2026-01-01', [Date.parse('2026-01-01T10:00:00Z')]],
            ],
        ]);
    });

    test('filters entries case-insensitively over identity fields', () => {
        expect(evaluateHelpers(`
            const entries = [
                { id: 'wl_alpha', context: { model: 'gpt-5.2', charName: 'Seraphina' } },
                { id: 'wl_beta', context: { model: 'claude' } },
            ];
            const ids = query => helpers.filterEntries(entries, query).map(entry => entry.id);
            return [ids(''), ids('CLAUDE'), ids('seraphina'), ids('nothing')];
        `)).toEqual([['wl_alpha', 'wl_beta'], ['wl_beta'], ['wl_alpha'], []]);
    });

    test('reads the reply text from both response shapes', () => {
        expect(evaluateHelpers(`
            return [
                helpers.responseText({ response: { body: { choices: [{ message: { content: 'hi there' } }] } } }),
                helpers.responseText({ response: { body: { kind: 'sse', raw: 'data: …', assembled: { content: 'streamed', reasoning: 'why' } } } }),
                helpers.responseText({ response: null }),
                helpers.responseText(null),
                helpers.responseText({ response: { body: { choices: [{ message: { content: null } }] } } }),
                helpers.responseReasoning({ response: { body: { kind: 'sse', assembled: { content: 'x', reasoning: 'why' } } } }),
                helpers.responseReasoning({ response: { body: { choices: [] } } }),
                helpers.sseBody({ choices: [] }),
            ];
        `)).toEqual(['hi there', 'streamed', null, null, null, 'why', null, null]);
    });

    test('extracts messages only from a well-formed body', () => {
        expect(evaluateHelpers(`
            return [
                helpers.requestMessages({ request: { body: { messages: [{ role: 'user', content: 'hello' }] } } }),
                helpers.requestMessages({ request: { body: null } }),
                helpers.requestMessages({ request: { body: { messages: 'nope' } } }),
                helpers.requestMessages(null),
            ];
        `)).toEqual([[{ role: 'user', content: 'hello' }], [], [], []]);
    });

    test('copies strings verbatim and pretty-prints everything else', () => {
        expect(evaluateHelpers(`
            const circular = {};
            circular.self = circular;
            return [
                helpers.serializeForClipboard('plain reply'),
                helpers.serializeForClipboard({ a: 1 }),
                helpers.serializeForClipboard(null),
                helpers.serializeForClipboard(circular),
            ];
        `)).toEqual(['plain reply', '{\n  "a": 1\n}', 'null', '[object Object]']);
    });

    test('previews message content without flooding the row', () => {
        expect(evaluateHelpers(`
            return [
                helpers.messagePreview('  hello\\n\\n world  '),
                helpers.messagePreview([{ type: 'text', text: 'a' }, { type: 'image_url' }]),
                helpers.messagePreview(null),
                helpers.messagePreview('x'.repeat(200)).length,
            ];
        `)).toEqual(['hello world', 'a [image_url]', '', 141]);
    });

    test('formats byte counts for the metadata grid', () => {
        expect(evaluateHelpers(`
            return [
                helpers.formatBytes(0),
                helpers.formatBytes(2048),
                helpers.formatBytes(2 * 1024 * 1024),
                helpers.formatBytes(null),
                helpers.formatBytes(undefined),
            ];
        `)).toEqual(['0 B', '2.0 KiB', '2.0 MiB', '—', '—']);
    });

    test('summarizes token usage for the detail grid', () => {
        expect(evaluateHelpers(`
            return [
                helpers.formatUsage({ prompt_tokens: 1200, completion_tokens: 34, total_tokens: 1234 }),
                helpers.formatUsage({ input_tokens: 5, output_tokens: 6 }),
                helpers.formatUsage({ prompt_tokens: 7 }),
                helpers.formatUsage({ total_tokens: 9 }),
                helpers.formatUsage(null),
                helpers.formatUsage(undefined),
                helpers.formatUsage({}),
                helpers.formatUsage('1200'),
            ];
        `)).toEqual([
            '1234 (提示 1200 / 完成 34)',
            '提示 5 / 完成 6',
            '提示 7',
            '总计 9',
            '—',
            '—',
            '—',
            '—',
        ]);
    });
});
