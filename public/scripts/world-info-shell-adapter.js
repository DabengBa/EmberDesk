import { getWorldInfoShellEventSourceProperty, requireWorldInfoShellContext } from './world-info-shell-context.js';

function getWorldInfoShell() {
    return requireWorldInfoShellContext();
}

function saveSettings() {
    return getWorldInfoShell().saveSettings();
}

function substituteParams(value) {
    return getWorldInfoShell().substituteParams(value);
}

function getRequestHeaders(options) {
    return getWorldInfoShell().getRequestHeaders(options);
}

function getCurrentShellCharacterId() {
    return getWorldInfoShell().getCurrentCharacterId();
}

function getCurrentShellMenuType() {
    return getWorldInfoShell().getMenuType();
}

function saveCharacterDebounced() {
    return getWorldInfoShell().saveCharacterDebounced();
}

function saveMetadata() {
    return getWorldInfoShell().saveMetadata();
}

function getCurrentChatId() {
    return getWorldInfoShell().getCurrentChatId();
}

function createOrEditCharacter() {
    return getWorldInfoShell().createOrEditCharacter();
}

function getOneCharacter(avatar) {
    return getWorldInfoShell().getOneCharacter(avatar);
}

function select_selected_character(chid, options) {
    return getWorldInfoShell().selectSelectedCharacter(chid, options);
}

const eventSource = new Proxy({}, {
    get(_target, property) {
        return getWorldInfoShellEventSourceProperty(property);
    },
});

const event_types = new Proxy({}, {
    get(_target, property) {
        return getWorldInfoShell().eventTypes[property];
    },
});

const chat_metadata = new Proxy({}, {
    get(_target, property) {
        return getWorldInfoShell().getChatMetadata()[property];
    },
    set(_target, property, value) {
        getWorldInfoShell().getChatMetadata()[property] = value;
        return true;
    },
    deleteProperty(_target, property) {
        delete getWorldInfoShell().getChatMetadata()[property];
        return true;
    },
    has(_target, property) {
        return property in getWorldInfoShell().getChatMetadata();
    },
    ownKeys() {
        return Reflect.ownKeys(getWorldInfoShell().getChatMetadata());
    },
    getOwnPropertyDescriptor(_target, property) {
        return Object.getOwnPropertyDescriptor(getWorldInfoShell().getChatMetadata(), property) ?? {
            configurable: true,
            enumerable: true,
            writable: true,
            value: undefined,
        };
    },
});

const characters = new Proxy([], {
    get(_target, property) {
        return getWorldInfoShell().getCharacters()[property];
    },
    set(_target, property, value) {
        getWorldInfoShell().getCharacters()[property] = value;
        return true;
    },
    has(_target, property) {
        return property in getWorldInfoShell().getCharacters();
    },
    ownKeys() {
        return Reflect.ownKeys(getWorldInfoShell().getCharacters());
    },
    getOwnPropertyDescriptor(_target, property) {
        return Object.getOwnPropertyDescriptor(getWorldInfoShell().getCharacters(), property) ?? {
            configurable: true,
            enumerable: true,
            writable: true,
            value: undefined,
        };
    },
});

const extension_prompt_roles = new Proxy({}, {
    get(_target, property) {
        return getWorldInfoShell().extensionPromptRoles[property];
    },
});

const create_save = new Proxy({}, {
    get(_target, property) {
        return getWorldInfoShell().getCreateSave()[property];
    },
    set(_target, property, value) {
        getWorldInfoShell().getCreateSave()[property] = value;
        return true;
    },
    has(_target, property) {
        return property in getWorldInfoShell().getCreateSave();
    },
    ownKeys() {
        return Reflect.ownKeys(getWorldInfoShell().getCreateSave());
    },
    getOwnPropertyDescriptor(_target, property) {
        return Object.getOwnPropertyDescriptor(getWorldInfoShell().getCreateSave(), property) ?? {
            configurable: true,
            enumerable: true,
            writable: true,
            value: undefined,
        };
    },
});

export { getWorldInfoShell, saveSettings, substituteParams, getRequestHeaders, getCurrentShellCharacterId, getCurrentShellMenuType, saveCharacterDebounced, saveMetadata, getCurrentChatId, createOrEditCharacter, getOneCharacter, select_selected_character, eventSource, event_types, chat_metadata, characters, extension_prompt_roles, create_save };
