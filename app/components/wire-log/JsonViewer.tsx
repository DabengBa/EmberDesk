import { useCallback, useEffect, useRef, useState } from 'react';
import * as stylex from '@stylexjs/stylex';

import { useTranslated } from '../../compat/i18n.js';
import { wireLogStyles as styles } from './wire-log.styles';
import { serializeForClipboard } from './wire-log-helpers';

const COPY_FEEDBACK_MS = 1500;

/**
 * Collapsible pretty-printed JSON.
 *
 * Collapsing is per-path and stateless to the tree: the path string
 * (`$.request.body.messages[3]`) is the identity, so re-rendering with a new
 * value keeps the user's open sections.
 */

function previewOf(value: unknown): string {
    if (Array.isArray(value)) {
        return `Array(${value.length})`;
    }
    if (value && typeof value === 'object') {
        const keys = Object.keys(value as Record<string, unknown>);
        return `Object(${keys.length})`;
    }
    if (typeof value === 'string') {
        const flat = value.replace(/\s+/g, ' ');
        return flat.length > 60 ? `"${flat.slice(0, 60)}…"` : `"${flat}"`;
    }
    return String(value);
}

type JsonNodeProps = {
    value: unknown;
    path: string;
    label?: string;
    depth: number;
    collapsed: Set<string>;
    onToggle: (path: string) => void;
};

function JsonNode({ value, path, label, depth, collapsed, onToggle }: JsonNodeProps) {
    const isContainer = value !== null && typeof value === 'object';
    const prefix = label === undefined ? '' : `${label}: `;

    if (!isContainer) {
        return (
            <div style={{ paddingLeft: depth * 12 }}>
                <span {...stylex.props(styles.tableTerm)}>{prefix}</span>
                <span>{serializeForClipboard(value)}</span>
            </div>
        );
    }

    const isCollapsed = collapsed.has(path);
    const entries: Array<[string, unknown]> = Array.isArray(value)
        ? (value as unknown[]).map((item, index) => [String(index), item])
        : Object.entries(value as Record<string, unknown>);

    const openBrace = Array.isArray(value) ? '[' : '{';
    const closeBrace = Array.isArray(value) ? ']' : '}';

    return (
        <div>
            <div style={{ paddingLeft: depth * 12 }}>
                <button
                    type="button"
                    {...stylex.props(styles.disclosure)}
                    aria-expanded={!isCollapsed}
                    onClick={() => onToggle(path)}
                >
                    <span aria-hidden="true">{isCollapsed ? '▸' : '▾'}</span>
                    <span {...stylex.props(styles.tableTerm)}>{prefix}</span>
                    <span>
                        {openBrace}
                        {isCollapsed ? ` ${previewOf(value)} ${closeBrace}` : ''}
                    </span>
                </button>
            </div>
            {isCollapsed ? null : (
                <>
                    {entries.map(([key, child]) => (
                        <JsonNode
                            key={`${path}.${key}`}
                            value={child}
                            path={`${path}.${key}`}
                            label={key}
                            depth={depth + 1}
                            collapsed={collapsed}
                            onToggle={onToggle}
                        />
                    ))}
                    <div style={{ paddingLeft: depth * 12 }}>{closeBrace}</div>
                </>
            )}
        </div>
    );
}export type JsonViewerProps = {
    value: unknown;
    /** Accessible name for the copy button, e.g. "请求体". */
    label?: string;
    /** Indentation depth of the root node. */
    depth?: number;
};

export function JsonViewer({ value, label = 'JSON', depth = 0 }: JsonViewerProps) {
    const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
    const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
    const timerRef = useRef<number | null>(null);

    useEffect(() => () => {
        if (timerRef.current !== null) {
            window.clearTimeout(timerRef.current);
        }
    }, []);

    const toggle = useCallback((path: string) => {
        setCollapsed(current => {
            const next = new Set(current);
            if (next.has(path)) {
                next.delete(path);
            } else {
                next.add(path);
            }
            return next;
        });
    }, []);

    const markCopied = useCallback((state: 'copied' | 'failed') => {
        setCopyState(state);
        if (timerRef.current !== null) {
            window.clearTimeout(timerRef.current);
        }
        timerRef.current = window.setTimeout(() => setCopyState('idle'), COPY_FEEDBACK_MS);
    }, []);

    const copyJson = useCallback(async () => {
        const text = serializeForClipboard(value);
        try {
            await navigator.clipboard.writeText(text);
            markCopied('copied');
        } catch {
            markCopied('failed');
        }
    }, [markCopied, value]);

    const copyLabel = useTranslated(
        copyState === 'copied' ? '已复制' : copyState === 'failed' ? '复制失败' : '复制 JSON',
    );

    return (
        <div>
            <div {...stylex.props(styles.cardHeader)}>
                <button
                    type="button"
                    {...stylex.props(styles.button)}
                    data-wire-log-copy={label}
                    onClick={() => { void copyJson(); }}
                >
                    {copyLabel}
                </button>
            </div>
            <pre {...stylex.props(styles.codeBlock)} aria-label={`${label} JSON`}>
                <JsonNode
                    value={value}
                    path="$"
                    depth={depth}
                    collapsed={collapsed}
                    onToggle={toggle}
                />
            </pre>
        </div>
    );
}
