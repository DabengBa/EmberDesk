const CHARACTER_EXTENSION_FIELD_MAP = Object.freeze({
    world: 'characterWorld',
    depth_prompt: 'depthPrompt',
});

const CHARACTER_FIELD_DEFAULTS = Object.freeze({
    name: '',
    avatar: '',
    description: '',
    personality: '',
    scenario: '',
    firstMessage: '',
    exampleMessages: '',
    creatorNotes: '',
    systemPrompt: '',
    postHistoryInstructions: '',
    creator: '',
    characterVersion: '',
    characterWorld: '',
    favorite: false,
    talkativeness: null,
    tags: [],
    alternateGreetings: [],
    depthPrompt: {
        prompt: '',
        depth: null,
        role: null,
    },
});

function cloneArray(value) {
    return Array.isArray(value) ? [...value] : [];
}

function normalizeString(value) {
    return typeof value === 'string' ? value : value == null ? '' : String(value);
}

function normalizeTagList(value) {
    const values = Array.isArray(value)
        ? value
        : typeof value === 'string'
            ? value.split(',')
            : [];

    return values
        .map(item => normalizeString(item).trim())
        .filter(Boolean);
}

function serializeTagList(value) {
    return normalizeTagList(value).join(', ');
}

function normalizeNullableNumber(value) {
    if (value == null || value === '') {
        return null;
    }

    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : null;
}

function normalizeDepthPromptRole(value) {
    if (value == null || value === '') {
        return null;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }
    const text = normalizeString(value).trim().toLowerCase();
    if (!text) {
        return null;
    }
    if (['system', 'user', 'assistant'].includes(text)) {
        return text;
    }
    const numberValue = Number(text);
    return Number.isFinite(numberValue) ? numberValue : text;
}

function normalizeDepthPrompt(value) {
    if (!value || typeof value !== 'object') {
        return { ...CHARACTER_FIELD_DEFAULTS.depthPrompt };
    }

    return {
        prompt: normalizeString(value.prompt),
        depth: normalizeNullableNumber(value.depth),
        role: normalizeDepthPromptRole(value.role),
    };
}

function isProjectedCharacterAuthoringDraft(value) {
    return Boolean(value && typeof value === 'object' && (
        Object.hasOwn(value, 'firstMessage')
        || Object.hasOwn(value, 'creatorNotes')
        || Object.hasOwn(value, 'characterWorld')
        || Object.hasOwn(value, 'alternateGreetings')
    ));
}

function normalizeProjectedCharacterAuthoringDraft(draft = {}, options = {}) {
    return {
        ...CHARACTER_FIELD_DEFAULTS,
        mode: options.mode ?? draft.mode ?? (draft.avatar ? 'edit' : 'create'),
        name: normalizeString(draft.name),
        avatar: normalizeString(draft.avatar),
        description: normalizeString(draft.description),
        personality: normalizeString(draft.personality),
        scenario: normalizeString(draft.scenario),
        firstMessage: normalizeString(draft.firstMessage),
        exampleMessages: normalizeString(draft.exampleMessages),
        creatorNotes: normalizeString(draft.creatorNotes),
        systemPrompt: normalizeString(draft.systemPrompt),
        postHistoryInstructions: normalizeString(draft.postHistoryInstructions),
        creator: normalizeString(draft.creator),
        characterVersion: normalizeString(draft.characterVersion),
        characterWorld: normalizeString(draft.characterWorld),
        favorite: Boolean(draft.favorite),
        talkativeness: normalizeNullableNumber(draft.talkativeness),
        tags: normalizeTagList(draft.tags),
        alternateGreetings: cloneArray(draft.alternateGreetings),
        depthPrompt: normalizeDepthPrompt(draft.depthPrompt),
        unsupportedFields: cloneArray(draft.unsupportedFields),
    };
}

function listUnsupportedCharacterExtensionFields(extensions) {
    if (!extensions || typeof extensions !== 'object') {
        return [];
    }

    return Object.keys(extensions)
        .filter(key => !Object.hasOwn(CHARACTER_EXTENSION_FIELD_MAP, key))
        .sort()
        .map(key => `data.extensions.${key}`);
}

function getCharacterTags(character) {
    if (Array.isArray(character?.data?.tags)) {
        return cloneArray(character.data.tags);
    }

    return cloneArray(character?.tags);
}

