import type { ChangeEventHandler } from 'react';
import { getSetupPasswordVisibilityState } from '@/lib/setup-helpers';

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
        <div className="login-field login-field--password">
            <label htmlFor={id}>{label}</label>
            <div className="login-input-wrap">
                <input
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
                    className="password-toggle"
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
