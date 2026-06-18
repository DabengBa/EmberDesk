import type { FormEvent } from 'react';
import { setupMessages } from '@/lib/setup-helpers';
import { SetupPasswordInput } from './SetupPasswordInput';

type SetupMode = 'fresh' | 'set-password';

type SetupFormProps = {
    form: any;
    mode: SetupMode;
    isSubmitting: boolean;
    isComplete: boolean;
    errorMessage: string;
    passwordVisible: boolean;
    confirmPasswordVisible: boolean;
    onHandleChange: () => void;
    onDisplayNameChange: () => void;
    onPasswordChange: () => void;
    onConfirmPasswordChange: () => void;
    onTogglePassword: () => void;
    onToggleConfirmPassword: () => void;
    onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export function SetupForm({
    form,
    mode,
    isSubmitting,
    isComplete,
    errorMessage,
    passwordVisible,
    confirmPasswordVisible,
    onHandleChange,
    onDisplayNameChange,
    onPasswordChange,
    onConfirmPasswordChange,
    onTogglePassword,
    onToggleConfirmPassword,
    onSubmit,
}: SetupFormProps) {
    const isSetPasswordMode = mode === 'set-password';
    const alertClassName = `login-error${errorMessage ? ' login-error--visible' : ''}`;
    let buttonText = isSetPasswordMode ? '设置密码并登录' : '创建管理员账户';

    if (isSubmitting) {
        buttonText = isSetPasswordMode ? setupMessages.setting : setupMessages.creating;
    }

    if (isComplete) {
        buttonText = setupMessages.setupComplete;
    }

    return (
        <section className="login-card login-card--setup" id="setupCard" aria-labelledby="setup-title">
            <header className="login-header">
                <img src="/img/logo.png" alt="" className="login-logo" />
                <h1 id="setup-title">{isSetPasswordMode ? '设置密码' : '初始设置'}</h1>
            </header>

            <form id="setupForm" className="login-form" noValidate onSubmit={onSubmit}>
                <div className="login-field-group login-field-group--identity">
                    <form.Field name="handle">
                        {(field: any) => (
                            <div id="handleField" className="login-field" style={{ display: isSetPasswordMode ? 'none' : undefined }}>
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
                                    disabled={isSubmitting}
                                    onChange={event => {
                                        field.handleChange(event.target.value);
                                        onHandleChange();
                                    }}
                                />
                            </div>
                        )}
                    </form.Field>

                    <form.Field name="displayName">
                        {(field: any) => (
                            <div id="nameField" className="login-field" style={{ display: isSetPasswordMode ? 'none' : undefined }}>
                                <label htmlFor="name">显示名称 <span className="login-label-note">（可选）</span></label>
                                <input
                                    id="name"
                                    name="name"
                                    type="text"
                                    autoComplete="name"
                                    placeholder="留空则使用用户名"
                                    value={field.state.value}
                                    onBlur={field.handleBlur}
                                    disabled={isSubmitting}
                                    onChange={event => {
                                        field.handleChange(event.target.value);
                                        onDisplayNameChange();
                                    }}
                                />
                            </div>
                        )}
                    </form.Field>
                </div>

                <div className="login-field-group login-field-group--security">
                    <form.Field name="password">
                        {(field: any) => (
                            <SetupPasswordInput
                                id="password"
                                toggleId="passwordToggle"
                                label="密码"
                                placeholder="请输入密码"
                                value={field.state.value}
                                visible={passwordVisible}
                                disabled={isSubmitting}
                                onChange={event => {
                                    field.handleChange(event.target.value);
                                    onPasswordChange();
                                }}
                                onToggle={onTogglePassword}
                            />
                        )}
                    </form.Field>

                    <form.Field name="confirmPassword">
                        {(field: any) => (
                            <SetupPasswordInput
                                id="confirmPassword"
                                toggleId="confirmPasswordToggle"
                                label="确认密码"
                                placeholder="请再次输入密码"
                                value={field.state.value}
                                visible={confirmPasswordVisible}
                                disabled={isSubmitting}
                                onChange={event => {
                                    field.handleChange(event.target.value);
                                    onConfirmPasswordChange();
                                }}
                                onToggle={onToggleConfirmPassword}
                            />
                        )}
                    </form.Field>
                </div>

                <div className="login-actions">
                    <button type="submit" className="login-btn" id="setupButton" disabled={isSubmitting}>
                        {buttonText}
                    </button>
                </div>
            </form>

            <div className={alertClassName} id="errorMessage" role="alert" aria-live="assertive">
                {errorMessage}
            </div>
        </section>
    );
}
