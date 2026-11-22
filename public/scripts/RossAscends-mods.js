import toastr from './notifications.js';
import { DOMPurify, Bowser } from '../lib.js';
import { runDialoguePopupCommand, runDeleteMessageCommand, runHistoryRowCommand } from './workspace-interaction-commands.js';

import {
    online_status,
    main_api,
    is_send_press,
    max_context,
    saveSettingsDebounced,
    setActiveCharacter,
    getEntitiesList,
    buildAvatarList,

    menu_type,
    substituteParams,
    openWorkspaceChildSlotHost,

    openWorkspaceShellPromptManager,
    openWorkspaceShellWorldInfo,
} from '../script.js';

import { eventSource, event_types } from './events.js';
import {
    power_user,
} from './power-user.js';

import {
    SECRET_KEYS,
    secret_state,
} from './secrets.js';
import { debounce, getStringHash, isValidUrl } from './utils.js';
import { chat_completion_sources, connectProviderConnection, oai_settings } from './openai.js';
import { getTokenCountAsync } from './tokenizers.js';
import { debounce_timeout } from './constants.js';

import { Popup } from './popup.js';

import { getCurrentUserHandle } from './user.js';
import { getComposerValue, setComposerValue, subscribeComposerValue } from './main-chat-composer-service.js';
import { scrollChatTo } from './chat-ui-motion.js';
import { selectCharacterById } from './character-lifecycle-service.js';


// Populated in initRossMods: drawer/panel markup is React-mounted after module eval.
// The settings drawer opener is injected by script.js — importing it here would
// add a new script.js reverse import (composition-root contract forbids that).
var injectedOpenWorkspaceShellSettings = null;

var SelectedCharacterTab = null;

var connection_made = false;
var retry_delay = 500;
let counterNonce = Date.now();

const observerConfig = { childList: true, subtree: true };
const countTokensDebounced = debounce(RA_CountCharTokens, debounce_timeout.relaxed);
const countTokensShortDebounced = debounce(RA_CountCharTokens, debounce_timeout.short);

const observer = new MutationObserver(function (mutations) {
    mutations.forEach(function (mutation) {
        if (!(mutation.target instanceof HTMLElement)) {
            return;
        }
        if (mutation.target.parentNode === SelectedCharacterTab) {
            countTokensShortDebounced();
        } else if (mutation.target.classList.contains('mes_text')) {
            for (const element of mutation.target.getElementsByTagName('math')) {
                element.childNodes.forEach(function (child) {
                    if (child.nodeType === Node.TEXT_NODE) {
                        child.textContent = '';
                    }
                });
            }
        }
    });
});

observer.observe(document.documentElement, observerConfig);


/**
 * DON'T OPTIMIZE, don't change this to a const or let, it needs to be a var.
 */
var parsedUA = null;

export function getParsedUA() {
    if (!parsedUA) {
        try {
            parsedUA = Bowser.parse(navigator.userAgent);
        } catch {
            // In case the user agent is an empty string or Bowser can't parse it for some other reason
        }
    }

    return parsedUA;
}

/**
 * Checks if the device is a mobile device.
 * @returns {boolean} - True if the device is a mobile device, false otherwise.
 */
export function isMobile() {
    const mobileTypes = ['mobile', 'tablet'];

    return mobileTypes.includes(getParsedUA()?.platform?.type);
}

export function shouldSendOnEnter() {
    // Enter-to-send is fixed to "automatic": enabled on desktop, off on mobile.
    return !isMobile();
}

/**
 * Gets a humanized date time string from a given timestamp.
 * @param {number} timestamp Timestamp in milliseconds
 * @returns {string} Humanized date time string in the format `YYYY-MM-DD@HHhMMmSSsMSms`
 */
export function humanizedDateTime(timestamp = Date.now()) {
    const date = new Date(timestamp);
    const dt = {
        year: date.getFullYear(),
        month: date.getMonth() + 1,
        day: date.getDate(),
        hour: date.getHours(),
        minute: date.getMinutes(),
        second: date.getSeconds(),
        millisecond: date.getMilliseconds(),
    };
    for (const key in dt) {
        const padLength = key === 'millisecond' ? 3 : 2;
        dt[key] = dt[key].toString().padStart(padLength, '0');
    }
    return `${dt.year}-${dt.month}-${dt.day}@${dt.hour}h${dt.minute}m${dt.second}s${dt.millisecond}ms`;
}

