import type { ChangeEventHandler } from 'react';
import { getPasswordVisibilityState } from '@/lib/login-helpers';

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
        <div className="login-field login-field--password" id={`${id}Field`}>
            <label htmlFor={id}>{label}</label>
            <div className="login-input-wrap">
                <input
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
