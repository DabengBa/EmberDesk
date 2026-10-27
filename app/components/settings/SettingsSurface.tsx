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
import { startTransition, useCallback, useEffect, useMemo, useReducer, useState, useSyncExternalStore } from 'react';
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
import { translate, useTranslated } from '@/compat/i18n.js';
import { readStoredUiLocale, setUiLocale, uiLocaleOptions } from '../../../public/scripts/ui-locale.js';
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

/** Translates a UI string; the key doubles as the English source text. */
const t = (key: string) => translate(key, null);

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
        frontendFramesCollapseCodeBlock: z.enum(['all', 'none']),
        frontendFramesSkipHighlight: z.boolean(),
        frontendFramesUseBlobUrl: z.boolean(),
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
        return t('Settings could not be saved.');
    }

    const flattenedErrors = Object.values(parsed.error.flatten().fieldErrors)
        .flat()
        .filter((message): message is string => typeof message === 'string' && message.length > 0);

    return flattenedErrors[0] ?? parsed.error.issues[0]?.message ?? t('Settings could not be saved.');
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
    useTranslated('');
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
    const [uiLocale] = useState(() => readStoredUiLocale());

    // Subscribe once for every string in this tree: the standalone bundle and
    // the workspace drawer can both render before locale data lands, so the
    // surface re-renders when it arrives instead of freezing the first locale.
    const [, bumpLocale] = useReducer(value => value + 1, 0);
    useEffect(() => {
        const handler = () => bumpLocale();
        document.addEventListener('i18n:applied', handler);
        return () => document.removeEventListener('i18n:applied', handler);
    }, []);

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
    const providerStatusLabel = providerStatus === 'no_connection' ? t('Not connected') : providerStatus;
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
            throw new MessageError(t('Save an API key or configure a custom endpoint URL first.'));
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
                throw new MessageError(t('Connection failed: the endpoint did not return a model list. Check the endpoint URL and API key.'));
            }

            setPageProviderStatus('online');
            const modelCount = Array.isArray(data.data) ? data.data.length : null;
            setSaveStatus({
                kind: 'info',
                message: modelCount === null
                    ? t('Connected.')
                    : translate('Connected. The endpoint returned ${0} models.', null)
                        .replace('${0}', String(modelCount)),
            });
            return;
        }

        if (!model) {
            throw new MessageError(t('Fill in the primary model before testing.'));
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
            throw new MessageError(t('Test request failed: the endpoint returned no usable reply. Check the connection settings and API key.'));
        }

        setPageProviderStatus('online');
        setSaveStatus({ kind: 'info', message: t('Received a reply from the API.') });
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
            setPageError(error instanceof Error ? error.message : t('Provider action failed.'));
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
                throw new MessageError(t('Could not obtain a CSRF token.'));
            }

            const data = await readJsonObject(response);
            if (typeof data.token !== 'string' || data.token.length === 0) {
                throw new MessageError(t('Could not obtain a CSRF token.'));
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

        throw result.error ?? csrfTokenError ?? new MessageError(t('Could not obtain a CSRF token.'));
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
                throw new MessageError(t('Could not load settings.'));
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
                throw new MessageError(t('Could not read the provider secret status.'));
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
                setPageError(t('Settings have not finished loading.'));
                return;
            }

            if (hasRevisionConflict) {
                setPageError(t('Settings were updated in another session. Reload the current settings, then merge and save the draft.'));
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
                throw new MessageError(t('Settings have not finished loading.'));
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
                    throw new MessageError(t('Settings were updated in another session; the local draft is still kept. Reload the current settings, merge, and save again.'));
                }
                throw new MessageError(t('Settings could not be saved.'));
            }

            await saveSettingsToRuntime(payload, runtime);
            await refetchSettings();
            setHasRevisionConflict(false);
            setSaveStatus({ kind: 'success', message: t('Saved') });
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
                    throw new MessageError(t('Provider API key could not be saved.'));
                }

                if (result.status === 'empty') {
                    throw new MessageError(t('Enter an API key before saving.'));
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
                        throw new MessageError(t('Provider API key could not be cleared.'));
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
            { label: t('OpenAI presets'), value: Array.isArray(settingsData.openai_setting_names) ? settingsData.openai_setting_names.length : 0 },
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
            setPageError(result.error instanceof Error ? result.error.message : t('Could not reload the current settings.'));
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
                                <h1 {...stylex.props(settingsStyles.pageTitle)}>{t('Settings')}</h1>
                            </div>
                            <div {...stylex.props(settingsStyles.headerActions)}>
                                <button
                                    type="button"
                                    {...stylex.props(settingsStyles.button, settingsStyles.buttonSecondary)}
                                    aria-expanded={showDiagnostics}
                                    aria-controls="settings-diagnostics"
                                    onClick={() => setShowDiagnostics(value => !value)}
                                >
                                    {t('Diagnostics')}
                                </button>
                                <a
                                    {...stylex.props(settingsStyles.button, settingsStyles.buttonSecondary, settingsStyles.workspaceLink)}
                                    className={`settings-workspace-link ${stylex.props(settingsStyles.button, settingsStyles.buttonSecondary, settingsStyles.workspaceLink).className ?? ''}`}
                                    href="/"
                                    data-doc-id="page.chat_workspace"
                                >
                                    {t('Back to workspace')}
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
                                {t('Loading current settings...')}
                            </div>
                        )}

                        {settingsQuery.isError && !settingsQuery.isPending ? (
                            <div {...stylex.props(settingsStyles.status, settingsStyles.statusError)} role="alert">
                                <p>{t('Settings failed to load.')}</p>
                                <p>{settingsQueryError instanceof Error ? settingsQueryError.message : t('Check the service and try again.')}</p>
                                <button
                                    type="button"
                                    {...stylex.props(settingsStyles.button, settingsStyles.buttonSecondary)}
                                    onClick={() => void refetchSettings()}
                                    disabled={settingsQuery.isFetching}
                                >
                                    {t('Reload settings')}
                                </button>
                            </div>
                        ) : null}

                        {secretsQuery.isError && !secretsQuery.isPending ? (
                            <div {...stylex.props(settingsStyles.status, settingsStyles.statusError)} role="alert">
                                <p>{t('Secret status could not be read. Regular settings fields are still editable.')}</p>
                                <p>{secretsQueryError instanceof Error ? secretsQueryError.message : t('Try again later.')}</p>
                                <button
                                    type="button"
                                    {...stylex.props(settingsStyles.button, settingsStyles.buttonSecondary)}
                                    onClick={() => void refetchSecrets()}
                                    disabled={secretsQuery.isFetching}
                                >
                                    {t('Retry secret status')}
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
                                <p>{t('This draft is based on an outdated revision and has not been lost. Reloading discards the local draft and shows the currently saved settings.')}</p>
                                <button
                                    type="button"
                                    {...stylex.props(settingsStyles.button, settingsStyles.buttonSecondary)}
                                    onClick={() => void reloadCurrentSettings()}
                                    disabled={isBusy}
                                >
                                    {t('Reload current settings')}
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

                            <div>
                                <SettingsSection title={t('Interface')}>
                                    <div {...stylex.props(settingsStyles.field)}>
                                        <label htmlFor="settings-ui-language" {...stylex.props(settingsStyles.fieldLabel)}>
                                            {t('Language')}
                                        </label>
                                        <select
                                            id="settings-ui-language"
                                            className="text_pole"
                                            value={uiLocale}
                                            onChange={event => setUiLocale(event.target.value)}
                                        >
                                            {uiLocaleOptions.map(option => (
                                                <option key={option.id} value={option.id}>{option.label}</option>
                                            ))}
                                        </select>
                                        <p {...stylex.props(settingsStyles.fieldDescription)}>
                                            {t('Switching the language reloads the page.')}
                                        </p>
                                    </div>
                                </SettingsSection>
                            </div>

                            {activeTab === 'providers' ? (
                            <div>
                                <SettingsSection
                                    title={t('Service')}
                                >
                                    <SettingField
                                        form={settingsForm}
                                        name="providers.customUrl"
                                        label={t('Endpoint URL')}
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
                                                        successMessage: t('Provider API key saved.'),
                                                        clearInput: () => setProviderSecretInput(''),
                                                    });
                                                }}
                                            >
                                                {t('Save key')}
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
                                                        successMessage: t('Provider API key cleared.'),
                                                        clearInput: () => setProviderSecretInput(''),
                                                    });
                                                }}
                                            >
                                                {t('Clear key')}
                                            </button>
                                        </div>
                                    </div>

                                    <SettingField
                                        form={settingsForm}
                                        name="providers.openaiModel"
                                        label={t('Model')}
                                        placeholder="gpt-5.2"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="providers.fallbackProviderModel"
                                        label={t('Background model')}
                                        placeholder="gpt-4.1-mini"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    {canRunProviderActions ? (
                                        <div {...stylex.props(settingsStyles.inlinePanel)}>
                                            <div {...stylex.props(settingsStyles.inlineHeader)}>
                                                <div>
                                                    <h3 {...stylex.props(settingsStyles.sectionTitle)}>{t('Connection')}</h3>
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
                                                    {t(providerActionBusy === 'connect' ? 'Connecting…' : 'Connect')}
                                                </button>
                                                <button
                                                    type="button"
                                                    id="provider-test-button"
                                                    {...stylex.props(settingsStyles.button, settingsStyles.buttonSecondary)}
                                                    disabled={providerActionBusy !== null}
                                                    onClick={() => { void handleProviderAction('test'); }}
                                                >
                                                    {t(providerActionBusy === 'test' ? 'Testing…' : 'Test')}
                                                </button>
                                            </div>
                                        </div>
                                    ) : null}
                                </SettingsSection>
                            </div>
                            ) : null}


                            {activeTab === 'providers' ? (
                                <SettingsSection
                                    title={t('Chat memory')}
                                >
                                    <SettingField
                                        form={settingsForm}
                                        name="memory.enabled"
                                        label={t('Summarize earlier conversation turns')}
                                        description={t('When enabled, turns older than the recent window are summarized into text in the background. Original messages are kept and can be expanded from the summary card.')}
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="memory.keepTurns"
                                        label={t('Recent turns kept in full')}
                                        variant="number"
                                        min={1}
                                        step={1}
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="memory.role"
                                        label={t('Summary injection role')}
                                        variant="select"
                                        options={[
                                            { value: 'system', label: t('System (narration recap)') },
                                            { value: 'assistant', label: t('Assistant (the character remembers)') },
                                            { value: 'user', label: t('User') },
                                        ]}
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="memory.maxTokens"
                                        label={t('Max output tokens per summary')}
                                        variant="number"
                                        min={1}
                                        step={1}
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="memory.prompt"
                                        label={t('Summary prompt (leave empty to use the default)')}
                                        variant="textarea"
                                        placeholder={t('You are a chat log summarizer…')}
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="memory.wrap"
                                        variant="textarea"
                                        label={t('Summary wrapper template ({{summary}} is the placeholder; leave empty to use the default)')}
                                        placeholder={t('[Earlier recap]&#10;{{summary}}')}
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                </SettingsSection>
                            ) : null}

                            {activeTab === 'providers' ? (
                                <SettingsSection
                                    title={t('Message rendering')}
                                >
                                    <SettingField
                                        form={settingsForm}
                                        name="rendering.frontendFramesEnabled"
                                        label={t('Enable Frontend Frames')}
                                        description={t('Runs scripts embedded in cards.')}
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="rendering.frontendFramesDepth"
                                        label={t('Render depth (0 = all)')}
                                        variant="number"
                                        min={0}
                                        step={1}
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="rendering.frontendFramesDepthIgnoreHidden"
                                        label={t('Depth counting ignores hidden messages')}
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="rendering.frontendFramesCollapseCodeBlock"
                                        label={t('Collapse ordinary code blocks')}
                                        variant="select"
                                        options={[
                                            { value: 'all', label: t('Ordinary code blocks') },
                                            { value: 'none', label: t('Never') },
                                        ]}
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="rendering.frontendFramesSkipHighlight"
                                        label={t('Skip syntax highlighting for frame blocks')}
                                        variant="toggle"
                                        disabled={isBusy}
                                        onValueChange={clearTransientState}
                                    />
                                    <SettingField
                                        form={settingsForm}
                                        name="rendering.frontendFramesUseBlobUrl"
                                        label={t('Use blob URL (debug)')}
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
                                        {t('Diagnostics')}
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
                                            {t(saveMutation.isPending ? 'Saving...' : isPristine ? 'Save after changes' : 'Save settings')}
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
                        <h2 {...stylex.props(settingsStyles.sectionTitle)}>{t('Payload summary')}</h2>
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
                        <h2 {...stylex.props(settingsStyles.sectionTitle)}>{t('Field ownership')}</h2>
                        <div {...stylex.props(settingsStyles.diagnosticsBody)}>
                            <div>
                                {Object.entries(settingsCoverage.reactOwned as Record<string, string[]>).map(([tabId, paths]) => (
                                    <div key={tabId} {...stylex.props(settingsStyles.diagnosticsGroup)}>
                                        <h3 {...stylex.props(settingsStyles.diagnosticsTitle)}>{translate(settingsTabDefinitions.find(tab => tab.id === tabId)?.labelKey ?? '')}</h3>
                                        <ul {...stylex.props(settingsStyles.diagnosticsList)}>
                                            {paths.map((coveragePath: string) => (
                                                <li key={coveragePath}>{coveragePath}</li>
                                            ))}
                                        </ul>
                                    </div>
                                ))}
                            </div>

                            <div {...stylex.props(settingsStyles.diagnosticsGroup)}>
                                <h3 {...stylex.props(settingsStyles.diagnosticsTitle)}>{t('Legacy fields')}</h3>
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
