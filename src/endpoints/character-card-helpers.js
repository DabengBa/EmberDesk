import _ from 'lodash';

/**
 * The marker value used by merge-attributes payloads to remove a key from the character card.
 * @type {string}
 */
export const UNSET_SENTINEL = '__@@UNSET@@__';

// Calculate the total string length of the data object
export const calculateDataSize = (data) => {
    return typeof data === 'object' ? Object.values(data).reduce((acc, val) => acc + String(val).length, 0) : 0;
};

/**
 * Only get fields that are used to display the character list.
 * @param {object} character Character object
 * @returns {{shallow: true, [key: string]: any}} Shallow character
 */
export const toShallow = (character) => {
    return {
        shallow: true,
        name: character.name,
        avatar: character.avatar,
        chat: character.chat,
        fav: character.fav,
        date_added: character.date_added,
        create_date: character.create_date,
        date_last_chat: character.date_last_chat,
        chat_size: character.chat_size,
        data_size: character.data_size,
        tags: character.tags,
        description: _.get(character, 'description', _.get(character, 'data.description', '')),
        personality: _.get(character, 'personality', _.get(character, 'data.personality', '')),
        scenario: _.get(character, 'scenario', _.get(character, 'data.scenario', '')),
        first_mes: _.get(character, 'first_mes', _.get(character, 'data.first_mes', '')),
        mes_example: _.get(character, 'mes_example', _.get(character, 'data.mes_example', '')),
        creatorcomment: _.get(character, 'creatorcomment', _.get(character, 'data.creator_notes', '')),
        talkativeness: _.get(character, 'talkativeness', _.get(character, 'data.extensions.talkativeness', 0)),
        data: {
            name: _.get(character, 'data.name', ''),
            character_version: _.get(character, 'data.character_version', ''),
            creator: _.get(character, 'data.creator', ''),
            creator_notes: _.get(character, 'data.creator_notes', ''),
            description: _.get(character, 'data.description', ''),
            mes_example: _.get(character, 'data.mes_example', ''),
            scenario: _.get(character, 'data.scenario', ''),
            personality: _.get(character, 'data.personality', ''),
            first_mes: _.get(character, 'data.first_mes', ''),
            alternate_greetings: _.get(character, 'data.alternate_greetings', []),
            tags: _.get(character, 'data.tags', []),
            extensions: {
                fav: _.get(character, 'data.extensions.fav', false),
                world: _.get(character, 'data.extensions.world', ''),
                talkativeness: _.get(character, 'data.extensions.talkativeness', _.get(character, 'talkativeness', 0)),
            },
        },
    };
};

/**
 * Removes fields that are not meant to be shared.
 */
export function unsetPrivateFields(char) {
    _.set(char, 'fav', false);
    _.set(char, 'data.extensions.fav', false);
    _.unset(char, 'chat');
}

/**
 * Recursively walks `source` and removes any key from `target` whose
 * corresponding value in `source` equals the {@link UNSET_SENTINEL}.
 * Called after {@link deepMerge} so that the sentinel gets replaced by
 * an actual key deletion.
 * @param {object} target The merged character object to clean up
 * @param {object} source The original update payload (pre-merge clone)
 */
export function processUnsetSentinels(target, source) {
    for (const key of Object.keys(source)) {
        if (source[key] === UNSET_SENTINEL) {
            _.unset(target, key);
        } else if (_.isPlainObject(source[key]) && _.isPlainObject(target[key])) {
            processUnsetSentinels(target[key], source[key]);
        }
    }
}
