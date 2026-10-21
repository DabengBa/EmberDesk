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
} from '@/lib/settings-helpers.js';

const SAVE_STATUS_TIMEOUT_MS = 4000;

const settingsSchema = z.object({
    providers: z.object({
        openaiModel: z.string(),
        customUrl: z.string(),
        fallbackProviderModel: z.string(),
    }),
    memory: z.object({
        enabled: z.boolean(),
        keepTurns: z.number().int().min(1),
        role: z.enum(['system', 'user', 'assistant']),
        prompt: z.string(),
        wrap: z.string(),
        maxTokens: z.number().int().min(1),
    }),
    rendering: z.object({
        frontendFramesEnabled: z.boolean(),
        frontendFramesDepth: z.number().int().min(0),
        frontendFramesDepthIgnoreHidden: z.boolean(),
        frontendFramesCollapseCodeBlock: z.enum(['all', 'frontend_only', 'none']),
        frontendFramesSkipHighlight: z.boolean(),
        frontendFramesUseBlobUrl: z.boolean(),
        frontendFramesAllowStreaming: z.boolean(),
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

export type SettingsSurfaceVariant = 'page' | 'drawer';

export type SettingsSurfaceProps = {
    variant?: SettingsSurfaceVariant;
    initialTab?: string | null;
    onDirtyStateChange?: (dirty: boolean) => void;
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

export function SettingsSurface({
    variant = 'page',
    initialTab = null,
    onDirtyStateChange,
    runtime,
}: SettingsSurfaceProps) {
    // Drawer variant uses the compact layout but leaves the title/close
    // chrome to WorkspacePanelChrome — no internal header row.
    const isCompact = variant === 'drawer';
    const [activeTab, setActiveTab] = useState(() => resolveInitialSettingsTab(initialTab));
    const [isSettingsFormLoaded, setIsSettingsFormLoaded] = useState(false);
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
    const runtimeProviderStatus = useSyncExternalStore(
        subscribeRuntime,
        () => runtime?.getSnapshot().provider?.status ?? 'no_connection',
        () => 'no_connection',
    );
    const [pageProviderStatus, setPageProviderStatus] = useState('no_connection');
    const providerStatus = runtime ? runtimeProviderStatus : pageProviderStatus;
    const providerStatusLabel = providerStatus === 'no_connection' ? '未连接' : providerStatus;
    const canRunProviderActions = Boolean(runtime)
        ? Boolean(
            runtime?.commands
            && typeof runtime.commands.connectProvider === 'function'
            && typeof runtime.commands.testProviderConnection === 'function',
        )
        : true;

    async function runPageProviderAction(kind: 'connect' | 'test') {
        const values = settingsForm.state.values;
        const customUrl = values.providers.customUrl.trim();
        const model = values.providers.openaiModel.trim();
        const hasSavedSecret = Boolean(currentSecretKey && secretsData?.[currentSecretKey]);
        if (!hasSavedSecret && !customUrl) {
            throw new MessageError('请先保存 API key，或配置自定义接口地址。');
        }

        const csrfToken = await ensureCsrfToken();

        if (kind === 'connect') {
            const response = await fetch('/api/backends/chat-completions/status', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': csrfToken,
                },
                body: JSON.stringify({
                    chat_completion_source: 'openai',
                    ...(customUrl ? { custom_url: customUrl } : {}),
                }),
            });
            const data = await readJsonObject(response);
            if (!response.ok || data.error) {
                setPageProviderStatus('no_connection');
                throw new MessageError('连接失败：无法从接口拉取模型列表，请检查接口地址与 API key。');
            }

            setPageProviderStatus('online');
            const modelCount = Array.isArray(data.data) ? data.data.length : null;
            setSaveStatus({
                kind: 'info',
                message: modelCount === null ? '连接成功。' : `连接成功，接口返回 ${modelCount} 个模型。`,
            });
            return;
        }

        if (!model) {
            throw new MessageError('请先填写主模型后再测试。');
        }

        const response = await fetch('/api/backends/chat-completions/generate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': csrfToken,
            },
            body: JSON.stringify({
                chat_completion_source: 'openai',
                ...(customUrl ? { custom_url: customUrl } : {}),
                model,
                messages: [{ role: 'user', content: 'Hi' }],
                max_tokens: 1,
                stream: false,
            }),
        });
        const data = await readJsonObject(response);
        if (!response.ok || data.error) {
            setPageProviderStatus('no_connection');
            throw new MessageError('测试请求失败：接口未返回有效回复，请检查连接设置与 API key。');
        }

        setPageProviderStatus('online');
        setSaveStatus({ kind: 'info', message: '已收到 API 回复。' });
    }

    async function handleProviderAction(kind: 'connect' | 'test') {
        const command = kind === 'connect'
            ? runtime?.commands.connectProvider
            : runtime?.commands.testProviderConnection;
        if (providerActionBusy) {
            return;
        }
        if (runtime && typeof command !== 'function') {
            return;
        }
        setProviderActionBusy(kind);
        setPageError('');
        setSaveStatus(null);
        try {
            if (runtime) {
                await command?.();
            } else {
                await runPageProviderAction(kind);
            }
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
        if (!isCompact) {
            return;
        }
        openSettingsTab(resolveInitialSettingsTab(initialTab));
    }, [initialTab, isCompact, openSettingsTab]);

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
        error: settingsQueryError,
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
        error: secretsQueryError,
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
                // Saved values become the new baseline; without this the form
                // stays dirty and the close path wrongly prompts for unsaved
                // changes.
                settingsForm.reset(value);
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
            return;
        }

        if (!settingsForm.state.isPristine) {
            // A background refetch must not clobber an in-progress draft. A
            // dirty form is by definition already loaded, so no state update.
            return;
        }

        const nextDefaults = buildSettingsFormDefaults(parsedPayload.settings);
        settingsForm.reset(nextDefaults, { keepDefaultValues: true });
        setPageError('');
        setIsSettingsFormLoaded(true);
    }, [hasRevisionConflict, parsedPayload, settingsForm]);

    const isSettingsFormReady = isSettingsFormLoaded && parsedPayload !== null;


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
    const hasPendingSecretInput = providerSecretInput.trim().length > 0;
    const hasUnsavedChanges = !settingsForm.state.isPristine || hasPendingSecretInput;

    useEffect(() => {
        onDirtyStateChange?.(hasUnsavedChanges);
        return () => onDirtyStateChange?.(false);
    }, [hasUnsavedChanges, onDirtyStateChange]);

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
            className={`settings-page ${stylex.props(settingsStyles.page, isCompact && settingsStyles.pageOverlay).className ?? ''}`}
            data-settings-surface={variant}
            data-doc-id="page.settings"
        >
            <div {...stylex.props(settingsStyles.layout, isCompact && settingsStyles.layoutOverlay)}>
                <section {...stylex.props(settingsStyles.mainPanel, isCompact && settingsStyles.mainPanelOverlay)}>
                    {isCompact ? null : (
                    <header {...stylex.props(settingsStyles.pageHeader)}>
                        <div {...stylex.props(settingsStyles.pageHeaderRow)}>
                            <div>
                                <h1 {...stylex.props(settingsStyles.pageTitle)}>设置</h1>
                            </div>
                            <div {...stylex.props(settingsStyles.headerActions)}>
                                <button
                                    type="button"
                                    {...stylex.props(settingsStyles.button, settingsStyles.buttonSecondary)}
                                    aria-expanded={showDiagnostics}
                                    aria-controls="settings-diagnostics"
                                    onClick={() => setShowDiagnostics(value => !value)}
                                >
                                    诊断
                                </button>
                                <a
                                    {...stylex.props(settingsStyles.button, settingsStyles.buttonSecondary, settingsStyles.workspaceLink)}
                                    className={`settings-workspace-link ${stylex.props(settingsStyles.button, settingsStyles.buttonSecondary, settingsStyles.workspaceLink).className ?? ''}`}
                                    href="/"
                                    data-doc-id="page.chat_workspace"
                                >
                                    返回工作区
                                </a>
                            </div>
                        </div>
                    </header>
                    )}

                    <SettingsTabs
                        tabs={settingsTabDefinitions}
                        activeTab={activeTab}
                        onChange={openSettingsTab}
                        showDescription={!isCompact}
                    />

                    <div {...stylex.props(settingsStyles.stack, isCompact && settingsStyles.stackOverlay)}>
                        {settingsQuery.isPending && (
                            <div {...stylex.props(settingsStyles.status, settingsStyles.statusInfo)} role="status">
                                正在加载当前设置...
                            </div>
                        )}

                        {settingsQuery.isError && !settingsQuery.isPending ? (
                            <div {...stylex.props(settingsStyles.status, settingsStyles.statusError)} role="alert">
                                <p>设置加载失败。</p>
                                <p>{settingsQueryError instanceof Error ? settingsQueryError.message : '请检查服务后重试。'}</p>
                                <button
                                    type="button"
                                    {...stylex.props(settingsStyles.button, settingsStyles.buttonSecondary)}
                                    onClick={() => void refetchSettings()}
                                    disabled={settingsQuery.isFetching}
                                >
                                    重新加载设置
                                </button>
                            </div>
                        ) : null}

                        {secretsQuery.isError && !secretsQuery.isPending ? (
                            <div {...stylex.props(settingsStyles.status, settingsStyles.statusError)} role="alert">
                                <p>无法读取密钥状态，普通设置字段仍可编辑。</p>
                                <p>{secretsQueryError instanceof Error ? secretsQueryError.message : '请稍后重试。'}</p>
                                <button
                                    type="button"
                                    {...stylex.props(settingsStyles.button, settingsStyles.buttonSecondary)}
                                    onClick={() => void refetchSecrets()}
                                    disabled={secretsQuery.isFetching}
                                >
                                    重试密钥状态
                                </button>
                            </div>
                        ) : null}

                        {pageError && (
                            <div {...stylex.props(settingsStyles.status, settingsStyles.statusError)} role="alert">
                                {pageError}
                            </div>
                        )}

                        {hasRevisionConflict && (
                            <div {...stylex.props(settingsStyles.status, settingsStyles.statusError)} role="alert">
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
                            {...stylex.props(settingsStyles.form, isCompact && settingsStyles.stackOverlay)}
                            onSubmit={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                void settingsForm.handleSubmit();
                            }}
                        >
                            <div className={`settings-tab-panel ${stylex.props(isCompact && settingsStyles.tabPanelOverlay).className ?? ''}`}>

                            {activeTab === 'providers' ? (
                            <div>
                                <SettingsSection
                                    title="服务"
                                >
                                    <SettingField
                                        form={settingsForm}
                                        name="providers.customUrl"
                                        label="接口地址"
                                        placeholder="https://api.openai.com/v1"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <div {...stylex.props(settingsStyles.inlinePanel)}>
                                        <div {...stylex.props(settingsStyles.inlineHeader)}>
                                            <div>
                                                <h3 {...stylex.props(settingsStyles.sectionTitle)}>API Key</h3>
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
                                        placeholder="gpt-5.2"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="providers.fallbackProviderModel"
                                        label="后台模型"
                                        description="生成失败重试与后台任务（如会话摘要整理）共用的模型；留空则使用主模型。"
                                        placeholder="gpt-4.1-mini"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    {canRunProviderActions ? (
                                        <div {...stylex.props(settingsStyles.inlinePanel)}>
                                            <div {...stylex.props(settingsStyles.inlineHeader)}>
                                                <div>
                                                    <h3 {...stylex.props(settingsStyles.sectionTitle)}>连接</h3>
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


                            {activeTab === 'providers' ? (
                                <SettingsSection
                                    title="对话记忆"
                                >
                                    <SettingField
                                        form={settingsForm}
                                        name="memory.enabled"
                                        label="历史会话轮次总结"
                                        description="开启后，最近轮数之外的旧轮在后台被摘要成文字，原始消息保留可在摘要卡展开。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="memory.keepTurns"
                                        label="保留完整显示的最近轮数"
                                        variant="number"
                                        min={1}
                                        step={1}
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="memory.role"
                                        label="摘要注入角色"
                                        variant="select"
                                        options={[
                                            { value: 'system', label: '系统（旁白回顾）' },
                                            { value: 'assistant', label: '助手（角色自己记得）' },
                                            { value: 'user', label: '用户' },
                                        ]}
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="memory.maxTokens"
                                        label="单条摘要最大输出 tokens"
                                        variant="number"
                                        min={1}
                                        step={50}
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="memory.prompt"
                                        label="摘要 Prompt（留空使用默认）"
                                        variant="textarea"
                                        placeholder="你是聊天记录整理助手……"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="memory.wrap"
                                        variant="textarea"
                                        label="摘要包裹模板（{{summary}} 为占位符，留空使用默认）"
                                        placeholder="【早前剧情回顾】&#10;{{summary}}"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                </SettingsSection>
                            ) : null}

                            {activeTab === 'providers' ? (
                                <SettingsSection
                                    title="消息渲染设置"
                                >
                                    <SettingField
                                        form={settingsForm}
                                        name="rendering.frontendFramesEnabled"
                                        label="启用 Frontend Frames"
                                        description="会执行卡片内脚本。"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="rendering.frontendFramesDepth"
                                        label="渲染深度（0 = 全部）"
                                        variant="number"
                                        min={0}
                                        step={1}
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="rendering.frontendFramesDepthIgnoreHidden"
                                        label="深度计数忽略隐藏楼层"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="rendering.frontendFramesCollapseCodeBlock"
                                        label="折叠代码块"
                                        variant="select"
                                        options={[
                                            { value: 'frontend_only', label: '仅前端块' },
                                            { value: 'all', label: '所有代码块' },
                                            { value: 'none', label: '从不' },
                                        ]}
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="rendering.frontendFramesSkipHighlight"
                                        label="跳过框架块的语法高亮"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="rendering.frontendFramesUseBlobUrl"
                                        label="使用 blob URL（调试）"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="rendering.frontendFramesAllowStreaming"
                                        label="流式期间渲染"
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                </SettingsSection>
                            ) : null}
                            </div>

                            <div {...stylex.props(settingsStyles.saveBar, isCompact && settingsStyles.saveBarOverlay)}>
                                <div {...stylex.props(settingsStyles.saveBarNote)}>
                                    {isCompact ? (
                                    <button
                                        type="button"
                                        {...stylex.props(settingsStyles.button, settingsStyles.buttonSecondary)}
                                        aria-expanded={showDiagnostics}
                                        aria-controls="settings-diagnostics"
                                        onClick={() => setShowDiagnostics(value => !value)}
                                    >
                                        诊断
                                    </button>
                                    ) : null}
                                </div>
                                <settingsForm.Subscribe selector={state => state.isPristine}>
                                    {isPristine => (
                                        <button
                                            type="submit"
                                            {...stylex.props(settingsStyles.button, settingsStyles.buttonPrimary)}
                                            disabled={isBusy || settingsQuery.isPending || settingsQuery.isFetching || isPristine || hasRevisionConflict}
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

                {showDiagnostics && (
                <aside {...stylex.props(settingsStyles.side)} id="settings-diagnostics">
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
                        <h2 {...stylex.props(settingsStyles.sectionTitle)}>字段归属</h2>
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
                    </section>
                </aside>
                )}
            </div>
        </main>
    );
}
