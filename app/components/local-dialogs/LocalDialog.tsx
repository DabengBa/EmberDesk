import { useId, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { Theme } from '@astryxdesign/core';
import { ContractButton } from '../contract/ContractButton';
import { emberDeskTheme } from '../../lib/theme-tokens';

export type LocalDialogScope = 'world-info' | 'presets';
export type LocalDialogValue = string | boolean;
export type LocalDialogField = { type: 'text' | 'select' | 'radio' | 'checkbox'; name: string; label: string; value?: LocalDialogValue; options?: Array<{ value: string; label: string }> };
export type LocalDialogAction = { id: string; label: string; variant?: 'primary' | 'secondary' | 'destructive'; required?: string[] };
export type LocalDialogRequest = { title: string; message?: string; list?: { items: string[]; moreLabel: string }; fields?: LocalDialogField[]; actions: LocalDialogAction[]; initialFocus?: string; closeAction?: string; signal?: AbortSignal; scope?: LocalDialogScope };
export type LocalDialogResult = { action: string; values: Record<string, LocalDialogValue> } | null;

const card: CSSProperties = {
    boxSizing: 'border-box', width: 'min(520px, calc(100vw - 32px))', maxWidth: 'calc(100vw - 32px)',
    maxHeight: 'calc(100dvh - 32px)', overflow: 'auto', overflowWrap: 'anywhere',
    padding: '20px', border: '1px solid var(--SmartThemeBorderColor)', borderRadius: '12px',
    color: 'var(--SmartThemeBodyColor)', background: 'var(--SmartThemeBlurTintColor)',
    boxShadow: '0 18px 48px var(--SmartThemeShadowColor)',
};

// A second click can otherwise land on a control exposed by the first click.
function protectPointerDismissal(event: ReactMouseEvent<HTMLButtonElement>) {
    if (event.detail === 0) return; // Keyboard activation has no pointer to protect.
    const { clientX, clientY } = event;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 500);
    let blocking = false;
    let nextDialogClick = false;
    const stop = (next: Event) => {
        next.preventDefault();
        next.stopImmediatePropagation();
        if (next.type === 'click') { window.clearTimeout(timer); controller.abort(); }
    };
    document.addEventListener('pointerdown', next => {
        if (next.target instanceof Element && next.target.closest('dialog[data-local-dialog]')) {
            nextDialogClick = true;
            return;
        }
        if (Math.abs(next.clientX - clientX) > 4 || Math.abs(next.clientY - clientY) > 4) {
            window.clearTimeout(timer);
            controller.abort();
            return;
        }
        blocking = true;
        stop(next);
    }, { capture: true, signal: controller.signal });
    for (const type of ['mousedown', 'pointerup', 'mouseup', 'click', 'dblclick']) {
        document.addEventListener(type, next => {
            if (type === 'click' && nextDialogClick) {
                nextDialogClick = false;
                if ((next as MouseEvent).detail > 1) stop(next);
                else { window.clearTimeout(timer); controller.abort(); }
                return;
            }
            if (blocking) stop(next);
        }, { capture: true, signal: controller.signal });
    }
}

