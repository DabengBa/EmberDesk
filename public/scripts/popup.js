import { shouldSendOnEnter } from './RossAscends-mods.js';
import { translate } from './i18n.js';
import { toastPositionClasses } from './power-user.js';
import { removeFromArray, runAfterAnimation, uuidv4 } from './utils.js';

/** @readonly */
/** @enum {Number} */
export const POPUP_TYPE = {
    /** Main popup type. Containing any content displayed, with buttons below. Can also contain additional input controls. */
    TEXT: 1,
    /** Popup mainly made to confirm something, answering with a simple Yes/No or similar. Focus on the button controls. */
    CONFIRM: 2,
    /** Popup who's main focus is the input text field, which is displayed here. Can contain additional content above. Return value for this is the input string. */
    INPUT: 3,
    /** Popup without any button controls. Used to simply display content, with a small X in the corner. */
    DISPLAY: 4,
    /** Popup that displays an image to crop. Returns a cropped image in result. */
    CROP: 5,
};

/** @readonly */
/** @enum {number?} */
export const POPUP_RESULT = {
    AFFIRMATIVE: 1,
    NEGATIVE: 0,
    CANCELLED: null,
    CUSTOM1: 1001,
    CUSTOM2: 1002,
    CUSTOM3: 1003,
    CUSTOM4: 1004,
    CUSTOM5: 1005,
    CUSTOM6: 1006,
    CUSTOM7: 1007,
    CUSTOM8: 1008,
    CUSTOM9: 1009,
};

/**
 * @typedef {object} PopupOptions
 * @property {string|boolean?} [okButton=null] - Custom text for the OK button. A set text will always show the button. `true` or `false` to explicitly show or hide the button. `null` will leave the behavior and display of the button unchanged, based on the popup type.
 * @property {string|boolean?} [cancelButton=null] - Custom text for the Cancel button. A set text will always show the button. `true` or `false` to explicitly show or hide the button. `null` will leave the behavior and display of the button unchanged, based on the popup type.
 * @property {number?} [rows=1] - The number of rows for the input field
 * @property {string?} [placeholder=null] - Placeholder text for the main interactive element (input field for INPUT type). For other popup types, use tooltip for additional hints or to describe content elements.
 * @property {string?} [tooltip=null] - Tooltip text shown on hover for the main interactive element or content area
 * @property {boolean?} [wide=false] - Whether to display the popup in wide mode (wide screen, 1/1 aspect ratio)
 * @property {boolean?} [wider=false] - Whether to display the popup in wider mode (just wider, no height scaling)
 * @property {boolean?} [large=false] - Whether to display the popup in large mode (90% of screen)
 * @property {boolean?} [transparent=false] - Whether to display the popup in transparent mode (no background, border, shadow or anything, only its content)
 * @property {boolean?} [allowHorizontalScrolling=false] - Whether to allow horizontal scrolling in the popup
 * @property {boolean?} [allowVerticalScrolling=false] - Whether to allow vertical scrolling in the popup
 * @property {boolean?} [leftAlign=false] - Whether the popup content should be left-aligned by default
 * @property {'slow'|'fast'|'none'?} [animation='slow'] - Animation speed for the popup (opening, closing, ...)
 * @property {POPUP_RESULT|number?} [defaultResult=POPUP_RESULT.AFFIRMATIVE] - The default result of this popup when Enter is pressed. Can be changed from `POPUP_RESULT.AFFIRMATIVE`.
 * @property {CustomPopupButton[]|string[]?} [customButtons=null] - Custom buttons to add to the popup. If only strings are provided, the buttons will be added with default options, and their result will be in order from `2` onward.
 * @property {CustomPopupInput[]?} [customInputs=null] - Custom inputs to add to the popup. The display below the content and the input box, one by one.
 * @property {boolean} [allowEscapeClose=true] - If true, allows closing the popup with the Escape key, returning `POPUP_RESULT.CANCELLED`. If false, requires double-escape to force close with a confirmation to prevent accidental closure.
 * @property {(popup: Popup) => Promise<boolean?>|boolean?} [onClosing=null] - Handler called before the popup closes, return `false` to cancel the close
 * @property {(popup: Popup) => Promise<void?>|void?} [onClose=null] - Handler called after the popup closes, but before the DOM is cleaned up
 * @property {(popup: Popup) => Promise<void?>|void?} [onOpen=null] - Handler called after the popup opens
 * @property {number?} [cropAspect=null] - Aspect ratio for the crop popup
 * @property {string?} [cropImage=null] - Image URL to display in the crop popup
 */

