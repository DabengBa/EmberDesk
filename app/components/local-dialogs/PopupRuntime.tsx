import { useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { Theme } from '@astryxdesign/core';
import { emberDeskTheme } from '../../lib/theme-tokens';
import type { Popup, PopupOptions, CustomPopupButton, CustomPopupInput } from '../../../public/scripts/popup.js';

type PopupValue = string | number | boolean | null | undefined;
type PopupRefs = Pick<Popup, 'dlg' | 'body' | 'content' | 'mainInput' | 'inputControls' | 'buttonControls' | 'okButton' | 'cancelButton' | 'closeButton' | 'cropWrap' | 'cropImage'>;
type CropData = { x: number; y: number; width: number; height: number; [key: string]: unknown };
type CropperInstance = { getData(): CropData; setData(data: CropData): void; reset(): void; destroy(): void; getCroppedCanvas(): HTMLCanvasElement };
type CropperConstructor = new (image: HTMLImageElement, options: { aspectRatio: number; autoCropArea: number; viewMode: number; rotatable: boolean; ready(): void; crop(event: CustomEvent<CropData>): void }) => CropperInstance;
type Services = {
    translate(text: string): string;
    shouldSendOnEnter(): boolean;
    afterAnimation(element: HTMLElement, callback: () => void): void;
    fixToast(): void;
    recordResult(): void;
    dispose(): void;
    confirmForceClose(): Promise<boolean>;
    reportError(error: unknown): void;
};
type Request = { popup: Popup; content: string | Element | JQuery<HTMLElement>; inputValue: string; options: PopupOptions; services: Services };
export type PopupRuntime = {
    refs: PopupRefs;
    show(): Promise<PopupValue>;
    complete(result: number | null): Promise<PopupValue>;
    setAutoFocus(options?: { applyAutoFocus?: boolean }): void;
};
export type PopupRuntimeFactory = (request: Request) => PopupRuntime;
type Phase = 'created' | 'open' | 'closing';

const TEXT = 1, CONFIRM = 2, INPUT = 3, DISPLAY = 4, CROP = 5;

function CustomInput({ input, translate }: { input: CustomPopupInput; translate: Services['translate'] }) {
    const checkbox = !input.type || input.type === 'checkbox';
    const field = { id: input.id, disabled: Boolean(input.disabled), title: input.tooltip ?? undefined };
    return <label htmlFor={input.id} className={`${checkbox ? 'checkbox_label' : 'text_label'} justifyCenter`}>
        {checkbox ? <input {...field} type="checkbox" defaultChecked={Boolean(input.defaultState)} /> : null}
        <span data-i18n={input.label}>{translate(input.label)}</span>
        {!checkbox && (input.type === 'textarea'
            ? <textarea {...field} className="text_pole result-control" rows={input.rows ?? 1} placeholder={input.tooltip ?? ''} defaultValue={String(input.defaultState ?? '')} />
            : <input {...field} className="text_pole result-control" type={input.type ?? 'text'} min={input.min ?? undefined} max={input.max ?? undefined} step={input.step ?? undefined} placeholder={input.tooltip ?? ''} defaultValue={String(input.defaultState ?? '')} />)}
        {checkbox && input.tooltip ? <i className="fa-solid fa-circle-info opacity50p" aria-label={input.tooltip} title={input.tooltip} /> : null}
    </label>;
}

type DialogProps = {
    request: Request; refs: PopupRefs; phase: Phase;
    complete(result: number | null): Promise<PopupValue>;
    cancel(): void; opened(): void; close(): void;
    setAutoFocus(options?: { applyAutoFocus?: boolean }): void;
    setCropper(cropper: CropperInstance | undefined): void;
};

function PopupDialog({ request, refs, phase, complete, cancel, opened, close, setAutoFocus, setCropper }: DialogProps) {
    const { popup, content, inputValue, options, services } = request;
    const cropperRef = useRef<CropperInstance | undefined>(undefined);
    const [cropReady, setCropReady] = useState(false);
    const customActionPending = useRef(false);
    const { translate } = services;
    const act = (result: number | null) => { void complete(result).catch(services.reportError); };
    useLayoutEffect(() => {
        if (typeof content !== 'string') {
            // Compatibility content is an opaque subtree: its caller may mount
            // another React root or attach existing DOM controls inside it.
            if (content instanceof Node) refs.content.append(content);
            else if (content) refs.content.append(...Array.from(content));
        }
        const heading = refs.content.querySelector<HTMLElement>('h1, h2, h3, h4');
        if (heading) {
            heading.id ||= `popup-title-${popup.id}`;
            refs.dlg.setAttribute('aria-labelledby', heading.id);
            refs.mainInput.setAttribute('aria-labelledby', heading.id);
        } else {
            const label = translate(popup.type === INPUT ? 'Input' : popup.type === CONFIRM ? 'Confirm action' : 'Message');
            refs.dlg.setAttribute('aria-label', label);
            refs.mainInput.setAttribute('aria-label', label);
        }
        setAutoFocus({ applyAutoFocus: true });
    }, []);
    useLayoutEffect(() => {
        if (phase === 'open') {
            refs.dlg.setAttribute('opening', '');
            refs.dlg.showModal();
            setAutoFocus();
            if (popup.type === INPUT) refs.mainInput.select();
            services.fixToast();
            services.afterAnimation(refs.dlg, () => {
                refs.dlg.removeAttribute('opening');
                opened();
            });
        } else if (phase === 'closing') {
            refs.dlg.setAttribute('closing', '');
            services.fixToast();
            // Teardown must happen after this React commit, even with no CSS animation.
            services.afterAnimation(refs.dlg, () => queueMicrotask(close));
        }
    }, [phase]);
    useLayoutEffect(() => {
        if (phase !== 'open' || popup.type !== CROP) return;
        const Cropper = (globalThis as typeof globalThis & { Cropper: CropperConstructor }).Cropper;
        if (!Cropper) throw new Error('Image cropper is unavailable');
        setCropReady(false);
        const cropper = new Cropper(refs.cropImage, {
            aspectRatio: options.cropAspect ?? 2 / 3, autoCropArea: 1, viewMode: 2, rotatable: false,
            ready: () => { setCropReady(true); },
            crop: event => { popup.cropData = { ...event.detail, want_resize: true }; },
        });
        cropperRef.current = cropper;
        setCropper(cropper);
        return () => { cropper.destroy(); cropperRef.current = undefined; setCropper(undefined); };
    }, [phase]);

    const keyDown = (event: KeyboardEvent<HTMLDialogElement>) => {
        if (event.key !== 'Enter' || event.nativeEvent.isComposing || event.altKey || event.shiftKey) return;
        const target = event.target;
        if (!(target instanceof HTMLElement) || !target.closest('.result-control')) return;
        const input = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
        if (input && (!services.shouldSendOnEnter() || (!event.ctrlKey && (target instanceof HTMLTextAreaElement ? target.rows > 1 : refs.mainInput.rows > 1)))) return;
        event.preventDefault();
        event.stopPropagation();
        if (target instanceof HTMLButtonElement) target.click();
        else act(popup.defaultResult);
    };
    const clickResult = (event: MouseEvent<HTMLDialogElement>) => {
        if (!(event.target instanceof Element)) return;
        const control = event.target.closest<HTMLElement>('[data-result]');
        if (!control || control.dataset.resultEvent && control.dataset.resultEvent !== 'click') return;
        const result = control.dataset.result;
        if (result === undefined || result === 'undefined') return;
        if (result !== 'null' && !Number.isFinite(Number(result))) return;
        act(result === 'null' ? null : Number(result));
    };
    const customButtons = (popup.customButtons ?? []).map((item, index): CustomPopupButton => typeof item === 'string' ? { text: item, result: index + 2 } : item);
    const customButton = (button: CustomPopupButton, index: number) => <button key={index} type="button"
        className={`menu_button popup-button-custom result-control ${button.result === popup.defaultResult ? 'menu_button_default' : ''} ${Array.isArray(button.classes) ? button.classes.join(' ') : button.classes ?? ''} ${button.icon ? 'menu_button_icon' : ''}`}
        data-result={button.result === null ? 'null' : button.result} title={button.tooltip ?? undefined}
        onClick={event => {
            event.stopPropagation();
            if (customActionPending.current) return;
            customActionPending.current = true;
            void (async () => {
                try {
                    await button.action?.();
                    if (button.result !== undefined) await complete(button.result);
                } finally { customActionPending.current = false; }
            })().catch(services.reportError);
        }}>
        {button.icon ? <i className={`fa-solid ${button.icon}`} aria-hidden="true" /> : null}<span data-i18n={button.text}>{translate(button.text)}</span>
    </button>;
    const classes = ['popup', `popup--animation-${options.animation ?? 'fast'}`];
    for (const [enabled, name] of [[options.wide, 'wide'], [options.wider, 'wider'], [options.large, 'large'], [options.transparent, 'transparent'], [options.allowHorizontalScrolling, 'horizontal_scrolling'], [options.allowVerticalScrolling, 'vertical_scrolling'], [options.leftAlign, 'left_aligned']] as const) {
        if (enabled) classes.push(`${name}_dialogue_popup`);
    }
    const ok = typeof options.okButton === 'string' ? options.okButton : popup.type === CONFIRM ? 'Yes' : popup.type === INPUT ? 'Save' : popup.type === CROP ? 'Crop' : 'OK';
    const negative = typeof options.cancelButton === 'string' ? options.cancelButton : popup.type === CONFIRM ? 'No' : 'Cancel';
    const cropActions = [
        ['Move crop left', 'fa-arrow-left', -1, 0, 1], ['Move crop right', 'fa-arrow-right', 1, 0, 1],
        ['Move crop up', 'fa-arrow-up', 0, -1, 1], ['Move crop down', 'fa-arrow-down', 0, 1, 1],
        ['Shrink crop', 'fa-minus', 0, 0, .9], ['Enlarge crop', 'fa-plus', 0, 0, 1.1], ['Reset crop', 'fa-rotate-left', 0, 0, 0],
    ] as const;
    return <dialog ref={element => { if (element) refs.dlg = element; }} className={classes.join(' ')} data-id={popup.id} data-react-popup
        onCancel={event => { event.preventDefault(); event.stopPropagation(); cancel(); }}
        onClose={() => { if (phase === 'open') cancel(); }}
        onKeyDown={keyDown} onClick={clickResult}
        onFocus={event => { if (event.target instanceof HTMLElement) popup.lastFocus = event.target; }}>
        <div className="popup-body" ref={element => { if (element) refs.body = element; }}>
            <div className="popup-content" ref={element => { if (element) refs.content = element; }} id={`popup-content-${popup.id}`} title={popup.type === INPUT ? undefined : options.tooltip ?? undefined}
                dangerouslySetInnerHTML={typeof content === 'string' ? { __html: content } : undefined} />
            <div className="popup-crop-wrap" ref={element => { if (element) refs.cropWrap = element; }} style={{ display: popup.type === CROP ? 'block' : 'none' }}>
                <img ref={element => { if (element) refs.cropImage = element; }} className="popup-crop-image" src={options.cropImage ?? undefined} alt={translate('Crop avatar')} />
            </div>
            {popup.type === CROP ? <div className="popup-crop-controls" role="group" aria-label={translate('Adjust crop selection')}>
                {cropActions.map(([label, icon, x, y, scale]) => <button key={label} type="button" className="menu_button" title={translate(label)} aria-label={translate(label)} disabled={!cropReady} onClick={() => {
                    const cropper = cropperRef.current;
                    if (!cropper) return;
                    if (scale === 0) { cropper.reset(); return; }
                    const data = cropper.getData();
                    const step = Math.max(1, Math.min(data.width, data.height) * .05);
                    cropper.setData({ ...data, x: data.x + x * step + data.width * (1 - scale) / 2, y: data.y + y * step + data.height * (1 - scale) / 2, width: data.width * scale, height: data.height * scale });
                }}><i className={`fa-solid ${icon}`} aria-hidden="true" /></button>)}
            </div> : null}
            <textarea ref={element => { if (element) refs.mainInput = element; }} className="popup-input text_pole result-control auto-select" rows={options.rows ?? 1}
                data-result="1" data-result-event="submit" style={{ display: popup.type === INPUT ? 'block' : 'none' }}
                defaultValue={inputValue ?? ''} placeholder={options.placeholder ?? ''} title={popup.type === INPUT ? options.tooltip ?? undefined : undefined} aria-describedby={`popup-content-${popup.id}`} />
            {popup.type === INPUT && (options.rows ?? 1) > 1 ? <small className="popup-input-hint opacity50p">{translate('Press Ctrl+Enter to submit.')}</small> : null}
            <div className="popup-inputs" ref={element => { if (element) refs.inputControls = element; }} style={{ display: popup.customInputs?.length ? 'block' : 'none' }}>
                {popup.customInputs?.filter(input => input.id).map(input => <CustomInput key={input.id} input={input} translate={translate} />)}
            </div>
            <div className="popup-controls" ref={element => { if (element) refs.buttonControls = element; }} style={{ display: popup.type === DISPLAY ? 'none' : undefined }}>
                {customButtons.filter(button => !button.appendAtEnd).map(customButton)}
                <button ref={element => { if (element) refs.okButton = element; }} type="button" className={`popup-button-ok menu_button result-control ${popup.defaultResult === 1 ? 'menu_button_default' : ''}`} data-result="1" data-i18n={ok}
                    disabled={popup.type === CROP && !cropReady} style={{ display: options.okButton === false ? 'none' : undefined }}>{translate(ok)}</button>
                <button ref={element => { if (element) refs.cancelButton = element; }} type="button" className={`popup-button-cancel menu_button result-control ${popup.defaultResult === 0 ? 'menu_button_default' : ''}`} data-result="0" data-i18n={negative}
                    style={{ display: options.cancelButton === false || popup.type === TEXT && !options.cancelButton ? 'none' : undefined }}>{translate(negative)}</button>
                {customButtons.filter(button => button.appendAtEnd).map(customButton)}
            </div>
        </div>
        <button ref={element => { if (element) refs.closeButton = element; }} type="button" className="popup-button-close right_menu_button fa-solid fa-circle-xmark" data-result="0"
            title={translate('Close popup')} aria-label={translate('Close popup')} style={{ display: popup.type === DISPLAY ? 'block' : 'none' }} />
    </dialog>;
}

export const createPopupRuntime: PopupRuntimeFactory = request => {
    const { popup, options, services } = request;
    const host = document.createElement('div');
    host.dataset.reactPopupHost = '';
    const refs = {} as PopupRefs;
    let phase: Phase = 'created';
    let pending = false, disposed = false, forceConfirm = false, lastEscape = 0;
    let opener: HTMLElement | null = null;
    let cropper: CropperInstance | undefined;
    let resolve!: (value: PopupValue) => void;
    let reject!: (error: unknown) => void;
    const result = new Promise<PopupValue>((yes, no) => { resolve = yes; reject = no; });
    const root = createRoot(host, { onUncaughtError: error => queueMicrotask(() => fail(error)) });
    const cleanup = () => {
        if (disposed) return;
        disposed = true;
        if (refs.dlg?.open) refs.dlg.close();
        root.unmount();
        host.remove();
        services.dispose();
        services.fixToast();
        if (opener?.isConnected) opener.focus();
    };
    const fail = (error: unknown) => { cleanup(); reject(error); };
    const close = async () => {
        if (disposed) return;
        refs.dlg.close();
        try { await popup.onClose?.(popup); cleanup(); resolve(popup.value); }
        catch (error) { fail(error); }
    };
    const setAutoFocus = ({ applyAutoFocus = false } = {}) => {
        const control = refs.dlg.querySelector<HTMLElement>('[autofocus]') ?? (popup.type === INPUT ? refs.mainInput : refs.buttonControls.querySelector<HTMLElement>(`[data-result="${popup.defaultResult}"]`));
        if (!control) return;
        if (applyAutoFocus) { control.setAttribute('autofocus', ''); control.tabIndex = 0; }
        else control.focus();
    };
    const complete = async (selected: number | null): Promise<PopupValue> => {
        if (pending || disposed || phase === 'closing') return undefined;
        pending = true;
        try {
            let value: PopupValue = selected;
            if (popup.type === INPUT) value = selected !== null && selected >= 1 ? refs.mainInput.value : selected === null ? null : false;
            if (popup.type === CROP) {
                if (selected !== null && selected >= 1 && !cropper) throw new Error('Crop image is not ready');
                value = selected !== null && selected >= 1 ? cropper!.getCroppedCanvas().toDataURL('image/jpeg') : null;
            }
            popup.result = selected;
            popup.value = value;
            popup.inputResults = popup.customInputs?.length ? new Map(popup.customInputs.filter(input => input.id).map(input => {
                const control = refs.dlg.querySelector<HTMLInputElement | HTMLTextAreaElement>(`#${CSS.escape(input.id)}`);
                return [input.id, control instanceof HTMLInputElement && control.type === 'checkbox' ? control.checked : control?.value ?? ''];
            })) : undefined;
            if (popup.onClosing && !await popup.onClosing(popup)) {
                popup.result = undefined; popup.value = undefined; popup.inputResults = undefined;
                if (!refs.dlg.open && phase === 'open') refs.dlg.showModal();
                return undefined;
            }
            services.recordResult();
            phase = 'closing'; render();
            return result;
        } catch (error) {
            popup.result = undefined; popup.value = undefined; popup.inputResults = undefined;
            throw error;
        } finally { pending = false; }
    };
    const cancel = () => {
        if (options.allowEscapeClose !== false) { void complete(null).catch(services.reportError); return; }
        if (!refs.dlg.open && phase === 'open') refs.dlg.showModal();
        const now = Date.now();
        if (now - lastEscape < 500 && !forceConfirm) {
            forceConfirm = true;
            requestAnimationFrame(() => { void services.confirmForceClose().then(async confirmed => { if (confirmed && !disposed) await complete(null); }).catch(services.reportError).finally(() => { forceConfirm = false; }); });
        }
        lastEscape = now;
    };
    const opened = () => {
        if (phase !== 'open' || disposed) return;
        void Promise.resolve().then(() => popup.onOpen?.(popup)).catch(fail);
    };
    const render = () => flushSync(() => root.render(<Theme theme={emberDeskTheme} mode="dark"><PopupDialog request={request} refs={refs} phase={phase} complete={complete} cancel={cancel} opened={opened} close={() => { void close(); }} setAutoFocus={setAutoFocus} setCropper={value => { cropper = value; }} /></Theme>));
    try { render(); } catch (error) { cleanup(); throw error; }
    return {
        refs, complete, setAutoFocus,
        show: () => {
            if (phase === 'created' && !disposed) {
                opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
                document.body.append(host);
                phase = 'open';
                try { render(); } catch (error) { fail(error); }
            }
            return result;
        },
    };
};
