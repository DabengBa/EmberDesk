import { CONNECT_API_MAP, createModelIcon } from '../../script.js';
import { openThirdPartyExtensionMenu } from '../extensions.js';
import { t } from '../i18n.js';
import { getTokenCountAsync } from '../tokenizers.js';

/**
 * Check if the WebLLM extension is installed and supported.
 * @returns {boolean} Whether the extension is installed and supported
 */
export function isWebLlmSupported() {
    if (!('gpu' in navigator)) {
        const warningKey = 'webllm_browser_warning_shown';
        if (!sessionStorage.getItem(warningKey)) {
            toastr.error('Your browser does not support the WebGPU API. Please use a different browser.', 'WebLLM', {
                preventDuplicates: true,
                timeOut: 0,
                extendedTimeOut: 0,
            });
            sessionStorage.setItem(warningKey, '1');
        }
        return false;
    }

    if (!('llm' in SillyTavern)) {
        const warningKey = 'webllm_extension_warning_shown';
        if (!sessionStorage.getItem(warningKey)) {
            toastr.error('WebLLM extension is not installed. Click here to install it.', 'WebLLM', {
                timeOut: 0,
                extendedTimeOut: 0,
                preventDuplicates: true,
                onclick: () => openThirdPartyExtensionMenu('https://github.com/SillyTavern/Extension-WebLLM'),
            });
            sessionStorage.setItem(warningKey, '1');
        }
        return false;
    }

    return true;
}

/**
 * Generates text in response to a chat prompt using WebLLM.
 * @param {any[]} messages Messages to use for generating
 * @param {object} params Additional parameters
 * @returns {Promise<string>} Generated response
 */
export async function generateWebLlmChatPrompt(messages, params = {}) {
    if (!isWebLlmSupported()) {
        throw new Error('WebLLM extension is not installed.');
    }

    console.debug('WebLLM chat completion request:', messages, params);
    const engine = SillyTavern.llm;
    const response = await engine.generateChatPrompt(messages, params);
    console.debug('WebLLM chat completion response:', response);
    return response;
}

/**
 * Counts the number of tokens in the provided text using WebLLM's default model.
 * Fallbacks to the current model's tokenizer if WebLLM token count fails.
 * @param {string} text Text to count tokens in
 * @returns {Promise<number>} Number of tokens in the text
 */
export async function countWebLlmTokens(text) {
    if (!isWebLlmSupported()) {
        throw new Error('WebLLM extension is not installed.');
    }

    try {
        const engine = SillyTavern.llm;
        const response = await engine.countTokens(text);
        return response;
    } catch (error) {
        // Fallback to using current model's tokenizer
        return await getTokenCountAsync(text);
    }
}

/**
 * Gets the size of the context in the WebLLM's default model.
 * @returns {Promise<number>} Size of the context in the WebLLM model
 */
export async function getWebLlmContextSize() {
    if (!isWebLlmSupported()) {
        throw new Error('WebLLM extension is not installed.');
    }

    const engine = SillyTavern.llm;
    await engine.loadModel();
    const model = await engine.getCurrentModelInfo();
    return model?.context_size;
}

/**
 * It uses the profiles to send a generate request to the API.
 */
export class ConnectionManagerRequestService {
    static defaultSendRequestParams = {
        stream: false,
        signal: null,
        extractData: true,
        includePreset: true,
        includeInstruct: true,
        instructSettings: {},
    };

    static getAllowedTypes() {
        return {
            openai: t`Chat Completion`,
        };
    }