function Dialog({ request, finish }: { request: LocalDialogRequest; finish: (result: LocalDialogResult) => void }) {
    const ref = useRef<HTMLDialogElement>(null);
    const titleId = useId();
    const [values, setValues] = useState<Record<string, LocalDialogValue>>(() => Object.fromEntries(
        (request.fields ?? []).map(field => [field.name, field.value ?? (field.type === 'checkbox' ? false : field.type === 'select' ? field.options?.[0]?.value ?? '' : '')]),
    ));
    useLayoutEffect(() => {
        const dialog = ref.current;
        if (!dialog) return;
        // Preserve the dialog's existing native initial-focus choice: the new
        // disclosure is keyboard reachable, but must not become the default.
        const disclosure = dialog.querySelector('details');
        if (disclosure) disclosure.inert = true;
        try { dialog.showModal(); } finally { if (disclosure) disclosure.inert = false; }
        if (request.initialFocus) {
            const target = Array.from(dialog.querySelectorAll<HTMLElement>('[data-local-focus]'))
                .find(element => element.dataset.localFocus === request.initialFocus);
            target?.focus();
        }
        return () => { if (dialog.open) dialog.close(); };
    }, [request]);
    const dismiss = () => finish(request.closeAction ? { action: request.closeAction, values } : null);
    const valid = (action: LocalDialogAction) => (action.required ?? []).every(name => {
        const value = values[name];
        return typeof value === 'string' ? value.trim().length > 0 : value === true;
    });
    const choose = (action: LocalDialogAction) => { if (valid(action)) finish({ action: action.id, values }); };
    const update = (name: string, value: LocalDialogValue) => setValues(current => ({ ...current, [name]: value }));
    return <dialog ref={ref} data-local-dialog aria-labelledby={titleId} style={card} onCancel={event => { event.preventDefault(); dismiss(); }} onClose={dismiss} onKeyDown={event => {
        if (event.key === 'Enter' && !event.nativeEvent.isComposing && event.target instanceof HTMLInputElement && event.target.type === 'text') {
            event.preventDefault();
            const action = request.actions[0];
            if (action) choose(action);
            return;
        }
        if (event.key !== 'Tab') return;
        const elements = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], summary, [tabindex]:not([tabindex="-1"])')).filter(element => element.getClientRects().length > 0);
        const first = elements[0];
        const last = elements.at(-1);
        if (!first || !last) { event.preventDefault(); event.currentTarget.focus(); }
        else if (event.shiftKey && (document.activeElement === first || !event.currentTarget.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }}>
        <form onSubmit={event => { event.preventDefault(); const action = request.actions[0]; if (action) choose(action); }}>
            <h2 id={titleId} style={{ margin: '0 0 12px' }}>{request.title}</h2>
            {request.message && <p style={{ whiteSpace: 'pre-wrap' }}>{request.message}</p>}
            {request.list && <>
                <ul style={{ whiteSpace: 'pre-wrap' }}>{request.list.items.slice(0, 10).map((item, index) => <li key={index}>{item}</li>)}</ul>
                {request.list.items.length > 10 && <details><summary>{request.list.moreLabel}</summary><ul style={{ whiteSpace: 'pre-wrap' }}>{request.list.items.slice(10).map((item, index) => <li key={index}>{item}</li>)}</ul></details>}
            </>}
            {(request.fields ?? []).map(field => <div key={field.name} style={{ marginBlock: '12px' }}>
                {field.type === 'radio' ? <fieldset style={{ minWidth: 0 }}><legend>{field.label}</legend>{field.options?.map(option => <label key={option.value} style={{ display: 'block' }}><input data-local-focus={field.name} type="radio" name={field.name} value={option.value} checked={values[field.name] === option.value} onChange={() => update(field.name, option.value)} /> {option.label}</label>)}</fieldset>
                    : <label style={{ display: 'grid', gap: '4px' }}><span>{field.label}</span>
                        {field.type === 'select' ? <select data-local-focus={field.name} value={String(values[field.name])} onChange={event => update(field.name, event.target.value)}>{field.options?.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
                            : field.type === 'checkbox' ? <input data-local-focus={field.name} type="checkbox" checked={Boolean(values[field.name])} onChange={event => update(field.name, event.target.checked)} />
                                : <input data-local-focus={field.name} type="text" value={String(values[field.name])} onChange={event => update(field.name, event.target.value)} style={{ minWidth: 0, maxWidth: '100%' }} />}
                    </label>}
            </div>)}
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
                {request.actions.map(action => <ContractButton key={action.id} data-local-focus={action.id} label={action.label} variant={action.variant} disabled={!valid(action)} onClick={event => { if (valid(action)) protectPointerDismissal(event); choose(action); }} />)}
            </div>
        </form>
    </dialog>;
}

export function mountLocalDialog(host: HTMLElement, request: LocalDialogRequest, finish: (result: LocalDialogResult) => void, fail: (error: unknown) => void): () => void {
    // React reports render/layout-effect failures through the root callback, not
    // necessarily by throwing from flushSync. Defer teardown until commit ends.
    const root = createRoot(host, { onUncaughtError: error => queueMicrotask(() => fail(error)) });
    try { flushSync(() => root.render(<Theme theme={emberDeskTheme} mode="dark"><Dialog request={request} finish={finish} /></Theme>)); }
    catch (error) { root.unmount(); throw error; }
    return () => root.unmount();
}

// Share the unbundled browser module with JS callers, including pending loads.
export function disposeLocalDialogScope(scope: LocalDialogScope): void {
    const bridge = '/scripts/local-dialogs.js';
    // A monotonic ticket distinguishes a new panel's request from an old
    // panel's request even when both happen in the same clock tick.
    const tickets = globalThis as typeof globalThis & { [key: symbol]: number | ((scope: LocalDialogScope, cutoff: number) => void) | undefined };
    const cutoff = tickets[Symbol.for('emberdesk.local-dialog.ticket')] ?? 0;
    const dispose = tickets[Symbol.for('emberdesk.local-dialog.dispose')];
    if (typeof dispose === 'function' && typeof cutoff === 'number') dispose(scope, cutoff);
    else if (typeof cutoff === 'number') void import(/* @vite-ignore */ bridge).then(module => module.disposeLocalDialogs(scope, cutoff)).catch(error => console.error('Local dialog cleanup failed', error));
}
