import { useForm, useStore } from '@tanstack/react-form';

// Zod `z.coerce.*` fields widen the StandardSchema `input` to `unknown`, which TS 7
// strictly rejects against the form's number-typed default values. The runtime coercion
// is correct, so at the call site we assert the schema into the validator slot. The
// package only exposes the async `FormValidateOrFn` (not the sync `FormValidateFn` the
// `validators` slot expects), hence the structural `unknown` bridge.
type SettingsFormValidator = (props: { value: typeof defaultSettingsFormValues }) => any;
import { useMutation, useQuery } from '@tanstack/react-query';
import { startTransition, useEffect, useMemo, useState } from 'react';
import { z } from 'zod';
import { hasFallbackProviderSettings } from '../../../public/scripts/chat-generation-auto-recovery.js';
import {
    canUseDirectProviderSecret,
    clearProviderSecretField,
    getUnifiedKeyFieldState,
    resolveProviderSecretKeyForSettings,
    saveProviderSecretField,
} from '../../../public/scripts/provider-secret-field-state.js';
import { SettingField } from '@/components/settings/SettingField';
import { SettingsSection } from '@/components/settings/SettingsSection';
import { SettingsTabs } from '@/components/settings/SettingsTabs';
import {
    avatarStyleOptions,
    buildSettingsFormDefaults,
    buildSettingsSavePayload,
    chatDisplayOptions,
    defaultSettingsFormValues,
    getConnectionProfileOptions,
    getProviderModelFieldConfig,
    getValueAtPath,
    imageOverswipeOptions,
    mediaDisplayOptions,
    namesBehaviorOptions,
    parseSettingsPayload,
    promptPostProcessingOptions,
    providerOptions,
    providerSecretKeyBySource,
    reasoningEffortOptions,
    sendOnEnterOptions,
    settingsCoverage,
    settingsTabDefinitions,
    syncSettingsToLegacyRuntime,
    tagImportSettingOptions,
    toastPositionOptions,
    toolReasoningModeOptions,
    verbosityOptions,
    vertexAuthModeOptions,
} from '@/lib/settings-helpers.js';

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
        n: z.coerce.number(),
        verbosity: z.string(),
        mediaInlining: z.boolean(),
        inlineImageQuality: z.string(),
        requestImages: z.boolean(),
        requestImageAspectRatio: z.string(),
        requestImageResolution: z.string(),
        toolReasoningMode: z.string(),
        toolCallRecurseLimit: z.coerce.number(),
        sendIfEmpty: z.string(),
        impersonationPrompt: z.string(),
        newChatPrompt: z.string(),
        newGroupChatPrompt: z.string(),
        newExampleChatPrompt: z.string(),
        continueNudgePrompt: z.string(),
        wiFormat: z.string(),
        scenarioFormat: z.string(),
        personalityFormat: z.string(),
        groupNudgePrompt: z.string(),
        assistantPrefill: z.string(),
        assistantImpersonation: z.string(),
        namesBehavior: z.coerce.number(),
        biasPresetSelected: z.string(),
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
        connectionProfileId: z.string(),
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
        avatarStyle: z.coerce.number().int().min(0).max(3),
        chatDisplay: z.coerce.number().int().min(0).max(2),
        timerEnabled: z.boolean(),
        timestampsEnabled: z.boolean(),
        timestampModelIcon: z.boolean(),
        mesIDDisplayEnabled: z.boolean(),
        hideChatAvatarsEnabled: z.boolean(),
        compactInputArea: z.boolean(),
        waifuMode: z.boolean(),
        expandMessageActions: z.boolean(),
        enableZenSliders: z.boolean(),
        enableLabMode: z.boolean(),
        messageTokenCountEnabled: z.boolean(),
        showSwipeNumAllMessages: z.boolean(),
        hotswapEnabled: z.boolean(),
        zoomedAvatarMagnification: z.boolean(),
        bogusFolders: z.boolean(),
        clickToEdit: z.boolean(),
        mediaDisplay: z.string(),
        blurStrength: z.coerce.number(),
        shadowWidth: z.coerce.number(),
        mainTextColor: z.string(),
        italicsTextColor: z.string(),
        underlineTextColor: z.string(),
        quoteTextColor: z.string(),
        blurTintColor: z.string(),
        chatTintColor: z.string(),
        userMesBlurTintColor: z.string(),
        botMesBlurTintColor: z.string(),
        shadowColor: z.string(),
        borderColor: z.string(),
        playMessageSound: z.boolean(),
        playSoundUnfocused: z.boolean(),
        relaxedApiUrls: z.boolean(),
        worldImportDialog: z.boolean(),
        enableAutoSelectInput: z.boolean(),
        enableMdHotkeys: z.boolean(),
        restoreUserInput: z.boolean(),
        sendOnEnter: z.coerce.number(),
        continueOnSend: z.boolean(),
        quickContinue: z.boolean(),
        quickImpersonate: z.boolean(),
        gestures: z.boolean(),
        autoLoadChat: z.boolean(),
        autoScrollChatToBottom: z.boolean(),
        autoSaveMsgEdits: z.boolean(),
        confirmMessageDelete: z.boolean(),
        autoFixGeneratedMarkdown: z.boolean(),
        forbidExternalMedia: z.boolean(),
        allowName1Display: z.boolean(),
        allowName2Display: z.boolean(),
        encodeTags: z.boolean(),
        disableGroupTrimming: z.boolean(),
        consoleLogPrompts: z.boolean(),
        requestTokenProbabilities: z.boolean(),
        showGroupChatQueue: z.boolean(),
        pinStyles: z.boolean(),
        fuzzySearch: z.boolean(),
        preferCharacterPrompt: z.boolean(),
        preferCharacterJailbreak: z.boolean(),
        neverResizeAvatars: z.boolean(),
        showCardAvatarUrls: z.boolean(),
        spoilerFreeMode: z.boolean(),
        imageOverswipe: z.string(),
        auxField: z.string(),
        tagImportSetting: z.coerce.number(),
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
        chatTruncation: z.coerce.number().int().min(0),
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
        collapseNewlines: z.boolean(),
        alwaysForceName2: z.boolean(),
        trimSentences: z.boolean(),
        trimSpaces: z.boolean(),
        singleLine: z.boolean(),
        markdownEscapeStrings: z.string(),
        userPromptBias: z.string(),
        showUserPromptBias: z.boolean(),
        tokenPadding: z.coerce.number(),
        instructDerived: z.boolean(),
        contextDerived: z.boolean(),
        contextSizeDerived: z.boolean(),
        instructInputSequence: z.string(),
        instructInputSuffix: z.string(),
        instructOutputSequence: z.string(),
        instructOutputSuffix: z.string(),
        instructSystemSequence: z.string(),
        instructSystemSuffix: z.string(),
        instructLastSystemSequence: z.string(),
        instructFirstInputSequence: z.string(),
        instructFirstOutputSequence: z.string(),
        instructLastInputSequence: z.string(),
        instructLastOutputSequence: z.string(),
        instructStoryStringPrefix: z.string(),
        instructStoryStringSuffix: z.string(),
        instructStopSequence: z.string(),
        instructUserAlignmentMessage: z.string(),
        instructSystemSameAsUser: z.boolean(),
        instructNamesBehavior: z.string(),
        instructSeparatorSequence: z.string(),
        contextStoryStringPosition: z.coerce.number(),
        contextStoryStringRole: z.coerce.number(),
        contextStoryStringDepth: z.coerce.number(),
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

