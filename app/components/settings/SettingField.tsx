import * as stylex from '@stylexjs/stylex';
import { useEffect, useRef } from 'react';
import type { InputHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { getFieldErrorMessage, getValueAtPath } from '@/lib/settings-helpers.js';
import { numericWheelValue } from '@/lib/workspace-drawer-service';
import { useAutosizeTextareaRef } from '@/lib/autosize-textarea';
import { FieldSwitch } from '@/components/fields/FieldSwitch';
import { settingsStyles } from '@/styles/settings-surface.styles';

let lastSettingsWheel = 0;

function SettingNumber({ onNumberChange, ...props }: InputHTMLAttributes<HTMLInputElement> & { onNumberChange: (value: number) => void }) {
    const ref = useRef<HTMLInputElement>(null);
    useEffect(() => {
        const element = ref.current;
        if (!element) return;
        const onWheel = (event: WheelEvent) => {
            if (document.activeElement !== element || !element.hasAttribute('step')) return;
            const parent = element.closest('.range-block-range-and-counter') ?? element.closest('div') ?? element.parentElement;
            const slider = parent?.querySelector<HTMLInputElement>('input[type="range"]');
            if (event.target !== element && event.target !== slider) return;
            event.stopPropagation();
            event.preventDefault();
            const now = Date.now();
            if (lastSettingsWheel && now - lastSettingsWheel < 25) return;
            lastSettingsWheel = now;
            const next = numericWheelValue(parseFloat(element.value), parseFloat(element.step), parseFloat(element.min), parseFloat(element.max), event.deltaY);
            if (next === null) return;
            element.value = String(next);
            if (slider) slider.value = String(next);
            onNumberChange(next);
            element.dispatchEvent(new Event('input', { bubbles: true }));
        };
        document.addEventListener('wheel', onWheel, { passive: false });
        return () => document.removeEventListener('wheel', onWheel);
    }, [onNumberChange]);
    return <input {...props} ref={ref} type="number" data-workspace-numeric="react" />;
}

function SettingTextarea({
    value,
    ...rest
}: { value: string } & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value'>) {
    const ref = useAutosizeTextareaRef<HTMLTextAreaElement>(value);
    return (
        <textarea
            ref={ref}
            {...stylex.props(settingsStyles.input, settingsStyles.textarea)}
            value={value}
            {...rest}
        />
    );
}

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
                            <label {...stylex.props(settingsStyles.field, stylex.defaultMarker(), variant === 'toggle' && settingsStyles.spanAll)}>
                                {variant !== 'toggle' && (
                                    <div>
                                        <span {...stylex.props(settingsStyles.fieldLabel)}>{label}</span>
                                        {description && (
                                            <span id={descriptionId} {...stylex.props(settingsStyles.fieldDescription)}>
                                                {description}
                                            </span>
                                        )}
                                    </div>
                                )}

                                {variant === 'textarea' && (
                                    <SettingTextarea
                                        id={fieldId}
                                        name={name}
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
                                        {...stylex.props(settingsStyles.input)}
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
                                    <SettingNumber
                                        id={fieldId}
                                        name={name}
                                        {...stylex.props(settingsStyles.input)}
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
                                        onNumberChange={nextValue => {
                                            field.handleChange(nextValue);
                                            onValueChange?.();
                                        }}
                                    />
                                )}

                                {variant === 'select' && (
                                    <select
                                        id={fieldId}
                                        name={name}
                                        {...stylex.props(settingsStyles.input, settingsStyles.select)}
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
                                    <span {...stylex.props(settingsStyles.toggle)}>
                                        <span {...stylex.props(settingsStyles.toggleBody)}>
                                            <span {...stylex.props(settingsStyles.fieldLabel)}>{label}</span>
                                            {description && (
                                                <span id={descriptionId} {...stylex.props(settingsStyles.fieldDescription)}>
                                                    {description}
                                                </span>
                                            )}
                                        </span>
                                        <FieldSwitch
                                            checked={Boolean(currentValue)}
                                            disabled={disabled}
                                            ariaLabel={label}
                                            attrs={{ id: fieldId, name, ...(describedBy ? { 'aria-describedby': describedBy } : {}) }}
                                            onToggle={next => {
                                                field.handleChange(next);
                                                field.handleBlur();
                                                onValueChange?.();
                                            }}
                                        />
                                    </span>
                                )}

                                {errorMessage && <span id={errorId} {...stylex.props(settingsStyles.fieldError)}>{errorMessage}</span>}
                            </label>
                        )}
                    </form.Subscribe>
                );
            }}
        </form.Field>
    );
}
