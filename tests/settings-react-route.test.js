import { afterEach, beforeAll, describe, expect, test } from '@jest/globals';
import express from 'express';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setConfigFilePath } from '../src/util.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const tmpConfigDir = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-settings-react-config-'));
const configPath = path.join(tmpConfigDir, 'config.yaml');
const tmpRoots = [];

beforeAll(() => {
    fs.writeFileSync(configPath, [
        'enableUserAccounts: true',
        'features:',
        '  react:',
        '    pages:',
        '      login: false',
        '      setup: false',
        '      settings: true',
        '',
    ].join('\n'), 'utf8');
    setConfigFilePath(configPath);
});

afterEach(() => {
    delete process.env.EMBERDESK_FEATURES_REACT_PAGES_SETTINGS;
    for (const root of tmpRoots.splice(0)) {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

function listen(app) {
    const server = http.createServer(app);
    return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            resolve({
                server,
                url: `http://127.0.0.1:${address.port}`,
            });
        });
    });
}

async function usingApp(app, callback) {
    const { server, url } = await listen(app);
    try {
        return await callback(url);
    } finally {
        await new Promise(resolve => server.close(resolve));
    }
}

function createRequestContext(isLoggedIn = true) {
    return {
        session: {},
        user: isLoggedIn ? {
            profile: {
                handle: 'settings-user',
            },
        } : null,
    };
}

async function createSettingsRouteApp({ isLoggedIn = true, reactLoginDistRoot } = {}) {
    globalThis.COMMAND_LINE_ARGS = { basicAuthMode: false };

    const usersModule = await import(`../src/users.js?settingsRoute=${Date.now()}-${Math.random()}`);
    const middlewareModule = await import(`../src/middleware/react-login-serve.js?settingsRoute=${Date.now()}-${Math.random()}`);
    const basePathModule = await import(`../src/react-login-feature.js?settingsRoute=${Date.now()}-${Math.random()}`);
    const featureModule = await import(`../src/react-settings-feature.js?settingsRoute=${Date.now()}-${Math.random()}`);

    const app = express();
    app.use((request, _response, next) => {
        Object.assign(request, createRequestContext(isLoggedIn));
        next();
    });
    app.get('/settings', usersModule.createSettingsPageMiddleware({ reactLoginDistRoot }));
    app.use(basePathModule.REACT_LOGIN_BASE_PATH, middlewareModule.getReactLoginServeMiddleware(reactLoginDistRoot));
    app.use(express.static(path.join(repoRoot, 'public'), {}));

    return { app, featureModule };
}

