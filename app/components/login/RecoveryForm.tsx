import type { FormEvent } from 'react';
import * as stylex from '@stylexjs/stylex';
import { loginStyles } from '@/styles/login.styles';
type RecoveryFormProps = {
    form: any;
    recoveryVisible: boolean;
    currentStep: 1 | 2;
    isSubmitting: boolean;
    errorMessage: string;
    onHandleChange: () => void;
    onCodeChange: () => void;
    onNewPasswordChange: () => void;
    onSubmit: (event: FormEvent<HTMLFormElement>) => void;
    onCancel: () => void;
};

export function RecoveryForm({
    form,
    recoveryVisible,
    currentStep,
    isSubmitting,
    errorMessage,
    onHandleChange,
    onCodeChange,
    onNewPasswordChange,
    onSubmit,
    onCancel,
}: RecoveryFormProps) {
    return (
        <section {...stylex.props(loginStyles.card)} id="recoveryCard" style={{ display: recoveryVisible ? 'block' : 'none' }} aria-labelledby="recovery-title">
            <header {...stylex.props(loginStyles.header)}>
                <img src="/img/logo.png" alt="" {...stylex.props(loginStyles.logo)} />
                <h1 id="recovery-title" {...stylex.props(loginStyles.headerTitle)}>重置密码</h1>
            </header>

            <form id="recoveryForm" {...stylex.props(loginStyles.form)} noValidate onSubmit={onSubmit}>
                <div {...stylex.props(loginStyles.fieldStack)}>
                    <form.Field name="handle">
                        {(field: any) => (
                            <div {...stylex.props(loginStyles.field)}>
                                <label htmlFor="recoverHandle" {...stylex.props(loginStyles.fieldLabel)}>用户名</label>
                                <input
                                    {...stylex.props(loginStyles.input)}
                                    id="recoverHandle"
                                    name="recoverHandle"
                                    type="text"
                                    autoComplete="username"
                                    placeholder="请输入用户名"
                                    required
                                    value={field.state.value}
                                    onBlur={field.handleBlur}
                                    disabled={isSubmitting || currentStep === 2}
                                    onChange={event => {
                                        field.handleChange(event.target.value);
                                        onHandleChange();
                                    }}
                                />
                            </div>
                        )}
                    </form.Field>
                </div>

                <div id="recoveryStep1" {...stylex.props(loginStyles.actions)} style={{ display: currentStep === 1 ? 'flex' : 'none' }}>
                    <button type="submit" {...stylex.props(loginStyles.btn)} id="sendCodeBtn" disabled={isSubmitting}>发送恢复码</button>
                </div>

                <div id="recoveryStep2" style={{ display: currentStep === 2 ? 'block' : 'none' }}>
                    {currentStep === 2 && (
                        <p {...stylex.props(loginStyles.recoveryNote)}>
                            恢复码会输出到服务端控制台，请联系管理员获取。
                        </p>
                    )}
                    <div {...stylex.props(loginStyles.fieldStack)}>
                        <form.Field name="code">
                            {(field: any) => (
                                <div {...stylex.props(loginStyles.field)}>
                                    <label htmlFor="recoveryCode" {...stylex.props(loginStyles.fieldLabel)}>恢复码</label>
                                    <input
                                        {...stylex.props(loginStyles.input)}
                                        id="recoveryCode"
                                        name="recoveryCode"
                                        type="text"
                                        autoComplete="one-time-code"
                                        inputMode="numeric"
                                        placeholder="000000"
                                        maxLength={6}
                                        value={field.state.value}
                                        onBlur={field.handleBlur}
                                        disabled={isSubmitting}
                                        onChange={event => {
                                            field.handleChange(event.target.value);
                                            onCodeChange();
                                        }}
                                    />
                                </div>
                            )}
                        </form.Field>
                        <form.Field name="newPassword">
                            {(field: any) => (
                                <div {...stylex.props(loginStyles.field)}>
                                    <label htmlFor="newPassword" {...stylex.props(loginStyles.fieldLabel)}>新密码</label>
                                    <input
                                        {...stylex.props(loginStyles.input)}
                                        id="newPassword"
                                        name="newPassword"
                                        type="password"
                                        autoComplete="new-password"
                                        placeholder="请输入新密码"
                                        value={field.state.value}
                                        onBlur={field.handleBlur}
                                        disabled={isSubmitting}
                                        onChange={event => {
                                            field.handleChange(event.target.value);
                                            onNewPasswordChange();
                                        }}
                                    />
                                </div>
                            )}
                        </form.Field>
                    </div>
                    <div {...stylex.props(loginStyles.actions)}>
                        <button type="submit" {...stylex.props(loginStyles.btn)} id="resetBtn" disabled={isSubmitting}>重置密码</button>
                    </div>
                </div>
            </form>

            <div {...stylex.props(loginStyles.error, errorMessage ? loginStyles.errorVisible : null)} id="recoveryError" role="alert" aria-live="assertive">
                {errorMessage}
            </div>

            <button type="button" {...stylex.props(loginStyles.forgot)} id="cancelRecovery" onClick={() => {
                onCancel();
            }}
            >
                返回登录
            </button>
        </section>
    );
}
