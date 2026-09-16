import type { ChangeEventHandler } from 'react';
import * as stylex from '@stylexjs/stylex';
import { getSetupPasswordVisibilityState } from '@/lib/setup-helpers';
import { loginStyles } from '@/styles/login.styles';

type SetupPasswordInputProps = {
    id: string;
    toggleId: string;
    label: string;
    value: string;
    placeholder: string;
    visible: boolean;
    disabled?: boolean;
    onChange: ChangeEventHandler<HTMLInputElement>;
    onToggle: () => void;
};

export function SetupPasswordInput({
    id,
    toggleId,
    label,
    value,
    placeholder,
    visible,
    disabled = false,
    onChange,
    onToggle,
}: SetupPasswordInputProps) {
    const state = getSetupPasswordVisibilityState(visible ? 'password' : 'text');

    return (
        <div {...stylex.props(loginStyles.field)}>
            <label htmlFor={id} {...stylex.props(loginStyles.fieldLabel)}>{label}</label>
            <div {...stylex.props(loginStyles.inputWrap)}>
                <input
                    {...stylex.props(loginStyles.input, loginStyles.inputInWrap)}
                    id={id}
                    name={id}
                    type={state.type}
                    autoComplete="new-password"
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
