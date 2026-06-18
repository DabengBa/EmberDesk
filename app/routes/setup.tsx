import { createFileRoute } from '@tanstack/react-router';
import { useForm } from '@tanstack/react-form';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { z } from 'zod';
import { SetupForm } from '@/components/setup/SetupForm';
import { buildSetupRequestBody, getSetupErrorMessage, setupMessages } from '@/lib/setup-helpers';

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
    const [setupComplete, setSetupComplete] = useState(false);

    const setupModeQuery = useQuery({
        queryKey: ['setup', 'mode'],
        queryFn: async () => {
            try {
                const response = await fetch('/api/users/setup-mode');
                if (response.ok) {
                    const data = await readJsonObject(response);
                    if (data.mode === 'complete') {
                        return 'complete' as const;
                    }
                    return data.mode === 'set-password' ? 'set-password' as const : 'fresh' as const;
                }
            } catch {
                // Fall back to fresh mode when setup-mode cannot be read.
            }

            return 'fresh' as const;
        },
        retry: false,
    });

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

    async function ensureCsrfToken() {
        if (typeof csrfTokenQuery.data === 'string' && csrfTokenQuery.data.length > 0) {
            return csrfTokenQuery.data;
        }

        const result = await csrfTokenQuery.refetch();
        if (typeof result.data === 'string' && result.data.length > 0) {
            return result.data;
        }

        throw result.error ?? new MessageError(setupMessages.genericError);
    }

    const setupMode = setupModeQuery.data === 'set-password' ? 'set-password' : 'fresh';
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
        },
        onSubmit: async ({ value }) => {
            setSetupError('');

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
        if (setupModeQuery.data === 'complete') {
            window.location.href = '/login';
        }
    }, [setupModeQuery.data]);

    return (
        <main className="login-page" role="main">
            <SetupForm
                form={setupForm}
                mode={setupMode}
                isSubmitting={setupMutation.isPending}
                isComplete={setupComplete}
                errorMessage={setupError}
                passwordVisible={passwordVisible}
                confirmPasswordVisible={confirmPasswordVisible}
                onHandleChange={() => {
                    setupMutation.reset();
                    setSetupError('');
                }}
                onDisplayNameChange={() => {
                    setupMutation.reset();
                    setSetupError('');
                }}
                onPasswordChange={() => {
                    setupMutation.reset();
                    setSetupError('');
                }}
                onConfirmPasswordChange={() => {
                    setupMutation.reset();
                    setSetupError('');
                }}
                onTogglePassword={() => setPasswordVisible(current => !current)}
                onToggleConfirmPassword={() => setConfirmPasswordVisible(current => !current)}
                onSubmit={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    void setupForm.handleSubmit();
                }}
            />
        </main>
    );
}
