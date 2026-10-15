import { DOMPurify, Bowser } from '../lib.js';

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
    sendTextareaMessage,
    openWorkspaceChildSlotHost,
    closeWorkspaceChildSlotHost,
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
import { accountStorage } from './util/AccountStorage.js';
import { getCurrentUserHandle } from './user.js';
import { getComposerValue, setComposerValue } from './main-chat-composer-service.js';

// Populated in initRossMods: drawer/panel markup is React-mounted after module eval.
// The settings drawer opener is injected by script.js — importing it here would
// add a new script.js reverse import (composition-root contract forbids that).
var injectedOpenWorkspaceShellSettings = null;

var RightNavPanel = null;
var LNavPanel = null;

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

        const counter = $(tokenCounter);
        const input = $(document.getElementById(counter.data('token-counter')));
        const isPermanent = counter.data('token-permanent') === true;
        const value = String(input.val());

        if (input.length === 0) {
            counter.text('Invalid input reference');
            continue;
        }

        if (!value) {
            input.data('last-value-hash', '');
            counter.text(0);
            continue;
        }

        const valueHash = getStringHash(value);

        if (input.data('last-value-hash') === valueHash) {
            total_tokens += Number(counter.text());
            permanent_tokens += isPermanent ? Number(counter.text()) : 0;
        } else {
            // We substitute macro for existing characters, but not for the character being created
            const valueToCount = menu_type === 'create' ? value : substituteParams(value);
            const tokens = await getTokenCountAsync(valueToCount);

            if (counterNonceLocal !== counterNonce) {
                return;
            }

            counter.text(tokens);
            total_tokens += tokens;
            permanent_tokens += isPermanent ? tokens : 0;
            input.data('last-value-hash', valueHash);
        }
    }

    // Warn if total tokens exceeds the limit of half the max context
    const tokenLimit = Math.max(((main_api !== 'openai' ? max_context : oai_settings.openai_max_context) / 2), 1024);
    const showWarning = (total_tokens > tokenLimit);
    $('#result_info_total_tokens').text(total_tokens);
    $('#result_info_permanent_tokens').text(permanent_tokens);
    $('#result_info_text').toggleClass('neutral_warning', showWarning);
    $('#chartokenwarning').toggle(showWarning);
}
export async function favsToHotswap() {
    const entities = getEntitiesList({ doFilter: false });
    const container = $('#right-nav-panel .hotswap');

    // Hard limit is required because even if all hotswaps don't fit the screen, their images would still be loaded
    // 25 is roughly calculated as the maximum number of favs that can fit an ultrawide monitor with the default theme
    const FAVS_LIMIT = 25;
    const favs = entities.filter(x => x.item.fav || x.item.fav == 'true').slice(0, FAVS_LIMIT);

    //helpful instruction message if no characters are favorited
    if (favs.length == 0) {
        container.html(`<small><span><i class="fa-solid fa-star"></i>&nbsp;${DOMPurify.sanitize(container.attr('no_favs'))}</span></small>`);
        return;
    }

    buildAvatarList(container, favs, { interactable: true, highlightFavs: false });
}

