const GROUP_FIELD_DEFAULTS = Object.freeze({
    id: '',
    name: '',
    avatarUrl: '',
    members: [],
    disabledMembers: [],
    favorite: false,
    allowSelfResponses: false,
    hideMutedSprites: false,
    activationStrategy: 0,
    generationMode: 0,
    autoModeDelay: 5,
    joinPrefix: '',
    joinSuffix: '',
    tagIds: [],
});

function cloneArray(value) {
    return Array.isArray(value) ? [...value] : [];
}

function normalizeString(value) {
    return typeof value === 'string' ? value : value == null ? '' : String(value);
}

function normalizeNumber(value, fallback) {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : fallback;
}

export function createGroupAuthoringDraft(group = {}, options = {}) {
    return {
        mode: options.mode ?? (group?.id ? 'edit' : 'create'),
        id: normalizeString(group?.id || GROUP_FIELD_DEFAULTS.id),
        name: normalizeString(group?.name || GROUP_FIELD_DEFAULTS.name),
        avatarUrl: normalizeString(group?.avatar_url || GROUP_FIELD_DEFAULTS.avatarUrl),
        members: cloneArray(group?.members),
        disabledMembers: cloneArray(group?.disabled_members),
        favorite: Boolean(group?.fav === true || group?.fav === 'true'),
        allowSelfResponses: Boolean(group?.allow_self_responses),
        hideMutedSprites: Boolean(group?.hideMutedSprites),
        activationStrategy: normalizeNumber(group?.activation_strategy, GROUP_FIELD_DEFAULTS.activationStrategy),
        generationMode: normalizeNumber(group?.generation_mode, GROUP_FIELD_DEFAULTS.generationMode),
        autoModeDelay: normalizeNumber(group?.auto_mode_delay, GROUP_FIELD_DEFAULTS.autoModeDelay),
        joinPrefix: normalizeString(group?.generation_mode_join_prefix || GROUP_FIELD_DEFAULTS.joinPrefix),
        joinSuffix: normalizeString(group?.generation_mode_join_suffix || GROUP_FIELD_DEFAULTS.joinSuffix),
        tagIds: cloneArray(group?.tagIds),
    };
}

export function validateGroupAuthoringDraft(draft) {
    const fieldErrors = {};
    if (!normalizeString(draft?.name).trim()) {
        fieldErrors.name = 'Name is required';
    }
    if (!Array.isArray(draft?.members) || draft.members.length === 0) {
        fieldErrors.members = 'Add at least one member';
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

export function getGroupAuthoringDirtyFields(initialDraft, nextDraft) {
    return Object.keys(GROUP_FIELD_DEFAULTS)
        .filter(key => stableStringify(initialDraft?.[key]) !== stableStringify(nextDraft?.[key]));
}

export function moveGroupAuthoringMember(draft, memberId, direction) {
    const members = cloneArray(draft?.members);
    const index = members.indexOf(memberId);
    const offset = direction === 'up' ? -1 : direction === 'down' ? 1 : 0;
    const nextIndex = index + offset;

    if (index === -1 || offset === 0 || nextIndex < 0 || nextIndex >= members.length) {
        return { ...draft, members };
    }

    [members[index], members[nextIndex]] = [members[nextIndex], members[index]];
    return { ...draft, members };
}

function uniqueMembers(members) {
    return cloneArray(members).filter((member, index, array) => member && array.indexOf(member) === index);
}

export function createGroupAuthoringSaveModel(draft) {
    return {
        id: normalizeString(draft?.id),
        name: normalizeString(draft?.name),
        avatar_url: normalizeString(draft?.avatarUrl),
        members: cloneArray(draft?.members),
        disabled_members: cloneArray(draft?.disabledMembers),
        fav: Boolean(draft?.favorite),
        allow_self_responses: Boolean(draft?.allowSelfResponses),
        hideMutedSprites: Boolean(draft?.hideMutedSprites),
        activation_strategy: normalizeNumber(draft?.activationStrategy, GROUP_FIELD_DEFAULTS.activationStrategy),
        generation_mode: normalizeNumber(draft?.generationMode, GROUP_FIELD_DEFAULTS.generationMode),
        auto_mode_delay: normalizeNumber(draft?.autoModeDelay, GROUP_FIELD_DEFAULTS.autoModeDelay),
        generation_mode_join_prefix: normalizeString(draft?.joinPrefix),
        generation_mode_join_suffix: normalizeString(draft?.joinSuffix),
        tag_ids: cloneArray(draft?.tagIds),
    };
}

function createGroupSubmitResult(draft) {
    const validation = validateGroupAuthoringDraft(draft);
    if (!validation.valid) {
        return {
            ok: false,
            fieldErrors: validation.fieldErrors,
        };
    }

    return {
        ok: true,
        action: 'saveGroupAuthoring',
        payload: createGroupAuthoringSaveModel(draft),
    };
}

export function createGroupAuthoringSession(group = {}, options = {}) {
    const initialDraft = createGroupAuthoringDraft(group, options);

    function createSession(nextDraft) {
        const normalizedDraft = {
            ...nextDraft,
            members: uniqueMembers(nextDraft?.members),
        };
        const dirtyFields = getGroupAuthoringDirtyFields(initialDraft, normalizedDraft);

        return {
            initialDraft,
            draft: normalizedDraft,
            dirty: dirtyFields.length > 0,
            dirtyFields,
            validation: validateGroupAuthoringDraft(normalizedDraft),
            update(patch = {}) {
                return createSession({
                    ...normalizedDraft,
                    ...patch,
                });
            },
            addMember(memberId) {
                return createSession({
                    ...normalizedDraft,
                    members: uniqueMembers([...normalizedDraft.members, memberId]),
                });
            },
            removeMember(memberId) {
                return createSession({
                    ...normalizedDraft,
                    members: normalizedDraft.members.filter(member => member !== memberId),
                    disabledMembers: normalizedDraft.disabledMembers.filter(member => member !== memberId),
                });
            },
            moveMember(memberId, direction) {
                return createSession(moveGroupAuthoringMember(normalizedDraft, memberId, direction));
            },
            cancel() {
                return createSession(initialDraft);
            },
            submit() {
                return createGroupSubmitResult(normalizedDraft);
            },
        };
    }

    return createSession(initialDraft);
}