/**
 * @typedef {object} CustomPopupButton
 * @property {string} text - The text of the button
 * @property {string?} [tooltip] - Optional tooltip text displayed when hovering over the button
 * @property {POPUP_RESULT|number?} [result] - The result of the button - can also be a custom result value to make be able to find out that this button was clicked. If no result is specified, this button will **not** close the popup.
 * @property {string[]|string?} [classes] - Optional custom CSS classes applied to the button
 * @property {string?} [icon] - Optional Font Awesome icon class (e.g. 'fa-wand-magic-sparkles') to display before the text
 * @property {()=>void?} [action] - Optional action to perform when the button is clicked
 * @property {boolean?} [appendAtEnd] - Whether to append the button to the end of the popup - by default it will be prepended
 */

/**
 * @typedef {object} CustomPopupInput
 * @property {string} id - The id for the html element
 * @property {string} label - The label text for the input
 * @property {string?} [tooltip=null] - Optional tooltip to be displayed. Default placeholder in input controls, tooltip icon behind the checkbox for those.
 * @property {boolean|string|undefined} [defaultState=false] - The default state when opening the popup (false if not set)
 * @property {('checkbox'|'text'|'textarea'|'number')?} [type='checkbox'] - The type of the input (default is checkbox)
 * @property {number?} [rows=1] - The number of rows for the input field, if the input is 'textarea'
 * @property {number?} [min] - The minimum value for number inputs
 * @property {number?} [max] - The maximum value for number inputs
 * @property {number?} [step] - The step value for number inputs
 * @property {boolean?} [disabled=false] - Whether the input should be disabled
 */

/**
 * @typedef {object} ShowPopupHelper
 * Local implementation of the helper functionality to show several popups.
 *
 * Should be called via `Popup.show.xxxx()`.
 */
const showPopupHelper = {
    /**
     * Asynchronously displays an input popup with the given header and text, and returns the user's input.
     *
     * @param {string?} header - The header text for the popup.
     * @param {string?} [text] - The main text for the popup.
     * @param {string} [defaultValue=''] - The default value for the input field.
     * @param {PopupOptions} [popupOptions={}] - Options for the popup.
     * @return {Promise<string?>} A Promise that resolves with the user's input.
     */
    input: async (header, text, defaultValue = '', popupOptions = {}) => {
        const content = PopupUtils.BuildTextWithHeader(header, text);
        const popup = new Popup(content, POPUP_TYPE.INPUT, defaultValue, popupOptions);
        const value = await popup.show();
        // Return values: If empty string, we explicitly handle that as returning that empty string as "success" provided.
        // Otherwise, all non-truthy values (false, null, undefined) are treated as "cancel" and return null.
        if (value === '') return '';
        return value ? String(value) : null;
    },

    /**
     * Asynchronously displays a confirmation popup with the given header and text, returning the clicked result button value.
     *
     * @param {string?} header - The header text for the popup.
     * @param {string?} [text] - The main text for the popup.
     * @param {PopupOptions} [popupOptions={}] - Options for the popup.
     * @return {Promise<POPUP_RESULT?>} A Promise that resolves with the result of the user's interaction.
     */
    confirm: async (header, text, popupOptions = {}) => {
        const content = PopupUtils.BuildTextWithHeader(header, text);
        const popup = new Popup(content, POPUP_TYPE.CONFIRM, null, popupOptions);
        const result = await popup.show();
        if (typeof result === 'string' || typeof result === 'boolean') throw new Error(`Invalid popup result. CONFIRM popups only support numbers, or null. Result: ${result}`);
        return result;
    },
    /**
     * Asynchronously displays a text popup with the given header and text, returning the clicked result button value.
     *
     * @param {string?} header - The header text for the popup.
     * @param {string?} text - The main text for the popup.
     * @param {PopupOptions} [popupOptions={}] - Options for the popup.
     * @return {Promise<POPUP_RESULT?>} A Promise that resolves with the result of the user's interaction.
     */
    text: async (header, text, popupOptions = {}) => {
        const content = PopupUtils.BuildTextWithHeader(header, text);
        const popup = new Popup(content, POPUP_TYPE.TEXT, null, popupOptions);
        const result = await popup.show();
        if (typeof result === 'string' || typeof result === 'boolean') throw new Error(`Invalid popup result. TEXT popups only support numbers, or null. Result: ${result}`);
        return result;
    },
};

