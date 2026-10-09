import * as stylex from '@stylexjs/stylex';
import { useForm } from '@tanstack/react-form';

// Zod `z.coerce.*` fields widen the StandardSchema `input` to `unknown`, which TS 7
// strictly rejects against the form's number-typed default values. The runtime coercion
// is correct, so at the call site we bridge the schema into the validator slot. The
// package only exposes the async `FormValidateOrFn` (not the sync `FormValidateFn` the
// `validators` slot expects), hence the structural bridge.
type SettingsFormValidator = (props: { value: typeof defaultSettingsFormValues }) => any;
const toSettingsFormValidator = (schema: unknown): SettingsFormValidator => schema as SettingsFormValidator;
import { useMutation, useQuery } from '@tanstack/react-query';
import { startTransition, useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { z } from 'zod';
import {
    clearProviderSecretField,
    getUnifiedKeyFieldState,
    saveProviderSecretField,
} from '../../../public/scripts/provider-secret-field-state.js';
import { SettingField } from '@/components/settings/SettingField';
import { FormattingMasterActions, FormattingPresetRow } from '@/components/settings/TemplatePresetManager';
import { SettingsSection } from '@/components/settings/SettingsSection';
import { settingsStyles } from '@/styles/settings-surface.styles';
import { SettingsTabs } from '@/components/settings/SettingsTabs';
import type { RuntimePort } from '@/compat/runtime-port';
import {
    avatarStyleOptions,
    buildSettingsFormDefaults,
    buildSettingsSavePayload,
    chatDisplayOptions,
    defaultSettingsFormValues,
    imageOverswipeOptions,
    mediaDisplayOptions,
    parseSettingsPayload,
    providerSecretKeyBySource,
    sendOnEnterOptions,
    settingsCoverage,
    settingsTabDefinitions,
    saveSettingsToRuntime,
    tagImportSettingOptions,
    toastPositionOptions,
    tokenizerOptions,
} from '@/lib/settings-helpers.js';

const SAVE_STATUS_TIMEOUT_MS = 4000;

const settingsSchema = z.object({
    providers: z.object({
        openaiModel: z.string(),
        customUrl: z.string(),
        fallbackProviderModel: z.string(),
    }),
    userInterface: z.object({
        chatWidth: z.number().min(20, 'Chat Width 不能小于 20').max(100, 'Chat Width 不能大于 100'),
        fontScale: z.number().min(0.5, 'Font Scale 不能小于 0.5').max(2, 'Font Scale 不能大于 2'),
        customCss: z.string(),
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
        consoleLogPrompts: z.boolean(),
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
        systemPromptName: z.string(),
        systemPromptContent: z.string(),
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
    runtime?: RuntimePort;
};

const SETTINGS_ACTIVE_TAB_KEY = 'emberdesk-settings-active-tab';

function readStoredSettingsTab() {
    if (typeof window === 'undefined') {
        return null;
    }
    try {
        const stored = window.sessionStorage.getItem(SETTINGS_ACTIVE_TAB_KEY);
        return settingsTabDefinitions.some(tab => tab.id === stored) ? stored : null;
    } catch {
        return null;
    }
}

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
    return readStoredSettingsTab() ?? settingsTabDefinitions[0].id;
}

// Overlay-only navigation into workspace drawers. Preset CRUD, the Prompt
// Manager, connection-profile capture/apply, and the
// user-settings extras still live in drawer surfaces the shell no longer opens.
// Each target is the drawer's .drawer-content host id opened through the
// openWorkspaceDrawer runtime command; the link also runs onRequestClose so the
// overlay does not cover the drawer it just opened.
const WORKSPACE_DRAWER_LINKS: Record<string, Array<{ target: string; label: string; hint: string }>> = {
    providers: [
        { target: 'left-nav-panel', label: '打开 AI 响应配置', hint: '预设下拉与操作、采样滑条、Prompt Manager。' },
    ],
    userInterface: [
        { target: 'user-settings-block', label: '打开用户设置', hint: '主题色、字体缩放、模糊与杂项开关。' },
    ],
    // The Advanced Formatting drawer is retired: its preset CRUD and master
    // import/export live in this tab's preset rows and FormattingMasterActions.
    advanced: [],
};

export function SettingsSurface({
    variant = 'page',
    initialTab = null,
    onRequestClose,
    runtime,
}: SettingsSurfaceProps) {
    const isOverlay = variant === 'overlay';
    const [activeTab, setActiveTab] = useState(() => resolveInitialSettingsTab(initialTab));
    const [isSettingsFormReady, setIsSettingsFormReady] = useState(false);
    const [pageError, setPageError] = useState('');
    const [saveStatus, setSaveStatus] = useState<{ kind: 'success' | 'info'; message: string } | null>(null);
    const [hasRevisionConflict, setHasRevisionConflict] = useState(false);
    const [showDiagnostics, setShowDiagnostics] = useState(false);
    const [providerSecretInput, setProviderSecretInput] = useState('');
    const [providerActionBusy, setProviderActionBusy] = useState<'connect' | 'test' | null>(null);

    const subscribeRuntime = useCallback(
        (listener: () => void) => (runtime ? runtime.subscribe(listener) : () => {}),
        [runtime],
    );
    const providerStatus = useSyncExternalStore(
        subscribeRuntime,
        () => runtime?.getSnapshot().provider?.status ?? 'no_connection',
        () => 'no_connection',
    );
    const providerStatusLabel = providerStatus === 'no_connection' ? '未连接' : providerStatus;
    const canRunProviderActions = Boolean(
        runtime?.commands
        && typeof runtime.commands.connectProvider === 'function'
        && typeof runtime.commands.testProviderConnection === 'function',
    );

    async function handleProviderAction(kind: 'connect' | 'test') {
        const command = kind === 'connect'
            ? runtime?.commands.connectProvider
            : runtime?.commands.testProviderConnection;
        if (typeof command !== 'function' || providerActionBusy) {
            return;
        }
        setProviderActionBusy(kind);
        setPageError('');
        try {
            await command();
        } catch (error) {
            setPageError(error instanceof Error ? error.message : 'Provider 操作失败。');
        } finally {
            setProviderActionBusy(null);
        }
    }

    const openSettingsTab = useCallback((tabId: string) => {
        if (settingsTabDefinitions.some(tab => tab.id === tabId)) {
            try {
                window.sessionStorage.setItem(SETTINGS_ACTIVE_TAB_KEY, tabId);
            } catch {
                // sessionStorage may be unavailable in private contexts
            }
        }
        // Dense tab bodies are non-urgent; leave the shell responsive while they mount.
        startTransition(() => {
            setActiveTab(current => (current === tabId ? current : tabId));
        });
    }, []);

    useEffect(() => {
        if (!isOverlay) {
            return;
        }
        openSettingsTab(resolveInitialSettingsTab(initialTab));
    }, [initialTab, isOverlay, openSettingsTab]);

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

    const parsedPayload = useMemo(
        () => (settingsData ? parseSettingsPayload(settingsData) : null),
        [settingsData],
    );

    const settingsForm = useForm({
        canSubmitWhenInvalid: true,
        defaultValues: defaultSettingsFormValues,
        validators: {
            onChange: toSettingsFormValidator(settingsSchema),
            onSubmit: toSettingsFormValidator(settingsSchema),
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


    const saveMutation = useMutation({
        mutationFn: async (values: typeof defaultSettingsFormValues) => {
            if (!parsedPayload) {
                throw new MessageError('设置尚未加载完成。');
            }

            const csrfToken = await ensureCsrfToken();
            const baselineFormValues = buildSettingsFormDefaults(parsedPayload.settings);
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

            await saveSettingsToRuntime(payload, runtime);
            await refetchSettings();
            setHasRevisionConflict(false);
            setSaveStatus({ kind: 'success', message: '已保存' });
            try {
                window.sessionStorage.setItem('emberdesk-settings-saved-at', String(Date.now()));
                window.sessionStorage.setItem('emberdesk-settings-revision', String(parsedPayload.settingsRevision ?? ''));
            } catch {
                // sessionStorage may be unavailable in private contexts
            }
            return payload;
        },
        retry: false,
    });

    const providerSource = 'openai' as const;
    const currentSecretKey = providerSecretKeyBySource[providerSource];

    const unifiedKeyFieldState = getUnifiedKeyFieldState({
        source: providerSource,
        secretKey: currentSecretKey,
        secretState: secretsData,
        chatCompletionSources: {
            OPENAI: 'openai',
        },
    });

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
    }, [hasRevisionConflict, parsedPayload, settingsForm]);

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
            { label: 'OpenAI 预设', value: Array.isArray(settingsData.openai_setting_names) ? settingsData.openai_setting_names.length : 0 },
        ];
    }, [settingsData]);

    const isBusy = saveMutation.isPending || secretsQuery.isPending || providerSecretMutation.isPending;

    // File-backed formatting presets (system prompts / reasoning templates) ride
    // the same /api/settings/get payload as the legacy shell. CRUD results from
    // the formattingPreset runtime command refresh these lists in place.
    const [formattingPresets, setFormattingPresets] = useState<{ sysprompt: Record<string, any>[]; reasoning: Record<string, any>[] }>({ sysprompt: [], reasoning: [] });
    const payloadSyspromptPresets = settingsData?.sysprompt;
    const payloadReasoningPresets = settingsData?.reasoning;
    useEffect(() => {
        setFormattingPresets({
            sysprompt: Array.isArray(payloadSyspromptPresets) ? payloadSyspromptPresets : [],
            reasoning: Array.isArray(payloadReasoningPresets) ? payloadReasoningPresets : [],
        });
    }, [payloadSyspromptPresets, payloadReasoningPresets]);

    const handleFormattingPresetsChanged = useCallback((apiId: 'sysprompt' | 'reasoning', nextPresets: Record<string, any>[]) => {
        setFormattingPresets(current => ({ ...current, [apiId]: nextPresets }));
    }, []);

    const presetNotice = useCallback((message: string) => {
        setPageError('');
        setSaveStatus({ kind: 'info', message });
    }, []);
    const presetError = useCallback((message: string) => {
        setSaveStatus(null);
        setPageError(message);
    }, []);

    const applySystemPromptPreset = useCallback((preset: Record<string, any>) => {
        settingsForm.setFieldValue('advanced.systemPromptContent', String(preset?.content ?? ''));
        settingsForm.setFieldValue('advanced.syspromptPostHistory', String(preset?.post_history ?? ''));
        // The retired drawer's select-on-change enabled the system prompt.
        settingsForm.setFieldValue('advanced.syspromptEnabled', true);
    }, [settingsForm]);

    const collectSystemPromptPreset = useCallback(() => ({
        content: String(settingsForm.getFieldValue('advanced.systemPromptContent') ?? ''),
        post_history: String(settingsForm.getFieldValue('advanced.syspromptPostHistory') ?? ''),
    }), [settingsForm]);

    const applyReasoningPreset = useCallback((preset: Record<string, any>) => {
        settingsForm.setFieldValue('advanced.reasoningPrefix', String(preset?.prefix ?? ''));
        settingsForm.setFieldValue('advanced.reasoningSuffix', String(preset?.suffix ?? ''));
        settingsForm.setFieldValue('advanced.reasoningSeparator', String(preset?.separator ?? ''));
    }, [settingsForm]);

    const collectReasoningPreset = useCallback(() => ({
        prefix: String(settingsForm.getFieldValue('advanced.reasoningPrefix') ?? ''),
        suffix: String(settingsForm.getFieldValue('advanced.reasoningSuffix') ?? ''),
        separator: String(settingsForm.getFieldValue('advanced.reasoningSeparator') ?? ''),
    }), [settingsForm]);

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

    return (
        <main
            className={`settings-page ${stylex.props(settingsStyles.page, isOverlay && settingsStyles.pageOverlay).className ?? ''}`}
            data-settings-surface={variant}
            data-doc-id="page.settings"
        >
            <div {...stylex.props(settingsStyles.layout, isOverlay && settingsStyles.layoutOverlay)}>
                <section {...stylex.props(settingsStyles.mainPanel, isOverlay && settingsStyles.mainPanelOverlay)}>
                    <header {...stylex.props(settingsStyles.pageHeader)}>
                        <div {...stylex.props(settingsStyles.pageHeaderRow)}>
                            <div>
                                {isOverlay ? (
                                    <h1 {...stylex.props(settingsStyles.pageTitle, settingsStyles.pageTitleOverlay)}>
                                        设置
                                    </h1>
                                ) : (
                                    <>
                                        <h1 {...stylex.props(settingsStyles.pageTitle)}>设置</h1>
                                        <p {...stylex.props(settingsStyles.pageSummary)}>
                                            服务连接、界面偏好与高级参数的集中配置。
                                        </p>
                                    </>
                                )}
                            </div>
                            {isOverlay ? (
                                <button
                                    type="button"
                                    {...stylex.props(settingsStyles.button, settingsStyles.buttonSecondary, settingsStyles.overlayClose)}
                                    aria-label="关闭设置"
                                    onClick={() => onRequestClose?.()}
                                >
                                    <i className="fa-solid fa-xmark" aria-hidden="true" />
                                </button>
                            ) : (
                                <a
                                    {...stylex.props(settingsStyles.button, settingsStyles.buttonSecondary, settingsStyles.workspaceLink)}
                                    className={`settings-workspace-link ${stylex.props(settingsStyles.button, settingsStyles.buttonSecondary, settingsStyles.workspaceLink).className ?? ''}`}
                                    href="/"
                                    data-doc-id="page.chat_workspace"
                                >
                                    返回工作区
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

                    <div {...stylex.props(settingsStyles.stack, isOverlay && settingsStyles.stackOverlay)}>
                        {settingsQuery.isPending && (
                            <div {...stylex.props(settingsStyles.status, settingsStyles.statusInfo)}>
                                正在加载当前设置...
                            </div>
                        )}

                        {pageError && (
                            <div {...stylex.props(settingsStyles.status, settingsStyles.statusError)}>
                                {pageError}
                            </div>
                        )}

                        {hasRevisionConflict && (
                            <div {...stylex.props(settingsStyles.status, settingsStyles.statusError)}>
                                <p>当前草稿基于过期版本，尚未丢失。重新加载会放弃本地草稿，并显示当前保存的设置。</p>
                                <button
                                    type="button"
                                    {...stylex.props(settingsStyles.button, settingsStyles.buttonSecondary)}
                                    onClick={() => void reloadCurrentSettings()}
                                    disabled={isBusy}
                                >
                                    重新加载当前设置
                                </button>
                            </div>
                        )}

                        {saveStatus && (
                            <output
                                className={`settings-status settings-status--success ${stylex.props(settingsStyles.status, settingsStyles.statusSuccess).className ?? ''}`}
                                aria-live="polite"
                            >
                                {saveStatus.message}
                            </output>
                        )}

                        {isSettingsFormReady ? (
                        <form
                            {...stylex.props(settingsStyles.form, isOverlay && settingsStyles.stackOverlay)}
                            onSubmit={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                void settingsForm.handleSubmit();
                            }}
                        >
                            <div className={`settings-tab-panel ${stylex.props(isOverlay && settingsStyles.tabPanelOverlay).className ?? ''}`}>

                            {activeTab === 'providers' ? (
                            <div>
                                <SettingsSection
                                    title="服务"
                                    description="一个 endpoint URL、一个 API key、一个主模型和一个可选 fallback 模型。"
                                >
                                    <SettingField
                                        form={settingsForm}
                                        name="providers.customUrl"
                                        label="接口地址"
                                        description="OpenAI-compatible endpoint；留空使用官方 api.openai.com。"
                                        placeholder="https://api.openai.com/v1"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <div {...stylex.props(settingsStyles.inlinePanel)}>
                                        <div {...stylex.props(settingsStyles.inlineHeader)}>
                                            <div>
                                                <h3 {...stylex.props(settingsStyles.sectionTitle)}>API Key</h3>
                                                <p {...stylex.props(settingsStyles.mutedText, settingsStyles.sectionDescription)}>
                                                    主模型与 fallback 模型共用此 key；secret 与普通设置分开存储。
                                                </p>
                                            </div>
                                            <span {...stylex.props(settingsStyles.pill)}>
                                                {unifiedKeyFieldState.placeholder}
                                            </span>
                                        </div>

                                        <div {...stylex.props(settingsStyles.inlineActions)}>
                                            <input
                                                type="password"
                                                id="provider-secret-input"
                                                name="provider-secret-input"
                                                aria-label="API Key"
                                                {...stylex.props(settingsStyles.input, settingsStyles.inlineActionsInput)}
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
                                                {...stylex.props(settingsStyles.button, settingsStyles.buttonPrimary)}
                                                disabled={providerSecretMutation.isPending}
                                                onClick={() => {
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
                                                {...stylex.props(settingsStyles.button, settingsStyles.buttonSecondary)}
                                                disabled={providerSecretMutation.isPending}
                                                onClick={() => {
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
                                    </div>

                                    <SettingField
                                        form={settingsForm}
                                        name="providers.openaiModel"
                                        label="模型"
                                        description="主生成模型。"
                                        placeholder="gpt-5.2"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="providers.fallbackProviderModel"
                                        label="备选模型"
                                        description="主请求失败时以同一 URL 与 API key 换用此模型重试；留空即关闭。"
                                        placeholder="gpt-4.1-mini"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    {canRunProviderActions ? (
                                        <div {...stylex.props(settingsStyles.inlinePanel)}>
                                            <div {...stylex.props(settingsStyles.inlineHeader)}>
                                                <div>
                                                    <h3 {...stylex.props(settingsStyles.sectionTitle)}>连接</h3>
                                                    <p {...stylex.props(settingsStyles.mutedText, settingsStyles.sectionDescription)}>
                                                        「连接」校验凭证并拉取模型列表；「测试」发送一条探测请求。
                                                    </p>
                                                </div>
                                                <span {...stylex.props(settingsStyles.pill)}>{providerStatusLabel}</span>
                                            </div>
                                            <div {...stylex.props(settingsStyles.inlineActions)}>
                                                <button
                                                    type="button"
                                                    id="provider-connect-button"
                                                    {...stylex.props(settingsStyles.button, settingsStyles.buttonPrimary)}
                                                    disabled={providerActionBusy !== null}
                                                    onClick={() => { void handleProviderAction('connect'); }}
                                                >
                                                    {providerActionBusy === 'connect' ? '连接中…' : '连接'}
                                                </button>
                                                <button
                                                    type="button"
                                                    id="provider-test-button"
                                                    {...stylex.props(settingsStyles.button, settingsStyles.buttonSecondary)}
                                                    disabled={providerActionBusy !== null}
                                                    onClick={() => { void handleProviderAction('test'); }}
                                                >
                                                    {providerActionBusy === 'test' ? '测试中…' : '测试'}
                                                </button>
                                            </div>
                                        </div>
                                    ) : null}
                                </SettingsSection>
                            </div>
                            ) : null}

                            {activeTab === 'userInterface' ? (
                            <div>
                                <SettingsSection
                                    title="界面偏好"
                                    description="主题、布局、通知位置以及聊天显示密度。"
                                >
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.chatWidth"
                                        label="聊天宽度"
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
                                        label="字体缩放"
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
                                        label="通知位置"
                                        description="toast 通知的默认出现位置。"
                                        variant="select"
                                        options={toastPositionOptions}
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.avatarStyle"
                                        label="头像形状"
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
                                        label="消息样式"
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
                                        label="自定义 CSS"
                                        description="应用到整套 UI 的自定义 CSS。"
                                        variant="textarea"
                                        placeholder=".chat { color: white; }"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.fastUiMode"
                                        label="极速界面模式"
                                        description="去除大部分 blur，换取更快渲染。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.reducedMotion"
                                        label="减弱动效"
                                        description="减少动画与过渡效果。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.noShadows"
                                        label="关闭文字阴影"
                                        description="去除文本阴影。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.timerEnabled"
                                        label="消息计时"
                                        description="显示消息计时器。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.timestampsEnabled"
                                        label="时间戳"
                                        description="显示消息时间戳。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.timestampModelIcon"
                                        label="模型图标"
                                        description="在时间戳旁显示模型图标。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.mesIDDisplayEnabled"
                                        label="消息序号"
                                        description="显示消息编号。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.hideChatAvatarsEnabled"
                                        label="隐藏聊天头像"
                                        description="隐藏聊天区头像。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.compactInputArea"
                                        label="紧凑输入区"
                                        description="使用更紧凑的输入区域。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.expandMessageActions"
                                        label="展开消息操作"
                                        description="绑定到设置项 userInterface.expandMessageActions。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.enableZenSliders"
                                        label="启用 Zen 滑条"
                                        description="绑定到设置项 userInterface.enableZenSliders。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.enableLabMode"
                                        label="启用实验模式"
                                        description="绑定到设置项 userInterface.enableLabMode。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.messageTokenCountEnabled"
                                        label="显示消息 Token 数"
                                        description="绑定到设置项 userInterface.messageTokenCountEnabled。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.showSwipeNumAllMessages"
                                        label="所有消息显示 Swipe 序号"
                                        description="绑定到设置项 userInterface.showSwipeNumAllMessages。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.hotswapEnabled"
                                        label="启用热切换"
                                        description="绑定到设置项 userInterface.hotswapEnabled。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.zoomedAvatarMagnification"
                                        label="头像放大倍率"
                                        description="绑定到设置项 userInterface.zoomedAvatarMagnification。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.bogusFolders"
                                        label="伪文件夹"
                                        description="绑定到设置项 userInterface.bogusFolders。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.clickToEdit"
                                        label="点击编辑"
                                        description="绑定到设置项 userInterface.clickToEdit。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.mediaDisplay"
                                        label="媒体展示方式"
                                        description="绑定到设置项 userInterface.mediaDisplay。"
                                        variant="select"
                                        options={mediaDisplayOptions}
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.blurStrength"
                                        label="模糊强度"
                                        description="绑定到设置项 userInterface.blurStrength。"
                                        variant="number"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.shadowWidth"
                                        label="阴影宽度"
                                        description="绑定到设置项 userInterface.shadowWidth。"
                                        variant="number"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.mainTextColor"
                                        label="正文颜色"
                                        description="绑定到设置项 userInterface.mainTextColor。"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.italicsTextColor"
                                        label="斜体颜色"
                                        description="绑定到设置项 userInterface.italicsTextColor。"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.underlineTextColor"
                                        label="下划线颜色"
                                        description="绑定到设置项 userInterface.underlineTextColor。"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.quoteTextColor"
                                        label="引用颜色"
                                        description="绑定到设置项 userInterface.quoteTextColor。"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.blurTintColor"
                                        label="模糊蒙层颜色"
                                        description="绑定到设置项 userInterface.blurTintColor。"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.chatTintColor"
                                        label="聊天蒙层颜色"
                                        description="绑定到设置项 userInterface.chatTintColor。"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.userMesBlurTintColor"
                                        label="用户消息蒙层颜色"
                                        description="绑定到设置项 userInterface.userMesBlurTintColor。"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.botMesBlurTintColor"
                                        label="角色消息蒙层颜色"
                                        description="绑定到设置项 userInterface.botMesBlurTintColor。"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.shadowColor"
                                        label="阴影颜色"
                                        description="绑定到设置项 userInterface.shadowColor。"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.borderColor"
                                        label="边框颜色"
                                        description="绑定到设置项 userInterface.borderColor。"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.playMessageSound"
                                        label="播放消息音效"
                                        description="绑定到设置项 userInterface.playMessageSound。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.playSoundUnfocused"
                                        label="后台播放音效"
                                        description="绑定到设置项 userInterface.playSoundUnfocused。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.relaxedApiUrls"
                                        label="宽松 API 地址"
                                        description="绑定到设置项 userInterface.relaxedApiUrls。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.worldImportDialog"
                                        label="世界书导入对话框"
                                        description="绑定到设置项 userInterface.worldImportDialog。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.enableAutoSelectInput"
                                        label="自动选中输入"
                                        description="绑定到设置项 userInterface.enableAutoSelectInput。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.enableMdHotkeys"
                                        label="启用 Markdown 快捷键"
                                        description="绑定到设置项 userInterface.enableMdHotkeys。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.restoreUserInput"
                                        label="恢复未发送输入"
                                        description="绑定到设置项 userInterface.restoreUserInput。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.sendOnEnter"
                                        label="回车发送"
                                        description="绑定到设置项 userInterface.sendOnEnter。"
                                        variant="select"
                                        selectValueType="number"
                                        options={sendOnEnterOptions}
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.continueOnSend"
                                        label="发送后继续"
                                        description="绑定到设置项 userInterface.continueOnSend。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.quickContinue"
                                        label="快捷续写"
                                        description="绑定到设置项 userInterface.quickContinue。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.quickImpersonate"
                                        label="快捷扮演"
                                        description="绑定到设置项 userInterface.quickImpersonate。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.gestures"
                                        label="手势操作"
                                        description="绑定到设置项 userInterface.gestures。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.autoLoadChat"
                                        label="自动加载聊天"
                                        description="绑定到设置项 userInterface.autoLoadChat。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.autoScrollChatToBottom"
                                        label="自动滚动到底部"
                                        description="绑定到设置项 userInterface.autoScrollChatToBottom。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.autoSaveMsgEdits"
                                        label="自动保存消息编辑"
                                        description="绑定到设置项 userInterface.autoSaveMsgEdits。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.confirmMessageDelete"
                                        label="删除消息前确认"
                                        description="绑定到设置项 userInterface.confirmMessageDelete。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.autoFixGeneratedMarkdown"
                                        label="自动修复 Markdown"
                                        description="绑定到设置项 userInterface.autoFixGeneratedMarkdown。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.forbidExternalMedia"
                                        label="禁止外部媒体"
                                        description="绑定到设置项 userInterface.forbidExternalMedia。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.allowName1Display"
                                        label="允许显示 {{user}} 名"
                                        description="绑定到设置项 userInterface.allowName1Display。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.allowName2Display"
                                        label="允许显示 {{char}} 名"
                                        description="绑定到设置项 userInterface.allowName2Display。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.encodeTags"
                                        label="标签编码"
                                        description="绑定到设置项 userInterface.encodeTags。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.consoleLogPrompts"
                                        label="控制台输出提示词"
                                        description="绑定到设置项 userInterface.consoleLogPrompts。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.pinStyles"
                                        label="固定样式"
                                        description="绑定到设置项 userInterface.pinStyles。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.fuzzySearch"
                                        label="模糊搜索"
                                        description="绑定到设置项 userInterface.fuzzySearch。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.preferCharacterPrompt"
                                        label="优先角色系统提示"
                                        description="绑定到设置项 userInterface.preferCharacterPrompt。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.preferCharacterJailbreak"
                                        label="优先角色后注指令"
                                        description="绑定到设置项 userInterface.preferCharacterJailbreak。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.neverResizeAvatars"
                                        label="不压缩头像"
                                        description="绑定到设置项 userInterface.neverResizeAvatars。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.showCardAvatarUrls"
                                        label="显示卡面头像地址"
                                        description="绑定到设置项 userInterface.showCardAvatarUrls。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.spoilerFreeMode"
                                        label="防剧透模式"
                                        description="绑定到设置项 userInterface.spoilerFreeMode。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.imageOverswipe"
                                        label="图片滑动切换"
                                        description="绑定到设置项 userInterface.imageOverswipe。"
                                        variant="select"
                                        options={imageOverswipeOptions}
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.auxField"
                                        label="辅助字段"
                                        description="绑定到设置项 userInterface.auxField。"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="userInterface.tagImportSetting"
                                        label="标签导入方式"
                                        description="绑定到设置项 userInterface.tagImportSetting。"
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
                                    title="提示词、模板与高级控件"
                                    description="模板、stop strings、tokenizer、auto-swipe、auto-continue 和 STscript 设置。"
                                >
                                    <FormattingPresetRow
                                        apiId="sysprompt"
                                        label="系统提示预设"
                                        runtime={runtime}
                                        presets={formattingPresets.sysprompt}
                                        onPresetsChanged={handleFormattingPresetsChanged}
                                        form={settingsForm}
                                        nameField="advanced.systemPromptName"
                                        collectPreset={collectSystemPromptPreset}
                                        applyPreset={applySystemPromptPreset}
                                        disabled={isBusy}
                                        onNotice={presetNotice}
                                        onError={presetError}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.systemPromptName"
                                        label="系统提示名称"
                                        description="当前默认 system prompt preset 名称。"
                                        placeholder="默认 - 聊天"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.systemPromptContent"
                                        label="系统提示内容"
                                        description="默认 system prompt 正文。"
                                        variant="textarea"
                                        placeholder="写一个 {{char}} 的回复示例…"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <FormattingPresetRow
                                        apiId="reasoning"
                                        label="推理模板预设"
                                        runtime={runtime}
                                        presets={formattingPresets.reasoning}
                                        onPresetsChanged={handleFormattingPresetsChanged}
                                        form={settingsForm}
                                        nameField="advanced.reasoningName"
                                        collectPreset={collectReasoningPreset}
                                        applyPreset={applyReasoningPreset}
                                        disabled={isBusy}
                                        onNotice={presetNotice}
                                        onError={presetError}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.reasoningName"
                                        label="推理模板"
                                        description="当前 reasoning template 名称。"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.reasoningPrefix"
                                        label="推理前缀"
                                        description="reasoning block 前缀。"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.reasoningSuffix"
                                        label="推理后缀"
                                        description="reasoning block 后缀。"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.reasoningSeparator"
                                        label="推理分隔符"
                                        description="reasoning 与正文之间的分隔。"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.reasoningMaxAdditions"
                                        label="推理最大附加数"
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
                                        label="自定义停止符"
                                        description="stop strings 的原始字符串表示。"
                                        variant="textarea"
                                        placeholder='["END"]'
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.tokenizer"
                                        label="分词器"
                                        description="token 计数所用的 tokenizer。"
                                        variant="select"
                                        selectValueType="number"
                                        options={tokenizerOptions}
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.autoSwipeMinimumLength"
                                        label="自动 Swipe 最小长度"
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
                                        label="自动 Swipe 黑名单"
                                        description="逗号分隔的黑名单词条。"
                                        variant="textarea"
                                        placeholder="如 bad, retry"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.autoSwipeBlacklistThreshold"
                                        label="自动 Swipe 阈值"
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
                                        label="自动续写目标长度"
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
                                        label="每次加载消息数"
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
                                        label="流式刷新率"
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
                                        label="平滑流式速度"
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
                                        label="STscript 匹配"
                                        description="STscript autocomplete 的匹配模式。"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.stscriptAutocompleteState"
                                        label="STscript 自动补全"
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
                                        label="STscript 补全样式"
                                        description="autocomplete 面板样式。"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.stscriptAutocompleteSelect"
                                        label="STscript 选择键"
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
                                        label="STscript 字体缩放"
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
                                        label="STscript 左侧宽度"
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
                                        label="STscript 右侧宽度"
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
                                        label="自动 Swipe"
                                        description="启用 auto-swipe。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.customStoppingStringsMacro"
                                        label="停止符宏"
                                        description="允许在 stop strings 中展开 macro。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.experimentalMacroEngine"
                                        label="实验性宏引擎"
                                        description="使用新的 macro engine。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.autoContinueEnabled"
                                        label="自动续写"
                                        description="达到目标长度前自动继续生成。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.autoContinueAllowChatCompletions"
                                        label="聊天补全允许自动续写"
                                        description="允许 chat-completion path 使用 auto-continue。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.syspromptEnabled"
                                        label="启用系统提示"
                                        description="启用 system prompt。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.syspromptPostHistory"
                                        label="系统提示置于历史后"
                                        description="system prompt 的 post-history 文本。"
                                        variant="textarea"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.reasoningAutoParse"
                                        label="自动解析推理"
                                        description="自动从回复中解析 reasoning block。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.reasoningAddToPrompts"
                                        label="推理加入提示词"
                                        description="把已有 reasoning block 回填进后续 prompt。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.reasoningAutoExpand"
                                        label="推理自动展开"
                                        description="自动展开 reasoning block。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.reasoningShowHidden"
                                        label="显示隐藏推理"
                                        description="显示隐藏 reasoning 的时长信息。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.smoothStreaming"
                                        label="平滑流式"
                                        description="启用 smooth streaming。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.smoothStreamingNoThink"
                                        label="平滑流式跳过思考段"
                                        description="在 reasoning block 中绕过 smooth streaming。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.streamFadeIn"
                                        label="流式淡入"
                                        description="启用流式文字淡入。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.stscriptAutocompleteAutoHide"
                                        label="STscript 自动隐藏"
                                        description="autocomplete 在失焦时自动隐藏。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.stscriptAutocompleteShowInAllMacroFields"
                                        label="在所有宏字段显示 STscript"
                                        description="在所有 macro 字段中显示 autocomplete。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.stscriptParserFlagStrictEscaping"
                                        label="STscript 严格转义"
                                        description="启用严格 escaping parser flag。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.stscriptParserFlagReplaceGetvar"
                                        label="STscript 替换 getvar"
                                        description="启用 replace-getvar parser flag。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.collapseNewlines"
                                        label="折叠空行"
                                        description="绑定到设置项 advanced.collapseNewlines。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.alwaysForceName2"
                                        label="强制显示 {{char}} 名"
                                        description="绑定到设置项 advanced.alwaysForceName2。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.trimSentences"
                                        label="裁剪句子"
                                        description="绑定到设置项 advanced.trimSentences。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.trimSpaces"
                                        label="裁剪空格"
                                        description="绑定到设置项 advanced.trimSpaces。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.singleLine"
                                        label="单行模式"
                                        description="绑定到设置项 advanced.singleLine。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.markdownEscapeStrings"
                                        label="Markdown 转义字符串"
                                        description="绑定到设置项 advanced.markdownEscapeStrings。"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.userPromptBias"
                                        label="用户提示偏移"
                                        description="绑定到设置项 advanced.userPromptBias。"
                                        variant="textarea"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.showUserPromptBias"
                                        label="显示用户提示偏移"
                                        description="绑定到设置项 advanced.showUserPromptBias。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="advanced.tokenPadding"
                                        label="Token 补齐"
                                        description="绑定到设置项 advanced.tokenPadding。"
                                        variant="number"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <FormattingMasterActions
                                        runtime={runtime}
                                        form={settingsForm}
                                        onPresetsChanged={handleFormattingPresetsChanged}
                                        disabled={isBusy}
                                        onNotice={presetNotice}
                                        onError={presetError}
                                    />
</SettingsSection>
                            </div>
                            ) : null}

                            {isOverlay && (WORKSPACE_DRAWER_LINKS[activeTab]?.length ?? 0) > 0 ? (
                                <SettingsSection
                                    title="工作区面板"
                                    description="本页未覆盖的高级控件仍在对应的工作区抽屉中维护；点击后此面板会关闭。"
                                >
                                    {(WORKSPACE_DRAWER_LINKS[activeTab] ?? []).map(link => (
                                        <button
                                            key={link.target}
                                            type="button"
                                            {...stylex.props(settingsStyles.button, settingsStyles.buttonSecondary)}
                                            title={link.hint}
                                            onClick={() => {
                                                runtime?.commands.openWorkspaceDrawer(link.target);
                                                onRequestClose?.();
                                            }}
                                        >
                                            {link.label}
                                        </button>
                                    ))}
                                </SettingsSection>
                            ) : null}
                            </div>

                            <div {...stylex.props(settingsStyles.saveBar, isOverlay && settingsStyles.saveBarOverlay)}>
                                <p {...stylex.props(settingsStyles.mutedText, settingsStyles.sectionDescription)}>
                                    只保存本页字段。
                                </p>
                                <settingsForm.Subscribe selector={state => state.isPristine}>
                                    {isPristine => (
                                        <button
                                            type="submit"
                                            {...stylex.props(settingsStyles.button, settingsStyles.buttonPrimary)}
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

                <aside {...stylex.props(settingsStyles.side)}>
                    <section {...stylex.props(settingsStyles.sidePanel)}>
                        <h2 {...stylex.props(settingsStyles.sectionTitle)}>负载摘要</h2>
                        <div {...stylex.props(settingsStyles.metrics)}>
                            {payloadSummary.map(item => (
                                <div key={item.label} {...stylex.props(settingsStyles.metric)}>
                                    <div {...stylex.props(settingsStyles.metricLabel)}>{item.label}</div>
                                    <div {...stylex.props(settingsStyles.metricValue)}>{item.value}</div>
                                </div>
                            ))}
                        </div>
                    </section>

                    <section {...stylex.props(settingsStyles.sidePanel)}>
                        <div {...stylex.props(settingsStyles.inlineHeader)}>
                            <div>
                                <h2 {...stylex.props(settingsStyles.sectionTitle)}>诊断</h2>
                                <p {...stylex.props(settingsStyles.mutedText, settingsStyles.sectionDescription)}>
                                    字段归属调试信息。
                                </p>
                            </div>
                            <button
                                type="button"
                                {...stylex.props(settingsStyles.button, settingsStyles.buttonSecondary)}
                                onClick={() => setShowDiagnostics(value => !value)}
                                aria-expanded={showDiagnostics}
                            >
                                {showDiagnostics ? '收起' : '展开'}
                            </button>
                        </div>

                        {showDiagnostics && (
                            <div {...stylex.props(settingsStyles.diagnosticsBody)}>
                                <div>
                                    {Object.entries(settingsCoverage.reactOwned as Record<string, string[]>).map(([tabId, paths]) => (
                                        <div key={tabId} {...stylex.props(settingsStyles.diagnosticsGroup)}>
                                            <h3 {...stylex.props(settingsStyles.diagnosticsTitle)}>{settingsTabDefinitions.find(tab => tab.id === tabId)?.label}</h3>
                                            <ul {...stylex.props(settingsStyles.diagnosticsList)}>
                                                {paths.map((coveragePath: string) => (
                                                    <li key={coveragePath}>{coveragePath}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    ))}
                                </div>

                                <div {...stylex.props(settingsStyles.diagnosticsGroup)}>
                                    <h3 {...stylex.props(settingsStyles.diagnosticsTitle)}>遗留字段</h3>
                                    <ul {...stylex.props(settingsStyles.diagnosticsList)}>
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
