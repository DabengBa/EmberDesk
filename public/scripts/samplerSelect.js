import {
    main_api,
    saveSettingsDebounced,
} from '../script.js';
//import { getEventSourceStream } from './sse-stream.js';
//import { getSortableDelay, onlyUnique } from './utils.js';
import { renderTemplateAsync } from './templates.js';
import { Popup, POPUP_TYPE } from './popup.js';

const forcedOnColoring = 'color: #89db35;';
const forcedOffColoring = 'color: #e84f62;';
const SELECT_SAMPLER = {
    DATA: 'selectsampler',
    SHOWN: 'shown',
    HIDDEN: 'hidden',
};
const samplerStates = new WeakMap();
const getSamplerState = element => element ? (samplerStates.get(element) ?? element.getAttribute('data-selectsampler') ?? undefined) : undefined;
const setSamplerState = (element, value) => { if (element) samplerStates.set(element, value); };
const clearSamplerState = element => { if (element) samplerStates.delete(element); };

// Goal 1: show popup with all samplers for active API
async function showSamplerSelectPopup() {
    const html = document.createElement('div');
    html.id = 'sampler_view_list';
    html.className = 'flex-container flexFlowColumn';
    html.innerHTML = await renderTemplateAsync('samplerSelector');

    const listContainer = document.createElement('div');
    listContainer.id = 'apiSamplersList';
    listContainer.className = 'flex-container flexNoGap';
    const APISamplers = await listSamplers(main_api);
    listContainer.innerHTML = APISamplers.toString();
    html.append(listContainer);

    const showPromise = new Popup(html, POPUP_TYPE.TEXT, null, { wide: true, large: true, allowVerticalScrolling: true }).show();

    setSamplerListListeners();

    const reset = document.getElementById('resetSelectedSamplers');
    reset?.removeEventListener('click', resetSelectedSamplers);
    reset?.addEventListener('click', resetSelectedSamplers);

    const priority = document.getElementById('prioritizeManuallySelectedSamplers');
    if (priority) priority.style.display = 'none';

    await showPromise;
}

async function resetSelectedSamplers() {
    console.log('saw sampler select reset click');
    await validateDisabledSamplers(true);
}

function getRelatedDOMElement(samplerName) {
    let relatedDOMElement = document.getElementById(`${samplerName}_${main_api}`)?.parentElement;
    let targetDisplayType = 'flex';
    let displayname;

    if (samplerName === 'json_schema') {
        relatedDOMElement = document.getElementById('json_schema_block');
        targetDisplayType = 'block';
        displayname = 'JSON Schema Block';
    }

    if (samplerName === 'grammar_string') {
        relatedDOMElement = document.getElementById('grammar_block_ooba');
        targetDisplayType = 'block';
        displayname = 'Grammar Block';
    }

    if (samplerName === 'mirostat_mode') {
        relatedDOMElement = document.getElementById('mirostat_block_ooba');
        targetDisplayType = 'block';
        displayname = 'Mirostat Block';
    }

    if (samplerName === 'dry_multiplier') {
        relatedDOMElement = document.getElementById('dryBlock');
        targetDisplayType = 'block';
        displayname = 'DRY Rep Pen Block';
    }

    if (samplerName === 'xtc_probability') {
        relatedDOMElement = document.getElementById('xtc_block');
        targetDisplayType = 'block';
        displayname = 'XTC Block';
    }

    if (samplerName === 'dynatemp') {
        relatedDOMElement = document.getElementById('dynatemp_block_ooba');
        targetDisplayType = 'block';
        displayname = 'DynaTemp Block';
    }

    if (samplerName === 'banned_tokens') {
        relatedDOMElement = document.getElementById('banned_tokens_block_ooba');
        targetDisplayType = 'block';
    }

    if (samplerName === 'sampler_order') { //this is for kcpp sampler order
        relatedDOMElement = document.getElementById('sampler_order_block_kcpp');
        displayname = 'KCPP Sampler Order Block';
    }

    if (samplerName === 'samplers') { //this is for lcpp sampler order
        relatedDOMElement = document.getElementById('sampler_order_block_lcpp');
        displayname = 'LCPP Sampler Order Block';
    }

    if (samplerName === 'sampler_priority') { //this is for ooba's sampler priority
        relatedDOMElement = document.getElementById('sampler_priority_block_ooba');
        displayname = 'Ooba Sampler Priority Block';
    }

    if (samplerName === 'samplers_priorities') { //this is for aphrodite's sampler priority
        relatedDOMElement = document.getElementById('sampler_priority_block_aphrodite');
        displayname = 'Aphrodite Sampler Priority Block';
    }

    if (samplerName === 'penalty_alpha') { //contrastive search only has one sampler, does it need its own block?
        relatedDOMElement = document.getElementById('contrastiveSearchBlock');
        displayname = 'Contrast Search Block';
    }

    if (samplerName === 'num_beams') { // num_beams is the killswitch for Beam Search
        relatedDOMElement = document.getElementById('beamSearchBlock');
        targetDisplayType = 'block';
        displayname = 'Beam Search Block';
    }

    if (samplerName === 'smoothing_factor') { // num_beams is the killswitch for Beam Search
        relatedDOMElement = document.getElementById('smoothingBlock');
        targetDisplayType = 'block';
        displayname = 'Smoothing Block';
    }

    return { relatedDOMElement, targetDisplayType, displayname };
}