/**
 * Gets a timestamp for messages in ISO 8601 format.
 * @param {number} timestamp - optional timestamp in milliseconds
 * @returns {string} ISO 8601 formatted timestamp
 */
export function getMessageTimeStamp(timestamp = Date.now()) {
    const date = new Date(timestamp);
    return date.toISOString();
}


// triggers are bound in initRossMods: their targets are React-mounted after module eval.
//function:
export async function RA_CountCharTokens() {
    counterNonce = Date.now();
    const counterNonceLocal = counterNonce;
    let total_tokens = 0;
    let permanent_tokens = 0;

    const tokenCounters = document.querySelectorAll('[data-token-counter]');
    for (const tokenCounter of tokenCounters) {
        if (counterNonceLocal !== counterNonce) {
            return;
        }

        const counter = tokenCounter;
        const input = document.getElementById(counter.dataset.tokenCounter);
        const isPermanent = counter.dataset.tokenPermanent === 'true';

        if (!input) {
            counter.textContent = 'Invalid input reference';
            continue;
        }
        const value = String(input.value);

        if (!value) {
            delete input.dataset.lastValueHash;
            counter.textContent = '0';
            continue;
        }

        const valueHash = getStringHash(value);

        if (input.dataset.lastValueHash === String(valueHash)) {
            total_tokens += Number(counter.textContent);
            permanent_tokens += isPermanent ? Number(counter.textContent) : 0;
        } else {
            // We substitute macro for existing characters, but not for the character being created
            const valueToCount = menu_type === 'create' ? value : substituteParams(value);
            const tokens = await getTokenCountAsync(valueToCount);

            if (counterNonceLocal !== counterNonce) {
                return;
            }

            counter.textContent = String(tokens);
            total_tokens += tokens;
            permanent_tokens += isPermanent ? tokens : 0;
            input.dataset.lastValueHash = String(valueHash);
        }
    }

    // Warn if total tokens exceeds the limit of half the max context
    const tokenLimit = Math.max(((main_api !== 'openai' ? max_context : oai_settings.openai_max_context) / 2), 1024);
    const showWarning = (total_tokens > tokenLimit);
    const total = document.getElementById('result_info_total_tokens');
    const permanent = document.getElementById('result_info_permanent_tokens');
    if (total) total.textContent = String(total_tokens);
    if (permanent) permanent.textContent = String(permanent_tokens);
    document.getElementById('result_info_text')?.classList.toggle('neutral_warning', showWarning);
    const warning = document.getElementById('chartokenwarning');
    if (warning) warning.style.display = showWarning ? '' : 'none';
}
export async function favsToHotswap() {
    const entities = getEntitiesList({ doFilter: false });
    const containers = document.querySelectorAll('#right-nav-panel .hotswap');

    // Hard limit is required because even if all hotswaps don't fit the screen, their images would still be loaded
    // 25 is roughly calculated as the maximum number of favs that can fit an ultrawide monitor with the default theme
    const FAVS_LIMIT = 25;
    const favs = entities.filter(x => x.item.fav || x.item.fav == 'true').slice(0, FAVS_LIMIT);


    //helpful instruction message if no characters are favorited
    if (favs.length == 0) {
        const label = DOMPurify.sanitize(containers[0]?.getAttribute('no_favs'));
        containers.forEach(container => { container.innerHTML = `<small><span><i class="fa-solid fa-star"></i>&nbsp;${label}</span></small>`; });
        return;
    }

    buildAvatarList(containers, favs, { interactable: true, highlightFavs: false });
    for (const container of containers) {
        for (const character of container.querySelectorAll('.character_select')) {
            character.addEventListener('click', event => {
                if (event.button >= 1 || character.disabled === true) return;
                const characterId = character.getAttribute('data-chid') ?? undefined;
                void selectCharacterById(Number(characterId));
                setActiveCharacter(characterId);
                saveSettingsDebounced();
            });
        }
    }
}

