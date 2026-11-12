import { METADATA_KEY, selected_world_info, worldInfoCache, world_info, world_info_logic, world_info_position, world_names } from './world-info-state.js';

export function registerWorldInfoSlashCommands(deps) {
    const { ARGUMENT_TYPE, Fuse, SlashCommand, SlashCommandArgument, SlashCommandClosure, SlashCommandEnumValue, SlashCommandNamedArgument, SlashCommandParser, charUpdateAddAuxWorld, charUpdatePrimaryWorld, chat_metadata, commonEnumProviders, createNewWorldInfo, createWorldInfoEntry, enumIcons, enumTypes, extension_prompt_roles, findChar, getCharaFilename, getContext, getCurrentChatId, getCurrentShellCharacterId, getUniqueName, isFalseBoolean, isTrueBoolean, loadWorldInfo, logSlashCommandWarn, newWorldInfoEntryDefinition, newWorldInfoEntryTemplate, normalizeWorldInfoEntryPosition, onWorldInfoChange, onlyUnique, originalWIDataKeyMap, parseStringArray, reloadEditor, saveMetadata, saveWorldInfo, setWIOriginalDataValue, setWorldInfoButtonClass, substituteParams, t, uuidv4 } = deps;
    async function getEntriesFromFile(file, { args = {}, unnamed = null, callbackName = 'getEntriesFromFile' } = {}) {
        if (!file || !world_names.includes(file)) {
            toastr.warning(t`Valid World Info file name is required`);
            logSlashCommandWarn(`${callbackName}: Valid World Info file name is required`, args, unnamed);
            return '';
        }

        const data = await loadWorldInfo(file);

        if (!data || !('entries' in data)) {
            toastr.warning(t`World Info file has an invalid format`);
            logSlashCommandWarn(`${callbackName}: World Info file has an invalid format`, args, unnamed);
            return '';
        }

        const entries = Object.values(data.entries);

        if (!entries || entries.length === 0) {
            toastr.warning(t`World Info file has no entries`);
            logSlashCommandWarn(`${callbackName}: World Info file has no entries`, args, unnamed);
            return '';
        }

        return entries;
    }


    /**
     * Gets the name of the character-bound lorebook.
     * @param {import('./slash-commands/SlashCommand.js').NamedArguments} args Named arguments
     * @param {string} characterIdentifier Character name
     * @returns {Promise<string>} The name of the character-bound lorebook, a JSON string of the character's lorebooks, or an empty string
     */
    async function getCharBookCallback({ type, name, create }, characterIdentifier) {
        const context = getContext();
        type = String(type ?? '').trim().toLowerCase() || 'primary';
        characterIdentifier = String(characterIdentifier ?? '') || context.characters[context.characterId]?.avatar || null;
        const character = findChar({ name: characterIdentifier });
        if (!character) {
            toastr.error(t`Character not found.`);
            logSlashCommandWarn('getCharBookCallback: Character not found', { type, name, create }, { characterIdentifier });
            return '';
        }
        const books = [];
        if (type === 'all' || type === 'primary' && character.data?.extensions?.world) {
            books.push(character.data.extensions.world);
        }
        if (type === 'all' || type === 'additional') {
            const fileName = getCharaFilename(context.characters.indexOf(character));
            const extraCharLore = world_info.charLore?.find((e) => e.name === fileName);
            if (extraCharLore && Array.isArray(extraCharLore.extraBooks)) {
                books.push(...extraCharLore.extraBooks.filter(onlyUnique).filter(Boolean));
            }
        }

        if (isTrueBoolean(String(create)) && books.length === 0) {
            const newName = await createWorldWithName(name, `Character Book ${character.name}`.replace(/[^a-z0-9 -]/gi, '_').replace(/_{2,}/g, '_').substring(0, 64));
            // Also assign the book now - additional if requested, otherwise as primary
            if (type === 'additional') {
                await charUpdateAddAuxWorld(character.avatar, newName);
            } else {
                await charUpdatePrimaryWorld(newName);
            }
            // Refresh UI, if needed
            setWorldInfoButtonClass(getCurrentShellCharacterId());
            books.push(newName);
        }

        return type === 'primary' ? (books[0] ?? '') : JSON.stringify(books.filter(onlyUnique).filter(Boolean));
    }

    /**
     * Gets the name of the chat-bound lorebook. Creates a new one if it doesn't exist.
     * @param {import('./slash-commands/SlashCommand.js').NamedArguments} args Named arguments
     * @returns {Promise<string>} The name of the chat-bound lorebook
     */
    async function getChatBookCallback(args) {
        const chatId = getCurrentChatId();

        if (!chatId) {
            toastr.warning(t`Open a chat to get a name of the chat-bound lorebook`);
            logSlashCommandWarn('getChatBookCallback: Open a chat to get a name of the chat-bound lorebook', args);
            return '';
        }

        if (chat_metadata[METADATA_KEY] && world_names.includes(chat_metadata[METADATA_KEY])) {
            return chat_metadata[METADATA_KEY];
        }

        if (isFalseBoolean(String(args.create))) {
            return '';
        }

        const name = await createWorldWithName(args.name, `Chat Book ${getCurrentChatId()}`.replace(/[^a-z0-9 -]/gi, '_').replace(/_{2,}/g, '_').substring(0, 64));

        chat_metadata[METADATA_KEY] = name;
        await saveMetadata();
        $('.chat_lorebook_button').addClass('world_set');
        return name;
    }

    async function createWorldWithName(possibleName = undefined, fallbackName = undefined) {
        let newName = (() => {
            // Use the provided name if it's not in use
            if (typeof possibleName === 'string') {
                const name = String(possibleName);
                if (world_names.includes(name)) {
                    throw new Error('This World Info file name is already in use');
                }
                return name;
            }

            // Replace non-alphanumeric characters with underscores, cut to 64 characters
            return fallbackName ?? `Lorebook (${uuidv4()})`;
        })();

        // Make sure the name is unique
        newName = getUniqueName(newName, world_names.includes.bind(world_names));

        await createNewWorldInfo(newName);
        return newName;
    }

    async function findBookEntryCallback(args, value) {
        const file = args.file;
        const field = args.field || 'key';

        const entries = await getEntriesFromFile(file, { args, unnamed: { value }, callbackName: 'findBookEntryCallback' });

        if (!entries) {
            return '';
        }

        if (typeof newWorldInfoEntryTemplate[field] === 'boolean') {
            const isTrue = isTrueBoolean(value);
            const isFalse = isFalseBoolean(value);

            if (isTrue) {
                value = String(true);
            }

            if (isFalse) {
                value = String(false);
            }
        }

        const fuse = new Fuse(entries, {
            keys: [{ name: field, weight: 1 }],
            includeScore: true,
            threshold: 0.3,
        });

        const results = fuse.search(value);

        if (!results || results.length === 0) {
            return '';
        }

        const result = results[0]?.item?.uid;

        if (result === undefined) {
            return '';
        }

        return result;
    }

    async function getEntryFieldCallback(args, uid) {
        const file = args.file;
        const field = args.field || 'content';
        const tags = getContext().tags;

        const entries = await getEntriesFromFile(file, { args, unnamed: { uid }, callbackName: 'getEntryFieldCallback' });

        if (!entries) {
            return '';
        }

        const entry = entries.find(x => String(x.uid) === String(uid));

        if (!entry) {
            toastr.warning('Valid UID is required');
            logSlashCommandWarn('getEntryFieldCallback: Valid UID is required', args, { uid });
            console.warn();
            return '';
        }

        if (!Object.hasOwn(newWorldInfoEntryDefinition, field)) {
            toastr.warning('Valid field name is required');
            logSlashCommandWarn('getEntryFieldCallback: Valid field name is required', args, { uid });
            return '';
        }

        // handle special cases, otherwise execute default logic
        let fieldValue;
        switch (field) {
            case 'characterFilterNames':
                if (entry.characterFilter) {
                    fieldValue = entry.characterFilter.names;
                }
                break;
            case 'characterFilterTags':
                if (entry.characterFilter) {
                    if (!entry.characterFilter.tags) {
                        return '';
                    }
                    //Find the tag objects corresponding to each ID in the array, then return the names
                    fieldValue = tags.filter((tag) => entry.characterFilter.tags.includes(tag.id)).map((tag) => tag.name);
                }
                break;
            case 'characterFilterExclude':
                if (entry.characterFilter) {
                    fieldValue = entry.characterFilter.isExclude;
                }
                break;
            default:
                fieldValue = entry[field] ?? newWorldInfoEntryDefinition[field]?.default;
        }

        if (fieldValue === undefined) {
            return '';
        }

        if (Array.isArray(fieldValue)) {
            return JSON.stringify(fieldValue.map(x => substituteParams(x)));
        }

        return substituteParams(String(fieldValue));
    }

    async function createEntryCallback(args, content) {
        const file = args.file;
        const key = args.key;

        const data = await loadWorldInfo(file);

        if (!data || !('entries' in data)) {
            toastr.warning('Valid World Info file name is required');
            logSlashCommandWarn('createEntryCallback: Valid World Info file name is required', args);
            return '';
        }

        const entry = createWorldInfoEntry(file, data);

        if (key) {
            entry.key.push(key);
            entry.addMemo = true;
            entry.comment = key;
        }

        if (content) {
            entry.content = content;
        }

        await saveWorldInfo(file, data);
        await reloadEditor(file);

        return String(entry.uid);
    }

    async function setEntryFieldCallback(args, value) {
        const file = args.file;
        const uid = args.uid;
        const field = args.field || 'content';
        const tags = getContext().tags;

        // characterFilter is an object with internal fields we need to access, which may also may be null and need to be populated
        const createCharacterFilterFieldObjectIfNeeded = (currentEntry) => {
            if (!currentEntry.characterFilter) {
                Object.assign(
                    currentEntry,
                    {
                        characterFilter: {
                            isExclude: false,
                            names: [],
                            tags: [],
                        },
                    },
                );
            }
        };

        if (value === undefined) {
            toastr.warning('Value is required');
            logSlashCommandWarn('setEntryFieldCallback: Value is required', args, { value });
            return '';
        }

        value = value.replace(/\\([{}|])/g, '$1');

        const data = await loadWorldInfo(file);

        if (!data || !('entries' in data)) {
            toastr.warning('Valid World Info file name is required');
            logSlashCommandWarn('setEntryFieldCallback: Valid World Info file name is required', args, { value });
            return '';
        }

        const entry = data.entries[uid];

        if (!entry) {
            toastr.warning('Valid UID is required');
            logSlashCommandWarn('setEntryFieldCallback: Valid UID is required', args, { value });
            return '';
        }

        if (!Object.hasOwn(newWorldInfoEntryDefinition, field)) {
            toastr.warning('Valid field name is required');
            logSlashCommandWarn('setEntryFieldCallback: Valid field name is required', args, { value });
            return '';
        }

        // Init a default value for the field if it does not exist
        if (!Object.hasOwn(entry, field)) {
            entry[field] = newWorldInfoEntryDefinition[field].default;
        }

        // Use an array filter if it exists for the field
        const arrayFilter = newWorldInfoEntryDefinition[field]?.arrayFilter || (() => true);

        // handle special cases, otherwise execute default logic
        let tagNames;
        let charNames;
        switch (field) {
            case 'characterFilterNames':
                createCharacterFilterFieldObjectIfNeeded(entry);
                charNames = parseStringArray(value);
                entry.characterFilter.names = charNames
                    .map((name) => getCharaFilename(null, { manualAvatarKey: findChar({ name, allowAvatar: true, preferCurrentChar: false, quiet: true })?.avatar }))
                    .filter(Boolean)
                    .filter(onlyUnique);
                setWIOriginalDataValue(data, uid, 'character_filter', entry.characterFilter);
                break;
            case 'characterFilterTags':
                createCharacterFilterFieldObjectIfNeeded(entry);
                tagNames = parseStringArray(value);
                //Find the tag objects corresponding to each name in the user array, then return an array of the corresponding IDs
                entry.characterFilter.tags = tags.filter((tag) => tagNames.includes(tag.name)).map((tag) => tag.id);
                setWIOriginalDataValue(data, uid, 'character_filter', entry.characterFilter);
                break;
            case 'characterFilterExclude':
                createCharacterFilterFieldObjectIfNeeded(entry);
                entry.characterFilter.isExclude = isTrueBoolean(value);
                setWIOriginalDataValue(data, uid, 'character_filter', entry.characterFilter);
                break;
            case 'position': {
                entry.position = normalizeWorldInfoEntryPosition(Number(value));
                entry.role = entry.position === world_info_position.atDepth
                    ? (entry.role ?? extension_prompt_roles.SYSTEM)
                    : null;
                setWIOriginalDataValue(data, uid, 'position', entry.position === world_info_position.after ? 'after_char' : 'before_char');
                setWIOriginalDataValue(data, uid, 'extensions.position', entry.position);
                setWIOriginalDataValue(data, uid, 'extensions.role', entry.role);
                break;
            }
            default:
                if (Array.isArray(entry[field])) {
                    entry[field] = parseStringArray(value).filter(arrayFilter);
                } else if (typeof entry[field] === 'boolean') {
                    entry[field] = isTrueBoolean(value);
                } else if (typeof entry[field] === 'number') {
                    entry[field] = Number(value);
                } else {
                    entry[field] = value;
                }

                if (originalWIDataKeyMap[field]) {
                    setWIOriginalDataValue(data, uid, originalWIDataKeyMap[field], entry[field]);
                }
        }

        await saveWorldInfo(file, data);
        await reloadEditor(file);
        return '';
    }

    /** A collection of local enum providers for this context of world info */
    const localEnumProviders = {
        /** All possible fields that can be set in a WI entry */
        wiEntryFields: () => Object.entries(newWorldInfoEntryDefinition).map(([key, value]) =>
            new SlashCommandEnumValue(key, `[${value.type}] default: ${(typeof value.default === 'string' ? `'${value.default}'` : JSON.stringify(value.default))}`,
                enumTypes.enum, enumIcons.getDataTypeIcon(value.type))),

        /** All existing UIDs based on the file argument as world name */
        wiUids: (/** @type {import('./slash-commands/SlashCommandExecutor.js').SlashCommandExecutor} */ executor) => {
            const file = executor.namedArgumentList.find(it => it.name == 'file')?.value;
            if (file instanceof SlashCommandClosure) throw new Error('Argument \'file\' does not support closures');
            // Try find world from cache
            if (!worldInfoCache.has(file)) return [];
            const world = worldInfoCache.get(file);
            if (!world) return [];
            return Object.entries(world.entries).map(([uid, data]) =>
                new SlashCommandEnumValue(uid, `${data.comment ? `${data.comment}: ` : ''}${data.key.join(', ')}${data.keysecondary?.length ? ` [${Object.entries(world_info_logic).find(([_, value]) => value == data.selectiveLogic)[0]}] ${data.keysecondary.join(', ')}` : ''} [${getWiPositionString(data)}]`,
                    enumTypes.enum, enumIcons.getWiStatusIcon(data)));
        },
    };

    function getWiPositionString(entry) {
        switch (normalizeWorldInfoEntryPosition(entry.position)) {
            case world_info_position.before:
                return 'WI';
            case world_info_position.EMTop: return '↑EM';
            case world_info_position.EMBottom: return '↓EM';
            case world_info_position.atDepth: return `@D${enumIcons.getRoleIcon(entry.role)}`;
            case world_info_position.outlet: return 'Outlet';
            default: return '<Unknown>';
        }
    }

    async function getGlobalBooksCallback() {
        if (!selected_world_info?.length) {
            return JSON.stringify([]);
        }

        let entries = selected_world_info.slice();

        console.debug(`[WI] Selected global world info has ${entries.length} entries`, selected_world_info);

        return JSON.stringify(entries);
    }

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'world',
        callback: onWorldInfoChange,
        namedArgumentList: [
            new SlashCommandNamedArgument(
                'state', 'set world state', [ARGUMENT_TYPE.STRING], false, false, null, commonEnumProviders.boolean('onOffToggle')(),
            ),
            new SlashCommandNamedArgument(
                'silent', 'suppress toast messages', [ARGUMENT_TYPE.BOOLEAN], false,
            ),
        ],
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({
                description: 'world name',
                typeList: [ARGUMENT_TYPE.STRING],
                enumProvider: commonEnumProviders.worlds,
            }),
        ],
        helpString: `
            <div>
                Sets active World, or unsets if no args provided, use <code>state=off</code> and <code>state=toggle</code> to deactivate or toggle a World, use <code>silent=true</code> to suppress toast messages.
            </div>
        `,
        aliases: [],
    }));
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'getchatbook',
        callback: getChatBookCallback,
        returns: 'lorebook name',
        helpString: 'Get a name of the chat-bound lorebook or create a new one if was unbound, and pass it down the pipe.',
        namedArgumentList: [
            SlashCommandNamedArgument.fromProps({
                name: 'name',
                description: 'lorebook name if creating a new one, will be auto-generated otherwise',
                typeList: [ARGUMENT_TYPE.STRING],
                isRequired: false,
                acceptsMultiple: false,
            }),
            SlashCommandNamedArgument.fromProps({
                name: 'create',
                description: 'create a new lorebook if it doesn\'t exist',
                typeList: [ARGUMENT_TYPE.BOOLEAN],
                isRequired: false,
                acceptsMultiple: false,
                enumList: commonEnumProviders.boolean('trueFalse')(),
                defaultValue: 'true',
            }),
        ],
        aliases: ['getchatlore', 'getchatwi'],
    }));
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'getglobalbooks',
        callback: getGlobalBooksCallback,
        returns: 'list of selected lorebook names',
        helpString: 'Get a list of names of the selected global lorebooks and pass it down the pipe.',
        aliases: ['getgloballore', 'getglobalwi'],
    }));
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'getcharbook',
        callback: getCharBookCallback,
        returns: 'lorebook name or a list of lorebook names',
        namedArgumentList: [
            SlashCommandNamedArgument.fromProps({
                name: 'type',
                description: 'type of the lorebook to get, returns a list for "all" and "additional"',
                typeList: [ARGUMENT_TYPE.STRING],
                enumList: ['primary', 'additional', 'all'],
                defaultValue: 'primary',
            }),
            SlashCommandNamedArgument.fromProps({
                name: 'name',
                description: 'lorebook name if creating a new one, will be auto-generated otherwise',
                typeList: [ARGUMENT_TYPE.STRING],
                isRequired: false,
                acceptsMultiple: false,
            }),
            SlashCommandNamedArgument.fromProps({
                name: 'create',
                description: 'create a new lorebook if it doesn\'t exist',
                typeList: [ARGUMENT_TYPE.BOOLEAN],
                isRequired: false,
                acceptsMultiple: false,
                enumList: commonEnumProviders.boolean('trueFalse')(),
                defaultValue: 'false',
            }),
        ],
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({
                description: 'Character name - or unique character identifier (avatar key). If not provided, the current character is used.',
                typeList: [ARGUMENT_TYPE.NUMBER, ARGUMENT_TYPE.STRING],
                isRequired: false,
                enumProvider: commonEnumProviders.characters('character'),
            }),
        ],
        helpString: 'Get a name of the character-bound lorebook and pass it down the pipe. Returns empty string if character lorebook is not set.',
        aliases: ['getcharlore', 'getcharwi'],
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'findentry',
        aliases: ['findlore', 'findwi'],
        returns: 'UID',
        callback: findBookEntryCallback,
        namedArgumentList: [
            SlashCommandNamedArgument.fromProps({
                name: 'file',
                description: 'book name',
                typeList: [ARGUMENT_TYPE.STRING],
                isRequired: true,
                enumProvider: commonEnumProviders.worlds,
            }),
            SlashCommandNamedArgument.fromProps({
                name: 'field',
                description: 'field value for fuzzy match (default: key)',
                typeList: [ARGUMENT_TYPE.STRING],
                defaultValue: 'key',
                enumList: localEnumProviders.wiEntryFields(),
            }),
        ],
        unnamedArgumentList: [
            new SlashCommandArgument(
                'texts', ARGUMENT_TYPE.STRING, true, true,
            ),
        ],
        helpString: `
            <div>
                Find a UID of the record from the specified book using the fuzzy match of a field value (default: key) and pass it down the pipe.
            </div>
            <div>
                <strong>Example:</strong>
                <ul>
                    <li>
                        <pre><code>/findentry file=chatLore field=key Shadowfang</code></pre>
                    </li>
                </ul>
            </div>
        `,
    }));
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'getentryfield',
        aliases: ['getlorefield', 'getwifield'],
        callback: getEntryFieldCallback,
        returns: 'field value',
        namedArgumentList: [
            SlashCommandNamedArgument.fromProps({
                name: 'file',
                description: 'book name',
                typeList: [ARGUMENT_TYPE.STRING],
                isRequired: true,
                enumProvider: commonEnumProviders.worlds,
            }),
            SlashCommandNamedArgument.fromProps({
                name: 'field',
                description: 'field to retrieve (default: content)',
                typeList: [ARGUMENT_TYPE.STRING],
                defaultValue: 'content',
                enumList: localEnumProviders.wiEntryFields(),
            }),
        ],
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({
                description: 'record UID',
                typeList: [ARGUMENT_TYPE.STRING],
                isRequired: true,
                enumProvider: localEnumProviders.wiUids,
            }),
        ],
        helpString: `
            <div>
                Get a field value (default: content) of the record with the UID from the specified book and pass it down the pipe.
            </div>
            <div>
                <strong>Example:</strong>
                <ul>
                    <li>
                        <pre><code>/getentryfield file=chatLore field=content 123</code></pre>
                    </li>
                </ul>
            </div>
        `,
    }));
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'createentry',
        callback: createEntryCallback,
        aliases: ['createlore', 'createwi'],
        returns: 'UID of the new record',
        namedArgumentList: [
            SlashCommandNamedArgument.fromProps({
                name: 'file',
                description: 'book name',
                typeList: [ARGUMENT_TYPE.STRING],
                isRequired: true,
                enumProvider: commonEnumProviders.worlds,
            }),
            new SlashCommandNamedArgument(
                'key', 'record key', [ARGUMENT_TYPE.STRING], false,
            ),
        ],
        unnamedArgumentList: [
            new SlashCommandArgument(
                'content', [ARGUMENT_TYPE.STRING], false,
            ),
        ],
        helpString: `
            <div>
                Create a new record in the specified book with the key and content (both are optional) and pass the UID down the pipe.
            </div>
            <div>
                <strong>Example:</strong>
                <ul>
                    <li>
                        <pre><code>/createentry file=chatLore key=Shadowfang The sword of the king</code></pre>
                    </li>
                </ul>
            </div>
        `,
    }));
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'setentryfield',
        callback: setEntryFieldCallback,
        aliases: ['setlorefield', 'setwifield'],
        namedArgumentList: [
            SlashCommandNamedArgument.fromProps({
                name: 'file',
                description: 'book name',
                typeList: [ARGUMENT_TYPE.STRING],
                isRequired: true,
                enumProvider: commonEnumProviders.worlds,
            }),
            SlashCommandNamedArgument.fromProps({
                name: 'uid',
                description: 'record UID',
                typeList: [ARGUMENT_TYPE.STRING],
                isRequired: true,
                enumProvider: localEnumProviders.wiUids,
            }),
            SlashCommandNamedArgument.fromProps({
                name: 'field',
                description: 'field name (default: content)',
                typeList: [ARGUMENT_TYPE.STRING],
                defaultValue: 'content',
                enumList: localEnumProviders.wiEntryFields(),
            }),
        ],
        unnamedArgumentList: [
            new SlashCommandArgument(
                'value', [ARGUMENT_TYPE.STRING], true,
            ),
        ],
        helpString: `
            <div>
                Set a field value (default: content) of the record with the UID from the specified book. To set multiple values for key fields, use comma-delimited list as a value.
            </div>
            <div>
                <strong>Example:</strong>
                <ul>
                    <li>
                        <pre><code>/setentryfield file=chatLore uid=123 field=key Shadowfang,sword,weapon</code></pre>
                    </li>
                </ul>
            </div>
        `,
    }));
}