/** @type {import('../../app/components/local-dialogs/PopupRuntime').PopupRuntimeFactory | undefined} */
let popupRuntimeFactory;

/** @param {import('../../app/components/local-dialogs/PopupRuntime').PopupRuntimeFactory} factory */
export function installPopupRuntime(factory) {
    if (typeof factory !== 'function') throw new TypeError('Invalid Popup React runtime factory');
    popupRuntimeFactory = factory;
}

// React creates the public references synchronously and owns the entire dialog.
export class Popup {
    /** @type {number} */ type;
    /** @type {string} */ id;
    /** @type {HTMLDialogElement} */ dlg;
    /** @type {HTMLDivElement} */ body;
    /** @type {HTMLDivElement} */ content;
    /** @type {HTMLTextAreaElement} */ mainInput;
    /** @type {HTMLDivElement} */ inputControls;
    /** @type {HTMLDivElement} */ buttonControls;
    /** @type {HTMLButtonElement} */ okButton;
    /** @type {HTMLButtonElement} */ cancelButton;
    /** @type {HTMLButtonElement} */ closeButton;
    /** @type {HTMLDivElement} */ cropWrap;
    /** @type {HTMLImageElement} */ cropImage;
    /** @type {number|null} */ defaultResult;
    /** @type {CustomPopupButton[]|string[]|null} */ customButtons;
    /** @type {CustomPopupInput[]|null} */ customInputs;
    /** @type {PopupOptions['onClosing']} */ onClosing;
    /** @type {PopupOptions['onClose']} */ onClose;
    /** @type {PopupOptions['onOpen']} */ onOpen;
    /** @type {number|null|undefined} */ result;
    /** @type {string|number|boolean|null|undefined} */ value;
    /** @type {Map<string,string|boolean>|undefined} */ inputResults;
    /** @type {object|undefined} */ cropData;
    /** @type {HTMLElement|undefined} */ lastFocus;
    /** @type {import('../../app/components/local-dialogs/PopupRuntime').PopupRuntime} */ #runtime;