//changes input bar and send button display depending on connection status
function RA_checkOnlineStatus() {
    if (online_status == 'no_connection') {
        const send_textarea = document.getElementById('send_textarea');
        if (send_textarea?.hasAttribute('no_connection_text')) send_textarea.setAttribute('placeholder', send_textarea.getAttribute('no_connection_text'));
        document.getElementById('send_form')?.classList.add('no-connection');
        document.getElementById('send_but')?.classList.add('displayNone');
        connection_made = false;
    } else {
        if (online_status !== undefined && online_status !== 'no_connection') {
            const send_textarea = document.getElementById('send_textarea');
            if (send_textarea?.hasAttribute('connected_text')) send_textarea.setAttribute('placeholder', send_textarea.getAttribute('connected_text'));
            document.getElementById('send_form')?.classList.remove('no-connection');
            connection_made = true;
            retry_delay = 100;

            if (!is_send_press) {
                document.getElementById('send_but')?.classList.remove('displayNone');
            }
        }
    }
}
//Auto-connect to API (when set to kobold, API URL exists, and auto_connect is true)

function RA_autoconnect(_PrevApi) {
    // secrets.js or script.js not loaded
    if (SECRET_KEYS === undefined || online_status === undefined) {
        setTimeout(RA_autoconnect, 100);
        return;
    }
    if (online_status === 'no_connection' && power_user.auto_connect) {
        switch (main_api) {
            case 'openai':
                // Single-provider contract: only the unified OpenAI-compatible key/endpoint remains.
                if ((secret_state[SECRET_KEYS.OPENAI] || isValidUrl(oai_settings.custom_url))
                    && oai_settings.chat_completion_source == chat_completion_sources.OPENAI) {
                    void connectProviderConnection();
                }
                break;
        }

        if (!connection_made) {
            retry_delay = Math.min(retry_delay * 2, 30000); // double retry delay up to to 30 secs
            // console.log('connection attempts: ' + RA_AC_retries + ' delay: ' + (retry_delay / 1000) + 's');
            // setTimeout(RA_autoconnect, retry_delay);
        }
    }
}

function OpenNavPanels(drawerService) {
    // Below 1000px the mobile stylesheet renders open drawers as full-screen
    // overlays — auto-opening one would cover the whole workspace even on a
    // narrow desktop window, so the auto-open only applies on wide viewports.
    {
        const restorable = new Set(drawerService.getRestorable({ mobile: isMobile(), width: window.innerWidth }));
        // Restore drawers that were open when the shell last unloaded. The
        // restore must not close sibling drawers: these opens land
        // asynchronously and would otherwise clobber whatever the user just
        // opened (including each other).
        const restoreFailed = label => error => console.warn(`Drawer restore failed (${label}).`, error);
        if (restorable.has('left-nav-panel')) {
            void openWorkspaceShellPromptManager({ preserveOpenDrawers: true }).catch(restoreFailed('left-nav-panel'));
        }

        if (restorable.has('right-nav-panel')) {
            void openWorkspaceChildSlotHost('right-nav-panel', { preserveOpenDrawers: true }).catch(restoreFailed('right-nav-panel'));
        }

        if (restorable.has('WorldInfo')) {
            console.debug('RA -- opening WI panel');
            void openWorkspaceShellWorldInfo({ preserveOpenDrawers: true }).catch(restoreFailed('WorldInfo'));
        }

        if (restorable.has('RegexPanel')) {
            void openWorkspaceChildSlotHost('RegexPanel', { preserveOpenDrawers: true }).catch(restoreFailed('RegexPanel'));
        }

        if (restorable.has('SettingsPanel')) {
            void injectedOpenWorkspaceShellSettings?.({ preserveOpenDrawers: true })?.catch(restoreFailed('SettingsPanel'));
        }
    }
}

const getUserInputKey = () => getCurrentUserHandle() + '_userInput';

function restoreUserInput() {
    const userInput = localStorage.getItem(getUserInputKey());
    if (userInput && !getComposerValue()) {
        setComposerValue(userInput);
    }
}

