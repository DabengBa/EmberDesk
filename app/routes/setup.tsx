import { createFileRoute } from '@tanstack/react-router';
import * as stylex from '@stylexjs/stylex';
import { useForm } from '@tanstack/react-form';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { z } from 'zod';
import { SetupForm } from '@/components/setup/SetupForm';
import { buildSetupRequestBody, getSetupErrorMessage, setupMessages } from '@/lib/setup-helpers';
import { loginStyles } from '@/styles/login.styles';

export const Route = createFileRoute('/setup')({
    component: SetupPage,
});

const freshSchema = z.object({
    handle: z.string().trim().min(1, setupMessages.handleRequired),
    displayName: z.string(),
    password: z.string().min(1, setupMessages.passwordRequired),
    confirmPassword: z.string(),
}).refine(data => data.password === data.confirmPassword, {
    message: setupMessages.passwordMismatch,
    path: ['confirmPassword'],
});

const setPasswordSchema = z.object({
    handle: z.string(),
    displayName: z.string(),
    password: z.string().min(1, setupMessages.passwordRequired),
    confirmPassword: z.string(),
}).refine(data => data.password === data.confirmPassword, {
    message: setupMessages.passwordMismatch,
    path: ['confirmPassword'],
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
        return setupMessages.genericError;
    }

    const flattenedErrors = Object.values(parsed.error.flatten().fieldErrors)
        .flat()
        .filter((message): message is string => typeof message === 'string' && message.length > 0);

    return flattenedErrors[0] ?? parsed.error.issues[0]?.message ?? setupMessages.genericError;
}

const SETUP_FIELD_IDS: Record<string, string> = {
    handle: 'handle',
    displayName: 'name',
    password: 'password',
    confirmPassword: 'confirmPassword',
};

function focusFirstInvalidField(schema: z.ZodTypeAny, values: unknown) {
    const parsed = schema.safeParse(values);
    if (parsed.success) {
        return null;
    }

    for (const issue of parsed.error.issues) {
        const fieldName = typeof issue.path[0] === 'string' ? issue.path[0] : undefined;
        const targetId = fieldName ? SETUP_FIELD_IDS[fieldName] : undefined;
        if (targetId) {
            document.getElementById(targetId)?.focus();
            return fieldName ?? null;
        }
    }

    return null;
}

function getDisplayErrorMessage(error: unknown) {
    if (error instanceof MessageError) {
        return error.message;
    }

    return String(error);
}

async function readJsonObject(response: Response) {
    const data = await response.json().catch(() => ({}));
    return typeof data === 'object' && data !== null ? data as Record<string, unknown> : {};
}

