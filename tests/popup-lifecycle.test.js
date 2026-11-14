import { afterEach, expect, jest, test } from '@jest/globals';

jest.unstable_mockModule('../public/scripts/RossAscends-mods.js', () => ({ shouldSendOnEnter: () => true }));
jest.unstable_mockModule('../public/scripts/i18n.js', () => ({ t: strings => strings.join(''), translate: text => text }));
jest.unstable_mockModule('../public/scripts/power-user.js', () => ({ toastPositionClasses: [] }));
jest.unstable_mockModule('../public/scripts/utils.js', () => ({
    removeFromArray: (array, item) => { const index = array.indexOf(item); if (index >= 0) array.splice(index, 1); },
    runAfterAnimation: (_element, callback) => { void callback(); },
    uuidv4: () => 'popup-id',
}));

afterEach(async () => {
    const { Popup } = await import('../public/scripts/popup.js');
    Popup.util.popups.length = 0;
    Popup.util.lastResult = null;
});

test('constructing a popup requires the React runtime', async () => {
    const { Popup, POPUP_TYPE, installPopupRuntime } = await import('../public/scripts/popup.js');
    expect(() => new Popup('content', POPUP_TYPE.CONFIRM)).toThrow(/popup.*runtime/i);
    expect(() => installPopupRuntime(null)).toThrow(TypeError);
});

test('consumers receive synchronous references and keep the runtime result and callbacks', async () => {
    const { Popup, POPUP_TYPE, POPUP_RESULT, installPopupRuntime } = await import('../public/scripts/popup.js');
    const result = Promise.resolve('saved input');
    const refs = { dlg: { open: true }, content: {}, okButton: {}, closeButton: {} };
    const runtime = { refs, show: jest.fn(() => result), complete: jest.fn(() => result), setAutoFocus: jest.fn() };
    const factory = jest.fn(() => runtime);
    installPopupRuntime(factory);
    const content = {};
    const options = { onOpen: jest.fn(), onClosing: jest.fn(), onClose: jest.fn(), customInputs: [{ id: 'enabled' }] };
    const popup = new Popup(content, POPUP_TYPE.INPUT, 'initial', options);

    expect(popup.dlg).toBe(refs.dlg);
    expect(popup.content).toBe(refs.content);
    expect(popup.okButton).toBe(refs.okButton);
    expect(factory).toHaveBeenCalledWith(expect.objectContaining({ popup, content, inputValue: 'initial', options }));
    expect(popup.onClosing).toBe(options.onClosing);
    expect(popup.onOpen).toBe(options.onOpen);
    expect(popup.onClose).toBe(options.onClose);
    expect(Popup.util.isPopupOpen()).toBe(true);
    expect(popup.show()).toBe(result);
    popup.setAutoFocus({ applyAutoFocus: true });
    expect(runtime.setAutoFocus).toHaveBeenCalledWith({ applyAutoFocus: true });
    expect(popup.completeAffirmative()).toBe(result);
    popup.completeNegative();
    popup.completeCancelled();
    expect(runtime.complete.mock.calls).toEqual([[POPUP_RESULT.AFFIRMATIVE], [POPUP_RESULT.NEGATIVE], [POPUP_RESULT.CANCELLED]]);

    const { services } = factory.mock.calls[0][0];
    popup.value = 'saved input';
    popup.result = POPUP_RESULT.AFFIRMATIVE;
    popup.inputResults = new Map([['enabled', true]]);
    services.recordResult();
    expect(Popup.util.lastResult).toEqual({ value: 'saved input', result: POPUP_RESULT.AFFIRMATIVE, inputResults: popup.inputResults });
    services.dispose();
    expect(Popup.util.isPopupOpen()).toBe(false);
    expect(Popup.util.popups).toEqual([]);
});

test('callGenericPopup forwards input cancellation without converting its value', async () => {
    const { callGenericPopup, installPopupRuntime, POPUP_TYPE } = await import('../public/scripts/popup.js');
    const show = jest.fn(async () => false);
    installPopupRuntime(() => ({ refs: { dlg: { open: false } }, show, complete: jest.fn(), setAutoFocus: jest.fn() }));
    expect(await callGenericPopup('Input', POPUP_TYPE.INPUT, 'draft', { rows: 2 })).toBe(false);
    expect(show).toHaveBeenCalledTimes(1);
});