function saveUserInput() {
    const userInput = getComposerValue();
    localStorage.setItem(getUserInputKey(), userInput);
    console.debug('User Input -- ', userInput);
}
const saveUserInputDebounced = debounce(saveUserInput);

// Matches layout visibility (including zero-sized inline boxes), not CSS visibility.
function isVisible(element) {
    return !!element && !!(element.offsetWidth || element.offsetHeight || element.getClientRects().length);
}

const dragCleanups = new WeakMap();

// Make the DIV element draggable:

/**
 * Make the given element draggable (e.g. zoomed avatars, extension windows).
 * @param {HTMLElement} element - The element to make draggable.
 */
export function dragElement(element) {
    dragCleanups.get(element)?.();
    let actionType = null; // "drag" or "resize"
    let isMouseDown = false;
    let resizeChanged = false;

    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    let height, width, top, left,
        maxX, maxY, winHeight, winWidth;

    const elmntName = element.id;
    const header = document.getElementById(`${elmntName}header`);

    // jQuery width/height use content-box dimensions, regardless of box-sizing.
    function size(target, axis) {
        if (!target) return 0;
        const style = getComputedStyle(target);
        let value = parseFloat(style[axis]) || 0;
        if (style.boxSizing === 'border-box') {
            const edges = axis === 'width' ? ['Left', 'Right'] : ['Top', 'Bottom'];
            for (const edge of edges) value -= (parseFloat(style[`padding${edge}`]) || 0) + (parseFloat(style[`border${edge}Width`]) || 0);
        }
        return value;
    }
    function setSize(target, axis, value) {
        if (value == null || !Number.isFinite(value)) return;
        const style = getComputedStyle(target);
        if (style.boxSizing === 'border-box') {
            const edges = axis === 'width' ? ['Left', 'Right'] : ['Top', 'Bottom'];
            for (const edge of edges) value += (parseFloat(style[`padding${edge}`]) || 0) + (parseFloat(style[`border${edge}Width`]) || 0);
        }
        target.style[axis] = `${Math.max(0, value)}px`;
    }

    // Helper: Notify listeners when a drag/resize interaction ends
    function notifyResize() {
        if (actionType === 'resize') {
            eventSource.emit('resizeUI', elmntName);
        }
    }

    // Helper: Clamp element within viewport
    function clampToViewport() {
        if (top <= 0) element.style.top = '0px';
        else if (maxY >= winHeight) element.style.top = winHeight - maxY + top - 1 + 'px';
        if (left <= 0) element.style.left = '0px';
        else if (maxX >= winWidth) element.style.left = winWidth - maxX + left - 1 + 'px';
    }

    // Observer for style changes (position/size)
    const observer = new MutationObserver((mutations) => {
        const target = mutations[0].target;
        if (
            !isVisible(target) ||
            target.classList.contains('resizing') ||
            size(target, 'height') < 50 ||
            size(target, 'width') < 50 ||
            isMobile() ||
            !isMouseDown
        ) {
            observer.disconnect();
            return;
        }

        const style = getComputedStyle(element);
        height = parseInt(style.height);
        width = parseInt(style.width);
        top = parseInt(style.top);
        left = parseInt(style.left);
        maxX = width + left;
        maxY = height + top;
        winWidth = window.innerWidth;
        winHeight = window.innerHeight;

        if (actionType === 'resize') {
            resizeChanged = true;
            const containerAspectRatio = height / width;
            if (elmntName.startsWith('zoomFor_')) {
                const zoomedAvatarImage = element.querySelector('.zoomed_avatar_img');
                const imgHeight = size(zoomedAvatarImage, 'height');
                const imgWidth = size(zoomedAvatarImage, 'width');
                const imageAspectRatio = imgHeight / imgWidth;
                if (containerAspectRatio !== imageAspectRatio) {
                    setSize(element, 'width', size(element, 'width'));
                    setSize(element, 'height', size(element, 'width') * imageAspectRatio);
                }
                if (top + size(element, 'height') >= winHeight) {
                    setSize(element, 'height', winHeight - top - 1);
                    setSize(element, 'width', (winHeight - top - 1) / imageAspectRatio);
                }
                if (left + size(element, 'width') >= winWidth) {
                    setSize(element, 'width', winWidth - left - 1);
                    setSize(element, 'height', (winWidth - left - 1) * imageAspectRatio);
                }
            } else {
                if (top + size(element, 'height') >= winHeight) setSize(element, 'height', winHeight - top - 1);
                if (left + size(element, 'width') >= winWidth) setSize(element, 'width', winWidth - left - 1);
            }
            element.style.left = `${left}px`;
            element.style.top = `${top}px`;
        } else if (actionType === 'drag') {
            clampToViewport();
        }
    });

    // Mouse event handlers
    function dragMouseDown(e) {
        if (e) {
            actionType = 'drag';
            isMouseDown = true;
            e.preventDefault();
            pos3 = e.clientX;
            pos4 = e.clientY;
        }
        document.addEventListener('mouseup', closeDragElement);
        document.addEventListener('mousemove', elementDrag);
    }

    function elementDrag(e) {
        e.preventDefault();
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;
        element.setAttribute('data-dragged', 'true');
        const rect = element.getBoundingClientRect();
        element.style.left = (rect.left + window.scrollX - pos1) + 'px';
        element.style.top = (rect.top + window.scrollY - pos2) + 'px';
        element.style.margin = 'unset';
        setSize(element, 'height', height);
        setSize(element, 'width', width);
    }

    function closeDragElement() {
        isMouseDown = false;
        actionType = null;
        document.removeEventListener('mouseup', closeDragElement);
        document.removeEventListener('mousemove', elementDrag);
        element.setAttribute('data-dragged', 'false');
        observer.disconnect();
        notifyResize();
    }

    // Setup event listeners
    function onHeaderDown(e) {
        if (e.target.classList.contains('drag-grabber')) {
            actionType = 'drag';
            isMouseDown = true;
            observer.observe(element, { attributes: true, attributeFilter: ['style'] });
            dragMouseDown(e);
        }
    }
    function onElementDown(e) {
        const rect = element.getBoundingClientRect();
        const resizeMargin = 16;
        const isNearRight = e.clientX > rect.right - resizeMargin;
        const isNearBottom = e.clientY > rect.bottom - resizeMargin;
        if (isNearRight && isNearBottom) {
            actionType = 'resize';
            isMouseDown = true;
            resizeChanged = false;
            observer.observe(element, { attributes: true, attributeFilter: ['style'] });
        }
    }
    function onElementUp() {
        if (resizeChanged) notifyResize();
        isMouseDown = false;
        actionType = null;
        observer.disconnect();
    }
    header?.addEventListener('mousedown', onHeaderDown);
    element.addEventListener('mousedown', onElementDown);
    element.addEventListener('mouseup', onElementUp);
    dragCleanups.set(element, () => {
        header?.removeEventListener('mousedown', onHeaderDown);
        element.removeEventListener('mousedown', onElementDown);
        element.removeEventListener('mouseup', onElementUp);
        document.removeEventListener('mouseup', closeDragElement);
        document.removeEventListener('mousemove', elementDrag);
        observer.disconnect();
    });
}