    /**
     * @param {string} profileId
     * @param {string | (import('../custom-request.js').ChatCompletionMessage & {ignoreInstruct?: boolean})[]} prompt
     * @param {number} maxTokens
     * @param {Object} custom
     * @param {boolean?} [custom.stream=false]
     * @param {AbortSignal?} [custom.signal]
     * @param {boolean?} [custom.extractData=true]
     * @param {boolean?} [custom.includePreset=true]
     * @param {boolean?} [custom.includeInstruct=true]
     * @param {Partial<InstructSettings>?} [custom.instructSettings] Override instruct settings
     * @param {Record<string, any>} [overridePayload] - Override payload for the request
     * @returns {Promise<import('../custom-request.js').ExtractedData | (() => AsyncGenerator<import('../custom-request.js').StreamResponse>)>} If not streaming, returns extracted data; if streaming, returns a function that creates an AsyncGenerator
     */
    static async sendRequest(profileId, prompt, maxTokens, custom = this.defaultSendRequestParams, overridePayload = {}) {
        const { stream, signal, extractData, includePreset } = { ...this.defaultSendRequestParams, ...custom };

        const context = SillyTavern.getContext();
        if (context.extensionSettings.disabledExtensions.includes('connection-manager')) {
            throw new Error('Connection Manager is not available');
        }

        const profile = this.getProfile(profileId);
        const selectedApiMap = this.validateProfile(profile);

        try {
            switch (selectedApiMap.selected) {
                case 'openai': {
                    if (!selectedApiMap.source) {
                        throw new Error(`API type ${selectedApiMap.selected} does not support chat completions`);
                    }

                    const messages = Array.isArray(prompt) ? prompt : [{ role: 'user', content: prompt }];
                    return await context.ChatCompletionService.processRequest({
                        stream,
                        messages,
                        max_tokens: maxTokens,
                        model: profile.model,
                        chat_completion_source: selectedApiMap.source,
                        secret_id: profile['secret-id'],
                        custom_url: profile['api-url'],
                        vertexai_region: profile['api-url'],
                        zai_endpoint: profile['api-url'],
                        siliconflow_endpoint: profile['api-url'],
                        minimax_endpoint: profile['api-url'],
                        reverse_proxy: profile['proxy-url'],
                        proxy_password: profile['api-key'],
                        custom_prompt_post_processing: profile['prompt-post-processing'],
                        ...overridePayload,
                    }, {
                        presetName: includePreset ? profile.preset : undefined,
                    }, extractData, signal);
                }
                default: {
                    throw new Error(`Unknown API type ${selectedApiMap.selected}`);
                }
            }
        } catch (error) {
            throw new Error('API request failed', { cause: error });
        }
    }

    /**
    * If using text completion, return a formatted prompt string given an array of messages, a given profile ID, and optional instruct settings.
    * If using chat completion, simply return the given prompt as-is.
    * @param {ChatCompletionMessage[]} prompt An array of prompt messages.
    * @param {string} profileId ID of a given connection profile (from which to infer a completion preset).
    * @param {InstructSettings} instructSettings optional instruct settings
    */
    static constructPrompt(prompt, profileId, instructSettings = null) {
        const profile = this.getProfile(profileId);
        const selectedApiMap = this.validateProfile(profile);

        switch (selectedApiMap.selected) {
            case 'openai': {
                if (!selectedApiMap.source) {
                    throw new Error(`API type ${selectedApiMap.selected} does not support chat completions`);
                }
                return prompt;
            }
            default: {
                throw new Error(`Unknown API type ${selectedApiMap.selected}`);
            }
        }
    }

    /**
     * Respects allowed types.
     * @returns {import('./connection-manager/index.js').ConnectionProfile[]}
     */
    static getSupportedProfiles() {
        const context = SillyTavern.getContext();
        if (context.extensionSettings.disabledExtensions.includes('connection-manager')) {
            throw new Error('Connection Manager is not available');
        }

        const profiles = context.extensionSettings.connectionManager.profiles;
        return profiles.filter((p) => this.isProfileSupported(p));
    }

    /**
     * Return profile data given the profile ID
     * @param {string} profileId
     * @returns {import('./connection-manager/index.js').ConnectionProfile?} [profile]
     * @throws {Error}
     */
    static getProfile(profileId) {
        const profile = SillyTavern.getContext().extensionSettings.connectionManager.profiles.find((p) => p.id === profileId);
        if (!profile) throw new Error(`Profile not found (ID: ${profileId})`);
        return profile;
    }