function SetupPage() {
    const [passwordVisible, setPasswordVisible] = useState(false);
    const [confirmPasswordVisible, setConfirmPasswordVisible] = useState(false);
    const [setupError, setSetupError] = useState('');
    const [setupInvalidField, setSetupInvalidField] = useState<string | null>(null);
    const [setupComplete, setSetupComplete] = useState(false);

    const setupModeQuery = useQuery({
        queryKey: ['setup', 'mode'],
        queryFn: async () => {
            const response = await fetch('/api/users/setup-mode').catch(() => {
                throw new MessageError('无法读取安装状态。');
            });
            if (!response.ok) {
                throw new MessageError('无法读取安装状态。');
            }

            const data = await readJsonObject(response);
            if (data.mode === 'complete') {
                return 'complete' as const;
            }
            return data.mode === 'set-password' ? 'set-password' as const : 'fresh' as const;
        },
        retry: false,
    });
    const { data: setupModeData } = setupModeQuery;

    const csrfTokenQuery = useQuery({
        queryKey: ['setup', 'csrf-token'],
        queryFn: async () => {
            const response = await fetch('/csrf-token');
            if (!response.ok) {
                throw new MessageError(setupMessages.genericError);
            }

            const data = await readJsonObject(response);
            if (typeof data.token !== 'string' || data.token.length === 0) {
                throw new MessageError(setupMessages.genericError);
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

        throw result.error ?? csrfTokenError ?? new MessageError(setupMessages.genericError);
    }

    const setupMode = setupModeData === 'set-password' ? 'set-password' : 'fresh';
    const activeSchema = setupMode === 'set-password' ? setPasswordSchema : freshSchema;

    const setupMutation = useMutation({
        mutationFn: async (values: {
            handle: string;
            displayName: string;
            password: string;
            confirmPassword: string;
        }) => {
            const csrfToken = await ensureCsrfToken();
            const response = await fetch('/api/users/setup', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': csrfToken,
                },
                body: JSON.stringify(buildSetupRequestBody(setupMode, {
                    handle: values.handle.trim(),
                    name: values.displayName.trim(),
                    password: values.password,
                })),
            });

            if (!response.ok) {
                const errorData = await readJsonObject(response);

                if (response.status === 403 && errorData.error === 'Setup already completed') {
                    window.location.href = '/login';
                    return null;
                }

                throw new MessageError(getSetupErrorMessage(errorData.error));
            }

            return readJsonObject(response);
        },
        retry: false,
    });

    const setupForm = useForm({
        canSubmitWhenInvalid: true,
        defaultValues: {
            handle: '',
            displayName: '',
            password: '',
            confirmPassword: '',
        },
        validators: {
            onChange: activeSchema,
            onSubmit: activeSchema,
        },
        onSubmitInvalid: ({ value }) => {
            setSetupError(getSchemaErrorMessage(activeSchema, value));
            setSetupInvalidField(focusFirstInvalidField(activeSchema, value));
        },
        onSubmit: async ({ value }) => {
            setSetupError('');
            setSetupInvalidField(null);

            try {
                const data = await setupMutation.mutateAsync(value);
                if (data && typeof data.handle === 'string' && data.handle.length > 0) {
                    setSetupComplete(true);
                    window.location.href = '/';
                }
            } catch (error) {
                setSetupComplete(false);
                setSetupError(getDisplayErrorMessage(error));
            }
        },
    });

    useEffect(() => {
        if (setupModeData === 'complete') {
            window.location.href = '/login';
        }
    }, [setupModeData]);

    return (
        <main {...stylex.props(loginStyles.page)}>
            {setupModeQuery.isPending ? (
                <section {...stylex.props(loginStyles.card)} aria-busy="true">
                    <p {...stylex.props(loginStyles.fieldLabel)}>正在读取安装状态...</p>
                </section>
            ) : setupModeQuery.isError ? (
                <section {...stylex.props(loginStyles.card)}>
                    <div {...stylex.props(loginStyles.error, loginStyles.errorVisible)} role="alert">
                        {setupModeQuery.error instanceof Error ? setupModeQuery.error.message : '无法读取安装状态。'}
                    </div>
                    <div {...stylex.props(loginStyles.actions)}>
                        <button
                            type="button"
                            {...stylex.props(loginStyles.btn)}
                            disabled={setupModeQuery.isFetching}
                            onClick={() => void setupModeQuery.refetch()}
                        >
                            重试
                        </button>
                    </div>
                </section>
            ) : (
            <SetupForm
                form={setupForm}
                mode={setupMode}
                isSubmitting={setupMutation.isPending}
                isComplete={setupComplete}
                errorMessage={setupError}
                invalidField={setupInvalidField}
                passwordVisible={passwordVisible}
                confirmPasswordVisible={confirmPasswordVisible}
                onHandleChange={() => {
                    setupMutation.reset();
                    setSetupError('');
                    setSetupInvalidField(null);
                }}
                onDisplayNameChange={() => {
                    setupMutation.reset();
                    setSetupError('');
                    setSetupInvalidField(null);
                }}
                onPasswordChange={() => {
                    setupMutation.reset();
                    setSetupError('');
                    setSetupInvalidField(null);
                }}
                onConfirmPasswordChange={() => {
                    setupMutation.reset();
                    setSetupError('');
                    setSetupInvalidField(null);
                }}
                onTogglePassword={() => setPasswordVisible(current => !current)}
                onToggleConfirmPassword={() => setConfirmPasswordVisible(current => !current)}
                onSubmit={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    void setupForm.handleSubmit();
                }}
            />
            )}
        </main>
    );
}