// ---------------------------------------------------

export function initRossMods({ openWorkspaceShellSettings = null, drawerService } = {}) {
    injectedOpenWorkspaceShellSettings = openWorkspaceShellSettings;

    SelectedCharacterTab = document.getElementById('rm_button_selected_ch');


    //when any input is made to the create/edit character form textareas
    document.getElementById('rm_ch_create_block')?.addEventListener('input', countTokensDebounced);
    //when any input is made to the advanced editing popup textareas
    document.getElementById('character_popup')?.addEventListener('input', countTokensDebounced);

    // initial status check
    RA_checkOnlineStatus();
    eventSource.on(event_types.ONLINE_STATUS_CHANGED, () => RA_checkOnlineStatus());

    if (power_user.auto_connect) {
        RA_autoconnect();
    }

    drawerService.initializePins({ mobile: isMobile(), width: window.innerWidth });

    // Drawer open/closed persistence (NavOpened/WINavOpened) is written by
    // openWorkspaceChildSlotHost/closeWorkspaceChildSlotHost.

    // Restore persisted drawers synchronously: accountStorage and drawer hosts
    // are ready by now, and landing before APP_READY removes the old 300ms
    // race window where a nav click could interleave with the restore.
    OpenNavPanels(drawerService);


    subscribeComposerValue(saveUserInputDebounced);

    restoreUserInput();

    document.addEventListener('keydown', async function (event) {
        if (event.key !== 'Escape') await processHotkeys(event);
    });
    // Let the React chat owner consume edit/stop Escape before legacy panels.
    window.addEventListener('keydown', async function (event) {
        if (event.key === 'Escape' && !event.defaultPrevented) await processHotkeys(event);
    });

    const hotkeyTargets = {
        'dialogue_popup_input': document.querySelector('#dialogue_popup_input'),
    };

    //Additional hotkeys CTRL+ENTER and CTRL+UPARROW
    /**
     * @param {KeyboardEvent} event
     */
    async function processHotkeys(event) {
        if (event.defaultPrevented || event.isComposing || event.keyCode === 229) return;
        // Default hotkeys and shortcuts shouldn't work if any popup is currently open
        if (Popup.util.isPopupOpen()) {
            return;
        }

        if (document.activeElement == hotkeyTargets.dialogue_popup_input && !isMobile()) {
            if (!event.shiftKey && !event.ctrlKey && event.key == 'Enter') {
                event.preventDefault();
                runDialoguePopupCommand('confirmDialoguePopup');
                return;
            }
        }
        //ctrl+shift+up to scroll to context line
        if (event.shiftKey && event.ctrlKey && event.key == 'ArrowUp') {
            event.preventDefault();
            const contextLine = document.querySelector('.lastInContext');
            const chat = document.getElementById('chat');
            if (contextLine) {
                if (chat) scrollChatTo(chat, contextLine.getBoundingClientRect().top - chat.getBoundingClientRect().top + chat.scrollTop);
            } else { toastr.warning('Context line not found, send a message first!'); }
            return;
        }
        //ctrl+shift+down to scroll to bottom of chat
        if (event.shiftKey && event.ctrlKey && event.key == 'ArrowDown') {
            event.preventDefault();
            const chat = document.getElementById('chat');
            if (chat) scrollChatTo(chat, chat.scrollHeight);
            return;
        }

        if (event.key == 'Escape') { //closes various panels
            if (isVisible(document.getElementById('dialogue_popup'))) {
                if (isVisible(document.getElementById('dialogue_popup_cancel'))) {
                    runDialoguePopupCommand('cancelDialoguePopup');
                    return;
                } else {
                    runDialoguePopupCommand('confirmDialoguePopup');
                    return;
                }
            }

            if (isVisible(document.getElementById('select_chat_popup'))) {
                runHistoryRowCommand('close');
                return;
            }

            if (isVisible(document.getElementById('character_popup'))) {
                document.getElementById('character_cross')?.click();
                return;
            }

            const cancelDelete = /** @type {HTMLButtonElement | null} */ (document.getElementById('dialogue_del_mes_cancel'));
            if (isVisible(cancelDelete)) {
                if (!cancelDelete.disabled) runDeleteMessageCommand('cancel');
                return;
            }

            if (drawerService.handleEscape('primary')) return;
            if (drawerService.handleEscape('world')) return;

            const movingDivs = Array.from(document.querySelectorAll('#movingDivs > div')).reverse();
            for (const div of movingDivs) {
                if (isVisible(div)) {
                    div.querySelectorAll('.floating_panel_close, .dragClose').forEach(button => button.click());
                    return;
                }
            }

            if (drawerService.handleEscape('right')) return;
            if (Array.from(document.querySelectorAll('.draggable')).some(isVisible)) {
                // Remove the first matched element
                document.querySelector('.draggable')?.remove();
                return;
            }
        }


        if (event.ctrlKey && /^[1-9]$/.test(event.key)) {
            // This will eventually be to trigger quick replies
            // event.preventDefault();
            console.log('Ctrl +' + event.key + ' pressed!');
        }
    }
}
