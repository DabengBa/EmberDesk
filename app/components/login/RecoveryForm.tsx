import type { FormEvent } from 'react';
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
    const alertClassName = `login-error${errorMessage ? ' login-error--visible' : ''}`;

    return (
        <section className="login-card login-card--entry" id="recoveryCard" style={{ display: recoveryVisible ? 'block' : 'none' }} aria-labelledby="recovery-title">
            <header className="login-header">
                <img src="/img/logo.png" alt="" className="login-logo" />
                <h1 id="recovery-title">重置密码</h1>
            </header>

            <form id="recoveryForm" className="login-form" noValidate onSubmit={onSubmit}>
                <div className="login-field-stack">
                    <form.Field name="handle">
                        {(field: any) => (
                            <div className="login-field">
                                <label htmlFor="recoverHandle">用户名</label>
                                <input
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

                <div id="recoveryStep1" className="login-actions" style={{ display: currentStep === 1 ? 'flex' : 'none' }}>
                    <button type="submit" className="login-btn" id="sendCodeBtn" disabled={isSubmitting}>发送恢复码</button>
                </div>

                <div id="recoveryStep2" style={{ display: currentStep === 2 ? 'block' : 'none' }}>
                    {currentStep === 2 && (
                        <p className="mb-4 rounded-md border border-zinc-800 bg-zinc-950/70 px-3 py-2 text-sm text-zinc-400">
                            恢复码会输出到服务端控制台，请联系管理员获取。
                        </p>
                    )}
                    <div className="login-field-stack">
                        <form.Field name="code">
                            {(field: any) => (
                                <div className="login-field">
                                    <label htmlFor="recoveryCode">恢复码</label>
                                    <input
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
                                <div className="login-field">
                                    <label htmlFor="newPassword">新密码</label>
                                    <input
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
                    <div className="login-actions">
                        <button type="submit" className="login-btn" id="resetBtn" disabled={isSubmitting}>重置密码</button>
                    </div>
                </div>
            </form>

            <div className={alertClassName} id="recoveryError" role="alert" aria-live="assertive">
                {errorMessage}
            </div>

            <a href="#" className="login-forgot" id="cancelRecovery" onClick={(event) => {
                event.preventDefault();
                onCancel();
            }}
            >
                返回登录
            </a>
        </section>
    );
}
