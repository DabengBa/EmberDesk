import { useRef, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { chipInputStyles as s } from '@/styles/fields.styles';

/**
 * Shared chip-style list editor: Enter/comma/blur commits, Backspace on empty
 * removes the last chip, clicking the box focuses the input. Duplicates are
 * ignored. Pass `inputProps` for host-specific hooks such as
 * `data-world-info-react-field`.
 */
export function TagChipInput({
    values,
    onCommit,
    placeholder,
    inputAriaLabel,
    removeAriaLabel = (tag: string) => `Remove tag ${tag}`,
    inputProps,
}: {
    values: string[];
    onCommit: (values: string[]) => void;
    placeholder?: string;
    inputAriaLabel?: string;
    removeAriaLabel?: (tag: string) => string;
    inputProps?: Record<string, string>;
}) {
    const [pending, setPending] = useState('');
    const inputRef = useRef<HTMLInputElement | null>(null);

    const addValues = (parts: string[]) => {
        const next = [...values];
        for (const part of parts) {
            const cleaned = part.trim();
            if (cleaned && !next.includes(cleaned)) {
                next.push(cleaned);
            }
        }
        if (next.length !== values.length) {
            onCommit(next);
        }
    };

    const flushPending = () => {
        addValues([pending]);
        setPending('');
    };

    return (
        <div
            {...stylex.props(s.box)}
            onClick={() => inputRef.current?.focus()}
        >
            {values.map((value, index) => (
                <span key={`${index}-${value}`} {...stylex.props(s.chip)}>
                    {value}
                    <button
                        type="button"
                        {...stylex.props(s.chipRemove)}
                        aria-label={removeAriaLabel(value)}
                        onMouseDown={event => event.preventDefault()}
                        onClick={event => {
                            event.stopPropagation();
                            onCommit(values.filter((_, i) => i !== index));
                        }}
                    >
                        ×
                    </button>
                </span>
            ))}
            <input
                ref={inputRef}
                {...stylex.props(s.input)}
                {...inputProps}
                value={pending}
                aria-label={inputAriaLabel ?? placeholder ?? 'Tags'}
                placeholder={values.length === 0 ? placeholder : ''}
                onChange={event => {
                    const raw = event.target.value;
                    if (!raw.includes(',')) {
                        setPending(raw);
                        return;
                    }
                    const pieces = raw.split(',');
                    addValues(pieces.slice(0, -1));
                    setPending((pieces[pieces.length - 1] ?? '').trimStart());
                }}
                onKeyDown={event => {
                    if (event.key === 'Enter') {
                        event.preventDefault();
                        flushPending();
                    } else if (event.key === 'Backspace' && pending === '' && values.length > 0) {
                        onCommit(values.slice(0, -1));
                    }
                }}
                onBlur={flushPending}
            />
        </div>
    );
}
