import { createFileRoute } from '@tanstack/react-router';
import { useForm } from '@tanstack/react-form';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import {
    buildHomeRedirectUrl,
    formatLockoutMessage,
    getLoginErrorMessage,
    loginMessages,
} from '@/lib/login-helpers';
import { LoginForm } from '@/components/login/LoginForm';
import { RecoveryForm } from '@/components/login/RecoveryForm';

export const Route = createFileRoute('/login')({
    component: LoginPage,
});

const loginSchema = z.object({
    handle: z.string().trim().min(1, loginMessages.handleRequired),
    password: z.string(),
});

const recoveryStep1Schema = z.object({
    handle: z.string().trim().min(1, loginMessages.handleRequired),
    code: z.string(),
    newPassword: z.string(),
});

const recoveryStep2Schema = z.object({
    handle: z.string().trim().min(1, loginMessages.handleRequired),
    code: z.string().trim().min(1, loginMessages.codeRequired),
    newPassword: z.string(),
});

class MessageError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'MessageError';
    }
}

class LockoutError extends MessageError {
    retryAfter: number;

    constructor(retryAfter: number) {
        super(formatLockoutMessage(retryAfter));
        this.name = 'LockoutError';
        this.retryAfter = retryAfter;
    }
}

function getSchemaErrorMessage(schema: z.ZodTypeAny, values: unknown) {
    const parsed = schema.safeParse(values);
    if (parsed.success) {
        return loginMessages.genericError;
    }

    const flattenedErrors = Object.values(parsed.error.flatten().fieldErrors)
        .flat()
        .filter((message): message is string => typeof message === 'string' && message.length > 0);

    return flattenedErrors[0] ?? parsed.error.issues[0]?.message ?? loginMessages.genericError;
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

function LoginPage() {
    const [passwordVisible, setPasswordVisible] = useState(false);
    const [recoveryStep, setRecoveryStep] = useState<1 | 2>(1);
    const [loginError, setLoginError] = useState('');
    const [recoveryError, setRecoveryError] = useState('');
    const [loginVisible, setLoginVisible] = useState(true);
    const [lockoutSeconds, setLockoutSeconds] = useState<number | null>(null);
    const lockoutTimerRef = useRef<number | null>(null);

    const csrfTokenQuery = useQuery({
        queryKey: ['login', 'csrf-token'],
        queryFn: async () => {
            const response = await fetch('/csrf-token');
            if (!response.ok) {
                throw new MessageError(loginMessages.genericError);
            }

            const data = await readJsonObject(response);
            if (typeof data.token !== 'string' || data.token.length === 0) {
                throw new MessageError(loginMessages.genericError);
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

        throw result.error ?? new MessageError(loginMessages.genericError);
    }

    const loginMutation = useMutation({
        mutationFn: async (values: z.infer<typeof loginSchema>) => {
            const csrfToken = await ensureCsrfToken();
            const response = await fetch('/api/users/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': csrfToken,
                },
                body: JSON.stringify({
                    handle: values.handle.trim(),
                    password: values.password,
                }),
            });

            if (!response.ok) {
                const errorData = await readJsonObject(response);

                if (response.status === 429) {
                    const retryAfterHeader = Number.parseInt(response.headers.get('Retry-After') || '60', 10);
                    throw new LockoutError(Number.isFinite(retryAfterHeader) ? retryAfterHeader : 60);
                }

                throw new MessageError(getLoginErrorMessage(errorData.error));
            }

            return readJsonObject(response);
        },
        retry: false,
    });

    const recoveryStep1Mutation = useMutation({
        mutationFn: async (values: Pick<z.infer<typeof recoveryStep2Schema>, 'handle'>) => {
            const csrfToken = await ensureCsrfToken();
            const response = await fetch('/api/users/recover-step1', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': csrfToken,
                },
                body: JSON.stringify({
                    handle: values.handle.trim(),
                }),
            });

            if (!response.ok) {
                const errorData = await readJsonObject(response);
                throw new MessageError(getLoginErrorMessage(errorData.error));
            }

            return readJsonObject(response);
        },
        retry: false,
    });

    const recoveryStep2Mutation = useMutation({
        mutationFn: async (values: z.infer<typeof recoveryStep2Schema>) => {
            const csrfToken = await ensureCsrfToken();
            const response = await fetch('/api/users/recover-step2', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': csrfToken,
                },
                body: JSON.stringify({
                    handle: values.handle.trim(),
                    code: values.code.trim(),
                    newPassword: values.newPassword,
                }),
            });

            if (!response.ok) {
                const errorData = await readJsonObject(response);
                throw new MessageError(getLoginErrorMessage(errorData.error));
            }

            return readJsonObject(response);
        },
        retry: false,
    });

    const loginForm = useForm({
        canSubmitWhenInvalid: true,
        defaultValues: {
            handle: '',
            password: '',
        },
        validators: {
            onChange: loginSchema,
            onSubmit: loginSchema,
        },
        onSubmitInvalid: ({ value }) => {
            setLoginError(getSchemaErrorMessage(loginSchema, value));
        },
        onSubmit: async ({ value }) => {
            setLoginError('');

            try {
                const data = await loginMutation.mutateAsync(value);
                if (typeof data.handle === 'string' && data.handle.length > 0) {
                    window.location.href = buildHomeRedirectUrl(window.location.href);
                }
            } catch (error) {
                if (error instanceof LockoutError) {
                    setLockoutSeconds(error.retryAfter);
                    setLoginError(error.message);
                    return;
                }

                setLoginError(getDisplayErrorMessage(error));
            }
        },
    });

    const activeRecoverySchema = recoveryStep === 1 ? recoveryStep1Schema : recoveryStep2Schema;

    const recoveryForm = useForm({
        canSubmitWhenInvalid: true,
        defaultValues: {
            handle: '',
            code: '',
            newPassword: '',
        },
        validators: {
            onChange: activeRecoverySchema,
            onSubmit: activeRecoverySchema,
        },
        onSubmitInvalid: ({ value }) => {
            setRecoveryError(getSchemaErrorMessage(activeRecoverySchema, value));
        },
        onSubmit: async ({ value }) => {
            setRecoveryError('');

            try {
                if (recoveryStep === 1) {
                    await recoveryStep1Mutation.mutateAsync({ handle: value.handle });
                    setRecoveryStep(2);
                    return;
                }

                await recoveryStep2Mutation.mutateAsync(value);
                showLogin();
            } catch (error) {
                setRecoveryError(getDisplayErrorMessage(error));
            }
        },
    });

    useEffect(() => {
        if (lockoutSeconds === null) {
            return;
        }

        if (lockoutTimerRef.current !== null) {
            window.clearInterval(lockoutTimerRef.current);
        }

        lockoutTimerRef.current = window.setInterval(() => {
            setLockoutSeconds(current => {
                if (current === null || current <= 1) {
                    if (lockoutTimerRef.current !== null) {
                        window.clearInterval(lockoutTimerRef.current);
                        lockoutTimerRef.current = null;
                    }
                    setLoginError('');
                    return null;
                }

                const nextValue = current - 1;
                setLoginError(formatLockoutMessage(nextValue));
                return nextValue;
            });
        }, 1000);

        return () => {
            if (lockoutTimerRef.current !== null) {
                window.clearInterval(lockoutTimerRef.current);
                lockoutTimerRef.current = null;
            }
        };
    }, [lockoutSeconds]);

    function showRecovery() {
        setLoginVisible(false);
        setRecoveryStep(1);
        setRecoveryError('');
        recoveryStep1Mutation.reset();
        recoveryStep2Mutation.reset();
        recoveryForm.setFieldValue('handle', loginForm.state.values.handle);
        recoveryForm.setFieldValue('code', '');
        recoveryForm.setFieldValue('newPassword', '');
    }

    function showLogin() {
        setLoginVisible(true);
        setRecoveryStep(1);
        setRecoveryError('');
        recoveryStep1Mutation.reset();
        recoveryStep2Mutation.reset();
        recoveryForm.setFieldValue('code', '');
        recoveryForm.setFieldValue('newPassword', '');
    }

    return (
        <main className="login-page" role="main">
            <LoginForm
                form={loginForm}
                passwordVisible={passwordVisible}
                loginVisible={loginVisible}
                isSubmitting={loginMutation.isPending || lockoutSeconds !== null}
                errorMessage={loginError}
                onHandleChange={() => {
                    loginMutation.reset();
                    if (lockoutSeconds === null) {
                        setLoginError('');
                    }
                }}
                onPasswordChange={() => {
                    loginMutation.reset();
                    if (lockoutSeconds === null) {
                        setLoginError('');
                    }
                }}
                onTogglePassword={() => setPasswordVisible(current => !current)}
                onSubmit={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    void loginForm.handleSubmit();
                }}
                onShowRecovery={showRecovery}
            />

            <RecoveryForm
                form={recoveryForm}
                recoveryVisible={!loginVisible}
                currentStep={recoveryStep}
                isSubmitting={recoveryStep1Mutation.isPending || recoveryStep2Mutation.isPending}
                errorMessage={recoveryError}
                onHandleChange={() => {
                    recoveryStep1Mutation.reset();
                    recoveryStep2Mutation.reset();
                    setRecoveryError('');
                }}
                onCodeChange={() => {
                    recoveryStep2Mutation.reset();
                    setRecoveryError('');
                }}
                onNewPasswordChange={() => {
                    recoveryStep2Mutation.reset();
                    setRecoveryError('');
                }}
                onSubmit={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    void recoveryForm.handleSubmit();
                }}
                onCancel={showLogin}
            />
        </main>
    );
}