    /**
     * Creates a model icon Image element for the given profile (or the currently selected profile).
     * Returns null if the profile is not found, has no API, or Connection Manager is unavailable.
     * @param {string} [profileId] - Profile ID. If omitted, uses the currently selected profile.
     * @returns {HTMLImageElement | null}
     */
    static getProfileIcon(profileId) {
        if ((SillyTavern.getContext()).extensionSettings.disabledExtensions.includes('connection-manager')) {
            return null;
        }

        const id = profileId ?? (SillyTavern.getContext()).extensionSettings.connectionManager.selectedProfile;
        if (!id) return null;

        try {
            const profile = this.getProfile(id);
            if (!profile?.api) return null;
            return createModelIcon(profile.api, profile.model);
        } catch {
            return null;
        }
    }

    /**
     * @param {import('./connection-manager/index.js').ConnectionProfile?} [profile]
     * @returns {boolean}
     */
    static isProfileSupported(profile) {
        if (!profile || !profile.api) {
            return false;
        }

        const apiMap = CONNECT_API_MAP[profile.api];
        if (!Object.hasOwn(this.getAllowedTypes(), apiMap.selected)) {
            return false;
        }

        // Some providers not need model, like koboldcpp. But I don't want to check by provider.
        switch (apiMap.selected) {
            case 'openai':
                return !!apiMap.source;
        }

        return false;
    }

    /**
     * @param {import('./connection-manager/index.js').ConnectionProfile?} [profile]
     * @return {import('../slash-commands.js').ConnectAPIMap}
     * @throws {Error}
     */
    static validateProfile(profile) {
        if (!profile) {
            throw new Error('Could not find profile.');
        }
        if (!profile.api) {
            throw new Error('Select a connection profile that has an API');
        }

        const context = SillyTavern.getContext();
        const selectedApiMap = context.CONNECT_API_MAP[profile.api];
        if (!selectedApiMap) {
            throw new Error(`Unknown API type ${profile.api}`);
        }
        if (!Object.hasOwn(this.getAllowedTypes(), selectedApiMap.selected)) {
            throw new Error(`API type ${selectedApiMap.selected} is not supported. Supported types: ${Object.values(this.getAllowedTypes()).join(', ')}`);
        }

        return selectedApiMap;
    }

