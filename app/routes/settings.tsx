import { createFileRoute } from '@tanstack/react-router';
import { useForm, useStore } from '@tanstack/react-form';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { z } from 'zod';
import { hasFallbackProviderSettings } from '../../public/scripts/chat-generation-auto-recovery.js';
import {
    canUseDirectProviderSecret,
    clearProviderSecretField,
    getUnifiedKeyFieldState,
    resolveProviderSecretKeyForSettings,
    saveProviderSecretField,
} from '../../public/scripts/provider-secret-field-state.js';
import { SettingField } from '@/components/settings/SettingField';
import { SettingsSection } from '@/components/settings/SettingsSection';
import { SettingsTabs } from '@/components/settings/SettingsTabs';
import {
    avatarStyleOptions,
    buildSettingsFormDefaults,
    buildSettingsSavePayload,
    chatDisplayOptions,
    defaultSettingsFormValues,
    getProviderModelFieldConfig,
    getValueAtPath,
    parseSettingsPayload,
    promptPostProcessingOptions,
    providerOptions,
    providerSecretKeyBySource,
    reasoningEffortOptions,
    settingsCoverage,
    settingsTabDefinitions,
    toastPositionOptions,
    vertexAuthModeOptions,
} from '@/lib/settings-helpers.js';

export const Route = createFileRoute('/settings')({
    component: SettingsPage,
});

const SAVE_STATUS_TIMEOUT_MS = 4000;

const settingsSchema = z.object({
    general: z.object({
        presetSettings: z.string(),
        openaiMaxContext: z.number().int().min(1, 'Context 必须大于 0'),
        openaiMaxTokens: z.number().int().min(1, 'Max Response 必须大于 0'),
        streamOpenai: z.boolean(),
        temperature: z.number().min(0).max(2),
        frequencyPenalty: z.number().min(-2).max(2),
        presencePenalty: z.number().min(-2).max(2),
        topP: z.number().min(0).max(1),
        topK: z.number().int().min(0),
        enableWebSearch: z.boolean(),
        functionCalling: z.boolean(),
        showThoughts: z.boolean(),
        reasoningEffort: z.enum(['auto', 'low', 'medium', 'high', 'min', 'max', 'none', 'minimal', 'xhigh']),
        continuePrefill: z.boolean(),
        continuePostfix: z.string(),
        squashSystemMessages: z.boolean(),
        customPromptPostProcessing: z.string(),
    }),
    providers: z.object({
        chatCompletionSource: z.enum(['openai', 'claude', 'makersuite']),
        openaiModel: z.string(),
        claudeModel: z.string(),
        googleModel: z.string(),
        reverseProxy: z.string(),
        proxyPassword: z.string(),
        customUrl: z.string(),
        customIncludeBody: z.string(),
        customExcludeBody: z.string(),
        customIncludeHeaders: z.string(),
        useVertexAi: z.boolean(),
        vertexaiAuthMode: z.enum(['express', 'full']),
        vertexaiRegion: z.string(),
        vertexaiExpressProjectId: z.string(),
        fallbackProviderEnabled: z.boolean(),
        fallbackProviderBaseUrl: z.string(),
        fallbackProviderModel: z.string(),
        bindPresetToConnection: z.boolean(),
    }),
    userInterface: z.object({
        theme: z.string(),
        chatWidth: z.number().min(20, 'Chat Width 不能小于 20').max(100, 'Chat Width 不能大于 100'),
        fontScale: z.number().min(0.5, 'Font Scale 不能小于 0.5').max(2, 'Font Scale 不能大于 2'),
        customCss: z.string(),
        movingUI: z.boolean(),
        movingUIPreset: z.string(),
        fastUiMode: z.boolean(),
        reducedMotion: z.boolean(),
        noShadows: z.boolean(),
        toastrPosition: z.string(),
        avatarStyle: z.number().int().min(0).max(3),
        chatDisplay: z.number().int().min(0).max(2),
        timerEnabled: z.boolean(),
        timestampsEnabled: z.boolean(),
        timestampModelIcon: z.boolean(),
        mesIDDisplayEnabled: z.boolean(),
        hideChatAvatarsEnabled: z.boolean(),
        compactInputArea: z.boolean(),
    }),
    advanced: z.object({
        autoSwipe: z.boolean(),
        autoSwipeMinimumLength: z.number().int().min(0),
        autoSwipeBlacklist: z.string(),
        autoSwipeBlacklistThreshold: z.number().int().min(0),
        customStoppingStrings: z.string(),
        tokenizer: z.number().int().min(0, 'Tokenizer 值必须为非负整数'),
        customStoppingStringsMacro: z.boolean(),
        experimentalMacroEngine: z.boolean(),
        autoContinueEnabled: z.boolean(),
        autoContinueAllowChatCompletions: z.boolean(),
        autoContinueTargetLength: z.number().int().min(0),
        chatTruncation: z.number().int().min(0),
        streamingFps: z.number().int().min(1),
        smoothStreaming: z.boolean(),
        smoothStreamingNoThink: z.boolean(),
        smoothStreamingSpeed: z.number().int().min(0),
        streamFadeIn: z.boolean(),
        instructEnabled: z.boolean(),
        instructPreset: z.string(),
        instructWrap: z.boolean(),
        instructMacro: z.boolean(),
        instructSequencesAsStopStrings: z.boolean(),
        instructSkipExamples: z.boolean(),
        instructBindToContext: z.boolean(),
        instructActivationRegex: z.string(),
        systemPromptName: z.string(),
        systemPromptContent: z.string(),
        contextPreset: z.string(),
        contextStoryString: z.string(),
        contextChatStart: z.string(),
        contextExampleSeparator: z.string(),
        contextUseStopStrings: z.boolean(),
        contextNamesAsStopStrings: z.boolean(),
        syspromptEnabled: z.boolean(),
        syspromptPostHistory: z.string(),
        reasoningName: z.string(),
        reasoningAutoParse: z.boolean(),
        reasoningAddToPrompts: z.boolean(),
        reasoningAutoExpand: z.boolean(),
        reasoningShowHidden: z.boolean(),
        reasoningPrefix: z.string(),
        reasoningSuffix: z.string(),
        reasoningSeparator: z.string(),
        reasoningMaxAdditions: z.number().int().min(0),
        stscriptMatching: z.string(),
        stscriptAutocompleteState: z.number().int().min(0).max(2),
        stscriptAutocompleteAutoHide: z.boolean(),
        stscriptAutocompleteStyle: z.string(),
        stscriptAutocompleteSelect: z.number().int().min(0),
        stscriptAutocompleteShowInAllMacroFields: z.boolean(),
        stscriptAutocompleteFontScale: z.number().min(0.5).max(2),
        stscriptAutocompleteWidthLeft: z.number().int().min(0).max(2),
        stscriptAutocompleteWidthRight: z.number().int().min(0).max(2),
        stscriptParserFlagStrictEscaping: z.boolean(),
        stscriptParserFlagReplaceGetvar: z.boolean(),
    }),
});