export function createCharacterAuthoringDraft(character = {}, options = {}) {
    if (isProjectedCharacterAuthoringDraft(character)) {
        return normalizeProjectedCharacterAuthoringDraft(character, options);
    }

    const data = character?.data && typeof character.data === 'object' ? character.data : {};
    const extensions = data.extensions && typeof data.extensions === 'object' ? data.extensions : {};
    const mode = options.mode ?? (character?.avatar ? 'edit' : 'create');

    return {
        mode,
        name: normalizeString(data.name || character?.name || CHARACTER_FIELD_DEFAULTS.name),
        avatar: normalizeString(character?.avatar || CHARACTER_FIELD_DEFAULTS.avatar),
        description: normalizeString(data.description || character?.description || CHARACTER_FIELD_DEFAULTS.description),
        personality: normalizeString(data.personality || character?.personality || CHARACTER_FIELD_DEFAULTS.personality),
        scenario: normalizeString(data.scenario || character?.scenario || CHARACTER_FIELD_DEFAULTS.scenario),
        firstMessage: normalizeString(data.first_mes || character?.first_mes || CHARACTER_FIELD_DEFAULTS.firstMessage),
        exampleMessages: normalizeString(data.mes_example || character?.mes_example || CHARACTER_FIELD_DEFAULTS.exampleMessages),
        creatorNotes: normalizeString(data.creator_notes || character?.creatorcomment || CHARACTER_FIELD_DEFAULTS.creatorNotes),
        systemPrompt: normalizeString(data.system_prompt || CHARACTER_FIELD_DEFAULTS.systemPrompt),
        postHistoryInstructions: normalizeString(data.post_history_instructions || CHARACTER_FIELD_DEFAULTS.postHistoryInstructions),
        creator: normalizeString(data.creator || CHARACTER_FIELD_DEFAULTS.creator),
        characterVersion: normalizeString(data.character_version || CHARACTER_FIELD_DEFAULTS.characterVersion),
        characterWorld: normalizeString(extensions.world || CHARACTER_FIELD_DEFAULTS.characterWorld),
        favorite: Boolean(character?.fav === true || character?.fav === 'true' || extensions.fav === true),
        talkativeness: normalizeNullableNumber(extensions.talkativeness ?? character?.talkativeness),
        tags: getCharacterTags(character),
        alternateGreetings: cloneArray(data.alternate_greetings),
        depthPrompt: normalizeDepthPrompt(extensions.depth_prompt),
        unsupportedFields: listUnsupportedCharacterExtensionFields(extensions),
    };
}

export function createCharacterAuthoringDraftFromCreateState(createState = {}, options = {}) {
    const createExtensions = createState?.extensions && typeof createState.extensions === 'object'
        ? createState.extensions
        : {};
    const depthPrompt = createExtensions.depth_prompt && typeof createExtensions.depth_prompt === 'object'
        ? {
            ...createExtensions.depth_prompt,
            role: createExtensions.depth_prompt.role ?? createState?.depth_prompt_role,
        }
        : {
            prompt: createState?.depth_prompt_prompt,
            depth: createState?.depth_prompt_depth,
            role: createState?.depth_prompt_role,
        };

    return createCharacterAuthoringDraft({
        data: {
            name: createState?.name,
            description: createState?.description,
            personality: createState?.personality,
            scenario: createState?.scenario,
            first_mes: createState?.first_message,
            mes_example: createState?.mes_example,
            creator_notes: createState?.creator_notes,
            system_prompt: createState?.system_prompt,
            post_history_instructions: createState?.post_history_instructions,
            creator: createState?.creator,
            character_version: createState?.character_version,
            tags: normalizeTagList(createState?.tags),
            alternate_greetings: cloneArray(createState?.alternate_greetings),
            extensions: {
                ...createExtensions,
                world: normalizeString(createState?.world || createExtensions.world),
                depth_prompt: depthPrompt,
            },
        },
        fav: createState?.fav,
        talkativeness: createState?.talkativeness,
    }, {
        ...options,
        mode: options.mode ?? 'create',
    });
}

export function validateCharacterAuthoringDraft(draft) {
    const fieldErrors = {};
    if (!normalizeString(draft?.name).trim()) {
        fieldErrors.name = 'Name is required';
    }

    return {
        valid: Object.keys(fieldErrors).length === 0,
        fieldErrors,
    };
}