describe('settings React route flag', () => {
    test('wires the React settings route through TanStack Form, Query, and Zod while preserving untouched settings fields', async () => {
        const routeSource = fs.readFileSync(path.join(repoRoot, 'app', 'components', 'settings', 'SettingsSurface.tsx'), 'utf8');
        const pageRouteSource = fs.readFileSync(path.join(repoRoot, 'app', 'routes', 'settings.tsx'), 'utf8');
        const settingFieldSource = fs.readFileSync(path.join(repoRoot, 'app', 'components', 'settings', 'SettingField.tsx'), 'utf8');
        const settingsStyleSource = fs.readFileSync(path.join(repoRoot, 'app', 'styles', 'settings-surface.styles.ts'), 'utf8');
        const publicStyleSource = fs.readFileSync(path.join(repoRoot, 'public', 'style.css'), 'utf8');
        const indexSource = fs.readFileSync(path.join(repoRoot, 'public', 'index.html'), 'utf8');
        const helperModule = await import(`../app/lib/settings-helpers.js?settingsHelpers=${Date.now()}-${Math.random()}`);

        expect(routeSource).not.toContain('waifuMode');
        expect(helperModule.settingsFormFieldPaths).not.toContain('userInterface.waifuMode');
        expect(helperModule.settingsCoverage.reactOwned.userInterface).not.toContain('power_user.waifuMode');
        expect(helperModule.defaultSettingsFormValues.userInterface).not.toHaveProperty('waifuMode');
        expect(indexSource).not.toContain('id="waifuMode"');
        expect(indexSource).toContain('id="bg1"');
        expect(indexSource).not.toContain('id="rm_group_hidemutedsprites"');

        expect(routeSource).toContain("import { useMutation, useQuery } from '@tanstack/react-query';");
        expect(routeSource).toContain("import { z } from 'zod';");
        expect(routeSource).toContain('const settingsQuery = useQuery(');
        expect(pageRouteSource).toContain('SettingsSurface');
        expect(pageRouteSource).toContain("variant=\"page\"");
        expect(routeSource).toContain('const secretsQuery = useQuery(');
        expect(routeSource).toContain('const saveMutation = useMutation(');
        expect(routeSource).toContain('const settingsForm = useForm(');
        expect(routeSource).toContain('const settingsSchema = z.object(');
        expect(routeSource).toContain('settingsForm.reset(nextDefaults, { keepDefaultValues: true });');
        expect(routeSource).not.toContain('settingsForm.reset(nextDefaults);');
        expect(routeSource).toContain('<settingsForm.Subscribe');
        expect(routeSource).toContain('selector={state => state.isPristine}');
        expect(routeSource).toContain('disabled={isBusy || settingsQuery.isPending || isPristine || hasRevisionConflict}');
        expect(routeSource).toContain("import { startTransition, useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';");
        expect(routeSource).toContain('const [isSettingsFormReady, setIsSettingsFormReady] = useState(false);');
        expect(routeSource).toContain('const openSettingsTab = useCallback((tabId: string)');
        expect(routeSource).toContain('startTransition(() => {');
        expect(routeSource).toContain('{isSettingsFormReady ? (');
        expect(routeSource).not.toContain('const settingsFormValues = useStore(settingsForm.store, state => state.values);');
        expect(routeSource).toContain('settingsStyles.tabPanelOverlay');
        expect(routeSource).not.toContain("{activeTab === 'general' ? (");
        expect(routeSource).toContain("{activeTab === 'providers' ? (");
        expect(routeSource).toContain("{activeTab === 'userInterface' ? (");
        expect(routeSource).toContain("{activeTab === 'advanced' ? (");
        expect(routeSource).toContain('name="providers.customUrl"');
        expect(routeSource).toContain('name="providers.fallbackProviderModel"');
        expect(routeSource).toContain('name="userInterface.customCss"');
        expect(routeSource).toContain('name="advanced.autoSwipe"');
        expect(routeSource).not.toContain("{activeTab === 'general' && (");
        expect(routeSource).not.toContain("{activeTab === 'providers' && (");
        expect(routeSource).not.toContain("{activeTab === 'userInterface' && (");
        expect(routeSource).not.toContain("{activeTab === 'advanced' && (");
        // Four-field provider contract: URL, key, model, fallback model only.
        expect(routeSource).not.toContain('chatCompletionSource: z.enum(');
        expect(routeSource).not.toContain('reverseProxy:');
        expect(routeSource).not.toContain('proxyPassword:');
        expect(routeSource).not.toContain('customIncludeBody');
        expect(routeSource).not.toContain('customExcludeBody');
        expect(routeSource).not.toContain('customIncludeHeaders');
        expect(routeSource).not.toContain('fallbackProviderEnabled');
        expect(routeSource).not.toContain('fallbackProviderBaseUrl');
        expect(routeSource).not.toContain('bindPresetToConnection');
        expect(routeSource).not.toContain('connectionProfileId');
        expect(routeSource).not.toContain('fallbackSecretInput');
        expect(routeSource).not.toContain('api_key_openai_fallback');
        expect(routeSource).toContain('openaiModel: z.string(),');
        expect(routeSource).not.toContain('theme: z.string(),');
        expect(routeSource).toContain('systemPromptName: z.string(),');
        expect(routeSource).toContain('systemPromptContent: z.string(),');
        expect(routeSource).not.toContain('contextPreset');
        expect(routeSource).not.toContain('instructPreset');
        expect(routeSource).toContain("fetch('/api/settings/get', {");
        expect(routeSource).toContain("fetch('/api/settings/save', {");
        expect(routeSource).toContain("fetch('/api/secrets/read', {");
        expect(routeSource).toContain("fetch('/api/secrets/write', {");
        expect(routeSource).toContain("fetch('/api/secrets/delete', {");
        expect(routeSource).toContain('saveProviderSecretField({');
        expect(routeSource).toContain('clearProviderSecretField({');
        expect(routeSource).toContain("const providerSource = 'openai' as const;");
        expect(routeSource).not.toContain('providerSettingsValues');
        expect(routeSource).toContain('const SAVE_STATUS_TIMEOUT_MS = 4000;');
        expect(routeSource).toContain("const [saveStatus, setSaveStatus] = useState<{ kind: 'success' | 'info'; message: string } | null>(null);");
        expect(routeSource).toContain('const [showDiagnostics, setShowDiagnostics] = useState(false);');
        expect(routeSource).toContain('window.setTimeout(() => {');
        expect(routeSource).toContain('setSaveStatus(null);');
        expect(routeSource).toContain("setSaveStatus({ kind: 'success', message: 'Saved' });");
        expect(routeSource).toContain("window.sessionStorage.setItem('emberdesk-settings-saved-at'");
        expect(routeSource).toContain('setSaveStatus({ kind:');
        expect(routeSource).toContain('Diagnostics');
        expect(routeSource).toContain('{showDiagnostics && (');
        expect(routeSource).toContain('onClick={() => setShowDiagnostics(value => !value)}');
        expect(routeSource).not.toContain('<h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-300">Coverage</h2>');
        expect(routeSource).not.toContain('<h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-300">Still Legacy-Owned</h2>');
        expect(routeSource).not.toContain('<h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-300">Payload Snapshot</h2>');
        expect(settingsStyleSource).toContain('overlayHost');
        expect(settingsStyleSource).toContain("display: 'grid'");
        expect(settingsStyleSource).toContain("placeItems: 'center'");
        expect(settingsStyleSource).toContain("default: 'relative'");
        expect(settingsStyleSource).not.toContain('transform: translate(-50%, -50%)');
        expect(settingsStyleSource).toContain('tabPanelOverlay');
        expect(settingsStyleSource).toContain('saveBarOverlay');
        expect(publicStyleSource).not.toContain('.settings-page--overlay');
        expect(settingFieldSource).toContain("{variant !== 'toggle' && (");
        expect(settingFieldSource).toContain('getValueAtPath');
        expect(settingFieldSource).toContain('<form.Subscribe');
        expect(settingFieldSource).toContain('selector={(state: any) => getValueAtPath(state.values, name)}');
        expect(settingFieldSource).toContain('checked={Boolean(currentValue)}');
        expect(settingFieldSource).not.toContain('checked={Boolean(field.state.value)}');

        expect(helperModule.settingsTabDefinitions).toHaveLength(3);
        // Single-provider contract: the provider picker is retired.
        expect(helperModule.providerOptions).toBeUndefined();
        expect(helperModule.providerSecretKeyBySource.claude).toBeUndefined();
        expect(helperModule.providerSecretKeyBySource.makersuite).toBeUndefined();
        // Generation defaults moved fully to the legacy AI Response
        // Configuration / preset drawer; no React-owned general tab remains.
        expect(helperModule.settingsCoverage.reactOwned.general).toBeUndefined();
        expect(helperModule.settingsCoverage.legacyOwned).toContain('oai_settings.preset_settings_openai');
        expect(helperModule.settingsCoverage.legacyOwned).toContain('oai_settings.temp_openai');
        expect(helperModule.settingsCoverage.legacyOwned).toContain('oai_settings.reasoning_effort');
        expect(helperModule.settingsCoverage.reactOwned.providers).toEqual(expect.arrayContaining([
            'oai_settings.openai_model',
            'oai_settings.custom_url',
            'oai_settings.fallback_provider_model',
            'oai_settings.custom_prompt_post_processing',
        ]));
        expect(helperModule.settingsCoverage.reactOwned.providers).toHaveLength(4);
        expect(helperModule.settingsCoverage.reactOwned.userInterface).toContain('power_user.custom_css');
        expect(helperModule.settingsCoverage.reactOwned.advanced).toContain('power_user.auto_swipe');
        expect(helperModule.settingsCoverage.reactOwned.advanced).toContain('power_user.stscript.autocomplete.state');
        expect(helperModule.settingsCoverage.legacyOwned).toContain('world_info_settings');
        expect(helperModule.settingsCoverage.legacyOwned).toContain('feature_settings');
        expect(helperModule.settingsCoverage.legacyOwned).toContain('preset_settings');
        expect(helperModule.getFieldErrorMessage([{ message: 'Theme 不能为空' }])).toBe('Theme 不能为空');
        expect(helperModule.getFieldErrorMessage(['Context 必须大于 0'])).toBe('Context 必须大于 0');

        const parsed = helperModule.parseSettingsPayload({
            settings: JSON.stringify({
                preset_settings: 'LegacyTextGenPreset',
                untouched: { keep: true },
                power_user: {
                    theme: 'Dark Lite',
                    chat_width: 50,
                    font_scale: 1,
                    custom_css: '.chat { color: white; }',
                    fast_ui_mode: true,
                    reduced_motion: true,
                    noShadows: true,
                    toastr_position: 'toast-top-right',
                    avatar_style: 3,
                    chat_display: 1,
                    timer_enabled: true,
                    timestamps_enabled: true,
                    timestamp_model_icon: true,
                    mesIDDisplay_enabled: true,
                    hideChatAvatars_enabled: false,
                    compact_input_area: true,
                    auto_swipe: true,
                    auto_swipe_minimum_length: 8,
                    auto_swipe_blacklist: ['bad', 'worse'],
                    auto_swipe_blacklist_threshold: 2,
                    custom_stopping_strings_macro: false,
                    experimental_macro_engine: false,
                    chat_truncation: 120,
                    streaming_fps: 24,
                    smooth_streaming: true,
                    smooth_streaming_no_think: true,
                    smooth_streaming_speed: 42,
                    stream_fade_in: true,
                    custom_stopping_strings: '',
                    tokenizer: 99,
                    auto_continue: {
                        enabled: false,
                        allow_chat_completions: true,
                        target_length: 120,
                    },
                    instruct: {
                        enabled: true,
                        preset: 'Creative',
                        wrap: false,
                        macro: false,
                        sequences_as_stop_strings: false,
                        skip_examples: true,
                        bind_to_context: true,
                        activation_regex: '/llama/i',
                    },
                    sysprompt: {
                        enabled: false,
                        name: 'Neutral - Chat',
                        content: 'Original prompt',
                        post_history: 'after',
                    },
                    context: {
                        preset: 'Default',
                        story_string: 'Story',
                        chat_start: 'Start',
                        example_separator: '***',
                        use_stop_strings: false,
                        names_as_stop_strings: false,
                    },
                    reasoning: {
                        name: 'Default',
                        auto_parse: true,
                        add_to_prompts: true,
                        auto_expand: true,
                        show_hidden: true,
                        prefix: '<think>',
                        suffix: '</think>',
                        separator: '\n',
                        max_additions: 3,
                    },
                    stscript: {
                        matching: 'fuzzy',
                        autocomplete: {
                            state: 2,
                            autoHide: true,
                            style: 'theme',
                            font: { scale: 0.9 },
                            width: { left: 1, right: 2 },
                            select: 3,
                            showInAllMacroFields: true,
                        },
                        parser: {
                            flags: {
                                1: false,
                                2: true,
                            },
                        },
                    },
                },
                oai_settings: {
                    preset_settings_openai: 'RecoveredRuins',
                    chat_completion_source: 'openai',
                    openai_model: 'gpt-4-turbo',
                    claude_model: 'claude-sonnet-4-5',
                    google_model: 'gemini-2.5-pro',
                    reverse_proxy: '',
                    proxy_password: '',
                    custom_url: '',
                    custom_include_body: '',
                    custom_exclude_body: '',
                    custom_include_headers: '',
                    stream_openai: true,
                    openai_max_context: 4095,
                    openai_max_tokens: 300,
                    temp_openai: 0.7,
                    freq_pen_openai: 0.1,
                    pres_pen_openai: 0.2,
                    top_p_openai: 0.9,
                    top_k_openai: 12,
                    enable_web_search: true,
                    function_calling: true,
                    show_thoughts: true,
                    reasoning_effort: 'medium',
                    continue_prefill: true,
                    continue_postfix: '\n',
                    squash_system_messages: true,
                    custom_prompt_post_processing: 'merge_tools',
                    fallback_provider_enabled: true,
                    fallback_provider_base_url: 'https://fallback.example.com/v1',
                    fallback_provider_model: 'gpt-4.1-mini',
                    bind_preset_to_connection: false,
                },
            }),
        });

        expect(parsed.settings.power_user.theme).toBe('Dark Lite');

        const defaults = helperModule.buildSettingsFormDefaults(parsed.settings);
        expect(defaults.general).toBeUndefined();
        expect(defaults.providers.openaiModel).toBe('gpt-4-turbo');
        expect(defaults.providers.claudeModel).toBeUndefined();
        expect(defaults.providers.googleModel).toBeUndefined();
        // Legacy enabled flag is honored on read; the toggle itself is retired.
        expect(defaults.providers.fallbackProviderEnabled).toBeUndefined();
        expect(defaults.providers.fallbackProviderModel).toBe('gpt-4.1-mini');
        expect(defaults.userInterface.customCss).toBe('.chat { color: white; }');
        expect(defaults.advanced.autoSwipe).toBe(true);
        expect(defaults.advanced.stscriptAutocompleteFontScale).toBe(0.9);

        const merged = helperModule.buildSettingsSavePayload(parsed.settings, {
            providers: {
                openaiModel: 'gpt-5.2',
                customUrl: 'https://custom.example.com/v1',
                fallbackProviderModel: 'gpt-4.1',
            },
            userInterface: {
                chatWidth: 72,
                fontScale: 1.15,
                customCss: '.chat { color: gold; }',
                fastUiMode: false,
                reducedMotion: false,
                noShadows: false,
                toastrPosition: 'toast-bottom-right',
                avatarStyle: 1,
                chatDisplay: 2,
                timerEnabled: false,
                timestampsEnabled: false,
                timestampModelIcon: false,
                mesIDDisplayEnabled: false,
                hideChatAvatarsEnabled: true,
                compactInputArea: false,
            },
            advanced: {
                autoSwipe: false,
                autoSwipeMinimumLength: 12,
                autoSwipeBlacklist: 'skip, retry',
                autoSwipeBlacklistThreshold: 3,
                customStoppingStrings: 'END',
                tokenizer: 42,
                customStoppingStringsMacro: true,
                experimentalMacroEngine: true,
                autoContinueEnabled: true,
                autoContinueAllowChatCompletions: false,
                autoContinueTargetLength: 200,
                chatTruncation: 80,
                streamingFps: 20,
                smoothStreaming: false,
                smoothStreamingNoThink: false,
                smoothStreamingSpeed: 30,
                streamFadeIn: false,
                systemPromptName: 'Custom',
                systemPromptContent: 'Updated prompt',
                syspromptEnabled: true,
                syspromptPostHistory: 'later',
                reasoningName: 'Custom',
                reasoningAutoParse: false,
                reasoningAddToPrompts: false,
                reasoningAutoExpand: false,
                reasoningShowHidden: false,
                reasoningPrefix: '[',
                reasoningSuffix: ']',
                reasoningSeparator: ' ',
                reasoningMaxAdditions: 1,
                stscriptMatching: 'exact',
                stscriptAutocompleteState: 1,
                stscriptAutocompleteAutoHide: false,
                stscriptAutocompleteStyle: 'compact',
                stscriptAutocompleteSelect: 1,
                stscriptAutocompleteShowInAllMacroFields: false,
                stscriptAutocompleteFontScale: 1.1,
                stscriptAutocompleteWidthLeft: 2,
                stscriptAutocompleteWidthRight: 3,
                stscriptParserFlagStrictEscaping: true,
                stscriptParserFlagReplaceGetvar: false,
            },
        });

        expect(merged.untouched.keep).toBe(true);
        expect(merged.preset_settings).toBe('LegacyTextGenPreset');
        expect(merged.power_user.theme).toBe('Dark Lite');
        expect(merged.power_user.chat_width).toBe(72);
        expect(merged.power_user.font_scale).toBe(1.15);
        expect(merged.power_user.custom_stopping_strings).toBe('END');
        expect(merged.power_user.tokenizer).toBe(42);
        expect(merged.power_user.auto_continue.enabled).toBe(true);
        expect(merged.power_user.sysprompt.name).toBe('Custom');
        expect(merged.power_user.sysprompt.content).toBe('Updated prompt');
        expect(merged.power_user.context.preset).toBe('Default');
        expect(merged.oai_settings.preset_settings_openai).toBe('RecoveredRuins');
        expect(merged.oai_settings.chat_completion_source).toBe('openai');
        expect(merged.oai_settings.openai_model).toBe('gpt-5.2');
        expect(merged.oai_settings.custom_url).toBe('https://custom.example.com/v1');
        expect(merged.oai_settings.fallback_provider_model).toBe('gpt-4.1');
        // Retired two-credential fields are stripped from the saved payload.
        expect(merged.oai_settings.reverse_proxy).toBeUndefined();
        expect(merged.oai_settings.proxy_password).toBeUndefined();
        expect(merged.oai_settings.custom_include_body).toBeUndefined();
        expect(merged.oai_settings.custom_exclude_body).toBeUndefined();
        expect(merged.oai_settings.custom_include_headers).toBeUndefined();
        expect(merged.oai_settings.fallback_provider_enabled).toBeUndefined();
        expect(merged.oai_settings.fallback_provider_base_url).toBeUndefined();
        expect(merged.oai_settings.bind_preset_to_connection).toBeUndefined();
        // Generation defaults are legacy-drawer-owned: a React Settings save
        // preserves them untouched instead of writing or deleting them.
        expect(merged.oai_settings.stream_openai).toBe(true);
        expect(merged.oai_settings.openai_max_context).toBe(4095);
        expect(merged.oai_settings.openai_max_tokens).toBe(300);
        expect(merged.oai_settings.temp_openai).toBe(0.7);
        expect(merged.oai_settings.function_calling).toBe(true);
        expect(merged.oai_settings.reasoning_effort).toBe('medium');
        expect(merged.oai_settings.continue_prefill).toBe(true);
        expect(merged.oai_settings.custom_prompt_post_processing).toBe('merge_tools');
        expect(merged.power_user.custom_css).toBe('.chat { color: gold; }');
        expect(merged.power_user.toastr_position).toBe('toast-bottom-right');
        expect(merged.power_user.auto_swipe).toBe(false);
        expect(merged.power_user.auto_swipe_blacklist).toEqual(['skip', 'retry']);
        expect(merged.power_user.instruct.enabled).toBe(true);
        expect(merged.power_user.instruct.skip_examples).toBe(true);
        expect(merged.power_user.instruct.activation_regex).toBe('/llama/i');
        expect(merged.power_user.context.story_string).toBe('Story');
        expect(merged.power_user.sysprompt.post_history).toBe('later');
        expect(merged.power_user.reasoning.max_additions).toBe(1);
        expect(merged.power_user.stscript.autocomplete.state).toBe(1);
        expect(merged.power_user.stscript.parser.flags).toEqual({
            1: true,
            2: false,
        });
    });



    test('keeps generation-default fields out of the React surface while legacy drawer bindings stay intact', async () => {
        const routeSource = fs.readFileSync(path.join(repoRoot, 'app', 'components', 'settings', 'SettingsSurface.tsx'), 'utf8');
        const helperModule = await import(`../app/lib/settings-helpers.js?settingsGeneralRetired=${Date.now()}-${Math.random()}`);
        const aiConfigSource = fs.readFileSync(path.join(repoRoot, 'app', 'components', 'ai-config', 'AiConfigPanel.tsx'), 'utf8');
        const openaiSource = fs.readFileSync(path.join(repoRoot, 'public', 'scripts', 'openai.js'), 'utf8');

        expect(routeSource).not.toContain('name="general.');
        expect(routeSource).not.toContain("'Generation Defaults'");
        expect(helperModule.settingsFormFieldPaths.some(path => path.startsWith('general.'))).toBe(false);
        expect(helperModule.defaultSettingsFormValues.general).toBeUndefined();
        // The AI Response Configuration drawer still owns every removed field.
        for (const legacyId of [
            'settings_preset_openai',
            'openai_max_context',
            'openai_max_tokens',
            'temp_openai',
            'openai_reasoning_effort',
            'continue_nudge_prompt_textarea',
            'names_behavior',
        ]) {
            expect(aiConfigSource).toContain(`id="${legacyId}"`);
            expect(openaiSource).toContain(legacyId);
        }
    });

    test('sends React settings saves through the injected runtime command port', async () => {
        const helperModule = await import(`../app/lib/settings-helpers.js?settingsRuntimePort=${Date.now()}-${Math.random()}`);
        const routeSource = fs.readFileSync(path.join(repoRoot, 'app', 'components', 'settings', 'SettingsSurface.tsx'), 'utf8');
        const savedSettings = [];
        const runtime = {
            commands: {
                saveSettings: async settings => {
                    savedSettings.push(settings);
                },
            },
        };

        await expect(helperModule.saveSettingsToRuntime({
                oai_settings: { temp_openai: 0.37 },
                power_user: { fast_ui_mode: false },
                feature_settings: { stale: false },
            }, runtime)).resolves.toBe(true);
        expect(savedSettings).toEqual([{
            oai_settings: { temp_openai: 0.37 },
            power_user: { fast_ui_mode: false },
            feature_settings: { stale: false },
        }]);
        expect(routeSource).toContain('await saveSettingsToRuntime(payload, runtime);');
    });

    test('coerces string numeric enums into form numbers for lossless save validation', async () => {
        const helperModule = await import(`../app/lib/settings-helpers.js?settingsCoerce=${Date.now()}-${Math.random()}`);
        const defaults = helperModule.buildSettingsFormDefaults({
            power_user: {
                avatar_style: '1',
                chat_display: '2',
                send_on_enter: '-1',
                tag_import_setting: '3',
            },
        });
        expect(defaults.userInterface.avatarStyle).toBe(1);
        expect(defaults.userInterface.chatDisplay).toBe(2);
        expect(defaults.userInterface.sendOnEnter).toBe(-1);
        expect(defaults.userInterface.tagImportSetting).toBe(3);
    });

    test('owner inventory covers drawer fields with lossless single-field save round-trip', async () => {
        const helperModule = await import(`../app/lib/settings-helpers.js?settingsInventory=${Date.now()}-${Math.random()}`);

        expect(helperModule.settingsOwnerInventory.drawers.userSettings).toBe('#user-settings-block');
        expect(helperModule.settingsOwnerInventory.drawers.advancedFormatting).toBe('#AdvancedFormatting');
        // The retired API Connections drawer is no longer part of the inventory.
        expect(helperModule.settingsOwnerInventory.drawers.apiConfiguration).toBeUndefined();
        expect(helperModule.settingsOwnerInventory.specializedSurfaces).toEqual(expect.arrayContaining([
            'world_info_settings',
            'feature_settings',
            'tags',
            'tag_map',
        ]));

        const reactPaths = Object.values(helperModule.settingsCoverage.reactOwned).flat();
        for (const path of [
            'oai_settings.tool_reasoning_mode',
            'oai_settings.names_behavior',
            'oai_settings.verbosity',
            'oai_settings.media_inlining',
        ]) {
            expect(reactPaths).not.toContain(path);
            expect(helperModule.settingsCoverage.legacyOwned).toContain(path);
        }
        for (const path of [
            'power_user.main_text_color',
            'power_user.expand_message_actions',
            'power_user.send_on_enter',
            'power_user.pin_styles',
            'power_user.message_token_count_enabled',
            'power_user.collapse_newlines',
            'power_user.token_padding',
            'power_user.user_prompt_bias',
        ]) {
            expect(reactPaths).toContain(path);
            expect(helperModule.settingsCoverage.legacyOwned).not.toContain(path);
        }

        const fixture = {
            untouched: { keep: true, nested: { a: 1 } },
            unknown_root: 'preserve-me',
            preset_settings: 'LegacyTextGenPreset',
            world_info_settings: { depth: 2 },
            feature_settings: { disabled: [] },
            oai_settings: {
                chat_completion_source: 'openai',
                reasoning_effort: 'xhigh',
                tool_reasoning_mode: 'active_chain',
                names_behavior: 2,
                verbosity: 'low',
                media_inlining: false,
                request_images: true,
                request_image_aspect_ratio: '16:9',
                assistant_prefill: 'legacy-prefill',
                n: 3,
                openai_max_context: 4095,
            },
            power_user: {
                theme: 'Dark Lite',
                main_text_color: 'rgba(1, 2, 3, 1)',
                expand_message_actions: true,
                send_on_enter: -1,
                pin_styles: false,
                message_token_count_enabled: true,
                collapse_newlines: true,
                token_padding: 32,
                user_prompt_bias: 'start-with',
                custom_css: '.x{}',
                stscript: {
                    matching: 'fuzzy',
                    autocomplete: {
                        state: 2,
                        autoHide: false,
                        style: 'theme',
                        select: 3,
                        showInAllMacroFields: false,
                        font: { scale: 0.8 },
                        width: { left: 0, right: 0 },
                    },
                    parser: { flags: { 1: false, 2: true } },
                },
            },
            tags: [{ id: 1 }],
            tag_map: { a: ['b'] },
        };

        const defaults = helperModule.buildSettingsFormDefaults(fixture);
        expect(defaults.general).toBeUndefined();
        expect(defaults.userInterface.mainTextColor).toBe('rgba(1, 2, 3, 1)');
        expect(defaults.userInterface.sendOnEnter).toBe(-1);
        expect(defaults.advanced.collapseNewlines).toBe(true);
        expect(defaults.advanced.tokenPadding).toBe(32);

        // Mutate a single field only.
        const singleEdit = structuredClone(defaults);
        singleEdit.userInterface.mainTextColor = 'rgba(9, 8, 7, 1)';
        const saved = helperModule.buildSettingsSavePayload(fixture, singleEdit);

        expect(saved.untouched).toEqual({ keep: true, nested: { a: 1 } });
        expect(saved.unknown_root).toBe('preserve-me');
        expect(saved.preset_settings).toBe('LegacyTextGenPreset');
        expect(saved.world_info_settings).toEqual({ depth: 2 });
        expect(saved.feature_settings).toEqual({ disabled: [] });
        expect(saved.tags).toEqual([{ id: 1 }]);
        expect(saved.tag_map).toEqual({ a: ['b'] });
        expect(saved.oai_settings.tool_reasoning_mode).toBe('active_chain');
        expect(saved.oai_settings.names_behavior).toBe(2);
        expect(saved.oai_settings.reasoning_effort).toBe('xhigh');
        expect(saved.oai_settings.assistant_prefill).toBe('legacy-prefill');
        expect(saved.power_user.main_text_color).toBe('rgba(9, 8, 7, 1)');
        expect(saved.power_user.expand_message_actions).toBe(true);
        expect(saved.power_user.send_on_enter).toBe(-1);
        expect(saved.power_user.stscript.parser.flags).toEqual({ 1: false, 2: true });
        expect(saved.power_user.user_prompt_bias).toBe('start-with');
        expect(saved.power_user.token_padding).toBe(32);
        expect(saved.power_user.collapse_newlines).toBe(true);

        // Full identity round-trip with no form edits preserves unknown enums/values.
        const identity = helperModule.buildSettingsSavePayload(fixture, defaults);
        expect(identity.oai_settings.reasoning_effort).toBe('xhigh');
        expect(identity.oai_settings.tool_reasoning_mode).toBe('active_chain');
        expect(identity.power_user.main_text_color).toBe('rgba(1, 2, 3, 1)');
    });

    test('downgrades legacy Vertex AI source to OpenAI and keeps advanced reasoning effort values saveable', async () => {
        const helperModule = await import(`../app/lib/settings-helpers.js?settingsCompat=${Date.now()}-${Math.random()}`);
        const parsed = helperModule.parseSettingsPayload({
            settings: JSON.stringify({
                untouched: { keep: true },
                oai_settings: {
                    chat_completion_source: 'vertexai',
                    google_model: 'gemini-2.5-pro',
                    reasoning_effort: 'minimal',
                },
            }),
        });

        const defaults = helperModule.buildSettingsFormDefaults(parsed.settings);
        expect(defaults.providers.chatCompletionSource).toBeUndefined();
        expect(defaults.general).toBeUndefined();

        const preserved = helperModule.buildSettingsSavePayload(parsed.settings, defaults);
        expect(preserved.untouched.keep).toBe(true);
        // Saving normalizes the retired multi-provider source key while the
        // legacy-owned reasoning effort survives untouched.
        expect(preserved.oai_settings.chat_completion_source).toBe('openai');
        expect(preserved.oai_settings.reasoning_effort).toBe('minimal');
    });

    test('normalizes retired Claude source to OpenAI and preserves legacy keys', async () => {
        const helperModule = await import(`../app/lib/settings-helpers.js?settingsClaude=${Date.now()}-${Math.random()}`);
        const parsed = helperModule.parseSettingsPayload({
            settings: JSON.stringify({
                untouched: { keep: true },
                oai_settings: {
                    chat_completion_source: 'claude',
                    claude_model: 'claude-sonnet-4-5',
                },
            }),
        });

        const defaults = helperModule.buildSettingsFormDefaults(parsed.settings);
        expect(defaults.providers.chatCompletionSource).toBeUndefined();

        const preserved = helperModule.buildSettingsSavePayload(parsed.settings, defaults);
        expect(preserved.untouched.keep).toBe(true);
        expect(preserved.oai_settings.chat_completion_source).toBe('openai');
        expect(preserved.oai_settings.claude_model).toBe('claude-sonnet-4-5');
    });

    test('saves only changed fields from a minimal settings document', async () => {
        const helperModule = await import(`../app/lib/settings-helpers.js?settingsSparse=${Date.now()}-${Math.random()}`);
        const fixture = {
            untouched: { keep: true },
        };
        const baseline = helperModule.buildSettingsFormDefaults(fixture);
        const edited = structuredClone(baseline);
        edited.userInterface.chatWidth = 42;
        const saved = helperModule.buildSettingsSavePayload(fixture, edited, {
            baselineFormValues: baseline,
        });

        expect(saved).toEqual({
            untouched: { keep: true },
            power_user: {
                chat_width: 42,
            },
        });
    });



    test('stored instruct and context template keys survive a settings save untouched', async () => {
        const helperModule = await import(`../app/lib/settings-helpers.js?settingsAf=${Date.now()}-${Math.random()}`);
        const routeSource = fs.readFileSync(path.join(repoRoot, 'app', 'components', 'settings', 'SettingsSurface.tsx'), 'utf8');
        const pageRouteSource = fs.readFileSync(path.join(repoRoot, 'app', 'routes', 'settings.tsx'), 'utf8');
        expect(routeSource).toContain('settings-workspace-link');
        expect(routeSource).toContain('emberdesk-settings-saved-at');
        expect(helperModule.settingsCoverage.reactOwned.advanced).not.toEqual(expect.arrayContaining([
            'power_user.instruct.input_sequence',
            'power_user.context.story_string_position',
        ]));

        const fixture = {
            power_user: {
                instruct: {
                    enabled: true,
                    input_sequence: '### Input:',
                    output_sequence: '### Response:',
                    stop_sequence: '</s>',
                    system_same_as_user: true,
                    names_behavior: 'completion',
                },
                context: {
                    preset: 'Default',
                    story_string: '{{description}}',
                    story_string_position: 1,
                    story_string_role: 0,
                    story_string_depth: 4,
                },
            },
            keep: true,
        };
        const defaults = helperModule.buildSettingsFormDefaults(fixture);
        const saved = helperModule.buildSettingsSavePayload(fixture, defaults);
        expect(saved.keep).toBe(true);
        expect(saved.power_user.instruct.input_sequence).toBe('### Input:');
        expect(saved.power_user.instruct.output_sequence).toBe('### Response:');
        expect(saved.power_user.instruct.stop_sequence).toBe('</s>');
        expect(saved.power_user.context.story_string_depth).toBe(4);
        expect(saved.power_user.instruct.system_same_as_user).toBe(true);
    });

    test('keeps secrets out of settings JSON and retires the connection-profile picker', async () => {
        const routeSource = fs.readFileSync(path.join(repoRoot, 'app', 'components', 'settings', 'SettingsSurface.tsx'), 'utf8');
        const helperModule = await import(`../app/lib/settings-helpers.js?settingsSecrets=${Date.now()}-${Math.random()}`);
        const secretHelpers = await import(`../public/scripts/provider-secret-field-state.js?settingsSecrets=${Date.now()}-${Math.random()}`);

        expect(routeSource).not.toContain('vertexai_service_account_json');
        expect(routeSource).not.toContain('providers.connectionProfileId');
        expect(routeSource).not.toContain('getConnectionProfileOptions');
        expect(routeSource).not.toContain('emberdesk-settings-apply-connection-profile');
        expect(routeSource).toContain("fetch('/api/secrets/write'");

        const openaiKey = secretHelpers.resolveProviderSecretKeyForSettings({
            secretKey: 'api_key_openai',
        });
        expect(openaiKey).toBe('api_key_openai');

        const fixture = {
            oai_settings: {
                chat_completion_source: 'openai',
            },
            feature_settings: {
                connectionManager: {
                    selectedProfile: 'profile-1',
                    profiles: [
                        { id: 'profile-1', name: 'Home' },
                        { id: 'profile-2', name: 'Work' },
                    ],
                },
            },
            secrets_should_not_exist: 'x',
        };
        const defaults = helperModule.buildSettingsFormDefaults(fixture);
        expect(defaults.providers.connectionProfileId).toBeUndefined();

        // The stored profile selection is preserved untouched; React no longer edits it.
        const saved = helperModule.buildSettingsSavePayload(fixture, defaults);
        expect(saved.feature_settings.connectionManager.selectedProfile).toBe('profile-1');
        expect(JSON.stringify(saved)).not.toContain('BEGIN PRIVATE KEY');
        expect(JSON.stringify(saved)).not.toContain('vertexai_service_account_json');
        expect(helperModule.settingsCoverage.reactOwned.providers).not.toContain('feature_settings.connectionManager.selectedProfile');
    });

    test('keeps a conflict draft until an explicit reload and routes legacy settings toggles to React Settings', () => {
        const routeSource = fs.readFileSync(path.join(repoRoot, 'app', 'components', 'settings', 'SettingsSurface.tsx'), 'utf8');
        const pageRouteSource = fs.readFileSync(path.join(repoRoot, 'app', 'routes', 'settings.tsx'), 'utf8');
        const scriptSource = fs.readFileSync(path.join(repoRoot, 'public', 'script.js'), 'utf8');

        expect(routeSource).toContain('setHasRevisionConflict(true)');
        expect(routeSource).toContain('重新加载当前设置');
        expect(routeSource).toContain('disabled={isBusy || settingsQuery.isPending || isPristine || hasRevisionConflict}');
        // Legacy settings drawer toggles are deleted; no route-redirect listener remains.
        expect(scriptSource).not.toContain('LEGACY_SETTINGS_DRAWER_ROUTE_TARGETS');
        expect(scriptSource).toContain('openWorkspaceSettingsOverlay');
        expect(scriptSource).not.toContain("window.location.assign('/settings");
    });

    test('settings overlay exposes workspace drawer openers for legacy-owned panels', () => {
        const routeSource = fs.readFileSync(path.join(repoRoot, 'app', 'components', 'settings', 'SettingsSurface.tsx'), 'utf8');
        const indexHtml = fs.readFileSync(path.join(repoRoot, 'public', 'index.html'), 'utf8');
        const portSource = fs.readFileSync(path.join(repoRoot, 'app', 'compat', 'runtime-port.ts'), 'utf8');
        const providerSource = fs.readFileSync(path.join(repoRoot, 'public', 'scripts', 'react-runtime-provider.js'), 'utf8');
        const scriptSource = fs.readFileSync(path.join(repoRoot, 'public', 'script.js'), 'utf8');

        // Legacy-owned surfaces (preset CRUD, Prompt Manager,
        // user-settings extras) still render
        // inside workspace drawers that the shell no longer opens. Overlay links
        // reach them through the openWorkspaceDrawer runtime command, which
        // resolves to openWorkspaceChildSlotHostImmediate on the drawer host id.
        for (const target of [
            'left-nav-panel',
            'AdvancedFormatting',
            'user-settings-block',
        ]) {
            expect(routeSource).toContain(`'${target}'`);
            expect(indexHtml).toContain(`id="${target}" class="drawer-content`);
        }
        // The retired API Connections drawer is gone from both surfaces.
        expect(routeSource).not.toContain("'rm_api_block'");
        expect(indexHtml).not.toContain('id="rm_api_block"');

        expect(routeSource).toContain('runtime?.commands.openWorkspaceDrawer(link.target)');
        expect(routeSource).toContain('onRequestClose?.()');
        expect(routeSource).toContain('isOverlay');
        expect(portSource).toContain('openWorkspaceDrawer(hostId: string): Promise<void>');
        expect(providerSource).toContain("'openWorkspaceDrawer'");
        expect(scriptSource).toContain('openWorkspaceDrawer:');
        expect(scriptSource).toContain('openWorkspaceChildSlotHostImmediate');

        // The command is allowlisted so it cannot become generic "open any
        // element by id" DOM access for React callers.
        expect(scriptSource).toContain('WORKSPACE_DRAWER_COMMAND_HOST_IDS');
        expect(scriptSource).toContain('rejected unknown drawer host id');
        for (const target of [
            'left-nav-panel',
            'AdvancedFormatting',
            'user-settings-block',
        ]) {
            expect(scriptSource).toContain(`'${target}'`);
        }
        expect(scriptSource).not.toContain("'rm_api_block'");
    });

    test('redirects unauthenticated /settings requests to /login', async () => {
        const { app } = await createSettingsRouteApp({ isLoggedIn: false });

        await usingApp(app, async (url) => {
            const response = await fetch(`${url}/settings`, { redirect: 'manual' });
            expect(response.status).toBe(302);
            expect(response.headers.get('location')).toBe('/login');
        });
    }, 15000);

    test('returns a clear error when the React settings build is missing instead of falling back to the workspace', async () => {
        const missingRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-settings-missing-dist-'));
        tmpRoots.push(missingRoot);
        const { app, featureModule } = await createSettingsRouteApp({
            reactLoginDistRoot: missingRoot,
        });

        expect(featureModule.isReactSettingsEnabled()).toBe(true);

        await usingApp(app, async (url) => {
            const response = await fetch(`${url}/settings`, { redirect: 'manual' });
            expect(response.status).toBe(503);
            expect(await response.text()).toContain('React settings build is missing');
            expect(response.headers.get('location')).toBeNull();
        });
    });

    test('serves the React settings shell from /settings when the build exists', async () => {
        const distRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-settings-react-dist-'));
        const assetsRoot = path.join(distRoot, 'assets');
        tmpRoots.push(distRoot);
        fs.mkdirSync(assetsRoot, { recursive: true });
        fs.writeFileSync(path.join(distRoot, 'index.html'), [
            '<!DOCTYPE html>',
            '<html lang="zh-CN">',
            '<head>',
            '  <meta charset="UTF-8" />',
            '  <title>EmberDesk React Settings</title>',
            '  <script type="module" crossorigin src="/react/login/assets/settings.js"></script>',
            '</head>',
            '<body><div id="root"></div></body>',
            '</html>',
            '',
        ].join('\n'), 'utf8');
        fs.writeFileSync(path.join(assetsRoot, 'settings.js'), 'console.log("react settings");', 'utf8');

        const { app, featureModule } = await createSettingsRouteApp({ reactLoginDistRoot: distRoot });

        expect(featureModule.isReactSettingsEnabled()).toBe(true);

        await usingApp(app, async (url) => {
            const settingsResponse = await fetch(`${url}/settings`, { redirect: 'manual' });
            expect(settingsResponse.status).toBe(200);
            const settingsBody = await settingsResponse.text();
            expect(settingsBody).toContain('/react/login/assets/settings.js');

            const assetResponse = await fetch(`${url}/react/login/assets/settings.js`);
            expect(assetResponse.status).toBe(200);
            expect(assetResponse.headers.get('content-type')).toContain('text/javascript');
            expect(await assetResponse.text()).toContain('react settings');
        });
    });
});
