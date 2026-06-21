import { getFieldErrorMessage, getValueAtPath } from '@/lib/settings-helpers.js';

type SettingOption = {
    value: string;
    label: string;
};

type SettingFieldProps = {
    form: any;
    name: string;
    label: string;
    description: string;
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
    return (
        <form.Field name={name}>
            {(field: any) => {
                const errorMessage = getFieldErrorMessage(field?.state?.meta?.errors);
                const sharedClassName = 'w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-500 focus:border-emerald-400';

                return (
                    <form.Subscribe selector={(state: any) => getValueAtPath(state.values, name)}>
                        {(currentValue: any) => (
                            <label className={`space-y-2 ${variant === 'toggle' ? 'md:col-span-2' : ''}`}>
                                {variant !== 'toggle' && (
                                    <div className="space-y-1">
                                        <span className="block text-sm font-medium text-zinc-100">{label}</span>
                                        <span className="block text-sm text-zinc-400">{description}</span>
                                    </div>
                                )}

                                {variant === 'textarea' && (
                                    <textarea
                                        id={name}
                                        name={name}
                                        className={`${sharedClassName} min-h-28 resize-y`}
                                        value={String(currentValue ?? '')}
                                        placeholder={placeholder}
                                        disabled={disabled}
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
                                        id={name}
                                        name={name}
                                        className={sharedClassName}
                                        value={String(currentValue ?? '')}
                                        placeholder={placeholder}
                                        disabled={disabled}
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
                                        id={name}
                                        name={name}
                                        className={sharedClassName}
                                        value={Number(currentValue ?? 0)}
                                        min={min}
                                        max={max}
                                        step={step}
                                        disabled={disabled}
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
                                        id={name}
                                        name={name}
                                        className={sharedClassName}
                                        value={String(currentValue ?? '')}
                                        disabled={disabled}
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
                                    <span className="flex items-start justify-between gap-4 rounded-md border border-zinc-800 bg-zinc-900 px-4 py-3">
                                        <span className="space-y-1">
                                            <span className="block text-sm font-medium text-zinc-100">{label}</span>
                                            <span className="block text-sm text-zinc-400">{description}</span>
                                        </span>
                                        <input
                                            type="checkbox"
                                            id={name}
                                            name={name}
                                            className="mt-1 h-4 w-4 accent-emerald-400"
                                            checked={Boolean(currentValue)}
                                            disabled={disabled}
                                            onBlur={field.handleBlur}
                                            onChange={event => {
                                                field.handleChange(event.target.checked);
                                                onValueChange?.();
                                            }}
                                        />
                                    </span>
                                )}

                                {errorMessage && <span className="block text-sm text-rose-300">{errorMessage}</span>}
                            </label>
                        )}
                    </form.Subscribe>
                );
            }}
        </form.Field>
    );
}
