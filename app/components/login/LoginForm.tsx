import type { FormEvent } from 'react';
import { PasswordInput } from './PasswordInput';

type LoginFormProps = {
    form: any;
    passwordVisible: boolean;
    loginVisible: boolean;
    isSubmitting: boolean;
    isLockedOut: boolean;
    errorMessage: string;
    onHandleChange: () => void;
    onPasswordChange: () => void;
    onTogglePassword: () => void;
    onSubmit: (event: FormEvent<HTMLFormElement>) => void;
    onShowRecovery: () => void;
};

export function LoginForm({
    form,
    passwordVisible,
    loginVisible,
    isSubmitting,
    isLockedOut,
    errorMessage,
    onHandleChange,
    onPasswordChange,
    onTogglePassword,
    onSubmit,
    onShowRecovery,
}: LoginFormProps) {
    const alertClassName = `login-error${errorMessage ? ' login-error--visible' : ''}`;
    const controlsDisabled = isSubmitting || isLockedOut;
    const buttonLabel = isSubmitting ? '登录中...' : isLockedOut ? '已锁定' : '登录';

    return (
        <section className="login-card login-card--entry" id="loginCard" style={{ display: loginVisible ? 'block' : 'none' }} aria-labelledby="login-title">
            <header className="login-header">
                <img src="/img/logo.png" alt="" className="login-logo" />
                <h1 id="login-title">EmberDesk</h1>
            </header>

            <form id="loginForm" className="login-form" noValidate onSubmit={onSubmit}>
                <div className="login-field-stack">
                    <form.Field name="handle">
                        {(field: any) => (
                            <div className="login-field" id="handleField">
                                <label htmlFor="handle">用户名</label>
                                <input
                                    id="handle"
                                    name="handle"
                                    type="text"
                                    autoComplete="username"
                                    placeholder="请输入用户名"
                                    required
                                    aria-required="true"
                                    value={field.state.value}
                                    onBlur={field.handleBlur}
                                    onChange={event => {
                                        field.handleChange(event.target.value);
                                        onHandleChange();
                                    }}
                                    disabled={controlsDisabled}
                                />
                            </div>
                        )}
                    </form.Field>

                    <form.Field name="password">
                        {(field: any) => (
                            <PasswordInput
                                id="password"
                                name="password"
                                toggleId="passwordToggle"
                                label="密码"
                                autoComplete="current-password"
                                placeholder="请输入密码"
                                value={field.state.value}
                                visible={passwordVisible}
                                disabled={controlsDisabled}
                                onChange={event => {
                                    field.handleChange(event.target.value);
                                    onPasswordChange();
                                }}
                                onToggle={onTogglePassword}
                            />
                        )}
                    </form.Field>
                </div>

                <div className="login-actions">
                    <button type="submit" className="login-btn" id="loginButton" disabled={controlsDisabled}>
                        {buttonLabel}
                    </button>
                </div>
            </form>

            <div className={alertClassName} id="errorMessage" role="alert" aria-live="assertive">
                {errorMessage}
            </div>

            <button type="button" className="login-forgot" id="forgotLink" onClick={() => {
                onShowRecovery();
            }}
            >
                忘记密码？
            </button>
        </section>
    );
}