export type SettingsSurfaceVariant = 'page' | 'overlay';

export type SettingsSurfaceProps = {
    variant?: SettingsSurfaceVariant;
    initialTab?: string | null;
    onRequestClose?: () => void;
};

function resolveInitialSettingsTab(initialTab?: string | null) {
    if (typeof initialTab === 'string' && settingsTabDefinitions.some(tab => tab.id === initialTab)) {
        return initialTab;
    }
    if (typeof window !== 'undefined') {
        const requestedTab = new URLSearchParams(window.location.search).get('tab');
        if (settingsTabDefinitions.some(tab => tab.id === requestedTab)) {
            return requestedTab as string;
        }
    }
    return settingsTabDefinitions[0].id;
}

export function SettingsSurface({
    variant = 'page',
    initialTab = null,
    onRequestClose,
}: SettingsSurfaceProps) {
    const isOverlay = variant === 'overlay';
    const [activeTab, setActiveTab] = useState(() => resolveInitialSettingsTab(initialTab));
    const [isSettingsFormReady, setIsSettingsFormReady] = useState(false);
    const [pageError, setPageError] = useState('');
    const [saveStatus, setSaveStatus] = useState<{ kind: 'success' | 'info'; message: string } | null>(null);
    const [hasRevisionConflict, setHasRevisionConflict] = useState(false);
    const [showDiagnostics, setShowDiagnostics] = useState(false);
    const [providerSecretInput, setProviderSecretInput] = useState('');
    const [fallbackSecretInput, setFallbackSecretInput] = useState('');

    function openSettingsTab(tabId: string) {
        if (tabId === activeTab) {
            return;
        }
        // Dense tab bodies are non-urgent; leave the shell responsive while they mount.
        startTransition(() => {
            setActiveTab(tabId);
        });
    }

    useEffect(() => {
        if (!isOverlay) {
            return;
        }
        openSettingsTab(resolveInitialSettingsTab(initialTab));
    }, [initialTab, isOverlay]);

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
    const {
        data: csrfToken,
        error: csrfTokenError,
        refetch: refetchCsrfToken,
    } = csrfTokenQuery;

    async function ensureCsrfToken() {
        if (typeof csrfToken === 'string' && csrfToken.length > 0) {
            return csrfToken;
        }

        const result = await refetchCsrfToken();
        if (typeof result.data === 'string' && result.data.length > 0) {
            return result.data;
        }

        throw result.error ?? csrfTokenError ?? new MessageError('无法获取 CSRF token。');
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
    const {
        data: settingsData,
        refetch: refetchSettings,
    } = settingsQuery;

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
    const {
        data: secretsData,
        refetch: refetchSecrets,
    } = secretsQuery;

    const parsedPayload = settingsData ? parseSettingsPayload(settingsData) : null;

    const settingsForm = useForm({
        canSubmitWhenInvalid: true,
        defaultValues: defaultSettingsFormValues,
        validators: {
            onChange: settingsSchema as unknown as SettingsFormValidator,
            onSubmit: settingsSchema as unknown as SettingsFormValidator,
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

            if (hasRevisionConflict) {
                setPageError('设置已在其他会话中更新。请先重新加载当前设置，再合并并保存草稿。');
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

    // Provider-only derived state must not rerender a dense active tab on every unrelated field edit.
    const providerSettingsValues = useStore(settingsForm.store, state => state.values.providers);

    const saveMutation = useMutation({
        mutationFn: async (values: typeof defaultSettingsFormValues) => {
            if (!parsedPayload) {
                throw new MessageError('设置尚未加载完成。');
            }

            const csrfToken = await ensureCsrfToken();
            const baselineFormValues = buildSettingsFormDefaults(parsedPayload.settings);
            const connectionProfileChanged = values.providers.connectionProfileId
                !== baselineFormValues.providers.connectionProfileId;
            const payload = buildSettingsSavePayload(parsedPayload.settings, values, {
                settingsRevision: parsedPayload.settingsRevision,
                baselineFormValues,
            });
            const response = await fetch('/api/settings/save', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': csrfToken,
                },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                if (response.status === 409) {
                    setHasRevisionConflict(true);
                    throw new MessageError('设置已被其他会话更新；本地草稿仍保留。请重新加载当前设置后合并并再次保存。');
                }
                throw new MessageError('设置保存失败。');
            }

            syncSettingsToLegacyRuntime(payload);
            await refetchSettings();
            setHasRevisionConflict(false);
            setSaveStatus({ kind: 'success', message: 'Saved' });
            try {
                window.sessionStorage.setItem('emberdesk-settings-saved-at', String(Date.now()));
                window.sessionStorage.setItem('emberdesk-settings-revision', String(parsedPayload.settingsRevision ?? ''));
                if (connectionProfileChanged) {
                    window.sessionStorage.setItem(
                        'emberdesk-settings-apply-connection-profile',
                        JSON.stringify(values.providers.connectionProfileId),
                    );
                }
            } catch {
                // sessionStorage may be unavailable in private contexts
            }
            return payload;
        },
        retry: false,
    });

    const providerSource = providerSettingsValues.chatCompletionSource;
    const providerModelField = useMemo(() => getProviderModelFieldConfig(providerSource), [providerSource]);
    const providerSettingsSnapshot = ((parsedPayload
        ? getValueAtPath(parsedPayload.settings, 'oai_settings')
        : undefined) as Record<string, any> | undefined) ?? {};
    const providerSecretKey = providerSecretKeyBySource[providerSource as keyof typeof providerSecretKeyBySource] ?? null;
    const currentSecretKey = resolveProviderSecretKeyForSettings({
        settings: {
            reverse_proxy: providerSettingsValues.reverseProxy,
            use_vertexai: providerSettingsValues.useVertexAi,
            vertexai_auth_mode: providerSettingsValues.vertexaiAuthMode,
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
            reverse_proxy: providerSettingsValues.reverseProxy,
            proxy_password: providerSettingsValues.proxyPassword,
            use_vertexai: providerSettingsValues.useVertexAi,
            vertexai_auth_mode: providerSettingsValues.vertexaiAuthMode,
        },
        source: providerSource,
        secretKey: currentSecretKey,
        secretState: secretsData,
        chatCompletionSources: {
            OPENAI: 'openai',
            CLAUDE: 'claude',
            MAKERSUITE: 'makersuite',
        },
    });

    const directSecretMode = canUseDirectProviderSecret({
        settings: {
            reverse_proxy: providerSettingsValues.reverseProxy,
        },
        secretKey: currentSecretKey,
    });
    const fallbackProviderReady = hasFallbackProviderSettings({
        fallback_provider_enabled: providerSettingsValues.fallbackProviderEnabled,
        fallback_provider_base_url: providerSettingsValues.fallbackProviderBaseUrl,
        fallback_provider_model: providerSettingsValues.fallbackProviderModel,
    }, secretsData, fallbackSecretKey);

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
        if (!parsedPayload || hasRevisionConflict) {
            if (!parsedPayload) {
                setIsSettingsFormReady(false);
            }
            return;
        }

        const nextDefaults = buildSettingsFormDefaults(parsedPayload.settings);
        settingsForm.reset(nextDefaults, { keepDefaultValues: true });
        setPageError('');
        setIsSettingsFormReady(true);
    }, [hasRevisionConflict, parsedPayload?.rawSettings]);

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
        if (!settingsData) {
            return [];
        }

        return [
            { label: 'Themes', value: Array.isArray(settingsData.themes) ? settingsData.themes.length : 0 },
            { label: 'OpenAI Presets', value: Array.isArray(settingsData.openai_setting_names) ? settingsData.openai_setting_names.length : 0 },
            { label: 'Context Presets', value: Array.isArray(settingsData.context) ? settingsData.context.length : 0 },
        ];
    }, [settingsData]);

    const isBusy = saveMutation.isPending || secretsQuery.isPending || providerSecretMutation.isPending;
    const connectionProfileOptions = useMemo(
        () => getConnectionProfileOptions(parsedPayload?.settings ?? {}),
        [parsedPayload?.rawSettings],
    );

    function clearTransientState() {
        saveMutation.reset();
        setSaveStatus(null);
        setPageError('');
    }

    async function reloadCurrentSettings() {
        setPageError('');
        setSaveStatus(null);
        saveMutation.reset();

        const result = await refetchSettings();
        if (result.error || !result.data) {
            setPageError(result.error instanceof Error ? result.error.message : '无法重新加载当前设置。');
            return;
        }

        const refreshedPayload = parseSettingsPayload(result.data);
        settingsForm.reset(buildSettingsFormDefaults(refreshedPayload.settings), { keepDefaultValues: true });
        setHasRevisionConflict(false);
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

            await refetchSecrets();
            if (result.shouldClearInput) {
                options.clearInput();
            }
            setSaveStatus({ kind: 'info', message: options.successMessage });
        } catch (error) {
            setPageError(error instanceof Error ? error.message : String(error));
        }
    }

    const activeFallbackStatus = providerSettingsValues.fallbackProviderEnabled
        ? (fallbackProviderReady ? 'Ready' : 'Needs setup')
        : 'Disabled';

    return (
        <main className={`settings-page${isOverlay ? ' settings-page--overlay' : ''}`} data-settings-surface={variant} data-doc-id="page.settings">
            <div className="settings-layout">
                <section className="settings-main-panel">
                    <header className="settings-page-header">
                        <div className="settings-page-header-row">
                            <div>
                                {isOverlay ? (
                                    <h1 className="settings-page-title settings-page-title--overlay">
                                        {settingsTabDefinitions.find(tab => tab.id === activeTab)?.label ?? 'Settings'}
                                    </h1>
                                ) : (
                                    <>
                                        <h1 className="settings-page-title">Settings</h1>
                                        <p className="settings-page-summary">
                                            Defaults, providers, workspace display, and power-user controls.
                                        </p>
                                    </>
                                )}
                            </div>
                            {isOverlay ? (
                                <button
                                    type="button"
                                    className="settings-button settings-button--secondary settings-overlay-close"
                                    aria-label="Close settings"
                                    onClick={() => onRequestClose?.()}
                                >
                                    <i className="fa-solid fa-xmark" aria-hidden="true" />
                                </button>
                            ) : (
                                <a
                                    className="settings-button settings-button--secondary settings-workspace-link"
                                    href="/"
                                    data-doc-id="page.chat_workspace"
                                >
                                    返回 Workspace
                                </a>
                            )}
                        </div>
                    </header>

                    <SettingsTabs
                        tabs={settingsTabDefinitions}
                        activeTab={activeTab}
                        onChange={openSettingsTab}
                        showDescription={!isOverlay}
                    />

                    <div className="settings-stack">
                        {settingsQuery.isPending && (
                            <div className="settings-status settings-status--info">
                                正在加载当前设置...
                            </div>
                        )}

                        {pageError && (
                            <div className="settings-status settings-status--error">
                                {pageError}
                            </div>
                        )}

                        {hasRevisionConflict && (
                            <div className="settings-status settings-status--error">
                                <p>当前草稿基于过期版本，尚未丢失。重新加载会放弃本地草稿，并显示当前保存的设置。</p>
                                <button
                                    type="button"
                                    className="settings-button settings-button--secondary"
                                    onClick={() => void reloadCurrentSettings()}
                                    disabled={isBusy}
                                >
                                    重新加载当前设置
                                </button>
                            </div>
                        )}

                        {saveStatus && (
                            <output
                                className="settings-status settings-status--success"
                                aria-live="polite"
                            >
                                {saveStatus.message}
                            </output>
                        )}

                        {isSettingsFormReady ? (
                        <form
                            className="settings-form"
                            onSubmit={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                void settingsForm.handleSubmit();
                            }}
                        >
                            <div className="settings-tab-panel">
                            {activeTab === 'general' ? (
                            <div>
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
                                        step={0.01}
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
                                                                    <SettingField
                                        form={settingsForm}
                                        name="general.n"
                                        label="N"
                                        description="Settings path binding for general.n."
                                        variant="number"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="general.verbosity"
                                        label="Verbosity"
                                        description="Settings path binding for general.verbosity."
                                        variant="select"
                                        options={verbosityOptions}
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="general.mediaInlining"
                                        label="Media Inlining"
                                        description="Settings path binding for general.mediaInlining."
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="general.inlineImageQuality"
                                        label="Inline Image Quality"
                                        description="Settings path binding for general.inlineImageQuality."
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="general.requestImages"
                                        label="Request Images"
                                        description="Settings path binding for general.requestImages."
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="general.requestImageAspectRatio"
                                        label="Request Image Aspect Ratio"
                                        description="Settings path binding for general.requestImageAspectRatio."
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="general.requestImageResolution"
                                        label="Request Image Resolution"
                                        description="Settings path binding for general.requestImageResolution."
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="general.toolReasoningMode"
                                        label="Tool Reasoning Mode"
                                        description="Settings path binding for general.toolReasoningMode."
                                        variant="select"
                                        options={toolReasoningModeOptions}
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="general.toolCallRecurseLimit"
                                        label="Tool Call Recurse Limit"
                                        description="Settings path binding for general.toolCallRecurseLimit."
                                        variant="number"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="general.sendIfEmpty"
                                        label="Send If Empty"
                                        description="Settings path binding for general.sendIfEmpty."
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="general.impersonationPrompt"
                                        label="Impersonation Prompt"
                                        description="Settings path binding for general.impersonationPrompt."
                                        variant="textarea"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="general.newChatPrompt"
                                        label="New Chat Prompt"
                                        description="Settings path binding for general.newChatPrompt."
                                        variant="textarea"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="general.newGroupChatPrompt"
                                        label="New Group Chat Prompt"
                                        description="Settings path binding for general.newGroupChatPrompt."
                                        variant="textarea"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="general.newExampleChatPrompt"
                                        label="New Example Chat Prompt"
                                        description="Settings path binding for general.newExampleChatPrompt."
                                        variant="textarea"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="general.continueNudgePrompt"
                                        label="Continue Nudge Prompt"
                                        description="Settings path binding for general.continueNudgePrompt."
                                        variant="textarea"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="general.wiFormat"
                                        label="Wi Format"
                                        description="Settings path binding for general.wiFormat."
                                        variant="textarea"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="general.scenarioFormat"
                                        label="Scenario Format"
                                        description="Settings path binding for general.scenarioFormat."
                                        variant="textarea"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="general.personalityFormat"
                                        label="Personality Format"
                                        description="Settings path binding for general.personalityFormat."
                                        variant="textarea"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="general.groupNudgePrompt"
                                        label="Group Nudge Prompt"
                                        description="Settings path binding for general.groupNudgePrompt."
                                        variant="textarea"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="general.assistantPrefill"
                                        label="Assistant Prefill"
                                        description="Settings path binding for general.assistantPrefill."
                                        variant="textarea"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="general.assistantImpersonation"
                                        label="Assistant Impersonation"
                                        description="Settings path binding for general.assistantImpersonation."
                                        variant="textarea"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="general.namesBehavior"
                                        label="Names Behavior"
                                        description="Settings path binding for general.namesBehavior."
                                        variant="select"
                                        selectValueType="number"
                                        options={namesBehaviorOptions}
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="general.biasPresetSelected"
                                        label="Bias Preset Selected"
                                        description="Settings path binding for general.biasPresetSelected."
                                        variant="textarea"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
</SettingsSection>
                            </div>
                            ) : null}

                            {activeTab === 'providers' ? (
                            <div>
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
                                        disabled={isBusy || !providerSettingsValues.fallbackProviderEnabled}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="providers.fallbackProviderModel"
                                        label="Fallback Model"
                                        description="Fallback provider 使用的模型。"
                                        placeholder="gpt-4.1-mini"
                                        disabled={isBusy || !providerSettingsValues.fallbackProviderEnabled}
                                        onValueChange={clearTransientState}
                                    />
                                    <div className="settings-inline-panel">
                                        <div className="settings-inline-header">
                                            <div>
                                                <h3 className="settings-card-title">Provider API Key</h3>
                                                <p className="settings-card-description">
                                                    Secret storage is kept separate from normal settings.
                                                </p>
                                            </div>
                                            <span className="settings-pill">
                                                {unifiedKeyFieldState.placeholder}
                                            </span>
                                        </div>

                                        {directSecretMode ? (
                                            <div className="settings-inline-actions">
                                                {unifiedKeyFieldState.isServiceAccount ? (
                                                    <textarea
                                                        id="provider-secret-input"
                                                        name="provider-secret-input"
                                                        aria-label="Vertex AI Service Account JSON"
                                                        className="settings-input"
                                                        rows={6}
                                                        placeholder={unifiedKeyFieldState.placeholder}
                                                        value={providerSecretInput}
                                                        disabled={providerSecretMutation.isPending}
                                                        onChange={event => {
                                                            setProviderSecretInput(event.target.value);
                                                            setSaveStatus(null);
                                                            setPageError('');
                                                        }}
                                                    />
                                                ) : (
                                                <input
                                                    type="password"
                                                    id="provider-secret-input"
                                                    name="provider-secret-input"
                                                    aria-label="Provider API Key"
                                                    className="settings-input"
                                                    placeholder={unifiedKeyFieldState.placeholder}
                                                    value={providerSecretInput}
                                                    disabled={providerSecretMutation.isPending}
                                                    onChange={event => {
                                                        setProviderSecretInput(event.target.value);
                                                        setSaveStatus(null);
                                                        setPageError('');
                                                    }}
                                                />
                                                )}
                                                <button
                                                    type="button"
                                                    className="settings-button settings-button--primary"
                                                    disabled={providerSecretMutation.isPending}
                                                    onClick={() => {
                                                        if (!currentSecretKey) {
                                                            return;
                                                        }
                                                        void handleProviderSecretAction({
                                                            key: currentSecretKey,
                                                            mode: 'save',
                                                            value: providerSecretInput,
                                                            successMessage: currentSecretKey === 'vertexai_service_account_json'
                                                                ? 'Vertex service account 已保存。'
                                                                : 'Provider API key 已保存。',
                                                            clearInput: () => setProviderSecretInput(''),
                                                        });
                                                    }}
                                                >
                                                    {currentSecretKey === 'vertexai_service_account_json' ? '保存 Service Account' : '保存 Key'}
                                                </button>
                                                <button
                                                    type="button"
                                                    className="settings-button settings-button--secondary"
                                                    disabled={providerSecretMutation.isPending}
                                                    onClick={() => {
                                                        if (!currentSecretKey) {
                                                            return;
                                                        }
                                                        void handleProviderSecretAction({
                                                            key: currentSecretKey,
                                                            mode: 'clear',
                                                            value: '',
                                                            successMessage: currentSecretKey === 'vertexai_service_account_json'
                                                                ? 'Vertex service account 已清除。'
                                                                : 'Provider API key 已清除。',
                                                            clearInput: () => setProviderSecretInput(''),
                                                        });
                                                    }}
                                                >
                                                    {currentSecretKey === 'vertexai_service_account_json' ? '清除 Service Account' : '清除 Key'}
                                                </button>
                                            </div>
                                        ) : (
                                            <p className="settings-card-description">
                                                {unifiedKeyFieldState.vertexAiActive
                                                    ? 'Vertex Express key uses the secrets store.'
                                                    : 'Reverse proxy mode uses Proxy Password instead of provider secrets.'}
                                            </p>
                                        )}
                                    </div>

                                    <div className="settings-inline-panel">
                                        <div className="settings-inline-header">
                                            <div>
                                                <h3 className="settings-card-title">Fallback Provider Secret</h3>
                                                <p className="settings-card-description">
                                                    Separate server-side key for fallback routing.
                                                </p>
                                            </div>
                                            <span className="settings-pill">
                                                {activeFallbackStatus}
                                            </span>
                                        </div>
                                        <div className="settings-inline-actions">
                                            <input
                                                type="password"
                                                id="fallback-provider-secret-input"
                                                name="fallback-provider-secret-input"
                                                aria-label="Fallback Provider API Key"
                                                className="settings-input"
                                                placeholder="Fallback API Key"
                                                value={fallbackSecretInput}
                                                disabled={providerSecretMutation.isPending || !providerSettingsValues.fallbackProviderEnabled}
                                                onChange={event => {
                                                    setFallbackSecretInput(event.target.value);
                                                    setSaveStatus(null);
                                                    setPageError('');
                                                }}
                                            />
                                            <button
                                                type="button"
                                                className="settings-button settings-button--primary"
                                                disabled={providerSecretMutation.isPending || !providerSettingsValues.fallbackProviderEnabled}
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
                                                className="settings-button settings-button--secondary"
                                                disabled={providerSecretMutation.isPending || !providerSettingsValues.fallbackProviderEnabled}
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
                                                                    <SettingField
                                        form={settingsForm}
                                        name="providers.openaiModel"
                                        label="Openai Model"
                                        description="Settings path binding for providers.openaiModel."
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="providers.claudeModel"
                                        label="Claude Model"
                                        description="Settings path binding for providers.claudeModel."
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="providers.googleModel"
                                        label="Google Model"
                                        description="Settings path binding for providers.googleModel."
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="providers.connectionProfileId"
                                        label="Connection Profile"
                                        description="Returning to Workspace applies the selected profile through Connection Manager."
                                        variant="select"
                                        options={connectionProfileOptions}
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
</SettingsSection>
                            </div>
                            ) : null}

                            {activeTab === 'userInterface' ? (
                            <div>
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
                                                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.waifuMode"
                                        label="Waifu Mode"
                                        description="Settings path binding for userInterface.waifuMode."
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.expandMessageActions"
                                        label="Expand Message Actions"
                                        description="Settings path binding for userInterface.expandMessageActions."
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.enableZenSliders"
                                        label="Enable Zen Sliders"
                                        description="Settings path binding for userInterface.enableZenSliders."
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.enableLabMode"
                                        label="Enable Lab Mode"
                                        description="Settings path binding for userInterface.enableLabMode."
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.messageTokenCountEnabled"
                                        label="Message Token Count Enabled"
                                        description="Settings path binding for userInterface.messageTokenCountEnabled."
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.showSwipeNumAllMessages"
                                        label="Show Swipe Num All Messages"
                                        description="Settings path binding for userInterface.showSwipeNumAllMessages."
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.hotswapEnabled"
                                        label="Hotswap Enabled"
                                        description="Settings path binding for userInterface.hotswapEnabled."
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.zoomedAvatarMagnification"
                                        label="Zoomed Avatar Magnification"
                                        description="Settings path binding for userInterface.zoomedAvatarMagnification."
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.bogusFolders"
                                        label="Bogus Folders"
                                        description="Settings path binding for userInterface.bogusFolders."
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.clickToEdit"
                                        label="Click To Edit"
                                        description="Settings path binding for userInterface.clickToEdit."
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.mediaDisplay"
                                        label="Media Display"
                                        description="Settings path binding for userInterface.mediaDisplay."
                                        variant="select"
                                        options={mediaDisplayOptions}
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.blurStrength"
                                        label="Blur Strength"
                                        description="Settings path binding for userInterface.blurStrength."
                                        variant="number"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.shadowWidth"
                                        label="Shadow Width"
                                        description="Settings path binding for userInterface.shadowWidth."
                                        variant="number"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.mainTextColor"
                                        label="Main Text Color"
                                        description="Settings path binding for userInterface.mainTextColor."
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.italicsTextColor"
                                        label="Italics Text Color"
                                        description="Settings path binding for userInterface.italicsTextColor."
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.underlineTextColor"
                                        label="Underline Text Color"
                                        description="Settings path binding for userInterface.underlineTextColor."
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.quoteTextColor"
                                        label="Quote Text Color"
                                        description="Settings path binding for userInterface.quoteTextColor."
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.blurTintColor"
                                        label="Blur Tint Color"
                                        description="Settings path binding for userInterface.blurTintColor."
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.chatTintColor"
                                        label="Chat Tint Color"
                                        description="Settings path binding for userInterface.chatTintColor."
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.userMesBlurTintColor"
                                        label="User Mes Blur Tint Color"
                                        description="Settings path binding for userInterface.userMesBlurTintColor."
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.botMesBlurTintColor"
                                        label="Bot Mes Blur Tint Color"
                                        description="Settings path binding for userInterface.botMesBlurTintColor."
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.shadowColor"
                                        label="Shadow Color"
                                        description="Settings path binding for userInterface.shadowColor."
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.borderColor"
                                        label="Border Color"
                                        description="Settings path binding for userInterface.borderColor."
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.playMessageSound"
                                        label="Play Message Sound"
                                        description="Settings path binding for userInterface.playMessageSound."
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.playSoundUnfocused"
                                        label="Play Sound Unfocused"
                                        description="Settings path binding for userInterface.playSoundUnfocused."
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.relaxedApiUrls"
                                        label="Relaxed Api Urls"
                                        description="Settings path binding for userInterface.relaxedApiUrls."
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.worldImportDialog"
                                        label="World Import Dialog"
                                        description="Settings path binding for userInterface.worldImportDialog."
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.enableAutoSelectInput"
                                        label="Enable Auto Select Input"
                                        description="Settings path binding for userInterface.enableAutoSelectInput."
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.enableMdHotkeys"
                                        label="Enable Md Hotkeys"
                                        description="Settings path binding for userInterface.enableMdHotkeys."
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.restoreUserInput"
                                        label="Restore User Input"
                                        description="Settings path binding for userInterface.restoreUserInput."
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.sendOnEnter"
                                        label="Send On Enter"
                                        description="Settings path binding for userInterface.sendOnEnter."
                                        variant="select"
                                        selectValueType="number"
                                        options={sendOnEnterOptions}
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.continueOnSend"
                                        label="Continue On Send"
                                        description="Settings path binding for userInterface.continueOnSend."
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.quickContinue"
                                        label="Quick Continue"
                                        description="Settings path binding for userInterface.quickContinue."
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.quickImpersonate"
                                        label="Quick Impersonate"
                                        description="Settings path binding for userInterface.quickImpersonate."
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.gestures"
                                        label="Gestures"
                                        description="Settings path binding for userInterface.gestures."
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.autoLoadChat"
                                        label="Auto Load Chat"
                                        description="Settings path binding for userInterface.autoLoadChat."
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.autoScrollChatToBottom"
                                        label="Auto Scroll Chat To Bottom"
                                        description="Settings path binding for userInterface.autoScrollChatToBottom."
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.autoSaveMsgEdits"
                                        label="Auto Save Msg Edits"
                                        description="Settings path binding for userInterface.autoSaveMsgEdits."
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.confirmMessageDelete"
                                        label="Confirm Message Delete"
                                        description="Settings path binding for userInterface.confirmMessageDelete."
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.autoFixGeneratedMarkdown"
                                        label="Auto Fix Generated Markdown"
                                        description="Settings path binding for userInterface.autoFixGeneratedMarkdown."
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.forbidExternalMedia"
                                        label="Forbid External Media"
                                        description="Settings path binding for userInterface.forbidExternalMedia."
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.allowName1Display"
                                        label="Allow Name1 Display"
                                        description="Settings path binding for userInterface.allowName1Display."
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.allowName2Display"
                                        label="Allow Name2 Display"
                                        description="Settings path binding for userInterface.allowName2Display."
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.encodeTags"
                                        label="Encode Tags"
                                        description="Settings path binding for userInterface.encodeTags."
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.disableGroupTrimming"
                                        label="Disable Group Trimming"
                                        description="Settings path binding for userInterface.disableGroupTrimming."
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.consoleLogPrompts"
                                        label="Console Log Prompts"
                                        description="Settings path binding for userInterface.consoleLogPrompts."
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.requestTokenProbabilities"
                                        label="Request Token Probabilities"
                                        description="Settings path binding for userInterface.requestTokenProbabilities."
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.showGroupChatQueue"
                                        label="Show Group Chat Queue"
                                        description="Settings path binding for userInterface.showGroupChatQueue."
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.pinStyles"
                                        label="Pin Styles"
                                        description="Settings path binding for userInterface.pinStyles."
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.fuzzySearch"
                                        label="Fuzzy Search"
                                        description="Settings path binding for userInterface.fuzzySearch."
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.preferCharacterPrompt"
                                        label="Prefer Character Prompt"
                                        description="Settings path binding for userInterface.preferCharacterPrompt."
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.preferCharacterJailbreak"
                                        label="Prefer Character Jailbreak"
                                        description="Settings path binding for userInterface.preferCharacterJailbreak."
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.neverResizeAvatars"
                                        label="Never Resize Avatars"
                                        description="Settings path binding for userInterface.neverResizeAvatars."
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.showCardAvatarUrls"
                                        label="Show Card Avatar Urls"
                                        description="Settings path binding for userInterface.showCardAvatarUrls."
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.spoilerFreeMode"
                                        label="Spoiler Free Mode"
                                        description="Settings path binding for userInterface.spoilerFreeMode."
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.imageOverswipe"
                                        label="Image Overswipe"
                                        description="Settings path binding for userInterface.imageOverswipe."
                                        variant="select"
                                        options={imageOverswipeOptions}
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.auxField"
                                        label="Aux Field"
                                        description="Settings path binding for userInterface.auxField."
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.tagImportSetting"
                                        label="Tag Import Setting"
                                        description="Settings path binding for userInterface.tagImportSetting."
                                        variant="select"
                                        selectValueType="number"
                                        options={tagImportSettingOptions}
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
</SettingsSection>
                            </div>
                            ) : null}

                            {activeTab === 'advanced' ? (
                            <div>
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
                                                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.collapseNewlines"
                                        label="Collapse Newlines"
                                        description="Settings path binding for advanced.collapseNewlines."
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.alwaysForceName2"
                                        label="Always Force Name2"
                                        description="Settings path binding for advanced.alwaysForceName2."
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.trimSentences"
                                        label="Trim Sentences"
                                        description="Settings path binding for advanced.trimSentences."
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.trimSpaces"
                                        label="Trim Spaces"
                                        description="Settings path binding for advanced.trimSpaces."
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.singleLine"
                                        label="Single Line"
                                        description="Settings path binding for advanced.singleLine."
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.markdownEscapeStrings"
                                        label="Markdown Escape Strings"
                                        description="Settings path binding for advanced.markdownEscapeStrings."
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.userPromptBias"
                                        label="User Prompt Bias"
                                        description="Settings path binding for advanced.userPromptBias."
                                        variant="textarea"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.showUserPromptBias"
                                        label="Show User Prompt Bias"
                                        description="Settings path binding for advanced.showUserPromptBias."
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.tokenPadding"
                                        label="Token Padding"
                                        description="Settings path binding for advanced.tokenPadding."
                                        variant="number"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.instructDerived"
                                        label="Instruct Derived"
                                        description="Settings path binding for advanced.instructDerived."
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.contextDerived"
                                        label="Context Derived"
                                        description="Settings path binding for advanced.contextDerived."
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.contextSizeDerived"
                                        label="Context Size Derived"
                                        description="Settings path binding for advanced.contextSizeDerived."
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.instructInputSequence"
                                        label="Instruct Input Sequence"
                                        description="Settings path binding for advanced.instructInputSequence."
                                        variant="textarea"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.instructInputSuffix"
                                        label="Instruct Input Suffix"
                                        description="Settings path binding for advanced.instructInputSuffix."
                                        variant="textarea"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.instructOutputSequence"
                                        label="Instruct Output Sequence"
                                        description="Settings path binding for advanced.instructOutputSequence."
                                        variant="textarea"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.instructOutputSuffix"
                                        label="Instruct Output Suffix"
                                        description="Settings path binding for advanced.instructOutputSuffix."
                                        variant="textarea"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.instructSystemSequence"
                                        label="Instruct System Sequence"
                                        description="Settings path binding for advanced.instructSystemSequence."
                                        variant="textarea"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.instructSystemSuffix"
                                        label="Instruct System Suffix"
                                        description="Settings path binding for advanced.instructSystemSuffix."
                                        variant="textarea"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.instructLastSystemSequence"
                                        label="Instruct Last System Sequence"
                                        description="Settings path binding for advanced.instructLastSystemSequence."
                                        variant="textarea"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.instructFirstInputSequence"
                                        label="Instruct First Input Sequence"
                                        description="Settings path binding for advanced.instructFirstInputSequence."
                                        variant="textarea"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.instructFirstOutputSequence"
                                        label="Instruct First Output Sequence"
                                        description="Settings path binding for advanced.instructFirstOutputSequence."
                                        variant="textarea"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.instructLastInputSequence"
                                        label="Instruct Last Input Sequence"
                                        description="Settings path binding for advanced.instructLastInputSequence."
                                        variant="textarea"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.instructLastOutputSequence"
                                        label="Instruct Last Output Sequence"
                                        description="Settings path binding for advanced.instructLastOutputSequence."
                                        variant="textarea"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.instructStoryStringPrefix"
                                        label="Instruct Story String Prefix"
                                        description="Settings path binding for advanced.instructStoryStringPrefix."
                                        variant="textarea"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.instructStoryStringSuffix"
                                        label="Instruct Story String Suffix"
                                        description="Settings path binding for advanced.instructStoryStringSuffix."
                                        variant="textarea"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.instructStopSequence"
                                        label="Instruct Stop Sequence"
                                        description="Settings path binding for advanced.instructStopSequence."
                                        variant="textarea"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.instructUserAlignmentMessage"
                                        label="Instruct User Alignment Message"
                                        description="Settings path binding for advanced.instructUserAlignmentMessage."
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.instructSystemSameAsUser"
                                        label="Instruct System Same As User"
                                        description="Settings path binding for advanced.instructSystemSameAsUser."
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.instructNamesBehavior"
                                        label="Instruct Names Behavior"
                                        description="Settings path binding for advanced.instructNamesBehavior."
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.instructSeparatorSequence"
                                        label="Instruct Separator Sequence"
                                        description="Settings path binding for advanced.instructSeparatorSequence."
                                        variant="textarea"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.contextStoryStringPosition"
                                        label="Context Story String Position"
                                        description="Settings path binding for advanced.contextStoryStringPosition."
                                        variant="number"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.contextStoryStringRole"
                                        label="Context Story String Role"
                                        description="Settings path binding for advanced.contextStoryStringRole."
                                        variant="number"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.contextStoryStringDepth"
                                        label="Context Story String Depth"
                                        description="Settings path binding for advanced.contextStoryStringDepth."
                                        variant="number"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
</SettingsSection>
                            </div>
                            ) : null}
                            </div>

                            <div className="settings-save-bar">
                                <p className="settings-save-note">
                                    只保存本页字段。
                                </p>
                                <settingsForm.Subscribe selector={state => state.isPristine}>
                                    {isPristine => (
                                        <button
                                            type="submit"
                                            className="settings-button settings-button--primary"
                                            disabled={isBusy || settingsQuery.isPending || isPristine || hasRevisionConflict}
                                        >
                                            {saveMutation.isPending ? '保存中...' : isPristine ? '修改后可保存' : '保存设置'}
                                        </button>
                                    )}
                                </settingsForm.Subscribe>
                            </div>
                        </form>
                        ) : null}
                    </div>
                </section>

                <aside className="settings-side">
                    <section className="settings-side-panel">
                        <h2 className="settings-side-title">Payload Summary</h2>
                        <div className="settings-metrics">
                            {payloadSummary.map(item => (
                                <div key={item.label} className="settings-metric">
                                    <div className="settings-metric-label">{item.label}</div>
                                    <div className="settings-metric-value">{item.value}</div>
                                </div>
                            ))}
                        </div>
                    </section>

                    <section className="settings-side-panel">
                        <div className="settings-diagnostics-header">
                            <div>
                                <h2 className="settings-side-title">Diagnostics</h2>
                                <p className="settings-card-description">
                                    Field ownership for debugging.
                                </p>
                            </div>
                            <button
                                type="button"
                                className="settings-button settings-button--secondary"
                                onClick={() => setShowDiagnostics(value => !value)}
                                aria-expanded={showDiagnostics}
                            >
                                {showDiagnostics ? '收起' : '展开'}
                            </button>
                        </div>

                        {showDiagnostics && (
                            <div className="settings-diagnostics-body">
                                <div>
                                    {Object.entries(settingsCoverage.reactOwned as Record<string, string[]>).map(([tabId, paths]) => (
                                        <div key={tabId} className="settings-diagnostics-group">
                                            <h3 className="settings-diagnostics-title">{settingsTabDefinitions.find(tab => tab.id === tabId)?.label}</h3>
                                            <ul className="settings-diagnostics-list">
                                                {paths.map((coveragePath: string) => (
                                                    <li key={coveragePath}>{coveragePath}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    ))}
                                </div>

                                <div className="settings-diagnostics-group">
                                    <h3 className="settings-diagnostics-title">Legacy-owned</h3>
                                    <ul className="settings-diagnostics-list">
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
