import type { ChangeEventHandler } from 'react';
import * as stylex from '@stylexjs/stylex';
import { getPasswordVisibilityState } from '@/lib/login-helpers';
import { loginStyles } from '@/styles/login.styles';

type PasswordInputProps = {
    id: string;
    name?: string;
    toggleId?: string;
    label: string;
    value: string;
    autoComplete?: string;
    placeholder?: string;
    visible: boolean;
    disabled?: boolean;
    onChange: ChangeEventHandler<HTMLInputElement>;
    onToggle: () => void;
};

export function PasswordInput({
    id,
    name,
    toggleId,
    label,
    value,
    autoComplete,
    placeholder,
    visible,
    disabled = false,
    onChange,
    onToggle,
}: PasswordInputProps) {
    const state = getPasswordVisibilityState(visible ? 'password' : 'text');

    return (
        <div {...stylex.props(loginStyles.field)} id={`${id}Field`}>
            <label htmlFor={id} {...stylex.props(loginStyles.fieldLabel)}>{label}</label>
            <div {...stylex.props(loginStyles.inputWrap)}>
                <input
                    {...stylex.props(loginStyles.input, loginStyles.inputInWrap)}
                    id={id}
                    name={name}
                    type={state.type}
                    autoComplete={autoComplete}
                    placeholder={placeholder}
                    value={value}
                    onChange={onChange}
                    disabled={disabled}
                />
                <button
                    type="button"
                    id={toggleId}
                    {...stylex.props(loginStyles.passwordToggle)}
                    aria-label={state.ariaLabel}
                    aria-pressed={state.ariaPressed === 'true'}
                    disabled={disabled}
                    onClick={onToggle}
                >
                    <i className={state.iconClassName}></i>
                </button>
            </div>
        </div>
    );
}
