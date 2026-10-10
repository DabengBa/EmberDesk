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
import { SettingsSection } from '@/components/settings/SettingsSection';
import { settingsStyles } from '@/styles/settings-surface.styles';
import { SettingsTabs } from '@/components/settings/SettingsTabs';
import type { RuntimePort } from '@/compat/runtime-port';
import {
    buildSettingsFormDefaults,
    buildSettingsSavePayload,
    defaultSettingsFormValues,
    parseSettingsPayload,
    providerSecretKeyBySource,
    settingsCoverage,
    settingsTabDefinitions,
    saveSettingsToRuntime,
    tokenizerOptions,
} from '@/lib/settings-helpers.js';

const SAVE_STATUS_TIMEOUT_MS = 4000;

const settingsSchema = z.object({
    providers: z.object({
        openaiModel: z.string(),
        customUrl: z.string(),
        fallbackProviderModel: z.string(),
    }),
    advanced: z.object({
        customStoppingStrings: z.string(),
        tokenizer: z.number().int().min(0, 'Tokenizer 值必须为非负整数'),
        smoothStreaming: z.boolean(),
        stscriptMatching: z.string(),
        stscriptAutocompleteState: z.number().int().min(0).max(2),
        alwaysForceName2: z.boolean(),
        trimSpaces: z.boolean(),
        userPromptBias: z.string(),
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
    // The Advanced Formatting drawer is retired; the formatting preset feature
    // has since been removed entirely.
    advanced: [
        { target: 'user-settings-block', label: '打开用户设置', hint: '账户、语言、调试菜单、清理与前端渲染帧等工具。' },
    ],
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
                                            服务连接与高级参数的集中配置。
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


                            {activeTab === 'advanced' ? (
                            <div>
                                <SettingsSection
                                    title="提示词与高级控件"
                                    description="Stop strings、tokenizer 和 STscript 设置。"
                                >
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
                                        name="advanced.smoothStreaming"
                                        label="平滑流式"
                                        description="启用 smooth streaming。"
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
                                        name="advanced.trimSpaces"
                                        label="裁剪空格"
                                        description="绑定到设置项 advanced.trimSpaces。"
                                        variant="toggle"
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
                                        name="advanced.tokenPadding"
                                        label="Token 补齐"
                                        description="绑定到设置项 advanced.tokenPadding。"
                                        variant="number"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
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