function setSamplerListListeners() {
    // Goal 2: hide unchecked samplers from DOM
    const listContainer = document.getElementById('apiSamplersList');
    for (const input of listContainer?.querySelectorAll('input') ?? []) {
        input.removeEventListener('change', onSamplerChange);
        input.addEventListener('change', onSamplerChange);
    }
}

async function onSamplerChange() {
        const samplerName = this.name.replace('_checkbox', '');
        const { relatedDOMElement, targetDisplayType } = getRelatedDOMElement(samplerName);

        // Get the current state of the custom data attribute
        const previousState = getSamplerState(relatedDOMElement);
        const isChecked = this.checked;
        const popupInputLabel = this.parentElement?.querySelector('.sampler_name');

        if (isChecked === false) {
            if (previousState === SELECT_SAMPLER.SHOWN) {
                console.log('saw previously custom shown sampler => new state:', isChecked, samplerName);
                clearSamplerState(relatedDOMElement);
                popupInputLabel?.removeAttribute('style');
            } else {
                console.log('saw previous untouched sampler => new state:', isChecked, samplerName);
                setSamplerState(relatedDOMElement, SELECT_SAMPLER.HIDDEN);
                popupInputLabel?.setAttribute('style', forcedOffColoring);
            }
        } else {
            if (previousState === SELECT_SAMPLER.HIDDEN) {
                console.log('saw previously custom hidden sampler => new state:', isChecked, samplerName);
                clearSamplerState(relatedDOMElement);
                popupInputLabel?.removeAttribute('style');
            } else {
                console.log('saw previous untouched sampler => new state:', isChecked, samplerName);
                setSamplerState(relatedDOMElement, SELECT_SAMPLER.SHOWN);
                popupInputLabel?.setAttribute('style', forcedOnColoring);
            }
        }

        await saveSettingsDebounced();

        const shouldDisplay = isChecked ? targetDisplayType : 'none';
        if (relatedDOMElement) relatedDOMElement.style.display = shouldDisplay;

        console.log(samplerName, getSamplerState(relatedDOMElement), shouldDisplay);
}

function isElementVisibleInDOM(element) {
    while (element && element !== document.body) {
        if (window.getComputedStyle(element).display === 'none') {
            return false;
        }
        element = element.parentElement;
    }
    return true;
}


async function listSamplers(main_api, arrayOnly = false) {
    let availableSamplers = [];

    if (arrayOnly) {
        console.debug('returning full samplers array');
        return availableSamplers;
    }

    const samplersActivatedManually = [];
    const prioritizeManualSamplerSelect = false;

    const samplersListHTML = availableSamplers.reduce((html, sampler) => {
        let customColor;
        let { relatedDOMElement, displayname } = getRelatedDOMElement(sampler);

        const isManuallyActivated = samplersActivatedManually.includes(sampler);
        const displayModified = getSamplerState(relatedDOMElement);
        const isInDefaultState = !displayModified;

        const shouldBeChecked = () => {
            let finalState = isElementVisibleInDOM(relatedDOMElement);

            if (prioritizeManualSamplerSelect) {
                finalState = isManuallyActivated;
            } else if (!isInDefaultState) {
                finalState = displayModified === SELECT_SAMPLER.SHOWN;
                customColor = finalState ? forcedOnColoring : forcedOffColoring;
            }

            return finalState;
        };

        console.log(sampler, relatedDOMElement?.id, isInDefaultState, shouldBeChecked());

        if (displayname === undefined) displayname = sampler;

        return html + `
        <label class="sampler_view_list_item wide50p flex-container">
            <input type="checkbox" name="${sampler}_checkbox" ${shouldBeChecked() ? 'checked' : ''}>
            <small class="sampler_name" style="${customColor}">${displayname}</small>
        </label>`;
    }, '');

    return samplersListHTML;
}

// Goal 3: make "sampler is hidden/disabled" status persistent (save settings)
// this runs on initial getSettings as well as after API changes

export async function validateDisabledSamplers(redraw = false) {
    const APISamplers = await listSamplers(main_api, true);

    if (!Array.isArray(APISamplers)) {
        return;
    }

    const prioritizeManualSamplerSelect = false;

    for (const sampler of APISamplers) {
        const { relatedDOMElement, targetDisplayType } = getRelatedDOMElement(sampler);

        if (prioritizeManualSamplerSelect) {
            if (relatedDOMElement) relatedDOMElement.style.display = 'none';
        } else {
            const selectSamplerData = getSamplerState(relatedDOMElement);
            if (relatedDOMElement) relatedDOMElement.style.display = selectSamplerData === SELECT_SAMPLER.SHOWN ? targetDisplayType : 'none';
        }

        clearSamplerState(relatedDOMElement);
    }

    if (redraw) {
        let samplersHTML = await listSamplers(main_api);
        const list = document.getElementById('apiSamplersList');
        if (list) list.innerHTML = samplersHTML.toString();
        setSamplerListListeners();
    }

    await saveSettingsDebounced();
}

export async function initCustomSelectedSamplers() {
    await saveSettingsDebounced();
    const button = document.getElementById('samplerSelectButton');
    button?.removeEventListener('click', showSamplerSelectPopup);
    button?.addEventListener('click', showSamplerSelectPopup);
}

// Goal 4: filter hidden samplers from API output

// Goal 5: allow addition of custom samplers to be displayed
// Goal 6: send custom sampler values into prompt
