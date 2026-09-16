import type { FormEvent } from 'react';
import * as stylex from '@stylexjs/stylex';
import { loginStyles } from '@/styles/login.styles';
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
    const controlsDisabled = isSubmitting || isLockedOut;
    const buttonLabel = isSubmitting ? '登录中...' : isLockedOut ? '已锁定' : '登录';

    return (
        <section {...stylex.props(loginStyles.card)} id="loginCard" style={{ display: loginVisible ? 'block' : 'none' }} aria-labelledby="login-title">
            <header {...stylex.props(loginStyles.header)}>
                <img src="/img/logo.png" alt="" {...stylex.props(loginStyles.logo)} />
                <h1 id="login-title" {...stylex.props(loginStyles.headerTitle)}>EmberDesk</h1>
            </header>

            <form id="loginForm" {...stylex.props(loginStyles.form)} noValidate onSubmit={onSubmit}>
                <div {...stylex.props(loginStyles.fieldStack)}>
                    <form.Field name="handle">
                        {(field: any) => (
                            <div {...stylex.props(loginStyles.field)} id="handleField">
                                <label htmlFor="handle" {...stylex.props(loginStyles.fieldLabel)}>用户名</label>
                                <input
                                    {...stylex.props(loginStyles.input)}
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

                <div {...stylex.props(loginStyles.actions)}>
                    <button type="submit" {...stylex.props(loginStyles.btn)} id="loginButton" disabled={controlsDisabled}>
                        {buttonLabel}
                    </button>
                </div>
            </form>

            <div {...stylex.props(loginStyles.error, errorMessage ? loginStyles.errorVisible : null)} id="errorMessage" role="alert" aria-live="assertive">
                {errorMessage}
            </div>

            <button type="button" {...stylex.props(loginStyles.forgot)} id="forgotLink" onClick={() => {
                onShowRecovery();
            }}
            >
                忘记密码？
            </button>
        </section>
    );
}