    /**
     * Create profiles dropdown and updates select element accordingly. Use onChange, onCreate, unUpdate, onDelete callbacks for custom behaviour. e.g updating extension settings.
     * @param {string} selector
     * @param {string} initialSelectedProfileId
     * @param {(profile?: import('./connection-manager/index.js').ConnectionProfile) => Promise<void> | void} onChange - 3 cases. 1- When user selects new profile. 2- When user deletes selected profile. 3- When user updates selected profile.
     * @param {(profile: import('./connection-manager/index.js').ConnectionProfile) => Promise<void> | void} onCreate
     * @param {(oldProfile: import('./connection-manager/index.js').ConnectionProfile, newProfile: import('./connection-manager/index.js').ConnectionProfile) => Promise<void> | void} unUpdate
     * @param {(profile: import('./connection-manager/index.js').ConnectionProfile) => Promise<void> | void} onDelete
     */
    static handleDropdown(
        selector,
        initialSelectedProfileId,
        onChange = () => { },
        onCreate = () => { },
        unUpdate = () => { },
        onDelete = () => { },
    ) {
        const context = SillyTavern.getContext();
        if (context.extensionSettings.disabledExtensions.includes('connection-manager')) {
            throw new Error('Connection Manager is not available');
        }

        /**
         * @type {JQuery<HTMLSelectElement>}
         */
        const dropdown = $(selector);

        if (!dropdown || !dropdown.length) {
            throw new Error(`Could not find dropdown with selector ${selector}`);
        }

        dropdown.empty();

        // Create default option using document.createElement
        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = 'Select a Connection Profile';
        defaultOption.dataset.i18n = 'Select a Connection Profile';
        dropdown.append(defaultOption);

        const profiles = context.extensionSettings.connectionManager.profiles;

        // Create optgroups using document.createElement
        const groups = {};
        for (const [apiType, groupLabel] of Object.entries(this.getAllowedTypes())) {
            const optgroup = document.createElement('optgroup');
            optgroup.label = groupLabel;
            groups[apiType] = optgroup;
        }

        const sortedProfilesByGroup = {};
        for (const apiType of Object.keys(this.getAllowedTypes())) {
            sortedProfilesByGroup[apiType] = [];
        }

        for (const profile of profiles) {
            if (this.isProfileSupported(profile)) {
                const apiMap = CONNECT_API_MAP[profile.api];
                if (sortedProfilesByGroup[apiMap.selected]) {
                    sortedProfilesByGroup[apiMap.selected].push(profile);
                }
            }
        }

        // Sort each group alphabetically and add to dropdown
        for (const [apiType, groupProfiles] of Object.entries(sortedProfilesByGroup)) {
            if (groupProfiles.length === 0) continue;

            groupProfiles.sort((a, b) => a.name.localeCompare(b.name));

            const group = groups[apiType];
            for (const profile of groupProfiles) {
                const option = document.createElement('option');
                option.value = profile.id;
                option.textContent = profile.name;
                group.appendChild(option);
            }
        }

        for (const group of Object.values(groups)) {
            if (group.children.length > 0) {
                dropdown.append(group);
            }
        }

        const selectedProfile = profiles.find((p) => p.id === initialSelectedProfileId);
        if (selectedProfile) {
            dropdown.val(selectedProfile.id);
        }

        context.eventSource.on(context.eventTypes.CONNECTION_PROFILE_CREATED, async (profile) => {
            const isSupported = this.isProfileSupported(profile);
            if (!isSupported) {
                return;
            }

            const group = groups[CONNECT_API_MAP[profile.api].selected];
            const option = document.createElement('option');
            option.value = profile.id;
            option.textContent = profile.name;
            group.appendChild(option);

            await onCreate(profile);
        });

        context.eventSource.on(context.eventTypes.CONNECTION_PROFILE_UPDATED, async (oldProfile, newProfile) => {
            const currentSelected = dropdown.val();
            const isSelectedProfile = currentSelected === oldProfile.id;
            await unUpdate(oldProfile, newProfile);

            if (!this.isProfileSupported(newProfile)) {
                if (isSelectedProfile) {
                    dropdown.val('');
                    dropdown.trigger('change');
                }
                return;
            }

            const group = groups[CONNECT_API_MAP[newProfile.api].selected];
            const oldOption = group.querySelector(`option[value="${oldProfile.id}"]`);
            if (oldOption) {
                oldOption.remove();
            }

            const option = document.createElement('option');
            option.value = newProfile.id;
            option.textContent = newProfile.name;
            group.appendChild(option);

            if (isSelectedProfile) {
                // Ackchyually, we don't need to reselect but what if id changes? It is not possible for now I couldn't stop myself.
                dropdown.val(newProfile.id);
                dropdown.trigger('change');
            }
        });

        context.eventSource.on(context.eventTypes.CONNECTION_PROFILE_DELETED, async (profile) => {
            const currentSelected = dropdown.val();
            const isSelectedProfile = currentSelected === profile.id;
            if (!this.isProfileSupported(profile)) {
                return;
            }

            const group = groups[CONNECT_API_MAP[profile.api].selected];
            const optionToRemove = group.querySelector(`option[value="${profile.id}"]`);
            if (optionToRemove) {
                optionToRemove.remove();
            }

            if (isSelectedProfile) {
                dropdown.val('');
                dropdown.trigger('change');
            }

            await onDelete(profile);
        });

        dropdown.on('change', async () => {
            const profileId = dropdown.val();
            const profile = context.extensionSettings.connectionManager.profiles.find((p) => p.id === profileId);
            await onChange(profile);
        });
    }
}