//changes input bar and send button display depending on connection status
function RA_checkOnlineStatus() {
    if (online_status == 'no_connection') {
        const send_textarea = $('#send_textarea');
        send_textarea.attr('placeholder', send_textarea.attr('no_connection_text')); //Input bar placeholder tells users they are not connected
        $('#send_form').addClass('no-connection');
        $('#send_but').addClass('displayNone'); //send button is hidden when not connected;
        connection_made = false;
    } else {
        if (online_status !== undefined && online_status !== 'no_connection') {
            const send_textarea = $('#send_textarea');
            send_textarea.attr('placeholder', send_textarea.attr('connected_text')); //on connect, placeholder tells user to type message
            $('#send_form').removeClass('no-connection');
            connection_made = true;
            retry_delay = 100;

            if (!is_send_press) {
                $('#send_but').removeClass('displayNone'); //on connect, send button shows
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

function OpenNavPanels() {
    // Below 1000px the mobile stylesheet renders open drawers as full-screen
    // overlays — auto-opening one would cover the whole workspace even on a
    // narrow desktop window, so the auto-open only applies on wide viewports.
    if (!isMobile() && window.innerWidth > 1000) {
        // Restore drawers that were open when the shell last unloaded. The
        // restore must not close sibling drawers: these opens land
        // asynchronously and would otherwise clobber whatever the user just
        // opened (including each other).
        if (accountStorage.getItem('LNavOpened') == 'true') {
            void openWorkspaceShellPromptManager({ preserveOpenDrawers: true });
        }

        if (accountStorage.getItem('NavOpened') == 'true') {
            void openWorkspaceChildSlotHost('right-nav-panel', { preserveOpenDrawers: true });
        }

        if (accountStorage.getItem('WINavOpened') == 'true') {
            console.debug('RA -- opening WI panel');
            void openWorkspaceShellWorldInfo({ preserveOpenDrawers: true });
        }

        if (accountStorage.getItem('RegexNavOpened') == 'true') {
            void openWorkspaceChildSlotHost('RegexPanel', { preserveOpenDrawers: true });
        }

        if (accountStorage.getItem('SettingsNavOpened') == 'true') {
            void injectedOpenWorkspaceShellSettings?.({ preserveOpenDrawers: true });
        }
    }
}

const getUserInputKey = () => getCurrentUserHandle() + '_userInput';

function restoreUserInput() {
    const userInput = localStorage.getItem(getUserInputKey());
    if (userInput) {
        setComposerValue(userInput);
    }
}

function saveUserInput() {
    const userInput = getComposerValue();
    localStorage.setItem(getUserInputKey(), userInput);
    console.debug('User Input -- ', userInput);
}
const saveUserInputDebounced = debounce(saveUserInput);

// Make the DIV element draggable:

/**
 * Make the given element draggable (e.g. zoomed avatars, extension windows).
 * @param {JQuery} $elmnt - The element to make draggable.
 */
export function dragElement($elmnt) {
    let actionType = null; // "drag" or "resize"
    let isMouseDown = false;

    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    let height, width, top, left,
        maxX, maxY, winHeight, winWidth;

    const elmntName = $elmnt.attr('id');
    const elmntNameEscaped = $.escapeSelector(elmntName);
    const $elmntHeader = $(`#${elmntNameEscaped}header`);

    // Helper: Notify listeners when a drag/resize interaction ends
    function notifyResize() {
        if (actionType === 'resize') {
            eventSource.emit('resizeUI', elmntName);
        }
    }

    // Helper: Clamp element within viewport
    function clampToViewport() {
        if (top <= 0) $elmnt.css('top', '0px');
        else if (maxY >= winHeight) $elmnt.css('top', winHeight - maxY + top - 1 + 'px');
        if (left <= 0) $elmnt.css('left', '0px');
        else if (maxX >= winWidth) $elmnt.css('left', winWidth - maxX + left - 1 + 'px');
    }

    // Observer for style changes (position/size)
    const observer = new MutationObserver((mutations) => {
        const $target = $(mutations[0].target);
        if (
            !$target.is(':visible') ||
            $target.hasClass('resizing') ||
            $target.height() < 50 ||
            $target.width() < 50 ||
            isMobile() ||
            !isMouseDown
        ) {
            observer.disconnect();
            return;
        }

        const element = /** @type {HTMLElement} */ ($target[0]);
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
            let containerAspectRatio = height / width;
            if ($elmnt.attr('id').startsWith('zoomFor_')) {
                const zoomedAvatarImage = $elmnt.find('.zoomed_avatar_img');
                const imgHeight = zoomedAvatarImage.height();
                const imgWidth = zoomedAvatarImage.width();
                const imageAspectRatio = imgHeight / imgWidth;
                if (containerAspectRatio !== imageAspectRatio) {
                    $elmnt.css('width', $elmnt.width());
                    $elmnt.css('height', $elmnt.width() * imageAspectRatio);
                }
                if (top + $elmnt.height() >= winHeight) {
                    $elmnt.css('height', winHeight - top - 1 + 'px');
                    $elmnt.css('width', (winHeight - top - 1) / imageAspectRatio + 'px');
                }
                if (left + $elmnt.width() >= winWidth) {
                    $elmnt.css('width', winWidth - left - 1 + 'px');
                    $elmnt.css('height', (winWidth - left - 1) * imageAspectRatio + 'px');
                }
            } else {
                if (top + $elmnt.height() >= winHeight) $elmnt.css('height', winHeight - top - 1 + 'px');
                if (left + $elmnt.width() >= winWidth) $elmnt.css('width', winWidth - left - 1 + 'px');
            }
            //if (top < topBarLastY && maxX >= topBarFirstX && left <= topBarFirstX) {
            //    $elmnt.css('width', width - 1 + 'px');
            // }
            $elmnt.css({ left, top });
            $elmnt.off('mouseup').on('mouseup', () => {
                notifyResize();
                observer.disconnect();
            });
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
        $(document).on('mouseup', closeDragElement);
        $(document).on('mousemove', elementDrag);
    }

    function elementDrag(e) {
        e.preventDefault();
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;
        $elmnt.attr('data-dragged', 'true');
        $elmnt.css('left', ($elmnt.offset().left - pos1) + 'px');
        $elmnt.css('top', ($elmnt.offset().top - pos2) + 'px');
        $elmnt.css('margin', 'unset');
        $elmnt.css('height', height);
        $elmnt.css('width', width);
    }

    function closeDragElement() {
        isMouseDown = false;
        actionType = null;
        $(document).off('mouseup', closeDragElement);
        $(document).off('mousemove', elementDrag);
        $elmnt.attr('data-dragged', 'false');
        observer.disconnect();
        notifyResize();
    }

    // Setup event listeners
    if ($elmntHeader.length) {
        $elmntHeader.off('mousedown').on('mousedown', (e) => {
            if ($(e.target).hasClass('drag-grabber')) {
                actionType = 'drag';
                isMouseDown = true;
                observer.observe($elmnt[0], { attributes: true, attributeFilter: ['style'] });
                dragMouseDown(e);
            }
        });
    }

    $elmnt.off('mousedown').on('mousedown', (e) => {
        const rect = $elmnt[0].getBoundingClientRect();
        const resizeMargin = 16;
        const isNearRight = e.clientX > rect.right - resizeMargin;
        const isNearBottom = e.clientY > rect.bottom - resizeMargin;
        if (isNearRight && isNearBottom) {
            actionType = 'resize';
            isMouseDown = true;
            observer.observe($elmnt[0], { attributes: true, attributeFilter: ['style'] });
        }
    });

    $elmnt.off('mouseup').on('mouseup', () => {
        isMouseDown = false;
        actionType = null;
        observer.disconnect();
    });
}

/**@type {HTMLTextAreaElement} */
// Populated in initRossMods: the composer markup is React-mounted after module eval.
let sendTextArea = null;
const chatBlock = document.getElementById('chat');
const isFirefox = navigator.userAgent.toLowerCase().indexOf('firefox') > -1;

/**
 * this makes the chat input text area resize vertically to match the text size (limited by CSS at 50% window height)
 */
function autoFitSendTextArea() {
    const originalScrollBottom = chatBlock.scrollHeight - (chatBlock.scrollTop + chatBlock.offsetHeight);

    sendTextArea.style.height = '1px'; // Reset height to 1px to force recalculation of scrollHeight
    const newHeight = sendTextArea.scrollHeight;
    sendTextArea.style.height = `${newHeight}px`;

    if (!isFirefox) {
        chatBlock.scrollTop = chatBlock.scrollHeight - (chatBlock.offsetHeight + originalScrollBottom);
    }
}
export const autoFitSendTextAreaDebounced = debounce(autoFitSendTextArea, debounce_timeout.short);

// ---------------------------------------------------

export function initRossMods({ openWorkspaceShellSettings = null } = {}) {
    injectedOpenWorkspaceShellSettings = openWorkspaceShellSettings;
    sendTextArea = document.querySelector('#send_textarea');

    RightNavPanel = document.getElementById('right-nav-panel');
    LNavPanel = document.getElementById('left-nav-panel');
    SelectedCharacterTab = document.getElementById('rm_button_selected_ch');

    //when "+New Character" is clicked
    $('#rm_button_create').on('click', function () {
        $(SelectedCharacterTab).children('h2').html('');        // empty nav's 3rd panel tab
    });
    //when any input is made to the create/edit character form textareas
    $('#rm_ch_create_block').on('input', function () { countTokensDebounced(); });
    //when any input is made to the advanced editing popup textareas
    $('#character_popup').on('input', function () { countTokensDebounced(); });

    // initial status check
    RA_checkOnlineStatus();
    eventSource.on(event_types.ONLINE_STATUS_CHANGED, () => RA_checkOnlineStatus());

    if (power_user.auto_connect) {
        RA_autoconnect();
    }

    if (!isMobile()) { //only read/set pin states on non-mobile devices
        // First-run defaults are viewport-aware: wide desktops start with
        // both side panels open and locked; narrower contexts start closed
        // and unlocked. Stored explicit values are never overridden.
        const sidePanelDefault = window.innerWidth > 1000 ? 'true' : 'false';
        for (const key of ['LNavOpened', 'NavOpened', 'LNavLockOn', 'NavLockOn']) {
            if (accountStorage.getItem(key) === null) {
                accountStorage.setItem(key, sidePanelDefault);
            }
        }

        // The header pin toggles are gone; stored lock state applies
        // .pinnedOpen on each host directly, which the close paths and the
        // shell dock read as the lock authority.
        $(LNavPanel).toggleClass('pinnedOpen', accountStorage.getItem('LNavLockOn') == 'true');
        $(RightNavPanel).toggleClass('pinnedOpen', accountStorage.getItem('NavLockOn') == 'true');
    }

    // Drawer open/closed persistence (NavOpened/WINavOpened) is written by
    // openWorkspaceChildSlotHost/closeWorkspaceChildSlotHost.

    var chatbarInFocus = false;
    $('#send_textarea').on('focus', function () {
        chatbarInFocus = true;
    });

    $('#send_textarea').on('blur', function () {
        chatbarInFocus = false;
    });

    setTimeout(() => {
        OpenNavPanels();
    }, 300);

    $(SelectedCharacterTab).on('click', function () { accountStorage.setItem('SelectedNavTab', 'rm_button_selected_ch'); });
    $('#rm_button_characters').on('click', function () { accountStorage.setItem('SelectedNavTab', 'rm_button_characters'); });

    // when a char is selected from the list, save them as the auto-load character for next page load

    // when a char is selected from the list, save their name as the auto-load character for next page load
    $(document).on('click', '.character_select', function () {
        const characterId = $(this).attr('data-chid');
        setActiveCharacter(characterId);
        saveSettingsDebounced();
    });

    const cssAutofit = CSS.supports('field-sizing', 'content');

    if (cssAutofit) {
        let lastHeight = chatBlock.offsetHeight;
        const chatBlockResizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                if (entry.target !== chatBlock) {
                    continue;
                }

                const threshold = 1;
                const newHeight = chatBlock.offsetHeight;
                const deltaHeight = newHeight - lastHeight;
                const isScrollAtBottom = Math.abs(chatBlock.scrollHeight - chatBlock.scrollTop - newHeight) <= threshold;

                if (!isScrollAtBottom && Math.abs(deltaHeight) > threshold) {
                    chatBlock.scrollTop -= deltaHeight;
                }
                lastHeight = newHeight;
            }
        });

        chatBlockResizeObserver.observe(chatBlock);
    }

    sendTextArea.addEventListener('input', () => {
        saveUserInputDebounced();

        if (cssAutofit) {
            // Unset modifications made with a manual resize
            sendTextArea.style.height = 'auto';
            return;
        }

        const hasContent = sendTextArea.value !== '';
        const fitsCurrentSize = sendTextArea.scrollHeight <= sendTextArea.offsetHeight;
        const isScrollbarShown = sendTextArea.clientWidth < sendTextArea.offsetWidth;
        const isHalfScreenHeight = sendTextArea.offsetHeight >= window.innerHeight / 2;
        const needsDebounce = hasContent && (fitsCurrentSize || (isScrollbarShown && isHalfScreenHeight));
        if (needsDebounce) autoFitSendTextAreaDebounced();
        else autoFitSendTextArea();
    });

    restoreUserInput();

    $(document).on('keydown', async function (event) {
        await processHotkeys(event.originalEvent);
    });

    const hotkeyTargets = {
        'send_textarea': sendTextArea,
        'dialogue_popup_input': document.querySelector('#dialogue_popup_input'),
    };

    //Additional hotkeys CTRL+ENTER and CTRL+UPARROW
    /**
     * @param {KeyboardEvent} event
     */
    async function processHotkeys(event) {
        // Default hotkeys and shortcuts shouldn't work if any popup is currently open
        if (Popup.util.isPopupOpen()) {
            return;
        }

        //Enter to send when send_textarea in focus
        if (document.activeElement == hotkeyTargets.send_textarea) {
            const sendOnEnter = shouldSendOnEnter();
            if (!event.isComposing && !event.shiftKey && !event.ctrlKey && !event.altKey && event.key == 'Enter' && sendOnEnter) {
                event.preventDefault();
                sendTextareaMessage();
                return;
            }
        }
        if (document.activeElement == hotkeyTargets.dialogue_popup_input && !isMobile()) {
            if (!event.shiftKey && !event.ctrlKey && event.key == 'Enter') {
                event.preventDefault();
                $('#dialogue_popup_ok').trigger('click');
                return;
            }
        }
        //ctrl+shift+up to scroll to context line
        if (event.shiftKey && event.ctrlKey && event.key == 'ArrowUp') {
            event.preventDefault();
            let contextLine = $('.lastInContext');
            if (contextLine.length !== 0) {
                $('#chat').animate({
                    scrollTop: contextLine.offset().top - $('#chat').offset().top + $('#chat').scrollTop(),
                }, 300);
            } else { toastr.warning('Context line not found, send a message first!'); }
            return;
        }
        //ctrl+shift+down to scroll to bottom of chat
        if (event.shiftKey && event.ctrlKey && event.key == 'ArrowDown') {
            event.preventDefault();
            $('#chat').animate({
                scrollTop: $('#chat').prop('scrollHeight'),
            }, 300);
            return;
        }

        // Ctrl+Enter accepts the edits when a message or reasoning editor is open
        if (event.ctrlKey && event.key == 'Enter') {
            const editMesDone = $('.mes_edit_done:visible');
            const reasoningMesDone = $('.mes_reasoning_edit_done:visible');
            if (editMesDone.length > 0) {
                console.debug('Accepting edits with Ctrl+Enter');
                $('#send_textarea').trigger('focus');
                editMesDone.trigger('click');
                return;
            } else if (reasoningMesDone.length > 0) {
                console.debug('Accepting edits with Ctrl+Enter');
                $('#send_textarea').trigger('focus');
                reasoningMesDone.trigger('click');
                return;
            }
        }

        if (event.ctrlKey && event.key == 'ArrowUp') { //edits last USER message if chatbar is empty and focused
            if (
                getComposerValue() === '' &&
                chatbarInFocus === true &&
                $('.last_mes').attr('is_system') === 'true' &&
                $('#character_popup').css('display') === 'none' &&
                $('#shadow_select_chat_popup').css('display') === 'none'
            ) {
                const isUserMesList = document.querySelectorAll('div[is_user="true"]');
                const lastIsUserMes = isUserMesList[isUserMesList.length - 1];
                const editMes = lastIsUserMes.querySelector('.mes_block .mes_edit');
                if (editMes !== null) {
                    $(editMes).trigger('click');
                    return;
                }
            }
        }

        if (event.key == 'ArrowUp') { //edits last message if chatbar is empty and focused
            console.log('got uparrow input');
            if (
                getComposerValue() === '' &&
                chatbarInFocus === true &&
                $('.last_mes .mes_buttons').is(':visible') &&
                $('#character_popup').css('display') === 'none' &&
                $('#shadow_select_chat_popup').css('display') === 'none'
            ) {
                const lastMes = document.querySelector('.last_mes');
                const editMes = lastMes.querySelector('.mes_block .mes_edit');
                if (editMes !== null) {
                    $(editMes).trigger('click');
                    return;
                }
            }
        }

        if (event.key == 'Escape') { //closes various panels
            //dont override Escape hotkey functions from script.js
            //"close edit box" and "cancel stream generation".
            if ($('#curEditTextarea').is(':visible') || $('#mes_stop').is(':visible')) {
                console.debug('escape key, but deferring to script.js routines');
                return;
            }

            if ($('#dialogue_popup').is(':visible')) {
                if ($('#dialogue_popup_cancel').is(':visible')) {
                    $('#dialogue_popup_cancel').trigger('click');
                    return;
                } else {
                    $('#dialogue_popup_ok').trigger('click');
                    return;
                }
            }

            if ($('#select_chat_popup').is(':visible')) {
                $('#select_chat_cross').trigger('click');
                return;
            }

            if ($('#character_popup').is(':visible')) {
                $('#character_cross').trigger('click');
                return;
            }

            if ($('#dialogue_del_mes_cancel').is(':visible')) {
                $('#dialogue_del_mes_cancel').trigger('click');
                return;
            }

            if ($('.drawer-content')
                .not('#WorldInfo')
                .not('#right-nav-panel')
                .is(':visible')) {
                let visibleDrawerContent = $('.drawer-content:visible')
                    .not('#WorldInfo')
                    .not('#right-nav-panel');
                visibleDrawerContent.each((_, element) => closeWorkspaceChildSlotHost(element.id));
                return;
            }

            if ($('#WorldInfo').is(':visible')) {
                closeWorkspaceChildSlotHost('WorldInfo');
                return;
            }

            const movingDivs = $('#movingDivs > div').toArray().reverse();
            for (const div of movingDivs) {
                if ($(div).is(':visible')) {
                    $(div).find('.floating_panel_close, .dragClose').trigger('click');
                    return;
                }
            }

            if ($('#right-nav-panel').is(':visible') &&
                !$('#right-nav-panel').hasClass('pinnedOpen')) {
                closeWorkspaceChildSlotHost('right-nav-panel');
                return;
            }
            if ($('.draggable').is(':visible')) {
                // Remove the first matched element
                $('.draggable:first').remove();
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
