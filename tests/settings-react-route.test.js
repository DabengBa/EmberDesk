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

beforeAll(() => {
    fs.writeFileSync(configPath, [
        'enableUserAccounts: true',
        'features:',
        '  react:',
        '    pages:',
        '      login: false',
        '      setup: false',
        '      settings: false',
        '',
    ].join('\n'), 'utf8');
    setConfigFilePath(configPath);
});

afterEach(() => {
    delete process.env.EMBERDESK_FEATURES_REACT_PAGES_SETTINGS;
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

async function createSettingsRouteApp({ isLoggedIn = true } = {}) {
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
    app.get('/settings', usersModule.settingsPageMiddleware);
    app.use(basePathModule.REACT_LOGIN_BASE_PATH, middlewareModule.getReactLoginServeMiddleware());
    app.use(express.static(path.join(repoRoot, 'public'), {}));

    return { app, featureModule };
}

describe('settings React route flag', () => {
    test('wires the React settings route through TanStack Form, Query, and Zod while preserving untouched settings fields', async () => {
        const routeSource = fs.readFileSync(path.join(repoRoot, 'app', 'routes', 'settings.tsx'), 'utf8');
        const settingFieldSource = fs.readFileSync(path.join(repoRoot, 'app', 'components', 'settings', 'SettingField.tsx'), 'utf8');
        const helperModule = await import(`../app/lib/settings-helpers.js?settingsHelpers=${Date.now()}-${Math.random()}`);

        expect(routeSource).toContain("import { useForm, useStore } from '@tanstack/react-form';");
        expect(routeSource).toContain("import { useMutation, useQuery } from '@tanstack/react-query';");
        expect(routeSource).toContain("import { z } from 'zod';");
        expect(routeSource).toContain('const settingsQuery = useQuery(');
        expect(routeSource).toContain('const secretsQuery = useQuery(');
        expect(routeSource).toContain('const saveMutation = useMutation(');
        expect(routeSource).toContain('const settingsForm = useForm(');
        expect(routeSource).toContain('const settingsFormValues = useStore(settingsForm.store, state => state.values);');
        expect(routeSource).toContain('const settingsSchema = z.object(');
        expect(routeSource).toContain('settingsForm.reset(nextDefaults, { keepDefaultValues: true });');
        expect(routeSource).not.toContain('settingsForm.reset(nextDefaults);');
        expect(routeSource).toContain('<settingsForm.Subscribe');
        expect(routeSource).toContain('selector={state => state.isPristine}');
        expect(routeSource).toContain('disabled={isBusy || settingsQuery.isPending || isPristine}');
        expect(routeSource).toContain("className={activeTab === 'general' ? 'block' : 'hidden'}");
        expect(routeSource).toContain("className={activeTab === 'providers' ? 'block' : 'hidden'}");
        expect(routeSource).toContain("className={activeTab === 'userInterface' ? 'block' : 'hidden'}");
        expect(routeSource).toContain("className={activeTab === 'advanced' ? 'block' : 'hidden'}");
        expect(routeSource).toContain('name="general.enableWebSearch"');
        expect(routeSource).toContain('name="providers.fallbackProviderEnabled"');
        expect(routeSource).toContain('name="userInterface.customCss"');
        expect(routeSource).toContain('name="advanced.autoSwipe"');
        expect(routeSource).not.toContain("{activeTab === 'general' && (");
        expect(routeSource).not.toContain("{activeTab === 'providers' && (");
        expect(routeSource).not.toContain("{activeTab === 'userInterface' && (");
        expect(routeSource).not.toContain("{activeTab === 'advanced' && (");
        expect(routeSource).toContain("chatCompletionSource: z.enum(['openai', 'claude', 'makersuite']),");
        expect(routeSource).toContain('openaiModel: z.string(),');
        expect(routeSource).toContain('claudeModel: z.string(),');
        expect(routeSource).toContain('googleModel: z.string(),');
        expect(routeSource).toContain('theme: z.string(),');
        expect(routeSource).toContain('systemPromptName: z.string(),');
        expect(routeSource).toContain('systemPromptContent: z.string(),');
        expect(routeSource).toContain('contextPreset: z.string(),');
        expect(routeSource).toContain("fetch('/api/settings/get', {");
        expect(routeSource).toContain("fetch('/api/settings/save', {");
        expect(routeSource).toContain("fetch('/api/secrets/read', {");
        expect(routeSource).toContain("fetch('/api/secrets/write', {");
        expect(routeSource).toContain("fetch('/api/secrets/delete', {");
        expect(routeSource).toContain('saveProviderSecretField({');
        expect(routeSource).toContain('clearProviderSecretField({');
        expect(routeSource).toContain('const providerSource = settingsFormValues.providers.chatCompletionSource;');
        expect(routeSource).toContain('!settingsFormValues.providers.fallbackProviderEnabled');
        expect(routeSource).not.toContain('settingsForm.state.values.providers.fallbackProviderEnabled');
        expect(routeSource).toContain('const SAVE_STATUS_TIMEOUT_MS = 4000;');
        expect(routeSource).toContain("const [saveStatus, setSaveStatus] = useState<{ kind: 'success' | 'info'; message: string } | null>(null);");
        expect(routeSource).toContain('const [showDiagnostics, setShowDiagnostics] = useState(false);');
        expect(routeSource).toContain('window.setTimeout(() => {');
        expect(routeSource).toContain('setSaveStatus(null);');
        expect(routeSource).toContain("setSaveStatus({ kind: 'success', message: '设置已保存。' });");
        expect(routeSource).toContain('setSaveStatus({ kind:');
        expect(routeSource).toContain('Developer diagnostics');
        expect(routeSource).toContain('{showDiagnostics && (');
        expect(routeSource).toContain('onClick={() => setShowDiagnostics(value => !value)}');
        expect(routeSource).not.toContain('<h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-300">Coverage</h2>');
        expect(routeSource).not.toContain('<h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-300">Still Legacy-Owned</h2>');
        expect(routeSource).not.toContain('<h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-300">Payload Snapshot</h2>');
        expect(settingFieldSource).toContain("{variant !== 'toggle' && (");
        expect(settingFieldSource).toContain('getValueAtPath');
        expect(settingFieldSource).toContain('<form.Subscribe');
        expect(settingFieldSource).toContain('selector={(state: any) => getValueAtPath(state.values, name)}');
        expect(settingFieldSource).toContain('checked={Boolean(currentValue)}');
        expect(settingFieldSource).not.toContain('checked={Boolean(field.state.value)}');

        expect(helperModule.settingsTabDefinitions).toHaveLength(4);
        expect(helperModule.providerOptions).toEqual([
            { value: 'openai', label: 'OpenAI' },
            { value: 'claude', label: 'Claude' },
            { value: 'makersuite', label: 'Google' },
        ]);
        expect(helperModule.providerSecretKeyBySource.makersuite).toBe('api_key_makersuite');
        expect(helperModule.reasoningEffortOptions.map(option => option.value)).toEqual([
            'auto',
            'low',
            'medium',
            'high',
            'min',
            'max',
            'none',
            'minimal',
            'xhigh',
        ]);
        expect(helperModule.settingsCoverage.reactOwned.general).toContain('oai_settings.preset_settings_openai');
        expect(helperModule.settingsCoverage.reactOwned.general).toContain('oai_settings.enable_web_search');
        expect(helperModule.settingsCoverage.reactOwned.general).toContain('oai_settings.reasoning_effort');
        expect(helperModule.settingsCoverage.reactOwned.providers).toContain('oai_settings.chat_completion_source');
        expect(helperModule.settingsCoverage.reactOwned.providers).toContain('oai_settings.fallback_provider_enabled');
        expect(helperModule.settingsCoverage.reactOwned.providers).toContain('oai_settings.use_vertexai');
        expect(helperModule.settingsCoverage.reactOwned.userInterface).toContain('power_user.custom_css');
        expect(helperModule.settingsCoverage.reactOwned.advanced).toContain('power_user.auto_swipe');
        expect(helperModule.settingsCoverage.reactOwned.advanced).toContain('power_user.stscript.autocomplete.state');
        expect(helperModule.settingsCoverage.legacyOwned).toContain('world_info_settings');
        expect(helperModule.settingsCoverage.legacyOwned).toContain('extension_settings');
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
                    movingUI: true,
                    movingUIPreset: 'Default',
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
                    use_vertexai: true,
                    vertexai_auth_mode: 'express',
                    vertexai_region: 'europe-west4',
                    vertexai_express_project_id: 'my-project',
                    fallback_provider_enabled: true,
                    fallback_provider_base_url: 'https://fallback.example.com/v1',
                    fallback_provider_model: 'gpt-4.1-mini',
                    bind_preset_to_connection: false,
                },
            }),
        });

        expect(parsed.settings.power_user.theme).toBe('Dark Lite');

        const defaults = helperModule.buildSettingsFormDefaults(parsed.settings);
        expect(defaults.general.presetSettings).toBe('RecoveredRuins');
        expect(defaults.providers.openaiModel).toBe('gpt-4-turbo');
        expect(defaults.providers.claudeModel).toBe('claude-sonnet-4-5');
        expect(defaults.providers.googleModel).toBe('gemini-2.5-pro');
        expect(defaults.general.enableWebSearch).toBe(true);
        expect(defaults.providers.useVertexAi).toBe(true);
        expect(defaults.providers.fallbackProviderEnabled).toBe(true);
        expect(defaults.providers.fallbackProviderModel).toBe('gpt-4.1-mini');
        expect(defaults.userInterface.customCss).toBe('.chat { color: white; }');
        expect(defaults.advanced.autoSwipe).toBe(true);
        expect(defaults.advanced.stscriptAutocompleteFontScale).toBe(0.9);

        const merged = helperModule.buildSettingsSavePayload(parsed.settings, {
            general: {
                presetSettings: 'RecoveredRuins',
                openaiMaxContext: 8192,
                openaiMaxTokens: 512,
                streamOpenai: false,
                temperature: 0.8,
                frequencyPenalty: 0.2,
                presencePenalty: 0.3,
                topP: 0.95,
                topK: 20,
                enableWebSearch: false,
                functionCalling: false,
                showThoughts: false,
                reasoningEffort: 'high',
                continuePrefill: false,
                continuePostfix: '\n\n',
                squashSystemMessages: false,
                customPromptPostProcessing: 'strict_tools',
            },
            providers: {
                chatCompletionSource: 'claude',
                openaiModel: 'gpt-5.2',
                claudeModel: 'claude-sonnet-4-5',
                googleModel: 'gemini-2.5-flash',
                reverseProxy: 'https://proxy.example.com',
                proxyPassword: 'secret',
                customUrl: 'https://custom.example.com/v1',
                customIncludeBody: 'include',
                customExcludeBody: 'exclude',
                customIncludeHeaders: 'X-Test: 1',
                useVertexAi: false,
                vertexaiAuthMode: 'full',
                vertexaiRegion: 'asia-east1',
                vertexaiExpressProjectId: 'project-2',
                fallbackProviderEnabled: false,
                fallbackProviderBaseUrl: 'https://fallback2.example.com/v1',
                fallbackProviderModel: 'gpt-4.1',
                bindPresetToConnection: true,
            },
            userInterface: {
                theme: 'Solarized',
                chatWidth: 72,
                fontScale: 1.15,
                customCss: '.chat { color: gold; }',
                movingUI: false,
                movingUIPreset: 'Compact',
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
                instructEnabled: false,
                instructPreset: 'Creative',
                instructWrap: true,
                instructMacro: true,
                instructSequencesAsStopStrings: true,
                instructSkipExamples: false,
                instructBindToContext: false,
                instructActivationRegex: '/gpt/i',
                systemPromptName: 'Custom',
                systemPromptContent: 'Updated prompt',
                contextPreset: 'Story Rich',
                contextStoryString: 'Story 2',
                contextChatStart: 'Open',
                contextExampleSeparator: '---',
                contextUseStopStrings: true,
                contextNamesAsStopStrings: true,
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
        expect(merged.power_user.theme).toBe('Solarized');
        expect(merged.power_user.chat_width).toBe(72);
        expect(merged.power_user.font_scale).toBe(1.15);
        expect(merged.power_user.custom_stopping_strings).toBe('END');
        expect(merged.power_user.tokenizer).toBe(42);
        expect(merged.power_user.auto_continue.enabled).toBe(true);
        expect(merged.power_user.sysprompt.name).toBe('Custom');
        expect(merged.power_user.sysprompt.content).toBe('Updated prompt');
        expect(merged.power_user.context.preset).toBe('Story Rich');
        expect(merged.oai_settings.preset_settings_openai).toBe('RecoveredRuins');
        expect(merged.oai_settings.chat_completion_source).toBe('claude');
        expect(merged.oai_settings.openai_model).toBe('gpt-5.2');
        expect(merged.oai_settings.claude_model).toBe('claude-sonnet-4-5');
        expect(merged.oai_settings.google_model).toBe('gemini-2.5-flash');
        expect(merged.oai_settings.reverse_proxy).toBe('https://proxy.example.com');
        expect(merged.oai_settings.stream_openai).toBe(false);
        expect(merged.oai_settings.openai_max_context).toBe(8192);
        expect(merged.oai_settings.openai_max_tokens).toBe(512);
        expect(merged.oai_settings.enable_web_search).toBe(false);
        expect(merged.oai_settings.function_calling).toBe(false);
        expect(merged.oai_settings.reasoning_effort).toBe('high');
        expect(merged.oai_settings.use_vertexai).toBe(false);
        expect(merged.oai_settings.fallback_provider_enabled).toBe(false);
        expect(merged.power_user.custom_css).toBe('.chat { color: gold; }');
        expect(merged.power_user.movingUI).toBe(false);
        expect(merged.power_user.toastr_position).toBe('toast-bottom-right');
        expect(merged.power_user.auto_swipe).toBe(false);
        expect(merged.power_user.auto_swipe_blacklist).toEqual(['skip', 'retry']);
        expect(merged.power_user.instruct.enabled).toBe(false);
        expect(merged.power_user.instruct.skip_examples).toBe(false);
        expect(merged.power_user.sysprompt.post_history).toBe('later');
        expect(merged.power_user.reasoning.max_additions).toBe(1);
        expect(merged.power_user.stscript.autocomplete.state).toBe(1);
        expect(merged.power_user.stscript.parser.flags).toEqual({
            1: true,
            2: false,
        });
    });

    test('keeps legacy Vertex AI and advanced reasoning effort values saveable through the React form', async () => {
        const routeSource = fs.readFileSync(path.join(repoRoot, 'app', 'routes', 'settings.tsx'), 'utf8');
        const helperModule = await import(`../app/lib/settings-helpers.js?settingsCompat=${Date.now()}-${Math.random()}`);
        const parsed = helperModule.parseSettingsPayload({
            settings: JSON.stringify({
                untouched: { keep: true },
                oai_settings: {
                    chat_completion_source: 'vertexai',
                    google_model: 'gemini-2.5-pro',
                    vertexai_auth_mode: 'express',
                    vertexai_region: 'us-central1',
                    vertexai_express_project_id: 'existing-project',
                    reasoning_effort: 'minimal',
                },
            }),
        });

        const defaults = helperModule.buildSettingsFormDefaults(parsed.settings);
        expect(defaults.providers.chatCompletionSource).toBe('makersuite');
        expect(defaults.providers.useVertexAi).toBe(true);
        expect(defaults.general.reasoningEffort).toBe('minimal');

        const preserved = helperModule.buildSettingsSavePayload(parsed.settings, defaults);
        expect(preserved.untouched.keep).toBe(true);
        expect(preserved.oai_settings.chat_completion_source).toBe('vertexai');
        expect(preserved.oai_settings.use_vertexai).toBe(true);
        expect(preserved.oai_settings.reasoning_effort).toBe('minimal');

        const vertexDisabled = structuredClone(defaults);
        vertexDisabled.providers.useVertexAi = false;
        const downgradedToGoogle = helperModule.buildSettingsSavePayload(parsed.settings, vertexDisabled);
        expect(downgradedToGoogle.oai_settings.chat_completion_source).toBe('makersuite');
        expect(downgradedToGoogle.oai_settings.use_vertexai).toBe(false);

        expect(routeSource).toContain("reasoningEffort: z.enum(['auto', 'low', 'medium', 'high', 'min', 'max', 'none', 'minimal', 'xhigh']),");
    });

    test('redirects unauthenticated /settings requests to /login', async () => {
        const { app } = await createSettingsRouteApp({ isLoggedIn: false });

        await usingApp(app, async (url) => {
            const response = await fetch(`${url}/settings`, { redirect: 'manual' });
            expect(response.status).toBe(302);
            expect(response.headers.get('location')).toBe('/login');
        });
    }, 15000);

    test('keeps /settings on the legacy workspace entry when the React settings flag is disabled', async () => {
        const { app, featureModule } = await createSettingsRouteApp();

        expect(featureModule.isReactSettingsEnabled()).toBe(false);

        await usingApp(app, async (url) => {
            const response = await fetch(`${url}/settings`, { redirect: 'manual' });
            expect(response.status).toBe(302);
            expect(response.headers.get('location')).toBe('/');
        });
    });

    test('serves the React settings shell from /settings when the flag is enabled and the build exists', async () => {
        process.env.EMBERDESK_FEATURES_REACT_PAGES_SETTINGS = 'true';
        const distRoot = path.join(repoRoot, 'app', 'dist');
        const assetsRoot = path.join(distRoot, 'assets');
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

        const { app, featureModule } = await createSettingsRouteApp();

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