    /** @param {JQuery<HTMLElement>|string|Element} content @param {number} type @param {string} [inputValue] @param {PopupOptions} [options] */
    constructor(content, type, inputValue = '', options = {}) {
        if (!popupRuntimeFactory) throw new Error('Popup React runtime has not been installed');
        this.id = uuidv4();
        this.type = type;
        this.defaultResult = options.defaultResult ?? POPUP_RESULT.AFFIRMATIVE;
        this.customButtons = options.customButtons ?? null;
        this.customInputs = options.customInputs ?? null;
        this.onClosing = options.onClosing;
        this.onClose = options.onClose;
        this.onOpen = options.onOpen;
        let forcePopup;
        this.#runtime = popupRuntimeFactory({
            popup: this, content, inputValue, options,
            services: {
                translate, shouldSendOnEnter,
                afterAnimation: runAfterAnimation,
                fixToast: fixToastrForDialogs,
                recordResult: () => { Popup.util.lastResult = { value: this.value, result: this.result, inputResults: this.inputResults }; },
                dispose: () => {
                    removeFromArray(Popup.util.popups, this);
                    if (forcePopup?.dlg.open) void forcePopup.completeCancelled();
                },
                confirmForceClose: async () => {
                    forcePopup = new Popup(PopupUtils.BuildTextWithHeader(translate('Force-close Blocking Popup'),
                        '<p>' + translate('This action is blocking and not meant to be closed manually.') + '</p><p>' + translate('Force-closing may leave the application in an inconsistent state.') + '</p><p><strong>' + translate('Are you sure you want to force-close?') + '</strong></p>'),
                    POPUP_TYPE.CONFIRM, '', { okButton: translate('Force Close'), cancelButton: translate('Cancel') });
                    return await forcePopup.show() === POPUP_RESULT.AFFIRMATIVE;
                },
                reportError: error => { console.error('Popup action failed', error); toastr.error(String(error?.message ?? error)); },
            },
        });
        Object.assign(this, this.#runtime.refs);
        Popup.util.popups.push(this);
    }

    show() { return this.#runtime.show(); }
    /** @param {{applyAutoFocus?:boolean}} [options] */
    setAutoFocus(options) { this.#runtime.setAutoFocus(options); }
    /** @param {number|null} result */
    complete(result) { return this.#runtime.complete(result); }
    completeAffirmative() { return this.complete(POPUP_RESULT.AFFIRMATIVE); }
    completeNegative() { return this.complete(POPUP_RESULT.NEGATIVE); }
    completeCancelled() { return this.complete(POPUP_RESULT.CANCELLED); }
    static show = showPopupHelper;
    static util = {
        /** @type {Popup[]} */ popups: [],
        /** @type {{value: string|number|boolean|null|undefined, result: number|null|undefined, inputResults: Map<string,string|boolean>|undefined}|null} */ lastResult: null,
        isPopupOpen() { return Popup.util.popups.some(popup => popup.dlg.open); },
        getTopmostModalLayer,
    };
}

export class PopupUtils {
    /**
     * Builds popup content with header and text below
     *
     * @param {string?} header - The header to be added to the text
     * @param {string?} text - The main text content
     */
    static BuildTextWithHeader(header, text) {
        if (!header) {
            return text;
        }
        return `<h3>${header}</h3>
            ${text ?? ''}`; // Convert no text to empty string
    }
}

/**
 * Displays a blocking popup with a given content and type
 *
 * @param {JQuery<HTMLElement>|string|Element} content - Content or text to display in the popup
 * @param {POPUP_TYPE} type
 * @param {string} inputValue - Value to set the input to
 * @param {PopupOptions} [popupOptions={}] - Options for the popup
 * @returns {Promise<POPUP_RESULT|string|boolean?>} The value for this popup, which can either be the popup retult or the input value if chosen
 */
export function callGenericPopup(content, type, inputValue = '', popupOptions = {}) {
    const popup = new Popup(
        content,
        type,
        inputValue,
        popupOptions,
    );
    return popup.show();
}

/**
 * Returns the topmost modal layer in the document. If there is an open dialog,
 * it returns the dialog element. Otherwise, it returns the document body.
 *
 * @return {HTMLElement} The topmost modal layer element
 */
export function getTopmostModalLayer() {
    const dlg = Array.from(document.querySelectorAll('dialog[open]:not([closing])')).pop();
    if (dlg instanceof HTMLElement) return dlg;
    return document.body;
}

/**
 * Fixes the issue with toastr not displaying on top of the dialog by moving the toastr container inside the dialog or back to the main body
 */
export function fixToastrForDialogs() {
    // Hacky way of getting toastr to actually display on top of the popup...
    const dlg = Array.from(document.querySelectorAll('dialog[open]:not([closing])')).pop();

    let toastContainer = document.getElementById('toast-container');
    const isAlreadyPresent = !!toastContainer;
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.setAttribute('id', 'toast-container');
        if (toastr.options.positionClass) toastContainer.classList.add(toastr.options.positionClass);
    }

    // Check if toastr is already a child. If not, we need to move it inside this dialog.
    // This is either the existing toastr container or the newly created one.
    if (dlg && !dlg.contains(toastContainer)) {
        dlg?.appendChild(toastContainer);
        return;
    }

    // Now another case is if we only have one popup and that is currently closing. In that case the toastr container exists,
    // but we don't have an open dialog to move it into. It's just inside the existing one that will be gone in milliseconds.
    // To prevent new toasts from being showing up in there and then vanish in an instant,
    // we move the toastr back to the main body, or delete if its empty
    if (!dlg && isAlreadyPresent) {
        if (!toastContainer.childNodes.length) {
            toastContainer.remove();
        } else {
            document.body.appendChild(toastContainer);
            toastContainer.classList.remove(...toastPositionClasses);
            toastContainer.classList.add(toastr.options.positionClass);
        }
    }
}
