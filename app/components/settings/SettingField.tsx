import { getFieldErrorMessage, getValueAtPath } from '@/lib/settings-helpers.js';

type SettingOption = {
    value: string;
    label: string;
};

type SettingFieldProps = {
    form: any;
    name: string;
    label: string;
    description?: string;
    variant?: 'text' | 'number' | 'textarea' | 'select' | 'toggle';
    selectValueType?: 'string' | 'number';
    placeholder?: string;
    min?: number;
    max?: number;
    step?: number;
    disabled?: boolean;
    options?: SettingOption[];
    onValueChange?: () => void;
};

export function SettingField({
    form,
    name,
    label,
    description,
    variant = 'text',
    selectValueType = 'string',
    placeholder,
    min,
    max,
    step,
    disabled = false,
    options = [],
    onValueChange,
}: SettingFieldProps) {
    const fieldId = `settings-${name.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
    const descriptionId = description ? `${fieldId}-description` : undefined;

    return (
        <form.Field name={name}>
            {(field: any) => {
                const errorMessage = getFieldErrorMessage(field?.state?.meta?.errors);
                const errorId = errorMessage ? `${fieldId}-error` : undefined;
                const describedBy = [descriptionId, errorId].filter(Boolean).join(' ') || undefined;

                return (
                    <form.Subscribe selector={(state: any) => getValueAtPath(state.values, name)}>
                        {(currentValue: any) => (
                            <label className={`settings-field ${variant === 'toggle' ? 'settings-field--wide' : ''}`}>
                                {variant !== 'toggle' && (
                                    <div>
                                        <span className="settings-field-label">{label}</span>
                                        {description && (
                                            <span id={descriptionId} className="settings-field-description">
                                                {description}
                                            </span>
                                        )}
                                    </div>
                                )}

                                {variant === 'textarea' && (
                                    <textarea
                                        id={fieldId}
                                        name={name}
                                        className="settings-input settings-textarea"
                                        value={String(currentValue ?? '')}
                                        placeholder={placeholder}
                                        disabled={disabled}
                                        aria-describedby={describedBy}
                                        onBlur={field.handleBlur}
                                        onChange={event => {
                                            field.handleChange(event.target.value);
                                            onValueChange?.();
                                        }}
                                    />
                                )}

                                {variant === 'text' && (
                                    <input
                                        type="text"
                                        id={fieldId}
                                        name={name}
                                        className="settings-input"
                                        value={String(currentValue ?? '')}
                                        placeholder={placeholder}
                                        disabled={disabled}
                                        aria-describedby={describedBy}
                                        onBlur={field.handleBlur}
                                        onChange={event => {
                                            field.handleChange(event.target.value);
                                            onValueChange?.();
                                        }}
                                    />
                                )}

                                {variant === 'number' && (
                                    <input
                                        type="number"
                                        id={fieldId}
                                        name={name}
                                        className="settings-input"
                                        value={Number(currentValue ?? 0)}
                                        min={min}
                                        max={max}
                                        step={step}
                                        disabled={disabled}
                                        aria-describedby={describedBy}
                                        onBlur={field.handleBlur}
                                        onChange={event => {
                                            const nextValue = event.target.value;
                                            field.handleChange(nextValue === '' ? 0 : Number(nextValue));
                                            onValueChange?.();
                                        }}
                                    />
                                )}

                                {variant === 'select' && (
                                    <select
                                        id={fieldId}
                                        name={name}
                                        className="settings-input settings-select"
                                        value={String(currentValue ?? '')}
                                        disabled={disabled}
                                        aria-describedby={describedBy}
                                        onBlur={field.handleBlur}
                                        onChange={event => {
                                            const nextValue = selectValueType === 'number'
                                                ? Number(event.target.value)
                                                : event.target.value;
                                            field.handleChange(nextValue);
                                            onValueChange?.();
                                        }}
                                    >
                                        {options.map(option => (
                                            <option key={option.value} value={option.value}>
                                                {option.label}
                                            </option>
                                        ))}
                                    </select>
                                )}

                                {variant === 'toggle' && (
                                    <span className="settings-toggle">
                                        <span className="settings-toggle-body">
                                            <span className="settings-toggle-label">{label}</span>
                                            {description && (
                                                <span id={descriptionId} className="settings-field-description">
                                                    {description}
                                                </span>
                                            )}
                                        </span>
                                        <input
                                            type="checkbox"
                                            id={fieldId}
                                            name={name}
                                            className="settings-checkbox"
                                            checked={Boolean(currentValue)}
                                            disabled={disabled}
                                            aria-describedby={describedBy}
                                            onBlur={field.handleBlur}
                                            onChange={event => {
                                                field.handleChange(event.target.checked);
                                                onValueChange?.();
                                            }}
                                        />
                                    </span>
                                )}

                                {errorMessage && <span id={errorId} className="settings-field-error">{errorMessage}</span>}
                            </label>
                        )}
                    </form.Subscribe>
                );
            }}
        </form.Field>
    );
}
