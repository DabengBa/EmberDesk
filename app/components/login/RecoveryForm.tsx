import type { FormEvent } from 'react';
import * as stylex from '@stylexjs/stylex';
import { loginStyles } from '@/styles/login.styles';
import { translate, useTranslated } from '@/compat/i18n.js';
type RecoveryFormProps = {
    form: any;
    recoveryVisible: boolean;
    currentStep: 1 | 2;
    isSubmitting: boolean;
    errorMessage: string;
    invalidField?: string | null;
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
    invalidField,
    onHandleChange,
    onCodeChange,
    onNewPasswordChange,
    onSubmit,
    onCancel,
}: RecoveryFormProps) {
    useTranslated('');
    return (
        <section {...stylex.props(loginStyles.card)} id="recoveryCard" style={{ display: recoveryVisible ? 'block' : 'none' }} aria-labelledby="recovery-title">
            <header {...stylex.props(loginStyles.header)}>
                <img src="/img/logo.png" alt="" {...stylex.props(loginStyles.logo)} />
                <h1 id="recovery-title" {...stylex.props(loginStyles.headerTitle)}>{translate('Reset password')}</h1>
            </header>

            <form id="recoveryForm" {...stylex.props(loginStyles.form)} noValidate onSubmit={onSubmit}>
                <div {...stylex.props(loginStyles.fieldStack)}>
                    <form.Field name="handle">
                        {(field: any) => (
                            <div {...stylex.props(loginStyles.field)}>
                                <label htmlFor="recoverHandle" {...stylex.props(loginStyles.fieldLabel)}>{translate('Username')}</label>
                                <input
                                    {...stylex.props(loginStyles.input)}
                                    id="recoverHandle"
                                    name="recoverHandle"
                                    type="text"
                                    autoComplete="username"
                                    placeholder={translate('Please enter a username')}
                                    required
                                    aria-required="true"
                                    aria-invalid={invalidField === 'handle' || undefined}
                                    aria-describedby={invalidField === 'handle' ? 'recoveryError' : undefined}
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

                <p {...stylex.props(loginStyles.recoveryNote)} id="recoveryCodeHint">
                    {translate('Recovery codes are printed to the server console. They are not sent by email or SMS; ask your administrator for one.')}
                </p>

                <div id="recoveryStep1" {...stylex.props(loginStyles.actions)} style={{ display: currentStep === 1 ? 'flex' : 'none' }}>
                    <button type="submit" {...stylex.props(loginStyles.btn)} id="sendCodeBtn" disabled={isSubmitting} aria-describedby="recoveryCodeHint">{translate('Generate recovery code')}</button>
                </div>

                <div id="recoveryStep2" style={{ display: currentStep === 2 ? 'block' : 'none' }}>
                    <div {...stylex.props(loginStyles.fieldStack)}>
                        <form.Field name="code">
                            {(field: any) => (
                                <div {...stylex.props(loginStyles.field)}>
                                    <label htmlFor="recoveryCode" {...stylex.props(loginStyles.fieldLabel)}>{translate('Recovery code')}</label>
                                    <input
                                        {...stylex.props(loginStyles.input)}
                                        id="recoveryCode"
                                        name="recoveryCode"
                                        type="text"
                                        autoComplete="one-time-code"
                                        inputMode="numeric"
                                        placeholder="000000"
                                        maxLength={6}
                                        aria-invalid={invalidField === 'code' || undefined}
                                        aria-describedby={invalidField === 'code' ? 'recoveryError recoveryCodeHint' : 'recoveryCodeHint'}
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
                                    <label htmlFor="newPassword" {...stylex.props(loginStyles.fieldLabel)}>{translate('New password')}</label>
                                    <input
                                        {...stylex.props(loginStyles.input)}
                                        id="newPassword"
                                        name="newPassword"
                                        type="password"
                                        autoComplete="new-password"
                                        placeholder={translate('Please enter a new password')}
                                        aria-invalid={invalidField === 'newPassword' || undefined}
                                        aria-describedby={invalidField === 'newPassword' ? 'recoveryError' : undefined}
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
                        <button type="submit" {...stylex.props(loginStyles.btn)} id="resetBtn" disabled={isSubmitting}>{translate('Reset password')}</button>
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
                {translate('Back to sign in')}
            </button>
        </section>
    );
}