function stableStringify(value) {
    if (Array.isArray(value)) {
        return `[${value.map(stableStringify).join(',')}]`;
    }
    if (value && typeof value === 'object') {
        return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
}

export function getCharacterAuthoringDirtyFields(initialDraft, nextDraft) {
    const keys = Object.keys(CHARACTER_FIELD_DEFAULTS);
    return keys.filter(key => stableStringify(initialDraft?.[key]) !== stableStringify(nextDraft?.[key]));
}

export function createCharacterAuthoringSaveModel(draft) {
    return {
        fields: {
            name: normalizeString(draft?.name),
            avatar: normalizeString(draft?.avatar),
            description: normalizeString(draft?.description),
            personality: normalizeString(draft?.personality),
            scenario: normalizeString(draft?.scenario),
            first_mes: normalizeString(draft?.firstMessage),
            mes_example: normalizeString(draft?.exampleMessages),
            creator_notes: normalizeString(draft?.creatorNotes),
            system_prompt: normalizeString(draft?.systemPrompt),
            post_history_instructions: normalizeString(draft?.postHistoryInstructions),
            creator: normalizeString(draft?.creator),
            character_version: normalizeString(draft?.characterVersion),
            fav: Boolean(draft?.favorite),
            tags: cloneArray(draft?.tags),
            alternate_greetings: cloneArray(draft?.alternateGreetings),
            talkativeness: draft?.talkativeness,
        },
        extensions: {
            world: normalizeString(draft?.characterWorld),
            depth_prompt: normalizeDepthPrompt(draft?.depthPrompt),
        },
        unsupportedFields: cloneArray(draft?.unsupportedFields),
    };
}

export function applyCharacterAuthoringDraftToCreateState(draft, createState = {}) {
    const saveModel = createCharacterAuthoringSaveModel(draft);
    const currentExtensions = createState?.extensions && typeof createState.extensions === 'object'
        ? createState.extensions
        : {};

    return {
        ...createState,
        name: saveModel.fields.name,
        description: saveModel.fields.description,
        creator_notes: saveModel.fields.creator_notes,
        post_history_instructions: saveModel.fields.post_history_instructions,
        character_version: saveModel.fields.character_version,
        system_prompt: saveModel.fields.system_prompt,
        tags: serializeTagList(saveModel.fields.tags),
        creator: saveModel.fields.creator,
        personality: saveModel.fields.personality,
        first_message: saveModel.fields.first_mes,
        scenario: saveModel.fields.scenario,
        mes_example: saveModel.fields.mes_example,
        world: saveModel.extensions.world,
        talkativeness: saveModel.fields.talkativeness,
        alternate_greetings: cloneArray(saveModel.fields.alternate_greetings),
        depth_prompt_prompt: saveModel.extensions.depth_prompt.prompt,
        depth_prompt_depth: saveModel.extensions.depth_prompt.depth,
        depth_prompt_role: saveModel.extensions.depth_prompt.role,
        extensions: {
            ...currentExtensions,
            world: saveModel.extensions.world,
            depth_prompt: saveModel.extensions.depth_prompt,
        },
    };
}

function createCharacterSubmitResult(draft) {
    const validation = validateCharacterAuthoringDraft(draft);
    if (!validation.valid) {
        return {
            ok: false,
            fieldErrors: validation.fieldErrors,
        };
    }

    return {
        ok: true,
        action: 'saveCharacterAuthoring',
        payload: createCharacterAuthoringSaveModel(draft),
    };
}

export function createCharacterAuthoringSession(character = {}, options = {}) {
    const initialDraft = createCharacterAuthoringDraft(character, options);

    function createSession(nextDraft) {
        const dirtyFields = getCharacterAuthoringDirtyFields(initialDraft, nextDraft);
        return {
            initialDraft,
            draft: nextDraft,
            dirty: dirtyFields.length > 0,
            dirtyFields,
            validation: validateCharacterAuthoringDraft(nextDraft),
            update(patch = {}) {
                return createSession({
                    ...nextDraft,
                    ...patch,
                });
            },
            cancel() {
                return createSession(initialDraft);
            },
            submit() {
                return createCharacterSubmitResult(nextDraft);
            },
        };
    }

    return createSession(initialDraft);
}


/**
 * Build multipart form body for /api/characters/create|edit from a save model.
 * Pure helper: no DOM, no event waits.
 * @param {ReturnType<typeof createCharacterAuthoringSaveModel>} saveModel
 * @param {{ mode?: 'create'|'edit', chat?: string, createDate?: string, jsonData?: string, avatarFile?: File|null, existingAvatar?: string }} [meta]
 * @returns {FormData}
 */
export function buildCharacterAuthoringFormData(saveModel, meta = {}) {
    const fields = saveModel?.fields && typeof saveModel.fields === 'object' ? saveModel.fields : {};
    const extensions = saveModel?.extensions && typeof saveModel.extensions === 'object' ? saveModel.extensions : {};
    const depthPrompt = extensions.depth_prompt && typeof extensions.depth_prompt === 'object'
        ? extensions.depth_prompt
        : { prompt: '', depth: null, role: null };
    const formData = new FormData();

    formData.set('ch_name', normalizeString(fields.name));
    formData.set('description', normalizeString(fields.description));
    formData.set('personality', normalizeString(fields.personality));
    formData.set('scenario', normalizeString(fields.scenario));
    formData.set('first_mes', normalizeString(fields.first_mes));
    formData.set('mes_example', normalizeString(fields.mes_example));
    formData.set('creator_notes', normalizeString(fields.creator_notes));
    formData.set('system_prompt', normalizeString(fields.system_prompt));
    formData.set('post_history_instructions', normalizeString(fields.post_history_instructions));
    formData.set('creator', normalizeString(fields.creator));
    formData.set('character_version', normalizeString(fields.character_version));
    formData.set('tags', Array.isArray(fields.tags) ? fields.tags.join(', ') : normalizeString(fields.tags));
    formData.set('talkativeness', fields.talkativeness == null || fields.talkativeness === ''
        ? ''
        : String(fields.talkativeness));
    formData.set('fav', String(Boolean(fields.fav)));
    formData.set('world', normalizeString(extensions.world));
    formData.set('depth_prompt_prompt', normalizeString(depthPrompt.prompt));
    formData.set('depth_prompt_depth', depthPrompt.depth == null ? '' : String(depthPrompt.depth));
    formData.set('depth_prompt_role', depthPrompt.role == null ? 'system' : String(depthPrompt.role));

    const avatarUrl = normalizeString(meta.existingAvatar || fields.avatar);
    if (avatarUrl) {
        formData.set('avatar_url', avatarUrl);
    }
    if (meta.chat) {
        formData.set('chat', normalizeString(meta.chat));
    }
    if (meta.createDate) {
        formData.set('create_date', normalizeString(meta.createDate));
    }
    if (meta.jsonData) {
        formData.set('json_data', normalizeString(meta.jsonData));
    }

    const greetings = Array.isArray(fields.alternate_greetings) ? fields.alternate_greetings : [];
    for (const greeting of greetings) {
        formData.append('alternate_greetings', normalizeString(greeting));
    }

    // Preserve known ST extensions; never write unsupported extension keys.
    formData.append('extensions', JSON.stringify({
        world: normalizeString(extensions.world),
        depth_prompt: {
            prompt: normalizeString(depthPrompt.prompt),
            depth: depthPrompt.depth,
            role: depthPrompt.role,
        },
    }));

    if (meta.avatarFile instanceof File) {
        formData.set('avatar', meta.avatarFile);
    }

    return formData;
}

/**
 * Resolve create vs edit endpoint for a character authoring save.
 * @param {'create'|'edit'} mode
 * @param {string} [cropQuery]
 */
export function getCharacterAuthoringWriteUrl(mode, cropQuery) {
    const base = mode === 'edit' ? '/api/characters/edit' : '/api/characters/create';
    if (!cropQuery) {
        return base;
    }
    return `${base}?crop=${encodeURIComponent(cropQuery)}`;
}


/**
 * Decide whether a save response should update the active authoring draft.
 * Late responses after a newer generation, cancel, or deleted entity must be ignored.
 * @param {{ generation: number, activeGeneration: number, cancelled?: boolean, deleted?: boolean, ok?: boolean }} input
 */
export function shouldApplyCharacterAuthoringSaveResult(input = {}) {
    if (input.cancelled || input.deleted) {
        return false;
    }
    if (input.ok === false) {
        return false;
    }
    if (!Number.isFinite(input.generation) || !Number.isFinite(input.activeGeneration)) {
        return false;
    }
    return input.generation === input.activeGeneration;
}