class MessageError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'MessageError';
    }
}

function getSchemaErrorMessage(schema: z.ZodTypeAny, values: unknown) {
    const parsed = schema.safeParse(values);
    if (parsed.success) {
        return '设置保存失败。';
    }

    const flattenedErrors = Object.values(parsed.error.flatten().fieldErrors)
        .flat()
        .filter((message): message is string => typeof message === 'string' && message.length > 0);

    return flattenedErrors[0] ?? parsed.error.issues[0]?.message ?? '设置保存失败。';
}

async function readJsonObject(response: Response) {
    const data = await response.json().catch(() => ({}));
    return typeof data === 'object' && data !== null ? data as Record<string, any> : {};
}

function SettingsPage() {
    const [activeTab, setActiveTab] = useState(settingsTabDefinitions[0].id);
    const [pageError, setPageError] = useState('');
    const [saveStatus, setSaveStatus] = useState<{ kind: 'success' | 'info'; message: string } | null>(null);
    const [showDiagnostics, setShowDiagnostics] = useState(false);
    const [providerSecretInput, setProviderSecretInput] = useState('');
    const [fallbackSecretInput, setFallbackSecretInput] = useState('');

    const csrfTokenQuery = useQuery({
        queryKey: ['settings', 'csrf-token'],
        queryFn: async () => {
            const response = await fetch('/csrf-token');
            if (!response.ok) {
                throw new MessageError('无法获取 CSRF token。');
            }

            const data = await readJsonObject(response);
            if (typeof data.token !== 'string' || data.token.length === 0) {
                throw new MessageError('无法获取 CSRF token。');
            }

            return data.token;
        },
        retry: false,
        staleTime: Number.POSITIVE_INFINITY,
    });

    async function ensureCsrfToken() {
        if (typeof csrfTokenQuery.data === 'string' && csrfTokenQuery.data.length > 0) {
            return csrfTokenQuery.data;
        }

        const result = await csrfTokenQuery.refetch();
        if (typeof result.data === 'string' && result.data.length > 0) {
            return result.data;
        }

        throw result.error ?? new MessageError('无法获取 CSRF token。');
    }

    const settingsQuery = useQuery({
        queryKey: ['settings', 'page'],
        queryFn: async () => {
            const csrfToken = await ensureCsrfToken();
            const response = await fetch('/api/settings/get', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': csrfToken,
                },
                body: '{}',
            });

            if (!response.ok) {
                throw new MessageError('无法加载设置。');
            }

            return readJsonObject(response);
        },
        retry: false,
    });

    const secretsQuery = useQuery({
        queryKey: ['settings', 'provider-secrets'],
        queryFn: async () => {
            const csrfToken = await ensureCsrfToken();
            const response = await fetch('/api/secrets/read', {
                method: 'POST',
                headers: {
                    'X-CSRF-Token': csrfToken,
                },
            });

            if (!response.ok) {
                throw new MessageError('无法读取 provider secret 状态。');
            }

            return readJsonObject(response);
        },
        retry: false,
    });

    const parsedPayload = settingsQuery.data ? parseSettingsPayload(settingsQuery.data) : null;

    const settingsForm = useForm({
        canSubmitWhenInvalid: true,
        defaultValues: defaultSettingsFormValues,
        validators: {
            onChange: settingsSchema,
            onSubmit: settingsSchema,
        },
        onSubmitInvalid: ({ value }) => {
            setSaveStatus(null);
            setPageError(getSchemaErrorMessage(settingsSchema, value));
        },
        onSubmit: async ({ value }) => {
            if (!parsedPayload) {
                setPageError('设置尚未加载完成。');
                return;
            }

            setPageError('');
            setSaveStatus(null);

            try {
                await saveMutation.mutateAsync(value);
            } catch (error) {
                setSaveStatus(null);
                setPageError(error instanceof Error ? error.message : String(error));
            }
        },
    });

    const settingsFormValues = useStore(settingsForm.store, state => state.values);

    const saveMutation = useMutation({
        mutationFn: async (values: typeof defaultSettingsFormValues) => {
            if (!parsedPayload) {
                throw new MessageError('设置尚未加载完成。');
            }

            const csrfToken = await ensureCsrfToken();
            const payload = buildSettingsSavePayload(parsedPayload.settings, values);
            const response = await fetch('/api/settings/save', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': csrfToken,
                },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                throw new MessageError('设置保存失败。');
            }

            await settingsQuery.refetch();
            setSaveStatus({ kind: 'success', message: '设置已保存。' });
            return payload;
        },
        retry: false,
    });

    const providerSource = settingsFormValues.providers.chatCompletionSource;
    const providerModelField = useMemo(() => getProviderModelFieldConfig(providerSource), [providerSource]);
    const providerSettingsSnapshot = ((parsedPayload
        ? getValueAtPath(parsedPayload.settings, 'oai_settings')
        : undefined) as Record<string, any> | undefined) ?? {};
    const providerSecretKey = providerSecretKeyBySource[providerSource as keyof typeof providerSecretKeyBySource] ?? null;
    const currentSecretKey = resolveProviderSecretKeyForSettings({
        settings: {
            reverse_proxy: settingsFormValues.providers.reverseProxy,
            use_vertexai: settingsFormValues.providers.useVertexAi,
            vertexai_auth_mode: settingsFormValues.providers.vertexaiAuthMode,
        },
        source: providerSource,
        secretKey: providerSecretKey,
        chatCompletionSources: {
            OPENAI: 'openai',
            CLAUDE: 'claude',
            MAKERSUITE: 'makersuite',
        },
    });
    const fallbackSecretKey = 'api_key_openai_fallback';

    const unifiedKeyFieldState = getUnifiedKeyFieldState({
        settings: {
            ...providerSettingsSnapshot,
            reverse_proxy: settingsFormValues.providers.reverseProxy,
            proxy_password: settingsFormValues.providers.proxyPassword,
            use_vertexai: settingsFormValues.providers.useVertexAi,
            vertexai_auth_mode: settingsFormValues.providers.vertexaiAuthMode,
        },
        source: providerSource,
        secretKey: currentSecretKey,
        secretState: secretsQuery.data,
        chatCompletionSources: {
            OPENAI: 'openai',
            CLAUDE: 'claude',
            MAKERSUITE: 'makersuite',
        },
    });

    const directSecretMode = canUseDirectProviderSecret({
        settings: {
            reverse_proxy: settingsFormValues.providers.reverseProxy,
        },
        secretKey: currentSecretKey,
    });
    const vertexAiFullMode = providerSource === 'makersuite'
        && settingsFormValues.providers.useVertexAi
        && settingsFormValues.providers.vertexaiAuthMode === 'full';
    const fallbackProviderReady = hasFallbackProviderSettings({
        fallback_provider_enabled: settingsFormValues.providers.fallbackProviderEnabled,
        fallback_provider_base_url: settingsFormValues.providers.fallbackProviderBaseUrl,
        fallback_provider_model: settingsFormValues.providers.fallbackProviderModel,
    }, secretsQuery.data, fallbackSecretKey);

    const providerSecretMutation = useMutation({
        mutationFn: async (options: { key: string; value: string; mode: 'save' | 'clear' }) => {
            if (options.mode === 'save') {
                const result = await saveProviderSecretField({
                    key: options.key,
                    value: options.value,
                    writeSecret: async (key: string, value: string) => {
                        const csrfToken = await ensureCsrfToken();
                        const response = await fetch('/api/secrets/write', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'X-CSRF-Token': csrfToken,
                            },
                            body: JSON.stringify({
                                key,
                                value,
                                label: 'React Settings',
                            }),
                        });

                        if (!response.ok) {
                            return null;
                        }

                        const data = await readJsonObject(response);
                        return typeof data.id === 'string' ? data.id : null;
                    },
                });

                if (result.status === 'failed') {
                    throw new MessageError('Provider API key 保存失败。');
                }

                if (result.status === 'empty') {
                    throw new MessageError('请输入 API key 后再保存。');
                }

                return result;
            }

            return clearProviderSecretField({
                key: options.key,
                deleteSecret: async (key: string) => {
                    const csrfToken = await ensureCsrfToken();
                    const response = await fetch('/api/secrets/delete', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-CSRF-Token': csrfToken,
                        },
                        body: JSON.stringify({ key }),
                    });

                    if (!response.ok) {
                        throw new MessageError('Provider API key 清除失败。');
                    }
                },
            });
        },
        retry: false,
    });

    useEffect(() => {
        if (!parsedPayload) {
            return;
        }

        const nextDefaults = buildSettingsFormDefaults(parsedPayload.settings);
        settingsForm.reset(nextDefaults, { keepDefaultValues: true });
        setPageError('');
    }, [parsedPayload?.rawSettings]);

    useEffect(() => {
        if (!saveStatus) {
            return;
        }

        const timeoutId = window.setTimeout(() => {
            setSaveStatus(null);
        }, SAVE_STATUS_TIMEOUT_MS);

        return () => window.clearTimeout(timeoutId);
    }, [saveStatus]);

    const payloadSummary = useMemo(() => {
        if (!settingsQuery.data) {
            return [];
        }

        return [
            { label: 'Themes', value: Array.isArray(settingsQuery.data.themes) ? settingsQuery.data.themes.length : 0 },
            { label: 'OpenAI Presets', value: Array.isArray(settingsQuery.data.openai_setting_names) ? settingsQuery.data.openai_setting_names.length : 0 },
            { label: 'Context Presets', value: Array.isArray(settingsQuery.data.context) ? settingsQuery.data.context.length : 0 },
        ];
    }, [settingsQuery.data]);

    const isBusy = settingsQuery.isPending || saveMutation.isPending || secretsQuery.isPending || providerSecretMutation.isPending;

    function clearTransientState() {
        saveMutation.reset();
        setSaveStatus(null);
        setPageError('');
    }

    async function handleProviderSecretAction(options: {
        key: string;
        mode: 'save' | 'clear';
        value: string;
        successMessage: string;
        clearInput: () => void;
    }) {
        setPageError('');
        setSaveStatus(null);

        try {
            const result = await providerSecretMutation.mutateAsync({
                key: options.key,
                mode: options.mode,
                value: options.value,
            });

            await secretsQuery.refetch();
            if (result.shouldClearInput) {
                options.clearInput();
            }
            setSaveStatus({ kind: 'info', message: options.successMessage });
        } catch (error) {
            setPageError(error instanceof Error ? error.message : String(error));
        }
    }

    const activeFallbackStatus = settingsFormValues.providers.fallbackProviderEnabled
        ? (fallbackProviderReady ? 'Ready' : 'Needs setup')
        : 'Disabled';

    return (
        <main className="min-h-dvh bg-zinc-950 text-zinc-100">
            <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 lg:flex-row lg:px-6">
                <section className="flex-1 rounded-lg border border-zinc-800 bg-zinc-950/80 p-6 shadow-2xl shadow-black/20">
                    <header className="mb-6 space-y-2">
                        <p className="text-sm font-medium uppercase tracking-[0.2em] text-emerald-300">Settings</p>
                        <h1 className="text-3xl font-semibold text-zinc-50">React settings entry</h1>
                        <p className="max-w-3xl text-sm leading-6 text-zinc-400">
                            这个页面现在收口 Sprint 3 的主设置链路：General 里的默认生成行为，Providers 里的 fallback 与 Vertex AI，User Interface 里的主题和显示偏好，以及 Advanced 里的模板、auto-swipe 与 STscript 基础设置。
                        </p>
                    </header>

                    <SettingsTabs tabs={settingsTabDefinitions} activeTab={activeTab} onChange={setActiveTab} />

                    <div className="mt-6 space-y-4">
                        {settingsQuery.isPending && (
                            <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 text-sm text-zinc-300">
                                正在加载当前 settings payload...
                            </div>
                        )}

                        {pageError && (
                            <div className="rounded-lg border border-rose-400/30 bg-rose-500/10 p-4 text-sm text-rose-200">
                                {pageError}
                            </div>
                        )}

                        {saveStatus && (
                            <div
                                className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200"
                                role="status"
                                aria-live="polite"
                            >
                                {saveStatus.message}
                            </div>
                        )}

                        <form
                            className="space-y-4"
                            onSubmit={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                void settingsForm.handleSubmit();
                            }}
                        >
                            <div className={activeTab === 'general' ? 'block' : 'hidden'}>
                                <SettingsSection
                                    title="Generation Defaults"
                                    description="主 chat-completion path 的上下文、采样、reasoning 和 continue 行为。"
                                >
                                    <SettingField
                                        form={settingsForm}
                                        name="general.presetSettings"
                                        label="Preset"
                                        description="当前默认的 chat-completion preset 名称。"
                                        placeholder="RecoveredRuins"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="general.openaiMaxContext"
                                        label="Context"
                                        description="默认上下文窗口大小。"
                                        variant="number"
                                        min={1}
                                        step={1}
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="general.openaiMaxTokens"
                                        label="Max Response"
                                        description="默认最大输出 token。"
                                        variant="number"
                                        min={1}
                                        step={1}
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="general.temperature"
                                        label="Temperature"
                                        description="控制输出随机性。"
                                        variant="number"
                                        min={0}
                                        max={2}
                                        step={0.05}
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="general.topP"
                                        label="Top P"
                                        description="核采样概率阈值。"
                                        variant="number"
                                        min={0}
                                        max={1}
                                        step={0.01}
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="general.topK"
                                        label="Top K"
                                        description="限制候选 token 数量。"
                                        variant="number"
                                        min={0}
                                        step={1}
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="general.frequencyPenalty"
                                        label="Frequency Penalty"
                                        description="减少重复输出。"
                                        variant="number"
                                        min={-2}
                                        max={2}
                                        step={0.05}
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="general.presencePenalty"
                                        label="Presence Penalty"
                                        description="鼓励引入新内容。"
                                        variant="number"
                                        min={-2}
                                        max={2}
                                        step={0.05}
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="general.reasoningEffort"
                                        label="Reasoning Effort"
                                        description="给支持该能力的模型指定 reasoning effort。"
                                        variant="select"
                                        options={reasoningEffortOptions}
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="general.continuePostfix"
                                        label="Continue Postfix"
                                        description="continue 追加时使用的后缀。"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="general.streamOpenai"
                                        label="Streaming"
                                        description="控制当前 chat-completion path 是否默认流式输出。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="general.enableWebSearch"
                                        label="Web Search"
                                        description="允许模型请求 web search。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="general.functionCalling"
                                        label="Function Calling"
                                        description="启用 tool/function calling。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="general.showThoughts"
                                        label="Show Thoughts"
                                        description="显示模型 reasoning / thoughts。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="general.continuePrefill"
                                        label="Continue Prefill"
                                        description="continue 时启用 assistant prefill。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="general.squashSystemMessages"
                                        label="Squash System Messages"
                                        description="发送前折叠多条 system prompt。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="general.customPromptPostProcessing"
                                        label="Prompt Post-Processing"
                                        description="在发送到 API 前对 prompt 做额外整理。"
                                        variant="select"
                                        options={promptPostProcessingOptions}
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                </SettingsSection>
                            </div>

                            <div className={activeTab === 'providers' ? 'block' : 'hidden'}>
                                <SettingsSection
                                    title="Provider Routing"
                                    description="主 provider 路由、fallback provider、Vertex AI 和自定义连接字段。"
                                >
                                    <SettingField
                                        form={settingsForm}
                                        name="providers.chatCompletionSource"
                                        label="Provider"
                                        description="当前默认 chat-completion provider。"
                                        variant="select"
                                        options={providerOptions}
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name={providerModelField.name}
                                        label="Model"
                                        description={providerModelField.description}
                                        placeholder={providerModelField.placeholder}
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="providers.reverseProxy"
                                        label="Base URL / Reverse Proxy"
                                        description="代理模式下的 Base URL。"
                                        placeholder="https://proxy.example.com"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="providers.proxyPassword"
                                        label="Proxy Password"
                                        description="reverse proxy 模式下使用的网关密码。"
                                        placeholder="Proxy password"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="providers.customUrl"
                                        label="Custom URL"
                                        description="OpenAI-compatible 自定义 endpoint。"
                                        placeholder="https://custom.example.com/v1"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="providers.customIncludeHeaders"
                                        label="Custom Headers"
                                        description="发送到自定义 endpoint 的附加 headers。"
                                        placeholder="X-Test: 1"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="providers.customIncludeBody"
                                        label="Custom Body Include"
                                        description="合并到请求体的额外字段。"
                                        placeholder='{"foo":"bar"}'
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="providers.customExcludeBody"
                                        label="Custom Body Exclude"
                                        description="从请求体排除的字段。"
                                        placeholder="temperature,top_p"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="providers.useVertexAi"
                                        label="Use Vertex AI"
                                        description="Google provider 使用 Vertex AI 模式。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="providers.vertexaiAuthMode"
                                        label="Vertex Auth Mode"
                                        description="Express key 或 service account。"
                                        variant="select"
                                        options={vertexAuthModeOptions}
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="providers.vertexaiRegion"
                                        label="Vertex Region"
                                        description="Vertex AI region。"
                                        placeholder="us-central1"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="providers.vertexaiExpressProjectId"
                                        label="Vertex Express Project"
                                        description="Express 模式下的 project id。"
                                        placeholder="my-gcp-project"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="providers.bindPresetToConnection"
                                        label="Bind Preset To Connection"
                                        description="切换连接时自动绑定 preset。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="providers.fallbackProviderEnabled"
                                        label="Fallback Provider"
                                        description="启用 OpenAI-compatible fallback provider。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="providers.fallbackProviderBaseUrl"
                                        label="Fallback Base URL"
                                        description="Fallback provider endpoint。"
                                        placeholder="https://api.openai.com/v1"
                                        disabled={isBusy || !settingsFormValues.providers.fallbackProviderEnabled}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="providers.fallbackProviderModel"
                                        label="Fallback Model"
                                        description="Fallback provider 使用的模型。"
                                        placeholder="gpt-4.1-mini"
                                        disabled={isBusy || !settingsFormValues.providers.fallbackProviderEnabled}
                                        onValueChange={clearTransientState}
                                    />
                                    <div className="md:col-span-2 rounded-lg border border-zinc-800 bg-zinc-900/70 p-4">
                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                            <div className="space-y-1">
                                                <h3 className="text-sm font-medium text-zinc-100">Provider API Key</h3>
                                                <p className="text-sm text-zinc-400">
                                                    Direct provider mode 下通过 `/api/secrets/*` 保存和清除 API key，不把 secret 写入普通 settings 保存流。
                                                </p>
                                            </div>
                                            <span className="rounded-md border border-zinc-800 px-2 py-1 text-xs text-zinc-300">
                                                {unifiedKeyFieldState.placeholder}
                                            </span>
                                        </div>

                                        {directSecretMode ? (
                                            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                                                <input
                                                    type="password"
                                                    id="provider-secret-input"
                                                    name="provider-secret-input"
                                                    aria-label="Provider API Key"
                                                    className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-500 focus:border-emerald-400"
                                                    placeholder={unifiedKeyFieldState.placeholder}
                                                    value={providerSecretInput}
                                                    disabled={providerSecretMutation.isPending}
                                                    onChange={event => {
                                                        setProviderSecretInput(event.target.value);
                                                        setSaveStatus(null);
                                                        setPageError('');
                                                    }}
                                                />
                                                <button
                                                    type="button"
                                                    className="inline-flex items-center justify-center rounded-md bg-emerald-400 px-4 py-2 text-sm font-medium text-zinc-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
                                                    disabled={providerSecretMutation.isPending}
                                                    onClick={() => {
                                                        if (!currentSecretKey) {
                                                            return;
                                                        }
                                                        void handleProviderSecretAction({
                                                            key: currentSecretKey,
                                                            mode: 'save',
                                                            value: providerSecretInput,
                                                            successMessage: 'Provider API key 已保存。',
                                                            clearInput: () => setProviderSecretInput(''),
                                                        });
                                                    }}
                                                >
                                                    保存 Key
                                                </button>
                                                <button
                                                    type="button"
                                                    className="inline-flex items-center justify-center rounded-md border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-200 transition hover:border-zinc-600 hover:text-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
                                                    disabled={providerSecretMutation.isPending}
                                                    onClick={() => {
                                                        if (!currentSecretKey) {
                                                            return;
                                                        }
                                                        void handleProviderSecretAction({
                                                            key: currentSecretKey,
                                                            mode: 'clear',
                                                            value: '',
                                                            successMessage: 'Provider API key 已清除。',
                                                            clearInput: () => setProviderSecretInput(''),
                                                        });
                                                    }}
                                                >
                                                    清除 Key
                                                </button>
                                            </div>
                                        ) : (
                                            <p className="mt-4 text-sm text-zinc-400">
                                                {vertexAiFullMode
                                                    ? '当前 Google provider 处于 Vertex AI Service Account 模式。service account JSON 仍由 legacy API Configuration 管理，React 不会把它映射成普通 API key。'
                                                    : unifiedKeyFieldState.vertexAiActive
                                                        ? '当前 Google provider 处于 Vertex AI Express 模式。Express key 会继续走 secrets 存储；service account JSON 仍留在 legacy API Configuration。'
                                                        : '当前启用了 reverse proxy。这个模式下统一 key 是 proxy password，因此 React 只在 direct provider 模式下接入 `/api/secrets/*`。'}
                                            </p>
                                        )}
                                    </div>

                                    <div className="md:col-span-2 rounded-lg border border-zinc-800 bg-zinc-900/70 p-4">
                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                            <div className="space-y-1">
                                                <h3 className="text-sm font-medium text-zinc-100">Fallback Provider Secret</h3>
                                                <p className="text-sm text-zinc-400">
                                                    Fallback provider 的 key 继续使用独立的 server-side secret。
                                                </p>
                                            </div>
                                            <span className="rounded-md border border-zinc-800 px-2 py-1 text-xs text-zinc-300">
                                                {activeFallbackStatus}
                                            </span>
                                        </div>
                                        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                                            <input
                                                type="password"
                                                id="fallback-provider-secret-input"
                                                name="fallback-provider-secret-input"
                                                aria-label="Fallback Provider API Key"
                                                className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-500 focus:border-emerald-400"
                                                placeholder="Fallback API Key"
                                                value={fallbackSecretInput}
                                                disabled={providerSecretMutation.isPending || !settingsFormValues.providers.fallbackProviderEnabled}
                                                onChange={event => {
                                                    setFallbackSecretInput(event.target.value);
                                                    setSaveStatus(null);
                                                    setPageError('');
                                                }}
                                            />
                                            <button
                                                type="button"
                                                className="inline-flex items-center justify-center rounded-md bg-emerald-400 px-4 py-2 text-sm font-medium text-zinc-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
                                                disabled={providerSecretMutation.isPending || !settingsFormValues.providers.fallbackProviderEnabled}
                                                onClick={() => {
                                                    void handleProviderSecretAction({
                                                        key: fallbackSecretKey,
                                                        mode: 'save',
                                                        value: fallbackSecretInput,
                                                        successMessage: 'Fallback provider API key 已保存。',
                                                        clearInput: () => setFallbackSecretInput(''),
                                                    });
                                                }}
                                            >
                                                保存 Fallback Key
                                            </button>
                                            <button
                                                type="button"
                                                className="inline-flex items-center justify-center rounded-md border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-200 transition hover:border-zinc-600 hover:text-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
                                                disabled={providerSecretMutation.isPending || !settingsFormValues.providers.fallbackProviderEnabled}
                                                onClick={() => {
                                                    void handleProviderSecretAction({
                                                        key: fallbackSecretKey,
                                                        mode: 'clear',
                                                        value: '',
                                                        successMessage: 'Fallback provider API key 已清除。',
                                                        clearInput: () => setFallbackSecretInput(''),
                                                    });
                                                }}
                                            >
                                                清除 Fallback Key
                                            </button>
                                        </div>
                                    </div>
                                </SettingsSection>
                            </div>

                            <div className={activeTab === 'userInterface' ? 'block' : 'hidden'}>
                                <SettingsSection
                                    title="Workspace Preferences"
                                    description="主题、布局、通知位置以及聊天显示密度。"
                                >
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.theme"
                                        label="Theme"
                                        description="当前 theme preset 名称。"
                                        placeholder="Dark Lite"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.chatWidth"
                                        label="Chat Width"
                                        description="聊天区域宽度百分比。"
                                        variant="number"
                                        min={20}
                                        max={100}
                                        step={1}
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.fontScale"
                                        label="Font Scale"
                                        description="聊天正文默认字号缩放。"
                                        variant="number"
                                        min={0.5}
                                        max={2}
                                        step={0.05}
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.toastrPosition"
                                        label="Notification Position"
                                        description="toast 通知的默认出现位置。"
                                        variant="select"
                                        options={toastPositionOptions}
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.avatarStyle"
                                        label="Avatar Style"
                                        description="角色头像的展示样式。"
                                        variant="select"
                                        selectValueType="number"
                                        options={avatarStyleOptions}
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.chatDisplay"
                                        label="Chat Display"
                                        description="消息气泡的布局模式。"
                                        variant="select"
                                        selectValueType="number"
                                        options={chatDisplayOptions}
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.customCss"
                                        label="Custom CSS"
                                        description="应用到整套 UI 的自定义 CSS。"
                                        variant="textarea"
                                        placeholder=".chat { color: white; }"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.movingUIPreset"
                                        label="MovingUI Preset"
                                        description="当前激活的 MovingUI preset 名称。"
                                        placeholder="Default"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.fastUiMode"
                                        label="Fast UI Mode"
                                        description="去除大部分 blur，换取更快渲染。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.movingUI"
                                        label="MovingUI"
                                        description="允许拖拽和重排部分桌面 UI。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.reducedMotion"
                                        label="Reduced Motion"
                                        description="减少动画与过渡效果。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.noShadows"
                                        label="No Text Shadows"
                                        description="去除文本阴影。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.timerEnabled"
                                        label="Message Timer"
                                        description="显示消息计时器。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.timestampsEnabled"
                                        label="Timestamps"
                                        description="显示消息时间戳。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.timestampModelIcon"
                                        label="Model Icons"
                                        description="在时间戳旁显示模型图标。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.mesIDDisplayEnabled"
                                        label="Message Numbers"
                                        description="显示消息编号。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.hideChatAvatarsEnabled"
                                        label="Hide Chat Avatars"
                                        description="隐藏聊天区头像。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.compactInputArea"
                                        label="Compact Input Area"
                                        description="使用更紧凑的输入区域。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                </SettingsSection>
                            </div>

                            <div className={activeTab === 'advanced' ? 'block' : 'hidden'}>
                                <SettingsSection
                                    title="Prompt, Templates, And Power-User Controls"
                                    description="模板、stop strings、tokenizer、auto-swipe、auto-continue 和 STscript 设置。"
                                >
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.systemPromptName"
                                        label="System Prompt Name"
                                        description="当前默认 system prompt preset 名称。"
                                        placeholder="Neutral - Chat"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.systemPromptContent"
                                        label="System Prompt Content"
                                        description="默认 system prompt 正文。"
                                        variant="textarea"
                                        placeholder="Write {{char}}'s next reply..."
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.contextPreset"
                                        label="Context Preset"
                                        description="当前上下文模板 preset 名称。"
                                        placeholder="Default"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.contextStoryString"
                                        label="Context Story String"
                                        description="上下文模板的 story string。"
                                        variant="textarea"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.contextChatStart"
                                        label="Context Chat Start"
                                        description="上下文模板里的 chat start 文本。"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.contextExampleSeparator"
                                        label="Example Separator"
                                        description="上下文模板里的 example separator。"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.instructPreset"
                                        label="Instruct Preset"
                                        description="当前 instruct 模板 preset 名称。"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.instructActivationRegex"
                                        label="Instruct Activation Regex"
                                        description="模型名匹配该正则时自动启用 instruct preset。"
                                        placeholder="/llama/i"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.reasoningName"
                                        label="Reasoning Template"
                                        description="当前 reasoning template 名称。"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.reasoningPrefix"
                                        label="Reasoning Prefix"
                                        description="reasoning block 前缀。"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.reasoningSuffix"
                                        label="Reasoning Suffix"
                                        description="reasoning block 后缀。"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.reasoningSeparator"
                                        label="Reasoning Separator"
                                        description="reasoning 与正文之间的分隔。"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.reasoningMaxAdditions"
                                        label="Reasoning Max Additions"
                                        description="单次 prompt 中最多附加多少 reasoning blocks。"
                                        variant="number"
                                        min={0}
                                        step={1}
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.customStoppingStrings"
                                        label="Custom Stopping Strings"
                                        description="stop strings 的原始字符串表示。"
                                        variant="textarea"
                                        placeholder='["END"]'
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.tokenizer"
                                        label="Tokenizer"
                                        description="保留 legacy numeric tokenizer ID。"
                                        variant="number"
                                        min={0}
                                        step={1}
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.autoSwipeMinimumLength"
                                        label="Auto-Swipe Min Length"
                                        description="短于该长度的回复会触发 auto-swipe。"
                                        variant="number"
                                        min={0}
                                        step={1}
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.autoSwipeBlacklist"
                                        label="Auto-Swipe Blacklist"
                                        description="逗号分隔的黑名单词条。"
                                        variant="textarea"
                                        placeholder="bad, retry"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.autoSwipeBlacklistThreshold"
                                        label="Auto-Swipe Threshold"
                                        description="至少命中多少次黑名单才触发 auto-swipe。"
                                        variant="number"
                                        min={0}
                                        step={1}
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.autoContinueTargetLength"
                                        label="Auto-Continue Target"
                                        description="auto-continue 目标长度。"
                                        variant="number"
                                        min={0}
                                        step={1}
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.chatTruncation"
                                        label="Messages To Load"
                                        description="默认加载的消息数量。"
                                        variant="number"
                                        min={0}
                                        step={1}
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.streamingFps"
                                        label="Streaming FPS"
                                        description="流式更新的帧率。"
                                        variant="number"
                                        min={1}
                                        step={1}
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.smoothStreamingSpeed"
                                        label="Smooth Streaming Speed"
                                        description="smooth streaming 的速度值。"
                                        variant="number"
                                        min={0}
                                        step={1}
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.stscriptMatching"
                                        label="STscript Matching"
                                        description="STscript autocomplete 的匹配模式。"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.stscriptAutocompleteState"
                                        label="STscript Autocomplete State"
                                        description="0=disabled, 1=min length, 2=always。"
                                        variant="number"
                                        min={0}
                                        max={2}
                                        step={1}
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.stscriptAutocompleteStyle"
                                        label="STscript Autocomplete Style"
                                        description="autocomplete 面板样式。"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.stscriptAutocompleteSelect"
                                        label="STscript Select Keys"
                                        description="用于选择 autocomplete 项的 key mask。"
                                        variant="number"
                                        min={0}
                                        step={1}
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.stscriptAutocompleteFontScale"
                                        label="STscript Font Scale"
                                        description="autocomplete 字号缩放。"
                                        variant="number"
                                        min={0.5}
                                        max={2}
                                        step={0.01}
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.stscriptAutocompleteWidthLeft"
                                        label="STscript Width Left"
                                        description="左侧 autocomplete 宽度档位。"
                                        variant="number"
                                        min={0}
                                        max={2}
                                        step={1}
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.stscriptAutocompleteWidthRight"
                                        label="STscript Width Right"
                                        description="右侧 autocomplete 宽度档位。"
                                        variant="number"
                                        min={0}
                                        max={2}
                                        step={1}
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.autoSwipe"
                                        label="Auto-Swipe"
                                        description="启用 auto-swipe。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.customStoppingStringsMacro"
                                        label="Stop Strings Macro"
                                        description="允许在 stop strings 中展开 macro。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.experimentalMacroEngine"
                                        label="Experimental Macro Engine"
                                        description="使用新的 macro engine。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.autoContinueEnabled"
                                        label="Auto-Continue"
                                        description="达到目标长度前自动继续生成。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.autoContinueAllowChatCompletions"
                                        label="Allow Auto-Continue On Chat Completions"
                                        description="允许 chat-completion path 使用 auto-continue。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.instructEnabled"
                                        label="Instruct Enabled"
                                        description="启用 instruct 模式。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.instructWrap"
                                        label="Instruct Wrap"
                                        description="启用 instruct wrap。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.instructMacro"
                                        label="Instruct Macro"
                                        description="在 instruct 模板中启用 macro。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.instructSequencesAsStopStrings"
                                        label="Instruct Sequences As Stop Strings"
                                        description="将 instruct sequences 作为 stop strings。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.instructSkipExamples"
                                        label="Instruct Skip Examples"
                                        description="启用 instruct 时跳过 example messages。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.instructBindToContext"
                                        label="Bind Instruct To Context"
                                        description="按 instruct preset 绑定 context preset。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.contextUseStopStrings"
                                        label="Context Use Stop Strings"
                                        description="上下文模板注入时启用 stop strings。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.contextNamesAsStopStrings"
                                        label="Context Names As Stop Strings"
                                        description="把角色名也作为 stop strings。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.syspromptEnabled"
                                        label="System Prompt Enabled"
                                        description="启用 system prompt。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.syspromptPostHistory"
                                        label="System Prompt Post-History"
                                        description="system prompt 的 post-history 文本。"
                                        variant="textarea"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.reasoningAutoParse"
                                        label="Reasoning Auto Parse"
                                        description="自动从回复中解析 reasoning block。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.reasoningAddToPrompts"
                                        label="Reasoning Add To Prompts"
                                        description="把已有 reasoning block 回填进后续 prompt。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.reasoningAutoExpand"
                                        label="Reasoning Auto Expand"
                                        description="自动展开 reasoning block。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.reasoningShowHidden"
                                        label="Reasoning Show Hidden"
                                        description="显示隐藏 reasoning 的时长信息。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.smoothStreaming"
                                        label="Smooth Streaming"
                                        description="启用 smooth streaming。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.smoothStreamingNoThink"
                                        label="Smooth Streaming No Think"
                                        description="在 reasoning block 中绕过 smooth streaming。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.streamFadeIn"
                                        label="Stream Fade In"
                                        description="启用流式文字淡入。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.stscriptAutocompleteAutoHide"
                                        label="STscript Auto-Hide"
                                        description="autocomplete 在失焦时自动隐藏。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.stscriptAutocompleteShowInAllMacroFields"
                                        label="STscript Show In All Macro Fields"
                                        description="在所有 macro 字段中显示 autocomplete。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.stscriptParserFlagStrictEscaping"
                                        label="STscript Strict Escaping"
                                        description="启用严格 escaping parser flag。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.stscriptParserFlagReplaceGetvar"
                                        label="STscript Replace Getvar"
                                        description="启用 replace-getvar parser flag。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                </SettingsSection>
                            </div>

                            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-950/70 px-4 py-3">
                                <p className="text-sm text-zinc-400">
                                    当前保存会提交完整 settings 对象，但只改写 React 已接管字段。
                                </p>
                                <settingsForm.Subscribe selector={state => state.isPristine}>
                                    {isPristine => (
                                        <button
                                            type="submit"
                                            className="inline-flex items-center rounded-md bg-emerald-400 px-4 py-2 text-sm font-medium text-zinc-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
                                            disabled={isBusy || settingsQuery.isPending || isPristine}
                                        >
                                            {saveMutation.isPending ? '保存中...' : isPristine ? '修改后可保存' : '保存设置'}
                                        </button>
                                    )}
                                </settingsForm.Subscribe>
                            </div>
                        </form>
                    </div>
                </section>

                <aside className="w-full max-w-xl space-y-4 lg:max-w-sm">
                    <section className="rounded-lg border border-zinc-800 bg-zinc-950/80 p-5">
                        <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-300">Payload Summary</h2>
                        <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
                            {payloadSummary.map(item => (
                                <div key={item.label} className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-3">
                                    <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">{item.label}</div>
                                    <div className="mt-2 text-2xl font-semibold text-zinc-50">{item.value}</div>
                                </div>
                            ))}
                        </div>
                    </section>

                    <section className="rounded-lg border border-zinc-800 bg-zinc-950/80 p-5">
                        <div className="flex items-start justify-between gap-3">
                            <div className="space-y-1">
                                <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-300">Developer diagnostics</h2>
                                <p className="text-sm text-zinc-400">
                                    迁移覆盖范围和原始 payload 结构说明，默认折叠，避免干扰正常设置操作。
                                </p>
                            </div>
                            <button
                                type="button"
                                className="inline-flex items-center rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200 transition hover:border-zinc-600 hover:text-zinc-50"
                                onClick={() => setShowDiagnostics(value => !value)}
                                aria-expanded={showDiagnostics}
                            >
                                {showDiagnostics ? '收起' : '展开'}
                            </button>
                        </div>

                        {showDiagnostics && (
                            <div className="mt-4 space-y-4">
                                <div className="space-y-4 text-sm text-zinc-300">
                                    {Object.entries(settingsCoverage.reactOwned as Record<string, string[]>).map(([tabId, paths]) => (
                                        <div key={tabId} className="space-y-2">
                                            <h3 className="font-medium text-zinc-100">{settingsTabDefinitions.find(tab => tab.id === tabId)?.label}</h3>
                                            <ul className="space-y-1 text-zinc-400">
                                                {paths.map((coveragePath: string) => (
                                                    <li key={coveragePath}>{coveragePath}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    ))}
                                </div>

                                <div>
                                    <h3 className="text-sm font-medium uppercase tracking-[0.16em] text-zinc-300">Still legacy-owned</h3>
                                    <ul className="mt-3 space-y-2 text-sm text-zinc-400">
                                        {settingsCoverage.legacyOwned.map(path => (
                                            <li key={path}>{path}</li>
                                        ))}
                                    </ul>
                                </div>
                            </div>
                        )}
                    </section>
                </aside>
            </div>
        </main>
    );
}
