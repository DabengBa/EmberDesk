import type { FormEvent } from 'react';
import * as stylex from '@stylexjs/stylex';
import { setupMessages } from '@/lib/setup-helpers';
import { loginStyles } from '@/styles/login.styles';
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
    let buttonText = isSetPasswordMode ? '设置密码并登录' : '创建管理员账户';

    if (isSubmitting) {
        buttonText = isSetPasswordMode ? setupMessages.setting : setupMessages.creating;
    }

    if (isComplete) {
        buttonText = setupMessages.setupComplete;
    }

    return (
        <section {...stylex.props(loginStyles.card)} id="setupCard" aria-labelledby="setup-title">
            <header {...stylex.props(loginStyles.header)}>
                <img src="/img/logo.png" alt="" {...stylex.props(loginStyles.logo)} />
                <h1 id="setup-title" {...stylex.props(loginStyles.headerTitle)}>{isSetPasswordMode ? '设置密码' : '初始设置'}</h1>
            </header>

            <form id="setupForm" {...stylex.props(loginStyles.form)} noValidate onSubmit={onSubmit}>
                <div {...stylex.props(loginStyles.fieldGroup)}>
                    <form.Field name="handle">
                        {(field: any) => (
                            <div id="handleField" {...stylex.props(loginStyles.field)} style={{ display: isSetPasswordMode ? 'none' : undefined }}>
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
                            <div id="nameField" {...stylex.props(loginStyles.field)} style={{ display: isSetPasswordMode ? 'none' : undefined }}>
                                <label htmlFor="name" {...stylex.props(loginStyles.fieldLabel)}>显示名称 <span {...stylex.props(loginStyles.labelNote)}>（可选）</span></label>
                                <input
                                    {...stylex.props(loginStyles.input)}
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

                <div {...stylex.props(loginStyles.fieldGroup, loginStyles.fieldGroupSecurity)}>
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

                <div {...stylex.props(loginStyles.actions)}>
                    <button type="submit" {...stylex.props(loginStyles.btn)} id="setupButton" disabled={isSubmitting}>
                        {buttonText}
                    </button>
                </div>
            </form>

            <div {...stylex.props(loginStyles.error, errorMessage ? loginStyles.errorVisible : null)} id="errorMessage" role="alert" aria-live="assertive">
                {errorMessage}
            </div>
        </section>
    );
}
